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

  // Store remaining time for accurate display during pause
  if (state.auctionState.currentItem) {
    state.auctionState.currentItem.remainingTime = Math.max(0, state.auctionState.currentItem.endTime - Date.now());
  }

  clearAllAuctionTimers();
  state.logger.info(`${EMOJI.PAUSE} Session paused`);

  if (state.cfg && state.cfg.sheet_webhook_url) {
    saveAuctionState(state.cfg.sheet_webhook_url).catch(err => console.error('Failed to save auction state on pause:', err.message));
  }

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
  state.auctionState.currentItem.endTime += pausedDuration;

  // Clean up remainingTime field after resume
  if (state.auctionState.currentItem) {
    delete state.auctionState.currentItem.remainingTime;
  }

  scheduleItemTimers(client, config, channel);
  state.logger.info(`${EMOJI.PLAY} Session resumed`);
  return true;
}

module.exports = {
  pauseSession,
  resumeSession,
};
