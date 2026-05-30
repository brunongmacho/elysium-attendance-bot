/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║         AUCTIONEERING PAUSE/RESUME - Session Pause Controls              ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Pause/resume session controls.
 *
 * @module modules/auctioneering/pause-resume
 */

const { state } = require('./state');
const { EMOJI } = require('./constants');
const { clearAllAuctionTimers } = require('./utilities');
const { saveAuctionState } = require('./persistence');
const { scheduleItemTimers } = require('./timer-mgmt');

/**
 * Pauses the current auction session.
 *
 * @returns {boolean} True if successfully paused, false if not active or already paused
 */
function pauseSession() {
  if (!state.auctionState.active || state.auctionState.paused) return false;
  state.auctionState.paused = true;
  state.auctionState.pausedTime = Date.now();

  // Store remaining time for ALL active items
  const now = Date.now();
  state.auctionState.currentItemEndTimes = {};
  if (state.auctionState.currentItem) {
    state.auctionState.currentItem.remainingTime = Math.max(0, state.auctionState.currentItem.endTime - now);
    state.auctionState.currentItemEndTimes['_current'] = state.auctionState.currentItem.endTime;
  }
  // Save ALL thread items' endTimes for pause restore
  if (state.auctionState.threadItems) {
    Object.entries(state.auctionState.threadItems).forEach(([tid, item]) => {
      if (item) {
        item.remainingTime = Math.max(0, item.endTime - now);
        state.auctionState.currentItemEndTimes[tid] = item.endTime;
      }
    });
  }

  clearAllAuctionTimers();
  state.logger.info(`${EMOJI.PAUSE} Session paused`);

  saveAuctionState().catch(err => state.logger.error('Failed to save auction state on pause:', err.message));

  return true;
}

/**
 * Resumes a paused auction session.
 *
 * @param {Discord.Client} client - Discord bot client
 * @param {Object} config - Bot configuration
 * @param {Discord.ThreadChannel} channel - Auction thread channel
 * @returns {boolean} True if successfully resumed, false if not active or not paused
 */
function resumeSession(client, config, channel) {
  if (!state.auctionState.active || !state.auctionState.paused) return false;
  state.auctionState.paused = false;

  const pausedDuration = Date.now() - state.auctionState.pausedTime;

  // Adjust endTime for ALL items
  if (state.auctionState.currentItem) {
    state.auctionState.currentItem.endTime += pausedDuration;
    delete state.auctionState.currentItem.remainingTime;
    // Schedule timers for currentItem's thread
    if (state.auctionState.currentItem.thread) {
      scheduleItemTimers(client, config, state.auctionState.currentItem.thread);
    } else {
      scheduleItemTimers(client, config, channel);
    }
  }

  // Adjust endTime and schedule timers for ALL parallel thread items
  if (state.auctionState.threadItems) {
    Object.entries(state.auctionState.threadItems).forEach(([tid, item]) => {
      if (item && item !== state.auctionState.currentItem) {
        item.endTime += pausedDuration;
        delete item.remainingTime;
        if (item.thread) {
          scheduleItemTimers(client, config, item.thread);
        }
      }
    });
  }

  state.logger.info(`${EMOJI.PLAY} Session resumed`);
  return true;
}

module.exports = {
  pauseSession,
  resumeSession,
};
