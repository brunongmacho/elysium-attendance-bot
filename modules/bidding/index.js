/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                    BIDDING MODULE - Main Entry Point                      ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Wires together all bidding sub-modules and re-exports the complete public
 * API. This is the only file that external modules should import.
 *
 * @module modules/bidding/index
 */

const state = require('./state');
const persistence = require('./persistence');
const pointsCache = require('./points-cache');
const lifecycle = require('./auction-lifecycle');
const commands = require('./commands');
const cleanup = require('./cleanup');

module.exports = {
  // ═════════════════════════════════════════════════════════════════════════
  // INITIALIZATION
  // ═════════════════════════════════════════════════════════════════════════
  initializeBidding: persistence.initializeBidding,
  startCleanupSchedule: cleanup.startCleanupSchedule,

  // ═════════════════════════════════════════════════════════════════════════
  // STATE MANAGEMENT
  // ═════════════════════════════════════════════════════════════════════════
  loadBiddingState: persistence.load,
  saveBiddingState: persistence.save,
  getBiddingState: () => state.st,
  loadBiddingStateFromSheet: persistence.loadBiddingStateFromSheet,
  saveBiddingStateToSheet: persistence.saveBiddingStateToSheet,

  // ═════════════════════════════════════════════════════════════════════════
  // COMMAND HANDLING
  // ═════════════════════════════════════════════════════════════════════════
  handleCommand: commands.handleCmd,

  // ═════════════════════════════════════════════════════════════════════════
  // POINTS MANAGEMENT
  // ═════════════════════════════════════════════════════════════════════════
  clearPointsCache: pointsCache.clearCache,
  stopCacheAutoRefresh: pointsCache.stopCacheAutoRefresh,

  // ═════════════════════════════════════════════════════════════════════════
  // SESSION MANAGEMENT
  // ═════════════════════════════════════════════════════════════════════════
  submitSessionTally: lifecycle.submitSessionTally,

  // ═════════════════════════════════════════════════════════════════════════
  // STATE RECOVERY
  // ═════════════════════════════════════════════════════════════════════════
  recoverBiddingState: persistence.recoverBiddingState,

  // ═════════════════════════════════════════════════════════════════════════
  // EMERGENCY FUNCTIONS
  // ═════════════════════════════════════════════════════════════════════════
  forceEndAuction: lifecycle.forceEndAuction,
  forceSaveState: persistence.forceSaveState,
};
