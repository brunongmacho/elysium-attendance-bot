/**
 * Initialization for the boss timer system.
 * Handles module setup, config loading, and crash recovery restoration.
 */

const fs = require('fs');
const path = require('path');
const mongoHelpers = require('../../utils/mongodb-helpers');
const state = require('./state');
const { findNextScheduledTime, formatGMT8, calculateNextSpawn } = require('./spawn-tracking');
const { scheduleReminder } = require('./thread-management');
const { restoreServerDownState, saveServerDownState } = require('./admin-commands');

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize boss timer system
 * @param {Object} discordClient - Discord.js client
 * @param {Object} botConfig - Bot configuration
 * @param {Object} sheetAPIInstance - Sheet API instance
 * @param {Object} attendanceModule - Attendance module
 */
async function initialize(discordClient, botConfig, sheetAPIInstance, attendanceModule) {
  state.setExternalModules(discordClient, botConfig, sheetAPIInstance, attendanceModule);

  loadBossSpawnConfig();

  await restoreServerDownState();

  await loadRecoveryAndReschedule();

  console.log('✅ Boss timer system initialized');
}

/**
 * Load boss spawn configuration from JSON
 */
function loadBossSpawnConfig() {
  const configPath = path.join(__dirname, '../../boss_spawn_config.json');
  const rawData = fs.readFileSync(configPath, 'utf8');
  const cfg = JSON.parse(rawData);
  state.setBossSpawnConfig(cfg);
  console.log(`📋 Loaded ${Object.keys(cfg.timerBasedBosses).length} timer-based and ${Object.keys(cfg.scheduleBasedBosses).length} schedule-based bosses`);
}

/**
 * Load recovery data from MongoDB (with fallback to Sheets) and reschedule timers
 */
async function loadRecoveryAndReschedule() {
  try {
    console.log('🔄 Loading boss timer recovery data...');

    let recoveryData = [];
    let source = 'unknown';

    // Try MongoDB first
    try {
      const mongoTimers = await mongoHelpers.getAllBossTimers();
      if (mongoTimers && mongoTimers.length > 0) {
        recoveryData = mongoTimers;
        source = 'MongoDB';
        console.log(`✅ Loaded ${recoveryData.length} boss timers from MongoDB`);
      }
    } catch (mongoError) {
      console.warn(`⚠️ MongoDB unavailable for boss timers: ${mongoError.message}`);
    }

    // Fallback to Sheets if MongoDB failed or empty
    if (recoveryData.length === 0) {
      const response = await state.sheetAPI.call('getBossTimerRecovery', {});
      recoveryData = response?.data || [];
      source = 'Google Sheets';
      console.log(`✅ Loaded ${recoveryData.length} boss timers from Google Sheets (fallback)`);
    }

    let rescheduled = 0;
    const now = new Date();

    for (const entry of recoveryData) {
      try {
        let nextSpawn = new Date(entry.nextSpawnTime);

        // Skip invalid dates
        if (!nextSpawn || isNaN(nextSpawn.getTime())) {
          console.error(`❌ Invalid nextSpawnTime for ${entry.bossName}: ${entry.nextSpawnTime}`);
          continue;
        }

        // Parse killTime (may be null/invalid for directly set spawns)
        let killTime = null;
        if (entry.lastKillTime) {
          const parsed = new Date(entry.lastKillTime);
          if (!isNaN(parsed.getTime())) {
            killTime = parsed;
          }
        }

        // If spawn already passed, recalculate to find next future spawn
        if (nextSpawn < now) {
          const { getBossType } = require('./spawn-tracking');
          const bossType = getBossType(entry.bossName);
          if (bossType === 'timer' && killTime) {
            const result = calculateNextSpawn(entry.bossName, killTime);
            nextSpawn = result.nextSpawn;
            console.log(`⏭️ ${entry.bossName}: Past spawn detected, fast-forwarded to ${formatGMT8(nextSpawn)}`);

            // Update sheet with new spawn time
            const { saveRecoveryData } = require('./spawn-tracking');
            saveRecoveryData(entry.bossName, killTime, nextSpawn, entry.killedBy || 'recovery');
          } else {
            console.log(`⏭️ Skipping past spawn: ${entry.bossName} (${formatGMT8(nextSpawn)})`);
            continue;
          }
        }

        // Reschedule timer
        const timerId = scheduleReminder(entry.bossName, nextSpawn);

        state.bossKillTimes.set(entry.bossName.toLowerCase(), {
          killTime,
          nextSpawn,
          timerId,
          killedBy: entry.killedBy || 'unknown'
        });

        rescheduled++;
      } catch (error) {
        console.error(`❌ Failed to reschedule ${entry.bossName}:`, error.message);
      }
    }

    // Schedule reminders for schedule-based bosses
    for (const [bossName, bossConfig] of Object.entries(state.bossSpawnConfig.scheduleBasedBosses)) {
      if (bossName.startsWith('_')) continue;

      // Clear existing timer if present (prevents duplicates)
      const existing = state.scheduledBossTimers.get(bossName.toLowerCase());
      if (existing && existing.timerId) {
        clearTimeout(existing.timerId);
        console.log(`🔄 Cleared existing timer for scheduled boss: ${bossName}`);
      }

      const nextSpawn = findNextScheduledTime(bossConfig.schedules);
      if (nextSpawn && !isNaN(nextSpawn.getTime())) {
        const timerId = scheduleReminder(bossName, nextSpawn);

        state.scheduledBossTimers.set(bossName.toLowerCase(), {
          nextSpawn,
          timerId
        });
      } else {
        console.error(`❌ Invalid scheduled spawn time for ${bossName}`);
      }
    }

    console.log(`✅ Rescheduled ${rescheduled} boss timers from recovery data (source: ${source})`);
  } catch (error) {
    console.error('❌ Failed to load recovery data:', error.message);
    console.log('⚠️ Starting with empty timer cache');
  }
}

// ============================================================================
// EXPORTS
// ============================================================================
module.exports = {
  initialize,
  loadBossSpawnConfig,
  loadRecoveryAndReschedule,
  restoreServerDownState,
  saveServerDownState,
};
