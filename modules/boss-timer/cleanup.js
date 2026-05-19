/**
 * Cleanup utilities for the boss timer system.
 * Extracts the repeated parallel delete pattern into a reusable function.
 */

const mongoHelpers = require('../../utils/mongodb-helpers');
const state = require('./state');

// ============================================================================
// REUSABLE PARALLEL DELETE PATTERN
// ============================================================================

/**
 * Delete boss timer recovery data from both MongoDB and Google Sheets in parallel.
 * Succeeds if at least one source succeeds.
 *
 * @param {string} bossName - Boss name
 * @param {string} context - Log context (e.g., 'cancelled via !unkill', 'server down mode')
 * @returns {Promise<void>}
 */
async function deleteRecoveryData(bossName, context) {
  try {
    const mongoDeletePromise = (async () => {
      try {
        await mongoHelpers.deleteBossTimer(bossName);
        return { success: true };
      } catch (error) {
        console.error(`❌ MongoDB delete failed for ${bossName}:`, error.message);
        return { success: false };
      }
    })();

    const sheetDeletePromise = (async () => {
      try {
        await state.sheetAPI.call('deleteBossTimerRecovery', { bossName });
        return { success: true };
      } catch (error) {
        console.error(`❌ Sheets delete failed for ${bossName}:`, error.message);
        return { success: false };
      }
    })();

    const [mongoResult, sheetResult] = await Promise.all([
      mongoDeletePromise,
      sheetDeletePromise
    ]);

    const sources = [];
    if (mongoResult.success) sources.push('MongoDB');
    if (sheetResult.success) sources.push('Sheets');

    if (sources.length > 0) {
      console.log(`🗑️ Deleted recovery data for ${bossName} (${sources.join(' + ')}) - ${context}`);
    } else {
      console.warn(`⚠️ Failed to delete recovery data for ${bossName} from both sources`);
    }
  } catch (error) {
    console.error(`⚠️ Failed to delete recovery data for ${bossName}:`, error.message);
  }
}

// ============================================================================
// CLEAR ALL TIMER-BASED BOSSES
// ============================================================================

/**
 * Clear all timer-based boss recovery data from both MongoDB and Google Sheets.
 * Used by maintenance and clearKills commands.
 *
 * @returns {Promise<void>}
 */
async function clearAllTimerRecoveryData() {
  try {
    const mongoDeletePromise = (async () => {
      try {
        for (const bossName of Object.keys(state.bossSpawnConfig.timerBasedBosses)) {
          if (!bossName.startsWith('_')) {
            await mongoHelpers.deleteBossTimer(bossName);
          }
        }
        return { success: true, source: 'MongoDB' };
      } catch (error) {
        console.error(`❌ MongoDB clear failed:`, error.message);
        return { success: false, source: 'MongoDB' };
      }
    })();

    const sheetDeletePromise = (async () => {
      try {
        await state.sheetAPI.call('clearBossTimerRecovery', { type: 'timer-based' });
        return { success: true, source: 'Sheets' };
      } catch (error) {
        console.error(`❌ Sheets clear failed:`, error.message);
        return { success: false, source: 'Sheets' };
      }
    })();

    const [mongoResult, sheetResult] = await Promise.all([
      mongoDeletePromise,
      sheetDeletePromise
    ]);

    const sources = [];
    if (mongoResult.success) sources.push('MongoDB');
    if (sheetResult.success) sources.push('Sheets');

    if (sources.length > 0) {
      console.log(`💾 Cleared timer-based boss recovery data from ${sources.join(' + ')}`);
    } else {
      console.warn('⚠️ Failed to clear timer-based recovery data from both sources');
    }
  } catch (error) {
    console.error('⚠️ Failed to clear timer-based recovery data:', error.message);
  }
}

// ============================================================================
// CLEAR BOSS TIMER ON SPAWN (called by attendance module)
// ============================================================================

/**
 * Clear boss timer entry when thread is created (e.g., from external bot).
 * Called by attendance module when creating threads.
 *
 * @param {string} bossName - Boss name
 * @returns {Promise<void>}
 */
async function clearBossTimerOnSpawn(bossName) {
  const normalizedName = bossName.toLowerCase();
  const { getBossType } = require('./spawn-tracking');
  const bossType = getBossType(bossName);

  // Only clear timer-based bosses (scheduled bosses auto-reschedule)
  if (bossType === 'timer') {
    // Clear from in-memory cache
    state.bossKillTimes.delete(normalizedName);

    // Delete recovery data from MongoDB and Sheets
    await deleteRecoveryData(bossName, 'thread created');
  }
}

// ============================================================================
// EXPORTS
// ============================================================================
module.exports = {
  deleteRecoveryData,
  clearAllTimerRecoveryData,
  clearBossTimerOnSpawn,
};
