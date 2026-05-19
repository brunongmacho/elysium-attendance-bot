/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                    BIDDING CONSTANTS - Colors, Emojis, Config             ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * All shared constants, configuration values, and UI helpers for the
 * bidding system. Imported by all bidding sub-modules.
 *
 * @module modules/bidding/constants
 */

const CircuitBreaker = require('../../utils/circuit-breaker');
const { createPaginatedEmbeds, createDisabledRow } = require('../../utils/ui-helpers');

// ═══════════════════════════════════════════════════════════════════════════
// FILE PATHS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Path to local state persistence file
 * @constant {string}
 */
const SF = "./bidding-state.json";

// ═══════════════════════════════════════════════════════════════════════════
// TIMING CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Bid confirmation timeout in milliseconds (10 seconds)
 * @constant {number}
 */
const CT = 10000;

/**
 * Rate limit between bids per user in milliseconds (3 seconds)
 * Prevents spam and accidental duplicate submissions
 * @constant {number}
 */
const RL = 3000;

/**
 * Maximum time extensions allowed per auction (60 extensions)
 * Prevents infinite auctions from continuous last-minute bidding
 * @constant {number}
 */
const ME = 60;

/**
 * Cache auto-refresh interval in milliseconds (30 minutes)
 * Keeps points data fresh during long auction sessions
 * @constant {number}
 */
const CACHE_REFRESH_INTERVAL = 30 * 60 * 1000;

/**
 * Preview time before auction starts in milliseconds (30 seconds)
 * Gives users time to prepare before bidding begins
 * @constant {number}
 */
const PREVIEW_TIME = 30000;

/**
 * Timeout durations for various auction events
 * All values in milliseconds
 * @constant {Object}
 */
const TIMEOUTS = {
  /** User confirmation timeout before auto-cancel (30 seconds) */
  CONFIRMATION: 30000,
  /** Stale confirmation cleanup threshold (60 seconds) */
  STALE_CONFIRMATION: 60000,
  /** Delay before starting next auction item (20 seconds) */
  NEXT_ITEM_DELAY: 20000,
  /** Quick delay for rapid transitions (5 seconds) */
  QUICK_DELAY: 5000,
  /** Delay before auto-deleting confirmation messages (3 seconds) */
  MESSAGE_DELETE: 3000,
  /** Time before "going once" announcement (60 seconds remaining) */
  GOING_ONCE: 60000,
  /** Time before "going twice" announcement (30 seconds remaining) */
  GOING_TWICE: 30000,
  /** Time before "final call" announcement (10 seconds remaining) */
  FINAL_CALL: 10000,
  /** Delay before finalizing session results (2 seconds) */
  FINALIZE_DELAY: 2000,
};

// ═══════════════════════════════════════════════════════════════════════════
// EMBED COLORS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Discord embed color scheme for consistent visual feedback
 * @constant {Object}
 */
const COLORS = {
  /** Green for successful operations (0x00ff00) */
  SUCCESS: 0x00ff00,
  /** Orange for warnings and cautions (0xffa500) */
  WARNING: 0xffa500,
  /** Red for errors and failures (0xff0000) */
  ERROR: 0xff0000,
  /** Blue for informational messages (0x4a90e2) */
  INFO: 0x4a90e2,
  /** Gold for auction-related messages (0xffd700) */
  AUCTION: 0xffd700,
};

// ═══════════════════════════════════════════════════════════════════════════
// EMOJI CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Emoji constants for consistent visual indicators across all messages
 * @constant {Object}
 */
const EMOJI = {
  SUCCESS: "✅",     // Successful operations
  ERROR: "❌",      // Errors and failures
  WARNING: "⚠️",    // Warnings and cautions
  INFO: "ℹ️",       // Informational messages
  AUCTION: "🔨",    // Auction-related
  BID: "💰",        // Bid amounts and points
  TIME: "⏱️",       // Time-related
  TROPHY: "🏆",     // Winners and achievements
  FIRE: "🔥",       // Active/hot items
  LOCK: "🔒",       // Locked points
  CHART: "📊",      // Statistics and data
  PAUSE: "⏸️",      // Paused state
  PLAY: "▶️",       // Resume/play
  CLOCK: "🕐",      // Countdown and timing
  LIST: "📋",       // Lists and queues
};

// ═══════════════════════════════════════════════════════════════════════════
// ERROR MESSAGES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Standardized error messages for consistent user experience
 * @constant {Object}
 */
const ERROR_MESSAGES = {
  NO_ROLE: `${EMOJI.ERROR} You need the guild role to participate in auctions`,
  NO_POINTS: `${EMOJI.ERROR} You have no bidding points available`,
  CACHE_NOT_LOADED: `${EMOJI.ERROR} Points cache not loaded. Please try again shortly.`,
  CACHE_LOAD_FAILED: `${EMOJI.ERROR} Failed to load bidding points from server`,
  INVALID_BID: `${EMOJI.ERROR} Invalid bid amount. Please enter positive integers only.`,
  INSUFFICIENT_POINTS: `${EMOJI.ERROR} Insufficient points available`,
  RATE_LIMITED: `${EMOJI.CLOCK} Please wait before bidding again (rate limit: 3s)`,
  NO_ACTIVE_AUCTION: `${EMOJI.ERROR} No active auction`,
  NO_ACTIVE_ITEM: `${EMOJI.ERROR} No active auction item`,
  SESSION_UNAVAILABLE: `${EMOJI.ERROR} Session data unavailable. Please contact admin.`,
  AUCTION_IN_PROGRESS: `${EMOJI.WARNING} Auction start already in progress, please wait...`,
  AUCTION_ALREADY_RUNNING: `${EMOJI.ERROR} An auction is already running`,
  NO_ITEMS_QUEUED: `${EMOJI.ERROR} No items in queue`,
};

// ═══════════════════════════════════════════════════════════════════════════
// COMMAND ALIASES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Command aliases for user convenience
 * Maps short commands to their full command names
 * @constant {Object}
 */
const COMMAND_ALIASES = {
  "!b": "!bid",                  // Quick bid command
  "!ql": "!queuelist",           // Quick queue list
  "!queue": "!queuelist",        // Alternative queue list
  "!start": "!startauction",     // Quick start
};

// ═══════════════════════════════════════════════════════════════════════════
// FEATURE FLAGS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Feature flags for MongoDB integration (Phase 4)
 * @constant {Object}
 */
const FEATURE_FLAGS = {
  /** Enable MongoDB for bidding points (default: false) */
  USE_MONGODB_BIDDING: process.env.USE_MONGODB_BIDDING === 'true',
  /** Enable MongoDB fallback to Sheets on failure (default: true) */
  MONGODB_FALLBACK_ENABLED: process.env.MONGODB_FALLBACK_ENABLED !== 'false',
};

// ═══════════════════════════════════════════════════════════════════════════
// CIRCUIT BREAKER - MongoDB
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Circuit breaker for MongoDB operations with Sheets fallback
 * @type {CircuitBreaker}
 */
const mongoBiddingCircuit = new CircuitBreaker({
  threshold: 5,
  timeout: 60000,
  maxRetries: 10, // 10 attempts with exponential backoff before fallback
  name: 'BiddingMongoDB'
});

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
  SF,
  CT,
  RL,
  ME,
  CACHE_REFRESH_INTERVAL,
  PREVIEW_TIME,
  TIMEOUTS,
  COLORS,
  EMOJI,
  ERROR_MESSAGES,
  COMMAND_ALIASES,
  FEATURE_FLAGS,
  mongoBiddingCircuit,
  createPaginatedEmbeds,
  createDisabledRow,
};
