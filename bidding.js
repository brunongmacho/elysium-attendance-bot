/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                    ELYSIUM GUILD BIDDING ENGINE                           ║
 * ║                         Version 6.0 - Enhanced                            ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * @fileoverview Comprehensive bidding system for Discord-based guild auctions
 * with advanced features including instant bidding, points management, race
 * condition prevention, and dual-module support (standalone & auctioneering).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ARCHITECTURE OVERVIEW
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This bidding engine operates in two modes:
 *
 * 1. STANDALONE MODE (bidding.js native):
 *    - Traditional queue-based auction system
 *    - Items loaded from Google Sheets
 *    - Automatic session management with timers
 *    - Bid confirmation workflow with user acceptance
 *
 * 2. AUCTIONEERING MODE (auctioneering.js integration):
 *    - Manual auction control by admins
 *    - Instant bidding without confirmations
 *    - Shared points locking system
 *    - Real-time bid processing
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * STATE MANAGEMENT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The system maintains a centralized state object (st) with the following:
 *
 * AUCTION STATE:
 *   - a: Active auction details (item, bids, timers, winner)
 *   - q: Item queue loaded from Google Sheets
 *   - pause: Pause status for bid confirmations
 *
 * POINTS MANAGEMENT:
 *   - lp: Locked points per user (prevents double-spending)
 *   - cp: Cached points from Google Sheets
 *   - ct: Cache timestamp for staleness detection
 *
 * BID TRACKING:
 *   - h: Session history (all completed auctions)
 *   - pc: Pending bid confirmations with timeouts
 *   - lb: Last bid time per user (rate limiting)
 *
 * TIMERS & LIFECYCLE:
 *   - th: Timer handles for cleanup
 *   - pauseTimer: Pause state timer
 *   - cacheRefreshTimer: Auto-refresh interval
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * RACE CONDITION PREVENTION
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * CRITICAL MECHANISMS:
 *
 * 1. POINTS LOCKING:
 *    - When a user bids, their points are immediately locked
 *    - Prevents simultaneous bids on multiple items exceeding total points
 *    - Atomic lock/unlock operations with state persistence
 *    - Shared across both bidding modules (bidding.js + auctioneering.js)
 *
 * 2. BID VALIDATION:
 *    - First bid can MATCH starting price (allows auction to start)
 *    - Subsequent bids must EXCEED current bid (prevents ties)
 *    - Real-time availability check: totalPoints - lockedPoints
 *    - Self-overbidding only locks the difference
 *
 * 3. RATE LIMITING:
 *    - 3-second cooldown between bids per user
 *    - Prevents spam and accidental duplicate submissions
 *    - Timestamp-based tracking in st.lb
 *
 * 4. TIME EXTENSION LOGIC:
 *    - Bids in final 60 seconds extend auction by 1 minute
 *    - Maximum 60 extensions prevents infinite auctions
 *    - Timers are CLEARED then RESCHEDULED to prevent double-firing
 *
 * 5. PENDING CONFIRMATION HANDLING:
 *    - Higher pending bids cancel lower pending bids
 *    - Automatic cleanup of stale confirmations (60s timeout)
 *    - Thread locking prevents new bids during finalization
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * KEY FEATURES
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * BIDDING:
 *   ✓ Instant bidding (auctioneering mode) - no confirmations
 *   ✓ Confirmed bidding (standalone mode) - reaction-based acceptance
 *   ✓ Batch auctions - multiple winners for identical items
 *   ✓ Self-overbidding - users can increase their own bids
 *   ✓ Bid validation with boundary checks (max 99,999,999 pts)
 *
 * POINTS MANAGEMENT:
 *   ✓ Real-time points locking/unlocking
 *   ✓ Auto-refresh cache every 30 minutes during auctions
 *   ✓ Case-insensitive username matching
 *   ✓ Google Sheets integration for persistence
 *   ✓ Stale cache detection and cleanup
 *
 * SAFETY & RECOVERY:
 *   ✓ Thread locking on auction end (prevents late bids)
 *   ✓ Admin audit tools (!auctionaudit, !fixlockedpoints)
 *   ✓ State recovery from Google Sheets (survives Koyeb restarts)
 *   ✓ Comprehensive error handling with safe operations
 *   ✓ Graceful degradation on permission failures
 *
 * AUTOMATION:
 *   ✓ Automatic session finalization with results submission
 *   ✓ Going once/twice/final call announcements
 *   ✓ Countdown timers on bid confirmations
 *   ✓ Auto-archive completed auction threads
 *   ✓ Scheduled cleanup of pending confirmations
 *
 * ADMIN TOOLS:
 *   ✓ Force reset (!resetauction) - nuclear option for stuck auctions
 *   ✓ Recovery tools (!recoverauction) - selective cleanup
 *   ✓ Locked points audit - detect and fix stuck points
 *   ✓ Command aliases for convenience (!b, !pts, !ql)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * BIDDING LOGIC FLOW
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * STANDALONE MODE (!bid command):
 *   1. Validate user has ELYSIUM role
 *   2. Check rate limit (3s cooldown)
 *   3. Validate bid amount (integer, positive, not too large)
 *   4. Calculate available points (total - locked)
 *   5. Check if self-overbidding (only lock difference)
 *   6. Send confirmation message with reactions
 *   7. Wait for user to react (✅ confirm / ❌ cancel)
 *   8. On confirm:
 *      - Unlock previous winner's points
 *      - Lock new bidder's points
 *      - Update auction state
 *      - Check if time extension needed (<60s remaining)
 *      - Announce new high bid
 *   9. Auto-timeout after 10 seconds if no reaction
 *
 * AUCTIONEERING MODE (procBidAuctioneering):
 *   1. Validate user has ELYSIUM role
 *   2. Check rate limit (3s cooldown)
 *   3. Validate bid amount (integer, positive, not too large)
 *   4. Calculate available points (total - locked)
 *   5. Check if self-overbidding (only lock difference)
 *   6. INSTANT PROCESSING (no confirmation):
 *      - Unlock previous winner's points immediately
 *      - Lock new bidder's points immediately
 *      - Update auction state immediately
 *      - Check if time extension needed (<60s remaining)
 *      - Send immediate success confirmation
 *      - Announce new high bid
 *   7. Return success result
 *
 * TIME EXTENSION MECHANISM:
 *   - If bid occurs with <60s remaining AND extensions < 60:
 *     1. CLEAR all auction timers (prevents race condition)
 *     2. ADD 60 seconds to endTime
 *     3. INCREMENT extension counter
 *     4. RESCHEDULE all timers with new endTime
 *     5. Announce time extension to channel
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * @author ELYSIUM Development Team
 * @version 6.0.0
 * @since 2024
 */

// ═══════════════════════════════════════════════════════════════════════════
// DEPENDENCIES
// ═══════════════════════════════════════════════════════════════════════════

const { EmbedBuilder } = require("discord.js");
const fs = require("fs");
const { normalizeUsername, formatDuration } = require("./modules/bidding/utilities");
const errorHandler = require('./utils/error-handler');
const { PointsCache } = require('./utils/points-cache');
const { SheetAPI } = require('./utils/sheet-api');

// ═══════════════════════════════════════════════════════════════════════════
// MODULE REFERENCES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Reference to auctioneering module for dual-mode operation
 * @type {Object|null}
 */
let auctioneering = null;

/**
 * Bot configuration object loaded from config.json
 * @type {Object|null}
 */
let cfg = null;

/**
 * Unified Google Sheets API client
 * @type {SheetAPI|null}
 */
let sheetAPI = null;

/**
 * Discord channel cache for reducing API calls
 * @type {Object|null}
 */
let discordCache = null;

// ═══════════════════════════════════════════════════════════════════════════
// SYSTEM CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Path to local state persistence file
 * @constant {string}
 */
const SF = "./bidding-state.json";

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

/**
 * Standardized error messages for consistent user experience
 * @constant {Object}
 */
const ERROR_MESSAGES = {
  NO_ROLE: `${EMOJI.ERROR} You need the ELYSIUM role to participate in auctions`,
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
  "!bstatus": "!bidstatus",      // Bid status check
  "!pts": "!mypoints",           // Quick points check
  "!mypts": "!mypoints",         // Alternative points check
  "!mp": "!mypoints",            // Shortest points check
};

// ═══════════════════════════════════════════════════════════════════════════
// CENTRALIZED STATE OBJECT
// ═══════════════════════════════════════════════════════════════════════════

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
let st = {
  /** @type {Object|null} Active auction details (item, bids, winner, status) */
  a: null,

  /**
   * @type {Object.<string, number>} Locked points per user
   * Key: normalized username, Value: points locked
   * SHARED across bidding.js and auctioneering.js modules
   */
  lp: {},

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
};

/**
 * Admin check function reference (injected by initializeBidding)
 * @type {Function|null}
 */
let isAdmFunc = null;

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS - Role & Permission Checks
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Checks if member has ELYSIUM role required for bidding
 *
 * @param {GuildMember} m - Discord guild member object
 * @returns {boolean} True if member has ELYSIUM role
 */
const hasRole = (m) => m.roles.cache.some((r) => r.name === "ELYSIUM");

/**
 * Checks if member has admin privileges based on configured admin roles
 *
 * @param {GuildMember} m - Discord guild member object
 * @param {Object} c - Bot configuration with admin_roles array
 * @returns {boolean} True if member has any admin role
 */
const isAdm = (m, c) =>
  m.roles.cache.some((r) => c.admin_roles.includes(r.name));

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS - Time & Duration Formatting
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generates timestamp string in Manila timezone (MM/DD/YYYY HH:MM)
 *
 * Uses optimized cached Manila time conversion from timestamp-cache utility.
 *
 * @returns {string} Formatted timestamp string
 * @example
 * ts() // "12/25/2024 14:30"
 */
const { getFormattedManilaTime } = require('./utils/timestamp-cache');
const ts = getFormattedManilaTime;

/**
 * Formats duration in minutes to human-readable string
 *
 * Uses shared utility from modules/bidding/utilities.js
 *
 * @param {number} m - Duration in minutes
 * @returns {string} Formatted duration string
 * @example
 * fmtDur(45)   // "45min"
 * fmtDur(90)   // "1h 30min"
 * fmtDur(120)  // "2h"
 */
const fmtDur = formatDuration;

/**
 * Formats time in milliseconds to human-readable string
 *
 * Uses shared formatUptime utility from utils/common.js
 *
 * @param {number} ms - Time in milliseconds
 * @returns {string} Formatted time string
 * @example
 * fmtTime(30000)    // "30s"
 * fmtTime(90000)    // "1m 30s"
 * fmtTime(3600000)  // "1h"
 */
const { formatUptime: fmtTime } = require('./utils/common');

// ═══════════════════════════════════════════════════════════════════════════
// POINTS LOCKING SYSTEM - Race Condition Prevention
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calculates available (unlocked) points for a user
 *
 * CRITICAL: This function prevents users from bidding more points than they have
 * across multiple simultaneous auctions by subtracting locked points from total.
 *
 * @param {string} u - Username (will be normalized)
 * @param {number} tot - Total points the user has
 * @returns {number} Available points (never negative)
 * @example
 * // User has 1000 total points, 300 locked in another auction
 * avail("Username", 1000) // Returns 700
 */
const avail = (u, tot) => Math.max(0, tot - (st.lp[normalizeUsername(u)] || 0));

/**
 * Locks points for a user (atomic operation with persistence)
 *
 * CRITICAL RACE CONDITION PREVENTION:
 * - Immediately locks points when bid is placed
 * - Persists state to prevent double-spending if bot crashes
 * - Shared across bidding.js and auctioneering.js modules
 *
 * USAGE:
 * - Called when user places a bid
 * - Called when user increases their existing bid (only lock difference)
 *
 * @param {string} u - Username (will be normalized)
 * @param {number} amt - Amount of points to lock
 */
const lock = (u, amt) => {
  const key = normalizeUsername(u);
  st.lp[key] = (st.lp[key] || 0) + amt;
  save();
};

/**
 * Unlocks points for a user (atomic operation with persistence)
 *
 * CRITICAL RACE CONDITION PREVENTION:
 * - Releases points when user is outbid
 * - Releases points when auction is cancelled
 * - Automatically removes entry if points reach 0 (keeps state clean)
 *
 * USAGE:
 * - Called when user is outbid by someone else
 * - Called when auction is cancelled or skipped
 * - Called after session finalization
 *
 * @param {string} u - Username (will be normalized)
 * @param {number} amt - Amount of points to unlock
 */
const unlock = (u, amt) => {
  const key = normalizeUsername(u);
  st.lp[key] = Math.max(0, (st.lp[key] || 0) - amt);
  if (st.lp[key] === 0) delete st.lp[key];
  save();
};

// ═══════════════════════════════════════════════════════════════════════════
// STATE PERSISTENCE - Dual Storage Strategy
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Last successful Google Sheets sync timestamp
 * @type {number}
 */
let lastSheetSyncTime = 0;

/**
 * Interval between automatic Google Sheets syncs (5 minutes)
 * @constant {number}
 */
const SHEET_SYNC_INTERVAL = 5 * 60 * 1000;

/**
 * Persists bidding state to both local file and Google Sheets
 *
 * DUAL STORAGE STRATEGY:
 * 1. LOCAL FILE (bidding-state.json):
 *    - Fast access for immediate state recovery
 *    - May be ephemeral on Koyeb (resets on restart)
 *
 * 2. GOOGLE SHEETS:
 *    - Persistent across Koyeb restarts
 *    - Synced every 5 minutes (throttled to prevent API rate limits)
 *    - Force sync available via forceSync parameter
 *
 * STATE CLEANING:
 * - Removes circular references from pending confirmations
 * - Excludes non-serializable timer handles
 *
 * @param {boolean} [forceSync=false] - Force immediate Google Sheets sync
 */
function save(forceSync = false) {
  try {
    const { th, pauseTimer, cacheRefreshTimer, ...s } = st;

    // Clean up circular references from pending confirmations
    const cleanState = {
      ...s,
      pc: Object.fromEntries(
        Object.entries(s.pc).map(([key, val]) => {
          const { auctStateRef, auctRef, ...cleanVal } = val;
          return [key, cleanVal];
        })
      ),
      // Convert PointsCache instance to plain object for JSON serialization
      cp: s.cp && s.cp.toObject ? s.cp.toObject() : s.cp,
    };

    // Always save to local file for quick access (works even on ephemeral Koyeb FS)
    try {
      fs.writeFileSync(SF, JSON.stringify(cleanState, null, 2));
    } catch (fileErr) {
      // On Koyeb, file system might be read-only or restricted
      console.warn(
        "⚠️ Local file save failed (expected on Koyeb):",
        fileErr.message
      );
    }

    // Sync to Google Sheets for persistence across Koyeb restarts
    const now = Date.now();
    const shouldSync =
      forceSync || now - lastSheetSyncTime > SHEET_SYNC_INTERVAL;

    if (cfg && cfg.sheet_webhook_url && shouldSync) {
      lastSheetSyncTime = now;
      saveBiddingStateToSheet().catch((err) => {
        console.error("❌ Background sheet sync failed:", err.message);
      });
      if (forceSync) {
        console.log("📊 Forced state sync to Google Sheets");
      }
    }
  } catch (e) {
    console.error("❌ Save:", e);
  }
}

/**
 * Loads bidding state from local file or Google Sheets
 *
 * LOADING PRIORITY:
 * 1. LOCAL FILE: Attempt to load from bidding-state.json first (fastest)
 * 2. GOOGLE SHEETS: Fallback for Koyeb restarts where local file is lost
 * 3. FRESH STATE: Start with clean state if both sources fail
 *
 * STATE RESTORATION:
 * - Preserves: queue, active auction, locked points, history
 * - Resets: timers, rate limits, pause state, cache refresh timer
 *
 * @returns {Promise<boolean>} True if state was loaded successfully
 */
async function load() {
  try {
    // Try local file first (fast)
    if (fs.existsSync(SF)) {
      const d = JSON.parse(fs.readFileSync(SF, "utf8"));
      st = {
        ...st,
        ...d,
        // Wrap points cache back in PointsCache for efficient lookups
        cp: d.cp ? new PointsCache(d.cp) : null,
        th: {},
        lb: {},
        pause: false,
        pauseTimer: null,
        auctionLock: false,
        cacheRefreshTimer: null,
      };
      console.log("✅ Loaded state from local file");
      return true;
    }
  } catch (e) {
    console.warn("⚠️ Local file load failed:", e.message);
  }

  // Fallback to Google Sheets (for Koyeb restarts)
  if (cfg && cfg.sheet_webhook_url) {
    console.log("📊 Local file not found, loading from Google Sheets...");
    try {
      const sheetState = await loadBiddingStateFromSheet(cfg.sheet_webhook_url);
      if (sheetState) {
        st = {
          ...st,
          q: sheetState.queue || [],
          a: sheetState.activeAuction || null,
          lp: sheetState.lockedPoints || {},
          h: sheetState.history || [],
          th: {},
          lb: {},
          pause: false,
          pauseTimer: null,
          auctionLock: false,
          cacheRefreshTimer: null,
        };
        console.log("✅ Loaded state from Google Sheets");
        return true;
      }
    } catch (err) {
      console.error("❌ Sheet load failed:", err.message);
    }
  }

  console.log("ℹ️ Starting with fresh state");
  return false;
}

/**
 * Initializes the bidding module with configuration and dependencies
 *
 * SETUP:
 * - Injects config and admin check function
 * - Links auctioneering module for dual-mode support
 * - Starts automatic cleanup schedule for stale confirmations
 *
 * MUST be called before any bidding operations
 *
 * @param {Object} config - Bot configuration object
 * @param {Function} isAdminFunc - Function to check if user has admin privileges
 * @param {Object} auctioneeringRef - Reference to auctioneering.js module
 * @param {Object} cache - Discord channel cache instance
 */
function initializeBidding(config, isAdminFunc, auctioneeringRef, cache = null) {
  isAdmFunc = isAdminFunc;
  cfg = config;
  auctioneering = auctioneeringRef;
  sheetAPI = new SheetAPI(config.sheet_webhook_url);
  discordCache = cache;

  // Start cleanup schedule for pending confirmations
  startCleanupSchedule();
}

/**
 * Returns color value (passthrough for future color customization)
 *
 * @param {number} color - Hex color value
 * @returns {number} The same color value
 */
function getColor(color) {
  return color;
}

/**
 * Clears all active timers from the bidding state
 * Optimization: Consolidates repeated timer clearing logic (5+ occurrences)
 *
 * @returns {number} Number of timers cleared
 */
function clearAllTimers() {
  if (!st.th || typeof st.th !== 'object') return 0;
  const count = Object.keys(st.th).length;
  Object.values(st.th).forEach((h) => clearTimeout(h));
  st.th = {};
  return count;
}

// ═══════════════════════════════════════════════════════════════════════════
// GOOGLE SHEETS API - Points & State Management
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Fetches bidding points from Google Sheets via webhook
 *
 * POINTS STRUCTURE:
 * - Key: username (case-insensitive matching)
 * - Value: available points balance
 *
 * FAILURE HANDLING:
 * - Returns null on any error (network, HTTP, parsing)
 * - Caller should handle null gracefully (show cache error)
 *
 * @param {string} url - Google Sheets webhook URL
 * @returns {Promise<Object|null>} Points object or null on failure
 */
async function fetchPts(url) {
  try {
    const result = await sheetAPI.call('getBiddingPoints');
    return result.points || {};
  } catch (e) {
    console.error("❌ Fetch pts:", e);
    return null;
  }
}

/**
 * Submits auction results to Google Sheets with retry logic
 *
 * RESULT FORMAT:
 * - Array of objects: { member: username, totalSpent: points }
 * - Includes ALL members (winners and non-winners with 0 spent)
 *
 * RETRY LOGIC:
 * - Up to 3 attempts with exponential backoff (2s, 4s, 6s)
 * - Returns detailed error info on final failure
 *
 * CRITICAL:
 * - Only called after session ends (all auctions complete)
 * - Points are deducted from user balances in Google Sheets
 *
 * @param {string} url - Google Sheets webhook URL
 * @param {Array<Object>} res - Results array with member and totalSpent
 * @param {string} time - Session timestamp (Manila timezone)
 * @returns {Promise<Object>} { ok: boolean, d: data, err: error, res: results }
 */
async function submitRes(url, res, time) {
  if (!time || !res || res.length === 0)
    return { ok: false, err: "Missing data" };
  try {
    const d = await sheetAPI.call('submitBiddingResults', {
      results: res,
      timestamp: time,
    });
    if (d.status === "ok") {
      console.log("✅ Submitted");
      return { ok: true, d };
    }
    throw new Error(d.message || "Unknown");
  } catch (e) {
    console.error(`❌ Submit error:`, e.message);
    return { ok: false, err: e.message, res };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// POINTS CACHE MANAGEMENT - Auto-Refresh System
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Loads and caches bidding points from Google Sheets
 *
 * CACHING STRATEGY:
 * - Caches points in memory (st.cp) for fast access during bidding
 * - Records cache timestamp (st.ct) for staleness detection
 * - Automatically starts auto-refresh if auction is active
 *
 * AUTO-REFRESH:
 * - Refreshes cache every 30 minutes during active auctions
 * - Keeps data fresh without manual intervention
 * - Prevents stale point balances in long auction sessions
 *
 * @param {string} url - Google Sheets webhook URL
 * @returns {Promise<boolean>} True if cache loaded successfully
 */
async function loadCache(url) {
  // Validate URL parameter
  if (!url || typeof url !== "string") {
    console.error("❌ Invalid URL provided to loadCache");
    return false;
  }

  console.log("🔄 Loading cache...");
  const t0 = Date.now();
  const p = await fetchPts(url);
  if (!p) {
    console.error("❌ Cache fail");
    return false;
  }
  // Wrap points data in PointsCache for O(1) lookups
  st.cp = new PointsCache(p);
  st.ct = Date.now();
  save();
  console.log(
    `✅ Cache: ${Date.now() - t0}ms - ${Object.keys(p).length} members`
  );

  // Start auto-refresh timer if auction is active
  if (st.a && st.a.status === "active") {
    startCacheAutoRefresh(url);
  }

  return true;
}

/**
 * Starts automatic cache refresh interval (30 minutes)
 *
 * AUTO-REFRESH BEHAVIOR:
 * - Only runs while auction is active
 * - Automatically stops when auction ends
 * - Prevents memory leaks by clearing existing timer first
 *
 * @param {string} url - Google Sheets webhook URL for refresh
 */
function startCacheAutoRefresh(url) {
  // Clear existing timer
  if (st.cacheRefreshTimer) {
    clearInterval(st.cacheRefreshTimer);
  }

  // Set up auto-refresh every 30 minutes
  st.cacheRefreshTimer = setInterval(async () => {
    try {
      if (st.a && st.a.status === "active") {
        console.log("🔄 Auto-refreshing cache...");
        await loadCache(url);
      } else {
        // Stop refreshing if no active auction
        stopCacheAutoRefresh();
      }
    } catch (error) {
      console.error("❌ Error in cache auto-refresh:", error.message);
      // Continue interval, don't break it
    }
  }, CACHE_REFRESH_INTERVAL);

  console.log("✅ Cache auto-refresh enabled (every 30 minutes)");
}

/**
 * Stops automatic cache refresh interval
 *
 * CLEANUP:
 * - Clears interval timer
 * - Nullifies timer reference
 * - Called when auction ends or is cancelled
 */
function stopCacheAutoRefresh() {
  if (st.cacheRefreshTimer) {
    clearInterval(st.cacheRefreshTimer);
    st.cacheRefreshTimer = null;
    console.log("⏹️ Cache auto-refresh stopped");
  }
}

/**
 * Retrieves points for a user from cache with case-insensitive matching
 *
 * MATCHING LOGIC:
 * 1. Try exact match first (fastest)
 * 2. Try case-insensitive match (fallback)
 * 3. Return 0 if user not found
 *
 * IMPORTANT: Returns 0 for unknown users (allows them to bid with 0 points warning)
 *
 * @param {string} u - Username to look up
 * @returns {number|null} Points balance or null if cache not loaded
 */
function getPts(u) {
  if (!st.cp) return null;
  // Use PointsCache for efficient O(1) lookup
  return st.cp.getPoints(u);
}

/**
 * Logs critical bid rejections to admin channel for visibility and debugging
 *
 * THROTTLING:
 * - Only logs once per user per 30 seconds to prevent spam
 * - Stores last log time per user in st.lastBidRejectionLog
 *
 * LOG DETAILS:
 * - User info (name, mention, ID)
 * - Item being bid on
 * - Bid amount
 * - Rejection reason
 * - Points breakdown (total, available, locked, needed)
 *
 * ASYNC & NON-BLOCKING:
 * - Runs asynchronously after 0ms timeout (doesn't block bidding)
 * - Silent fail if admin channel unavailable (doesn't break bidding)
 *
 * @param {Client} client - Discord client instance
 * @param {Object} config - Bot configuration with admin_logs_channel_id
 * @param {Object} details - Rejection details (user, item, bidAmount, reason, etc.)
 */
async function logBidRejection(client, config, details) {
  try {
    if (!client || !config || !config.admin_logs_channel_id) return;

    // Debounce: Only log every 30 seconds per user to avoid spam
    const now = Date.now();
    const key = `${details.userId}_bid_rejection`;
    if (st.lastBidRejectionLog && st.lastBidRejectionLog[key]) {
      const timeSinceLastLog = now - st.lastBidRejectionLog[key];
      if (timeSinceLastLog < 30000) return; // Skip if logged recently
    }

    if (!st.lastBidRejectionLog) st.lastBidRejectionLog = {};
    st.lastBidRejectionLog[key] = now;

    // Send to admin logs asynchronously (don't block bid processing)
    setTimeout(async () => {
      try {
        const adminLogs = await discordCache?.getChannel('admin_logs_channel_id').catch(() => null);
        if (!adminLogs) return;

        const embed = new EmbedBuilder()
          .setColor(0xFFA500) // Orange for warning
          .setTitle(`${EMOJI.WARNING} Bid Rejected`)
          .setDescription(`**User:** ${details.user} (<@${details.userId}>)\n**Item:** ${details.item}\n**Bid:** ${details.bidAmount}pts\n**Reason:** ${details.reason}`)
          .setTimestamp();

        if (details.totalPoints !== undefined) embed.addFields({ name: 'Total Points', value: `${details.totalPoints}pts`, inline: true });
        if (details.availablePoints !== undefined) embed.addFields({ name: 'Available', value: `${details.availablePoints}pts`, inline: true });
        if (details.neededPoints !== undefined) embed.addFields({ name: 'Needed', value: `${details.neededPoints}pts`, inline: true });

        await adminLogs.send({ embeds: [embed] });
      } catch (err) {
        // Silent fail - don't block bidding if admin logging fails
        console.error('Failed to log bid rejection to admin channel:', err.message);
      }
    }, 0);
  } catch (err) {
    // Silent fail
    console.error('logBidRejection error:', err.message);
  }
}

/**
 * Clears points cache and stops auto-refresh
 *
 * CLEANUP:
 * - Stops auto-refresh timer (prevents memory leaks)
 * - Nullifies cache (st.cp) and timestamp (st.ct)
 * - Persists cleared state
 *
 * WHEN TO USE:
 * - After session finalization
 * - When starting fresh auction session
 * - When cache is too stale (>60 minutes old)
 *
 * SIDE EFFECTS:
 * - Users won't be able to bid until cache is reloaded
 * - Any pending bids will fail with "cache not loaded" error
 */
function clearCache() {
  console.log("🧹 Clear cache");
  stopCacheAutoRefresh();
  st.cp = null;
  st.ct = null;
  save();
}

// ═══════════════════════════════════════════════════════════════════════════
// AUCTION PAUSE/RESUME SYSTEM
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Pauses active auction (for bid confirmation in final seconds)
 *
 * PAUSE MECHANISM:
 * - Sets pause flag (st.pause = true)
 * - Records remaining time (endTime - now)
 * - Records pause timestamp
 * - CLEARS all auction timers (going once/twice/final/end)
 *
 * CRITICAL:
 * - Only works if auction is active and not already paused
 * - Preserves exact remaining time for accurate resume
 * - Prevents timer race conditions during confirmation
 *
 * USAGE:
 * - Called automatically when bid occurs in final 10 seconds
 * - Gives user time to confirm without auction ending
 *
 * @returns {boolean} True if successfully paused, false otherwise
 */
function pauseAuction() {
  if (st.pause || !st.a || st.a.status !== "active") return false;
  st.pause = true;
  st.a.pausedAt = Date.now();
  st.a.remainingTime = st.a.endTime - Date.now();

  ["goingOnce", "goingTwice", "finalCall", "auctionEnd"].forEach((k) => {
    if (st.th[k]) {
      clearTimeout(st.th[k]);
      delete st.th[k];
    }
  });

  console.log(`${EMOJI.PAUSE} PAUSED: ${st.a.remainingTime}ms remaining`);
  save();
  return true;
}

/**
 * Resumes paused auction with time extension if needed
 *
 * RESUME MECHANISM:
 * - Clears pause flag (st.pause = false)
 * - Calculates new endTime based on remaining time
 * - EXTENDS to 60 seconds minimum if paused with <60s remaining
 * - Reschedules all auction timers
 *
 * TIME EXTENSION LOGIC:
 * - If remaining time was <60s: Extend to 60s from now
 * - If remaining time was >=60s: Resume with original remaining time
 * - Resets "going once/twice" flags if time is extended
 *
 * CRITICAL:
 * - Only works if auction is paused and active
 * - Cleans up pause metadata (pausedAt, remainingTime)
 * - Reschedules timers with new endTime
 *
 * USAGE:
 * - Called after bid confirmation (confirm/cancel/timeout)
 * - Ensures auction continues fairly after pause
 *
 * @param {Client} cli - Discord client instance
 * @param {Object} cfg - Bot configuration object
 * @returns {boolean} True if successfully resumed, false otherwise
 */
function resumeAuction(cli, cfg) {
  if (!st.pause || !st.a || st.a.status !== "active") return false;
  st.pause = false;

  const wasUnder60 = st.a.remainingTime < 60000;
  if (wasUnder60) {
    st.a.endTime = Date.now() + 60000;
    st.a.goingOnceAnnounced = false;
    st.a.goingTwiceAnnounced = false;
    console.log(
      `${EMOJI.PLAY} RESUME: Extended to 60s (was ${Math.floor(
        st.a.remainingTime / 1000
      )}s)`
    );
  } else {
    st.a.endTime = Date.now() + st.a.remainingTime;
    console.log(`${EMOJI.PLAY} RESUME: ${st.a.remainingTime}ms remaining`);
  }

  delete st.a.pausedAt;
  delete st.a.remainingTime;

  schedTimers(cli, cfg);
  save();
  return true;
}

// AUCTION LIFECYCLE
// startSess removed - unused function

async function startNext(cli, cfg) {
  if (st.q.length === 0) {
    await finalize(cli, cfg);
    return;
  }

  const d = st.q[0];
  const ch = await discordCache.getChannel('bidding_channel_id');

  const isBatch = d.quantity > 1;
  const threadName = isBatch
    ? `${d.item} x${d.quantity} - ${ts()} | ${d.startPrice}pts | ${fmtDur(
        d.duration
      )}`
    : `${d.item} - ${ts()} | ${d.startPrice}pts | ${fmtDur(d.duration)}`;

  const th = await ch.threads.create({
    name: threadName,
    autoArchiveDuration: 60,
    reason: `Auction: ${d.item}`,
  });

  st.a = {
    ...d,
    threadId: th.id,
    curBid: d.startPrice,
    curWin: null,
    curWinId: null,
    bids: [],
    winners: [], // For batch auctions
    endTime: null,
    extCnt: 0,
    status: "preview",
    go1: false,
    go2: false,
  };

  const previewEmbed = new EmbedBuilder()
    .setColor(getColor(COLORS.AUCTION))
    .setTitle(`${EMOJI.TROPHY} AUCTION STARTING`)
    .setDescription(`**${d.item}**${isBatch ? ` x${d.quantity}` : ""}`)
    .addFields(
      {
        name: `${EMOJI.BID} Starting Bid`,
        value: `${d.startPrice} points`,
        inline: true,
      },
      {
        name: `${EMOJI.TIME} Duration`,
        value: fmtDur(d.duration),
        inline: true,
      },
      {
        name: `${EMOJI.LIST} Items Left`,
        value: `${st.q.length - 1}`,
        inline: true,
      }
    )
    .setFooter({ text: "Starts in 30 seconds" })
    .setTimestamp();

  if (isBatch) {
    previewEmbed.addFields({
      name: `${EMOJI.FIRE} Batch Auction`,
      value: `Top ${d.quantity} bidders will win!`,
      inline: false,
    });
  }

  await th.send({
    content: "@everyone",
    embeds: [previewEmbed],
  });

  st.th.aStart = setTimeout(
    async () => await activate(cli, cfg, th),
    PREVIEW_TIME
  );
  save();
}

async function activate(cli, cfg, th) {
  st.a.status = "active";
  st.a.endTime = Date.now() + st.a.duration * 60000;

  const isBatch = st.a.quantity > 1;

  const activeEmbed = new EmbedBuilder()
    .setColor(COLORS.SUCCESS)
    .setTitle(`${EMOJI.FIRE} BIDDING NOW!`)
    .setDescription(
      `Type \`!bid <amount>\` to bid${
        isBatch
          ? `\n\n**${st.a.quantity} items available** - Top ${st.a.quantity} bidders win!`
          : ""
      }`
    )
    .addFields(
      {
        name: `${EMOJI.BID} Current`,
        value: `${st.a.curBid} pts`,
        inline: true,
      },
      { name: `${EMOJI.TIME} Time`, value: fmtDur(st.a.duration), inline: true }
    )
    .setFooter({
      text: `${EMOJI.CLOCK} 10s confirm • ${EMOJI.LOCK} 3s rate limit`,
    });

  await th.send({ embeds: [activeEmbed] });
  schedTimers(cli, cfg);
  save();
}

function schedTimers(cli, cfg) {
  const a = st.a,
    t = a.endTime - Date.now();
  ["goingOnce", "goingTwice", "finalCall", "auctionEnd"].forEach((k) => {
    if (st.th[k]) clearTimeout(st.th[k]);
  });
  if (t > TIMEOUTS.GOING_ONCE && !a.go1)
    st.th.goingOnce = setTimeout(
      async () => await ann1(cli, cfg),
      t - TIMEOUTS.GOING_ONCE
    );
  if (t > TIMEOUTS.GOING_TWICE && !a.go2)
    st.th.goingTwice = setTimeout(
      async () => await ann2(cli, cfg),
      t - TIMEOUTS.GOING_TWICE
    );
  if (t > TIMEOUTS.FINAL_CALL)
    st.th.finalCall = setTimeout(
      async () => await ann3(cli, cfg),
      t - TIMEOUTS.FINAL_CALL
    );
  st.th.auctionEnd = setTimeout(async () => await endAuc(cli, cfg), t);
}

async function ann1(cli, cfg) {
  const a = st.a;
  if (!a || a.status !== "active" || st.pause) return;
  const th = await cli.channels.fetch(a.threadId);
  await th.send({
    content: "@everyone",
    embeds: [
      new EmbedBuilder()
        .setColor(COLORS.WARNING)
        .setTitle(`${EMOJI.WARNING} GOING ONCE!`)
        .setDescription("1 min left")
        .addFields({
          name: `${EMOJI.BID} Current`,
          value: a.curWin
            ? `${a.curBid}pts by ${a.curWin}`
            : `${a.startPrice}pts (no bids)`,
          inline: false,
        }),
    ],
  });
  a.go1 = true;
  save();
}

async function ann2(cli, cfg) {
  const a = st.a;
  if (!a || a.status !== "active" || st.pause) return;
  const th = await cli.channels.fetch(a.threadId);
  await th.send({
    content: "@everyone",
    embeds: [
      new EmbedBuilder()
        .setColor(getColor(COLORS.WARNING))
        .setTitle(`${EMOJI.WARNING} GOING TWICE!`)
        .setDescription("30s left")
        .addFields({
          name: `${EMOJI.BID} Current`,
          value: a.curWin
            ? `${a.curBid}pts by ${a.curWin}`
            : `${a.startPrice}pts (no bids)`,
          inline: false,
        }),
    ],
  });
  a.go2 = true;
  save();
}

async function ann3(cli, cfg) {
  const a = st.a;
  if (!a || a.status !== "active" || st.pause) return;
  const th = await cli.channels.fetch(a.threadId);
  await th.send({
    content: "@everyone",
    embeds: [
      new EmbedBuilder()
        .setColor(getColor(COLORS.ERROR))
        .setTitle(`${EMOJI.WARNING} FINAL CALL!`)
        .setDescription("10s left")
        .addFields({
          name: `${EMOJI.BID} Current`,
          value: a.curWin
            ? `${a.curBid}pts by ${a.curWin}`
            : `${a.startPrice}pts (no bids)`,
          inline: false,
        }),
    ],
  });
  save();
}

async function endAuc(cli, cfg) {
  const a = st.a;
  if (!a) return;
  a.status = "ended";
  const th = await cli.channels.fetch(a.threadId);

  const isBatch = a.quantity > 1;

  if (isBatch && a.bids.length > 0) {
    // Batch auction - determine winners
    const sortedBids = a.bids
      .sort((x, y) => y.amount - x.amount)
      .slice(0, a.quantity);

    a.winners = sortedBids.map((b) => ({
      username: b.user,
      userId: b.userId,
      amount: b.amount,
    }));

    const winnersList = a.winners
      .map((w, i) => `${i + 1}. <@${w.userId}> - ${w.amount}pts`)
      .join("\n");

    await th.send({
      embeds: [
        new EmbedBuilder()
          .setColor(getColor(COLORS.AUCTION))
          .setTitle(`${EMOJI.AUCTION} SOLD!`)
          .setDescription(`**${a.item}** x${a.quantity} sold!`)
          .addFields({
            name: `${EMOJI.TROPHY} Winners`,
            value: winnersList,
            inline: false,
          })
          .setFooter({ text: "Deducted after session" })
          .setTimestamp(),
      ],
    });

    // Add to history
    a.winners.forEach((w) => {
      st.h.push({
        item: a.item,
        winner: w.username,
        winnerId: w.userId,
        amount: w.amount,
        timestamp: Date.now(),
      });
    });
  } else if (a.curWin) {
    // Single item auction
    await th.send({
      embeds: [
        new EmbedBuilder()
          .setColor(getColor(COLORS.AUCTION))
          .setTitle(`${EMOJI.AUCTION} SOLD!`)
          .setDescription(`**${a.item}** sold!`)
          .addFields(
            {
              name: `${EMOJI.TROPHY} Winner`,
              value: `<@${a.curWinId}>`,
              inline: true,
            },
            {
              name: `${EMOJI.BID} Price`,
              value: `${a.curBid}pts`,
              inline: true,
            }
          )
          .setFooter({ text: "Deducted after session" })
          .setTimestamp(),
      ],
    });
    st.h.push({
      item: a.item,
      winner: a.curWin,
      winnerId: a.curWinId,
      amount: a.curBid,
      timestamp: Date.now(),
    });
  } else {
    // No bids
    await th.send({
      embeds: [
        new EmbedBuilder()
          .setColor(COLORS.INFO)
          .setTitle(`${EMOJI.ERROR} NO BIDS`)
          .setDescription(`**${a.item}** - no bids`)
          .setFooter({ text: "Next item..." }),
      ],
    });
  }

  // Lock the thread first to prevent new messages
  if (typeof th.setLocked === "function") {
    await th
      .setLocked(true, "Auction ended")
      .catch((err) =>
        console.warn(`⚠️ Failed to lock thread ${th.id}:`, err.message)
      );
  }

  await th
    .setArchived(true, "Ended")
    .catch((err) =>
      console.warn(`⚠️ Failed to archive thread ${th.id}:`, err.message)
    );
  st.q.shift();
  st.a = null;
  save();

  if (st.q.length > 0) {
    const n = st.q[0];
    await th.parent.send(
      `${EMOJI.CLOCK} Next in 20s...\n${EMOJI.LIST} **${n.item}** - ${n.startPrice}pts`
    );
    st.th.next = setTimeout(
      async () => await startNext(cli, cfg),
      TIMEOUTS.NEXT_ITEM_DELAY
    );
  } else {
    setTimeout(async () => await finalize(cli, cfg), TIMEOUTS.FINALIZE_DELAY);
  }
}

// loadPointsCacheForAuction removed - unused function

async function submitSessionTally(config, sessionItems) {
  if (!st.cp || sessionItems.length === 0) {
    console.log(`⚠️ No items to tally`);
    return;
  }

  if (!st.sd) st.sd = ts();

  const allMembers = st.cp.getAllUsernames();
  const winners = {};

  sessionItems.forEach((item) => {
    const normalizedWinner = normalizeUsername(item.winner);
    winners[normalizedWinner] = (winners[normalizedWinner] || 0) + item.amount;
  });

  const res = allMembers.map((m) => {
    const normalizedMember = normalizeUsername(m);
    return {
      member: m,
      totalSpent: winners[normalizedMember] || 0,
    };
  });

  const sub = await submitRes(config.sheet_webhook_url, res, st.sd);

  if (sub.ok) {
    console.log(`✅ Session tally submitted`);
    st.h = [];
    st.sd = null;
    st.lp = {};
    clearCache();
  } else {
    console.error(`❌ Tally submission failed:`, sub.err);
  }
}

async function saveBiddingStateToSheet() {
  try {
    const stateToSave = {
      queue: st.q,
      activeAuction: st.a,
      lockedPoints: st.lp,
      history: st.h,
    };

    await sheetAPI.call('saveBotState', {
      state: stateToSave,
    });

    console.log(`✅ Bot state saved to sheet`);
  } catch (e) {
    console.error(`❌ Save state:`, e);
  }
}

async function loadBiddingStateFromSheet(url) {
  try {
    const data = await sheetAPI.call('getBotState');
    return data.state || null;
  } catch (e) {
    console.error(`❌ Load state:`, e);
    return null;
  }
}

async function finalize(cli, cfg) {
  const [adm, bch] = await Promise.all([
    discordCache.getChannel('admin_logs_channel_id'),
    discordCache.getChannel('bidding_channel_id')
  ]);

  // Stop cache auto-refresh
  stopCacheAutoRefresh();

  if (st.h.length === 0) {
    await bch.send(`${EMOJI.SUCCESS} **Session complete!** No sales.`);
    clearCache();
    st.sd = null;
    st.lp = {};
    save();
    return;
  }

  if (!st.sd) st.sd = ts();

  const allMembers = st.cp ? st.cp.getAllUsernames() : [];

  const winners = {};
  st.h.forEach((a) => {
    const normalizedWinner = normalizeUsername(a.winner);
    winners[normalizedWinner] = (winners[normalizedWinner] || 0) + a.amount;
  });

  const res = allMembers.map((m) => {
    const normalizedMember = normalizeUsername(m);
    return {
      member: m,
      totalSpent: winners[normalizedMember] || 0,
    };
  });

  console.log(`${EMOJI.CHART} FINALIZE DEBUG:`);
  console.log("Winners (normalized):", winners);
  console.log(
    "Non-zero results:",
    res.filter((r) => r.totalSpent > 0)
  );

  const sub = await submitRes(cfg.sheet_webhook_url, res, st.sd);

  if (sub.ok) {
    const wList = st.h
      .map((a) => `• **${a.item}**: ${a.winner} - ${a.amount}pts`)
      .join("\n");
    const e = new EmbedBuilder()
      .setColor(getColor(COLORS.SUCCESS))
      .setTitle(`${EMOJI.SUCCESS} Session Complete!`)
      .setDescription("Results submitted")
      .addFields(
        { name: `${EMOJI.CLOCK} Time`, value: st.sd, inline: true },
        { name: `${EMOJI.TROPHY} Sold`, value: `${st.h.length}`, inline: true },
        {
          name: `${EMOJI.BID} Total`,
          value: `${res.reduce((s, r) => s + r.totalSpent, 0)}`,
          inline: true,
        },
        { name: `${EMOJI.LIST} Winners`, value: wList || "None" },
        {
          name: "👥 Members Updated",
          value: `${res.length} (auto-populated 0 for non-winners)`,
          inline: false,
        }
      )
      .setFooter({ text: "Points deducted" })
      .setTimestamp();
    await bch.send({ embeds: [e] });
    await adm.send({ embeds: [e] });
  } else {
    const d = res
      .filter((r) => r.totalSpent > 0)
      .map((r) => `${r.member}: ${r.totalSpent}pts`)
      .join("\n");
    await adm.send({
      embeds: [
        new EmbedBuilder()
          .setColor(getColor(COLORS.ERROR))
          .setTitle(`${EMOJI.ERROR} Submit Failed`)
          .setDescription(`**Error:** ${sub.err}\n**Time:** ${st.sd}`)
          .addFields({
            name: `${EMOJI.LIST} Manual Entry`,
            value: `\`\`\`\n${d}\n\`\`\``,
          })
          .setTimestamp(),
      ],
    });
    await bch.send(`${EMOJI.ERROR} Submit failed. Admins notified.`);
  }

  st.h = [];
  st.sd = null;
  st.lp = {};
  clearCache();
  save();
}

// ═══════════════════════════════════════════════════════════════════════════
// BID PROCESSING - Auctioneering Mode (Instant Bidding)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Processes instant bids for auctioneering mode (NO confirmations)
 *
 * CRITICAL FEATURES:
 *
 * 1. INSTANT PROCESSING:
 *    - No confirmation required (unlike standalone mode)
 *    - Immediate points locking and state update
 *    - Real-time feedback to bidder
 *
 * 2. RACE CONDITION PREVENTION:
 *    - Rate limiting: 3-second cooldown per user
 *    - Points locking: Immediate lock before state update
 *    - Bid validation: First bid matches start price, subsequent bids must exceed
 *    - Self-overbidding: Only locks the difference
 *
 * 3. TIME EXTENSION:
 *    - Bids in final 60 seconds extend auction by 1 minute
 *    - Maximum 60 extensions to prevent infinite auctions
 *    - CRITICAL: Timers are CLEARED before updating endTime (prevents race condition)
 *    - Timers are RESCHEDULED after endTime update
 *
 * 4. VALIDATION CHECKS:
 *    - ELYSIUM role requirement
 *    - Rate limit enforcement
 *    - Bid amount validation (integer, positive, not too large)
 *    - Points availability check (total - locked >= needed)
 *    - Current bid validation (first bid: >=start, subsequent: >current)
 *
 * 5. STATE UPDATES:
 *    - Unlocks previous winner's points
 *    - Locks new bidder's points
 *    - Updates currentItem (curBid, curWin, curWinId, bids array)
 *    - Persists state immediately
 *    - Notifies auctioneering module via updateCurrentItemState
 *
 * 6. USER FEEDBACK:
 *    - Immediate confirmation embed with bid details
 *    - Shows previous bid and available points after bid
 *    - Channel announcement of new high bid
 *    - Time extension announcement if applicable
 *
 * @param {Message} msg - Discord message object
 * @param {string} amt - Bid amount as string (will be parsed to integer)
 * @param {Object} auctState - Auctioneering module state reference
 * @param {Object} auctRef - Auctioneering module reference (for callbacks)
 * @param {Object} config - Bot configuration object
 * @returns {Promise<Object>} { ok: boolean, msg?: string, instant?: true }
 */
async function procBidAuctioneering(msg, amt, auctState, auctRef, config) {
  const currentItem = auctState.currentItem;

  // Safety check: Ensure currentItem and currentSession exist
  if (!currentItem) {
    await msg.reply(ERROR_MESSAGES.NO_ACTIVE_ITEM);
    return { ok: false, msg: "No item" };
  }

  const currentSession = currentItem.currentSession;
  if (!currentSession) {
    await msg.reply(ERROR_MESSAGES.SESSION_UNAVAILABLE);
    console.error(`⚠️ Missing currentSession for item: ${currentItem.item}`);
    return { ok: false, msg: "No session" };
  }

  // Check if item has already ended (force-stopped)
  if (currentItem.status === "ended") {
    await msg.reply(`${EMOJI.ERROR} **Auction Ended** - This item is no longer accepting bids.`);
    return { ok: false, msg: "Ended" };
  }

  const m = msg.member,
    u = m.nickname || msg.author.username,
    uid = msg.author.id;

  if (!hasRole(m) && !isAdm(m, config)) {
    await msg.reply(ERROR_MESSAGES.NO_ROLE);
    return { ok: false, msg: "No role" };
  }

  // Attendance check removed - all ELYSIUM members can now bid freely
  const now = Date.now();
  if (st.lb[uid] && now - st.lb[uid] < 3000) {
    const wait = Math.ceil((3000 - (now - st.lb[uid])) / 1000);
    await msg.reply(`${EMOJI.CLOCK} Wait ${wait}s (rate limit)`);
    return { ok: false, msg: "Rate limited" };
  }

  const bid = parseInt(amt);
  if (isNaN(bid) || bid <= 0 || !Number.isInteger(bid)) {
    await msg.reply(ERROR_MESSAGES.INVALID_BID);
    return { ok: false, msg: "Invalid" };
  }

  // Boundary check: Prevent unreasonably large bids
  if (bid > 99999999) {
    await msg.reply(
      `${EMOJI.ERROR} Bid amount exceeds maximum allowed (99,999,999pts)`
    );
    return { ok: false, msg: "Too large" };
  }

  // Bid validation: First bid can match starting price, subsequent bids must exceed current bid
  // This prevents race conditions while allowing the starting bid to be placed
  const hasWinner = currentItem.curWin !== null && currentItem.curWin !== undefined;
  if (hasWinner ? (bid <= currentItem.curBid) : (bid < currentItem.curBid)) {
    const minBid = hasWinner ? currentItem.curBid + 1 : currentItem.curBid;
    await msg.reply(`${EMOJI.ERROR} Must be >= ${minBid}pts (current: ${currentItem.curBid}pts${hasWinner ? ', outbid required' : ', starting bid'})`);
    return { ok: false, msg: "Too low" };
  }

  if (!st.cp) {
    await msg.reply(`${EMOJI.ERROR} Cache not loaded!`);
    return { ok: false, msg: "No cache" };
  }

  const tot = getPts(u);

  if (tot === 0) {
    await msg.reply(`${EMOJI.ERROR} No points`);
    // Log to admin channel (critical: user has no points but trying to bid)
    logBidRejection(msg.client, config, {
      user: u,
      userId: uid,
      item: currentItem.item,
      bidAmount: bid,
      reason: 'No points available',
      totalPoints: tot
    });
    return { ok: false, msg: "No pts" };
  }

  // Calculate locked points ACROSS ALL SYSTEMS (auctioneering uses st.lp from bidding.js)
  const curLocked = st.lp[normalizeUsername(u)] || 0;
  const av = tot - curLocked;

  const isSelf =
    currentItem.curWin && currentItem.curWin.toLowerCase() === u.toLowerCase();
  const needed = isSelf ? Math.max(0, bid - currentItem.curBid) : bid;

  if (needed > av) {
    await msg.reply(
      `${EMOJI.ERROR} **Insufficient!**\n${EMOJI.BID} Total: ${tot}\n${EMOJI.LOCK} Locked: ${curLocked}\n${EMOJI.CHART} Available: ${av}\n${EMOJI.WARNING} Need: ${needed}`
    );
    // Log to admin channel (critical: insufficient points)
    logBidRejection(msg.client, config, {
      user: u,
      userId: uid,
      item: currentItem.item,
      bidAmount: bid,
      reason: 'Insufficient points',
      totalPoints: tot,
      lockedPoints: curLocked,
      availablePoints: av,
      neededPoints: needed
    });
    return { ok: false, msg: "Insufficient" };
  }

  // ==========================================
  // INSTANT BIDDING - NO CONFIRMATIONS
  // Bids process immediately with 3s rate limit spam protection
  // ==========================================

  // Update rate limit immediately to prevent rapid-fire bids
  st.lb[uid] = now;

  // Handle previous winner (unlock their points)
  if (currentItem.curWin && !isSelf) {
    unlock(currentItem.curWin, currentItem.curBid);
  }

  // Lock the new bid
  lock(u, needed);

  // Store previous bid for display
  const prevBid = currentItem.curBid;

  // Update current item
  currentItem.curBid = bid;
  currentItem.curWin = u;
  currentItem.curWinId = uid;

  if (!currentItem.bids) currentItem.bids = [];
  currentItem.bids.push({
    user: u,
    userId: uid,
    amount: bid,
    timestamp: now,
  });

  // CRITICAL: Check if bid is in last minute - extend time by 1 minute
  // MUST clear timers BEFORE checking to prevent race condition where timer fires during processing
  const timeLeft = currentItem.endTime - Date.now();
  if (!currentItem.extCnt) currentItem.extCnt = 0;

  let timeExtended = false;
  if (timeLeft < 60000 && timeLeft > 0 && currentItem.extCnt < ME) {
    // STEP 1: Clear ALL timers IMMEDIATELY to prevent old itemEnd from firing
    if (auctRef && typeof auctRef.safelyClearItemTimers === "function") {
      auctRef.safelyClearItemTimers();
      console.log(`🛑 Cleared timers to prevent race condition`);
    }

    // STEP 2: Update endTime (now safe since timers are cleared)
    const extensionTime = 60000; // 1 minute
    const oldEndTime = currentItem.endTime;
    currentItem.endTime += extensionTime;
    currentItem.extCnt++;
    timeExtended = true;

    console.log(
      `⏰ Time extended for ${currentItem.item} by 1 minute (bid in final minute, ext #${currentItem.extCnt}/${ME})`
    );
    console.log(`📊 Old end time: ${new Date(oldEndTime).toLocaleTimeString()}`);
    console.log(`📊 New end time: ${new Date(currentItem.endTime).toLocaleTimeString()}`);
    console.log(`📊 New time left: ${Math.floor((currentItem.endTime - Date.now()) / 1000)}s`);

    // STEP 3: Reschedule timers with new endTime
    if (auctRef && typeof auctRef.rescheduleItemTimers === "function") {
      auctRef.rescheduleItemTimers(
        msg.client,
        config,
        msg.channel
      );
      console.log(`✅ Timers rescheduled with new endTime`);
    }
  }

  // Update via auctioneering module
  if (auctRef && typeof auctRef.updateCurrentItemState === "function") {
    auctRef.updateCurrentItemState({
      curBid: bid,
      curWin: u,
      curWinId: uid,
      bids: currentItem.bids,
    });
  }

  // Save state
  save();

  // Send immediate confirmation to bidder
  await msg.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(COLORS.SUCCESS)
        .setTitle(`${EMOJI.SUCCESS} Bid Placed!`)
        .setDescription(`You're now the highest bidder on **${currentItem.item}**`)
        .addFields(
          {
            name: `${EMOJI.BID} Your Bid`,
            value: `${bid}pts`,
            inline: true,
          },
          {
            name: `${EMOJI.CHART} Previous`,
            value: `${prevBid}pts`,
            inline: true,
          },
          {
            name: `💳 Available`,
            value: `${av - needed}pts`,
            inline: true,
          }
        )
        .setFooter({
          text: isSelf
            ? `Self-overbid (+${needed}pts) • ${currentItem.extCnt}/${ME} extensions`
            : `Locked ${needed}pts • ${currentItem.extCnt}/${ME} extensions`,
        }),
    ],
  });

  // Announce to channel
  const announceEmbed = new EmbedBuilder()
    .setColor(COLORS.AUCTION)
    .setTitle(`${EMOJI.FIRE} New High Bid!`)
    .setDescription(`**${currentItem.item}**`)
    .addFields(
      {
        name: `${EMOJI.BID} Amount`,
        value: `${bid}pts`,
        inline: true,
      },
      {
        name: "👤 Bidder",
        value: u,
        inline: true
      },
      {
        name: "⏱️ Time",
        value: `${Math.ceil((currentItem.endTime - Date.now()) / 1000)}s remaining`,
        inline: true,
      }
    );

  await msg.channel.send({ embeds: [announceEmbed] });

  // Announce time extension if it happened
  if (timeExtended) {
    await msg.channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0xffa500)
          .setTitle(`⏰ Time Extended!`)
          .setDescription(
            `Bid placed in final minute - adding 1 more minute to the auction!`
          )
          .addFields({
            name: "⏱️ New Time Remaining",
            value: `${Math.ceil((currentItem.endTime - Date.now()) / 1000)}s`,
            inline: true,
          })
          .setFooter({ text: `Extension ${currentItem.extCnt}/${ME}` }),
      ],
    });
  }

  return { ok: true, instant: true };
}

// ═══════════════════════════════════════════════════════════════════════════
// BID PROCESSING - Standalone Mode (Confirmation-Based Bidding)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Processes bids for standalone mode with user confirmation workflow
 *
 * DUAL MODE ROUTING:
 * - First checks if auctioneering module is active
 * - Routes to procBidAuctioneering if auctioneering is active
 * - Continues with standalone mode if not
 *
 * CONFIRMATION WORKFLOW:
 * 1. Validate user and bid amount
 * 2. Check points availability
 * 3. Send confirmation embed with reactions (✅ confirm / ❌ cancel)
 * 4. Wait for user reaction (10 second timeout)
 * 5. Process bid on confirm, cancel on reject/timeout
 *
 * PAUSE MECHANISM:
 * - If bid occurs in final 10 seconds, auction is PAUSED
 * - Gives user time to confirm without rushing
 * - RESUMES on confirm/cancel/timeout
 *
 * COUNTDOWN TIMER:
 * - Updates confirmation embed every second
 * - Shows remaining time to user
 * - Cleaned up on confirm/cancel/timeout
 *
 * RATE LIMITING:
 * - 3-second cooldown between bids per user
 * - Prevents spam and accidental duplicates
 *
 * @param {Message} msg - Discord message object
 * @param {string} amt - Bid amount as string (will be parsed to integer)
 * @param {Object} cfg - Bot configuration object
 * @returns {Promise<Object>} { ok: boolean, msg?: string, confId?: string }
 */
async function procBid(msg, amt, cfg) {
  // CRITICAL FIX: Check if auctioneering is active first
  if (auctioneering && typeof auctioneering.getAuctionState === "function") {
    const auctState = auctioneering.getAuctionState();
    if (auctState && auctState.active && auctState.currentItem) {
      return await procBidAuctioneering(
        msg,
        amt,
        auctState,
        auctioneering,
        cfg
      );
    }
  }

  const a = st.a;
  if (!a) return { ok: false, msg: "No auction" };
  if (a.status !== "active") return { ok: false, msg: "Not started" };
  if (msg.channel.id !== a.threadId) return { ok: false, msg: "Wrong thread" };

  const m = msg.member,
    u = m.nickname || msg.author.username,
    uid = msg.author.id;
  if (!hasRole(m) && !isAdm(m, cfg)) {
    await msg.reply(`${EMOJI.ERROR} Need ELYSIUM role`);
    return { ok: false, msg: "No role" };
  }

  // Rate limit
  const now = Date.now();
  if (st.lb[uid] && now - st.lb[uid] < RL) {
    const wait = Math.ceil((RL - (now - st.lb[uid])) / 1000);
    await msg.reply(`${EMOJI.CLOCK} Wait ${wait}s (rate limit)`);
    return { ok: false, msg: "Rate limited" };
  }

  const bid = parseInt(amt);
  if (isNaN(bid) || bid <= 0 || !Number.isInteger(bid)) {
    await msg.reply(`${EMOJI.ERROR} Invalid bid (integers only)`);
    return { ok: false, msg: "Invalid" };
  }

  // Bid validation: First bid can match starting price, subsequent bids must exceed current bid
  // This prevents race conditions while allowing the starting bid to be placed
  const hasWinner = a.curWin !== null && a.curWin !== undefined;
  if (hasWinner ? (bid <= a.curBid) : (bid < a.curBid)) {
    const minBid = hasWinner ? a.curBid + 1 : a.curBid;
    await msg.reply(`${EMOJI.ERROR} Must be >= ${minBid}pts (current: ${a.curBid}pts${hasWinner ? ', outbid required' : ', starting bid'})`);
    return { ok: false, msg: "Too low" };
  }

  // Cache check
  if (!st.cp) {
    await msg.reply(`${EMOJI.ERROR} Cache not loaded!`);
    return { ok: false, msg: "No cache" };
  }

  const tot = getPts(u),
    av = avail(u, tot);

  if (tot === 0) {
    await msg.reply(`${EMOJI.ERROR} No points`);
    return { ok: false, msg: "No pts" };
  }

  // Check if self-overbidding
  const isSelf = a.curWin && a.curWin.toLowerCase() === u.toLowerCase();
  const curLocked = st.lp[normalizeUsername(u)] || 0;
  const needed = isSelf ? Math.max(0, bid - curLocked) : bid;

  if (needed > av) {
    await msg.reply(
      `${EMOJI.ERROR} **Insufficient!**\n${EMOJI.BID} Total: ${tot}\n${EMOJI.LOCK} Locked: ${curLocked}\n${EMOJI.CHART} Available: ${av}\n${EMOJI.WARNING} Need: ${needed}`
    );
    return { ok: false, msg: "Insufficient" };
  }

  const confEmbed = new EmbedBuilder()
    .setColor(COLORS.AUCTION)
    .setTitle(`${EMOJI.CLOCK} Confirm Your Bid`)
    .setDescription(
      `**Item:** ${a.item}${
        a.quantity > 1 ? ` (${a.quantity} available)` : ""
      }\n` +
        `**Action:** ${
          isSelf ? "Increase your bid" : "Place bid and lock points"
        }\n\n` +
        `⚠️ **By confirming, you agree to:**\n` +
        `• Lock ${needed}pts from your available points\n` +
        `• ${isSelf ? "Increase" : "Place"} your bid to ${bid}pts`
    )
    .addFields(
      { name: `${EMOJI.BID} Your Bid`, value: `${bid}pts`, inline: true },
      {
        name: `${EMOJI.CHART} Current High`,
        value: `${a.curBid}pts`,
        inline: true,
      },
      { name: "💳 Points After", value: `${av - needed}pts left`, inline: true }
    );

  if (isSelf) {
    confEmbed.addFields({
      name: "🔄 Self-Overbid Details",
      value: `Your current bid: ${a.curBid}pts\nNew bid: ${bid}pts\n**Additional points needed: +${needed}pts**`,
      inline: false,
    });
  }

  confEmbed.setFooter({
    text: `${EMOJI.SUCCESS} YES, PLACE BID / ${EMOJI.ERROR} NO, CANCEL • ${
      isSelf ? "Overbidding yourself" : "Outbidding current leader"
    } • 10s timeout`,
  });

  const conf = await msg.reply({
    content: `<@${uid}> **CONFIRM YOUR BID - React below within 10 seconds**`,
    embeds: [confEmbed],
  });
  // OPTIMIZATION v6.8: Parallel reactions (2x faster)
  await Promise.all([
    conf.react(EMOJI.SUCCESS),
    conf.react(EMOJI.ERROR)
  ]);

  st.pc[conf.id] = {
    userId: uid,
    username: u,
    threadId: a.threadId,
    amount: bid,
    timestamp: now,
    origMsgId: msg.id,
    isSelf,
    needed,
  };
  save();

  st.lb[uid] = now; // Rate limit stamp

  // Countdown timer
  let countdown = 10;
  const countdownInterval = setInterval(async () => {
    try {
      countdown--;
      if (countdown > 0 && countdown <= 10 && st.pc[conf.id]) {
        const updatedEmbed = EmbedBuilder.from(confEmbed).setFooter({
          text: `${EMOJI.SUCCESS} confirm / ${EMOJI.ERROR} cancel • ${countdown}s remaining`,
        });
        await errorHandler.safeEdit(conf, { embeds: [updatedEmbed] }, 'message edit');
      }
    } catch (err) {
      // Handle archived thread or deleted message errors
      console.warn(`⚠️ Countdown interval error (${conf.id}):`, err.message);
      clearInterval(countdownInterval);
      if (st.th[`countdown_${conf.id}`]) {
        delete st.th[`countdown_${conf.id}`];
      }
    }
  }, 1000);

  // Store countdown interval for cleanup
  st.th[`countdown_${conf.id}`] = countdownInterval;

  // Check if bid in last 10 seconds - PAUSE
  const timeLeft = a.endTime - Date.now();
  if (timeLeft <= 10000 && timeLeft > 0) {
    pauseAuction();
    await msg.channel.send(
      `${EMOJI.PAUSE} **PAUSED** - Bid in last 10s! Timer paused for confirmation...`
    );
  }

  st.th[`c_${conf.id}`] = setTimeout(async () => {
    clearInterval(st.th[`countdown_${conf.id}`]);
    delete st.th[`countdown_${conf.id}`];
    if (st.pc[conf.id]) {
      await errorHandler.safeRemoveReactions(conf, 'reaction removal');
      const timeoutEmbed = EmbedBuilder.from(confEmbed)
        .setColor(getColor(COLORS.INFO))
        .setFooter({ text: `${EMOJI.CLOCK} Timed out` });
      await errorHandler.safeEdit(conf, { embeds: [timeoutEmbed] }, 'message edit');
      setTimeout(
        async () => await errorHandler.safeDelete(conf, 'message deletion'),
        TIMEOUTS.MESSAGE_DELETE
      );
      delete st.pc[conf.id];
      save();

      // Resume if paused
      if (st.pause) {
        resumeAuction(conf.client, cfg);
        await msg.channel.send(
          `${EMOJI.PLAY} **RESUMED** - Bid timeout, auction continues...`
        );
      }
    }
  }, CT);

  return { ok: true, confId: conf.id };
}

// ═══════════════════════════════════════════════════════════════════════════
// COMMAND HANDLERS - User & Admin Commands
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Main command handler - Routes commands to appropriate handlers
 *
 * COMMAND ROUTING:
 * - Resolves command aliases (!b -> !bid, !pts -> !mypoints, etc.)
 * - Routes to specific command handler based on command name
 * - Handles both user commands (!bid, !mypoints) and admin commands (!reset, !audit)
 *
 * SUPPORTED COMMANDS:
 *
 * USER COMMANDS:
 * - !bid <amount> - Place bid on active auction
 * - !mypoints - Check your bidding points balance
 * - !bidstatus - Show current auction status and queue
 *
 * ADMIN COMMANDS:
 * - !resetbids - Reset bidding state (clears active auction, locked points, history)
 * - !resetauction - Nuclear reset (both bidding and auctioneering modules)
 * - !forcesubmitresults - Manually submit session results to Google Sheets
 * - !cancelitem - Cancel current auction item (refund points)
 * - !skipitem - Skip current item without sale
 * - !fixlockedpoints - Audit and clear stuck locked points
 * - !auctionaudit - Show detailed system state for debugging
 * - !recoverauction - Recovery tools for crashed/stuck auctions
 *
 * COMMAND ALIASES:
 * - !b -> !bid
 * - !pts, !mypts, !mp -> !mypoints
 * - !ql, !queue -> !queuelist
 * - !bstatus -> !bidstatus
 * - !start -> !startauction
 *
 * @param {string} cmd - Command name (with ! prefix)
 * @param {Message} msg - Discord message object
 * @param {Array<string>} args - Command arguments
 * @param {Client} cli - Discord client instance
 * @param {Object} cfg - Bot configuration object
 */
async function handleCmd(cmd, msg, args, cli, cfg) {
  // Handle command aliases
  const actualCmd = COMMAND_ALIASES[cmd] || cmd;

  switch (actualCmd) {
    case "!bid":
      if (args.length === 0) {
        try {
          return await msg.reply(`${EMOJI.ERROR} Usage: \`!bid <amount>\``);
        } catch (err) {
          // If reply fails (message deleted), send regular message
          return await msg.channel.send(
            `${EMOJI.ERROR} Usage: \`!bid <amount>\``
          );
        }
      }
      const res = await procBid(msg, args[0], cfg);
      if (!res.ok) {
        try {
          await msg.reply(`${EMOJI.ERROR} ${res.msg}`);
        } catch (err) {
          // If reply fails (message deleted), send regular message
          await msg.channel.send(
            `${EMOJI.ERROR} <@${msg.author.id}> ${res.msg}`
          );
        }
      }
      break;

    case "!bidstatus":
      const statEmbed = new EmbedBuilder()
        .setColor(getColor(COLORS.INFO))
        .setTitle(`${EMOJI.CHART} Status`);
      if (st.cp) {
        const age = Math.floor((Date.now() - st.ct) / 60000);
        const autoRefreshStatus = st.cacheRefreshTimer
          ? `${EMOJI.SUCCESS} Auto-refresh ON`
          : `${EMOJI.WARNING} Auto-refresh OFF`;
        statEmbed.addFields({
          name: `${EMOJI.CHART} Cache`,
          value: `${EMOJI.SUCCESS} Loaded (${
            st.cp.size()
          } members)\n${EMOJI.TIME} Age: ${age}m\n${autoRefreshStatus}`,
          inline: false,
        });
      } else
        statEmbed.addFields({
          name: `${EMOJI.CHART} Cache`,
          value: `${EMOJI.WARNING} Not loaded`,
          inline: false,
        });
      if (st.q.length > 0)
        statEmbed.addFields({
          name: `${EMOJI.LIST} Queue`,
          value:
            st.q
              .slice(0, 5)
              .map(
                (a, i) =>
                  `${i + 1}. ${a.item}${
                    a.quantity > 1 ? ` x${a.quantity}` : ""
                  }`
              )
              .join("\n") +
            (st.q.length > 5 ? `\n*...+${st.q.length - 5} more*` : ""),
        });
      if (st.a) {
        const tLeft = st.pause
          ? `${EMOJI.PAUSE} PAUSED (${fmtTime(st.a.remainingTime)})`
          : fmtTime(st.a.endTime - Date.now());
        statEmbed.addFields(
          {
            name: `${EMOJI.FIRE} Active`,
            value: `${st.a.item}${
              st.a.quantity > 1 ? ` x${st.a.quantity}` : ""
            }`,
            inline: true,
          },
          {
            name: `${EMOJI.BID} Bid`,
            value: `${st.a.curBid}pts`,
            inline: true,
          },
          { name: `${EMOJI.TIME} Time`, value: tLeft, inline: true }
        );
      }
      statEmbed.setFooter({ text: "Items managed via Google Sheets" }).setTimestamp();
      await msg.reply({ embeds: [statEmbed] });
      break;

    case "!resetbids":
      const rstMsg = await msg.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(COLORS.ERROR)
            .setTitle(`${EMOJI.WARNING} RESET ALL?`)
            .setDescription(
              `Clears:\n` +
                `• Active auction\n` +
                `• Locked points (${Object.keys(st.lp).length} members)\n` +
                `• History (${st.h.length} records)\n` +
                `• Cache\n\n` +
                `⚠️ **NOTE:** Use \`!resetauction\` for full auction reset including saved state.`
            )
            .setFooter({
              text: `${EMOJI.SUCCESS} confirm / ${EMOJI.ERROR} cancel`,
            }),
        ],
      });
      // OPTIMIZATION v6.8: Parallel reactions
      await Promise.all([
        rstMsg.react(EMOJI.SUCCESS),
        rstMsg.react(EMOJI.ERROR)
      ]);
      try {
        const col = await rstMsg.awaitReactions({
          filter: (r, u) =>
            [EMOJI.SUCCESS, EMOJI.ERROR].includes(r.emoji.name) &&
            u.id === msg.author.id,
          max: 1,
          time: TIMEOUTS.CONFIRMATION,
          errors: ["time"],
        });
        if (col.first().emoji.name === EMOJI.SUCCESS) {
          clearAllTimers();
          stopCacheAutoRefresh();
          st = {
            a: null,
            lp: {},
            h: [],
            th: {},
            pc: {},
            sd: null,
            cp: null,
            ct: null,
            lb: {},
            pause: false,
            pauseTimer: null,
            auctionLock: false,
            cacheRefreshTimer: null,
          };
          save();
          await msg.reply(`${EMOJI.SUCCESS} Reset (cache cleared)`);
        } else {
          await errorHandler.safeRemoveReactions(rstMsg, 'reaction removal');
        }
      } catch (e) {
        await errorHandler.safeRemoveReactions(rstMsg, 'reaction removal');
      }
      break;

    case "!forcesubmitresults":
      if (!st.sd || st.h.length === 0)
        return await msg.reply(`${EMOJI.ERROR} No history`);
      const fsMsg = await msg.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(getColor(COLORS.WARNING))
            .setTitle(`${EMOJI.WARNING} Force Submit?`)
            .setDescription(`**Time:** ${st.sd}\n**Items:** ${st.h.length}`)
            .addFields({
              name: `${EMOJI.LIST} Results`,
              value: st.h
                .map((a) => `• **${a.item}**: ${a.winner} - ${a.amount}pts`)
                .join("\n"),
              inline: false,
            })
            .setFooter({
              text: `${EMOJI.SUCCESS} submit / ${EMOJI.ERROR} cancel`,
            }),
        ],
      });
      // OPTIMIZATION v6.8: Parallel reactions
      await Promise.all([
        fsMsg.react(EMOJI.SUCCESS),
        fsMsg.react(EMOJI.ERROR)
      ]);
      try {
        const fsCol = await fsMsg.awaitReactions({
          filter: (r, u) =>
            [EMOJI.SUCCESS, EMOJI.ERROR].includes(r.emoji.name) &&
            u.id === msg.author.id,
          max: 1,
          time: TIMEOUTS.CONFIRMATION,
          errors: ["time"],
        });
        if (fsCol.first().emoji.name === EMOJI.SUCCESS) {
          if (!st.sd) st.sd = ts();

          const winners = {};
          st.h.forEach((a) => {
            const normalizedWinner = normalizeUsername(a.winner);
            winners[normalizedWinner] =
              (winners[normalizedWinner] || 0) + a.amount;
          });

          const allMembers = st.cp ? st.cp.getAllUsernames() : [];
          const res = allMembers.map((m) => {
            const normalizedMember = normalizeUsername(m);
            return {
              member: m,
              totalSpent: winners[normalizedMember] || 0,
            };
          });
          const sub = await submitRes(cfg.sheet_webhook_url, res, st.sd);
          if (sub.ok) {
            const wList = st.h
              .map((a) => `• **${a.item}**: ${a.winner} - ${a.amount}pts`)
              .join("\n");
            await msg.channel.send({
              embeds: [
                new EmbedBuilder()
                  .setColor(getColor(COLORS.SUCCESS))
                  .setTitle(`${EMOJI.SUCCESS} Force Submit OK!`)
                  .setDescription("Submitted")
                  .addFields(
                    { name: `${EMOJI.CLOCK} Time`, value: st.sd, inline: true },
                    {
                      name: `${EMOJI.TROPHY} Items`,
                      value: `${st.h.length}`,
                      inline: true,
                    },
                    {
                      name: `${EMOJI.BID} Total`,
                      value: `${res.reduce((s, r) => s + r.totalSpent, 0)}`,
                      inline: true,
                    },
                    { name: `${EMOJI.LIST} Winners`, value: wList },
                    {
                      name: "👥 Updated",
                      value: `${res.length} (0 auto-populated)`,
                      inline: false,
                    }
                  )
                  .setFooter({ text: "Deducted after session" })
                  .setTimestamp(),
              ],
            });
            st.h = [];
            st.sd = null;
            st.lp = {};
            clearCache();
            save();
          } else {
            await msg.channel.send({
              embeds: [
                new EmbedBuilder()
                  .setColor(getColor(COLORS.ERROR))
                  .setTitle(`${EMOJI.ERROR} Failed`)
                  .setDescription(`**Error:** ${sub.err}`)
                  .addFields({
                    name: `${EMOJI.LIST} Data`,
                    value: `\`\`\`\n${res
                      .filter((r) => r.totalSpent > 0)
                      .map((r) => `${r.member}: ${r.totalSpent}pts`)
                      .join("\n")}\n\`\`\``,
                  }),
              ],
            });
          }
        } else {
          await errorHandler.safeRemoveReactions(fsMsg, 'reaction removal');
        }
      } catch (e) {
        await errorHandler.safeRemoveReactions(fsMsg, 'reaction removal');
      }
      break;

    case "!cancelitem":
      if (!st.a) return await msg.reply(`${EMOJI.ERROR} No active auction`);
      if (msg.channel.id !== st.a.threadId)
        return await msg.reply(`${EMOJI.ERROR} Use in auction thread`);
      const canMsg = await msg.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(getColor(COLORS.WARNING))
            .setTitle(`${EMOJI.WARNING} Cancel Item?`)
            .setDescription(
              `**${st.a.item}**${
                st.a.quantity > 1 ? ` x${st.a.quantity}` : ""
              }\n\nRefund all locked points?`
            )
            .setFooter({ text: `${EMOJI.SUCCESS} yes / ${EMOJI.ERROR} no` }),
        ],
      });
      // OPTIMIZATION v6.8: Parallel reactions
      await Promise.all([
        canMsg.react(EMOJI.SUCCESS),
        canMsg.react(EMOJI.ERROR)
      ]);
      try {
        const canCol = await canMsg.awaitReactions({
          filter: (r, u) =>
            [EMOJI.SUCCESS, EMOJI.ERROR].includes(r.emoji.name) &&
            u.id === msg.author.id,
          max: 1,
          time: TIMEOUTS.CONFIRMATION,
          errors: ["time"],
        });
        if (canCol.first().emoji.name === EMOJI.SUCCESS) {
          clearAllTimers();
          if (st.a.curWin) unlock(st.a.curWin, st.a.curBid);

          // Send messages before locking/archiving
          await msg.channel.send(
            `${EMOJI.ERROR} **${st.a.item}** canceled. Points refunded.\n\n${EMOJI.INFO} Item cancelled. Use !endauction to end the entire session.`
          );

          // Lock the thread first to prevent new messages
          if (typeof msg.channel.setLocked === "function") {
            await msg.channel
              .setLocked(true, "Item cancelled")
              .catch((err) =>
                console.warn(`⚠️ Failed to lock thread ${msg.channel.id}:`, err.message)
              );
          }

          await msg.channel.setArchived(true, "Canceled").catch(errorHandler.safeCatch('thread archive'));
          st.a = null;
          save();
        } else {
          await errorHandler.safeRemoveReactions(canMsg, 'reaction removal');
        }
      } catch (e) {
        await errorHandler.safeRemoveReactions(canMsg, 'reaction removal');
      }
      break;

    case "!skipitem":
      if (!st.a) return await msg.reply(`${EMOJI.ERROR} No active auction`);
      if (msg.channel.id !== st.a.threadId)
        return await msg.reply(`${EMOJI.ERROR} Use in auction thread`);
      const skpMsg = await msg.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(getColor(COLORS.WARNING))
            .setTitle(`${EMOJI.WARNING} Skip Item?`)
            .setDescription(
              `**${st.a.item}**${
                st.a.quantity > 1 ? ` x${st.a.quantity}` : ""
              }\n\nMark as no sale, move to next?`
            )
            .setFooter({ text: `${EMOJI.SUCCESS} yes / ${EMOJI.ERROR} no` }),
        ],
      });
      // OPTIMIZATION v6.8: Parallel reactions
      await Promise.all([
        skpMsg.react(EMOJI.SUCCESS),
        skpMsg.react(EMOJI.ERROR)
      ]);
      try {
        const skpCol = await skpMsg.awaitReactions({
          filter: (r, u) =>
            [EMOJI.SUCCESS, EMOJI.ERROR].includes(r.emoji.name) &&
            u.id === msg.author.id,
          max: 1,
          time: TIMEOUTS.CONFIRMATION,
          errors: ["time"],
        });
        if (skpCol.first().emoji.name === EMOJI.SUCCESS) {
          clearAllTimers();
          if (st.a.curWin) unlock(st.a.curWin, st.a.curBid);

          // Send messages before locking/archiving
          await msg.channel.send(
            `⏭️ **${st.a.item}** skipped (no sale).\n\n${EMOJI.INFO} Item skipped. Use !endauction to end the entire session.`
          );

          // Lock the thread first to prevent new messages
          if (typeof msg.channel.setLocked === "function") {
            await msg.channel
              .setLocked(true, "Item skipped")
              .catch((err) =>
                console.warn(`⚠️ Failed to lock thread ${msg.channel.id}:`, err.message)
              );
          }

          await msg.channel.setArchived(true, "Skipped").catch(errorHandler.safeCatch('thread archive'));
          st.a = null;
          save();
        } else {
          await errorHandler.safeRemoveReactions(skpMsg, 'reaction removal');
        }
      } catch (e) {
        await errorHandler.safeRemoveReactions(skpMsg, 'reaction removal');
      }
      break;

    case "!mypoints":
      // Only in bidding channel (not thread)
      if (msg.channel.isThread() || msg.channel.id !== cfg.bidding_channel_id) {
        return await msg.reply(
          `${EMOJI.ERROR} Use \`!mypoints\` in bidding channel only (not threads)`
        );
      }

      // Don't allow during active auction
      if (st.a) {
        return await msg.reply(
          `${EMOJI.WARNING} Can't check points during auction. Wait for session to end.`
        );
      }

      const u = msg.member.nickname || msg.author.username;

      // Fetch fresh from sheets
      const freshPts = await fetchPts(cfg.sheet_webhook_url);
      if (!freshPts) {
        return await msg.reply(
          `${EMOJI.ERROR} Failed to fetch points from sheets.`
        );
      }

      // Use PointsCache for efficient O(1) lookup
      const ptsCache = new PointsCache(freshPts);
      let userPts = ptsCache.getPoints(u);
      if (userPts === 0 && !ptsCache.hasUser(u)) {
        // User not found in system
        userPts = null;
      }

      let ptsMsg;
      if (userPts === null || userPts === undefined) {
        ptsMsg = await msg.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(getColor(COLORS.ERROR))
              .setTitle(`${EMOJI.ERROR} Not Found`)
              .setDescription(
                `**${u}**\n\nYou are not in the bidding system or not a current ELYSIUM member.`
              )
              .setFooter({ text: "Contact admin if this is wrong" })
              .setTimestamp(),
          ],
        });
      } else {
        ptsMsg = await msg.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(getColor(COLORS.SUCCESS))
              .setTitle(`${EMOJI.BID} Your Points`)
              .setDescription(`**${u}**`)
              .addFields({
                name: `${EMOJI.CHART} Available Points`,
                value: `${userPts} pts`,
                inline: true,
              })
              .setFooter({ text: "Auto-deletes in 30s" })
              .setTimestamp(),
          ],
        });
      }

      // DELETE USER MESSAGE IMMEDIATELY + DELETE REPLY AFTER 30s
      try {
        await errorHandler.safeDelete(msg, 'message deletion');
      } catch (e) {
        console.warn(
          `${EMOJI.WARNING} Could not delete user message: ${e.message}`
        );
      }

      // Delete reply embed after 30s
      setTimeout(async () => {
        await errorHandler.safeDelete(ptsMsg, 'message deletion');
      }, 30000);
      break;

    case "!fixlockedpoints":
      // 🔧 AUDIT AND FIX STUCK LOCKED POINTS
      const lockedMembers = Object.keys(st.lp).filter(
        (member) => st.lp[member] > 0
      );

      if (lockedMembers.length === 0) {
        return await msg.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(getColor(COLORS.SUCCESS))
              .setTitle(`${EMOJI.SUCCESS} All Clear!`)
              .setDescription(`No locked points found. System is clean.`)
              .setTimestamp(),
          ],
        });
      }

      // Build audit report
      const auditReport = lockedMembers
        .map((member) => `• **${member}**: ${st.lp[member]}pts locked`)
        .join("\n");

      const fixMsg = await msg.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(getColor(COLORS.WARNING))
            .setTitle(`${EMOJI.WARNING} Locked Points Found`)
            .setDescription(
              `Found **${lockedMembers.length} members** with locked points:\n\n${auditReport}\n\n` +
                `**Action:** Clear all locked points?\n` +
                `⚠️ Only do this if no auction is running or if points are stuck.`
            )
            .setFooter({
              text: `${EMOJI.SUCCESS} clear all / ${EMOJI.ERROR} cancel`,
            }),
        ],
      });

      // OPTIMIZATION v6.8: Parallel reactions
      await Promise.all([
        fixMsg.react(EMOJI.SUCCESS),
        fixMsg.react(EMOJI.ERROR)
      ]);

      try {
        const fixCol = await fixMsg.awaitReactions({
          filter: (r, u) =>
            [EMOJI.SUCCESS, EMOJI.ERROR].includes(r.emoji.name) &&
            u.id === msg.author.id,
          max: 1,
          time: TIMEOUTS.CONFIRMATION,
          errors: ["time"],
        });

        if (fixCol.first().emoji.name === EMOJI.SUCCESS) {
          const clearedCount = lockedMembers.length;
          const totalLocked = Object.values(st.lp).reduce(
            (sum, pts) => sum + pts,
            0
          );
          st.lp = {};
          save(true); // Force immediate sync to Google Sheets to persist the change
          await errorHandler.safeRemoveReactions(fixMsg, 'reaction removal');
          await msg.reply({
            embeds: [
              new EmbedBuilder()
                .setColor(getColor(COLORS.SUCCESS))
                .setTitle(`${EMOJI.SUCCESS} Locked Points Cleared`)
                .setDescription(
                  `Freed **${totalLocked}pts** from **${clearedCount} members**`
                )
                .setFooter({
                  text: "Points are now available for bidding",
                })
                .setTimestamp(),
            ],
          });
        } else {
          await errorHandler.safeRemoveReactions(fixMsg, 'reaction removal');
        }
      } catch (e) {
        await errorHandler.safeRemoveReactions(fixMsg, 'reaction removal');
      }
      break;

    case "!auctionaudit":
      // 📊 SHOW DETAILED AUCTION STATE
      const auditEmbed = new EmbedBuilder()
        .setColor(COLORS.INFO)
        .setTitle(`${EMOJI.CHART} Auction System Audit`)
        .setTimestamp();

      // Bidding module state
      auditEmbed.addFields({
        name: "🔹 Bidding Module",
        value:
          `**Active Auction:** ${st.a ? st.a.item : "None"}\n` +
          `**Locked Points:** ${Object.keys(st.lp).length} members (${Object.values(
            st.lp
          ).reduce((sum, pts) => sum + pts, 0)}pts total)\n` +
          `**Pending Confirmations:** ${Object.keys(st.pc).length}\n` +
          `**History:** ${st.h.length} items\n` +
          `**Cache:** ${st.cp ? st.cp.size() : 0} members\n` +
          `**Paused:** ${st.pause ? "Yes" : "No"}`,
        inline: false,
      });

      // Auctioneering module state
      const auctioneering = require("./auctioneering.js");
      const auctState = auctioneering.getAuctionState();

      auditEmbed.addFields({
        name: "🔹 Auctioneering Module",
        value:
          `**Active:** ${auctState.active ? "Yes" : "No"}\n` +
          `**Current Item:** ${
            auctState.currentItem ? auctState.currentItem.item : "None"
          }\n` +
          `**Session Items:** ${auctState.sessionItems.length}\n` +
          `**Current Index:** ${auctState.currentItemIndex}\n` +
          `**Paused:** ${auctState.paused ? "Yes" : "No"}`,
        inline: false,
      });

      // Active timers
      const activeTimers = Object.keys(st.th).length;
      const auctTimers = Object.keys(auctState.timers || {}).length;

      auditEmbed.addFields({
        name: "⏱️ Active Timers",
        value:
          `**Bidding Module:** ${activeTimers} timer(s)\n` +
          `**Auctioneering Module:** ${auctTimers} timer(s)`,
        inline: false,
      });

      // Health check
      const issues = [];
      if (st.a && !auctState.active) {
        issues.push("⚠️ Bidding has active auction but auctioneering doesn't");
      }
      if (!st.a && auctState.active) {
        issues.push("⚠️ Auctioneering active but bidding has no auction");
      }
      if (Object.keys(st.lp).length > 0 && !st.a && !auctState.active) {
        issues.push("⚠️ Locked points exist but no auction is running");
      }
      if (Object.keys(st.pc).length > 10) {
        issues.push("⚠️ High number of pending confirmations (possible memory leak)");
      }

      if (issues.length > 0) {
        auditEmbed.addFields({
          name: "⚠️ Issues Detected",
          value: issues.join("\n"),
          inline: false,
        });
        auditEmbed.setColor(getColor(COLORS.WARNING));
      } else {
        auditEmbed.addFields({
          name: "✅ Health Status",
          value: "All systems operational",
          inline: false,
        });
      }

      auditEmbed.setFooter({
        text: "Use !fixlockedpoints to clear stuck points | !resetauction for full reset",
      });

      await msg.reply({ embeds: [auditEmbed] });
      break;

    case "!resetauction":
      // 🔄 COMPLETE AUCTION RESET (NUCLEAR OPTION)
      const resetAuditEmbed = new EmbedBuilder()
        .setColor(COLORS.ERROR)
        .setTitle(`${EMOJI.WARNING} COMPLETE AUCTION RESET`)
        .setDescription(
          `⚠️ **THIS IS A NUCLEAR OPTION** ⚠️\n\n` +
            `This will completely reset the entire auction system:\n\n` +
            `**Bidding Module:**\n` +
            `• Active auction: ${st.a ? st.a.item : "None"}\n` +
            `• Locked points: ${Object.keys(st.lp).length} members\n` +
            `• History: ${st.h.length} items\n` +
            `• Cache: ${st.cp ? st.cp.size() : 0} members\n\n` +
            `**Auctioneering Module:**\n` +
            `• Session items: ${require("./auctioneering.js").getAuctionState().sessionItems.length}\n\n` +
            `**State Files:**\n` +
            `• bidding-state.json will be cleared\n` +
            `• All timers will be stopped\n` +
            `• All caches will be cleared\n\n` +
            `✅ **Safe to use when:**\n` +
            `• Auction is stuck/crashed\n` +
            `• Starting fresh session\n` +
            `• Points are glitched\n\n` +
            `❌ **DO NOT use during active auction!**`
        )
        .setFooter({
          text: `${EMOJI.SUCCESS} RESET EVERYTHING / ${EMOJI.ERROR} cancel`,
        });

      const resetConfirmMsg = await msg.reply({ embeds: [resetAuditEmbed] });
      // OPTIMIZATION v6.8: Parallel reactions
      await Promise.all([
        resetConfirmMsg.react(EMOJI.SUCCESS),
        resetConfirmMsg.react(EMOJI.ERROR)
      ]);

      try {
        const resetCol = await resetConfirmMsg.awaitReactions({
          filter: (r, u) =>
            [EMOJI.SUCCESS, EMOJI.ERROR].includes(r.emoji.name) &&
            u.id === msg.author.id,
          max: 1,
          time: 30000, // 30 second timeout for such a critical action
          errors: ["time"],
        });

        if (resetCol.first().emoji.name === EMOJI.SUCCESS) {
          await errorHandler.safeRemoveReactions(resetConfirmMsg, 'reaction removal');

          // Stop all timers
          clearAllTimers();
          stopCacheAutoRefresh();

          // Reset auctioneering module
          const auctioneering = require("./auctioneering.js");
          const auctState = auctioneering.getAuctionState();

          // Clear auctioneering timers
          if (auctState.timers) {
            Object.values(auctState.timers).forEach((t) => {
              clearTimeout(t);
              clearInterval(t);
            });
          }

          // Reset auctioneering state
          auctState.active = false;
          auctState.currentItem = null;
          auctState.sessionItems = [];
          auctState.currentItemIndex = 0;
          auctState.timers = {};
          auctState.paused = false;
          auctState.pausedTime = null;

          // Reset bidding state
          st = {
            a: null,
            lp: {},
            h: [],
            th: {},
            pc: {},
            sd: null,
            cp: null,
            ct: null,
            lb: {},
            pause: false,
            pauseTimer: null,
            auctionLock: false,
            cacheRefreshTimer: null,
          };

          save();

          // Also try to save auctioneering state if available
          if (cfg && cfg.sheet_webhook_url) {
            try {
              await sheetAPI.call('saveBotState', {
                state: { auctionState: auctState, timestamp: new Date().toISOString() },
              });
            } catch (err) {
              console.warn("⚠️ Failed to save auctioneering state:", err.message);
            }
          }

          await msg.reply({
            embeds: [
              new EmbedBuilder()
                .setColor(getColor(COLORS.SUCCESS))
                .setTitle(`${EMOJI.SUCCESS} Complete Reset Successful`)
                .setDescription(
                  `**All auction systems have been reset:**\n\n` +
                    `✅ All timers stopped\n` +
                    `✅ All locked points cleared\n` +
                    `✅ All caches cleared\n` +
                    `✅ All state files reset\n` +
                    `✅ Both modules reset\n\n` +
                    `The system is now ready for a fresh start.`
                )
                .setFooter({
                  text: "You can now run !startauction to begin a new session",
                })
                .setTimestamp(),
            ],
          });
        } else {
          await errorHandler.safeRemoveReactions(resetConfirmMsg, 'reaction removal');
          await msg.reply(`${EMOJI.INFO} Reset cancelled`);
        }
      } catch (e) {
        await errorHandler.safeRemoveReactions(resetConfirmMsg, 'reaction removal');
        await msg.reply(`${EMOJI.INFO} Reset timed out (cancelled)`);
      }
      break;

    case "!recoverauction":
      // 🔧 RECOVER FROM CRASHED AUCTION
      const auctioneering2 = require("./auctioneering.js");
      const auctState2 = auctioneering2.getAuctionState();

      const recoveryEmbed = new EmbedBuilder()
        .setColor(COLORS.WARNING)
        .setTitle(`${EMOJI.WARNING} Auction Recovery`)
        .setDescription(
          `Use this command to recover from a crashed or stuck auction.\n\n` +
            `**Current State:**\n` +
            `• Auctioneering active: ${auctState2.active ? "Yes" : "No"}\n` +
            `• Current item: ${
              auctState2.currentItem ? auctState2.currentItem.item : "None"
            }\n` +
            `• Bidding auction: ${st.a ? st.a.item : "None"}\n` +
            `• Locked points: ${Object.keys(st.lp).length} members\n\n` +
            `**Recovery Options:**\n\n` +
            `1️⃣ **Clear stuck state** - Unlock points, clear timers\n` +
            `2️⃣ **Force finalize** - End current session, submit results\n` +
            `3️⃣ **Full reset** - Use \`!resetauction\` instead\n\n` +
            `What would you like to do?`
        )
        .setFooter({ text: "React: 1️⃣ Clear | 2️⃣ Finalize | ❌ Cancel" });

      const recoveryMsg = await msg.reply({ embeds: [recoveryEmbed] });
      // OPTIMIZATION v6.8: Parallel reactions (3x faster)
      await Promise.all([
        recoveryMsg.react("1️⃣"),
        recoveryMsg.react("2️⃣"),
        recoveryMsg.react(EMOJI.ERROR)
      ]);

      try {
        const recoveryCol = await recoveryMsg.awaitReactions({
          filter: (r, u) =>
            ["1️⃣", "2️⃣", EMOJI.ERROR].includes(r.emoji.name) &&
            u.id === msg.author.id,
          max: 1,
          time: 30000,
          errors: ["time"],
        });

        const choice = recoveryCol.first().emoji.name;
        await errorHandler.safeRemoveReactions(recoveryMsg, 'reaction removal');

        if (choice === "1️⃣") {
          // Clear stuck state
          clearAllTimers();
          st.lp = {};
          st.pc = {};
          st.th = {};
          st.pause = false;
          save();

          await msg.reply({
            embeds: [
              new EmbedBuilder()
                .setColor(getColor(COLORS.SUCCESS))
                .setTitle(`${EMOJI.SUCCESS} Stuck State Cleared`)
                .setDescription(
                  `**Cleared:**\n` +
                    `✅ All timers stopped\n` +
                    `✅ Locked points freed\n` +
                    `✅ Pending confirmations cleared\n\n` +
                    `Active auctions are still running. Use \`!endauction\` if needed.`
                )
                .setTimestamp(),
            ],
          });
        } else if (choice === "2️⃣") {
          // Force finalize
          if (!auctState2.active) {
            return await msg.reply(
              `${EMOJI.ERROR} No active auctioneering session to finalize`
            );
          }

          try {
            // Get the channel
            const channel = await discordCache.getChannel('bidding_channel_id');

            // Call finalize from auctioneering module (need to check if this exists)
            await msg.reply(
              `${EMOJI.CLOCK} Forcing session finalization...`
            );

            // This requires the auctioneering module to have the client and config
            // We'll need to make sure this works
            const auctioneering3 = require("./auctioneering.js");
            if (
              typeof auctioneering3.endAuctionSession === "function"
            ) {
              await auctioneering3.endAuctionSession(cli, cfg, channel);
              await msg.reply(
                `${EMOJI.SUCCESS} Session force-finalized successfully`
              );
            } else {
              await msg.reply(
                `${EMOJI.ERROR} Force finalize function not available. Use !resetauction instead.`
              );
            }
          } catch (err) {
            console.error("Recovery finalize error:", err);
            await msg.reply(
              `${EMOJI.ERROR} Failed to finalize: ${err.message}`
            );
          }
        } else {
          await msg.reply(`${EMOJI.INFO} Recovery cancelled`);
        }
      } catch (e) {
        await errorHandler.safeRemoveReactions(recoveryMsg, 'reaction removal');
        await msg.reply(`${EMOJI.INFO} Recovery timed out (cancelled)`);
      }
      break;
  }
}

// startItemAuction removed - unused function

// ═══════════════════════════════════════════════════════════════════════════
// MEMORY LEAK PREVENTION - Automatic Cleanup System
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Cleans up stale pending bid confirmations (prevents memory leaks)
 *
 * CLEANUP LOGIC:
 * - Scans all pending confirmations (st.pc)
 * - Identifies confirmations older than 60 seconds
 * - Clears associated timers (confirmation timeout + countdown interval)
 * - Removes stale confirmation from state
 * - Persists cleaned state
 *
 * MEMORY LEAK PREVENTION:
 * - Without cleanup, failed/orphaned confirmations accumulate
 * - Timers continue running indefinitely
 * - State object grows unbounded
 * - Bot memory usage increases over time
 *
 * TRIGGERS:
 * - Automatically called every 2 minutes via startCleanupSchedule
 * - Can be called manually for immediate cleanup
 *
 * SAFETY:
 * - Only removes confirmations older than 60 seconds (safety threshold)
 * - Logs cleanup activity for monitoring
 * - Non-blocking operation
 */
function cleanupPendingConfirmations() {
  const now = Date.now();

  let cleaned = 0;
  Object.keys(st.pc).forEach((msgId) => {
    const pending = st.pc[msgId];

    // Check if confirmation is older than timeout
    if (
      pending.timestamp &&
      now - pending.timestamp > TIMEOUTS.STALE_CONFIRMATION
    ) {
      // Clear associated timer if exists
      if (st.th[`c_${msgId}`]) {
        clearTimeout(st.th[`c_${msgId}`]);
        delete st.th[`c_${msgId}`];
      }

      // Clear countdown interval if exists
      if (st.th[`countdown_${msgId}`]) {
        clearInterval(st.th[`countdown_${msgId}`]);
        delete st.th[`countdown_${msgId}`];
      }

      // Remove pending confirmation
      delete st.pc[msgId];
      cleaned++;
    }
  });

  if (cleaned > 0) {
    console.log(`🧹 Cleaned up ${cleaned} stale pending confirmation(s)`);
    save();
  }
}

/**
 * Prunes stuck locked points that should have been released (v6.2 optimization)
 *
 * CLEANUP LOGIC:
 * - Checks if any auction is currently active
 * - If no active auction and locked points exist, they're likely stuck
 * - Logs warning for manual review
 * - Does NOT auto-clear (requires manual !fixlockedpoints command for safety)
 *
 * MEMORY MANAGEMENT:
 * - Prevents locked points from accumulating indefinitely
 * - Detects orphaned locks from crashed auctions
 * - Provides visibility into potential issues
 *
 * SAFETY:
 * - Only reports issues, doesn't auto-fix
 * - Admin must manually clear using !fixlockedpoints
 * - Prevents accidental point loss
 *
 * @returns {Object} Pruning statistics
 */
function checkLockedPoints() {
  const lockedCount = Object.keys(st.lp).length;
  const totalLocked = Object.values(st.lp).reduce((sum, pts) => sum + pts, 0);

  // Check if there's an active auction
  const hasActiveAuction = st.a && st.a.status === 'active';

  // Check auctioneering module too
  let auctioneeringActive = false;
  try {
    const auctModule = require('./auctioneering.js');
    const auctState = auctModule.getAuctionState();
    auctioneeringActive = auctState && auctState.active;
  } catch (e) {
    // Auctioneering module might not be loaded yet
  }

  const anyActiveAuction = hasActiveAuction || auctioneeringActive;

  // Report stuck points if no auction is running
  if (lockedCount > 0 && !anyActiveAuction) {
    console.log(
      `⚠️ MEMORY WARNING: ${lockedCount} members have ${totalLocked}pts locked but no auction is active. ` +
      `Run !fixlockedpoints to clear.`
    );
    return { stuck: true, count: lockedCount, total: totalLocked };
  }

  return { stuck: false, count: lockedCount, total: totalLocked };
}

/**
 * Get memory usage statistics (v6.2 monitoring)
 *
 * METRICS:
 * - Heap memory usage (used, total, limit)
 * - State object sizes (pending confirmations, locked points, history)
 * - Cache status
 *
 * @returns {Object} Memory statistics
 */
function getMemoryStats() {
  const mem = process.memoryUsage();
  const memMB = {
    rss: Math.round(mem.rss / 1024 / 1024),
    heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
    heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
    external: Math.round(mem.external / 1024 / 1024),
  };

  return {
    memory: memMB,
    state: {
      pendingConfirmations: Object.keys(st.pc).length,
      lockedPointsMembers: Object.keys(st.lp).length,
      lockedPointsTotal: Object.values(st.lp).reduce((sum, pts) => sum + pts, 0),
      historySize: st.h.length,
      queueSize: st.q.length,
      cacheSize: st.cp ? st.cp.size() : 0,
    }
  };
}

/**
 * Global cleanup interval reference
 * @type {NodeJS.Timeout|null}
 */
let cleanupInterval = null;

/**
 * Starts periodic cleanup schedule for pending confirmations and memory checks (v6.2 enhanced)
 *
 * SCHEDULE:
 * - Runs cleanupPendingConfirmations every 2 minutes
 * - Runs checkLockedPoints every 5 minutes
 * - Logs memory stats every 30 minutes
 * - Continues indefinitely until bot restart
 * - Prevents multiple schedules (checks if already running)
 *
 * INITIALIZATION:
 * - Called automatically by initializeBidding
 * - Should only be called once during bot startup
 *
 * MEMORY MANAGEMENT:
 * - Essential for long-running bot instances
 * - Prevents memory leaks from orphaned confirmations
 * - Detects stuck locked points
 * - Monitors overall memory usage
 * - Keeps state object clean and bounded
 */
function startCleanupSchedule() {
  if (!cleanupInterval) {
    // Main cleanup: every 2 minutes
    cleanupInterval = setInterval(() => {
      cleanupPendingConfirmations();
    }, 120000); // 2 minutes

    // Locked points check: every 5 minutes
    setInterval(() => {
      checkLockedPoints();
    }, 300000); // 5 minutes

    // Memory stats: every 30 minutes
    setInterval(() => {
      const stats = getMemoryStats();
      console.log(`📊 Memory: ${stats.memory.heapUsed}MB / ${stats.memory.heapTotal}MB heap, ` +
                  `${stats.state.pendingConfirmations} pending, ` +
                  `${stats.state.lockedPointsMembers} locked, ` +
                  `${stats.state.historySize} history`);
    }, 1800000); // 30 minutes

    console.log("🧹 Started cleanup schedule (confirmations, locked points, memory monitoring)");
  }
}

// stopCleanupSchedule removed - unused function

// ═══════════════════════════════════════════════════════════════════════════
// MODULE EXPORTS - Public API
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Public API exports for bidding module
 *
 * INITIALIZATION:
 * - initializeBidding: Setup function (MUST be called first)
 * - startCleanupSchedule: Memory leak prevention (called by init)
 *
 * STATE MANAGEMENT:
 * - loadBiddingState: Load state from file/sheets
 * - saveBiddingState: Persist state to file/sheets
 * - getBiddingState: Get current state object
 * - loadBiddingStateFromSheet: Load from Google Sheets
 * - saveBiddingStateToSheet: Save to Google Sheets
 *
 * COMMAND HANDLING:
 * - handleCommand: Main command router
 *
 * POINTS MANAGEMENT:
 * - clearPointsCache: Clear cached points (used by auctioneering.js)
 * - stopCacheAutoRefresh: Stop auto-refresh timer
 *
 * SESSION MANAGEMENT:
 * - submitSessionTally: Submit results to Google Sheets
 *
 * BID CONFIRMATION:
 * - confirmBid: Handle bid confirmation reactions
 * - cancelBid: Handle bid cancellation reactions
 *
 * STATE RECOVERY:
 * - recoverBiddingState: Recover state after bot restart
 *
 * EMERGENCY FUNCTIONS:
 * - forceEndAuction: Force end stuck auction
 * - forceSaveState: Force save state to sheets
 */
module.exports = {
  // ═════════════════════════════════════════════════════════════════════════
  // INITIALIZATION
  // ═════════════════════════════════════════════════════════════════════════
  initializeBidding,
  startCleanupSchedule, // Used internally by initializeBidding

  // ═════════════════════════════════════════════════════════════════════════
  // STATE MANAGEMENT
  // ═════════════════════════════════════════════════════════════════════════
  loadBiddingState: load,
  saveBiddingState: save,
  getBiddingState: () => st,
  loadBiddingStateFromSheet: loadBiddingStateFromSheet,
  saveBiddingStateToSheet: saveBiddingStateToSheet,

  // ═════════════════════════════════════════════════════════════════════════
  // COMMAND HANDLING
  // ═════════════════════════════════════════════════════════════════════════
  handleCommand: handleCmd,

  // ═════════════════════════════════════════════════════════════════════════
  // POINTS MANAGEMENT
  // ═════════════════════════════════════════════════════════════════════════
  clearPointsCache: clearCache, // Used by auctioneering.js
  stopCacheAutoRefresh,

  // ═════════════════════════════════════════════════════════════════════════
  // SESSION MANAGEMENT
  // ═════════════════════════════════════════════════════════════════════════
  submitSessionTally: submitSessionTally,

  // ═════════════════════════════════════════════════════════════════════════
  // BID CONFIRMATION - Reaction-Based Workflow
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * Handles bid confirmation reactions (✅ confirm)
   *
   * DUAL MODE SUPPORT:
   * - Auctioneering mode: Direct processing with instant feedback
   * - Standalone mode: Confirmation workflow with pause/resume
   *
   * VALIDATION:
   * - Verifies pending confirmation exists
   * - Checks user is the bidder (prevents others from confirming)
   * - Validates auction is still active
   * - Checks bid is still valid (not outbid)
   *
   * RACE CONDITION PREVENTION:
   * - Checks for higher pending bids from other users
   * - Cancels lower bid if higher pending bid exists
   * - Prevents simultaneous confirmations from causing issues
   *
   * POINTS LOCKING:
   * - Unlocks previous winner's points
   * - Locks new bidder's points
   * - Handles self-overbidding (only lock difference)
   *
   * TIME EXTENSION:
   * - Extends auction if bid in final minute (<60s remaining)
   * - Reschedules all timers with new endTime
   * - Maximum 60 extensions enforced
   *
   * CLEANUP:
   * - Removes pending confirmation from state
   * - Clears confirmation timeout timer
   * - Clears countdown interval timer
   * - Deletes confirmation message after 5 seconds
   * - Resumes auction if paused
   *
   * @param {MessageReaction} reaction - Discord reaction object
   * @param {User} user - Discord user who reacted
   * @param {Object} config - Bot configuration object
   */
  confirmBid: async function (reaction, user, config) {
    const p = st.pc[reaction.message.id];
    if (!p) return;

    const guild = reaction.message.guild,
      member = await guild.members.fetch(user.id).catch(() => null);
    if (!member) return;

    if (p.userId !== user.id) {
      await reaction.users.remove(user.id).catch(() => {});
      return;
    }

    // CRITICAL: Check if this is an auctioneering bid
    if (p.isAuctioneering) {
      console.log(`🎯 Processing auctioneering bid confirmation`);

      const auctState = p.auctStateRef;
      const currentItem = auctState.currentItem;

      if (!currentItem || currentItem.status !== "active") {
        await reaction.message.channel.send(
          `❌ <@${user.id}> Auction no longer active`
        );
        await reaction.message.reactions.removeAll().catch(() => {});
        await reaction.message.delete().catch(() => {});
        delete st.pc[reaction.message.id];
        save();
        return;
      }

      if (p.amount < currentItem.curBid) {
        await reaction.message.channel.send(
          `❌ <@${user.id}> Bid invalid. Current: ${currentItem.curBid}pts`
        );
        await reaction.message.reactions.removeAll().catch(() => {});
        await reaction.message.delete().catch(() => {});
        delete st.pc[reaction.message.id];
        save();
        return;
      }

      // Check for higher pending bids from other users
      const higherPendingBids = Object.entries(st.pc)
        .filter(([msgId, pending]) => {
          return (
            msgId !== reaction.message.id && // Not this confirmation
            pending.isAuctioneering && // Is auctioneering bid
            pending.amount > p.amount && // Higher amount
            pending.userId !== p.userId
          ); // Different user
        })
        .sort((a, b) => b[1].amount - a[1].amount); // Sort by amount desc

      if (higherPendingBids.length > 0) {
        const highestPending = higherPendingBids[0][1];
        await reaction.message.channel.send({
          content: `<@${user.id}>`,
          embeds: [
            new EmbedBuilder()
              .setColor(0xffa500)
              .setTitle(`⚠️ Higher Bid Pending!`)
              .setDescription(
                `Your bid: **${p.amount}pts**\n` +
                  `Higher pending bid: **${highestPending.amount}pts** (waiting for confirmation)\n\n` +
                  `Someone else has a higher bid pending. If they confirm first, your bid will be rejected.\n` +
                  `**Your confirmation has been CANCELLED.**`
              ),
          ],
        });
        await reaction.message.reactions.removeAll().catch(() => {});
        await reaction.message.delete().catch(() => {});
        delete st.pc[reaction.message.id];
        save();
        return;
      }

      // Handle previous winner
      if (currentItem.curWin && !p.isSelf) {
        unlock(currentItem.curWin, currentItem.curBid);
        await reaction.message.channel.send({
          content: `<@${currentItem.curWinId}>`,
          embeds: [
            new EmbedBuilder()
              .setColor(getColor(COLORS.WARNING))
              .setTitle(`${EMOJI.WARNING} Outbid!`)
              .setDescription(
                `Someone bid **${p.amount}pts** on **${currentItem.item}**`
              ),
          ],
        });
      }

      // Lock the new bid
      lock(p.username, p.needed);

      // Update current item
      const prevBid = currentItem.curBid;
      currentItem.curBid = p.amount;
      currentItem.curWin = p.username;
      currentItem.curWinId = p.userId;

      if (!currentItem.bids) currentItem.bids = [];
      currentItem.bids.push({
        user: p.username,
        userId: p.userId,
        amount: p.amount,
        timestamp: Date.now(),
      });

      // Check if bid is in last minute - extend time by 1 minute
      const timeLeft = currentItem.endTime - Date.now();
      if (!currentItem.extCnt) currentItem.extCnt = 0; // Initialize if not exists
      if (timeLeft < 60000 && timeLeft > 0 && currentItem.extCnt < ME) {
        const extensionTime = 60000; // 1 minute
        currentItem.endTime += extensionTime;
        currentItem.extCnt++;

        await reaction.message.channel.send({
          embeds: [
            new EmbedBuilder()
              .setColor(0xffa500)
              .setTitle(`⏰ Time Extended!`)
              .setDescription(
                `Bid placed in final minute - adding 1 more minute to the auction!`
              )
              .addFields({
                name: "⏱️ New Time Remaining",
                value: `${Math.ceil(
                  (currentItem.endTime - Date.now()) / 1000
                )}s`,
                inline: true,
              }),
          ],
        });

        console.log(
          `⏰ Time extended for ${currentItem.item} by 1 minute (bid in final minute, ext #${currentItem.extCnt})`
        );

        // CRITICAL: Reschedule timers to reflect new endTime
        if (p.auctRef && typeof p.auctRef.rescheduleItemTimers === "function") {
          p.auctRef.rescheduleItemTimers(
            reaction.client,
            config,
            reaction.message.channel
          );
        }
      }

      // Update via auctioneering module
      if (p.auctRef && typeof p.auctRef.updateCurrentItemState === "function") {
        p.auctRef.updateCurrentItemState({
          curBid: p.amount,
          curWin: p.username,
          curWinId: p.userId,
          bids: currentItem.bids,
        });
      }

      // Clear timeout
      if (st.th[`c_${reaction.message.id}`]) {
        clearTimeout(st.th[`c_${reaction.message.id}`]);
        delete st.th[`c_${reaction.message.id}`];
      }

      // Send confirmation
      await errorHandler.safeEdit(reaction.message, {
        embeds: [
          new EmbedBuilder()
            .setColor(getColor(COLORS.SUCCESS))
            .setTitle(`${EMOJI.SUCCESS} Bid Confirmed!`)
            .setDescription(`Highest bidder on **${currentItem.item}**`)
            .addFields(
              {
                name: `${EMOJI.BID} Your Bid`,
                value: `${p.amount}pts`,
                inline: true,
              },
              {
                name: `${EMOJI.CHART} Previous`,
                value: `${prevBid}pts`,
                inline: true,
              }
            )
            .setFooter({
              text: p.isSelf ? `Self-overbid (+${p.needed}pts)` : "Good luck!",
            }),
        ],
      }, 'message edit');
      await reaction.message.reactions.removeAll().catch(() => {});

      await reaction.message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(getColor(COLORS.AUCTION))
            .setTitle(`${EMOJI.FIRE} New High Bid!`)
            .addFields(
              {
                name: `${EMOJI.BID} Amount`,
                value: `${p.amount}pts`,
                inline: true,
              },
              { name: "👤 Bidder", value: p.username, inline: true }
            ),
        ],
      });

      setTimeout(
        async () => await reaction.message.delete().catch(() => {}),
        5000
      );
      if (p.origMsgId) {
        const orig = await reaction.message.channel.messages
          .fetch(p.origMsgId)
          .catch(() => null);
        if (orig) await errorHandler.safeDelete(orig, 'message deletion');
      }

      delete st.pc[reaction.message.id];
      save();

      console.log(
        `${EMOJI.SUCCESS} Auctioneering bid: ${p.username} - ${p.amount}pts${
          p.isSelf ? ` (self +${p.needed}pts)` : ""
        }`
      );
      return;
    }

    // Original bidding.js auction logic (not auctioneering)
    const a = st.a;
    if (!a || a.status !== "active") {
      await reaction.message.channel.send(
        `❌ <@${user.id}> Auction no longer active`
      );
      await reaction.message.reactions.removeAll().catch(() => {});
      await reaction.message.delete().catch(() => {});
      delete st.pc[reaction.message.id];
      save();

      if (st.pause) {
        resumeAuction(reaction.client, config);
        await reaction.message.channel.send(
          `▶️ **RESUMED** - Auction continues...`
        );
      }
      return;
    }

    if (p.amount < a.curBid) {
      await reaction.message.channel.send(
        `❌ <@${user.id}> Bid invalid. Current: ${a.curBid}pts`
      );
      await reaction.message.reactions.removeAll().catch(() => {});
      await reaction.message.delete().catch(() => {});
      delete st.pc[reaction.message.id];
      save();

      if (st.pause) {
        resumeAuction(reaction.client, config);
        await reaction.message.channel.send(
          `▶️ **RESUMED** - Auction continues...`
        );
      }
      return;
    }

    // Check for higher pending bids from other users
    const higherPendingBids = Object.entries(st.pc)
      .filter(([msgId, pending]) => {
        return (
          msgId !== reaction.message.id && // Not this confirmation
          !pending.isAuctioneering && // Regular bidding.js auction
          pending.amount > p.amount && // Higher amount
          pending.userId !== p.userId
        ); // Different user
      })
      .sort((a, b) => b[1].amount - a[1].amount); // Sort by amount desc

    if (higherPendingBids.length > 0) {
      const highestPending = higherPendingBids[0][1];
      await reaction.message.channel.send({
        content: `<@${user.id}>`,
        embeds: [
          new EmbedBuilder()
            .setColor(0xffa500)
            .setTitle(`⚠️ Higher Bid Pending!`)
            .setDescription(
              `Your bid: **${p.amount}pts**\n` +
                `Higher pending bid: **${highestPending.amount}pts** (waiting for confirmation)\n\n` +
                `Someone else has a higher bid pending. If they confirm first, your bid will be rejected.\n` +
                `**Your confirmation has been CANCELLED.**`
            ),
        ],
      });
      await reaction.message.reactions.removeAll().catch(() => {});
      await reaction.message.delete().catch(() => {});
      delete st.pc[reaction.message.id];
      save();

      if (st.pause) {
        resumeAuction(reaction.client, config);
        await reaction.message.channel.send(
          `▶️ **RESUMED** - Auction continues...`
        );
      }
      return;
    }

    // Handle previous winner
    if (a.curWin && !p.isSelf) {
      unlock(a.curWin, a.curBid);
      await reaction.message.channel.send({
        content: `<@${a.curWinId}>`,
        embeds: [
          new EmbedBuilder()
            .setColor(getColor(COLORS.WARNING))
            .setTitle(`${EMOJI.WARNING} Outbid!`)
            .setDescription(`Someone bid **${p.amount}pts** on **${a.item}**`),
        ],
      });
    }

    lock(p.username, p.needed);

    const prevBid = a.curBid;
    a.curBid = p.amount;
    a.curWin = p.username;
    a.curWinId = p.userId;
    a.bids.push({
      user: p.username,
      userId: p.userId,
      amount: p.amount,
      timestamp: Date.now(),
    });

    const timeLeft = st.pause ? st.a.remainingTime : a.endTime - Date.now();
    if (timeLeft < 60000 && a.extCnt < ME) {
      if (!st.pause) {
        a.endTime += 60000;
      } else {
        st.a.remainingTime += 60000;
      }
      a.extCnt++;
      a.go1 = false;
      a.go2 = false;

      await reaction.message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(0xffa500)
            .setTitle(`⏰ Time Extended!`)
            .setDescription(
              `Bid placed in final minute - adding 1 more minute to the auction!`
            )
            .addFields({
              name: "⏱️ New Time Remaining",
              value: `${Math.ceil(
                (st.pause ? st.a.remainingTime : a.endTime - Date.now()) / 1000
              )}s`,
              inline: true,
            }),
        ],
      });

      console.log(
        `⏰ Time extended for ${a.item} by 1 minute (bid in final minute)`
      );

      // CRITICAL: Reschedule timers to reflect new endTime
      schedTimers(reaction.client, config);
    }

    if (st.th[`c_${reaction.message.id}`]) {
      clearTimeout(st.th[`c_${reaction.message.id}`]);
      delete st.th[`c_${reaction.message.id}`];
    }

    await errorHandler.safeEdit(reaction.message, {
      embeds: [
        new EmbedBuilder()
          .setColor(getColor(COLORS.SUCCESS))
          .setTitle(`${EMOJI.SUCCESS} Bid Confirmed!`)
          .setDescription(`Highest bidder on **${a.item}**`)
          .addFields(
            {
              name: `${EMOJI.BID} Your Bid`,
              value: `${p.amount}pts`,
              inline: true,
            },
            {
              name: `${EMOJI.CHART} Previous`,
              value: `${prevBid}pts`,
              inline: true,
            },
            {
              name: `${EMOJI.TIME} Time Left`,
              value: fmtTime(timeLeft),
              inline: true,
            }
          )
          .setFooter({
            text: p.isSelf
              ? `Self-overbid (+${p.needed}pts)`
              : timeLeft < 60000 && a.extCnt < ME
              ? `${EMOJI.CLOCK} Extended!`
              : "Good luck!",
          }),
      ],
    }, 'message edit');
    await reaction.message.reactions.removeAll().catch(() => {});

    await reaction.message.channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(getColor(COLORS.AUCTION))
          .setTitle(`${EMOJI.FIRE} New High Bid!`)
          .addFields(
            {
              name: `${EMOJI.BID} Amount`,
              value: `${p.amount}pts`,
              inline: true,
            },
            { name: "👤 Bidder", value: p.username, inline: true }
          ),
      ],
    });

    setTimeout(
      async () => await reaction.message.delete().catch(() => {}),
      5000
    );
    if (p.origMsgId) {
      const orig = await reaction.message.channel.messages
        .fetch(p.origMsgId)
        .catch(() => null);
      if (orig) await errorHandler.safeDelete(orig, 'message deletion');
    }

    delete st.pc[reaction.message.id];
    save();

    if (st.pause) {
      resumeAuction(reaction.client, config);
      await reaction.message.channel.send(
        `${EMOJI.PLAY} **RESUMED** - Timer continues with ${fmtTime(
          a.endTime - Date.now()
        )} remaining...`
      );
    } else if (timeLeft < 60000) {
      schedTimers(reaction.client, config);
    }

    console.log(
      `${EMOJI.SUCCESS} Bid: ${p.username} - ${p.amount}pts${
        p.isSelf ? ` (self +${p.needed}pts)` : ""
      }`
    );
  },

  /**
   * Handles bid cancellation reactions (❌ cancel)
   *
   * AUTHORIZATION:
   * - Bid owner can always cancel their own bid
   * - Admins can cancel any pending bid
   * - Others cannot cancel (reaction is removed)
   *
   * CANCELLATION PROCESS:
   * 1. Update confirmation message to show "Bid Canceled"
   * 2. Remove all reactions from message
   * 3. Delete confirmation message after 3 seconds
   * 4. Delete original bid command message
   * 5. Clear confirmation timeout timer
   * 6. Remove pending confirmation from state
   * 7. Resume auction if paused (standalone mode only)
   *
   * POINTS MANAGEMENT:
   * - NO points are locked/unlocked (bid never processed)
   * - User's points remain fully available
   *
   * STATE CLEANUP:
   * - Removes pending confirmation (st.pc)
   * - Clears timeout timer (st.th)
   * - Persists cleaned state
   *
   * @param {MessageReaction} reaction - Discord reaction object
   * @param {User} user - Discord user who reacted
   * @param {Object} config - Bot configuration object
   */
  cancelBid: async function (reaction, user, config) {
    const p = st.pc[reaction.message.id];
    if (!p) return;

    const guild = reaction.message.guild,
      member = await guild.members.fetch(user.id).catch(() => null);
    if (!member) return;

    const isOwner = p.userId === user.id,
      isAdm = isAdmFunc(member, config);

    if (!isOwner && !isAdm) {
      await reaction.users.remove(user.id).catch(() => {});
      return;
    }

    await errorHandler.safeEdit(reaction.message, {
      embeds: [
        new EmbedBuilder()
          .setColor(getColor(COLORS.INFO))
          .setTitle(`${EMOJI.ERROR} Bid Canceled`)
          .setDescription("Not placed"),
      ],
    }, 'message edit');
    await reaction.message.reactions.removeAll().catch(() => {});
    setTimeout(
      async () => await reaction.message.delete().catch(() => {}),
      3000
    );

    if (p.origMsgId) {
      const orig = await reaction.message.channel.messages
        .fetch(p.origMsgId)
        .catch(() => null);
      if (orig) await errorHandler.safeDelete(orig, 'message deletion');
    }

    if (st.th[`c_${reaction.message.id}`]) {
      clearTimeout(st.th[`c_${reaction.message.id}`]);
      delete st.th[`c_${reaction.message.id}`];
    }

    delete st.pc[reaction.message.id];
    save();

    // Resume if paused (only for regular bidding.js auctions, not auctioneering)
    if (!p.isAuctioneering && st.pause) {
      resumeAuction(reaction.client, config);
      await reaction.message.channel.send(
        `${EMOJI.PLAY} **RESUMED** - Bid canceled, auction continues...`
      );
    }
  },

  // ═════════════════════════════════════════════════════════════════════════
  // STATE RECOVERY - Bot Restart Handling
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * Recovers bidding state after bot restart
   *
   * RECOVERY PROCESS:
   * 1. Load state from local file or Google Sheets
   * 2. Validate cache freshness (<60 minutes old)
   * 3. Clear stale cache if too old
   * 4. Reschedule auction timers if auction is active
   *
   * CACHE HANDLING:
   * - Checks cache age (Date.now() - st.ct)
   * - Clears cache if older than 60 minutes (prevents stale data)
   * - Logs warning if active auction has no cache
   *
   * TIMER RECOVERY:
   * - Reschedules going once/twice/final/end timers
   * - Calculates new timeouts based on saved endTime
   * - Critical for auction continuity after restart
   *
   * VALIDATION:
   * - Checks if auction is still active
   * - Warns if auction active but cache missing
   * - Ensures state consistency
   *
   * @param {Client} client - Discord client instance
   * @param {Object} config - Bot configuration object
   * @returns {Promise<boolean>} True if state recovered successfully
   */
  recoverBiddingState: async (client, config) => {
    if (await load()) {
      console.log(`${EMOJI.SUCCESS} State recovered`);
      if (st.cp) {
        const age = Math.floor((Date.now() - st.ct) / 60000);
        console.log(
          `${EMOJI.CHART} Cache: ${
            st.cp.size()
          } members (${age}m old)`
        );
        if (age > 60) {
          console.log(`${EMOJI.WARNING} Cache old, clearing...`);
          clearCache();
        }
      } else console.log(`${EMOJI.WARNING} No cache`);

      if (st.a && st.a.status === "active") {
        console.log(`${EMOJI.FIRE} Rescheduling timers...`);
        schedTimers(client, config);
        if (!st.cp)
          console.warn(`${EMOJI.WARNING} Active auction but no cache!`);
      }
      return true;
    }
    return false;
  },

  // ═════════════════════════════════════════════════════════════════════════
  // EMERGENCY FUNCTIONS - Admin Recovery Tools
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * Forces immediate end of active auction (emergency recovery)
   *
   * CRITICAL - ADMIN ONLY:
   * - Should only be used when auction is stuck/crashed
   * - Bypasses normal auction end workflow
   * - Forces session finalization immediately
   *
   * CLEANUP PROCESS:
   * 1. Clear ALL auction timers (going once/twice/final/end/next/start)
   * 2. Call finalize() to submit results and clear state
   * 3. Log force-end action
   *
   * WHEN TO USE:
   * - Auction is stuck (timers not firing)
   * - Bot crashed during auction
   * - Need to end auction immediately
   * - Normal !endauction command not working
   *
   * SIDE EFFECTS:
   * - Session results submitted to Google Sheets
   * - All locked points cleared
   * - History cleared after submission
   * - Cache cleared
   * - Queue remains intact (if items left)
   *
   * @param {Client} client - Discord client instance
   * @param {Object} config - Bot configuration object
   */
  forceEndAuction: async (client, config) => {
    if (!st.a) {
      console.log(`${EMOJI.WARNING} No active auction to end`);
      return;
    }

    console.log(`${EMOJI.EMERGENCY} Force ending auction: ${st.a.item}`);

    // Clear all timers
    [
      "goingOnce",
      "goingTwice",
      "finalCall",
      "auctionEnd",
      "next",
      "aStart",
    ].forEach((k) => {
      if (st.th[k]) {
        clearTimeout(st.th[k]);
        delete st.th[k];
      }
    });

    // Force finalize current session
    await finalize(client, config);

    console.log(`${EMOJI.SUCCESS} Auction force-ended`);
  },

  /**
   * Forces immediate state save to Google Sheets (emergency backup)
   *
   * CRITICAL - ADMIN ONLY:
   * - Bypasses normal save throttling
   * - Immediately syncs state to Google Sheets
   * - Use when state must be persisted immediately
   *
   * USE CASES:
   * - Before planned bot restart
   * - After critical state change
   * - Before risky operation
   * - Manual backup request
   *
   * WHAT GETS SAVED:
   * - Active auction state
   * - Item queue
   * - Locked points
   * - Session history
   *
   * WHAT IS NOT SAVED:
   * - Timer handles (recreated on load)
   * - Pending confirmations (cleaned up)
   * - Rate limit timestamps (reset on restart)
   * - Cache refresh timer (recreated on load)
   *
   * @returns {Promise<void>} Resolves when save completes
   */
  forceSaveState: async () => {
    return await saveBiddingStateToSheet();
  },
};
