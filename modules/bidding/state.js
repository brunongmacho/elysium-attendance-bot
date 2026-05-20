/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                    BIDDING STATE - Centralized State Container            ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Centralized mutable state container for the bidding system.
 * All modules import this singleton and access state.st, state.cfg, etc.
 *
 * CRITICAL: Using a container object means state.st can be reassigned
 * (e.g., on load() or reset) and all modules see the new object through
 * the same container reference.
 *
 * @module modules/bidding/state
 */

const { createLogger } = require('../../utils/logger');
const { getFormattedManilaTime } = require('../../utils/timestamp-cache');
const { formatUptime } = require('../../utils/common');
const { normalizeUsername, formatDuration } = require('./utilities');

/**
 * Centralized mutable state container
 * @type {Object}
 */
const state = {

  // ═══════════════════════════════════════════════════════════════════════
  // MAIN BIDDING STATE OBJECT
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Centralized bidding system state
   *
   * This object is persisted to both local file system and Google Sheets
   * for resilience across bot restarts and Koyeb deployments.
   *
   * CRITICAL: The 'lp' (locked points) object is SHARED across both
   * bidding.js and auctioneering.js modules to prevent race conditions
   * where users bid more points than they have across multiple auctions.
   *
   * @type {Object}
   */
  st: {
    /** @type {Object|null} Active auction details (item, bids, winner, status) */
    a: null,

    /**
     * @type {Object.<string, number>} Locked points per user
     * Key: normalized username OR Discord ID, Value: points locked
     * SHARED across bidding.js and auctioneering.js modules
     * Uses Discord ID when available for nickname-agnostic tracking
     */
    lp: {},

    /** @type {Array<Object>} Auction queue (items waiting to be auctioned) */
    q: [],

    /** @type {Array<Object>} Session history of completed auctions */
    h: [],

    /** @type {Object.<string, NodeJS.Timeout>} Timer handles for cleanup */
    th: {},

    /**
     * @type {Object.<string, Object>} Pending bid confirmations
     * Key: message ID, Value: confirmation details
     */
    pc: {},

    /** @type {string|null} Session start timestamp (Manila timezone) */
    sd: null,

    /** @type {Object.<string, number>|null} Cached points from Google Sheets */
    cp: null,

    /** @type {number|null} Cache load timestamp for staleness detection */
    ct: null,

    /**
     * @type {Object.<string, number>} Last bid timestamp per user for rate limiting
     * Key: user ID, Value: timestamp
     */
    lb: {},

    /** @type {boolean} Pause state for bid confirmation handling */
    pause: false,

    /** @type {NodeJS.Timeout|null} Pause timer reference */
    pauseTimer: null,

    /** @type {boolean} Concurrent auction protection mutex */
    auctionLock: false,

    /** @type {NodeJS.Timeout|null} Auto-refresh timer for points cache */
    cacheRefreshTimer: null,
  },

  // ═══════════════════════════════════════════════════════════════════════
  // RUNTIME MODULE REFERENCES (Mutable, set by initializeBidding)
  // ═══════════════════════════════════════════════════════════════════════

  /** @type {Object|null} Bot configuration object loaded from config.json */
  cfg: null,

  /** @type {Object|null} Reference to auctioneering module for dual-mode operation */
  auctioneering: null,

  /** @type {Object|null} Unified Google Sheets API client */
  sheetAPI: null,

  /** @type {Object|null} Discord channel cache for reducing API calls */
  discordCache: null,

  /** @type {Function|null} Admin check function (injected by initializeBidding) */
  isAdmFunc: null,

  // ═══════════════════════════════════════════════════════════════════════
  // MUTABLE STATE FLAGS
  // ═══════════════════════════════════════════════════════════════════════

  /** @type {boolean} Finalization lock to prevent state corruption */
  finalizationInProgress: false,

  /** @type {number} Last successful Google Sheets sync timestamp */
  lastSheetSyncTime: 0,

  // ═══════════════════════════════════════════════════════════════════════
  // CLEANUP INTERVALS
  // ═══════════════════════════════════════════════════════════════════════

  /** @type {Object} Global cleanup interval references */
  cleanupIntervals: {
    pendingConfirmations: null,
    lockedPoints: null,
    memoryStats: null,
  },

  // ═══════════════════════════════════════════════════════════════════════
  // LOGGER
  // ═══════════════════════════════════════════════════════════════════════

  /** @type {Object} Logger instance for bidding module */
  logger: createLogger('bidding'),
};

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generates timestamp string in Manila timezone (MM/DD/YYYY HH:MM)
 * @type {Function}
 */
state.ts = getFormattedManilaTime;

/**
 * Formats duration in minutes to human-readable string
 * @type {Function}
 */
state.fmtDur = formatDuration;

/**
 * Formats time in milliseconds to human-readable string
 * @type {Function}
 */
state.fmtTime = formatUptime;

/**
 * Returns color value (passthrough for future color customization)
 * @param {number} color - Hex color value
 * @returns {number} The same color value
 */
state.getColor = function getColor(color) {
  return color;
};

/**
 * Checks if member has guild role required for bidding
 * @param {GuildMember} m - Discord guild member object
 * @returns {boolean} True if member has guild role
 */
state.hasRole = function hasRole(m) {
  return m.roles.cache.some((r) => {
    const roleName = state.cfg?.tenchu_role || 'Certified TPB';
    const roleId = state.cfg?.tenchu_role_id || state.cfg?.role_ids?.member;
    return r.name === roleName || r.id === roleId;
  });
};

/**
 * Checks if member has admin privileges based on configured admin roles
 * @param {GuildMember} m - Discord guild member object
 * @param {Object} c - Bot configuration with admin_roles array
 * @returns {boolean} True if member has any admin role
 */
state.isAdm = function isAdm(m, c) {
  return m.roles.cache.some((r) => c.admin_roles.includes(r.name));
};

module.exports = state;
