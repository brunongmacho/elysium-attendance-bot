/**
 * Shared module state for boss rotation system.
 * All sub-modules import state from here to ensure a single source of truth.
 */

const path = require('path');
const { createLogger } = require('../../utils/logger');
const { CACHE_REFRESH_INTERVAL } = require('./constants');

// ============================================================================
// CONFIG & DEPENDENCIES (set during initialization)
// ============================================================================

let config = null;
let sheetAPI = null;
let client = null;
let bossTimerModule = null; // Reference to boss timer for recorded spawn times

// ============================================================================
// BOSS SPAWN CONFIG (loaded from boss_spawn_config.json)
// ============================================================================

let bossSpawnConfig = null;
try {
  const configPath = path.join(__dirname, '..', '..', 'boss_spawn_config.json');
  const fs = require('fs');
  const rawData = fs.readFileSync(configPath, 'utf8');
  bossSpawnConfig = JSON.parse(rawData);
} catch (configError) {
  console.error('⚠️ Failed to load boss spawn config:', configError.message);
}

// ============================================================================
// ROTATING BOSSES LIST (dynamically loaded from Google Sheets)
// ============================================================================

/**
 * Empty array means rotation system is disabled - no reminders sent.
 * Updated on initialization and cache refresh.
 */
let ROTATING_BOSSES = [];

// ============================================================================
// ROTATION CACHE
// ============================================================================

/**
 * In-memory cache of rotation status (refreshed from sheets periodically)
 * Format: { "Amentis": { currentIndex: 1, currentGuild: "Guild 1", isOurTurn: true }, ... }
 */
let rotationCache = {};
let lastCacheRefresh = 0;

// ============================================================================
// WARNING TRACKING
// ============================================================================

/**
 * Track already-warned spawns to avoid spam
 * Format: { "Amentis::2025-01-15T10:30": <timestamp> }
 */
let warnedSpawns = {};

/**
 * Track rotation warning messages for cleanup when thread closes
 * Format: { "Amentis": { messageId: "123456", channelId: "789012" }, ... }
 */
let rotationWarningMessages = {};

// ============================================================================
// DAILY SCHEDULE TRACKING
// ============================================================================

/**
 * Track daily rotation schedule message for cleanup
 * Format: { messageId: "123456", channelId: "789012", date: "2025-01-15", bosses: [...], autoDeleteTimer: timeout }
 */
let dailyScheduleMessage = null;

// ============================================================================
// SPAWN MONITOR TIMER
// ============================================================================

let spawnMonitorTimer = null;

// ============================================================================
// GUILD NAME & LOGGER
// ============================================================================

let guildName = 'ELYSIUM';

const logger = createLogger('boss-rotation');

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // Config & dependencies
  get config() { return config; },
  set config(val) { config = val; },
  get sheetAPI() { return sheetAPI; },
  set sheetAPI(val) { sheetAPI = val; },
  get client() { return client; },
  set client(val) { client = val; },
  get bossTimerModule() { return bossTimerModule; },
  set bossTimerModule(val) { bossTimerModule = val; },

  // Boss spawn config
  get bossSpawnConfig() { return bossSpawnConfig; },

  // Rotating bosses
  get ROTATING_BOSSES() { return ROTATING_BOSSES; },
  set ROTATING_BOSSES(val) { ROTATING_BOSSES = val; },

  // Rotation cache
  get rotationCache() { return rotationCache; },
  get lastCacheRefresh() { return lastCacheRefresh; },
  set lastCacheRefresh(val) { lastCacheRefresh = val; },
  CACHE_REFRESH_INTERVAL,

  // Warning tracking
  get warnedSpawns() { return warnedSpawns; },
  get rotationWarningMessages() { return rotationWarningMessages; },

  // Daily schedule
  get dailyScheduleMessage() { return dailyScheduleMessage; },
  set dailyScheduleMessage(val) { dailyScheduleMessage = val; },

  // Spawn monitor
  get spawnMonitorTimer() { return spawnMonitorTimer; },
  set spawnMonitorTimer(val) { spawnMonitorTimer = val; },

  // Guild & logger
  guildName,
  logger
};
