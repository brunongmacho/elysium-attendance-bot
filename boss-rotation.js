/**
 * ============================================================================
 * BOSS ROTATION SYSTEM (5-Guild Rotation Tracker)
 * ============================================================================
 *
 * PURPOSE:
 * Tracks which guild's turn it is for rotating bosses (Amentis, General Aquleus, Baron Braudmore).
 * 5 guilds rotate in sequence: 1 kill per guild, then loops back.
 *
 * FEATURES:
 * - Track rotation index (1-5) for each rotating boss
 * - Auto-increment rotation after boss kill (attendance submission)
 * - Check if it's ELYSIUM's turn (index = 1)
 * - Send 15-min warnings when it's our rotation
 * - Crash recovery (rotation state stored in Google Sheets)
 * - Admin commands for manual rotation control
 *
 * ROTATION FLOW:
 * Kill 1: ELYSIUM (index 1)
 * Kill 2: Guild 2 (index 2)
 * Kill 3: Guild 3 (index 3)
 * Kill 4: Guild 4 (index 4)
 * Kill 5: Guild 5 (index 5)
 * Kill 6: ELYSIUM (loops back to index 1)
 *
 * @module boss-rotation
 */

// ============================================================================
// DEPENDENCIES
// ============================================================================

const { EmbedBuilder } = require('discord.js');
const { SheetAPI } = require('./utils/sheet-api');
const { getBossImageAttachment, getBossImageAttachmentURL } = require('./utils/boss-images');
const { addGuildFooter } = require('./utils/embed-branding');
const dbAPI = require('./utils/database-api');
const cron = require('node-cron');

// ============================================================================
// MODULE STATE
// ============================================================================

let config = null;
let sheetAPI = null;
let client = null;
let bossTimerModule = null; // Reference to boss timer for recorded spawn times

/**
 * Rotating bosses list (dynamically loaded from Google Sheets)
 * Updated on initialization and cache refresh
 */
let ROTATING_BOSSES = ['Amentis', 'General Aquleus', 'Baron Braudmore']; // Default fallback

/**
 * In-memory cache of rotation status (refreshed from sheets periodically)
 * Format: { "Amentis": { currentIndex: 1, currentGuild: "ELYSIUM", isOurTurn: true }, ... }
 */
let rotationCache = {};
let lastCacheRefresh = 0;
const CACHE_REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes

/**
 * Track already-warned spawns to avoid spam
 * Format: { "Amentis-2025-01-15T10:30": true }
 */
let warnedSpawns = {};

/**
 * Track rotation warning messages for cleanup when thread closes
 * Format: { "Amentis": { messageId: "123456", channelId: "789012" }, ... }
 */
let rotationWarningMessages = {};

/**
 * Track daily rotation schedule message for cleanup
 * Format: { messageId: "123456", channelId: "789012", date: "2025-01-15", bosses: ["Amentis", "General Aquleus"], autoDeleteTimer: timeout }
 */
let dailyScheduleMessage = null;

/**
 * Spawn warning monitoring timer
 */
let spawnMonitorTimer = null;
const SPAWN_CHECK_INTERVAL = 5 * 60 * 1000; // Check every 5 minutes
const WARNING_WINDOW_MINUTES = 15; // Warn when spawn is 15-20 mins away

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initializes the boss rotation system
 * @param {Object} cfg - Bot configuration from config.json
 * @param {Client} discordClient - Discord.js client instance
 * @param {Object} bossTimer - Boss timer module for spawn time tracking
 */
function initialize(cfg, discordClient, bossTimer = null) {
  config = cfg;
  client = discordClient;
  bossTimerModule = bossTimer;
  sheetAPI = new SheetAPI(cfg.sheet_webhook_url);

  console.log('✅ Boss Rotation System initialized');

  // Ensure BossRotation sheet exists on startup
  ensureRotationSheetExists();

  // Load initial rotation status
  refreshRotationCache();

  // Start spawn warning monitor if boss timer available
  if (bossTimerModule) {
    startSpawnMonitor();
    console.log('🔔 Rotation spawn monitor started (checks every 5 minutes for 15-min warnings)');
  } else {
    console.warn('⚠️ Boss timer not provided - rotation warnings disabled');
  }

  // Start automatic rotation list refresh (every 6 hours)
  // High bosses respawn ~29-32 hours, so 6-hour checks are sufficient
  setInterval(async () => {
    try {
      console.log('⏰ [AUTO-REFRESH] Starting scheduled rotation cache refresh (6-hour interval)');
      await refreshRotationCache();
      console.log('✅ [AUTO-REFRESH] Rotation cache refresh complete');
    } catch (error) {
      console.error('❌ [AUTO-REFRESH] Failed to refresh rotation cache:', error.message);
    }
  }, 6 * 60 * 60 * 1000); // 6 hours

  console.log('✅ Automatic rotation refresh scheduled (every 6 hours)');

  // Schedule daily rotation summary at 12:00 AM Manila time (UTC+8)
  // Cron expression: '0 0 * * *' means "at 00:00 (midnight) every day"
  // Manila is UTC+8, so we need to adjust: 00:00 Manila = 16:00 UTC (previous day)
  // But node-cron runs in server's timezone, so we'll use Manila time directly
  cron.schedule('0 0 * * *', async () => {
    try {
      console.log('⏰ [DAILY-SCHEDULE] Running daily rotation schedule (12:00 AM Manila time)');
      await postDailyRotationSchedule();
      console.log('✅ [DAILY-SCHEDULE] Daily rotation schedule posted');
    } catch (error) {
      console.error('❌ [DAILY-SCHEDULE] Failed to post daily rotation schedule:', error.message);
    }
  }, {
    scheduled: true,
    timezone: "Asia/Manila"
  });

  console.log('✅ Daily rotation schedule configured (posts at 12:00 AM Manila time)');

  // Restore daily schedule tracking from MongoDB (in case of bot restart)
  restoreDailyScheduleFromMongoDB().catch(err =>
    console.error('⚠️ Failed to restore daily schedule from MongoDB:', err.message)
  );

  // Clean up old daily schedules from MongoDB (every 6 hours)
  setInterval(async () => {
    try {
      await cleanupOldSchedules();
    } catch (err) {
      console.error('⚠️ Failed to clean up old schedules:', err.message);
    }
  }, 6 * 60 * 60 * 1000); // Run every 6 hours

  // Also run cleanup on startup (to catch any stale messages from crashes)
  setTimeout(async () => {
    try {
      console.log('🧹 Running startup cleanup for old daily schedules...');
      await cleanupOldSchedules();
    } catch (err) {
      console.error('⚠️ Failed startup cleanup:', err.message);
    }
  }, 10000); // Wait 10 seconds after startup to let Discord client fully initialize
}

// ============================================================================
// SHEET OPERATIONS
// ============================================================================

/**
 * Ensures the BossRotation sheet exists in Google Sheets
 * Auto-creates if missing
 */
async function ensureRotationSheetExists() {
  try {
    const result = await sheetAPI.call('ensureBossRotationSheetExists');
    if (result.status === 'ok') {
      console.log('✅ BossRotation sheet ready');
    } else {
      console.error('❌ Failed to ensure BossRotation sheet exists:', result.message);
    }
  } catch (err) {
    console.error('❌ Error ensuring BossRotation sheet:', err.message);
  }
}

/**
 * Fetches the list of all rotating bosses from Google Sheets
 * Updates the ROTATING_BOSSES array dynamically
 */
async function fetchRotatingBosses() {
  try {
    const result = await sheetAPI.call('getAllRotatingBosses');

    if (result.status === 'ok' && result.bosses && result.bosses.length > 0) {
      ROTATING_BOSSES = result.bosses;
      console.log(`✅ Loaded ${result.bosses.length} rotating bosses: ${result.bosses.join(', ')}`);
    } else {
      console.warn('⚠️ No rotating bosses found in sheet, using default list');
    }
  } catch (err) {
    console.error('❌ Error fetching rotating bosses:', err.message);
  }
}

/**
 * Get rotation status for a specific boss
 * @param {string} bossName - Name of the boss
 * @param {boolean} useCache - Whether to use cached data (default true)
 * @returns {Promise<Object>} Rotation data or null
 */
async function getRotationStatus(bossName, useCache = true) {
  try {
    // Check if boss is in rotating system
    const normalizedName = ROTATING_BOSSES.find(
      b => b.toUpperCase() === bossName.toUpperCase()
    );

    if (!normalizedName) {
      // Not a rotating boss
      return { isRotating: false, bossName };
    }

    // STEP 1: Use cache if available and fresh
    if (useCache && rotationCache[normalizedName] && (Date.now() - lastCacheRefresh < CACHE_REFRESH_INTERVAL)) {
      return { isRotating: true, ...rotationCache[normalizedName] };
    }

    // STEP 2: Try MongoDB (faster than Google Sheets)
    const mongoData = await getRotationFromMongoDB(normalizedName);
    if (mongoData) {
      // Update cache
      rotationCache[normalizedName] = mongoData;
      console.log(`✅ [MongoDB] Fetched ${normalizedName} rotation: Index ${mongoData.currentIndex} (${mongoData.currentGuild})`);
      return mongoData;
    }

    // STEP 3: Fallback to Google Sheets
    console.log(`⚠️ [MongoDB] ${normalizedName} rotation not in MongoDB, fetching from Google Sheets...`);
    const result = await sheetAPI.call('getBossRotation', { bossName: normalizedName });

    if (result.status === 'ok' && result.isRotating) {
      // Extract rotation data from response (data is at root level, not nested)
      const rotationData = {
        isRotating: result.isRotating,
        bossName: result.bossName,
        currentIndex: result.currentIndex,
        currentGuild: result.currentGuild,
        isOurTurn: result.isOurTurn,
        guilds: result.guilds,
        nextGuild: result.nextGuild
      };

      // Update both cache AND MongoDB
      rotationCache[normalizedName] = rotationData;
      syncRotationToMongoDB(normalizedName, rotationData).catch(err =>
        console.error(`⚠️ Failed to sync ${normalizedName} rotation to MongoDB:`, err.message)
      );

      return rotationData;
    }

    // If boss not in rotation system
    if (result.status === 'ok' && result.isRotating === false) {
      return { isRotating: false, bossName: normalizedName };
    }

    return { isRotating: false, bossName: normalizedName };

  } catch (err) {
    console.error(`❌ Error getting rotation status for ${bossName}:`, err.message);
    return { isRotating: false, bossName, error: err.message };
  }
}

/**
 * Refresh rotation cache for all rotating bosses
 * Syncs Google Sheets → MongoDB → Cache
 * This is called by !rotation refresh command
 */
async function refreshRotationCache() {
  try {
    console.log('🔄 Refreshing rotation cache from Google Sheets...');

    // Get current bosses in cache/MongoDB before fetching new list
    const oldBosses = Object.keys(rotationCache);

    // Fetch latest list of rotating bosses from sheet
    await fetchRotatingBosses();

    let syncedCount = 0;
    for (const boss of ROTATING_BOSSES) {
      // Fetch directly from Google Sheets (bypassing cache and MongoDB)
      const result = await sheetAPI.call('getBossRotation', { bossName: boss });

      if (result.status === 'ok' && result.isRotating) {
        const rotationData = {
          isRotating: result.isRotating,
          bossName: result.bossName,
          currentIndex: result.currentIndex,
          currentGuild: result.currentGuild,
          isOurTurn: result.isOurTurn,
          guilds: result.guilds,
          nextGuild: result.nextGuild
        };

        // Update cache
        rotationCache[boss] = rotationData;

        // Sync to MongoDB (silent mode - batch logging used instead)
        await syncRotationToMongoDB(boss, rotationData, { silent: true });

        syncedCount++;
        console.log(`  ├─ ${boss}: Index ${rotationData.currentIndex} (${rotationData.currentGuild}) ${rotationData.isOurTurn ? '🟢 OUR TURN' : '🔴 NOT OUR TURN'}`);
      }
    }

    // Find newly added bosses (need to schedule timers)
    const newBosses = ROTATING_BOSSES.filter(boss => !oldBosses.includes(boss));
    let scheduledCount = 0;

    for (const boss of newBosses) {
      console.log(`  ├─ ➕ New rotating boss detected: ${boss}`);

      // Auto-schedule from last attendance if available
      if (bossTimerModule) {
        try {
          // First, check if boss timer already has a schedule (getNextSpawn)
          const existingTimer = bossTimerModule.getNextSpawn(boss);
          if (existingTimer && existingTimer.nextSpawn) {
            console.log(`  │  ✅ ${boss} already has a timer (spawns at ${existingTimer.nextSpawn.toISOString()})`);
            scheduledCount++;
            continue;
          }

          // No existing timer - try to auto-schedule from last attendance
          const dbAPI = require('./utils/database-api');
          const db = await dbAPI.connect();
          const attendanceCollection = db.collection('attendance');

          // Find most recent attendance for this boss (case-insensitive)
          const lastAttendanceArray = await attendanceCollection
            .find({ boss: { $regex: new RegExp(`^${boss}$`, 'i') } })
            .sort({ timestamp: -1 })
            .limit(1)
            .toArray();

          const lastAttendance = lastAttendanceArray[0];

          console.log(`  │  🔍 Searching attendance for "${boss}": ${lastAttendance ? 'Found' : 'Not found'}`);

          if (lastAttendance && lastAttendance.timestamp) {
            // Parse timestamp (format: "MM/DD/YY HH:MM")
            const match = lastAttendance.timestamp.match(/(\d{2})\/(\d{2})\/(\d{2})\s+(\d{1,2}):(\d{2})/);
            if (match) {
              const [_, month, day, year, hour, minute] = match;
              const fullYear = 2000 + parseInt(year);

              // Timestamp is in Manila time (UTC+8), convert to UTC
              const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;
              const killTimeUTC = Date.UTC(fullYear, parseInt(month) - 1, parseInt(day), parseInt(hour), parseInt(minute)) - MANILA_OFFSET_MS;
              const killTime = new Date(killTimeUTC);

              // Schedule next spawn
              await bossTimerModule.recordKill(boss, killTime, 'auto-sync');
              scheduledCount++;
              console.log(`  │  ✅ Auto-scheduled ${boss} from last attendance (${lastAttendance.timestamp})`);
            } else {
              console.log(`  │  ⚠️ ${boss} has attendance but could not parse timestamp: ${lastAttendance.timestamp}`);
            }
          } else {
            console.log(`  │  ⚠️ ${boss} has no attendance history - needs manual /killed to schedule`);
          }
        } catch (error) {
          console.error(`  │  ❌ Failed to auto-schedule ${boss}:`, error.message);
        }
      } else {
        console.log(`  │  ⚠️ Boss timer module not available - cannot auto-schedule ${boss}`);
      }
    }

    // Remove bosses that are no longer in the sheet
    const bossesToRemove = oldBosses.filter(boss => !ROTATING_BOSSES.includes(boss));
    let removedCount = 0;

    for (const boss of bossesToRemove) {
      // Remove from cache
      delete rotationCache[boss];

      // Remove from MongoDB
      try {
        const db = await dbAPI.connect();
        const rotationCollection = db.collection('bossRotation');
        const bossId = boss.toLowerCase().replace(/\s+/g, '_');

        await rotationCollection.deleteOne({ _id: bossId });
        removedCount++;
        console.log(`  ├─ 🗑️  Removed ${boss} from rotation cache (no longer in sheet)`);
      } catch (err) {
        console.error(`  ├─ ⚠️  Failed to remove ${boss} from MongoDB:`, err.message);
      }

      // Cancel timer for removed boss
      if (bossTimerModule) {
        try {
          await bossTimerModule.cancelTimer(boss);
          console.log(`  ├─ ⏹️  Cancelled spawn timer for ${boss}`);
        } catch (err) {
          console.error(`  ├─ ⚠️  Failed to cancel timer for ${boss}:`, err.message);
        }
      }
    }

    lastCacheRefresh = Date.now();
    console.log(`✅ Rotation cache refreshed: ${syncedCount} bosses synced, ${newBosses.length} added & scheduled, ${removedCount} removed & cancelled`);

  } catch (err) {
    console.error('❌ Error refreshing rotation cache:', err.message);
  }
}

/**
 * Sync rotation data to MongoDB (called after Sheet updates)
 * @param {string} bossName - Name of the boss
 * @param {Object} rotationData - Rotation data from Sheet API response
 * @param {Object} options - Optional configuration
 * @param {boolean} options.silent - Skip success logging (for batch operations)
 */
async function syncRotationToMongoDB(bossName, rotationData, options = {}) {
  try {
    const db = await dbAPI.connect();
    const rotationCollection = db.collection('bossRotation');

    const doc = {
      _id: bossName.toLowerCase().replace(/\s+/g, '_'),
      bossName: bossName,
      currentIndex: rotationData.newIndex || rotationData.currentIndex || 1,
      currentGuild: rotationData.newGuild || rotationData.currentGuild || 'Unknown',
      isOurTurn: rotationData.isNowOurTurn !== undefined ? rotationData.isNowOurTurn : (rotationData.isOurTurn || false),
      guilds: rotationData.guilds || [],
      nextGuild: rotationData.nextGuild || 'Unknown',
      lastUpdated: new Date()
    };

    await rotationCollection.updateOne(
      { _id: doc._id },
      { $set: doc },
      { upsert: true }
    );

    // Only log if not in silent mode (batch operations use summary logging instead)
    if (!options.silent) {
      console.log(`✅ [MongoDB] Synced ${bossName} rotation to MongoDB: Index ${doc.currentIndex} (${doc.currentGuild})`);
    }
  } catch (error) {
    console.error(`⚠️ [MongoDB] Failed to sync ${bossName} rotation to MongoDB:`, error.message);
    // Non-critical - don't throw, just log
  }
}

/**
 * Get rotation data from MongoDB
 * @param {string} bossName - Name of the boss
 * @returns {Promise<Object|null>} Rotation data or null if not found
 */
async function getRotationFromMongoDB(bossName) {
  try {
    const db = await dbAPI.connect();
    const rotationCollection = db.collection('bossRotation');

    const doc = await rotationCollection.findOne({
      _id: bossName.toLowerCase().replace(/\s+/g, '_')
    });

    if (!doc) {
      return null;
    }

    // Return in same format as Google Sheets API
    return {
      isRotating: true,
      bossName: doc.bossName,
      currentIndex: doc.currentIndex,
      currentGuild: doc.currentGuild,
      isOurTurn: doc.isOurTurn,
      guilds: doc.guilds || [],
      nextGuild: doc.nextGuild
    };

  } catch (error) {
    console.error(`⚠️ [MongoDB] Failed to get ${bossName} rotation from MongoDB:`, error.message);
    return null;
  }
}

/**
 * Increment rotation counter for a boss (called after boss is killed)
 * @param {string} bossName - Name of the boss that was killed
 * @returns {Promise<Object>} Updated rotation data
 */
async function incrementRotation(bossName) {
  try {
    // Check if boss is in rotating system
    const normalizedName = ROTATING_BOSSES.find(
      b => b.toUpperCase() === bossName.toUpperCase()
    );

    if (!normalizedName) {
      console.log(`ℹ️ ${bossName} is not a rotating boss, skipping rotation increment`);
      return { updated: false, bossName };
    }

    console.log(`🔄 [DUAL-WRITE] Incrementing rotation for ${normalizedName} (parallel Sheets + MongoDB)...`);
    const startTime = Date.now();

    // Prepare Sheets write promise
    const sheetWritePromise = (async () => {
      try {
        console.log(`   🔹 [Sheets] Starting parallel write...`);
        const result = await sheetAPI.call('incrementBossRotation', { bossName: normalizedName });

        if (result.status === 'ok') {
          console.log(`   ✅ [Sheets] Rotation incremented: ${result.oldIndex} → ${result.newIndex}`);
          return { success: true, source: 'Google Sheets', data: result };
        } else {
          return { success: false, source: 'Google Sheets', error: result.message };
        }
      } catch (error) {
        console.error(`   ❌ [Sheets] Failed to increment rotation:`, error.message);
        return { success: false, source: 'Google Sheets', error };
      }
    })();

    // Prepare MongoDB write promise (needs to get updated data from Sheets result)
    // Note: We need Sheets result first to know what to write to MongoDB
    // So we can't truly parallel these - MongoDB depends on Sheets response
    // But we can still execute them efficiently

    const sheetResult = await sheetWritePromise;

    if (!sheetResult.success) {
      console.error(`❌ [DUAL-WRITE] Sheets write failed - cannot update MongoDB without new rotation data`);
      return { updated: false, bossName: normalizedName, error: sheetResult.error };
    }

    const result = sheetResult.data;

    // Now write to MongoDB with the new rotation data (parallel with notification)
    const mongoWritePromise = (async () => {
      try {
        console.log(`   🔹 [MongoDB] Writing rotation data...`);
        await syncRotationToMongoDB(normalizedName, result);
        console.log(`   ✅ [MongoDB] Rotation synced successfully`);
        return { success: true, source: 'MongoDB' };
      } catch (error) {
        console.error(`   ❌ [MongoDB] Failed to sync rotation:`, error.message);
        return { success: false, source: 'MongoDB', error };
      }
    })();

    const notificationPromise = sendRotationUpdateNotification(result);

    // Execute MongoDB write and notification in parallel
    const [mongoResult] = await Promise.all([
      mongoWritePromise,
      notificationPromise
    ]);

    const duration = Date.now() - startTime;

    // Update cache (Sheets succeeded, so cache the data)
    rotationCache[normalizedName] = {
      currentIndex: result.newIndex,
      currentGuild: result.newGuild,
      isOurTurn: result.isNowOurTurn
    };

    // Log results
    if (mongoResult.success) {
      console.log(`✅ [DUAL-WRITE] ${normalizedName} rotation: ${result.oldIndex} → ${result.newIndex} (Sheets + MongoDB) [${duration}ms]`);
    } else {
      console.warn(`⚠️ [DUAL-WRITE] ${normalizedName} rotation: ${result.oldIndex} → ${result.newIndex} (Sheets only - MongoDB failed) [${duration}ms]`);
    }

    return result;

  } catch (err) {
    console.error(`❌ Error incrementing rotation for ${bossName}:`, err.message);
    return { updated: false, bossName, error: err.message };
  }
}

/**
 * Manually set rotation index for a boss (admin override)
 * @param {string} bossName - Name of the boss
 * @param {number} newIndex - New rotation index (1-5)
 * @returns {Promise<Object>} Updated rotation data
 */
async function setRotation(bossName, newIndex) {
  try {
    const normalizedName = ROTATING_BOSSES.find(
      b => b.toUpperCase() === bossName.toUpperCase()
    );

    if (!normalizedName) {
      return { success: false, message: `${bossName} is not a rotating boss` };
    }

    if (newIndex < 1) {
      return { success: false, message: 'Index must be >= 1' };
    }

    console.log(`⚙️ [DUAL-WRITE] Manually setting ${normalizedName} rotation to index ${newIndex} (parallel Sheets + MongoDB)...`);
    const startTime = Date.now();

    // Prepare Sheets write promise
    const sheetWritePromise = (async () => {
      try {
        console.log(`   🔹 [Sheets] Starting parallel write...`);
        const result = await sheetAPI.call('setBossRotation', { bossName: normalizedName, newIndex });

        if (result.status === 'ok') {
          console.log(`   ✅ [Sheets] Rotation set: ${result.oldIndex} → ${result.newIndex}`);
          return { success: true, source: 'Google Sheets', data: result };
        } else {
          return { success: false, source: 'Google Sheets', error: result.message };
        }
      } catch (error) {
        console.error(`   ❌ [Sheets] Failed to set rotation:`, error.message);
        return { success: false, source: 'Google Sheets', error };
      }
    })();

    const sheetResult = await sheetWritePromise;

    if (!sheetResult.success) {
      console.error(`❌ [DUAL-WRITE] Sheets write failed - cannot update MongoDB without rotation data`);
      return { success: false, message: sheetResult.error };
    }

    const result = sheetResult.data;

    // Now write to MongoDB with the new rotation data
    const mongoWritePromise = (async () => {
      try {
        console.log(`   🔹 [MongoDB] Writing rotation data...`);
        await syncRotationToMongoDB(normalizedName, result);
        console.log(`   ✅ [MongoDB] Rotation synced successfully`);
        return { success: true, source: 'MongoDB' };
      } catch (error) {
        console.error(`   ❌ [MongoDB] Failed to sync rotation:`, error.message);
        return { success: false, source: 'MongoDB', error };
      }
    })();

    const mongoResult = await mongoWritePromise;

    const duration = Date.now() - startTime;

    // Update cache (Sheets succeeded, so cache the data)
    rotationCache[normalizedName] = {
      currentIndex: result.newIndex,
      currentGuild: result.currentGuild,
      isOurTurn: result.isOurTurn
    };

    // Log results
    if (mongoResult.success) {
      console.log(`✅ [DUAL-WRITE] ${normalizedName} rotation set: ${result.oldIndex} → ${result.newIndex} (Sheets + MongoDB) [${duration}ms]`);
    } else {
      console.warn(`⚠️ [DUAL-WRITE] ${normalizedName} rotation set: ${result.oldIndex} → ${result.newIndex} (Sheets only - MongoDB failed) [${duration}ms]`);
    }

    return { success: true, data: result };

  } catch (err) {
    console.error(`❌ Error setting rotation for ${bossName}:`, err.message);
    return { success: false, message: err.message };
  }
}

// ============================================================================
// NOTIFICATION SYSTEM
// ============================================================================

/**
 * Send notification to admin-logs when rotation changes
 * @param {Object} rotationData - Updated rotation data
 */
async function sendRotationUpdateNotification(rotationData) {
  try {
    const adminLogsChannelId = config.admin_logs_channel_id;
    if (!adminLogsChannelId) return;

    const channel = await client.channels.fetch(adminLogsChannelId);
    if (!channel) return;

    const emoji = rotationData.isNowOurTurn ? '🟢' : '🔴';
    const status = rotationData.isNowOurTurn ? 'ELYSIUM\'S TURN' : `${rotationData.newGuild}'s turn`;

    const embed = new EmbedBuilder()
      .setColor(rotationData.isNowOurTurn ? 0x00ff00 : 0xff0000)
      .setTitle(`${emoji} Boss Rotation Updated`)
      .setDescription(`**${rotationData.bossName}** rotation advanced`)
      .addFields(
        {
          name: 'Previous',
          value: `Index ${rotationData.oldIndex} (${rotationData.oldGuild})`,
          inline: true
        },
        {
          name: 'Current',
          value: `Index ${rotationData.newIndex} (${rotationData.newGuild})`,
          inline: true
        },
        {
          name: 'Status',
          value: status,
          inline: false
        }
      )
      .setTimestamp();

    await channel.send({ embeds: [embed] });

  } catch (err) {
    console.error('❌ Error sending rotation update notification:', err.message);
  }
}

/**
 * Send 15-minute warning when it's ELYSIUM's rotation
 * Called by spawn prediction system
 * @param {string} bossName - Name of the boss
 * @param {Date} predictedSpawnTime - Predicted spawn time
 */
async function sendRotationWarning(bossName, predictedSpawnTime) {
  try {
    const rotation = await getRotationStatus(bossName);

    if (!rotation.isRotating || !rotation.isOurTurn) {
      return; // Not our turn, no warning needed
    }

    const elysiumCommandsChannelId = config.elysium_commands_channel_id;
    if (!elysiumCommandsChannelId) return;

    const channel = await client.channels.fetch(elysiumCommandsChannelId);
    if (!channel) return;

    const spawnTimestamp = Math.floor(predictedSpawnTime.getTime() / 1000);

    const embed = new EmbedBuilder()
      .setColor(0x00ff00)
      .setTitle(`🟢 OUR ROTATION - ${bossName} Spawning Soon!`)
      .setDescription(`**${bossName}** is **ELYSIUM's rotation**! Get ready!`)
      .addFields(
        {
          name: '⏰ Predicted Spawn Time',
          value: `<t:${spawnTimestamp}:F>`,
          inline: false
        },
        {
          name: '⏳ Spawning In',
          value: `<t:${spawnTimestamp}:R>`,
          inline: false
        },
        {
          name: '🎯 Rotation Status',
          value: `Guild ${rotation.currentIndex}/5 - **ELYSIUM**`,
          inline: false
        }
      )
      .setTimestamp();

    // Add boss image if available
    const bossImage = getBossImageAttachment(bossName);
    const bossImageURL = getBossImageAttachmentURL(bossName, channel.guild);
    if (bossImageURL) {
      embed.setThumbnail(bossImageURL);
    }

    // Add guild branding to footer
    addGuildFooter(embed, channel.guild, 'ELYSIUM Rotation System');

    const messagePayload = { content: '@everyone', embeds: [embed] };
    if (bossImage) {
      messagePayload.files = [bossImage];
    }

    const sentMessage = await channel.send(messagePayload);

    // Store message ID for cleanup when thread closes
    rotationWarningMessages[bossName] = {
      messageId: sentMessage.id,
      channelId: channel.id
    };

    console.log(`✅ Sent rotation warning for ${bossName} (our turn, spawning in ~15 mins)`);

  } catch (err) {
    console.error(`❌ Error sending rotation warning for ${bossName}:`, err.message);
  }
}

/**
 * Delete rotation warning message when thread closes (cleanup to avoid flooding)
 * @param {string} bossName - Name of the boss whose warning should be deleted
 */
async function deleteRotationWarning(bossName) {
  try {
    // Check if this boss has a rotation warning message
    if (!isRotatingBoss(bossName)) {
      return; // Not a rotating boss, no warning to delete
    }

    const warningInfo = rotationWarningMessages[bossName];
    if (!warningInfo) {
      return; // No warning message stored for this boss
    }

    // Fetch and delete the message
    try {
      const channel = await client.channels.fetch(warningInfo.channelId);
      if (channel) {
        const message = await channel.messages.fetch(warningInfo.messageId);
        if (message) {
          await message.delete();
          console.log(`🗑️ Deleted rotation warning for ${bossName} (thread closed)`);
        }
      }
    } catch (err) {
      // Message might already be deleted or not found
      console.log(`⚠️ Could not delete rotation warning for ${bossName}: ${err.message}`);
    }

    // Remove from tracking
    delete rotationWarningMessages[bossName];

  } catch (err) {
    console.error(`❌ Error deleting rotation warning for ${bossName}:`, err.message);
  }
}

// ============================================================================
// DAILY ROTATION SCHEDULE
// ============================================================================

/**
 * Clean up old daily schedules (both Discord messages and MongoDB documents)
 * Called on startup and every 6 hours
 */
async function cleanupOldSchedules() {
  try {
    const db = await dbAPI.connect();
    const scheduleCollection = db.collection('dailyRotationSchedule');

    // Get today's date to avoid deleting today's schedule
    const now = new Date();
    const manilaTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Manila' }));
    const startOfToday = new Date(manilaTime);
    startOfToday.setHours(0, 0, 0, 0);
    const todayDate = startOfToday.toISOString().split('T')[0];

    // Find all old schedules (not today)
    const oldSchedules = await scheduleCollection.find({ _id: { $ne: todayDate } }).toArray();

    if (oldSchedules.length === 0) {
      console.log('🧹 No old daily schedules to clean up');
      return;
    }

    console.log(`🧹 Found ${oldSchedules.length} old daily schedule(s) to clean up`);

    let deletedMessages = 0;
    let deletedDocs = 0;

    for (const schedule of oldSchedules) {
      try {
        // Try to delete the Discord message
        if (schedule.messageId && schedule.channelId) {
          try {
            const channel = await client.channels.fetch(schedule.channelId);
            if (channel) {
              const message = await channel.messages.fetch(schedule.messageId);
              if (message) {
                await message.delete();
                deletedMessages++;
                console.log(`   🗑️ Deleted old schedule message from ${schedule._id}`);
              }
            }
          } catch (discordErr) {
            // Message might already be deleted or channel inaccessible
            console.log(`   ⚠️ Could not delete message for ${schedule._id}: ${discordErr.message}`);
          }
        }

        // Delete from MongoDB
        await scheduleCollection.deleteOne({ _id: schedule._id });
        deletedDocs++;

      } catch (scheduleErr) {
        console.error(`   ❌ Error cleaning up schedule ${schedule._id}:`, scheduleErr.message);
      }
    }

    console.log(`✅ Cleanup complete: ${deletedMessages} Discord messages deleted, ${deletedDocs} MongoDB documents removed`);

  } catch (err) {
    console.error('❌ Error in cleanupOldSchedules:', err.message);
  }
}

/**
 * Restore daily rotation schedule tracking from MongoDB on bot startup
 * Prevents loss of tracking after bot restarts
 */
async function restoreDailyScheduleFromMongoDB() {
  try {
    // Get today's date in Manila timezone
    const now = new Date();
    const manilaTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Manila' }));
    const startOfDay = new Date(manilaTime);
    startOfDay.setHours(0, 0, 0, 0);
    const todayDate = startOfDay.toISOString().split('T')[0];

    // Check MongoDB for today's schedule
    const db = await dbAPI.connect();
    const scheduleCollection = db.collection('dailyRotationSchedule');
    const existingSchedule = await scheduleCollection.findOne({ _id: todayDate });

    if (existingSchedule) {
      // Restore tracking
      dailyScheduleMessage = {
        messageId: existingSchedule.messageId,
        channelId: existingSchedule.channelId,
        date: existingSchedule.date,
        bosses: existingSchedule.bosses || [],
        autoDeleteTimer: null
      };

      console.log(`✅ Restored daily schedule from MongoDB (${todayDate}, ${dailyScheduleMessage.bosses.length} bosses)`);

      // CRASH RECOVERY: Check if schedule should be deleted
      const bosses = existingSchedule.bosses || [];
      const postedAt = existingSchedule.postedAt ? new Date(existingSchedule.postedAt) : null;

      // Case 1: All bosses completed → delete immediately
      if (bosses.length === 0) {
        console.log(`🔧 [CRASH-RECOVERY] All bosses completed - deleting schedule immediately`);
        await deleteDailySchedule();
        return;
      }

      // Case 2: "No rotations" posted more than 1 hour ago → delete immediately
      if (bosses.length === 0 && postedAt) {
        const hoursSincePosted = (Date.now() - postedAt.getTime()) / (1000 * 60 * 60);
        if (hoursSincePosted > 1) {
          console.log(`🔧 [CRASH-RECOVERY] No rotations schedule expired (${hoursSincePosted.toFixed(1)}h old) - deleting`);
          await deleteDailySchedule();
          return;
        } else {
          // Re-schedule the 1-hour auto-delete timer
          const remainingMs = (1 * 60 * 60 * 1000) - (Date.now() - postedAt.getTime());
          if (remainingMs > 0) {
            dailyScheduleMessage.autoDeleteTimer = setTimeout(async () => {
              try {
                await deleteDailySchedule();
                console.log('🗑️ Auto-deleted "no rotations" schedule after crash recovery');
              } catch (err) {
                console.error('❌ Failed to auto-delete schedule:', err.message);
              }
            }, remainingMs);
            console.log(`⏰ [CRASH-RECOVERY] Re-scheduled auto-delete timer (${Math.round(remainingMs / 60000)} minutes remaining)`);
          }
        }
      }

    } else {
      console.log(`ℹ️ No daily schedule found in MongoDB for ${todayDate}`);

      // MISSED CRON RECOVERY: If bot was down at midnight, post schedule now
      // Only if it's after 12:00 AM and before 11:59 PM (same day)
      const hourOfDay = manilaTime.getHours();
      if (hourOfDay >= 0 && hourOfDay <= 23) {
        console.log(`🔧 [MISSED-CRON] Bot was down at midnight - posting today's schedule now`);

        // Post schedule immediately (async, don't wait)
        postDailyRotationSchedule().catch(err =>
          console.error('❌ Failed to post missed daily schedule:', err.message)
        );
      }
    }

  } catch (err) {
    console.error('❌ Error restoring daily schedule from MongoDB:', err.message);
  }
}

/**
 * Post daily rotation schedule at 12:00 AM Manila time
 * Shows all ELYSIUM rotations for the next 24 hours (12am to 11:59pm)
 * Auto-deletes when last boss attendance closes (or after 1 hour if no spawns)
 */
async function postDailyRotationSchedule() {
  try {
    if (!bossTimerModule) {
      console.warn('⚠️ Boss timer module not available - cannot generate daily schedule');
      return;
    }

    const elysiumCommandsChannelId = config.elysium_commands_channel_id;
    if (!elysiumCommandsChannelId) {
      console.warn('⚠️ ELYSIUM commands channel not configured - cannot post daily schedule');
      return;
    }

    const channel = await client.channels.fetch(elysiumCommandsChannelId);
    if (!channel) {
      console.warn('⚠️ ELYSIUM commands channel not found');
      return;
    }

    // Define time window: next 24 hours (12:00 AM to 11:59 PM Manila time)
    const now = new Date();
    const manilaTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Manila' }));

    // Start of today (12:00 AM Manila)
    const startOfDay = new Date(manilaTime);
    startOfDay.setHours(0, 0, 0, 0);

    // End of today (11:59:59 PM Manila)
    const endOfDay = new Date(manilaTime);
    endOfDay.setHours(23, 59, 59, 999);

    const todayDate = startOfDay.toISOString().split('T')[0];

    console.log(`📅 Checking rotations from ${startOfDay.toISOString()} to ${endOfDay.toISOString()}`);

    // DUPLICATE PREVENTION: Check if we already posted today's schedule
    const db = await dbAPI.connect();
    const scheduleCollection = db.collection('dailyRotationSchedule');

    const existingSchedule = await scheduleCollection.findOne({ _id: todayDate });
    if (existingSchedule) {
      console.log(`⚠️ Daily schedule already posted for ${todayDate} - skipping to prevent duplicates`);

      // Restore in-memory tracking if lost (e.g., after bot restart)
      if (!dailyScheduleMessage) {
        dailyScheduleMessage = {
          messageId: existingSchedule.messageId,
          channelId: existingSchedule.channelId,
          date: existingSchedule.date,
          bosses: existingSchedule.bosses || [],
          autoDeleteTimer: null // Timer lost on restart, but that's OK
        };
        console.log(`✅ Restored daily schedule tracking from MongoDB`);
      }
      return;
    }

    // Collect all ELYSIUM rotations for the next 24 hours
    const elysiumRotations = [];

    for (const bossName of ROTATING_BOSSES) {
      try {
        // Check rotation status
        const rotation = await getRotationStatus(bossName);

        if (!rotation.isRotating || !rotation.isOurTurn) {
          continue; // Not our turn, skip
        }

        // Get spawn time from boss timer
        const timerData = bossTimerModule.getNextSpawn(bossName);
        if (!timerData || !timerData.nextSpawn) {
          continue; // No spawn time available
        }

        const spawnTime = timerData.nextSpawn;

        // Check if spawn is within today (12am to 11:59pm Manila)
        if (spawnTime >= startOfDay && spawnTime <= endOfDay) {
          elysiumRotations.push({
            bossName,
            spawnTime,
            rotation,
            timerData
          });
        }

      } catch (bossError) {
        console.error(`❌ Error checking rotation for ${bossName}:`, bossError.message);
      }
    }

    // Sort by spawn time
    elysiumRotations.sort((a, b) => a.spawnTime - b.spawnTime);

    console.log(`📊 Found ${elysiumRotations.length} ELYSIUM rotations today`);

    // Delete previous daily schedule message if exists
    if (dailyScheduleMessage) {
      await deleteDailySchedule();
    }

    // Case 1: No ELYSIUM rotations today
    if (elysiumRotations.length === 0) {
      const embed = new EmbedBuilder()
        .setColor(0x808080) // Gray
        .setTitle('📅 Daily Boss Rotation - ELYSIUM')
        .setDescription('**No ELYSIUM rotations scheduled for today.**\n\nEnjoy your day off! 🌴')
        .setTimestamp();

      addGuildFooter(embed, channel.guild, 'ELYSIUM Daily Schedule');

      const sentMessage = await channel.send({ embeds: [embed] });

      // Store message info and auto-delete after 1 hour
      const autoDeleteTimer = setTimeout(async () => {
        try {
          const msg = await channel.messages.fetch(sentMessage.id);
          if (msg) {
            await msg.delete();
            console.log('🗑️ Auto-deleted "no rotations" daily schedule (1 hour expired)');
          }
        } catch (err) {
          console.error('❌ Failed to auto-delete daily schedule:', err.message);
        }
        dailyScheduleMessage = null;
      }, 60 * 60 * 1000); // 1 hour

      dailyScheduleMessage = {
        messageId: sentMessage.id,
        channelId: channel.id,
        date: todayDate,
        bosses: [],
        autoDeleteTimer
      };

      // Save to MongoDB to prevent duplicates on bot restart
      await scheduleCollection.updateOne(
        { _id: todayDate },
        {
          $set: {
            messageId: sentMessage.id,
            channelId: channel.id,
            date: todayDate,
            bosses: [],
            postedAt: new Date()
          }
        },
        { upsert: true }
      );

      console.log('✅ Posted "no rotations" daily schedule (will auto-delete in 1 hour)');
      return;
    }

    // Case 2: ELYSIUM has rotations today - create enhanced visual
    // Group bosses by time of day
    const timeGroups = {
      'Night (12am - 6am)': [],
      'Morning (6am - 12pm)': [],
      'Afternoon (12pm - 6pm)': [],
      'Evening (6pm - 12am)': []
    };

    for (const rotation of elysiumRotations) {
      const hour = rotation.spawnTime.getHours();

      if (hour >= 0 && hour < 6) {
        timeGroups['Night (12am - 6am)'].push(rotation);
      } else if (hour >= 6 && hour < 12) {
        timeGroups['Morning (6am - 12pm)'].push(rotation);
      } else if (hour >= 12 && hour < 18) {
        timeGroups['Afternoon (12pm - 6pm)'].push(rotation);
      } else {
        timeGroups['Evening (6pm - 12am)'].push(rotation);
      }
    }

    // Build embed with enhanced visual
    const embed = new EmbedBuilder()
      .setColor(0x00ff00) // Green for ELYSIUM
      .setTitle('🟢 Daily Boss Rotation - ELYSIUM')
      .setDescription(`**${elysiumRotations.length} boss${elysiumRotations.length > 1 ? 'es' : ''} rotating today!** Get ready!\n\u200B`);

    // Add fields for each time group (only if has bosses)
    for (const [timeLabel, bosses] of Object.entries(timeGroups)) {
      if (bosses.length === 0) continue;

      let fieldValue = '';
      for (const { bossName, spawnTime, rotation, timerData } of bosses) {
        const spawnTimestamp = Math.floor(spawnTime.getTime() / 1000);
        const confidence = timerData.confidence || 0;

        // Get boss thumbnail URL
        const bossImageURL = getBossImageAttachmentURL(bossName, channel.guild);
        const thumbnail = bossImageURL ? `[🖼️](${bossImageURL})` : '';

        fieldValue += `**${bossName}** ${thumbnail}\n`;
        fieldValue += `├ 🕐 <t:${spawnTimestamp}:t> (<t:${spawnTimestamp}:R>)\n`;
        fieldValue += `├ 🎯 Guild ${rotation.currentIndex}/5 - **ELYSIUM**\n`;
        fieldValue += `└ 📊 ${Math.round(confidence)}% confidence\n\n`;
      }

      embed.addFields({
        name: `⏰ ${timeLabel}`,
        value: fieldValue.trim(),
        inline: false
      });
    }

    // Add summary footer
    const totalPoints = elysiumRotations.length; // Could calculate actual points if needed
    embed.addFields({
      name: '\u200B',
      value: `**Total Rotations:** ${elysiumRotations.length}\n**Stay alert and check #elysium-commands for 15-min warnings!**`,
      inline: false
    });

    // Add thumbnail (use ELYSIUM server icon)
    const serverIcon = channel.guild.iconURL({ dynamic: true, size: 256 });
    if (serverIcon) {
      embed.setThumbnail(serverIcon);
    }

    // Add guild branding
    addGuildFooter(embed, channel.guild, 'ELYSIUM Daily Schedule');
    embed.setTimestamp();

    // Send message (no attachment needed - using server icon)
    const messagePayload = { embeds: [embed] };

    const sentMessage = await channel.send(messagePayload);

    // Store message info (will be deleted when last boss attendance closes)
    dailyScheduleMessage = {
      messageId: sentMessage.id,
      channelId: channel.id,
      date: todayDate,
      bosses: elysiumRotations.map(r => r.bossName),
      autoDeleteTimer: null // No timer - deleted when last boss attendance closes
    };

    // Save to MongoDB to prevent duplicates on bot restart
    await scheduleCollection.updateOne(
      { _id: todayDate },
      {
        $set: {
          messageId: sentMessage.id,
          channelId: channel.id,
          date: todayDate,
          bosses: elysiumRotations.map(r => r.bossName),
          postedAt: new Date()
        }
      },
      { upsert: true }
    );

    console.log(`✅ Posted daily rotation schedule: ${elysiumRotations.length} ELYSIUM rotations`);

  } catch (err) {
    console.error('❌ Error posting daily rotation schedule:', err.message);
  }
}

/**
 * Delete daily rotation schedule message
 * Called when last boss attendance closes or when posting new schedule
 */
async function deleteDailySchedule() {
  try {
    if (!dailyScheduleMessage) {
      return; // No message to delete
    }

    const scheduleDate = dailyScheduleMessage.date;

    // Clear auto-delete timer if exists
    if (dailyScheduleMessage.autoDeleteTimer) {
      clearTimeout(dailyScheduleMessage.autoDeleteTimer);
    }

    // Delete message from Discord
    try {
      const channel = await client.channels.fetch(dailyScheduleMessage.channelId);
      if (channel) {
        const message = await channel.messages.fetch(dailyScheduleMessage.messageId);
        if (message) {
          await message.delete();
          console.log('🗑️ Deleted daily rotation schedule (attendance thread closed)');
        }
      }
    } catch (err) {
      console.log(`⚠️ Could not delete daily schedule message: ${err.message}`);
    }

    // Remove from MongoDB to allow re-posting
    try {
      const db = await dbAPI.connect();
      const scheduleCollection = db.collection('dailyRotationSchedule');
      await scheduleCollection.deleteOne({ _id: scheduleDate });
      console.log(`🗑️ Removed daily schedule from MongoDB (${scheduleDate})`);
    } catch (err) {
      console.error(`⚠️ Failed to remove daily schedule from MongoDB: ${err.message}`);
    }

    dailyScheduleMessage = null;

  } catch (err) {
    console.error('❌ Error deleting daily schedule:', err.message);
  }
}

/**
 * Check if a boss is the last one in today's daily schedule
 * If yes, delete the daily schedule message
 * @param {string} bossName - Name of the boss whose attendance just closed
 */
async function checkAndDeleteDailySchedule(bossName) {
  try {
    if (!dailyScheduleMessage) {
      return; // No daily schedule posted
    }

    if (!dailyScheduleMessage.bosses.includes(bossName)) {
      return; // This boss wasn't in today's schedule
    }

    // Remove this boss from the list
    const updatedBosses = dailyScheduleMessage.bosses.filter(b => b !== bossName);
    dailyScheduleMessage.bosses = updatedBosses;

    console.log(`📋 Boss ${bossName} completed. Remaining in daily schedule: ${updatedBosses.length}`);

    // Update MongoDB with the new boss list
    try {
      const db = await dbAPI.connect();
      const scheduleCollection = db.collection('dailyRotationSchedule');
      await scheduleCollection.updateOne(
        { _id: dailyScheduleMessage.date },
        { $set: { bosses: updatedBosses } }
      );
    } catch (err) {
      console.error(`⚠️ Failed to update daily schedule in MongoDB: ${err.message}`);
    }

    // If this was the last boss, delete the daily schedule
    if (updatedBosses.length === 0) {
      console.log('🎯 Last boss of the day completed - deleting daily schedule');
      await deleteDailySchedule();
    }

  } catch (err) {
    console.error('❌ Error checking daily schedule:', err.message);
  }
}

// ============================================================================
// SPAWN WARNING MONITOR
// ============================================================================

/**
 * Start periodic spawn monitoring for rotation warnings
 * Prevents duplicate timers by clearing any existing interval first
 */
function startSpawnMonitor() {
  // Clear any existing timer to prevent duplicates
  if (spawnMonitorTimer) {
    clearInterval(spawnMonitorTimer);
    console.log('⚠️ Cleared existing spawn monitor timer (preventing duplicates)');
  }

  // Run check immediately on startup
  checkUpcomingSpawns();

  // Then check every 5 minutes
  spawnMonitorTimer = setInterval(() => {
    checkUpcomingSpawns();
  }, SPAWN_CHECK_INTERVAL);

  console.log(`✅ Spawn monitor started (checking every ${SPAWN_CHECK_INTERVAL / 60000} minutes)`);
}

/**
 * Check if any rotating bosses will spawn soon and send warnings if it's our rotation
 */
async function checkUpcomingSpawns() {
  try {
    if (!bossTimerModule) return;

    // Check each rotating boss
    for (const bossName of ROTATING_BOSSES) {
      try {
        let spawnTime = null;

        // Check boss timer for recorded spawn times
        if (bossTimerModule) {
          const timerData = bossTimerModule.getNextSpawn(bossName);
          if (timerData && timerData.nextSpawn) {
            spawnTime = timerData.nextSpawn;
          }
        }

        if (!spawnTime) continue; // No spawn time available

        const now = new Date();
        const predictedTime = spawnTime;
        const minutesUntilSpawn = (predictedTime - now) / (1000 * 60);

        // Check if spawn is within warning window (15-20 minutes)
        if (minutesUntilSpawn >= WARNING_WINDOW_MINUTES && minutesUntilSpawn <= (WARNING_WINDOW_MINUTES + 5)) {
          // Create unique key for this predicted spawn
          // Use timestamp as primary key to avoid issues with boss names containing dashes
          const timestampKey = predictedTime.toISOString().slice(0, 16); // Truncate to minute precision
          const spawnKey = `${bossName}::${timestampKey}`; // Use :: separator to avoid dash conflicts

          // Skip if already warned
          if (warnedSpawns[spawnKey]) {
            continue;
          }

          // Check rotation status
          const rotation = await getRotationStatus(bossName);

          if (rotation.isRotating && rotation.isOurTurn) {
            // Send warning!
            await sendRotationWarning(bossName, predictedTime);

            // Mark as warned with timestamp
            warnedSpawns[spawnKey] = now.getTime();

            console.log(`🟢 Sent 15-min rotation warning for ${bossName} (our turn, spawning at ${predictedTime.toISOString()})`);
          }
        }

        // Clean up old warned spawns (older than 2 hours)
        const twoHoursAgo = now.getTime() - (2 * 60 * 60 * 1000);
        for (const key in warnedSpawns) {
          // Extract timestamp from value (not key) for reliable cleanup
          const warnTime = warnedSpawns[key];
          if (typeof warnTime === 'number' && warnTime < twoHoursAgo) {
            delete warnedSpawns[key];
          }
        }

      } catch (bossError) {
        console.error(`❌ Error checking spawn for ${bossName}:`, bossError.message);
      }
    }

  } catch (err) {
    console.error('❌ Error in spawn monitor:', err.message);
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Check if a boss is in the rotating system
 * @param {string} bossName - Name of the boss
 * @returns {boolean} True if boss is rotating
 */
function isRotatingBoss(bossName) {
  return ROTATING_BOSSES.some(b => b.toUpperCase() === bossName.toUpperCase());
}

/**
 * Get list of all rotating bosses
 * @returns {Array<string>} List of rotating boss names
 */
function getRotatingBosses() {
  return [...ROTATING_BOSSES];
}

/**
 * Get rotation status for all rotating bosses
 * @returns {Promise<Object>} Map of boss names to rotation status
 */
async function getAllRotations() {
  const rotations = {};

  for (const boss of ROTATING_BOSSES) {
    const rotation = await getRotationStatus(boss);
    if (rotation.isRotating) {
      rotations[boss] = rotation;
    }
  }

  return rotations;
}

/**
 * Handle boss kill - auto-increment rotation and auto-schedule next spawn
 * Call this after successful attendance submission
 * @param {string} bossName - Name of the boss that was killed
 * @param {string} killTimestamp - Kill timestamp in "MM/DD/YY HH:MM" format (Manila time)
 * @returns {Promise<void>}
 */
async function handleBossKill(bossName, killTimestamp = null) {
  try {
    if (!isRotatingBoss(bossName)) {
      return; // Not a rotating boss, nothing to do
    }

    console.log(`🔄 Boss killed: ${bossName} (rotating boss - incrementing rotation & auto-scheduling next spawn)`);

    // Increment rotation index
    const result = await incrementRotation(bossName);

    if (result.updated !== false) {
      console.log(`✅ Rotation updated: ${bossName} ${result.oldIndex} → ${result.newIndex} (${result.newGuild})`);
    }

    // Auto-schedule next spawn (no /bosskill needed!)
    if (bossTimerModule && killTimestamp) {
      try {
        // Parse timestamp (format: "MM/DD/YY HH:MM")
        const match = killTimestamp.match(/(\d{2})\/(\d{2})\/(\d{2})\s+(\d{1,2}):(\d{2})/);
        if (match) {
          const [_, month, day, year, hour, minute] = match;
          const fullYear = 2000 + parseInt(year);

          // Timestamp is in Manila time (UTC+8), convert to UTC
          const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;
          const killTimeUTC = Date.UTC(fullYear, parseInt(month) - 1, parseInt(day), parseInt(hour), parseInt(minute)) - MANILA_OFFSET_MS;
          const killTime = new Date(killTimeUTC);

          // Schedule next spawn automatically
          await bossTimerModule.recordKill(bossName, killTime, 'auto-detected');
          console.log(`🎯 Auto-scheduled next spawn for ${bossName} (killed at ${killTimestamp})`);
        } else {
          console.warn(`⚠️ Could not parse kill timestamp for ${bossName}: ${killTimestamp}`);
        }
      } catch (scheduleErr) {
        console.error(`❌ Failed to auto-schedule ${bossName}:`, scheduleErr.message);
      }
    } else if (!killTimestamp) {
      console.warn(`⚠️ No kill timestamp provided for ${bossName} - cannot auto-schedule (will need manual /bosskill)`);
    }

  } catch (err) {
    console.error(`❌ Error handling boss kill for rotation: ${bossName}`, err.message);
  }
}

// ============================================================================
// MODULE EXPORTS
// ============================================================================

module.exports = {
  initialize,
  getRotationStatus,
  refreshRotationCache,
  incrementRotation,
  setRotation,
  deleteRotationWarning,
  handleBossKill,
  isRotatingBoss,
  getRotatingBosses,
  getAllRotations,
  checkAndDeleteDailySchedule
};
