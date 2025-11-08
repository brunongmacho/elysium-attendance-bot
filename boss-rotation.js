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

// ============================================================================
// MODULE STATE
// ============================================================================

let config = null;
let sheetAPI = null;
let client = null;

/**
 * Rotating bosses that use the 5-guild system
 */
const ROTATING_BOSSES = ['Amentis', 'General Aquleus', 'Baron Braudmore'];

/**
 * In-memory cache of rotation status (refreshed from sheets periodically)
 * Format: { "Amentis": { currentIndex: 1, currentGuild: "ELYSIUM", isOurTurn: true }, ... }
 */
let rotationCache = {};
let lastCacheRefresh = 0;
const CACHE_REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initializes the boss rotation system
 * @param {Object} cfg - Bot configuration from config.json
 * @param {Client} discordClient - Discord.js client instance
 */
function initialize(cfg, discordClient) {
  config = cfg;
  client = discordClient;
  sheetAPI = new SheetAPI(cfg.sheet_webhook_url);

  console.log('✅ Boss Rotation System initialized');

  // Ensure BossRotation sheet exists on startup
  ensureRotationSheetExists();

  // Load initial rotation status
  refreshRotationCache();
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

    // Use cache if available and fresh
    if (useCache && rotationCache[normalizedName] && (Date.now() - lastCacheRefresh < CACHE_REFRESH_INTERVAL)) {
      return { isRotating: true, ...rotationCache[normalizedName] };
    }

    // Fetch from Google Sheets
    const result = await sheetAPI.call('getBossRotation', { bossName: normalizedName });

    if (result.status === 'ok' && result.data.isRotating) {
      // Update cache
      rotationCache[normalizedName] = result.data;
      return result.data;
    }

    return { isRotating: false, bossName: normalizedName };

  } catch (err) {
    console.error(`❌ Error getting rotation status for ${bossName}:`, err.message);
    return { isRotating: false, bossName, error: err.message };
  }
}

/**
 * Refresh rotation cache for all rotating bosses
 */
async function refreshRotationCache() {
  try {
    console.log('🔄 Refreshing rotation cache...');

    for (const boss of ROTATING_BOSSES) {
      const rotation = await getRotationStatus(boss, false); // Force fetch from sheets
      if (rotation.isRotating) {
        rotationCache[boss] = rotation;
        console.log(`  ├─ ${boss}: Index ${rotation.currentIndex} (${rotation.currentGuild}) ${rotation.isOurTurn ? '🟢 OUR TURN' : '🔴 NOT OUR TURN'}`);
      }
    }

    lastCacheRefresh = Date.now();
    console.log('✅ Rotation cache refreshed');

  } catch (err) {
    console.error('❌ Error refreshing rotation cache:', err.message);
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

    console.log(`🔄 Incrementing rotation for ${normalizedName}...`);

    const result = await sheetAPI.call('incrementBossRotation', { bossName: normalizedName });

    if (result.status === 'ok') {
      console.log(`✅ ${normalizedName} rotation: ${result.data.oldIndex} (${result.data.oldGuild}) → ${result.data.newIndex} (${result.data.newGuild})`);

      // Update cache
      rotationCache[normalizedName] = {
        currentIndex: result.data.newIndex,
        currentGuild: result.data.newGuild,
        isOurTurn: result.data.isNowOurTurn
      };

      // Send admin notification
      await sendRotationUpdateNotification(result.data);

      return result.data;
    } else {
      console.error(`❌ Failed to increment rotation for ${normalizedName}:`, result.message);
      return { updated: false, bossName: normalizedName, error: result.message };
    }

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

    if (newIndex < 1 || newIndex > 5) {
      return { success: false, message: 'Index must be between 1 and 5' };
    }

    console.log(`⚙️ Manually setting ${normalizedName} rotation to index ${newIndex}...`);

    const result = await sheetAPI.call('setBossRotation', { bossName: normalizedName, newIndex });

    if (result.status === 'ok') {
      console.log(`✅ ${normalizedName} rotation set: ${result.data.oldIndex} → ${result.data.newIndex} (${result.data.currentGuild})`);

      // Update cache
      rotationCache[normalizedName] = {
        currentIndex: result.data.newIndex,
        currentGuild: result.data.currentGuild,
        isOurTurn: result.data.isOurTurn
      };

      return { success: true, data: result.data };
    } else {
      return { success: false, message: result.message };
    }

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

    await channel.send({ content: '@everyone', embeds: [embed] });

    console.log(`✅ Sent rotation warning for ${bossName} (our turn, spawning in ~15 mins)`);

  } catch (err) {
    console.error(`❌ Error sending rotation warning for ${bossName}:`, err.message);
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

// ============================================================================
// MODULE EXPORTS
// ============================================================================

module.exports = {
  initialize,
  getRotationStatus,
  refreshRotationCache,
  incrementRotation,
  setRotation,
  sendRotationWarning,
  isRotatingBoss,
  getRotatingBosses,
  getAllRotations
};
