/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                 AUCTIONEERING STATE - Centralized State                  ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Centralized mutable state container for the auctioneering system.
 * All sub-modules import this singleton and access state via the exported object.
 *
 * CRITICAL: Using a single exported object means all property mutations
 * (e.g., state.cfg = x, state.auctionState.active = true) are visible
 * to all modules that require() this file.
 *
 * @module modules/auctioneering/state
 */

const { createLogger } = require('../../utils/logger');
const { PointsCache } = require('../../utils/points-cache');
const { SheetAPI } = require('../../utils/sheet-api');
const auctionCache = require('../../utils/auction-cache');
const attendance = require('../../attendance');
const mongoHelpers = require('../../utils/mongodb-helpers');
const sheetSync = require('../../services/sheet-sync');
const biddingScheduleConfig = require('../../config/bidding-schedule.json');
const { getFormattedManilaTime } = require('../../utils/timestamp-cache');
const { formatUptime } = require('../../utils/common');
const errorHandler = require('../../utils/error-handler');

// Feature flags
const USE_MONGODB_AUCTIONEERING = process.env.USE_MONGODB_AUCTIONEERING === 'true';
const USE_MONGODB_BIDDING = process.env.USE_MONGODB_BIDDING === 'true';

// ═══════════════════════════════════════════════════════════════════════════
// SHARED STATE OBJECT - All modules access state via this single reference
// ═══════════════════════════════════════════════════════════════════════════

const state = {

  // ─── External Function References (injected at runtime) ────────────────

  /** @type {Function|null} Function for posting data to Google Sheets */
  postToSheetFunc: null,

  /** @type {Object|null} Intelligence Engine reference for AI/ML features */
  intelligenceEngine: null,

  /** @type {Object} Cache for attendance records (legacy) */
  attendanceCacheObj: {},

  /** @type {string|null} Current session boss name (legacy) */
  currentSessionBoss: null,

  // ─── Module Injection Points ───────────────────────────────────────────

  /** @type {Function|null} Function to check if a user is an admin */
  isAdmFunc: null,

  /** @type {Object|null} Bot configuration object */
  cfg: null,

  /** @type {SheetAPI|null} Unified Google Sheets API client */
  sheetAPI: null,

  /** @type {Object|null} Discord channel cache */
  discordCache: null,

  /** @type {Object|null} Reference to the bidding module */
  biddingModule: null,

  // ─── Primary Auction State ─────────────────────────────────────────────

  /**
   * Primary auction state object tracking the current session.
   * @type {Object}
   */
  auctionState: {
    active: false,
    currentItem: null,
    sessionItems: [],
    currentItemIndex: 0,
    timers: {},
    threadItems: {},
    activeThreadCount: 0,
    currentBatchSize: 1,
    paused: false,
    pausedTime: null,
    sessionFinalized: true,
  },

  // ─── Session Tracking ──────────────────────────────────────────────────

  /** @type {number|null} Timestamp when the current session started */
  sessionStartTime: null,

  /** @type {number} Sequential session number */
  sessionNumber: 1,

  /** @type {string|null} Formatted timestamp string for the current session */
  sessionTimestamp: null,

  /** @type {string|null} Session start date/time string */
  sessionStartDateTime: null,

  // ─── Scheduled Automation Timers ───────────────────────────────────────

  /** @type {NodeJS.Timeout|null} Weekly Sunday auction scheduler */
  weeklyAuctionTimer: null,

  /** @type {NodeJS.Timeout|null} Session 2 scheduler */
  session2Timer: null,

  /** @type {NodeJS.Timeout|null} Polling interval for session completion */
  sessionPollInterval: null,

  /** @type {NodeJS.Timeout|null} Pre-auction sync scheduler */
  preAuctionSyncTimer: null,

  // ─── Logger ────────────────────────────────────────────────────────────

  /** @type {Object} Logger instance */
  logger: createLogger('auctioneering'),

  // ─── Shared Dependencies (static, used by multiple modules) ────────────

  PointsCache,
  auctionCache,
  biddingScheduleConfig,
  errorHandler,
  attendance,
  mongoHelpers,
  sheetSync,

  // ─── Utility Function Aliases ──────────────────────────────────────────

  /** @type {Function} Get formatted Manila timestamp */
  getTimestamp: getFormattedManilaTime,

  /** @type {Function} Format milliseconds to human-readable time */
  fmtTime: formatUptime,

  // ─── Feature Flags ─────────────────────────────────────────────────────

  USE_MONGODB_AUCTIONEERING,
  USE_MONGODB_BIDDING,
};

// ═══════════════════════════════════════════════════════════════════════════
// INJECTION FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Sets the postToSheet function reference for Google Sheets integration.
 * @param {Function} fn - The postToSheet function from the sheets module
 */
function setPostToSheet(fn) {
  state.postToSheetFunc = fn;
  state.logger.info(`✅ postToSheet function initialized`);
}

/**
 * Retrieves the postToSheet function reference.
 * @returns {Function} The postToSheet function
 * @throws {Error} If postToSheet has not been initialized
 */
function getPostToSheet() {
  if (!state.postToSheetFunc) {
    throw new Error(
      "❌ CRITICAL: postToSheet not initialized. Call setPostToSheet() first."
    );
  }
  return state.postToSheetFunc;
}

module.exports = {
  state,
  setPostToSheet,
  getPostToSheet,
};
