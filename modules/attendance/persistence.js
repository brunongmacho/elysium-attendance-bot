/**
 * State persistence (Google Sheets) - crash recovery on container restarts.
 */

const { postToSheet } = require('./sheets');
const state = require('./state');

// ═══════════════════════════════════════════════════════════════════════════════
// STATE PERSISTENCE (GOOGLE SHEETS)
// ═══════════════════════════════════════════════════════════════════════════════

let lastAttendanceStateSyncTime = 0;
const ATTENDANCE_STATE_SYNC_INTERVAL = 15 * 60 * 1000;   // 15 minutes (optimized from 10)
const MIN_FORCE_SYNC_INTERVAL = 60 * 1000;               // Minimum 60 seconds even for forceSync
const STATE_CLEANUP_INTERVAL = 30 * 60 * 1000;           // 30 minutes
const STALE_ENTRY_AGE = 24 * 60 * 60 * 1000;             // 24 hours
const MAX_PENDING_VERIFICATIONS = 100;                   // Prevent unbounded growth
const MAX_CONFIRMATION_MESSAGES = 50;                    // Limit confirmation message storage

/**
 * Saves the current attendance state to Google Sheets for crash recovery.
 *
 * @param {boolean} [forceSync=false] - If true, bypasses the sync interval check
 * @returns {Promise<boolean>} True if state was saved successfully, false otherwise
 */
async function saveAttendanceStateToSheet(forceSync = false) {
  if (!state.config || !state.config.sheet_webhook_url) {
    console.warn("⚠️ Config not initialized, skipping attendance state sync");
    return false;
  }

  const now = Date.now();
  const timeSinceLastSync = now - lastAttendanceStateSyncTime;

  // Even forceSync respects minimum interval to prevent rate limiting
  if (forceSync && timeSinceLastSync < MIN_FORCE_SYNC_INTERVAL) {
    console.log(`⏳ [ATTENDANCE] Skipping forceSync (${Math.ceil((MIN_FORCE_SYNC_INTERVAL - timeSinceLastSync)/1000)}s remaining)`);
    return false;
  }

  const shouldSync = forceSync || (timeSinceLastSync > ATTENDANCE_STATE_SYNC_INTERVAL);

  if (!shouldSync) {
    return false;
  }

  try {
    const stateToSave = {
      activeSpawns: state.stateManager.activeSpawns,
      activeColumns: state.stateManager.activeColumns,
      pendingVerifications: state.stateManager.pendingVerifications,
      pendingClosures: state.stateManager.pendingClosures,
      confirmationMessages: state.stateManager.confirmationMessages,
    };

    await postToSheet({
      action: 'saveAttendanceState',
      state: stateToSave,
    });

    lastAttendanceStateSyncTime = now;
    return true;
  } catch (err) {
    console.error("❌ Failed to save attendance state:", err.message);
    return false;
  }
}

/**
 * Loads previously saved attendance state from Google Sheets on bot startup.
 *
 * @returns {Promise<boolean>} True if state was loaded successfully, false otherwise
 */
async function loadAttendanceStateFromSheet() {
  if (!state.config || !state.config.sheet_webhook_url) {
    console.warn("⚠️ Config not initialized, cannot load attendance state");
    return false;
  }

  try {
    const data = await state.sheetAPI.call('getAttendanceState');

    if (!data.state) {
      console.log("ℹ️ No saved attendance state found");
      return false;
    }

    // Restore all state variables
    state.stateManager.activeSpawns = data.state.activeSpawns || {};
    state.stateManager.activeColumns = data.state.activeColumns || {};
    state.stateManager.pendingVerifications = data.state.pendingVerifications || {};
    state.stateManager.pendingClosures = data.state.pendingClosures || {};
    state.stateManager.confirmationMessages = data.state.confirmationMessages || {};

    console.log("✅ Attendance state loaded from Google Sheets");
    console.log(`   - Active spawns: ${Object.keys(state.stateManager.activeSpawns).length}`);
    console.log(`   - Active columns: ${Object.keys(state.stateManager.activeColumns).length}`);
    console.log(`   - Pending verifications: ${Object.keys(state.stateManager.pendingVerifications).length}`);
    return true;
  } catch (err) {
    console.error("❌ Failed to load attendance state:", err.message);
    return false;
  }
}

/**
 * Cleans up stale entries from state objects to prevent memory leaks.
 *
 * @returns {number} Number of entries cleaned up
 */
function cleanupStaleEntries() {
  const now = Date.now();
  let cleaned = 0;

  // Clean up old pending verifications (older than 24 hours)
  Object.keys(state.stateManager.pendingVerifications).forEach(msgId => {
    const entry = state.stateManager.pendingVerifications[msgId];
    if (entry.timestamp && (now - entry.timestamp > STALE_ENTRY_AGE)) {
      delete state.stateManager.pendingVerifications[msgId];
      cleaned++;
    }
  });

  // Clean up old confirmation messages
  // Note: stateManager.confirmationMessages stores arrays of message IDs per thread
  // We can't easily determine age, so we'll rely on the MAX limit only

  // Clean up old pending closures (older than 24 hours)
  Object.keys(state.stateManager.pendingClosures).forEach(msgId => {
    const entry = state.stateManager.pendingClosures[msgId];
    if (entry.timestamp && (now - entry.timestamp > STALE_ENTRY_AGE)) {
      delete state.stateManager.pendingClosures[msgId];
      cleaned++;
    }
  });

  // Enforce max limits to prevent unbounded growth
  const pendingVerifKeys = Object.keys(state.stateManager.pendingVerifications);
  if (pendingVerifKeys.length > MAX_PENDING_VERIFICATIONS) {
    const sortedKeys = pendingVerifKeys.sort((a, b) => {
      const aTime = state.stateManager.pendingVerifications[a].timestamp || 0;
      const bTime = state.stateManager.pendingVerifications[b].timestamp || 0;
      return aTime - bTime;
    });
    const toRemove = sortedKeys.slice(0, sortedKeys.length - MAX_PENDING_VERIFICATIONS);
    toRemove.forEach(key => delete state.stateManager.pendingVerifications[key]);
    cleaned += toRemove.length;
  }

  // stateManager.confirmationMessages is an array-based structure, cleaned when threads close
  // No age-based cleanup needed here

  if (cleaned > 0) {
    console.log(`🧹 Cleaned up ${cleaned} stale attendance entries`);
    console.log(`   - Pending verifications: ${Object.keys(state.stateManager.pendingVerifications).length}`);
    console.log(`   - Confirmation messages: ${Object.keys(state.stateManager.confirmationMessages).length}`);
  }

  return cleaned;
}

/**
 * Schedules automatic periodic state synchronization and cleanup.
 *
 * @returns {void}
 */
function schedulePeriodicStateSync() {
  // Sync state to sheets every 15 minutes for crash recovery (optimized)
  setInterval(async () => {
    try {
      await saveAttendanceStateToSheet(false);
    } catch (error) {
      console.error("❌ Error in periodic state sync:", error.message);
    }
  }, ATTENDANCE_STATE_SYNC_INTERVAL);

  // Clean up stale entries every 30 minutes to prevent memory bloat
  setInterval(() => {
    try {
      cleanupStaleEntries();
    } catch (error) {
      console.error("❌ Error in cleanup:", error.message);
    }
  }, STATE_CLEANUP_INTERVAL);

  console.log("✅ Scheduled periodic state sync (15min) and cleanup (30min)");
}

module.exports = { saveAttendanceStateToSheet, loadAttendanceStateFromSheet, cleanupStaleEntries, schedulePeriodicStateSync };
