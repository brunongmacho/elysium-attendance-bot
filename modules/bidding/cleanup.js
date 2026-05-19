/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                    MEMORY LEAK PREVENTION - Automatic Cleanup System      ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Periodic cleanup schedules to prevent memory leaks from orphaned
 * confirmations, stuck locked points, and unbounded state growth.
 *
 * @module modules/bidding/cleanup
 */

const state = require('./state');
const { TIMEOUTS } = require('./constants');
const { save } = require('./persistence');

// ═══════════════════════════════════════════════════════════════════════════
// CLEANUP FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Cleans up stale pending bid confirmations (prevents memory leaks)
 *
 * CLEANUP LOGIC:
 * - Scans all pending confirmations (st.pc)
 * - Identifies confirmations older than 60 seconds
 * - Clears associated timers (confirmation timeout + countdown interval)
 * - Removes stale confirmation from state
 * - Persists cleaned state
 *
 * MEMORY LEAK PREVENTION:
 * - Without cleanup, failed/orphaned confirmations accumulate
 * - Timers continue running indefinitely
 * - State object grows unbounded
 * - Bot memory usage increases over time
 *
 * TRIGGERS:
 * - Automatically called every 2 minutes via startCleanupSchedule
 * - Can be called manually for immediate cleanup
 *
 * SAFETY:
 * - Only removes confirmations older than 60 seconds (safety threshold)
 * - Logs cleanup activity for monitoring
 * - Non-blocking operation
 */
function cleanupPendingConfirmations() {
  const now = Date.now();

  let cleaned = 0;
  Object.keys(state.st.pc).forEach((msgId) => {
    const pending = state.st.pc[msgId];

    // Check if confirmation is older than timeout
    if (
      pending.timestamp &&
      now - pending.timestamp > TIMEOUTS.STALE_CONFIRMATION
    ) {
      // Clear associated timer if exists
      if (state.st.th[`c_${msgId}`]) {
        clearTimeout(state.st.th[`c_${msgId}`]);
        delete state.st.th[`c_${msgId}`];
      }

      // Clear countdown interval if exists
      if (state.st.th[`countdown_${msgId}`]) {
        clearInterval(state.st.th[`countdown_${msgId}`]);
        delete state.st.th[`countdown_${msgId}`];
      }

      // Remove pending confirmation
      delete state.st.pc[msgId];
      cleaned++;
    }
  });

  if (cleaned > 0) {
    state.logger.info(`🧹 Cleaned up ${cleaned} stale pending confirmation(s)`);
    save();
  }
}

/**
 * Prunes stuck locked points that should have been released (v6.2 optimization)
 *
 * CLEANUP LOGIC:
 * - Checks if any auction is currently active
 * - If no active auction and locked points exist, they're likely stuck
 * - Logs warning for manual review
 * - Does NOT auto-clear (requires manual !fixlockedpoints command for safety)
 *
 * MEMORY MANAGEMENT:
 * - Prevents locked points from accumulating indefinitely
 * - Detects orphaned locks from crashed auctions
 * - Provides visibility into potential issues
 *
 * SAFETY:
 * - Only reports issues, doesn't auto-fix
 * - Admin must manually clear using !fixlockedpoints
 * - Prevents accidental point loss
 *
 * @returns {Object} Pruning statistics
 */
function checkLockedPoints() {
  const lockedCount = Object.keys(state.st.lp).length;
  const totalLocked = Object.values(state.st.lp).reduce((sum, pts) => sum + pts, 0);

  // Check if there's an active auction
  const hasActiveAuction = state.st.a && state.st.a.status === 'active';

  // Check auctioneering module too
  let auctioneeringActive = false;
  try {
    auctioneeringActive = state.auctioneering && state.auctioneering.getAuctionState().active;
  } catch (e) {
    // Auctioneering module might not be loaded yet
  }

  const anyActiveAuction = hasActiveAuction || auctioneeringActive;

  // Report stuck points if no auction is running
  if (lockedCount > 0 && !anyActiveAuction) {
    state.logger.info(
      `⚠️ MEMORY WARNING: ${lockedCount} members have ${totalLocked}pts locked but no auction is active. ` +
      `Run !fixlockedpoints to clear.`
    );
    return { stuck: true, count: lockedCount, total: totalLocked };
  }

  return { stuck: false, count: lockedCount, total: totalLocked };
}

/**
 * Get memory usage statistics (v6.2 monitoring)
 *
 * METRICS:
 * - Heap memory usage (used, total, limit)
 * - State object sizes (pending confirmations, locked points, history)
 * - Cache status
 *
 * @returns {Object} Memory statistics
 */
function getMemoryStats() {
  const mem = process.memoryUsage();
  const memMB = {
    rss: Math.round(mem.rss / 1024 / 1024),
    heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
    heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
    external: Math.round(mem.external / 1024 / 1024),
  };

  return {
    memory: memMB,
    state: {
      pendingConfirmations: Object.keys(state.st.pc || {}).length,
      lockedPointsMembers: Object.keys(state.st.lp || {}).length,
      lockedPointsTotal: Object.values(state.st.lp || {}).reduce((sum, pts) => sum + pts, 0),
      historySize: (state.st.h || []).length,
      queueSize: (state.st.q || []).length,
      cacheSize: state.st.cp ? state.st.cp.size() : 0,
    }
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// CLEANUP SCHEDULE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Starts periodic cleanup schedule for pending confirmations and memory checks
 *
 * SCHEDULE:
 * - Runs cleanupPendingConfirmations every 2 minutes
 * - Runs checkLockedPoints every 5 minutes
 * - Logs memory stats every 30 minutes
 * - Continues indefinitely until bot restart
 * - Prevents multiple schedules (checks if already running)
 *
 * INITIALIZATION:
 * - Called automatically by initializeBidding
 * - Should only be called once during bot startup
 */
function startCleanupSchedule() {
  // Check if any intervals are already running
  if (!state.cleanupIntervals.pendingConfirmations && !state.cleanupIntervals.lockedPoints && !state.cleanupIntervals.memoryStats) {
    // Main cleanup: every 2 minutes
    state.cleanupIntervals.pendingConfirmations = setInterval(() => {
      cleanupPendingConfirmations();
    }, 120000); // 2 minutes

    // Locked points check: every 5 minutes
    state.cleanupIntervals.lockedPoints = setInterval(() => {
      checkLockedPoints();
    }, 300000); // 5 minutes

    // Memory stats: every 30 minutes
    state.cleanupIntervals.memoryStats = setInterval(() => {
      const stats = getMemoryStats();
      state.logger.info(`📊 Memory: ${stats.memory.heapUsed}MB / ${stats.memory.heapTotal}MB heap, ` +
                  `${stats.state.pendingConfirmations} pending, ` +
                  `${stats.state.lockedPointsMembers} locked, ` +
                  `${stats.state.historySize} history`);
    }, 1800000); // 30 minutes

    state.logger.info("🧹 Started cleanup schedule (confirmations, locked points, memory monitoring)");
  }
}

/**
 * Stops all cleanup intervals (Bug #5 fix - cleanup function)
 * Used for testing or graceful shutdown
 */
function stopCleanupSchedule() {
  if (state.cleanupIntervals.pendingConfirmations) {
    clearInterval(state.cleanupIntervals.pendingConfirmations);
    state.cleanupIntervals.pendingConfirmations = null;
  }
  if (state.cleanupIntervals.lockedPoints) {
    clearInterval(state.cleanupIntervals.lockedPoints);
    state.cleanupIntervals.lockedPoints = null;
  }
  if (state.cleanupIntervals.memoryStats) {
    clearInterval(state.cleanupIntervals.memoryStats);
    state.cleanupIntervals.memoryStats = null;
  }
  state.logger.info("⏹️ Stopped all cleanup schedules");
}

module.exports = {
  cleanupPendingConfirmations,
  checkLockedPoints,
  getMemoryStats,
  startCleanupSchedule,
  stopCleanupSchedule,
};
