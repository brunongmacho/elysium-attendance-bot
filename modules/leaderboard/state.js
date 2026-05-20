/**
 * Shared module state for the leaderboard system.
 * All sub-modules import state from here to ensure a single source of truth.
 */

const { createLogger } = require('../../utils/logger');

// ============================================================================
// CONFIG & DEPENDENCIES (set during initialization)
// ============================================================================

let config = null;
let client = null;
let sheetAPI = null;
let discordCache = null;
let crashRecovery = null;

// ============================================================================
// SCHEDULER TIMERS
// ============================================================================

let weeklyReportTimer = null;
let monthlyReportTimer = null;

// ============================================================================
// GUILD NAME & LOGGER
// ============================================================================

let guildName = 'TENCHU';

const logger = createLogger('leaderboard');

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // Config & dependencies
  get config() { return config; },
  set config(val) { config = val; },
  get client() { return client; },
  set client(val) { client = val; },
  get sheetAPI() { return sheetAPI; },
  set sheetAPI(val) { sheetAPI = val; },
  get discordCache() { return discordCache; },
  set discordCache(val) { discordCache = val; },
  get crashRecovery() { return crashRecovery; },
  set crashRecovery(val) { crashRecovery = val; },

  // Scheduler timers
  get weeklyReportTimer() { return weeklyReportTimer; },
  set weeklyReportTimer(val) { weeklyReportTimer = val; },
  get monthlyReportTimer() { return monthlyReportTimer; },
  set monthlyReportTimer(val) { monthlyReportTimer = val; },

  // Guild & logger
  guildName,
  logger
};
