/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                AUCTIONEERING MODULE - Main Entry Point                   ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Wires together all auctioneering sub-modules and re-exports the complete
 * public API. This is the only file that external modules should import.
 *
 * @module modules/auctioneering/index
 */

const { setPostToSheet, getPostToSheet } = require('./state');
const { initialize, clearAllAuctionTimers } = require('./utilities');
const { startAuctioneering } = require('./session-lifecycle');
const { auctionNextItem } = require('./item-auction');
const { itemEnd, finalizeSession, buildCombinedResults } = require('./item-completion');
const { pauseSession, resumeSession } = require('./pause-resume');
const {
  stopCurrentItem,
  extendCurrentItem,
  clearAllTimers,
  safelyClearItemTimers,
  rescheduleItemTimers,
  getAuctionState,
} = require('./admin-controls');
const {
  handleQueueList,
  handleCancelItem,
  handleSkipItem,
  handleForceSubmitResults,
  updateCurrentItemState,
  endAuctionSession,
  handleMoveToDistribution,
} = require('./commands');
const {
  startSession2,
  scheduleSession2AfterCompletion,
  scheduleWeeklySundayAuction,
  schedulePreAuctionSync,
  resetSessionState,
} = require('./scheduled-automation');

// Re-export all 25 functions matching the original module.exports
module.exports = {
  initialize,
  itemEnd,
  startAuctioneering,
  auctionNextItem,
  endAuctionSession,
  getAuctionState,
  setPostToSheet,
  getPostToSheet,
  pauseSession,
  resumeSession,
  stopCurrentItem,
  extendCurrentItem,
  updateCurrentItemState,
  rescheduleItemTimers,
  safelyClearItemTimers,
  handleQueueList,
  handleCancelItem,
  handleSkipItem,
  handleForceSubmitResults,
  handleMoveToDistribution,
  scheduleWeeklySundayAuction,
  schedulePreAuctionSync,
  resetSessionState,

  // Internal utilities (not in original exports, but useful for testing)
  clearAllAuctionTimers,
  clearAllTimers,
  finalizeSession,
  buildCombinedResults,
  startSession2,
  scheduleSession2AfterCompletion,
};
