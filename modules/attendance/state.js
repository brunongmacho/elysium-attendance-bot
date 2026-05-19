/**
 * Shared state for the attendance module.
 * This object is imported by all sub-modules so they share the same mutable references.
 * Node.js caches require() calls, so all consumers get the same object instance.
 */

const LRUCache = require('../../utils/lru-cache');
const shutdownManager = require('../../utils/shutdown-manager');
const stateManager = require('../../utils/state-manager');

// ═══════════════════════════════════════════════════════════════════════════════
// FEATURE FLAGS (Phase 4)
// ═══════════════════════════════════════════════════════════════════════════════

const USE_MONGODB_ATTENDANCE = process.env.USE_MONGODB_ATTENDANCE === 'true';

// ═══════════════════════════════════════════════════════════════════════════════
// TIMING CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

const TIMING = {
  MIN_SHEET_DELAY: 3000,
  CONFIRMATION_TIMEOUT: 30000,
  RETRY_DELAY: 7000,
  MASS_CLOSE_DELAY: 4000,
  REACTION_RETRY_ATTEMPTS: 3,
  REACTION_RETRY_DELAY: 1000,
  THREAD_AUTO_CLOSE_MINUTES: 30,
  THREAD_AGE_CHECK_INTERVAL: 90000,
  CACHE_CLEANUP_INTERVAL: 10 * 60 * 1000,
};

// ═══════════════════════════════════════════════════════════════════════════════
// SHARED STATE OBJECT (mutated by sub-modules, visible to all via Node require cache)
// ═══════════════════════════════════════════════════════════════════════════════

const shared = {
  // Module configuration and state
  config: null,
  bossPoints: null,
  isAdminFunc: null,
  sheetAPI: null,
  discordCache: null,
  intelligenceEngine: null,

  // Rate limiting
  lastSheetCall: 0,

  // Mutex: prevents race conditions in thread creation
  pendingCreations: new Map(),
  creationPromises: new Map(),

  // LRU Cache for column checks (PHASE 1: CRIT-004)
  columnCheckCache: new LRUCache(1000, 5 * 60 * 1000),
};

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

module.exports = {
  ...shared,
  TIMING,
  USE_MONGODB_ATTENDANCE,
  stateManager,
  shutdownManager,
};
