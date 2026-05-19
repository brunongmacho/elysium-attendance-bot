/**
 * Module initialization and boss name matching.
 */

const { SheetAPI } = require('../../utils/sheet-api');
const { findBossMatch: findBossMatchUtil } = require('../../utils/common');
const state = require('./state');

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Initializes the attendance module with required configuration and data.
 * Must be called before any other module functions are used.
 *
 * @param {Object} cfg - Bot configuration object containing guild IDs, channel IDs, and webhook URLs
 * @param {Object} bossPointsData - Mapping of boss names to their point values
 * @param {Function} isAdmin - Function that checks if a user has admin privileges
 * @param {Object} cache - Discord cache for channel lookups
 * @param {Object} intelligence - Intelligence engine for learning system (optional)
 * @returns {void}
 */
function initialize(cfg, bossPointsData, isAdmin, cache = null, intelligence = null) {
  state.config = cfg;
  state.bossPoints = bossPointsData;
  state.isAdminFunc = isAdmin;
  state.sheetAPI = new SheetAPI(cfg.sheet_webhook_url);
  state.discordCache = cache;
  state.intelligenceEngine = intelligence;
  console.log("✅ Attendance module initialized");

  // MongoDB integration status (Phase 4)
  if (state.USE_MONGODB_ATTENDANCE) {
    console.log('✅ [MongoDB] Attendance using MongoDB-first architecture');
    console.log('ℹ️  [MongoDB] Attendance records saved to MongoDB with IMMEDIATE priority Sheet sync');
  } else {
    console.log('ℹ️  Attendance using Google Sheets (legacy mode)');
    console.log('ℹ️  Set USE_MONGODB_ATTENDANCE=true to enable MongoDB');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 1 (CRIT-004): LRU Cache Cleanup
  // ═══════════════════════════════════════════════════════════════════════════
  // Start periodic cleanup of expired LRU cache entries (every 10 minutes)
  const cacheCleanupTimer = setInterval(() => {
    const removed = state.columnCheckCache.cleanup();
    const stats = state.columnCheckCache.getStats();
    console.log(`🧹 [Cache] Cleanup complete: ${stats.size}/${stats.maxSize} entries (${stats.hitRate} hit rate)`);
  }, state.TIMING.CACHE_CLEANUP_INTERVAL);

  // Register with shutdown manager for graceful cleanup
  state.shutdownManager.registerInterval('attendance-cache-cleanup', cacheCleanupTimer, {
    frequency: '10 minutes',
    module: 'attendance'
  });

  console.log('✅ [Cache] LRU cache cleanup scheduled (10-minute intervals)');
}

/**
 * Wrapper function for boss name matching using the module's boss points data.
 * Performs fuzzy matching to handle variations in boss name input.
 *
 * @param {string} input - Boss name input to match (case-insensitive, handles variations)
 * @returns {string|null} Normalized boss name if found, null otherwise
 */
function findBossMatch(input) {
  return findBossMatchUtil(input, state.bossPoints);
}

module.exports = { initialize, findBossMatch };
