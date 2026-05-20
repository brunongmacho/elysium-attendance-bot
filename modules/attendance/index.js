/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * TENCHU ATTENDANCE SYSTEM MODULE (Decomposed)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Main entry point - wires together all sub-modules and re-exports the full API.
 * All ~32+ exports from the original monolith are preserved here.
 *
 * @module attendance
 * @author TENCHU Development Team
 * @version 2.0.0
 */

// ═══════════════════════════════════════════════════════════════════════════════
// SUB-MODULE IMPORTS
// ═══════════════════════════════════════════════════════════════════════════════

const { initialize, findBossMatch } = require('./initialization');
const { postToSheet, checkColumnExists } = require('./sheets');
const { removeAllReactionsWithRetry, cleanupAllThreadReactions } = require('./reactions');
const { createSpawnThreads } = require('./thread-creation');
const { scanThreadForPendingReactions, recoverStateFromThreads, validateStateConsistency } = require('./state-recovery');
const { saveAttendanceStateToSheet, loadAttendanceStateFromSheet, cleanupStaleEntries, schedulePeriodicStateSync } = require('./persistence');
const { checkAndAutoCloseThreads, startAutoCloseScheduler } = require('./auto-close');
const { createThreadForBoss } = require('./boss-integration');

// Re-export utilities from common
const {
  getCurrentTimestamp,
  getSundayOfWeek,
  formatUptime,
  parseThreadName,
} = require("../../utils/common");

// State manager and cache for getters/setters
const stateManager = require('../../utils/state-manager');
const state = require('./state');

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE EXPORTS (all ~32+ exports preserved)
// ═══════════════════════════════════════════════════════════════════════════════

module.exports = {
  // Core initialization
  initialize,

  // Utility functions from common module (re-exported for convenience)
  getCurrentTimestamp,
  getSundayOfWeek,
  formatUptime,
  findBossMatch,
  parseThreadName,

  // Google Sheets integration
  postToSheet,
  checkColumnExists,

  // Reaction management
  removeAllReactionsWithRetry,
  cleanupAllThreadReactions,

  // Thread creation and management
  createSpawnThreads,
  createThreadForBoss, // Boss timer integration

  // State recovery
  recoverStateFromThreads,
  validateStateConsistency,

  // State persistence
  saveAttendanceStateToSheet,
  loadAttendanceStateFromSheet,
  schedulePeriodicStateSync,
  cleanupStaleEntries,

  // Auto-close scheduler (prevents cheating)
  checkAndAutoCloseThreads,
  startAutoCloseScheduler,

  // State getters (read-only access)
  getActiveSpawns: () => stateManager.activeSpawns,
  getActiveColumns: () => stateManager.activeColumns,
  getPendingVerifications: () => stateManager.pendingVerifications,
  getPendingClosures: () => stateManager.pendingClosures,
  getConfirmationMessages: () => stateManager.confirmationMessages,

  // Phase 1 (CRIT-004): LRU Cache Statistics
  getCacheStats: () => state.columnCheckCache.getStats(),

  // StateManager access
  getStateManager: () => stateManager,
  getStateStats: () => stateManager.getStats(),

  // State setters (use with caution - primarily for recovery)
  setActiveSpawns: (val) => (stateManager.activeSpawns = val),
  setActiveColumns: (val) => (stateManager.activeColumns = val),
  setPendingVerifications: (val) => (stateManager.pendingVerifications = val),
  setPendingClosures: (val) => (stateManager.pendingClosures = val),
  setConfirmationMessages: (val) => (stateManager.confirmationMessages = val),
};
