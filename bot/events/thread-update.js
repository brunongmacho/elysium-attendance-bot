/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                    THREAD UPDATE EVENT HANDLER                           ║
 * ║  Detects manual archiving through Discord UI and cleans up state         ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * @file bot/events/thread-update.js
 * @description Extracted from index2.js ThreadUpdate event handler.
 *              Detects when attendance spawn threads are manually archived
 *              via the Discord UI and cleans up rotation warnings, active
 *              state, and confirmation messages.
 *
 * @dependencies
 * - discord.js (Events)
 * - utils/logger
 * - utils/common (normalizeTimestamp)
 *
 * @usage
 *   const { createThreadUpdateHandler } = require('./bot/events/thread-update');
 *   client.on(Events.ThreadUpdate, createThreadUpdateHandler(client, config, {
 *     stateManager, bossRotation, attendance, normalizeTimestamp,
 *   }));
 */

const { Events } = require("discord.js");
const { createLogger } = require('../../utils/logger');
const logger = createLogger('thread-update');

/**
 * Creates a handler for Discord ThreadUpdate events.
 *
 * When a spawn thread is manually archived via the Discord UI, this handler:
 * 1. Cleans up rotation warning messages
 * 2. Removes the spawn from active state
 * 3. Clears confirmation messages
 *
 * @param {import('discord.js').Client} client - Discord Client
 * @param {Object} config - Bot configuration
 * @param {Object} modules - Additional dependencies
 * @param {Object} modules.stateManager - Global state manager
 * @param {Object} modules.bossRotation - Boss rotation system
 * @param {Object} modules.attendance - Attendance module
 * @param {Function} modules.normalizeTimestamp - Timestamp normalization function
 * @returns {Function} Async handler function (oldThread, newThread) => Promise<void>
 */
function createThreadUpdateHandler(client, config, modules) {
  const {
    stateManager,
    bossRotation,
    attendance,
    normalizeTimestamp,
  } = modules;

  return async (oldThread, newThread) => {
    try {
      // Only process if thread was archived
      if (!oldThread.archived && newThread.archived) {
        // Check if this is an attendance thread in our active spawns
        const spawnInfo = stateManager.activeSpawns[newThread.id];

        if (spawnInfo) {
          console.log(`🔔 Thread manually archived: ${spawnInfo.boss} (${spawnInfo.timestamp})`);

          // Delete rotation warning message (prevent channel flooding)
          await bossRotation.deleteRotationWarning(spawnInfo.boss);
          await bossRotation.checkAndDeleteDailySchedule(spawnInfo.boss);
          console.log(`🗑️ Cleaned up rotation warning for ${spawnInfo.boss}`);

          // Clean up spawn from active state
          delete stateManager.activeSpawns[newThread.id];
          const cacheKey = `${spawnInfo.boss.toUpperCase()}|${normalizeTimestamp(spawnInfo.timestamp)}`;
          delete stateManager.activeColumns[cacheKey];
          delete stateManager.confirmationMessages[newThread.id];

          attendance.setActiveSpawns(stateManager.activeSpawns);
          attendance.setActiveColumns(stateManager.activeColumns);
          attendance.setConfirmationMessages(stateManager.confirmationMessages);

          console.log(`✅ Cleaned up manually archived thread: ${spawnInfo.boss}`);
        }
      }
    } catch (error) {
      console.error('❌ Error handling thread update:', error.message);
    }
  };
}

module.exports = { createThreadUpdateHandler };
