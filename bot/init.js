/**
 * =========================================================================
 * BOT INITIALIZATION MODULE
 * =========================================================================
 *
 * Handles all startup initialization when the bot becomes ready.
 * Extracted from index2.js ClientReady handler for better modularity.
 *
 * @module bot/init
 */

const fs = require('fs');
const cron = require('node-cron');
const { spawn } = require('child_process');
const path = require('path');
const http = require('http');
const v8 = require('v8');
const { Events, ActivityType } = require('discord.js');
const { createLogger } = require('../utils/logger');
const logger = createLogger('init');

// Project root directory (bot/../ = project root)
const rootDir = path.resolve(__dirname, '..');

/**
 * Initializes bot state on ClientReady event.
 * Handles all startup initialization including:
 * - Module initialization (attendance, bidding, auctioneering, etc.)
 * - MongoDB connection and migration
 * - Crash recovery and state restoration
 * - Periodic sync scheduling
 * - Slash command registration
 * - Event listener registration
 *
 * @param {import('discord.js').Client} client - Discord Client
 * @param {Object} config - Bot configuration
 * @param {Object} modules - All module-scoped references from index2.js
 * @returns {Promise<void>}
 */
async function onClientReady(client, config, modules) {
  // Track startup time for performance metrics
  const startupStartTime = Date.now();

  const {
    mainLogger,
    bossPoints,
    BOT_VERSION,
    PORT,
    operationQueue,
    dbAPI,
    shutdownManager,
    discordMonitoring,
    discordCache,
    attendance,
    bossTimer,
    helpSystem,
    helpSystemV2,
    auctioneering,
    bidding,
    emergencyCommands,
    leaderboardSystem,
    activityHeatmap,
    bossRotation,
    isAdmin,
    recoverBotStateOnStartup,
    moveQueueItemsToSheet,
    stateManager,
    sheetAPI,
    cleanupStaleStatsMessages,
    startBiddingChannelCleanupSchedule,
    eventReminders,
    crashRecovery,
    scheduler,
    registerCommands,
  } = modules;

  mainLogger.info('Bot logged in successfully', {
    tag: client.user.tag,
    bossCount: Object.keys(bossPoints).length,
    guildId: config.main_guild_id,
    version: BOT_VERSION,
  });

  // INITIALIZE OPERATION QUEUE (Graceful degradation)
  try {
    await operationQueue.initialize();
    mainLogger.info('Operation queue initialized');
  } catch (error) {
    mainLogger.error('Failed to initialize operation queue', error);
  }

  // INITIALIZE MONGODB CONNECTION (Non-blocking for Phase 2 testing)
  try {
    console.log('🔌 Connecting to MongoDB...');
    await dbAPI.connect();
    console.log('✅ MongoDB connected successfully');

    // Get connection health info
    const health = await dbAPI.healthCheck();
    console.log(`📊 MongoDB Health: ${health.healthy ? '✅ Healthy' : '❌ Unhealthy'} (Latency: ${health.latency}ms)`);

    // Get database stats
    const stats = await dbAPI.getStats();
    console.log(`📦 Database: ${stats.database} | Collections: ${stats.collections} | Size: ${stats.dataSize}`);

    // Migrate temp IDs to real Discord IDs on startup
    try {
      const discordIdMapper = require(path.join(rootDir, 'utils', 'discord-id-mapper'));
      const idStats = await discordIdMapper.getMigrationStats();

      if (idStats.withTempId > 0) {
        console.log(`🔄 [MongoDB] Migrating ${idStats.withTempId} members with temp IDs...`);
        const migrationResult = await discordIdMapper.batchMigrateAllMembers(client, config.main_guild_id);
        console.log(`✅ [MongoDB] Migration complete: ${migrationResult.migrated} migrated, ${migrationResult.notFound} not found`);
      } else {
        console.log(`✅ [MongoDB] All members have real Discord IDs`);
      }
    } catch (migrationError) {
      console.error('⚠️ Discord ID migration failed (non-critical):', migrationError.message);
    }
  } catch (error) {
    console.error('⚠️ MongoDB connection failed (non-critical for now):', error.message);
    console.log('📝 Bot will continue with Google Sheets only until Phase 4');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 1: INITIALIZE GRACEFUL SHUTDOWN MANAGER (CRIT-001)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('🛡️ Initializing graceful shutdown manager...');
  shutdownManager.initialize();

  // Register MongoDB cleanup handler (Priority 10 - runs early)
  shutdownManager.registerCleanup('mongodb', async () => {
    console.log('🔄 Closing MongoDB connection...');
    await dbAPI.close();
  }, 10);

  // Register Discord client cleanup handler (Priority 20 - runs after MongoDB)
  shutdownManager.registerCleanup('discord', async () => {
    console.log('🔄 Destroying Discord client...');
    client.removeAllListeners();
    await client.destroy();
  }, 20);

  // Configure MongoDB admin channel for alerts (CRIT-005)
  try {
    const adminChannel = await client.channels.fetch(config.admin_logs_channel_id);
    dbAPI.setAdminChannel(adminChannel);
    console.log('✅ MongoDB admin alerts configured');

    // PHASE 3.3: Initialize Discord monitoring system
    discordMonitoring.initialize(adminChannel);
    console.log('✅ Discord monitoring initialized');
  } catch (error) {
    console.error('⚠️ Failed to configure MongoDB admin alerts:', error.message);
  }

  console.log('✅ Graceful shutdown manager initialized');

  // Attach config to client for module access
  client.config = config;

  // INITIALIZE MULTI-LEVEL CACHE CLEANUP
  const cacheManager = require(path.join(rootDir, 'utils', 'cache-manager'));
  cacheManager.startCacheCleanup();

  // INITIALIZE AUCTION CACHE (100% uptime guarantee)
  const auctionCache = require(path.join(rootDir, 'utils', 'auction-cache'));
  await auctionCache.init();

  // INITIALIZE ALL MODULES IN CORRECT ORDER
  // NOTE: isAdmin already uses config as a closure variable; pass directly
  attendance.initialize(config, bossPoints, isAdmin, discordCache);
  await bossTimer.initialize(client, config, sheetAPI, attendance); // Boss timer system
  helpSystemV2.initialize(config, isAdmin, BOT_VERSION);
  auctioneering.initialize(config, isAdmin, bidding, discordCache);
  bidding.initializeBidding(config, isAdmin, auctioneering, discordCache);
  auctioneering.setPostToSheet(attendance.postToSheet);
  emergencyCommands.initialize(config, attendance, bidding, auctioneering, isAdmin, discordCache);
  leaderboardSystem.init(client, config, discordCache);
  activityHeatmap.init(client, config);

  // CRITICAL: Await boss rotation initialization to ensure rotation cache is loaded
  // before daily schedule posts (prevents showing "no bosses" when bosses exist)
  await bossRotation.initialize(config, client, bossTimer);

  console.log("🔄 Running state recovery...");
  modules.isRecovering = true;

  await recoverBotStateOnStartup(client, config, {
    sheetAPI,
    discordCache,
    bidding,
    moveQueueItemsToSheet: (cfg, items) => moveQueueItemsToSheet(cfg, items, sheetAPI),
    setLastAuctionEndTime: (val) => { modules.lastAuctionEndTime = val; },
  });
  const sweep1 = await attendance.recoverStateFromThreads(client);

  let sweep2LoadedState = false;
  if (!sweep1.success || sweep1.recovered === 0) {
    sweep2LoadedState = await attendance.loadAttendanceStateFromSheet();
  }

  const sweep3 = await attendance.validateStateConsistency(client);
  modules.isRecovering = false;

  await cleanupStaleStatsMessages();

  const recoveryStatus = sweep1.recovered || 0;
  const discrepancies = sweep3 ?
    (sweep3.threadsWithoutColumns?.length || 0) +
    (sweep3.columnsWithoutThreads?.length || 0) +
    (sweep3.duplicateColumns?.length || 0) : 0;

  console.log(`✅ Recovery complete: ${recoveryStatus} spawns, ${discrepancies} discrepancies`);

  if (!sweep1.success || Object.keys(attendance.getActiveSpawns()).length === 0) {
    await attendance.loadAttendanceStateFromSheet();
  }

  await bidding.recoverBiddingState(client, config);
  attendance.schedulePeriodicStateSync();
  attendance.startAutoCloseScheduler(client);

  // Sync state references
  stateManager.activeSpawns = attendance.getActiveSpawns();
  stateManager.activeColumns = attendance.getActiveColumns();
  stateManager.pendingVerifications = attendance.getPendingVerifications();
  stateManager.pendingClosures = attendance.getPendingClosures();
  stateManager.confirmationMessages = attendance.getConfirmationMessages();

  // START SCHEDULERS
  startBiddingChannelCleanupSchedule();
  leaderboardSystem.scheduleWeeklyReport();
  leaderboardSystem.scheduleMonthlyReport();
  auctioneering.scheduleWeeklySundayAuction(client, config);

  // PRE-AUCTION SYNC (Sheets → MongoDB) - Runs before weekly auction (configured in bidding-schedule.json)
  auctioneering.schedulePreAuctionSync(sheetAPI, bossRotation);
  console.log('✅ Pre-auction sync scheduled (see config/bidding-schedule.json) - syncs manual Sheets edits to MongoDB');

  // EVENT REMINDER SERVICE (Phase 10) - MongoDB-powered reminder system
  const mongoEventReminders = require(path.join(rootDir, 'services', 'event-reminders'));
  mongoEventReminders.initialize(client);
  mongoEventReminders.start();
  console.log('✅ MongoDB Event reminder service started - checking for due reminders every 60 seconds');

  // BACKGROUND SYNC SERVICE DISABLED (Phase 7)
  // Reason: Redundant after implementing parallel dual-write (Phase 7)
  // All MongoDB writes now have simultaneous Sheets writes via Promise.all()
  // Background sync caused circuit breaker issues with non-existent Apps Script actions
  console.log('⏸️ Background sync service disabled (redundant with Phase 7 parallel dual-write)');

  // LAZY CACHE LOADING - Cache will be populated on-demand to reduce startup memory
  // Previous aggressive warmup caused 91% heap usage immediately (30MB/33MB)
  // Now using lazy loading: data cached on first access instead of preloading
  console.log('✅ Cache configured for lazy loading (on-demand) - reduced startup memory pressure');

  // START PERIODIC AUTO-SYNC (15 minutes - sync Google Sheets → MongoDB)
  console.log('🔄 Starting periodic auto-sync (every 15 minutes)...');

  async function runPeriodicSync() {
    console.log('🔄 [Auto-Sync] Running periodic sync from Google Sheets → MongoDB...');

    return new Promise((resolve) => {
      const syncScriptPath = path.join(rootDir, 'scripts', 'sync-sheets-to-mongodb.js');
      const syncProcess = spawn('node', [syncScriptPath], {
        cwd: rootDir,
        stdio: 'pipe' // Capture output
      });

      let output = '';
      syncProcess.stdout.on('data', (data) => {
        output += data.toString();
      });

      syncProcess.stderr.on('data', (data) => {
        console.error(`⚠️ [Auto-Sync] ${data.toString()}`);
      });

      syncProcess.on('close', (code) => {
        if (code === 0) {
          console.log('✅ [Auto-Sync] Periodic sync complete');
          // Log summary only (last few lines)
          const lines = output.trim().split('\n');
          const summaryStart = lines.findIndex(l => l.includes('SYNC SUMMARY'));
          if (summaryStart >= 0) {
            console.log(lines.slice(summaryStart).join('\n'));
          }
        } else {
          console.error(`❌ [Auto-Sync] Sync failed with exit code ${code}`);
        }
        resolve();
      });

      syncProcess.on('error', (error) => {
        console.error(`❌ [Auto-Sync] Failed to run sync script: ${error.message}`);
        resolve();
      });
    });
  }

  // Run first sync after 1 minute (allow bot to fully start up)
  setTimeout(() => {
    runPeriodicSync().catch(err => console.error('❌ [Auto-Sync] Error:', err));
  }, 60 * 1000);

  // Then run every 15 minutes
  const periodicSyncTimer = setInterval(() => {
    runPeriodicSync().catch(err => console.error('❌ [Auto-Sync] Error:', err));
  }, 15 * 60 * 1000);

  // PHASE 1: Register with shutdown manager
  shutdownManager.registerInterval('periodic-sync', periodicSyncTimer, { frequency: '15 minutes' });

  console.log('✅ Periodic auto-sync scheduled (15 min intervals)');

  // PHASE 3.3: Schedule daily health digest (9 AM)
  const scheduleDailyDigest = () => {
    const now = new Date();
    const next9AM = new Date(now);
    next9AM.setHours(9, 0, 0, 0);

    // If 9 AM has already passed today, schedule for tomorrow
    if (next9AM <= now) {
      next9AM.setDate(next9AM.getDate() + 1);
    }

    const msUntil9AM = next9AM - now;
    const hoursUntil = Math.round(msUntil9AM / 1000 / 60 / 60);

    console.log(`📅 Daily health digest scheduled for 9 AM (in ~${hoursUntil}h)`);

    setTimeout(async () => {
      try {
        // Fetch health data from /health endpoint
        const healthResponse = await new Promise((resolve, reject) => {
          http.get(`http://localhost:${PORT}/health`, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => resolve(JSON.parse(data)));
          }).on('error', reject);
        });

        await discordMonitoring.sendDailyHealthDigest(healthResponse);
        console.log('✅ Daily health digest sent');
      } catch (err) {
        console.error('❌ Failed to send daily health digest:', err.message);
      }

      // Schedule next day
      scheduleDailyDigest();
    }, msUntil9AM);
  };

  // Start daily digest scheduler
  scheduleDailyDigest();

  // PHASE 3.3: Periodic memory monitoring (every 10 minutes)
  // DISABLED: Heap warnings removed from admin logs
  // const memoryCheckInterval = setInterval(() => {
  //   discordMonitoring.checkMemoryUsage();
  // }, 10 * 60 * 1000); // 10 minutes

  // shutdownManager.registerInterval('memory-monitoring', memoryCheckInterval, { frequency: '10 minutes' });
  // console.log('✅ Memory monitoring active (checks every 10 minutes)');

  // Register GC task (every 3 minutes - more aggressive for 512MB)
  if (global.gc) {
    let lastMemoryWarning = 0; // Track last memory warning to prevent log spam

    scheduler.registerTask('gc-management', async () => {
      const memUsage = process.memoryUsage();
      const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
      const heapTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
      const rssMB = Math.round(memUsage.rss / 1024 / 1024);

      // Calculate memory pressure based on HEAP LIMIT, not current allocation
      // This prevents false high-pressure warnings when V8 allocates conservatively
      const heapStats = v8.getHeapStatistics();
      const heapLimitMB = Math.round(heapStats.heap_size_limit / 1024 / 1024);
      const memoryPressure = (heapUsedMB / heapLimitMB) * 100;

      // Run garbage collection
      global.gc();

      // Reduced logging spam - only log if memory is critically high
      if (memoryPressure > 90 || rssMB > 400) {
        console.log(
          `🧹 GC: Heap ${heapUsedMB}MB/${heapTotalMB}MB (${Math.round(memoryPressure)}%) | RSS: ${rssMB}MB`
        );
      }

      // Proactive cleanup for 512MB Koyeb - trigger at 65% to prevent buildup (lowered threshold)
      if (memoryPressure > 65) {
        // Clear cache-manager caches for high pressure
        if (memoryPressure > 75) {
          cacheManager.clearGeneralCache();
          console.log('🧹 [GC] Cleared cache-manager general caches');
        }

        // Clear fuzzy match cache if very high pressure (>85%)
        if (memoryPressure > 85) {
          cacheManager.clearFuzzyMatchCache();
          console.log('🧹 [GC] Cleared fuzzy match cache');
        }

        global.gc();

        // Extra GC pass and warning for very high pressure
        if (memoryPressure > 80) {
          const now = Date.now();
          const oneHour = 60 * 60 * 1000;

          if (now - lastMemoryWarning > oneHour) {
            console.warn(`⚠️ HIGH MEMORY PRESSURE (${Math.round(memoryPressure)}%) - Running aggressive GC`);
            lastMemoryWarning = now;
          }

          global.gc(); // Second pass for aggressive collection
        }
      }

      // Alert if approaching Koyeb 512MB limit (rate limited to once per hour)
      if (rssMB > 450) {
        const now = Date.now();
        const oneHour = 60 * 60 * 1000;

        if (now - lastMemoryWarning > oneHour) {
          console.error(`🚨 MEMORY ALERT: ${rssMB}MB RSS (Limit: 512MB) - Consider restarting`);
          lastMemoryWarning = now;
        }
      }
    }, 3 * 60 * 1000); // Every 3 minutes (more aggressive)
  } else {
    console.warn("⚠️ Garbage collection not available. Run with --expose-gc flag.");
  }

  scheduler.startScheduler();

  eventReminders.initialize(client);
  await crashRecovery.initialize(client, config);

  leaderboardSystem.init(client, config, discordCache, crashRecovery);
  scheduler.setCrashRecovery(crashRecovery);

  if (await crashRecovery.checkMissedWeeklyReport()) {
    await leaderboardSystem.sendWeeklyReport();
    await crashRecovery.markWeeklyReportCompleted();
  }

  // Lock all archived threads on startup
  try {
    const attChannel = await discordCache.getChannel('attendance_channel_id');
    const archivedThreads = await attChannel.threads.fetchArchived();
    let lockedCount = 0;

    for (const [threadId, thread] of archivedThreads.threads) {
      if (thread.archived && !thread.locked) {
        try {
          // Discord requires unarchiving before locking
          await thread.setArchived(false, "Temporarily unarchive to lock");
          await thread.setLocked(true, "Startup: Lock thread");
          await thread.setArchived(true, "Re-archive after locking");
          lockedCount++;
        } catch (err) {
          console.error(`Failed to lock thread ${threadId}:`, err.message);
        }
      }
    }

    if (lockedCount > 0) {
      console.log(`🔒 Locked ${lockedCount} archived thread(s) on startup`);
    }
  } catch (err) {
    console.error('Failed to lock archived threads on startup:', err.message);
  }

  // Log startup performance metrics
  const startupDuration = Date.now() - startupStartTime;
  const memUsage = process.memoryUsage();
  const heapUsedMB = (memUsage.heapUsed / 1024 / 1024).toFixed(1);
  const heapTotalMB = (memUsage.heapTotal / 1024 / 1024).toFixed(1);
  const heapPercent = Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100);
  const rssMB = (memUsage.rss / 1024 / 1024).toFixed(1);

  // Get V8 heap statistics to verify memory limits
  const heapStats = v8.getHeapStatistics();
  const heapLimitMB = (heapStats.heap_size_limit / 1024 / 1024).toFixed(0);
  const totalHeapMB = (heapStats.total_heap_size / 1024 / 1024).toFixed(1);

  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('📊 STARTUP METRICS');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`⏱️  Startup Time: ${(startupDuration / 1000).toFixed(1)}s`);
  console.log(`💾 Heap: ${heapUsedMB}MB / ${heapTotalMB}MB (${heapPercent}%)`);
  console.log(`🎯 Heap Limit: ${heapLimitMB}MB (V8 max)`);
  console.log(`📈 RSS: ${rssMB}MB`);
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');

  // ═══════════════════════════════════════════════════════════════════════════
  // REGISTER SLASH COMMANDS
  // ═══════════════════════════════════════════════════════════════════════════
  try {
    console.log('🔧 Registering slash commands...');
    // Register as guild commands for instant updates during development/testing
    // Switch to global (null) for production after testing phase
    await registerCommands(client, config.main_guild_id);
    console.log('✅ Slash commands registered successfully!');
  } catch (error) {
    console.error('❌ Failed to register slash commands:', error);
    console.log('⚠️ Bot will continue with prefix commands only');
  }

  console.log("✅ Bot ready for operations!");

  // Send ready confirmation to admin logs channel (fallback to commands channel)
  const readyChannelId = config.admin_logs_channel_id || config.tenchu_commands_channel_id;
  if (readyChannelId) {
    try {
      const readyChannel = await client.channels.fetch(readyChannelId).catch(() => null);
      if (readyChannel) {
        await readyChannel.send('✅ **Bot online and ready!**');
      }
    } catch (e) {
      // Non-critical - just log
      console.log(`⚠️ Could not send ready message: ${e.message}`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SCHEDULE DAILY MEMBER REGISTRY SYNC (12:00 AM Manila Time)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('📋 Scheduling daily member registry sync (12:00 AM Manila time)...');
  cron.schedule('0 0 * * *', async () => {
    try {
      console.log('⏰ [AUTO-REGISTRY] Running daily member registry sync...');

      const guild = client.guilds.cache.get(config.main_guild_id);
      if (!guild) {
        console.error('❌ [AUTO-REGISTRY] Guild not found');
        return;
      }

      // Fetch all guild members
      await guild.members.fetch();
      const members = guild.members.cache
        .filter(m => !m.user.bot)
        .map(m => ({
          discordId: m.id,
          nickname: m.nickname || m.user.displayName,
        }));

      console.log(`📋 [AUTO-REGISTRY] Syncing ${members.length} members...`);

      const result = await sheetAPI.call('syncMemberRegistry', { members });
      console.log(`✅ [AUTO-REGISTRY] Daily sync complete: ${result?.message || 'OK'}`);
    } catch (error) {
      console.error('❌ [AUTO-REGISTRY] Failed:', error.message);
    }
  }, {
    scheduled: true,
    timezone: "Asia/Manila"
  });
}

module.exports = { onClientReady };
