/**
 * ============================================================================
 * CRASH RECOVERY SYSTEM
 * ============================================================================
 *
 * Comprehensive crash recovery for all bot features that need state persistence.
 * Ensures the bot can recover seamlessly from crashes, restarts, and unexpected
 * shutdowns without losing critical state.
 *
 * FEATURES:
 * - Auction timer recovery (preview, countdown, item end timers)
 * - Event reminder recovery enhancement
 * - Leaderboard weekly report recovery
 * - Maintenance scheduler task recovery
 * - Auto-sheet creation for recovery data
 *
 * RECOVERY SHEETS:
 * - _RecoveryState: Main recovery state (auction timers, report schedules)
 * - EventReminders: Already exists (event reminder messages)
 * - MilestoneQueue: Already exists (proactive intelligence)
 *
 * @module utils/crash-recovery
 */

const { SheetAPI } = require('./sheet-api');

// ============================================================================
// MODULE STATE
// ============================================================================

let sheetAPI = null;
let config = null;
let client = null;

// Recovery state tracking
let recoveryState = {
  auction: {
    active: false,
    endTime: null,
    pausedTime: null,
    timers: {
      previewEnd: null,
      go1: null,
      go2: null,
      go3: null,
      itemEnd: null,
    },
    currentItemIndex: 0,
    lastSaved: null,
  },
  leaderboard: {
    lastWeeklyReport: null,
    nextWeeklyReport: null,
    lastSaved: null,
  },
  scheduler: {
    tasks: {},
    lastSaved: null,
  },
};

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize crash recovery system
 * @param {Discord.Client} discordClient - Discord bot client
 * @param {Object} botConfig - Bot configuration
 * @returns {Promise<void>}
 */
async function initialize(discordClient, botConfig) {
  client = discordClient;
  config = botConfig;
  sheetAPI = new SheetAPI(botConfig.sheet_webhook_url);

  console.log('🔄 [CRASH RECOVERY] Initializing crash recovery system...');

  try {
    // Ensure recovery sheet exists
    await ensureRecoverySheetExists();

    // Load existing recovery state
    await loadRecoveryState();

    console.log('✅ [CRASH RECOVERY] System initialized');
  } catch (error) {
    console.error('⚠️ [CRASH RECOVERY] Failed to initialize:', error.message);
    // Don't throw - allow bot to start even if recovery fails
  }
}

// ============================================================================
// GOOGLE SHEETS AUTO-CREATION
// ============================================================================

/**
 * Ensures the _RecoveryState sheet exists, creates if missing
 * @returns {Promise<void>}
 */
async function ensureRecoverySheetExists() {
  try {
    console.log('🔍 [CRASH RECOVERY] Checking if _RecoveryState sheet exists...');

    const response = await sheetAPI.call('ensureRecoverySheet', {});

    if (response.created) {
      console.log('✅ [CRASH RECOVERY] Created _RecoveryState sheet');
    } else if (response.exists) {
      console.log('✅ [CRASH RECOVERY] _RecoveryState sheet already exists');
    }
  } catch (error) {
    console.error('❌ [CRASH RECOVERY] Failed to ensure recovery sheet exists:', error.message);
    throw error;
  }
}

// ============================================================================
// AUCTION TIMER RECOVERY
// ============================================================================

/**
 * Save auction recovery state to Google Sheets
 * @param {Object} auctionState - Current auction state from auctioneering.js
 * @returns {Promise<void>}
 */
async function saveAuctionRecoveryState(auctionState) {
  try {
    const currentItem = auctionState.currentItem;

    recoveryState.auction = {
      active: auctionState.active,
      endTime: currentItem?.endTime || null,
      pausedTime: auctionState.pausedTime || null,
      timers: {
        previewEnd: null, // Will be calculated on recovery
        go1: currentItem?.go1 ? null : currentItem?.endTime - 60000,
        go2: currentItem?.go2 ? null : currentItem?.endTime - 30000,
        go3: currentItem?.go3 ? null : currentItem?.endTime - 10000,
        itemEnd: currentItem?.endTime || null,
      },
      currentItemIndex: auctionState.currentItemIndex || 0,
      paused: auctionState.paused || false,
      lastSaved: Date.now(),
    };

    await sheetAPI.call('saveRecoveryState', {
      category: 'auction',
      state: recoveryState.auction,
    }, { silent: true });

    console.log('💾 [CRASH RECOVERY] Saved auction state');
  } catch (error) {
    console.error('⚠️ [CRASH RECOVERY] Failed to save auction state:', error.message);
  }
}

/**
 * Load and restore auction timers from recovery state
 * @param {Object} auctionModule - Reference to auctioneering module
 * @returns {Promise<boolean>} True if recovery was attempted, false if no state to recover
 */
async function recoverAuctionState(auctionModule) {
  try {
    if (!recoveryState.auction.active || !recoveryState.auction.endTime) {
      console.log('ℹ️ [CRASH RECOVERY] No active auction to recover');
      return false;
    }

    const now = Date.now();
    const endTime = recoveryState.auction.endTime;

    // Check if auction has already ended
    if (now >= endTime) {
      console.log('⏭️ [CRASH RECOVERY] Auction already ended, clearing state');
      await clearAuctionRecoveryState();
      return false;
    }

    // Check if auction is paused
    if (recoveryState.auction.paused) {
      console.log('⏸️ [CRASH RECOVERY] Auction was paused, restoring paused state');
      // Let the auction module handle paused state
      return true;
    }

    console.log('🔄 [CRASH RECOVERY] Attempting to recover active auction timers');

    // Calculate remaining times
    const timeRemaining = endTime - now;
    const timeTo60s = recoveryState.auction.timers.go1 ? recoveryState.auction.timers.go1 - now : null;
    const timeTo30s = recoveryState.auction.timers.go2 ? recoveryState.auction.timers.go2 - now : null;
    const timeTo10s = recoveryState.auction.timers.go3 ? recoveryState.auction.timers.go3 - now : null;

    console.log(`⏱️ [CRASH RECOVERY] Time remaining: ${Math.floor(timeRemaining / 1000)}s`);

    if (timeTo60s && timeTo60s > 0) {
      console.log(`  📅 GOING ONCE (60s) in ${Math.floor(timeTo60s / 1000)}s`);
    }
    if (timeTo30s && timeTo30s > 0) {
      console.log(`  📅 GOING TWICE (30s) in ${Math.floor(timeTo30s / 1000)}s`);
    }
    if (timeTo10s && timeTo10s > 0) {
      console.log(`  📅 FINAL CALL (10s) in ${Math.floor(timeTo10s / 1000)}s`);
    }

    // Return true to signal auction module to handle recovery
    // The actual timer rescheduling should be done by the auction module
    return true;

  } catch (error) {
    console.error('❌ [CRASH RECOVERY] Failed to recover auction state:', error.message);
    return false;
  }
}

/**
 * Clear auction recovery state
 * @returns {Promise<void>}
 */
async function clearAuctionRecoveryState() {
  try {
    recoveryState.auction = {
      active: false,
      endTime: null,
      pausedTime: null,
      timers: {
        previewEnd: null,
        go1: null,
        go2: null,
        go3: null,
        itemEnd: null,
      },
      currentItemIndex: 0,
      paused: false,
      lastSaved: Date.now(),
    };

    await sheetAPI.call('saveRecoveryState', {
      category: 'auction',
      state: recoveryState.auction,
    }, { silent: true });

    console.log('🗑️ [CRASH RECOVERY] Cleared auction state');
  } catch (error) {
    console.error('⚠️ [CRASH RECOVERY] Failed to clear auction state:', error.message);
  }
}

// ============================================================================
// LEADERBOARD WEEKLY REPORT RECOVERY
// ============================================================================

/**
 * Save leaderboard weekly report schedule to recovery state
 * @param {Date} nextReportTime - Next scheduled report time
 * @returns {Promise<void>}
 */
async function saveLeaderboardReportSchedule(nextReportTime) {
  try {
    recoveryState.leaderboard = {
      lastWeeklyReport: recoveryState.leaderboard.lastWeeklyReport || null,
      nextWeeklyReport: nextReportTime.getTime(),
      lastSaved: Date.now(),
    };

    await sheetAPI.call('saveRecoveryState', {
      category: 'leaderboard',
      state: recoveryState.leaderboard,
    }, { silent: true });

    console.log('💾 [CRASH RECOVERY] Saved leaderboard report schedule');
  } catch (error) {
    console.error('⚠️ [CRASH RECOVERY] Failed to save leaderboard schedule:', error.message);
  }
}

/**
 * Mark weekly report as completed
 * @returns {Promise<void>}
 */
async function markWeeklyReportCompleted() {
  try {
    recoveryState.leaderboard.lastWeeklyReport = Date.now();
    recoveryState.leaderboard.lastSaved = Date.now();

    await sheetAPI.call('saveRecoveryState', {
      category: 'leaderboard',
      state: recoveryState.leaderboard,
    }, { silent: true });

    console.log('✅ [CRASH RECOVERY] Marked weekly report as completed');
  } catch (error) {
    console.error('⚠️ [CRASH RECOVERY] Failed to mark weekly report:', error.message);
  }
}

/**
 * Check if weekly report was missed during downtime
 * @returns {Promise<boolean>} True if report was missed and should be sent
 */
async function checkMissedWeeklyReport() {
  try {
    if (!recoveryState.leaderboard.nextWeeklyReport) {
      return false;
    }

    const now = Date.now();
    const scheduledTime = recoveryState.leaderboard.nextWeeklyReport;
    const lastReport = recoveryState.leaderboard.lastWeeklyReport || 0;

    // If scheduled time has passed and no report was sent after that time
    if (now > scheduledTime && lastReport < scheduledTime) {
      const missedBy = now - scheduledTime;
      const missedByHours = Math.floor(missedBy / 1000 / 60 / 60);

      console.log(`⚠️ [CRASH RECOVERY] Missed weekly report by ${missedByHours} hours`);

      // Only send if missed by less than 24 hours (otherwise skip to next week)
      if (missedByHours < 24) {
        console.log('📊 [CRASH RECOVERY] Sending missed weekly report now');
        return true;
      } else {
        console.log('⏭️ [CRASH RECOVERY] Skipping missed report (too old), will wait for next scheduled report');
        // Mark as completed to prevent repeated attempts
        await markWeeklyReportCompleted();
        return false;
      }
    }

    return false;
  } catch (error) {
    console.error('❌ [CRASH RECOVERY] Failed to check missed weekly report:', error.message);
    return false;
  }
}

// ============================================================================
// MAINTENANCE SCHEDULER TASK RECOVERY
// ============================================================================

/**
 * Save scheduler task execution time
 * @param {string} taskName - Name of the task
 * @param {number} lastRun - Last execution timestamp
 * @returns {Promise<void>}
 */
async function saveSchedulerTaskExecution(taskName, lastRun) {
  try {
    if (!recoveryState.scheduler.tasks) {
      recoveryState.scheduler.tasks = {};
    }

    recoveryState.scheduler.tasks[taskName] = {
      lastRun: lastRun || Date.now(),
      lastSaved: Date.now(),
    };

    recoveryState.scheduler.lastSaved = Date.now();

    await sheetAPI.call('saveRecoveryState', {
      category: 'scheduler',
      state: recoveryState.scheduler,
    }, { silent: true });

    console.log(`💾 [CRASH RECOVERY] Saved scheduler task: ${taskName}`);
  } catch (error) {
    console.error(`⚠️ [CRASH RECOVERY] Failed to save scheduler task ${taskName}:`, error.message);
  }
}

/**
 * Get last execution time for a scheduler task
 * @param {string} taskName - Name of the task
 * @returns {number|null} Last execution timestamp or null if never run
 */
function getSchedulerTaskLastRun(taskName) {
  return recoveryState.scheduler.tasks?.[taskName]?.lastRun || null;
}

/**
 * Check if a scheduler task should run immediately after recovery
 * @param {string} taskName - Name of the task
 * @param {number} interval - Task interval in milliseconds
 * @returns {boolean} True if task should run now
 */
function shouldSchedulerTaskRunNow(taskName, interval) {
  const lastRun = getSchedulerTaskLastRun(taskName);

  if (!lastRun) {
    // Never run before, should run now
    return true;
  }

  const now = Date.now();
  const timeSinceLastRun = now - lastRun;

  // If more than interval has passed, should run now
  if (timeSinceLastRun >= interval) {
    const missedBy = timeSinceLastRun - interval;
    const missedByMinutes = Math.floor(missedBy / 1000 / 60);

    console.log(`⚠️ [CRASH RECOVERY] Task ${taskName} missed by ${missedByMinutes} minutes`);
    return true;
  }

  return false;
}

// ============================================================================
// GENERAL RECOVERY STATE MANAGEMENT
// ============================================================================

/**
 * Load all recovery state from Google Sheets
 * @returns {Promise<void>}
 */
async function loadRecoveryState() {
  try {
    console.log('📥 [CRASH RECOVERY] Loading recovery state from Google Sheets...');

    const response = await sheetAPI.call('loadRecoveryState', {});

    if (response?.state) {
      // Load auction state
      if (response.state.auction) {
        recoveryState.auction = response.state.auction;
        console.log(`✅ [CRASH RECOVERY] Loaded auction state (active: ${recoveryState.auction.active})`);
      }

      // Load leaderboard state
      if (response.state.leaderboard) {
        recoveryState.leaderboard = response.state.leaderboard;
        console.log(`✅ [CRASH RECOVERY] Loaded leaderboard state`);
      }

      // Load scheduler state
      if (response.state.scheduler) {
        recoveryState.scheduler = response.state.scheduler;
        const taskCount = Object.keys(recoveryState.scheduler.tasks || {}).length;
        console.log(`✅ [CRASH RECOVERY] Loaded scheduler state (${taskCount} tasks)`);
      }

      console.log('✅ [CRASH RECOVERY] All recovery state loaded');
    } else {
      console.log('✅ [CRASH RECOVERY] No recovery state found (starting fresh)');
    }
  } catch (error) {
    console.error('⚠️ [CRASH RECOVERY] Failed to load recovery state:', error.message);
  }
}

/**
 * Get current recovery state (for diagnostics)
 * @returns {Object} Current recovery state
 */
function getRecoveryState() {
  return {
    auction: { ...recoveryState.auction },
    leaderboard: { ...recoveryState.leaderboard },
    scheduler: {
      ...recoveryState.scheduler,
      tasks: { ...recoveryState.scheduler.tasks },
    },
  };
}

/**
 * Get recovery statistics (for !diagnostics command)
 * @returns {Object} Recovery stats
 */
function getRecoveryStats() {
  return {
    auctionRecoveryActive: recoveryState.auction.active,
    auctionLastSaved: recoveryState.auction.lastSaved,
    leaderboardNextReport: recoveryState.leaderboard.nextWeeklyReport,
    leaderboardLastReport: recoveryState.leaderboard.lastWeeklyReport,
    schedulerTasks: Object.keys(recoveryState.scheduler.tasks || {}).length,
    schedulerLastSaved: recoveryState.scheduler.lastSaved,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // Initialization
  initialize,
  ensureRecoverySheetExists,

  // Auction recovery
  saveAuctionRecoveryState,
  recoverAuctionState,
  clearAuctionRecoveryState,

  // Leaderboard recovery
  saveLeaderboardReportSchedule,
  markWeeklyReportCompleted,
  checkMissedWeeklyReport,

  // Scheduler recovery
  saveSchedulerTaskExecution,
  getSchedulerTaskLastRun,
  shouldSchedulerTaskRunNow,

  // State management
  loadRecoveryState,
  getRecoveryState,
  getRecoveryStats,
};
