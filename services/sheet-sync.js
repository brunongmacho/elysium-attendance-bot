/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TENCHU GUILD BOT - Background Sheet Sync Service
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Background sync service: MongoDB → Google Sheets
 * Syncs changes without blocking user requests
 *
 * Features:
 * - Priority-based sync (immediate, high, normal, low)
 * - Queue-based with debouncing
 * - Automatic retry logic
 * - Error logging
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

const { SheetAPI } = require('../utils/sheet-api');  // Destructure from exports
const config = require('../config.json');
const adminAlerts = require('../utils/admin-alerts');

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const SYNC_PRIORITIES = {
  IMMEDIATE: 0,      // No delay - Critical operations:
                     // - Auction session end (bidding points tally)
                     // - Attendance thread close
                     // - Boss spawn timer
                     // - Point changes
  HIGH: 2000,        // 2 seconds (attendance records, bot state)
  NORMAL: 5000,      // 5 seconds (member updates, stats)
  LOW: 30000         // 30 seconds (non-critical background tasks)
};

const RETRY_CONFIG = {
  MAX_ATTEMPTS: 10,  // 10 attempts with exponential backoff
  BACKOFF_MS: 1000   // 1 second base backoff (grows to 30s max)
};

// ═══════════════════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════════════════

const syncQueues = {
  [SYNC_PRIORITIES.IMMEDIATE]: [],
  [SYNC_PRIORITIES.HIGH]: [],
  [SYNC_PRIORITIES.NORMAL]: [],
  [SYNC_PRIORITIES.LOW]: []
};

const syncTimers = {
  [SYNC_PRIORITIES.IMMEDIATE]: null,
  [SYNC_PRIORITIES.HIGH]: null,
  [SYNC_PRIORITIES.NORMAL]: null,
  [SYNC_PRIORITIES.LOW]: null
};

const stats = {
  totalSynced: 0,
  totalFailed: 0,
  lastSyncTime: null,
  byPriority: {
    [SYNC_PRIORITIES.IMMEDIATE]: { synced: 0, failed: 0 },
    [SYNC_PRIORITIES.HIGH]: { synced: 0, failed: 0 },
    [SYNC_PRIORITIES.NORMAL]: { synced: 0, failed: 0 },
    [SYNC_PRIORITIES.LOW]: { synced: 0, failed: 0 }
  }
};

let sheetAPI = null;

// ═══════════════════════════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════

function initialize() {
  if (!sheetAPI) {
    const webhookUrl = config.sheet_webhook_url;
    if (!webhookUrl) {
      console.error('❌ Sheet webhook URL not found in config.json');
      return false;
    }
    sheetAPI = new SheetAPI(webhookUrl);
    console.log('✅ Sheet sync service initialized');
  }
  return true;
}

// ═══════════════════════════════════════════════════════════════════════════
// QUEUE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Queue a sync action with specified priority
 * @param {Object} action - Sync action to queue
 * @param {number} priority - Priority level (use SYNC_PRIORITIES constants)
 */
function queueSync(action, priority = SYNC_PRIORITIES.NORMAL) {
  if (!initialize()) {
    console.error('❌ Sheet sync not initialized, cannot queue sync');
    return;
  }

  // Validate priority
  if (!Object.values(SYNC_PRIORITIES).includes(priority)) {
    console.warn(`⚠️ Invalid priority ${priority}, defaulting to NORMAL`);
    priority = SYNC_PRIORITIES.NORMAL;
  }

  // Add to queue
  syncQueues[priority].push({
    action,
    timestamp: Date.now(),
    attempts: 0
  });

  // Schedule sync for this priority
  scheduleSync(priority);
}

/**
 * Schedule sync processing for a priority level
 * @param {number} priority - Priority level
 */
function scheduleSync(priority) {
  // Clear existing timer
  if (syncTimers[priority]) {
    clearTimeout(syncTimers[priority]);
  }

  // Schedule new timer based on priority
  syncTimers[priority] = setTimeout(() => {
    processSyncQueue(priority);
  }, priority);
}

// ═══════════════════════════════════════════════════════════════════════════
// SYNC PROCESSING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Process sync queue for a priority level
 * @param {number} priority - Priority level to process
 */
async function processSyncQueue(priority) {
  const queue = syncQueues[priority];

  if (queue.length === 0) {
    return;
  }

  // Get all pending actions
  const actions = [...queue];
  queue.length = 0; // Clear queue

  console.log(`📤 Processing ${actions.length} sync action(s) (priority: ${priority}ms)`);

  // Process each action
  for (const queuedAction of actions) {
    try {
      await syncToSheet(queuedAction.action);

      // Update stats
      stats.totalSynced++;
      stats.byPriority[priority].synced++;
      stats.lastSyncTime = new Date();

    } catch (error) {
      console.error('❌ Sync failed:', error.message);

      // Retry logic
      queuedAction.attempts++;

      if (queuedAction.attempts < RETRY_CONFIG.MAX_ATTEMPTS) {
        console.log(`🔄 Retrying sync (attempt ${queuedAction.attempts + 1}/${RETRY_CONFIG.MAX_ATTEMPTS})`);

        // Re-queue with exponential backoff (capped at 30s)
        const backoffMs = Math.min(
          RETRY_CONFIG.BACKOFF_MS * Math.pow(2, queuedAction.attempts),
          30000
        );

        setTimeout(() => {
          queue.push(queuedAction);
          scheduleSync(priority);
        }, backoffMs);

      } else {
        console.error(`❌ Sync failed after ${RETRY_CONFIG.MAX_ATTEMPTS} attempts, giving up`);
        stats.totalFailed++;
        stats.byPriority[priority].failed++;

        // Log failed sync for manual review and alert admins
        logFailedSync(queuedAction.action, error);
      }
    }
  }
}

/**
 * Sync action to Google Sheets
 * @param {Object} action - Action to sync
 */
async function syncToSheet(action) {
  if (!sheetAPI) {
    throw new Error('Sheet sync not initialized');
  }

  switch (action.type) {
    case 'updatePoints':
      await syncPointsUpdate(action.data);
      break;

    case 'addAttendance':
      await syncAttendance(action.data);
      break;

    case 'updateAuctionItem':
      await syncAuctionItem(action.data);
      break;

    case 'updateMember':
      await syncMemberUpdate(action.data);
      break;

    case 'removeMember':
      await syncMemberRemoval(action.data);
      break;

    case 'submitBiddingResults':
      await syncBiddingResults(action.data);
      break;

    case 'saveBotState':
      await syncBotState(action.data);
      break;

    default:
      console.warn(`⚠️ Unknown sync action type: ${action.type}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SYNC ACTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Sync points update to Sheets
 */
async function syncPointsUpdate(data) {
  const { username, pointsChange, reason } = data;

  // Call Sheet API to update points
  await sheetAPI.call('updateMemberPoints', {
    username,
    pointsChange,
    reason: reason || 'MongoDB sync'
  });

  console.log(`✅ Synced points update: ${username} ${pointsChange > 0 ? '+' : ''}${pointsChange}`);
}

/**
 * Sync attendance to Sheets
 */
async function syncAttendance(data) {
  const { memberName, bossName, bossPoints, timestamp, weekLabel } = data;

  // Call Sheet API to submit attendance
  await sheetAPI.call('submitAttendance', {
    memberName,
    bossName,
    bossPoints,
    timestamp: timestamp || new Date().toISOString(),
    weekLabel: weekLabel || getCurrentWeekLabel()
  });

  console.log(`✅ Synced attendance: ${memberName} - ${bossName}`);
}

/**
 * Sync auction item update to Sheets
 */
async function syncAuctionItem(data) {
  const { itemName, winner, winningBid, soldAt } = data;

  // Call Sheet API to log auction result
  await sheetAPI.call('logAuctionResult', {
    itemName,
    winner: winner || 'No Winner',
    finalBid: winningBid || 0,
    timestamp: soldAt || new Date().toISOString()
  });

  console.log(`✅ Synced auction item: ${itemName} → ${winner || 'No Winner'}`);
}

/**
 * Sync member update to Sheets
 */
async function syncMemberUpdate(data) {
  const { username, updates } = data;

  // Call Sheet API to update member data
  await sheetAPI.call('updateMemberData', {
    username,
    ...updates
  });

  console.log(`✅ Synced member update: ${username}`);
}

/**
 * Sync member removal to Sheets
 */
async function syncMemberRemoval(data) {
  const { username } = data;

  // Call Sheet API to remove member
  await sheetAPI.call('removeMember', {
    username
  });

  console.log(`✅ Synced member removal: ${username}`);
}

/**
 * Sync bidding results to Sheets
 */
async function syncBiddingResults(data) {
  const { results, timestamp } = data;

  // Call Sheet API to submit bidding results
  await sheetAPI.call('submitBiddingResults', {
    results,
    timestamp
  });

  console.log(`✅ Synced bidding results: ${results.length} members`);
}

/**
 * Sync bot state to Sheets
 */
async function syncBotState(data) {
  const { module, state } = data;

  // Call Sheet API to save bot state
  await sheetAPI.call('saveBotState', {
    module,
    state
  });

  console.log(`✅ Synced bot state: ${module}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get current week label for attendance
 */
function getCurrentWeekLabel() {
  const now = new Date();
  const year = now.getFullYear();
  const weekNum = getWeekNumber(now);
  return `WEEK_${year}_${weekNum}`;
}

/**
 * Get ISO week number
 */
function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

/**
 * Log failed sync for manual review and alert admins
 */
function logFailedSync(action, error) {
  const failedSync = {
    action,
    error: error.message,
    timestamp: new Date().toISOString(),
    attempts: RETRY_CONFIG.MAX_ATTEMPTS
  };

  // Log to console
  console.error('💾 Failed sync logged:', JSON.stringify(failedSync, null, 2));

  // Alert admins via Discord
  adminAlerts.alertSheetSyncFailure({
    action: action,
    attempts: RETRY_CONFIG.MAX_ATTEMPTS,
    error: error,
    data: action.data
  }).catch(err => console.error('Failed to send sync failure alert:', err));
}

/**
 * Get sync statistics
 */
function getStats() {
  return {
    ...stats,
    queueSizes: {
      immediate: syncQueues[SYNC_PRIORITIES.IMMEDIATE].length,
      high: syncQueues[SYNC_PRIORITIES.HIGH].length,
      normal: syncQueues[SYNC_PRIORITIES.NORMAL].length,
      low: syncQueues[SYNC_PRIORITIES.LOW].length
    }
  };
}

/**
 * Flush all pending syncs immediately
 */
async function flushAll() {
  console.log('🔄 Flushing all pending syncs...');

  for (const priority of Object.values(SYNC_PRIORITIES)) {
    if (syncTimers[priority]) {
      clearTimeout(syncTimers[priority]);
    }
    await processSyncQueue(priority);
  }

  console.log('✅ All syncs flushed');
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
  // Queue management
  queueSync,

  // Priority constants
  SYNC_PRIORITIES,

  // Utilities
  initialize,
  getStats,
  flushAll
};
