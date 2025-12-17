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
        console.log(`  ├─ 🗑️  Removed ${boss} (no longer in sheet)`);
      } catch (err) {
        console.error(`  ├─ ⚠️  Failed to remove ${boss} from MongoDB:`, err.message);
      }
    }

    lastCacheRefresh = Date.now();
    console.log(`✅ Rotation cache refreshed: ${syncedCount} bosses synced, ${removedCount} bosses removed`);

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
 * Handle boss kill - auto-increment rotation if it's a rotating boss
 * Call this after successful attendance submission
 * @param {string} bossName - Name of the boss that was killed
 * @returns {Promise<void>}
 */
async function handleBossKill(bossName) {
  try {
    if (!isRotatingBoss(bossName)) {
      return; // Not a rotating boss, nothing to do
    }

    console.log(`🔄 Boss killed: ${bossName} (rotating boss - incrementing rotation counter)`);

    const result = await incrementRotation(bossName);

    if (result.updated !== false) {
      console.log(`✅ Rotation updated: ${bossName} ${result.oldIndex} → ${result.newIndex} (${result.newGuild})`);
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
  getAllRotations
};
