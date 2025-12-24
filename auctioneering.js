/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ELYSIUM AUCTIONEERING SYSTEM v2.1
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Comprehensive auction session management system for Discord-based item
 * auctions with Google Sheets integration.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * AUCTION LIFECYCLE
 * ───────────────────────────────────────────────────────────────────────────
 *
 * 1. INITIALIZATION
 *    └─ Fetch items from Google Sheets with fallback cache
 *    └─ Load member points from bidding system
 *    └─ Filter out already-completed items
 *    └─ Initialize auction state
 *
 * 2. PREVIEW PHASE (30 seconds)
 *    └─ Display upcoming items to @everyone
 *    └─ Show item details, starting bid, duration
 *    └─ Countdown to auction start
 *
 * 3. ITEM AUCTION PHASE
 *    └─ Create dedicated Discord thread for each item
 *    └─ Post initial announcement with item details
 *    └─ Accept and validate bids in real-time
 *    └─ Auto-extend on last-minute bids (anti-snipe)
 *    └─ Countdown announcements (60s, 30s, 10s)
 *
 * 4. ITEM COMPLETION
 *    └─ Announce winner and winning bid
 *    └─ Log results to Google Sheets
 *    └─ Lock and archive thread
 *    └─ Proceed to next item
 *
 * 5. SESSION FINALIZATION
 *    └─ Generate session summary
 *    └─ Post results to admin logs
 *    └─ Clear auction state and locked points
 *    └─ Save final state to sheets
 *
 * ───────────────────────────────────────────────────────────────────────────
 * KEY FEATURES
 * ───────────────────────────────────────────────────────────────────────────
 *
 * ✓ Single-session management with state persistence
 * ✓ Real-time bid validation and point locking
 * ✓ Automatic time extensions on late bids (prevents sniping)
 * ✓ Circuit breaker pattern with fallback cache
 * ✓ Thread capacity management and auto-cleanup
 * ✓ Pause/resume functionality for admin control
 * ✓ Skip/cancel individual items
 * ✓ Force-submit results for error recovery
 * ✓ Scheduled weekly auctions (Every Sunday 12:00 PM GMT+8)
 * ✓ Comprehensive error handling and logging
 *
 * ───────────────────────────────────────────────────────────────────────────
 * TIMER MANAGEMENT
 * ───────────────────────────────────────────────────────────────────────────
 *
 * PREVIEW TIMER (30s)
 *   └─ Displays next item before auction starts
 *   └─ Allows members to prepare
 *
 * COUNTDOWN TIMERS
 *   └─ go1: 60 seconds remaining announcement
 *   └─ go2: 30 seconds remaining announcement
 *   └─ go3: 10 seconds remaining announcement
 *   └─ itemEnd: Final auction end and winner announcement
 *
 * TIME EXTENSIONS
 *   └─ Automatic: Bids in last 30s extend by 30s
 *   └─ Manual: Admin can extend via !extendauction command
 *   └─ Rescheduling: Timers recalculated on extension
 *
 * PAUSE/RESUME LOGIC
 *   └─ Pause: Clears all timers, records pause time
 *   └─ Resume: Adjusts endTime by pause duration
 *   └─ State persistence: Saves state on pause/resume
 *
 * ───────────────────────────────────────────────────────────────────────────
 * QUEUE MANAGEMENT
 * ───────────────────────────────────────────────────────────────────────────
 *
 * Linear queue processing (first-in-first-out):
 *   └─ Items processed sequentially by index
 *   └─ Support for quantity batches (Item x3 = 3 separate auctions)
 *   └─ Skip functionality to jump ahead
 *   └─ Cancel functionality to remove items
 *
 * ───────────────────────────────────────────────────────────────────────────
 * STATE PERSISTENCE
 * ───────────────────────────────────────────────────────────────────────────
 *
 * Auto-save triggers:
 *   └─ Item start/end
 *   └─ Pause/resume
 *   └─ Time extension
 *   └─ Winner confirmation
 *
 * Saved state includes:
 *   └─ Current item details
 *   └─ Session items array
 *   └─ Current index position
 *   └─ Active/paused status
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

const { EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle, ComponentType } = require("discord.js");
const { Timeout } = require("timers");
const errorHandler = require('./utils/error-handler');
const { PointsCache } = require('./utils/points-cache');
const { SheetAPI } = require('./utils/sheet-api');
const {
  getCurrentTimestamp,
  getSundayOfWeek,
  sleep,
  normalizeUsername,
} = require("./utils/common");
const auctionCache = require('./utils/auction-cache');
const attendance = require("./attendance");

// MongoDB integration (Phase 4)
const mongoHelpers = require('./utils/mongodb-helpers');
const sheetSync = require('./services/sheet-sync');

// Feature flags: Enable MongoDB for operations
const USE_MONGODB_AUCTIONEERING = process.env.USE_MONGODB_AUCTIONEERING === 'true';
const USE_MONGODB_BIDDING = process.env.USE_MONGODB_BIDDING === 'true';

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 1: MODULE STATE & INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Function reference for posting data to Google Sheets.
 * Initialized via setPostToSheet() during bot startup.
 * @type {Function|null}
 */
let postToSheetFunc = null;

/**
 * Intelligence Engine reference for AI/ML features.
 * Initialized via initialize() during bot startup.
 * @type {IntelligenceEngine|null}
 */
let intelligenceEngine = null;

/**
 * Cache for attendance records (legacy, kept for backwards compatibility).
 * @type {Object.<string, Array<string>>}
 */
let attendanceCache = {};

/**
 * Current session boss name (legacy, kept for backwards compatibility).
 * @type {string|null}
 */
let currentSessionBoss = null;

/**
 * Sets the postToSheet function reference for Google Sheets integration.
 * Must be called during bot initialization before starting auctions.
 *
 * @param {Function} fn - The postToSheet function from the sheets module
 */
function setPostToSheet(fn) {
  postToSheetFunc = fn;
  console.log(`${EMOJI.SUCCESS} postToSheet function initialized`);
}

/**
 * Retrieves the postToSheet function reference.
 * Throws an error if not initialized.
 *
 * @returns {Function} The postToSheet function
 * @throws {Error} If postToSheet has not been initialized
 */
function getPostToSheet() {
  if (!postToSheetFunc) {
    throw new Error(
      "❌ CRITICAL: postToSheet not initialized. Call setPostToSheet() first."
    );
  }
  return postToSheetFunc;
}

/**
 * Primary auction state object tracking the current session.
 * @type {Object}
 * @property {boolean} active - Whether an auction is currently running
 * @property {Object|null} currentItem - The item currently being auctioned
 * @property {Array<Object>} sessionItems - All items in the current session queue
 * @property {number} currentItemIndex - Index of current item in sessionItems array
 * @property {Object.<string, NodeJS.Timeout>} timers - Active timers for countdown/end
 * @property {boolean} paused - Whether the auction is paused
 * @property {number|null} pausedTime - Timestamp when auction was paused
 */
let auctionState = {
  active: false,
  currentItem: null,
  sessionItems: [],
  currentItemIndex: 0,
  timers: {},
  paused: false,
  pausedTime: null,
  sessionFinalized: true, // Flag to track if finalization (tallies, item moves) is complete
};

/**
 * Function reference to check if a user is an admin.
 * @type {Function|null}
 */
let isAdmFunc = null;

/**
 * Bot configuration object.
 * @type {Object|null}
 */
let cfg = null;

/**
 * Unified Google Sheets API client.
 * @type {SheetAPI|null}
 */
let sheetAPI = null;

/**
 * Discord channel cache for reducing API calls.
 * @type {Object|null}
 */
let discordCache = null;

/**
 * Reference to the bidding module for point validation.
 * @type {Object|null}
 */
let biddingModule = null;

/**
 * Timestamp when the current session started.
 * @type {number|null}
 */
let sessionStartTime = null;

/**
 * Sequential session number.
 * @type {number}
 */
let sessionNumber = 1;

/**
 * Formatted timestamp string for the current session.
 * @type {string|null}
 */
let sessionTimestamp = null;

/**
 * Session start date/time string.
 * @type {string|null}
 */
let sessionStartDateTime = null;

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 2: CONSTANTS & CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Wait time between auction items (milliseconds).
 * @constant {number}
 */
const ITEM_WAIT = 20000;

/**
 * Discord embed color codes for different message types.
 * @constant {Object.<string, number>}
 */
const COLORS = {
  SUCCESS: 0x00ff00,
  WARNING: 0xffa500,
  ERROR: 0xff0000,
  INFO: 0x4a90e2,
  AUCTION: 0xffd700,
};

/**
 * Emoji constants for consistent visual feedback.
 * @constant {Object.<string, string>}
 */
const EMOJI = {
  SUCCESS: "✅",
  ERROR: "❌",
  WARNING: "⚠️",
  INFO: "ℹ️",
  AUCTION: "🔨",
  BID: "💰",
  TIME: "⏱️",
  CLOCK: "🕐",
  LIST: "📋",
  PAUSE: "⏸️",
  PLAY: "▶️",
  FIRE: "🔥",
  STOP: "⏹️",
  TROPHY: "🏆",
  CHART: "📊",
  LOCK: "🔒",
  BELL: "🔔",
};

/**
 * Timeout durations for various operations (milliseconds).
 * @constant {Object.<string, number>}
 */
const TIMEOUTS = {
  FETCH_TIMEOUT: 10000, // 10 seconds - API fetch timeout
  CONFIRMATION: 30000, // 30 seconds - user confirmation timeout
  PREVIEW_DELAY: 30000, // 30 seconds - item preview delay
};

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 3: UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Creates a disabled row with fresh button instances (defensive: avoids mutation)
 * @param {ButtonBuilder} btn1 - First button to disable
 * @param {ButtonBuilder} btn2 - Second button to disable
 * @returns {ActionRowBuilder} Row with disabled buttons
 */
function createDisabledRow(btn1, btn2) {
  const disabledBtn1 = new ButtonBuilder()
    .setCustomId(btn1.data.custom_id)
    .setLabel(btn1.data.label)
    .setStyle(btn1.data.style)
    .setDisabled(true);

  const disabledBtn2 = new ButtonBuilder()
    .setCustomId(btn2.data.custom_id)
    .setLabel(btn2.data.label)
    .setStyle(btn2.data.style)
    .setDisabled(true);

  return new ActionRowBuilder().addComponents(disabledBtn1, disabledBtn2);
}

/**
 * Initializes the auctioneering module with required dependencies.
 * Must be called during bot startup before any auctions can run.
 *
 * @param {Object} config - Bot configuration object with channel IDs and settings
 * @param {Function} isAdminFunc - Function to check if a user is an admin
 * @param {Object} biddingModuleRef - Reference to the bidding module for point management
 */
function initialize(config, isAdminFunc, biddingModuleRef, cache = null, intelligenceEngineRef = null) {
  cfg = config;
  isAdmFunc = isAdminFunc;
  biddingModule = biddingModuleRef;
  sheetAPI = new SheetAPI(config.sheet_webhook_url);
  discordCache = cache;
  intelligenceEngine = intelligenceEngineRef;
  console.log(`${EMOJI.SUCCESS} Auctioneering system initialized`);

  // MongoDB integration status (Phase 4)
  if (USE_MONGODB_AUCTIONEERING) {
    console.log(`${EMOJI.SUCCESS} [MongoDB] Auctioneering using MongoDB-first architecture`);
    console.log(`${EMOJI.INFO} [MongoDB] Background Sheet sync enabled (priorities: IMMEDIATE/HIGH/NORMAL/LOW)`);
  } else {
    console.log(`${EMOJI.INFO} Auctioneering using Google Sheets (legacy mode)`);
    console.log(`${EMOJI.INFO} Set USE_MONGODB_AUCTIONEERING=true to enable MongoDB`);
  }

  if (intelligenceEngine) {
    console.log(`${EMOJI.SUCCESS} Intelligence Engine linked to auctioneering (auto-learning enabled)`);
  }
}

/**
 * Clears all active timers from the auction state
 * Optimization: Consolidates timer clearing logic
 *
 * @returns {number} Number of timers cleared
 */
function clearAllAuctionTimers() {
  if (!auctionState.timers || typeof auctionState.timers !== 'object') return 0;
  const count = Object.keys(auctionState.timers).length;
  Object.values(auctionState.timers).forEach((t) => clearTimeout(t));
  auctionState.timers = {};
  return count;
}

/**
 * Gets the current timestamp formatted for Manila timezone (GMT+8).
 * Format: MM/DD/YYYY HH:MM
 *
 * Uses optimized cached Manila time conversion from timestamp-cache utility.
 *
 * @returns {string} Formatted timestamp string
 */
const { getFormattedManilaTime: getTimestamp } = require('./utils/timestamp-cache');

/**
 * Formats milliseconds into a human-readable time string.
 * Examples: "45s", "2m 30s", "1h 15m"
 *
 * Uses shared formatUptime utility from utils/common.js
 *
 * @param {number} ms - Time duration in milliseconds
 * @returns {string} Formatted time string
 */
const { formatUptime: fmtTime } = require('./utils/common');

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 4: DATA ACCESS & PERSISTENCE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Fetches auction items from Google Sheets with circuit breaker and fallback cache.
 *
 * FEATURES:
 * - Circuit breaker prevents cascade failures during API outages
 * - Automatic fallback to cached items if API fails
 * - Exponential backoff retry logic (2s, 4s, 6s)
 * - Never returns null (returns empty array on total failure)
 * - Records success/failure metrics for monitoring
 *
 * @param {string} url - Google Sheets webhook URL
 * @param {number} [retries=3] - Maximum retry attempts
 * @param {boolean} [allowCache=true] - Allow fallback to cached items
 * @returns {Promise<Array<Object>>} Items array (never null, but may be empty)
 */
async function fetchSheetItems(url, retries = 3, allowCache = true) {
  // ═══════════════════════════════════════════════════════════════════════════
  // ═══════════════════════════════════════════════════════════════════════════
  // GOOGLE SHEETS PATH (MongoDB removed per user request)
  // ═══════════════════════════════════════════════════════════════════════════

  // Check circuit breaker - skip if open and use cache
  if (!auctionCache.canAttemptFetch()) {
    console.log(`${EMOJI.WARNING} Circuit breaker OPEN - using cached items`);
    const cachedItems = auctionCache.getCachedItems();

    if (cachedItems.length > 0) {
      console.log(`${EMOJI.INFO} Using ${cachedItems.length} cached items from ${auctionCache.cache.lastUpdate}`);
      return cachedItems;
    } else {
      console.error(`${EMOJI.ERROR} No cached items available and circuit is open!`);
      return []; // Return empty array instead of null
    }
  }

  // Attempt to fetch from Google Sheets
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const data = await sheetAPI.call('getBiddingItems');
      const items = data.items || [];

      console.log(
        `${EMOJI.SUCCESS} Fetched ${items.length} items from Google Sheets`
      );

      // Record success in cache and circuit breaker
      auctionCache.recordSuccess(items);

      return items;
    } catch (e) {
      console.error(
        `${EMOJI.ERROR} Fetch items attempt ${attempt}/${retries}:`,
        e.message
      );

      // Record failure if last attempt
      if (attempt === retries) {
        auctionCache.recordFailure(e);
      }

      if (attempt < retries) {
        // OPTIMIZATION v6.7: True exponential backoff with jitter
        // Formula: min(baseDelay * 2^attempt + jitter, maxDelay)
        // Result: 2s, 4s, 8s, 16s (+0-1s jitter) instead of linear 2s, 4s, 6s
        const backoff = Math.min(
          2000 * Math.pow(2, attempt) + Math.random() * 1000,
          30000 // Max 30s
        );
        console.log(`${EMOJI.WARNING} Retrying in ${Math.round(backoff / 1000)}s...`);
        await new Promise((resolve) => setTimeout(resolve, backoff));
      }
    }
  }

  // All retries failed - use fallback cache
  console.error(
    `${EMOJI.ERROR} Failed to fetch items after ${retries} attempts`
  );

  if (allowCache) {
    const cachedItems = auctionCache.getCachedItems();

    if (cachedItems.length > 0) {
      const cacheAge = auctionCache.cache.lastFetch
        ? Math.floor((Date.now() - auctionCache.cache.lastFetch) / 1000 / 60)
        : '∞';

      console.log(
        `${EMOJI.WARNING} FALLBACK: Using ${cachedItems.length} cached items (age: ${cacheAge} minutes)`
      );

      return cachedItems;
    } else {
      console.error(`${EMOJI.ERROR} CRITICAL: No cached items available!`);
      return []; // Return empty array instead of null
    }
  }

  return []; // Return empty array instead of null
}

/**
 * Logs auction results to Google Sheets for permanent record keeping.
 *
 * @param {string} url - Google Sheets webhook URL
 * @param {number} itemIndex - Index of item in the sheet
 * @param {string} winner - Winner's Discord username (or empty if no winner)
 * @param {number} winningBid - Final winning bid amount in points
 * @param {number} totalBids - Sum of all bids placed on this item
 * @param {number} bidCount - Number of bids placed
 * @param {string} itemSource - Source of item (e.g., "GoogleSheet")
 * @param {string} timestamp - Formatted timestamp of auction completion
 * @returns {Promise<boolean>} True if successfully logged, false otherwise
 */
async function logAuctionResult(
  url,
  itemIndex,
  winner,
  winningBid,
  totalBids,
  bidCount,
  itemSource,
  timestamp,
  winnerId = null,
  itemId = null  // MongoDB item ID (optional, for MongoDB operations)
) {
  // ═══════════════════════════════════════════════════════════════════════════
  // GOOGLE SHEETS PATH (MongoDB removed per user request)
  // ═══════════════════════════════════════════════════════════════════════════
  try {
    await sheetAPI.call('logAuctionResult', {
      itemIndex,
      winner,
      winningBid,
      totalBids,
      bidCount,
      itemSource,
      timestamp,
    });
    console.log(
      `${EMOJI.SUCCESS} Result logged: ${
        winner || "No winner"
      } - ${winningBid}pts`
    );
    return true;
  } catch (e) {
    console.error(`${EMOJI.ERROR} Log result:`, e);
    return false;
  }
}

/**
 * Saves the current auction state to Google Sheets for crash recovery.
 *
 * FEATURES:
 * - Circular reference protection (skips timers and circular objects)
 * - Cleans item data to only include serializable fields
 * - Auto-save triggers on important state changes
 * - Enables session recovery after bot restart
 *
 * @param {string} url - Google Sheets webhook URL
 * @returns {Promise<boolean>} True if successfully saved, false otherwise
 */
async function saveAuctionState(url) {
  // 🧩 Clean item (avoid timers and circular data)
  const cleanItem =
    auctionState.currentItem && typeof auctionState.currentItem === "object"
      ? {
          item: auctionState.currentItem.item,
          startPrice: auctionState.currentItem.startPrice,
          duration: auctionState.currentItem.duration,
          curBid: auctionState.currentItem.curBid,
          curWin: auctionState.currentItem.curWin,
          curWinId: auctionState.currentItem.curWinId,
          status: auctionState.currentItem.status,
          source: auctionState.currentItem.source,
          sheetIndex: auctionState.currentItem.sheetIndex,
          bossName: auctionState.currentItem.bossName,
          _id: auctionState.currentItem._id  // Include MongoDB ID
        }
      : null;

  const stateToSave = {
    auctionState: {
      active: auctionState.active,
      currentItem: cleanItem,
      sessionItems: auctionState.sessionItems,
      currentItemIndex: auctionState.currentItemIndex,
      paused: auctionState.paused,
    },
    timestamp: getTimestamp(),
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // GOOGLE SHEETS PATH (MongoDB removed per user request)
  // ═══════════════════════════════════════════════════════════════════════════
  try {
    await sheetAPI.call('saveBotState', { state: stateToSave });
    console.log(`${EMOJI.SUCCESS} Auction state saved`);
    return true;
  } catch (e) {
    console.error(`${EMOJI.ERROR} Save auction state:`, e);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 5: SESSION LIFECYCLE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Starts a new auction session with items from Google Sheets.
 *
 * PROCESS:
 * 1. Validates parameters and checks for existing session
 * 2. Fetches bidding channel from Discord
 * 3. Loads member points cache
 * 4. Fetches items from Google Sheets (with fallback cache)
 * 5. Filters out already-completed items
 * 6. Displays 30-second preview with item list
 * 7. Starts auctioning items sequentially
 *
 * SAFETY:
 * - Prevents starting multiple concurrent sessions
 * - Validates channel type (must be text or announcement)
 * - Checks for large datasets (warns at 1000+, blocks at 5000+)
 * - Circuit breaker pattern for API failures
 *
 * @param {Discord.Client} client - Discord bot client
 * @param {Object} config - Bot configuration with channel IDs and webhook URL
 * @param {Discord.TextChannel} channel - Discord channel to start auction in
 * @returns {Promise<void>}
 */
async function startAuctioneering(client, config, channel) {
  // Validate parameters
  if (!client || !config || !channel) {
    console.error(`${EMOJI.ERROR} Invalid parameters to startAuctioneering`);
    return;
  }

  if (auctionState.active) {
    await channel.send(`❌ Auction already running`);
    return;
  }

  // ✅ FIX: Always fetch the correct bidding channel from config
  try {
    const biddingChannel = await discordCache.getChannel('bidding_channel_id');

    if (!biddingChannel) {
      console.error(`❌ Could not fetch bidding channel with ID: ${config.bidding_channel_id}`);
      await channel.send(`❌ Bidding channel not found. Please check config.`);
      return;
    }

    // Use the fetched channel instead of the parameter
    channel = biddingChannel;

    console.log(`✅ Using bidding channel: ${channel.name} (${channel.id}), Type: ${channel.type}`);

    // Validate it's a text channel (0 = GUILD_TEXT, 5 = GUILD_ANNOUNCEMENT)
    if (![0, 5].includes(channel.type)) {
      console.error(
        `❌ Invalid channel type (${channel.type}) for bidding channel.\n` +
        `   Channel: ${channel.name} (${channel.id})\n` +
        `   Expected: Text (0) or Announcement (5)\n` +
        `   Got: ${channel.type === 11 ? 'Thread (11)' : channel.type === 12 ? 'Private Thread (12)' : `Unknown (${channel.type})`}\n` +
        `   This means config.bidding_channel_id is pointing to the wrong channel.\n` +
        `   Please update config with the correct text channel ID.`
      );

      const errorMsg = `❌ **Configuration Error**\n\n` +
        `The configured bidding channel is not a valid text channel.\n` +
        `**Current:** ${channel.name} (Type: ${channel.type})\n` +
        `**Required:** Text or Announcement channel\n\n` +
        `Please update \`config.bidding_channel_id\` with the correct channel ID.`;

      // Try to send to the command channel
      await channel.send(errorMsg).catch(errorHandler.safeCatch('send bidding channel config error'));
      return;
    }
  } catch (err) {
    console.error(`❌ Failed to fetch bidding channel:`, err);
    await channel.send(`❌ Failed to fetch bidding channel: ${err.message}`).catch(errorHandler.safeCatch('send fetch bidding channel error'));
    return;
  }

  // Load points cache
  try {
    const pointsData = await sheetAPI.call('getBiddingPoints');
    // Get members array from response (could be top-level or nested)
    const members = pointsData.members || pointsData.data?.members || [];
    // Get points map from response (legacy field for backward compatibility)
    const points = pointsData.points || pointsData.data?.points || {};

    if (members.length === 0 && Object.keys(points).length === 0) {
      await channel.send(`❌ No points data received`);
      return;
    }

    // Convert members array to points map if needed
    // Guard against blank usernames and NaN values
    const pointsMap = Object.keys(points).length > 0 ? points : members.reduce((acc, member) => {
      const name = member?.username?.trim();
      if (!name) return acc;
      acc[name] = Number(member?.pointsLeft) || 0;
      return acc;
    }, {});

    // Store in bidding module's cache with PointsCache for O(1) lookups
    const biddingState = biddingModule.getBiddingState();
    biddingState.cp = new PointsCache(pointsMap);
    biddingState.ct = Date.now();
    biddingModule.saveBiddingState();

    console.log(`✅ Loaded ${biddingState.cp.size()} members' points`);
  } catch (err) {
    console.error(`❌ Failed to load points:`, err);
    await channel.send(`❌ Failed to load points: ${err.message}`);
    return;
  }

  // Fetch sheet items with fallback cache
  const sheetItems = await fetchSheetItems(config.sheet_webhook_url);

  // Check if we got items (never null due to fallback, but could be empty)
  if (sheetItems.length === 0) {
    const status = auctionCache.getStatus();

    await channel.send(
      `❌ **No auction items available**\n\n` +
      `**Status:**\n` +
      `• Google Sheets API: ${status.circuit.state === 'OPEN' ? '🔴 DOWN' : '🟢 UP'}\n` +
      `• Cached Items: ${status.cache.itemCount}\n` +
      `• Cache Age: ${status.cache.age ? Math.floor(status.cache.age / 1000 / 60) + ' minutes' : 'Never cached'}\n\n` +
      `**Actions:**\n` +
      `• Wait for Google Sheets to recover\n` +
      `• Check BiddingItems sheet has items\n` +
      `• Use \`!auctionstate\` to check system status`
    );
    return;
  }

  // 🔧 FIX: Filter out items that already have winners (past auctions)
  const availableItems = sheetItems.filter((item) => {
    const winner = item.winner;
    const hasWinner =
      winner !== null &&
      winner !== undefined &&
      winner !== "" &&
      winner.toString().trim() !== "";

    if (hasWinner) {
      console.log(`⭐ Skipping "${item.item}" - already has winner: ${winner}`);
    }
    return !hasWinner;
  });

  if (availableItems.length === 0) {
    await channel.send(
      `❌ No available items to auction.\n\n` +
        `All items in BiddingItems sheet already have winners.\n` +
        `Please add new items or clear the Winner column (Column D) for items you want to re-auction.`
    );
    return;
  }

  console.log(
    `✅ Filtered items: ${availableItems.length}/${
      sheetItems.length
    } available (${
      sheetItems.length - availableItems.length
    } already have winners)`
  );

  // Warn about large datasets (potential performance/memory issues)
  const LARGE_DATASET_WARNING = 1000;
  const CRITICAL_DATASET_SIZE = 5000;
  if (availableItems.length >= CRITICAL_DATASET_SIZE) {
    console.error(`${EMOJI.ERROR} CRITICAL: ${availableItems.length} items exceeds safe limit (${CRITICAL_DATASET_SIZE})!`);
    await channel.send(
      `${EMOJI.ERROR} **Too many items!** (${availableItems.length})\n` +
      `The bot can safely handle up to ${CRITICAL_DATASET_SIZE} items.\n` +
      `Please auction items in batches or archive completed items.`
    );
    return;
  } else if (availableItems.length >= LARGE_DATASET_WARNING) {
    console.warn(`${EMOJI.WARNING} Large dataset: ${availableItems.length} items (may impact performance)`);
    await channel.send(
      `${EMOJI.WARNING} **Large auction session** (${availableItems.length} items)\n` +
      `Consider splitting into multiple sessions for better performance.`
    );
  }

  // 🎯 SIMPLIFIED: Treat all items as ONE session (no boss grouping)
  const allItems = [];

  availableItems.forEach((item) => {
    const qty = parseInt(item.quantity) || 1;
    for (let q = 0; q < qty; q++) {
      allItems.push({
        ...item,
        quantity: 1,
        batchNumber: qty > 1 ? q + 1 : null,
        batchTotal: qty > 1 ? qty : null,
        source: "GoogleSheet",
        bossName: (item.boss || "").split(" ")[0] || "Unknown", // Extract just boss name
      });
    }
  });

  if (allItems.length === 0) {
    await channel.send(`❌ No items to auction`);
    return;
  }

  // Initialize auction state
  auctionState.active = true;
  auctionState.sessionFinalized = false; // Will be set to true after tallies/moves complete
  auctionState.sessionItems = allItems;
  auctionState.currentItemIndex = 0;

  // Show preview
  const previewList = allItems
    .slice(0, 10)
    .map((item, i) => {
      return `${i + 1}. **${item.item}** - ${item.startPrice}pts • ${
        item.duration
      }m${item.bossName !== "Unknown" ? ` (${item.bossName})` : ""}`;
    })
    .join("\n");

  const moreItems =
    allItems.length > 10 ? `\n\n*...+${allItems.length - 10} more items*` : "";

  const countdownEmbed = new EmbedBuilder()
    .setColor(COLORS.AUCTION)
    .setTitle(`${EMOJI.FIRE} Auctioneering Started!`)
    .setDescription(
      `**${allItems.length} item(s)** queued for auction\n\n${previewList}${moreItems}\n\n` +
        `✅ **No attendance required** - All ELYSIUM members can bid!`
    )
    .setFooter({ text: "Starting first item in 30s..." })
    .setTimestamp();

  const feedbackMsg = await channel.send({
    content: "@everyone",
    embeds: [countdownEmbed],
  });

  // Clear any existing countdown timer before creating new one (Bug #3 fix)
  if (auctionState.timers.sessionStartCountdown) {
    clearInterval(auctionState.timers.sessionStartCountdown);
    delete auctionState.timers.sessionStartCountdown;
  }

  // Countdown feedback every 5 seconds
  let countdown = 30;
  const countdownInterval = setInterval(async () => {
    try {
      countdown -= 5;
      if (countdown > 0) {
        // Update both title and footer with countdown for better visibility
        countdownEmbed
          .setTitle(`${EMOJI.FIRE} Auctioneering Started! - Starting in ${countdown}s`)
          .setFooter({
            text: `Starting first item in ${countdown}s...`,
          });
        await feedbackMsg
          .edit({ embeds: [countdownEmbed] })
          .catch((err) =>
            console.warn(`⚠️ Failed to update countdown:`, err.message)
          );
      }
    } catch (error) {
      console.error("❌ Error in countdown interval:", error.message);
      // Continue interval, don't break it
    }
  }, 5000);

  // Store countdown interval for cleanup
  auctionState.timers.sessionStartCountdown = countdownInterval;

  auctionState.timers.sessionStart = setTimeout(async () => {
    clearInterval(auctionState.timers.sessionStartCountdown);
    delete auctionState.timers.sessionStartCountdown;
    try {
      // Always use the configured bidding channel
      const biddingChannel = await discordCache.getChannel('bidding_channel_id');

      console.log(
        `✅ Using bidding channel: ${biddingChannel.name} (${biddingChannel.id})`
      );
      await auctionNextItem(client, config, biddingChannel);
    } catch (err) {
      console.error("❌ Failed to fetch bidding channel:", err);

      // Cleanup on error
      auctionState.active = false;
      clearAllTimers();
      if (
        biddingModule &&
        typeof biddingModule.stopCacheAutoRefresh === "function"
      ) {
        biddingModule.stopCacheAutoRefresh();
      }

      await channel
        .send(
          `❌ Failed to start auction. Please try again or contact an admin.`
        )
        .catch(errorHandler.safeCatch('send auction start failure message'));
    }
  }, 30000); // 30 seconds preview
}

/**
 * Ensures Discord thread capacity before creating a new auction thread.
 *
 * DISCORD LIMITS:
 * - 1000 active threads per server
 * - 50 active threads per channel
 *
 * PROCESS:
 * 1. Checks active thread count in the channel
 * 2. If approaching limit (40+), starts auto-cleanup
 * 3. Archives old auction threads (locked or older than 1 hour)
 * 4. Rate-limits archival to avoid API throttling
 * 5. Throws error if still at capacity after cleanup
 *
 * @param {Discord.TextChannel} channel - Channel to check thread capacity
 * @returns {Promise<void>}
 * @throws {Error} If thread limit reached and cleanup didn't help
 */
async function ensureThreadCapacity(channel) {
  try {
    // Fetch all active threads in the channel
    const activeThreads = await channel.threads.fetchActive();
    const activeCount = activeThreads.threads.size;

    const THREAD_LIMIT = 50; // Discord's per-channel active thread limit
    const THREAD_WARNING = 40; // Start cleanup at this threshold

    console.log(`📊 Active threads in ${channel.name}: ${activeCount}/${THREAD_LIMIT}`);

    if (activeCount >= THREAD_WARNING) {
      console.log(`⚠️ Approaching thread limit (${activeCount}/${THREAD_LIMIT}) - cleaning up...`);

      // Find and archive old auction threads
      let archivedCount = 0;
      const threadsToArchive = [];

      for (const [id, thread] of activeThreads.threads) {
        // Archive threads that:
        // 1. Are auction threads (name contains " | ")
        // 2. Are locked (auction ended)
        // 3. Are older than 1 hour
        const isAuctionThread = thread.name.includes(' | ');
        const isLocked = thread.locked;
        const age = Date.now() - thread.createdTimestamp;
        const isOld = age > 60 * 60 * 1000; // 1 hour

        if (isAuctionThread && (isLocked || isOld)) {
          threadsToArchive.push(thread);
        }
      }

      // Archive in batches to avoid rate limits
      for (const thread of threadsToArchive) {
        try {
          if (!thread.archived) {
            await thread.setArchived(true, 'Auto-cleanup for thread capacity');
            archivedCount++;
            console.log(`📦 Auto-archived thread: ${thread.name}`);

            // Rate limit: Wait between archives
            if (archivedCount % 5 === 0) {
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
          }
        } catch (err) {
          console.warn(`⚠️ Failed to archive thread ${thread.name}:`, err.message);
        }
      }

      console.log(`✅ Cleaned up ${archivedCount} old auction threads`);

      // Recheck after cleanup
      const activeAfterCleanup = await channel.threads.fetchActive();
      const newCount = activeAfterCleanup.threads.size;

      console.log(`📊 After cleanup: ${newCount}/${THREAD_LIMIT} active threads`);

      if (newCount >= THREAD_LIMIT - 2) {
        throw new Error(
          `Thread limit reached (${newCount}/${THREAD_LIMIT})! ` +
          `Please manually archive old threads in ${channel.name}.`
        );
      }
    }
  } catch (err) {
    // If thread capacity check fails, log but continue
    // (Better to try creating thread and handle failure than block auction)
    console.error(`❌ Thread capacity check failed:`, err.message);

    if (err.message.includes('Thread limit reached')) {
      throw err; // Rethrow limit errors
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 6: ITEM AUCTION MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Auctions the next item in the session queue.
 *
 * PROCESS:
 * 1. Validates channel reference (refetches if needed)
 * 2. Checks if all items are completed
 * 3. Displays 30-second preview of next item
 * 4. Creates dedicated Discord thread for the item
 * 5. Posts initial auction announcement
 * 6. Schedules countdown timers (60s, 30s, 10s, end)
 * 7. Starts accepting bids
 *
 * THREAD NAMING:
 * Format: "ItemName | StartPrice pts | BossName"
 *
 * SAFETY:
 * - Auto-refetches channel if type is invalid
 * - Ensures thread capacity before creation
 * - Finalizes session if no more items
 *
 * @param {Discord.Client} client - Discord bot client
 * @param {Object} config - Bot configuration
 * @param {Discord.TextChannel} channel - Bidding channel for announcements
 * @returns {Promise<void>}
 */
async function auctionNextItem(client, config, channel) {
  // ✅ Ensure we're using a proper guild text channel
  if (![0, 5].includes(channel.type)) {
    console.warn(
      `⚠️ Channel type ${channel.type} invalid – refetching bidding channel...`
    );
    try {
      channel = await discordCache.getChannel('bidding_channel_id');
      console.log(
        `✅ Corrected to bidding channel: ${channel.name} (${channel.id})`
      );
    } catch (err) {
      console.error("❌ Could not refetch bidding channel:", err);
      return;
    }
  }

  // ✅ Ensure channel reference is valid
  if (!channel) {
    console.warn("⚠️ Channel is undefined, attempting to refetch...");
    try {
      channel = await discordCache.getChannel('bidding_channel_id');
      if (!channel) {
        console.error("❌ Failed to refetch bidding channel.");
        return;
      }
    } catch (err) {
      console.error("❌ Error refetching bidding channel:", err);
      return;
    }
  }

  // ✅ Check if all items are done
  if (
    !auctionState.sessionItems ||
    auctionState.currentItemIndex >= auctionState.sessionItems.length
  ) {
    await channel.send(`✅ All items completed`);
    auctionState.active = false;
    await finalizeSession(client, config, channel);
    return;
  }

  const item = auctionState.sessionItems[auctionState.currentItemIndex];
  if (!item) {
    console.error("❌ No item at current index, finalizing...");
    await finalizeSession(client, config, channel);
    return;
  }

  // ==========================================
  // 30-SECOND PREVIEW BEFORE ITEM STARTS
  // ==========================================
  const remainingItems =
    auctionState.sessionItems.length - auctionState.currentItemIndex;
  const previewEmbed = new EmbedBuilder()
    .setColor(COLORS.AUCTION)
    .setTitle(`${EMOJI.CLOCK} NEXT ITEM COMING UP`)
    .setDescription(`**${item.item}**`)
    .addFields(
      {
        name: `${EMOJI.BID} Starting Bid`,
        value: `${item.startPrice || 0} points`,
        inline: true,
      },
      {
        name: `${EMOJI.TIME} Duration`,
        value: `${item.duration || 2} minutes`,
        inline: true,
      },
      {
        name: `${EMOJI.LIST} Items Left`,
        value: `${remainingItems} remaining`,
        inline: true,
      }
    );

  // Add boss info if available
  if (item.bossName && item.bossName !== "Unknown") {
    previewEmbed.addFields({
      name: `${EMOJI.TROPHY} Boss`,
      value: `${item.bossName}`,
      inline: true,
    });
  }

  previewEmbed
    .setFooter({ text: "Auction starts in 30 seconds" })
    .setTimestamp();

  await channel.send({
    content: "@everyone",
    embeds: [previewEmbed],
  });

  console.log(`${EMOJI.CLOCK} 30-second preview for: ${item.item}`);

  // Wait 30 seconds before starting
  await new Promise((resolve) => setTimeout(resolve, TIMEOUTS.PREVIEW_DELAY));

  // ==========================================
  // START THE ACTUAL AUCTION
  // ==========================================
  auctionState.currentItem = item;
  auctionState.currentItem.status = "active";
  auctionState.currentItem.bids = [];

  const threadName = `${item.item} | ${item.startPrice || 0}pts${
    item.bossName !== "Unknown" ? ` | ${item.bossName}` : ""
  }`;

  let auctionThread = null;

  try {
    // BULLETPROOF: Check thread limit before creating
    await ensureThreadCapacity(channel);

    // ✅ Try normal thread creation first
    if (channel.threads && typeof channel.threads.create === "function") {
      auctionThread = await channel.threads.create({
        name: threadName,
        autoArchiveDuration: config.auto_archive_minutes || 60,
        reason: `Auction for ${item.item}`,
      });
    } else {
      // ✅ Fallback: send starter message and create thread from it
      console.warn(
        "⚠️ channel.threads.create not available – using message.startThread() fallback"
      );
      const starterMsg = await channel.send({
        content: `@everyone`,
        embeds: [
          new EmbedBuilder()
            .setColor(COLORS.AUCTION)
            .setTitle(`${EMOJI.AUCTION} New Auction Started`)
            .setDescription(
              `**Item:** ${item.item}\n**Start Price:** ${
                item.startPrice || 0
              } pts\n**Duration:** ${item.duration || 2} min`
            )
            .setFooter({
              text: `Thread created per item • ${getTimestamp()}`,
            }),
        ],
      });

      if (starterMsg && typeof starterMsg.startThread === "function") {
        auctionThread = await starterMsg.startThread({
          name: threadName,
          autoArchiveDuration: config.auto_archive_minutes || 60,
          reason: `Auction for ${item.item}`,
        });
      } else {
        throw new Error(
          "Neither channel.threads.create nor message.startThread are available."
        );
      }
    }

    if (!auctionThread) {
      throw new Error("Failed to create auction thread (unknown reason).");
    }

    // ✅ Send embed inside the thread (only if we used threads.create)
    if (channel.threads && typeof channel.threads.create === "function") {
      await auctionThread.send({
        content: `@everyone`,
        embeds: [
          new EmbedBuilder()
            .setColor(COLORS.AUCTION)
            .setTitle(`${EMOJI.AUCTION} New Auction Started`)
            .setDescription(
              `**Item:** ${item.item}\n**Start Price:** ${
                item.startPrice || 0
              } pts\n**Duration:** ${
                item.duration || 2
              } min\n\n✅ **All ELYSIUM members can bid!**`
            )
            .setFooter({
              text: `Thread created per item • ${getTimestamp()}`,
            }),
        ],
      });
    }
  } catch (err) {
    console.error("❌ Failed to create auction thread:", err);
    console.error(
      "→ Check: Bot needs 'Create Public Threads' & 'Send Messages in Threads' in the bidding channel."
    );

    // COMPREHENSIVE cleanup to prevent auction from being stuck
    // Clear all timers first
    clearAllTimers();

    // Clear current item and deactivate
    auctionState.currentItem = null;
    auctionState.active = false;

    // CRITICAL: Clear locked points from failed auction
    try {
      if (!biddingModule) {
        biddingModule = require("./bidding.js");
      }
      const biddingState = biddingModule.getBiddingState();
      biddingState.lp = {};
      biddingModule.saveBiddingState();
      console.log(`${EMOJI.SUCCESS} Cleared locked points after thread creation failure`);
    } catch (unlockErr) {
      console.error(`${EMOJI.ERROR} Failed to clear locked points:`, unlockErr);
    }

    // Save state
    try {
      if (cfg?.sheet_webhook_url) {
        await saveAuctionState(cfg.sheet_webhook_url);
      }
    } catch (_) {
      // ignore; best-effort
    }

    try {
      await channel.send(
        `❌ Unable to create thread for **${item.item}**. Thread creation failed. Auction cancelled.`
      );
    } catch (e) {
      console.error("❌ Also failed to send fallback message:", e);
    }
    return;
  }

  // ✅ Set currentItem properly BEFORE starting the auction
  auctionState.currentItem = item;
  item.status = "active";
  item.auctionStartTime = getTimestamp();

  // Initialize item auction state
  item.curBid = item.startPrice || 0;
  item.curWin = null;
  item.curWinId = null;
  item.bids = [];
  item.extCnt = 0; // Extension counter

  const duration = (item.duration || 2) * 60 * 1000;
  item.endTime = Date.now() + duration;

  // Store thread reference for later use
  item.thread = auctionThread;
  item.threadId = auctionThread.id;

  // Set dummy session for bidding.js compatibility (attendance removed)
  item.currentSession = {
    bossName: item.bossName || "Open",
    bossKey: "open",
    attendees: [], // Not used anymore since attendance is removed
  };

  // ✅ Start bidding in this thread - send announcement
  try {
    await auctionThread.send({
      content: `@everyone`,
      embeds: [
        new EmbedBuilder()
          .setColor(COLORS.AUCTION)
          .setTitle(`${EMOJI.AUCTION} Auction Started: ${item.item}`)
          .setDescription(
            `**Boss:** ${item.bossName !== "Unknown" ? item.bossName : "OPEN"}\n` +
              `**Starting Price:** ${item.startPrice || 0} pts\n` +
              `**Duration:** ${item.duration || 2} min\n\n` +
              `Use \`!bid <amount>\` to place your bids.\n` +
              `✅ **All ELYSIUM members can bid!**`
          )
          .setFooter({ text: "Auction open — place your bids now!" })
          .setTimestamp(),
      ],
    });

    // Schedule the auction end timers (go1, go2, go3, itemEnd)
    scheduleItemTimers(client, config, auctionThread);

    console.log(
      `${EMOJI.SUCCESS} Auction started for: ${item.item} (${duration/60000} min)`
    );
  } catch (err) {
    console.error("❌ Error starting item auction:", err);
    await channel.send(`❌ Failed to start auction for ${item.item}: ${err.message}`);

    // Clean up on error
    auctionState.currentItem = null;
    return;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 7: TIMER MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Schedules countdown timers for the current auction item.
 *
 * TIMERS SCHEDULED:
 * - go1: 60 seconds remaining announcement
 * - go2: 30 seconds remaining announcement
 * - go3: 10 seconds remaining announcement
 * - itemEnd: Auction completion and winner announcement
 *
 * FEATURES:
 * - Prevents duplicate announcements (checks go1/go2/go3 flags)
 * - Adjusts for pause duration when resumed
 * - Accounts for time extensions from late bids
 *
 * @param {Discord.Client} client - Discord bot client
 * @param {Object} config - Bot configuration
 * @param {Discord.ThreadChannel} channel - Auction thread channel
 */
function scheduleItemTimers(client, config, channel) {
  // Validate parameters
  if (!client || !config || !channel || !auctionState.currentItem) {
    console.error(`${EMOJI.ERROR} Invalid parameters to scheduleItemTimers`);
    return;
  }

  const item = auctionState.currentItem;
  const t = Math.max(0, item.endTime - Date.now());

  if (t > 60000 && !item.go1) {
    auctionState.timers.go1 = setTimeout(
      async () => await itemGo1(client, config, channel),
      t - 60000
    );
  }
  if (t > 30000 && !item.go2) {
    auctionState.timers.go2 = setTimeout(
      async () => await itemGo2(client, config, channel),
      t - 30000
    );
  }
  if (t > 10000) {
    auctionState.timers.go3 = setTimeout(
      async () => await itemGo3(client, config, channel),
      t - 10000
    );
  }
  auctionState.timers.itemEnd = setTimeout(
    async () => await itemEnd(client, config, channel),
    t
  );
}

/**
 * Announces 60 seconds remaining in the auction.
 * Called automatically by timer system.
 *
 * @param {Discord.Client} client - Discord bot client
 * @param {Object} config - Bot configuration
 * @param {Discord.ThreadChannel} channel - Auction thread channel
 * @returns {Promise<void>}
 */
async function itemGo1(client, config, channel) {
  if (
    !auctionState.active ||
    !auctionState.currentItem ||
    auctionState.currentItem.go1
  )
    return;
  auctionState.currentItem.go1 = true;

  const item = auctionState.currentItem;
  const endTimestamp = Math.floor(item.endTime / 1000);

  await channel.send({
    embeds: [
      new EmbedBuilder()
        .setColor(COLORS.WARNING)
        .setTitle(`${EMOJI.WARNING} GOING ONCE!`)
        .setDescription(`Auction ends <t:${endTimestamp}:R>`)
        .addFields({
          name: `${EMOJI.BID} Current`,
          value: item.curWin
            ? `${item.curBid}pts by ${item.curWin}`
            : `${item.startPrice}pts (no bids)`,
        }),
    ],
  });
}

/**
 * Announces 30 seconds remaining in the auction.
 * Called automatically by timer system.
 *
 * @param {Discord.Client} client - Discord bot client
 * @param {Object} config - Bot configuration
 * @param {Discord.ThreadChannel} channel - Auction thread channel
 * @returns {Promise<void>}
 */
async function itemGo2(client, config, channel) {
  if (
    !auctionState.active ||
    !auctionState.currentItem ||
    auctionState.currentItem.go2
  )
    return;
  auctionState.currentItem.go2 = true;

  const item = auctionState.currentItem;
  const endTimestamp = Math.floor(item.endTime / 1000);

  await channel.send({
    embeds: [
      new EmbedBuilder()
        .setColor(COLORS.WARNING)
        .setTitle(`${EMOJI.WARNING} GOING TWICE!`)
        .setDescription(`Auction ends <t:${endTimestamp}:R>`)
        .addFields({
          name: `${EMOJI.BID} Current`,
          value: item.curWin
            ? `${item.curBid}pts by ${item.curWin}`
            : `${item.startPrice}pts (no bids)`,
        }),
    ],
  });
}

/**
 * Announces 10 seconds remaining in the auction (final countdown).
 * Called automatically by timer system.
 *
 * @param {Discord.Client} client - Discord bot client
 * @param {Object} config - Bot configuration
 * @param {Discord.ThreadChannel} channel - Auction thread channel
 * @returns {Promise<void>}
 */
async function itemGo3(client, config, channel) {
  if (!auctionState.active || !auctionState.currentItem) return;

  const item = auctionState.currentItem;
  const endTimestamp = Math.floor(item.endTime / 1000);

  await channel.send({
    embeds: [
      new EmbedBuilder()
        .setColor(COLORS.ERROR)
        .setTitle(`${EMOJI.WARNING} FINAL CALL!`)
        .setDescription(`Auction ends <t:${endTimestamp}:R>`)
        .addFields({
          name: `${EMOJI.BID} Current`,
          value: item.curWin
            ? `${item.curBid}pts by ${item.curWin}`
            : `${item.startPrice}pts (no bids)`,
        }),
    ],
  });
}

/**
 * Safely cleans up specific timers by key.
 * Prevents race conditions and ensures timers are properly cleared.
 *
 * @param {...string} timerKeys - Timer keys to clean up (e.g., 'go1', 'go2', 'itemEnd')
 */
function safelyCleanupTimers(...timerKeys) {
  timerKeys.forEach((key) => {
    if (auctionState.timers[key]) {
      clearTimeout(auctionState.timers[key]);
      delete auctionState.timers[key];
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 8: ITEM COMPLETION & RESULTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Ends the current auction item and processes the winner.
 *
 * PROCESS:
 * 1. Validates auction state and prevents duplicate calls
 * 2. Marks item as ended
 * 3. Announces winner in thread (or "No bids" if none)
 * 4. Logs results to Google Sheets
 * 5. Locks and archives the auction thread
 * 6. Updates session items with winner/amount
 * 7. Moves to next item or finalizes session
 *
 * WINNER ANNOUNCEMENT:
 * - With bids: Shows winner, winning bid, total bids, bid count
 * - No bids: Announces no winner, item goes back to pool
 *
 * THREAD CLEANUP:
 * - Locks thread to prevent further bids
 * - Archives thread after 5 seconds
 * - Rate-limited to avoid Discord API throttling
 *
 * @param {Discord.Client} client - Discord bot client
 * @param {Object} config - Bot configuration
 * @param {Discord.ThreadChannel} channel - Auction thread channel
 * @returns {Promise<void>}
 */
async function itemEnd(client, config, channel) {
  if (!client || !config || !channel) {
    console.error(`${EMOJI.ERROR} Invalid parameters to itemEnd`);
    return;
  }

  if (!auctionState.active || !auctionState.currentItem) return;

  const item = auctionState.currentItem;
  item.status = "ended";

  // 🧹 Clear timers to avoid duplicates - safe cleanup
  safelyCleanupTimers("itemEnd", "go1", "go2", "go3");

  const timestamp = getTimestamp();
  const totalBids = item.bids ? item.bids.length : 0;
  const bidCount = item.curWin
    ? item.bids.filter((b) => normalizeUsername(b.user) === normalizeUsername(item.curWin)).length
    : 0;

  // 🕐 Record end time
  const auctionEndTime = getCurrentTimestamp();
  const endTimeStr = `${auctionEndTime.date} ${auctionEndTime.time}`;
  item.auctionEndTime = endTimeStr;

  if (item.curWin) {
    // ✅ ITEM SOLD
    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(COLORS.AUCTION)
          .setTitle(`${EMOJI.AUCTION} SOLD!`)
          .setDescription(`**${item.item}** sold!`)
          .addFields(
            {
              name: `${EMOJI.FIRE} Winner`,
              value: `<@${item.curWinId}>`,
              inline: true,
            },
            {
              name: `${EMOJI.BID} Price`,
              value: `${item.curBid} pts`,
              inline: true,
            },
            {
              name: `${EMOJI.INFO} Source`,
              value: "📊 Google Sheet",
              inline: true,
            }
          )
          .setFooter({ text: `${timestamp}` })
          .setTimestamp(),
      ],
    });

    // 🧾 Log result to sheet/database
    try {
      await logAuctionResult(
        config.webhook_url,
        item.source === "GoogleSheet" ? item.sheetIndex : -1,
        item.curWin,
        item.curBid,
        totalBids,
        bidCount,
        item.source,
        timestamp,
        item.curWinId,  // Winner Discord ID
        item._id        // MongoDB item ID (if available)
      );
    } catch (err) {
      console.error(`${EMOJI.ERROR} Failed to log auction result:`, err);
    }

    // 🧠 AUTO-UPDATE LEARNING SYSTEM (Bot learns from auction result)
    try {
      if (intelligenceEngine && intelligenceEngine.learningSystem) {
        const updated = await intelligenceEngine.learningSystem.updatePredictionAccuracy(
          'price_prediction',
          item.item,
          item.curBid
        );

        if (updated) {
          console.log(`🧠 [LEARNING] Auto-updated prediction accuracy for "${item.item}" (actual: ${item.curBid}pts)`);

          // Optional: Send notification to admin logs
          try {
            const adminChannel = await discordCache?.getChannel('admin_logs_channel_id');
            if (adminChannel) {
              await adminChannel.send(
                `🧠 **Bot Learning Update**\n` +
                `✅ Updated prediction accuracy for **${item.item}**\n` +
                `Actual sale price: ${item.curBid}pts\n` +
                `Bot is getting smarter! Check \`!learningmetrics\` to see accuracy.`
              );
            }
          } catch (notifyErr) {
            // Silent fail on notification (not critical)
            console.log(`[LEARNING] Could not send admin notification: ${notifyErr.message}`);
          }
        } else {
          // No matching prediction found (item wasn't predicted, or already updated)
          console.log(`[LEARNING] No pending prediction found for "${item.item}" (may not have been predicted)`);
        }
      }
    } catch (learnErr) {
      console.error(`${EMOJI.ERROR} Failed to update learning system:`, learnErr);
      // Continue auction even if learning fails (non-critical)
    }

    // 🧩 Update item in queue array with winner info (don't push, or it loops forever!)
    // The item is already in sessionItems at currentItemIndex, just add winner fields
    const currentItem = auctionState.sessionItems[auctionState.currentItemIndex];
    if (currentItem) {
      currentItem.winner = item.curWin;
      currentItem.winnerId = item.curWinId;
      currentItem.amount = item.curBid;
      currentItem.timestamp = timestamp;
      currentItem.auctionEndTime = endTimeStr;
    }
  } else {
    // ⚠️ NO WINNER
    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(COLORS.INFO)
          .setTitle(`${EMOJI.ERROR} NO BIDS`)
          .setDescription(
            `**${item.item}** had no bids (will not be recorded).`
          )
          .addFields({
            name: `${EMOJI.INFO} Note`,
            value: "Item remains in BiddingItems sheet for future auctions.",
            inline: false,
          }),
      ],
    });
  }

  // 🔒 Lock and archive the thread after the auction ends
  try {
    // Check if channel is a thread (type 11 or 12 = public/private thread)
    if (channel && (channel.type === 11 || channel.type === 12)) {
      // Refetch thread to ensure it still exists
      const refreshedThread = await channel.fetch().catch(() => null);
      if (!refreshedThread) {
        console.warn(
          `⚠️ Thread ${channel.id} no longer exists, skipping lock/archive`
        );
      } else {
        // Lock the thread first to prevent new messages
        if (typeof refreshedThread.setLocked === "function") {
          await refreshedThread
            .setLocked(true, "Auction ended")
            .catch((err) => {
              console.warn(
                `⚠️ Failed to lock thread ${refreshedThread.id}:`,
                err.message
              );
            });
          console.log(`🔒 Locked thread for ${item.item}`);
        }

        // Small delay to avoid race conditions with Discord API
        await new Promise((resolve) => setTimeout(resolve, 500));

        // Then archive it to hide from active list
        if (typeof refreshedThread.setArchived === "function") {
          await refreshedThread
            .setArchived(true, "Auction ended")
            .catch((err) => {
              console.warn(
                `⚠️ Failed to archive thread ${refreshedThread.id}:`,
                err.message
              );
            });
          console.log(`📦 Archived thread for ${item.item}`);
        }
      }
    }
  } catch (err) {
    console.warn(`⚠️ Error locking/archiving thread:`, err.message);
  }

  // ✅ Move to next item
  auctionState.currentItemIndex++;
  auctionState.currentItem = null;

  // Get the parent bidding channel for next auction (not the thread)
  let biddingChannel = channel;
  if (
    channel &&
    (channel.type === 11 || channel.type === 12) &&
    channel.parent
  ) {
    // If current channel is a thread, use its parent
    biddingChannel = channel.parent;
  }

  // 🎯 SIMPLIFIED: Just check if there are more items
  if (auctionState.currentItemIndex < auctionState.sessionItems.length) {
    // ➡️ Next item
    console.log(`⏭️ Moving to next item...`);
    await auctionNextItem(client, config, biddingChannel);
  } else {
    // ✅ ALL DONE
    console.log(`🎉 All items completed. Finalizing session.`);
    await finalizeSession(client, config, biddingChannel);
  }
}

/**
 * Finalizes the auction session after all items are completed.
 *
 * PROCESS:
 * 1. Validates there are items to finalize
 * 2. Generates comprehensive session summary
 * 3. Posts summary to admin logs channel
 * 4. Deducts points from winners via bidding module
 * 5. Clears session data and locked points
 * 6. Saves final state to sheets
 *
 * SUMMARY INCLUDES:
 * - Total items auctioned
 * - Items with winners vs. no bids
 * - Total revenue generated
 * - Per-member spending breakdown
 * - Session duration
 *
 * POINT DEDUCTION:
 * - Calls bidding module's finalizeBids()
 * - Posts results to Google Sheets
 * - Clears locked points cache
 *
 * @param {Discord.Client} client - Discord bot client
 * @param {Object} config - Bot configuration
 * @param {Discord.TextChannel} channel - Bidding channel
 * @returns {Promise<void>}
 */
async function finalizeSession(client, config, channel) {
  // Validate parameters
  if (!client || !config || !channel) {
    console.error(`${EMOJI.ERROR} Invalid parameters to finalizeSession`);
    return;
  }

  if (!auctionState.active) return;

  try {
    auctionState.active = false;
    clearAllTimers();

  // Stop cache auto-refresh timer from bidding module
  if (
    biddingModule &&
    typeof biddingModule.stopCacheAutoRefresh === "function"
  ) {
    biddingModule.stopCacheAutoRefresh();
  }

  // Get only items that were sold (have winners)
  const soldItems = auctionState.sessionItems.filter((s) => s.winner);

  const summary = soldItems
    .map((s, i) => `${i + 1}. **${s.item}** 📊: ${s.winner} - ${s.amount}pts`)
    .join("\n");

  // Truncate summary if it exceeds Discord's 1024 character limit for embed fields
  let truncatedSummary = summary || "No sales";
  if (truncatedSummary.length > 1024) {
    // Find a good truncation point (end of a line) within the limit
    const maxLength = 1000; // Leave room for "... and X more"
    const truncateAt = truncatedSummary.lastIndexOf('\n', maxLength);
    const cutPoint = truncateAt > 0 ? truncateAt : maxLength;
    const remainingItems = soldItems.length - truncatedSummary.substring(0, cutPoint).split('\n').length;
    truncatedSummary = truncatedSummary.substring(0, cutPoint) + `\n\n*... and ${remainingItems} more items*`;
  }

  const mainEmbed = new EmbedBuilder()
    .setColor(COLORS.SUCCESS)
    .setTitle(`${EMOJI.SUCCESS} Auctioneering Session Complete!`)
    .setDescription(`**${soldItems.length}** item(s) sold`)
    .addFields({
      name: `${EMOJI.LIST} Summary`,
      value: truncatedSummary,
      inline: false,
    })
    .setFooter({ text: "Processing results and submitting to sheets..." })
    .setTimestamp();

  await channel.send({ embeds: [mainEmbed] });

  // STEP 1: Build combined results for tally
  const combinedResults = await buildCombinedResults(config);

  // STEP 2: Submit combined results
  const submitPayload = {
    action: "submitBiddingResults",
    results: combinedResults,
  };

  try {
    if (!postToSheetFunc) {
      console.error(
        `${EMOJI.ERROR} postToSheet not initialized - cannot submit session results`
      );
      console.log(
        `${EMOJI.WARNING} Session results (for manual recovery):`,
        JSON.stringify(submitPayload, null, 2)
      );
    } else {
      const { action, ...data } = submitPayload;
      const result = await sheetAPI.call(action, data);
      if (result.status !== "ok") {
        throw new Error(result.message || "Unknown error from sheets");
      }

      console.log(`${EMOJI.SUCCESS} Session results submitted successfully`);

      // Display tally summary in bidding channel
      const winnersWithSpending = combinedResults.filter(
        (r) => r.totalSpent > 0
      );
      if (winnersWithSpending.length > 0) {
        const tallyEmbed = new EmbedBuilder()
          .setColor(COLORS.SUCCESS)
          .setTitle(`${EMOJI.CHART} Bidding Points Tally`)
          .setDescription(
            `**Points spent this session:**\n\n${winnersWithSpending
              .sort((a, b) => b.totalSpent - a.totalSpent)
              .map((r, i) => `${i + 1}. **${r.member}** - ${r.totalSpent} pts`)
              .join("\n")}`
          )
          .setFooter({
            text: `Total: ${winnersWithSpending.reduce(
              (sum, r) => sum + r.totalSpent,
              0
            )} pts spent`,
          })
          .setTimestamp();

        await channel.send({ embeds: [tallyEmbed] });
      }
    }
  } catch (err) {
    console.error(`${EMOJI.ERROR} Failed to submit bidding results:`, err);
    console.log(
      `${EMOJI.WARNING} Session results (for manual recovery):`,
      JSON.stringify(submitPayload, null, 2)
    );
  }

  // STEP 3: Move all auctioned items to ForDistribution sheet
  console.log(`📦 Moving completed auction items to ForDistribution...`);

  // Retry logic with exponential backoff
  const maxRetries = 3;
  let moveSuccess = false;
  let moveData = null;
  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`📦 Move attempt ${attempt}/${maxRetries}...`);

      moveData = await sheetAPI.call('moveAuctionedItemsToForDistribution');

      // Check if the call succeeded
      if (moveData && moveData.status === 'ok') {
        console.log(`✅ Moved ${moveData.moved || 0} items to ForDistribution (skipped ${moveData.skipped || 0})`);
        moveSuccess = true;

        // Get admin logs channel
        const mainGuild = await client.guilds.fetch(config.main_guild_id);
        const adminLogs = await mainGuild.channels
          .fetch(config.admin_logs_channel_id)
          .catch(() => null);

        if (adminLogs && moveData.moved > 0) {
          await adminLogs.send(
            `📦 **Items Moved to ForDistribution:** ${moveData.moved} completed auction(s) (${moveData.skipped || 0} skipped)`
          );
        }

        // Success - break retry loop
        break;
      } else {
        // API returned error status
        lastError = moveData?.message || 'Unknown error from sheets API';
        console.error(`⚠️ Move attempt ${attempt} failed: ${lastError}`);

        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 1000;
          console.log(`⏳ Retrying in ${delay/1000}s...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    } catch (err) {
      lastError = err.message;
      console.error(`⚠️ Move attempt ${attempt} error:`, err);

      // Retry with exponential backoff (2s, 4s, 8s)
      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000;
        console.log(`⏳ Retrying in ${delay/1000}s...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  // If all retries failed, notify admin
  if (!moveSuccess) {
    console.error(`❌ Failed to move items after ${maxRetries} attempts: ${lastError}`);

    const mainGuild = await client.guilds.fetch(config.main_guild_id);
    const adminLogs = await mainGuild.channels
      .fetch(config.admin_logs_channel_id)
      .catch(() => null);

    if (adminLogs) {
      await adminLogs.send(
        `⚠️ **ForDistribution Move Failed**\n` +
        `Failed to move items after ${maxRetries} attempts.\n` +
        `**Error:** ${lastError}\n\n` +
        `**Manual Fix:**\n` +
        `Use \`!movetodistribution\` command to retry, or\n` +
        `Run \`moveAllItemsWithWinnersToForDistribution()\` in Google Apps Script editor.`
      );
    }
  }

  // STEP 4: Send detailed summary to admin logs
  const mainGuild = await client.guilds.fetch(config.main_guild_id);
  const adminLogs = await mainGuild.channels
    .fetch(config.admin_logs_channel_id)
    .catch(() => null);

  if (adminLogs) {
    const itemsWithWinners = soldItems.length;
    const totalRevenue = soldItems.reduce((sum, s) => sum + s.amount, 0);

    // Ensure summary is properly formatted and within Discord's limits
    let summaryValue = summary || "No sales recorded";
    if (summaryValue.length > 1024) {
      summaryValue = summaryValue.substring(0, 1020) + "...";
    }
    if (!summaryValue || summaryValue.trim().length === 0) {
      summaryValue = "No sales recorded";
    }

    const adminEmbed = new EmbedBuilder()
      .setColor(COLORS.SUCCESS)
      .setTitle(`${EMOJI.SUCCESS} Session Summary`)
      .setDescription(`Auctioneering session completed successfully`);

    // Add fields one by one with validation
    try {
      adminEmbed.addFields(
        {
          name: `📊 Items Sold`,
          value: `**With Winners:** ${itemsWithWinners}`,
          inline: true,
        },
        {
          name: `💰 Revenue`,
          value: `**Total:** ${totalRevenue}pts`,
          inline: true,
        },
        {
          name: `📋 Results`,
          value: summaryValue,
          inline: false,
        }
      );
    } catch (err) {
      console.error(`${EMOJI.ERROR} Error adding fields to embed:`, err);
      // Fallback: try adding fields individually
      adminEmbed.addFields({
        name: `📊 Summary`,
        value: `Items: ${itemsWithWinners} | Revenue: ${totalRevenue}pts`,
        inline: false,
      });
    }

    adminEmbed
      .setFooter({ text: `Session completed by !startauction` })
      .setTimestamp();

    await adminLogs.send({ embeds: [adminEmbed] });
  }

    console.log("🧹 Clearing session data...");
    auctionState.sessionItems = []; // Clear sold items history

    // Clear bidding module cache
    if (!biddingModule) {
      biddingModule = require("./bidding.js");
    }
    biddingModule.clearPointsCache();

    console.log("✅ Session data cleared");

    // Save state if config is available
    if (cfg && cfg.sheet_webhook_url) {
      await saveAuctionState(cfg.sheet_webhook_url).catch((err) => {
        console.error(`${EMOJI.ERROR} Failed to save state:`, err);
      });
    }
  } finally {
    // CRITICAL: ALWAYS clear locked points, even if errors occurred
    // This prevents users from being blocked in future auctions
    try {
      if (!biddingModule) {
        biddingModule = require("./bidding.js");
      }
      const biddingState = biddingModule.getBiddingState();
      biddingState.lp = {};
      biddingModule.saveBiddingState();
      console.log("✅ Locked points released");
    } catch (err) {
      console.error(`${EMOJI.ERROR} Failed to clear locked points:`, err);
      // Don't throw - this is cleanup, continue anyway
    }

    // CRITICAL: Mark session as fully finalized AFTER all sheet operations complete
    // This flag is used by the dual-session scheduler to know when Session 1 is truly done
    auctionState.sessionFinalized = true;
    console.log(`${EMOJI.SUCCESS} Session finalization complete (tallies submitted, items moved)`);
  }
}

/**
 * Builds combined results for all members showing total spending.
 *
 * PROCESS:
 * 1. Fetches fresh points from Google Sheets
 * 2. Aggregates spending from all session items
 * 3. Normalizes usernames for matching
 * 4. Creates result entry for every member (including 0 spenders)
 *
 * RESULT FORMAT:
 * - member: Discord username
 * - totalSpent: Sum of all winning bids
 *
 * @param {Object} config - Bot configuration with webhook URL
 * @returns {Promise<Array<Object>>} Array of {member, totalSpent} objects
 */
async function buildCombinedResults(config) {
  console.log(`${EMOJI.CHART} Building combined results for ${auctionState.sessionItems?.length || 0} session items...`);

  // Fetch fresh points from sheet
  let allPoints = {};
  try {
    const data = await sheetAPI.call('getBiddingPoints');
    allPoints = data.points || {};
    console.log(`${EMOJI.SUCCESS} Fetched points for ${Object.keys(allPoints).length} members`);
  } catch (err) {
    console.error(`${EMOJI.ERROR} Failed to fetch bidding points:`, err);
    return [];
  }

  // Validate sessionItems exists
  if (!auctionState.sessionItems || !Array.isArray(auctionState.sessionItems)) {
    console.error(`${EMOJI.ERROR} Invalid sessionItems array in auctionState`);
    return [];
  }

  // Use PointsCache for efficient operations
  const pointsCache = new PointsCache(allPoints);
  const allMembers = pointsCache.getAllUsernames();

  // Combine all winners from session (only items with winners)
  const winners = {};
  let skippedItems = 0;
  let processedItems = 0;

  auctionState.sessionItems.forEach((item, index) => {
    // Skip items without winners (unsold items)
    if (!item.winner || !item.amount) {
      skippedItems++;
      console.log(`${EMOJI.WARNING} Skipping item ${index + 1} "${item.item}" - no winner or amount`);
      return;
    }

    const normalizedWinner = normalizeUsername(item.winner);
    winners[normalizedWinner] = (winners[normalizedWinner] || 0) + item.amount;
    processedItems++;
  });

  console.log(`${EMOJI.SUCCESS} Processed ${processedItems} items with winners, skipped ${skippedItems} unsold items`);

  // Build results for ALL members (including 0s for clean logs)
  const results = allMembers.map((m) => {
    const normalizedMember = normalizeUsername(m);
    return {
      member: m,
      totalSpent: winners[normalizedMember] || 0,
    };
  });

  console.log(
    `${EMOJI.CHART} Built results: ${
      results.filter((r) => r.totalSpent > 0).length
    } winners out of ${results.length} members`
  );

  return results;
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 9: PAUSE/RESUME FUNCTIONALITY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Pauses the current auction session.
 *
 * ACTIONS:
 * - Clears all active timers
 * - Records pause timestamp
 * - Sets paused flag
 * - Saves state to sheets
 *
 * BEHAVIOR:
 * - Current item time remains frozen
 * - No countdown announcements during pause
 * - Bids can still be placed (time won't run out)
 * - Resume will adjust endTime by pause duration
 *
 * @returns {boolean} True if successfully paused, false if not active or already paused
 */
function pauseSession() {
  if (!auctionState.active || auctionState.paused) return false;
  auctionState.paused = true;
  auctionState.pausedTime = Date.now();

  // Store remaining time for accurate display during pause
  if (auctionState.currentItem) {
    auctionState.currentItem.remainingTime = Math.max(0, auctionState.currentItem.endTime - Date.now());
  }

  clearAllAuctionTimers();
  console.log(`${EMOJI.PAUSE} Session paused`);

  // ADD THIS LINE:
  if (cfg && cfg.sheet_webhook_url) {
    saveAuctionState(cfg.sheet_webhook_url).catch(console.error);
  }

  return true;
}

/**
 * Resumes a paused auction session.
 *
 * ACTIONS:
 * - Clears paused flag
 * - Calculates pause duration
 * - Adjusts item endTime by pause duration
 * - Reschedules all timers with new endTime
 *
 * TIMING LOGIC:
 * - If paused for 5 minutes, adds 5 minutes to remaining time
 * - Preserves relative countdown timing (go1, go2, go3)
 * - Prevents time exploitation
 *
 * @param {Discord.Client} client - Discord bot client
 * @param {Object} config - Bot configuration
 * @param {Discord.ThreadChannel} channel - Auction thread channel
 * @returns {boolean} True if successfully resumed, false if not active or not paused
 */
function resumeSession(client, config, channel) {
  if (!auctionState.active || !auctionState.paused) return false;
  auctionState.paused = false;

  const pausedDuration = Date.now() - auctionState.pausedTime;
  auctionState.currentItem.endTime += pausedDuration;

  // Clean up remainingTime field after resume
  if (auctionState.currentItem) {
    delete auctionState.currentItem.remainingTime;
  }

  scheduleItemTimers(client, config, channel);
  console.log(`${EMOJI.PLAY} Session resumed`);
  return true;
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 10: ADMIN CONTROLS & ITEM MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Force-stops the current auction item and moves to the next.
 *
 * PROCESS:
 * 1. Validates there's an active item
 * 2. Clears all timers for current item
 * 3. Announces forced stop in admin logs
 * 4. Marks item as ended
 * 5. Processes winner (if any bids exist)
 * 6. Moves to next item
 *
 * USE CASES:
 * - Item accidentally added
 * - Technical issues with item
 * - Admin decision to cancel auction
 *
 * SAFETY:
 * - Prevents stopping already-ended items
 * - Gracefully handles errors
 * - Announces action in admin logs
 *
 * @param {Discord.Client} client - Discord bot client
 * @param {Object} config - Bot configuration
 * @param {Discord.ThreadChannel} channel - Auction thread channel
 * @returns {Promise<boolean>} True if successfully stopped, false otherwise
 */
async function stopCurrentItem(client, config, channel) {
  if (!auctionState.active || !auctionState.currentItem) {
    console.warn("⚠️ No active item to stop.");
    return false;
  }

  // 🧹 Clear timers safely
  safelyCleanupTimers("itemEnd", "go1", "go2", "go3");

  const item = auctionState.currentItem;

  if (item.status === "ended") {
    console.warn("⚠️ Item already ended — skipping force stop.");
    return false;
  }

  console.log(`🛑 Forced stop for: ${item.item}`);

  // ✅ Announce forced stop in admin logs
  try {
    const guild = await client.guilds.fetch(config.main_guild_id);
    const adminLogs = await guild.channels
      .fetch(config.admin_logs_channel_id)
      .catch(() => null);

    if (adminLogs) {
      await adminLogs.send({
        embeds: [
          new EmbedBuilder()
            .setColor(COLORS.WARNING)
            .setTitle(`${EMOJI.STOP} Auction Force-Stopped`)
            .setDescription(`**${item.item}** manually finalized by admin.`)
            .addFields(
              {
                name: `${EMOJI.BID} Highest Bid`,
                value: item.curBid
                  ? `${item.curBid} pts by ${item.curWin || "No bids"}`
                  : "No bids placed",
                inline: true,
              },
              {
                name: `${EMOJI.TIME} Status`,
                value: "✅ Finalized early (manual override)",
                inline: true,
              }
            )
            .setFooter({ text: "Proceeding to next item automatically..." })
            .setTimestamp(),
        ],
      });
    }
  } catch (err) {
    console.error("❌ Failed to announce force-stop:", err);
  }

  // ✅ Mark as ended and finalize normally
  try {
    item.status = "ended";
    await itemEnd(client, config, channel);
  } catch (err) {
    console.error("❌ Error finalizing forced stop:", err);
  }

  return true;
}

/**
 * Extends the current auction item duration by specified minutes.
 *
 * FEATURES:
 * - Adds minutes to current endTime
 * - Saves state to sheets
 * - Does NOT reschedule timers (handled by rescheduleItemTimers)
 *
 * USE CASES:
 * - Manual admin extension via !extendauction
 * - Automatic extension on late bids (handled in bidding module)
 *
 * NOTE: This function only updates endTime. Call rescheduleItemTimers()
 * separately to update countdown timers based on new endTime.
 *
 * @param {number} minutes - Number of minutes to extend
 * @returns {boolean} True if successfully extended, false if no active item
 */
function extendCurrentItem(minutes) {
  if (!auctionState.active || !auctionState.currentItem) return false;
  // ADD THIS LINE:
  if (cfg && cfg.sheet_webhook_url) {
    saveAuctionState(cfg.sheet_webhook_url).catch(console.error);
  }

  auctionState.currentItem.endTime += minutes * 60000;
  console.log(`${EMOJI.TIME} Extended by ${minutes}m`);
  return true;
}

/**
 * Clears all active timers in the auction state.
 * Used when ending a session or during error recovery.
 *
 * FEATURES:
 * - Clears both timeouts and intervals
 * - Resets timers object to empty
 * - Safe to call multiple times
 *
 * @returns {void}
 */
function clearAllTimers() {
  Object.values(auctionState.timers).forEach((t) => {
    // Clear both timeouts and intervals
    clearTimeout(t);
    clearInterval(t);
  });
  auctionState.timers = {};
}

/**
 * Safely clears only item-specific timers without affecting session timers.
 *
 * FEATURES:
 * - Clears: go1, go2, go3, itemEnd timers
 * - Preserves: session-level timers
 * - Prevents race condition where itemEnd fires during bid processing
 *
 * USE CASES:
 * - Before rescheduling timers on time extension
 * - During item force-stop
 *
 * @returns {void}
 */
function safelyClearItemTimers() {
  const timerKeys = ['go1', 'go2', 'go3', 'itemEnd'];
  timerKeys.forEach(key => {
    if (auctionState.timers[key]) {
      clearTimeout(auctionState.timers[key]);
      delete auctionState.timers[key];
      console.log(`🛑 Cleared timer: ${key}`);
    }
  });
}

/**
 * Reschedules item timers after time extension.
 *
 * CRITICAL LOGIC:
 * 1. Clears existing timers FIRST (prevents race condition)
 * 2. Resets go1/go2 announcement flags (allows re-announcement)
 * 3. Calls scheduleItemTimers() with new endTime
 *
 * TIMING BEHAVIOR:
 * - go1 (60s) and go2 (30s) flags reset: can announce again
 * - go3 (10s) flag NOT reset: only announces once per item
 * - Prevents duplicate "Going once/twice" announcements
 *
 * USE CASES:
 * - After automatic bid extension (late bids)
 * - After manual admin extension (!extendauction)
 *
 * @param {Discord.Client} client - Discord bot client
 * @param {Object} config - Bot configuration
 * @param {Discord.ThreadChannel} channel - Auction thread channel
 * @returns {boolean} True if successfully rescheduled, false if no active item
 */
function rescheduleItemTimers(client, config, channel) {
  if (!auctionState.active || !auctionState.currentItem) {
    console.warn(`${EMOJI.WARNING} Cannot reschedule timers - no active item`);
    return false;
  }

  // CRITICAL: Clear existing item timers FIRST to prevent race condition
  // Old timers must be cleared before resetting flags to prevent duplicate announcements
  const timerKeys = ['go1', 'go2', 'go3', 'itemEnd'];
  timerKeys.forEach(key => {
    if (auctionState.timers[key]) {
      clearTimeout(auctionState.timers[key]);
      delete auctionState.timers[key];
    }
  });

  // Reset announcement flags AFTER clearing timers (prevents race condition)
  // This allows announcements to fire again on the extended time
  const item = auctionState.currentItem;
  item.go1 = false;
  item.go2 = false;
  // Note: go3 is not reset as it should only fire once per item

  // Reschedule based on new endTime
  scheduleItemTimers(client, config, channel);
  console.log(`${EMOJI.SUCCESS} Item timers rescheduled for ${auctionState.currentItem.item}`);
  return true;
}

/**
 * Returns the current auction state object.
 * Used by other modules to check auction status.
 *
 * @returns {Object} The auctionState object with all session data
 */
function getAuctionState() {
  return auctionState;
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 11: COMMAND HANDLERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Creates pagination buttons for queue navigation.
 * @param {number} currentPage - Current page number (0-indexed)
 * @param {number} totalPages - Total number of pages
 * @param {string} userId - User ID for button interaction filtering
 * @returns {ActionRowBuilder} Button row with Previous/Next buttons
 */
function createPaginationButtons(currentPage, totalPages, userId) {
  const prevButton = new ButtonBuilder()
    .setCustomId(`queuelist_prev_${userId}_${Date.now()}`)
    .setLabel('◀ Previous')
    .setStyle(ButtonStyle.Primary)
    .setDisabled(currentPage === 0);

  const nextButton = new ButtonBuilder()
    .setCustomId(`queuelist_next_${userId}_${Date.now()}`)
    .setLabel('Next ▶')
    .setStyle(ButtonStyle.Primary)
    .setDisabled(currentPage >= totalPages - 1);

  return new ActionRowBuilder().addComponents(prevButton, nextButton);
}

/**
 * Builds an embed for a specific page of the queue.
 * @param {Array} sheetItems - All items from the sheet
 * @param {Object} bossGroups - Items grouped by boss
 * @param {Array} noBossItems - Items without boss assignment
 * @param {number} currentPage - Current page number (0-indexed)
 * @param {number} itemsPerPage - Number of items to show per page
 * @returns {Object} Object containing the embed and metadata
 */
function buildQueuePage(sheetItems, bossGroups, noBossItems, currentPage, itemsPerPage = 15) {
  let queueText = "";
  let itemsShown = 0;
  let position = currentPage * itemsPerPage + 1;
  const startIndex = currentPage * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;

  // Flatten all items in order
  const allOrderedItems = [];
  let sessionNum = 1;

  for (const [boss, items] of Object.entries(bossGroups)) {
    allOrderedItems.push({ type: 'header', boss, sessionNum });
    items.forEach(item => {
      allOrderedItems.push({ type: 'item', ...item, boss, sessionNum });
    });
    sessionNum++;
  }

  // Add no-boss items if they exist
  if (noBossItems.length > 0) {
    allOrderedItems.push({ type: 'header', boss: 'GENERAL ITEMS', sessionNum });
    noBossItems.forEach(item => {
      allOrderedItems.push({ type: 'item', ...item, boss: 'GENERAL ITEMS', sessionNum });
    });
  }

  // Filter to get only items (not headers) for pagination
  const itemsOnly = allOrderedItems.filter(x => x.type === 'item');
  const pageItems = itemsOnly.slice(startIndex, endIndex);

  // Track which session we're in
  let currentSession = null;

  // Build the queue text for this page
  pageItems.forEach((item, idx) => {
    // Add session header if we're entering a new session
    if (currentSession !== item.sessionNum) {
      currentSession = item.sessionNum;
      queueText += `**🔥 SESSION ${item.sessionNum} - ${item.boss}**\n`;
    }

    const qty = item.quantity > 1 ? ` x${item.quantity}` : "";
    const globalPosition = startIndex + idx + 1;
    queueText += `${globalPosition}. ${item.item}${qty} - ${item.startPrice}pts • ${item.duration}m\n`;
    itemsShown++;
  });

  const totalPages = Math.ceil(itemsOnly.length / itemsPerPage);
  const totalSessions = Object.keys(bossGroups).length + (noBossItems.length > 0 ? 1 : 0);
  const totalItems = sheetItems.length;

  const footerNote = `\n**ℹ️ Note:** Order shown is how items will auction when you run \`!startauction\`\n✅ **All ELYSIUM members can bid!**`;
  queueText += footerNote;

  const embed = new EmbedBuilder()
    .setColor(0x4a90e2)
    .setTitle(`${EMOJI.LIST} Auction Queue (Preview)`)
    .setDescription(queueText)
    .addFields(
      {
        name: `${EMOJI.FIRE} Sessions`,
        value: `${totalSessions}`,
        inline: true,
      },
      {
        name: `${EMOJI.LIST} Total Items`,
        value: `${totalItems}`,
        inline: true,
      },
      {
        name: `📄 Page`,
        value: `${currentPage + 1}/${totalPages}`,
        inline: true,
      }
    )
    .setFooter({
      text: `Showing items ${startIndex + 1}-${Math.min(endIndex, totalItems)} of ${totalItems} • Use !startauction to begin`,
    })
    .setTimestamp();

  return { embed, totalPages, itemsShown };
}

/**
 * Handles the !queue command to display current auction queue.
 *
 * DISPLAY MODES:
 * 1. Active Auction: Shows remaining items with progress
 * 2. No Auction: Fetches items from sheet for preview
 *
 * FEATURES:
 * - Shows first 20 items (with "...and X more" for longer lists)
 * - Highlights currently active item
 * - Shows progress (completed/total)
 * - Indicates item quantities (x3, x5, etc.)
 *
 * @param {Discord.Message} message - Discord message object
 * @param {Object} biddingState - Current bidding state
 * @returns {Promise<void>}
 */
async function handleQueueList(message, biddingState) {
  const auctQueue = auctionState.sessions || [];
  const biddingQueue = biddingState.q || [];

  // Active auction - show current session items
  if (auctionState.active && auctionState.sessionItems && auctionState.sessionItems.length > 0) {
    const currentIndex = auctionState.currentItemIndex || 0;
    const remainingItems = auctionState.sessionItems.slice(currentIndex);
    const completedCount = currentIndex;
    const totalCount = auctionState.sessionItems.length;

    if (remainingItems.length === 0) {
      return await message.reply(
        `${EMOJI.SUCCESS} **All items in current session completed!**\n` +
        `${completedCount}/${totalCount} items auctioned.\n\n` +
        `Waiting for session finalization...`
      );
    }

    let queueText = "";
    remainingItems.slice(0, 20).forEach((item, idx) => {
      const position = currentIndex + idx + 1;
      const qty = item.quantity > 1 ? ` x${item.quantity}` : "";
      const status = idx === 0 && auctionState.currentItem ? " **(ACTIVE NOW)**" : "";
      queueText += `${position}. ${item.item}${qty} - ${item.startPrice}pts • ${item.duration}m${status}\n`;
    });

    if (remainingItems.length > 20) {
      queueText += `\n*...and ${remainingItems.length - 20} more items*\n`;
    }

    const embed = new EmbedBuilder()
      .setColor(COLORS.AUCTION)
      .setTitle(`${EMOJI.LIST} Current Session Queue`)
      .setDescription(
        `**Progress:** ${completedCount}/${totalCount} items completed\n` +
        `**Remaining:** ${remainingItems.length} items\n\n` +
        queueText
      )
      .setFooter({ text: `Session active • ${remainingItems.length} items remaining` })
      .setTimestamp();

    return await message.reply({ embeds: [embed] });
  }

  // No active auction - preview mode (fetch from sheet)
  const cfg = message.client.config;
  const loadingMsg = await message.reply(
    `${EMOJI.CLOCK} Loading items from Google Sheet...`
  );

  if (!cfg || !cfg.sheet_webhook_url) {
    await errorHandler.safeEdit(loadingMsg, `${EMOJI.ERROR} Missing sheet webhook URL in config.`);
    return;
  }

  const sheetItems = await fetchSheetItems(cfg.sheet_webhook_url);

  if (sheetItems === null) {
    await loadingMsg.edit(
      `${EMOJI.ERROR} Failed to fetch items from Google Sheet.`
    );
    return;
  }

  // For slash commands, don't delete the loading message - we'll edit it with the final content
  if (!message.isSlashCommand) {
    await errorHandler.safeDelete(loadingMsg, 'message deletion');
  }

  if (sheetItems.length === 0) {
    const noItemsMsg = `${EMOJI.LIST} No items in auction queue.\n\n` +
      `Add items to the **BiddingItems** sheet in Google Sheets with proper boss data.`;

    if (message.isSlashCommand) {
      return await loadingMsg.edit({ content: noItemsMsg, embeds: [] });
    } else {
      return await message.reply(noItemsMsg);
    }
  }

  // Group sheet items by boss for preview
  const bossGroups = {};
  const noBossItems = [];

  sheetItems.forEach((item) => {
    const boss = item.boss || "";
    if (!boss) {
      noBossItems.push(item);
      return;
    }

    if (!bossGroups[boss]) {
      bossGroups[boss] = [];
    }
    bossGroups[boss].push(item);
  });

  // Build the first page
  const ITEMS_PER_PAGE = 15;
  let currentPage = 0;
  const { embed: initialEmbed, totalPages } = buildQueuePage(
    sheetItems,
    bossGroups,
    noBossItems,
    currentPage,
    ITEMS_PER_PAGE
  );

  // Get user ID for button filtering
  const userId = message.author?.id || message.user?.id;

  // Create pagination buttons (only if more than 1 page)
  const components = totalPages > 1
    ? [createPaginationButtons(currentPage, totalPages, userId)]
    : [];

  // Send the initial message with buttons
  let queueMessage;
  if (message.isSlashCommand) {
    await loadingMsg.edit({ content: null, embeds: [initialEmbed], components });
    queueMessage = loadingMsg;
  } else {
    queueMessage = await message.reply({ embeds: [initialEmbed], components });
  }

  // Only create collector if we have multiple pages
  if (totalPages > 1) {
    const collector = queueMessage.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 300000, // 5 minutes timeout
      filter: (i) => i.user.id === userId
    });

    collector.on('collect', async (interaction) => {
      // Determine if it's previous or next
      const isPrevious = interaction.customId.includes('_prev_');

      if (isPrevious) {
        currentPage = Math.max(0, currentPage - 1);
      } else {
        currentPage = Math.min(totalPages - 1, currentPage + 1);
      }

      // Build the new page
      const { embed: newEmbed } = buildQueuePage(
        sheetItems,
        bossGroups,
        noBossItems,
        currentPage,
        ITEMS_PER_PAGE
      );

      // Update buttons with new disabled states
      const newButtons = createPaginationButtons(currentPage, totalPages, userId);

      // Update the message
      await interaction.update({
        embeds: [newEmbed],
        components: [newButtons]
      });
    });

    collector.on('end', async (collected, reason) => {
      // Disable buttons when collector expires
      if (reason === 'time') {
        try {
          const disabledRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('prev_disabled')
              .setLabel('◀ Previous')
              .setStyle(ButtonStyle.Primary)
              .setDisabled(true),
            new ButtonBuilder()
              .setCustomId('next_disabled')
              .setLabel('Next ▶')
              .setStyle(ButtonStyle.Primary)
              .setDisabled(true)
          );

          await queueMessage.edit({ components: [disabledRow] });
        } catch (error) {
          // Message might have been deleted, ignore error
        }
      }
    });
  }
}

/**
 * Handles the !mypoints command to display a user's bidding points.
 *
 * DISPLAYS:
 * - Current available points
 * - Points locked in active bids
 * - Effective spendable points
 * - Member's rank (if available)
 *
 * FEATURES:
 * - Real-time point lookup
 * - Shows locked points separately
 * - Color-coded embed (gold for auction theme)
 *
 * @param {Discord.Message} message - Discord message object
 * @param {Object} biddingModule - Bidding module reference
 * @param {Object} config - Bot configuration
 * @returns {Promise<void>}
 */
async function handleMyPoints(message, biddingModule, config) {
  if (auctionState.active) {
    return await message.channel.send(
      `${EMOJI.WARNING} Can't check points during active auction. Wait for session to end.`
    );
  }

  const u = (message.member?.nickname || message.author?.username || 'Unknown User');

  let freshPts = {};
  let userPts = null;

  // ═════════════════════════════════════════════════════════════════════════
  // GOOGLE SHEETS PATH (MongoDB removed per user request)
  // ═════════════════════════════════════════════════════════════════════════
  try {
    const data = await sheetAPI.call('getBiddingPoints');
    freshPts = data.points || {};

    // Use PointsCache for efficient O(1) lookup
    const ptsCache = new PointsCache(freshPts);
    userPts = ptsCache.getPoints(u);
    if (userPts === 0 && !ptsCache.hasUser(u)) {
      // User not found in system
      userPts = null;
    }
  } catch (err) {
    console.error(`❌ Failed to fetch points for !mypoints:`, err.message);
    userPts = null;
  }

  let ptsMsg;
  if (userPts === null || userPts === undefined) {
    ptsMsg = await message.channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0xff0000)
          .setTitle(`${EMOJI.ERROR} Not Found`)
          .setDescription(
            `**${u}**\n\nYou are not in the bidding system or not a current ELYSIUM member.`
          )
          .setFooter({ text: "Contact admin if this is wrong" })
          .setTimestamp(),
      ],
    });
  } else {
    ptsMsg = await message.channel.send({
      embeds: [
        buildMyPointsEmbed(u, userPts)
      ],
    });
  }

  // Delete user's command message immediately
  try {
    await errorHandler.safeDelete(message, 'message deletion');
  } catch (e) {
    console.warn(
      `${EMOJI.WARNING} Could not delete user message: ${e.message}`
    );
  }

  // Auto-delete after 30 seconds
  setTimeout(async () => {
    try {
      await errorHandler.safeDelete(ptsMsg, 'message deletion');
    } catch (e) {
      console.warn(`${EMOJI.WARNING} Could not delete points message: ${e.message}`);
    }
  }, 30000);
}

/**
 * Build the MyPoints embed
 * @param {string} username - User's display name
 * @param {number} points - User's available points
 * @returns {EmbedBuilder}
 */
function buildMyPointsEmbed(username, points) {
  return new EmbedBuilder()
    .setColor(0x00ff00)
    .setTitle(`${EMOJI.BID} Your Points`)
    .setDescription(`**${username}**`)
    .addFields({
      name: `${EMOJI.CHART} Available Points`,
      value: `${points} pts`,
      inline: true,
    })
    .setTimestamp();
}

/**
 * Handles the !bidstatus command to show current item's bid status.
 *
 * DISPLAYS:
 * - Current highest bid and bidder
 * - Time remaining
 * - Total bids and bid count
 * - Starting price
 *
 * FEATURES:
 * - Shows "No bids yet" if no bids placed
 * - Displays time remaining with countdown
 * - Color-coded embed
 *
 * @param {Discord.Message} message - Discord message object
 * @param {Object} config - Bot configuration
 * @returns {Promise<void>}
 */
async function handleBidStatus(message, config) {
  const statEmbed = new EmbedBuilder()
    .setColor(0x4a90e2)
    .setTitle(`${EMOJI.CHART} Auction Status`);

  if (auctionState.active && auctionState.currentItem) {
    const timeLeft = auctionState.paused
      ? `${EMOJI.PAUSE} PAUSED (${fmtTime(
          auctionState.currentItem.remainingTime || 0
        )})`
      : fmtTime(Math.max(0, auctionState.currentItem.endTime - Date.now()));

    statEmbed.addFields(
      {
        name: `${EMOJI.FIRE} Active`,
        value: `${auctionState.currentItem.item}`,
        inline: true,
      },
      {
        name: `${EMOJI.BID} Current Bid`,
        value: `${auctionState.currentItem.curBid}pts`,
        inline: true,
      },
      { name: `${EMOJI.TIME} Time Left`, value: timeLeft, inline: true }
    );
  } else {
    statEmbed.addFields({
      name: `${EMOJI.FIRE} Status`,
      value: `${EMOJI.SUCCESS} Ready - No active auction`,
      inline: false,
    });
  }

  // Show remaining items in active sessions
  if (
    auctionState.active &&
    auctionState.sessions &&
    auctionState.sessions.length > 0
  ) {
    const remainingItems = [];
    for (
      let i = auctionState.currentSessionIndex;
      i < auctionState.sessions.length;
      i++
    ) {
      const session = auctionState.sessions[i];
      const startIdx =
        i === auctionState.currentSessionIndex
          ? auctionState.currentItemIndex + 1
          : 0;
      for (
        let j = startIdx;
        j < session.items.length && remainingItems.length < 5;
        j++
      ) {
        const item = session.items[j];
        remainingItems.push(
          `${remainingItems.length + 1}. ${item.item}${
            item.quantity > 1 ? ` x${item.quantity}` : ""
          }`
        );
      }
      if (remainingItems.length >= 5) break;
    }

    if (remainingItems.length > 0) {
      const totalRemaining = auctionState.sessions
        .slice(auctionState.currentSessionIndex)
        .reduce((sum, s, idx) => {
          const startIdx = idx === 0 ? auctionState.currentItemIndex + 1 : 0;
          return sum + (s.items.length - startIdx);
        }, 0);

      statEmbed.addFields({
        name: `${EMOJI.LIST} Remaining Items`,
        value:
          remainingItems.join("\n") +
          (totalRemaining > 5 ? `\n*...+${totalRemaining - 5} more*` : ""),
      });
    }
  }

  statEmbed.setFooter({ text: "Items managed via Google Sheets" }).setTimestamp();

  await message.reply({ embeds: [statEmbed] });
}

/**
 * Handles the !cancelitem command to remove an item from the queue.
 *
 * PROCESS:
 * 1. Validates admin permissions
 * 2. Checks for active auction
 * 3. Prompts for item number
 * 4. Waits for confirmation (30 seconds)
 * 5. Removes item from queue
 * 6. Adjusts currentItemIndex if needed
 *
 * FEATURES:
 * - Interactive confirmation prompt
 * - Shows item details before canceling
 * - Handles edge cases (canceling current item)
 * - Thread-locked confirmation (only works in command thread)
 *
 * SAFETY:
 * - Requires admin permission
 * - Confirmation timeout (30s)
 * - Cannot cancel already-ended items
 *
 * @param {Discord.Message} message - Discord message object
 * @returns {Promise<void>}
 */
async function handleCancelItem(message) {
  if (!auctionState.active || !auctionState.currentItem) {
    return await message.reply(`${EMOJI.ERROR} No active auction`);
  }

  const cancelConfirmBtn = new ButtonBuilder()
    .setCustomId(`cancelitem_confirm_${message.author.id}_${Date.now()}`)
    .setLabel('✅ Yes, Cancel Item')
    .setStyle(ButtonStyle.Danger);

  const cancelCancelBtn = new ButtonBuilder()
    .setCustomId(`cancelitem_cancel_${message.author.id}_${Date.now()}`)
    .setLabel('❌ No, Keep Item')
    .setStyle(ButtonStyle.Secondary);

  const cancelRow = new ActionRowBuilder().addComponents(cancelConfirmBtn, cancelCancelBtn);

  const canMsg = await message.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0xffa500)
        .setTitle(`${EMOJI.WARNING} Cancel Item?`)
        .setDescription(
          `**${auctionState.currentItem.item}**\n\nRefund all locked points?`
        )
        .setFooter({ text: 'Click a button below to confirm' }),
    ],
    components: [cancelRow],
  });

  const cancelCollector = canMsg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: TIMEOUTS.CONFIRMATION,
    filter: i => i.user.id === message.author.id
  });

  cancelCollector.on('collect', async (interaction) => {
    const isConfirm = interaction.customId.startsWith('cancelitem_confirm_');

    const disabledCancelRow = createDisabledRow(cancelConfirmBtn, cancelCancelBtn);

    if (isConfirm) {
      // Unlock points for current bidder
      const biddingState = biddingModule.getBiddingState();
      if (auctionState.currentItem && auctionState.currentItem.curWin) {
        const amt = biddingState.lp[auctionState.currentItem.curWin] || 0;
        biddingState.lp[auctionState.currentItem.curWin] = 0;
        biddingModule.saveBiddingState();
      }

      const itemName = auctionState.currentItem
        ? auctionState.currentItem.item
        : "Unknown Item";
      await message.channel.send(
        `${EMOJI.ERROR} **${itemName}** canceled. Points refunded.`
      );

      // Lock and archive the cancelled item's thread
      const thread = message.channel;
      if (thread && (thread.type === 11 || thread.type === 12)) {
        try {
          // Refetch thread to ensure it still exists
          const refreshedThread = await thread.fetch().catch(() => null);
          if (!refreshedThread) {
            console.warn(
              `⚠️ Thread ${thread.id} no longer exists, skipping lock/archive`
            );
          } else {
            if (typeof refreshedThread.setLocked === "function") {
              await refreshedThread
                .setLocked(true, "Item cancelled")
                .catch((err) => {
                  console.warn(
                    `⚠️ Failed to lock cancelled thread:`,
                    err.message
                  );
                });
              console.log(`🔒 Locked cancelled thread`);
            }

            // Small delay to avoid race conditions with Discord API
            await new Promise((resolve) => setTimeout(resolve, 500));

            if (typeof refreshedThread.setArchived === "function") {
              await refreshedThread
                .setArchived(true, "Item cancelled")
                .catch((err) => {
                  console.warn(
                    `⚠️ Failed to archive cancelled thread:`,
                    err.message
                  );
                });
              console.log(`📦 Archived cancelled thread`);
            }
          }
        } catch (err) {
          console.warn(`⚠️ Error closing cancelled thread:`, err.message);
        }
      }

      // Move to next item in sessions (use parent channel for next item)
      const parentChannel = thread.parent || message.channel;
      auctionState.currentItem = null;
      auctionState.currentItemIndex++;
      auctionState.timers.nextItem = setTimeout(async () => {
        await auctionNextItem(message.client, cfg, parentChannel);
      }, 20000);

      const successEmbed = new EmbedBuilder()
        .setColor(0x00ff00)
        .setTitle(`${EMOJI.SUCCESS} Item Cancelled`)
        .setDescription('Item cancelled and points refunded')
        .setTimestamp();

      await interaction.update({ embeds: [successEmbed], components: [disabledCancelRow] });
      cancelCollector.stop();
    } else {
      // User kept the item
      const keepEmbed = new EmbedBuilder()
        .setColor(0x00ff00)
        .setTitle(`${EMOJI.SUCCESS} Item Kept`)
        .setDescription('Item cancellation aborted')
        .setTimestamp();

      await interaction.update({ embeds: [keepEmbed], components: [disabledCancelRow] });
      cancelCollector.stop();
    }
  });

  cancelCollector.on('end', async (collected, reason) => {
    if (reason === 'time' && collected.size === 0) {
      const disabledCancelRow = new ActionRowBuilder().addComponents(
        ButtonBuilder.from(cancelConfirmBtn).setDisabled(true),
        ButtonBuilder.from(cancelCancelBtn).setDisabled(true)
      );

      const timeoutEmbed = new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle(`${EMOJI.ERROR} Timed Out`)
        .setDescription('Confirmation expired')
        .setTimestamp();

      await canMsg.edit({ embeds: [timeoutEmbed], components: [disabledCancelRow] }).catch(errorHandler.safeCatch('edit cancel confirmation timeout'));
    }
  });
}

/**
 * Handles the !skipitem command to skip the current item without recording a winner.
 *
 * PROCESS:
 * 1. Validates admin permissions
 * 2. Checks for active item
 * 3. Prompts for confirmation (30 seconds)
 * 4. Clears item timers
 * 5. Marks item as skipped (no winner)
 * 6. Locks and archives thread
 * 7. Moves to next item
 *
 * USE CASES:
 * - Item should not be auctioned now
 * - Item was mistakenly added
 * - Need to postpone item to later
 *
 * DIFFERENCE FROM CANCEL:
 * - Skip: Keeps item in session, marks as skipped
 * - Cancel: Removes item entirely from queue
 *
 * @param {Discord.Message} message - Discord message object
 * @returns {Promise<void>}
 */
async function handleSkipItem(message) {
  if (!auctionState.active || !auctionState.currentItem) {
    return await message.reply(`${EMOJI.ERROR} No active auction`);
  }

  const skipConfirmBtn = new ButtonBuilder()
    .setCustomId(`skipitem_confirm_${message.author.id}_${Date.now()}`)
    .setLabel('✅ Yes, Skip Item')
    .setStyle(ButtonStyle.Primary);

  const skipCancelBtn = new ButtonBuilder()
    .setCustomId(`skipitem_cancel_${message.author.id}_${Date.now()}`)
    .setLabel('❌ No, Continue')
    .setStyle(ButtonStyle.Secondary);

  const skipRow = new ActionRowBuilder().addComponents(skipConfirmBtn, skipCancelBtn);

  const skpMsg = await message.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0xffa500)
        .setTitle(`${EMOJI.WARNING} Skip Item?`)
        .setDescription(
          `**${auctionState.currentItem.item}**\n\nMark as no sale, move to next?`
        )
        .setFooter({ text: 'Click a button below to confirm' }),
    ],
    components: [skipRow],
  });

  const skipCollector = skpMsg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: TIMEOUTS.CONFIRMATION,
    filter: i => i.user.id === message.author.id
  });

  skipCollector.on('collect', async (interaction) => {
    const isConfirm = interaction.customId.startsWith('skipitem_confirm_');

    const disabledSkipRow = createDisabledRow(skipConfirmBtn, skipCancelBtn);

    if (isConfirm) {
      // Unlock points for current bidder
      const biddingState = biddingModule.getBiddingState();
      if (auctionState.currentItem && auctionState.currentItem.curWin) {
        const amt = biddingState.lp[auctionState.currentItem.curWin] || 0;
        biddingState.lp[auctionState.currentItem.curWin] = 0;
        biddingModule.saveBiddingState();
      }

      const itemName = auctionState.currentItem
        ? auctionState.currentItem.item
        : "Unknown Item";
      await message.channel.send(`⭐️ **${itemName}** skipped (no sale).`);

      // Lock and archive the skipped item's thread
      const thread = message.channel;
      if (thread && (thread.type === 11 || thread.type === 12)) {
        try {
          // Refetch thread to ensure it still exists
          const refreshedThread = await thread.fetch().catch(() => null);
          if (!refreshedThread) {
            console.warn(
              `⚠️ Thread ${thread.id} no longer exists, skipping lock/archive`
            );
          } else {
            if (typeof refreshedThread.setLocked === "function") {
              await refreshedThread
                .setLocked(true, "Item skipped")
                .catch((err) => {
                  console.warn(
                    `⚠️ Failed to lock skipped thread:`,
                    err.message
                  );
                });
              console.log(`🔒 Locked skipped thread`);
            }

            // Small delay to avoid race conditions with Discord API
            await new Promise((resolve) => setTimeout(resolve, 500));

            if (typeof refreshedThread.setArchived === "function") {
              await refreshedThread
                .setArchived(true, "Item skipped")
                .catch((err) => {
                  console.warn(
                    `⚠️ Failed to archive skipped thread:`,
                    err.message
                  );
                });
              console.log(`📦 Archived skipped thread`);
            }
          }
        } catch (err) {
          console.warn(`⚠️ Error closing skipped thread:`, err.message);
        }
      }

      // Move to next item in sessions (use parent channel for next item)
      const parentChannel = thread.parent || message.channel;
      auctionState.currentItem = null;
      auctionState.currentItemIndex++;
      auctionState.timers.nextItem = setTimeout(async () => {
        await auctionNextItem(message.client, cfg, parentChannel);
      }, 20000);

      const successEmbed = new EmbedBuilder()
        .setColor(0x00ff00)
        .setTitle(`${EMOJI.SUCCESS} Item Skipped`)
        .setDescription('Item skipped (no sale)')
        .setTimestamp();

      await interaction.update({ embeds: [successEmbed], components: [disabledSkipRow] });
      skipCollector.stop();
    } else {
      // User continued
      const continueEmbed = new EmbedBuilder()
        .setColor(0x00ff00)
        .setTitle(`${EMOJI.SUCCESS} Continuing`)
        .setDescription('Item skip cancelled')
        .setTimestamp();

      await interaction.update({ embeds: [continueEmbed], components: [disabledSkipRow] });
      skipCollector.stop();
    }
  });

  skipCollector.on('end', async (collected, reason) => {
    if (reason === 'time' && collected.size === 0) {
      const disabledSkipRow = new ActionRowBuilder().addComponents(
        ButtonBuilder.from(skipConfirmBtn).setDisabled(true),
        ButtonBuilder.from(skipCancelBtn).setDisabled(true)
      );

      const timeoutEmbed = new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle(`${EMOJI.ERROR} Timed Out`)
        .setDescription('Confirmation expired')
        .setTimestamp();

      await skpMsg.edit({ embeds: [timeoutEmbed], components: [disabledSkipRow] }).catch(errorHandler.safeCatch('edit skip confirmation timeout'));
    }
  });
}

/**
 * Handles the !forcesubmit command to force-submit results if finalization fails.
 *
 * EMERGENCY USE ONLY:
 * - Used when session ends but results fail to post
 * - Bypasses normal finalization checks
 * - Directly calls bidding module's finalizeBids()
 *
 * PROCESS:
 * 1. Validates admin permissions
 * 2. Checks for session items
 * 3. Builds combined results
 * 4. Calls finalizeBids() to deduct points
 * 5. Confirms submission
 *
 * SAFETY:
 * - Only works when auction is not active
 * - Requires admin permission
 * - Shows confirmation message
 *
 * @param {Discord.Message} message - Discord message object
 * @param {Object} config - Bot configuration
 * @param {Object} biddingModule - Bidding module reference
 * @returns {Promise<void>}
 */
async function handleForceSubmitResults(message, config, biddingModule) {
  if (auctionState.sessionItems.length === 0) {
    return await message.reply(`${EMOJI.ERROR} No results to submit`);
  }

  const submitButton = new ButtonBuilder()
    .setCustomId(`forcesubmit_confirm_${message.author.id}_${Date.now()}`)
    .setLabel('✅ Submit Results')
    .setStyle(ButtonStyle.Success)
    .setDisabled(false);

  const cancelButton = new ButtonBuilder()
    .setCustomId(`forcesubmit_cancel_${message.author.id}_${Date.now()}`)
    .setLabel('❌ Cancel')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(false);

  const row = new ActionRowBuilder().addComponents(submitButton, cancelButton);

  const fsMsg = await message.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0xffa500)
        .setTitle(`${EMOJI.WARNING} Force Submit?`)
        .setDescription(`**Items:** ${auctionState.sessionItems.length}`)
        .addFields({
          name: `${EMOJI.LIST} Results`,
          value: auctionState.sessionItems
            .map((a) => `• **${a.item}**: ${a.winner} - ${a.amount}pts`)
            .join("\n"),
          inline: false,
        })
        .setFooter({ text: 'Click a button below to confirm' }),
    ],
    components: [row],
  });

  const collector = fsMsg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: TIMEOUTS.CONFIRMATION,
    filter: i => i.user.id === message.author.id
  });

  collector.on('collect', async (interaction) => {
    const isConfirm = interaction.customId.startsWith('forcesubmit_confirm_');

    const disabledRow = createDisabledRow(submitButton, cancelButton);

    if (isConfirm) {
      await biddingModule.submitSessionTally(config, auctionState.sessionItems);
      auctionState.sessionItems = [];

      const successEmbed = new EmbedBuilder()
        .setColor(0x00ff00)
        .setTitle(`${EMOJI.SUCCESS} Results Submitted`)
        .setDescription('Results submitted successfully!')
        .setTimestamp();

      await interaction.update({ embeds: [successEmbed], components: [disabledRow] });
      collector.stop();
    } else {
      // User cancelled
      const cancelEmbed = new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle(`${EMOJI.ERROR} Cancelled`)
        .setDescription('Force submit cancelled')
        .setTimestamp();

      await interaction.update({ embeds: [cancelEmbed], components: [disabledRow] });
      collector.stop();
    }
  });

  collector.on('end', async (collected, reason) => {
    if (reason === 'time' && collected.size === 0) {
      const disabledRow = new ActionRowBuilder().addComponents(
        ButtonBuilder.from(submitButton).setDisabled(true),
        ButtonBuilder.from(cancelButton).setDisabled(true)
      );

      const timeoutEmbed = new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle(`${EMOJI.ERROR} Timed Out`)
        .setDescription('Confirmation expired')
        .setTimestamp();

      await fsMsg.edit({ embeds: [timeoutEmbed], components: [disabledRow] }).catch(errorHandler.safeCatch('edit forcesubmit confirmation timeout'));
    }
  });
}

/**
 * Updates the current item's state with new values.
 * Used by bidding module to update bid information in real-time.
 *
 * @param {Object} updates - Object with fields to update (curBid, curWin, curWinId, etc.)
 * @returns {void}
 */
function updateCurrentItemState(updates) {
  if (!auctionState.currentItem) return false;

  Object.assign(auctionState.currentItem, updates);
  console.log(`${EMOJI.SUCCESS} Item state updated:`, Object.keys(updates));
  return true;
}

/**
 * Manually ends the current auction session.
 * Wrapper function that calls finalizeSession().
 *
 * USE CASES:
 * - Admin wants to end session early
 * - Emergency stop
 *
 * @param {Discord.Client} client - Discord bot client
 * @param {Object} config - Bot configuration
 * @param {Discord.TextChannel} channel - Bidding channel
 * @returns {Promise<void>}
 */
async function endAuctionSession(client, config, channel) {
  console.log(`🛑 Ending auction session (forced by admin)...`);

  if (!auctionState.active) {
    console.log(`${EMOJI.WARNING} No active auction to end`);
    return;
  }

  // Clear all timers
  clearAllTimers();

  // If there's a current item, mark it as cancelled
  if (
    auctionState.currentItem &&
    auctionState.currentItem.status === "active"
  ) {
    auctionState.currentItem.status = "cancelled";

    // Try to notify in the current item thread if possible
    try {
      const currentThread = auctionState.currentItem.thread;
      if (currentThread && typeof currentThread.send === "function") {
        await currentThread.send({
          embeds: [
            new EmbedBuilder()
              .setColor(COLORS.ERROR)
              .setTitle(`${EMOJI.ERROR} Auction Cancelled`)
              .setDescription(`This auction was ended by an administrator.`),
          ],
        });

        // Archive the thread
        if (typeof currentThread.setArchived === "function") {
          await currentThread
            .setArchived(true, "Session ended by admin")
            .catch(errorHandler.safeCatch('archive thread on session end'));
        }
      }
    } catch (err) {
      console.warn(`⚠️ Could not notify current item thread:`, err.message);
    }
  }

  // Finalize the session (submit completed items, clear state)
  await finalizeSession(client, config, channel);

  console.log(`✅ Auction session ended successfully`);
}

/**
 * Handles the !movetodistribution command to move won items to distribution sheet.
 *
 * PROCESS:
 * 1. Validates admin permissions
 * 2. Checks for completed session items
 * 3. Sends moveToDistribution request to Google Sheets
 * 4. Moves items with winners to Distribution sheet
 * 5. Clears Winner column in BiddingItems sheet
 * 6. Announces success in admin logs
 *
 * TIMING:
 * - Should be run AFTER !forcesubmit or automatic finalization
 * - Ensures points have been deducted before moving items
 *
 * FEATURES:
 * - Filters out items without winners
 * - Logs moved items count
 * - Posts confirmation embed
 *
 * @param {Discord.Message} message - Discord message object
 * @param {Object} config - Bot configuration
 * @param {Discord.Client} client - Discord bot client
 * @returns {Promise<void>}
 */
async function handleMoveToDistribution(message, config, client) {
  console.log(`📦 Admin triggered manual ForDistribution move...`);

  try {
    // Send processing message
    const statusMsg = await message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(COLORS.INFO)
          .setTitle(`${EMOJI.CLOCK} Moving Items to ForDistribution`)
          .setDescription(
            `Scanning BiddingItems sheet for completed auctions...\n\n` +
            `This may take a few seconds.`
          ),
      ],
    });

    // Call the Google Sheets function with retry logic
    const maxRetries = 3;
    let moveSuccess = false;
    let moveData = null;
    let lastError = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`📦 Move attempt ${attempt}/${maxRetries}...`);

        moveData = await sheetAPI.call('moveAuctionedItemsToForDistribution');
        console.log(`✅ Moved ${moveData.moved || 0} items to ForDistribution`);
        moveSuccess = true;
        break; // Success - exit retry loop
      } catch (err) {
        lastError = err.message;
        console.error(`⚠️ Move attempt ${attempt} failed:`, err);

        // OPTIMIZATION v6.7: Exponential backoff with jitter
        if (attempt < maxRetries) {
          const delay = Math.min(
            Math.pow(2, attempt) * 1000 + Math.random() * 1000,
            30000 // Max 30s
          );
          console.log(`⏳ Retrying in ${Math.round(delay/1000)}s...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    // Update status message with result
    if (moveSuccess) {
      await statusMsg.edit({
        embeds: [
          new EmbedBuilder()
            .setColor(COLORS.SUCCESS)
            .setTitle(`${EMOJI.SUCCESS} Items Moved Successfully`)
            .setDescription(
              `**${moveData.moved || 0} item(s)** moved from BiddingItems to ForDistribution\n\n` +
              `**${moveData.skipped || 0} item(s)** skipped (no winner)\n` +
              `**${moveData.total || 0} total items** processed`
            )
            .addFields({
              name: `${EMOJI.INFO} Details`,
              value:
                `Items with winners have been:\n` +
                `✅ Copied to ForDistribution sheet\n` +
                `✅ Removed from BiddingItems sheet\n\n` +
                `Items without winners remain in BiddingItems for future auctions.`,
              inline: false,
            })
            .setFooter({
              text: `Check the ForDistribution sheet in Google Sheets`,
            })
            .setTimestamp(),
        ],
      });

      // Log to admin logs
      const mainGuild = await client.guilds.fetch(config.main_guild_id);
      const adminLogs = await mainGuild.channels
        .fetch(config.admin_logs_channel_id)
        .catch(() => null);

      if (adminLogs && moveData.moved > 0) {
        await adminLogs.send(
          `📦 **Manual ForDistribution Move**\n` +
          `Triggered by <@${message.author.id}>\n` +
          `**Moved:** ${moveData.moved} items | **Skipped:** ${moveData.skipped} items`
        );
      }
    } else {
      // Failed after all retries
      await statusMsg.edit({
        embeds: [
          new EmbedBuilder()
            .setColor(COLORS.ERROR)
            .setTitle(`${EMOJI.ERROR} Move Failed`)
            .setDescription(
              `Failed to move items after ${maxRetries} attempts.\n\n` +
              `**Error:** ${lastError}`
            )
            .addFields({
              name: `${EMOJI.WARNING} Possible Causes`,
              value:
                `• Google Sheets API timeout\n` +
                `• Network connectivity issues\n` +
                `• Sheet permissions problem\n` +
                `• Webhook URL misconfigured`,
              inline: false,
            }, {
              name: `${EMOJI.INFO} Manual Fix`,
              value:
                `Open Google Sheets and run:\n` +
                `\`\`\`\nmoveAllItemsWithWinnersToForDistribution()\n\`\`\`\n` +
                `from the Apps Script editor (Extensions → Apps Script)`,
              inline: false,
            })
            .setFooter({
              text: `Contact support if issue persists`,
            })
            .setTimestamp(),
        ],
      });
    }
  } catch (err) {
    console.error(`❌ handleMoveToDistribution error:`, err);
    await message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(COLORS.ERROR)
          .setTitle(`${EMOJI.ERROR} Command Error`)
          .setDescription(
            `An unexpected error occurred:\n\`\`\`${err.message}\`\`\``
          ),
      ],
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 12: SCHEDULED AUTOMATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Timer reference for weekly Sunday auction scheduler.
 * Prevents duplicate schedulers from being created.
 * @type {NodeJS.Timeout|null}
 */
let weeklyAuctionTimer = null;

/**
 * Timer reference for session 2 scheduler.
 * @type {NodeJS.Timeout|null}
 */
let session2Timer = null;

/**
 * Interval reference for polling session completion.
 * @type {NodeJS.Timeout|null}
 */
let sessionPollInterval = null;

/**
 * Configuration for dual-session auctions.
 * @constant {Object}
 */
const DUAL_SESSION_CONFIG = {
  enabled: true, // Enable 2-session auctions
  restPeriodMinutes: 60, // 1 hour rest between sessions
  pollIntervalMs: 30000, // Check every 30 seconds if session ended
  maxPollAttempts: 720, // Max 6 hours of polling (720 * 30s = 6h)
};

/**
 * Starts Session 2 of the scheduled auction with refreshed points.
 * Called automatically 1 hour after Session 1 completes.
 *
 * @param {Discord.Client} client - Discord bot client
 * @param {Object} config - Bot configuration
 * @returns {Promise<void>}
 */
async function startSession2(client, config) {
  console.log(`${EMOJI.AUCTION} Starting Session 2 of scheduled auction...`);

  try {
    // Check if an auction is already running (shouldn't happen but safety check)
    if (auctionState.active) {
      console.log(`${EMOJI.WARNING} Auction already running, skipping Session 2`);
      return;
    }

    // Fetch the bidding channel
    const biddingChannel = await discordCache.getChannel('bidding_channel_id');
    if (!biddingChannel) {
      console.error(`${EMOJI.ERROR} Could not fetch bidding channel for Session 2`);
      return;
    }

    // Announce Session 2 starting
    const session2Embed = new EmbedBuilder()
      .setColor(COLORS.AUCTION)
      .setTitle(`${EMOJI.AUCTION} Session 2 Starting!`)
      .setDescription(
        '**The second auction session is now starting!**\n\n' +
        '📦 Auctioning leftover items from Session 1\n' +
        '💰 Points have been refreshed\n\n' +
        '**Get ready to bid!**'
      )
      .setTimestamp();

    await biddingChannel.send({
      content: '@everyone',
      embeds: [session2Embed]
    });

    // CRITICAL: Refresh points cache before Session 2
    // This ensures members have updated points after Session 1 spending
    console.log(`${EMOJI.INFO} Refreshing points cache for Session 2...`);

    try {
      const pointsData = await sheetAPI.call('getBiddingPoints');
      const members = pointsData.members || pointsData.data?.members || [];
      const points = pointsData.points || pointsData.data?.points || {};

      if (members.length > 0 || Object.keys(points).length > 0) {
        const pointsMap = Object.keys(points).length > 0 ? points : members.reduce((acc, member) => {
          const name = member?.username?.trim();
          if (!name) return acc;
          acc[name] = Number(member?.pointsLeft) || 0;
          return acc;
        }, {});

        // Update bidding module's cache
        const biddingState = biddingModule.getBiddingState();
        biddingState.cp = new PointsCache(pointsMap);
        biddingState.ct = Date.now();
        biddingModule.saveBiddingState();

        console.log(`${EMOJI.SUCCESS} Refreshed ${biddingState.cp.size()} members' points for Session 2`);
      }
    } catch (pointsErr) {
      console.error(`${EMOJI.ERROR} Failed to refresh points for Session 2:`, pointsErr);
      await biddingChannel.send(`${EMOJI.WARNING} Could not refresh points cache. Session 2 will use cached points.`);
    }

    // Start Session 2
    // startAuctioneering will fetch fresh items (only unsold ones without winners)
    await startAuctioneering(client, config, biddingChannel);
    console.log(`${EMOJI.SUCCESS} Session 2 started successfully`);

  } catch (err) {
    console.error(`${EMOJI.ERROR} Failed to start Session 2:`, err);

    // Notify admin logs
    try {
      const adminLogs = await discordCache.getChannel('admin_logs_channel_id').catch(() => null);
      if (adminLogs) {
        await adminLogs.send(
          `${EMOJI.ERROR} **Session 2 Failed**\n` +
          `Failed to start Session 2 of the scheduled auction.\n` +
          `**Error:** ${err.message}\n\n` +
          `You can manually start a new auction with \`!startauction\` if needed.`
        );
      }
    } catch (notifyErr) {
      console.error(`${EMOJI.ERROR} Could not notify admin logs:`, notifyErr);
    }
  }
}

/**
 * Monitors Session 1 completion and schedules Session 2.
 * Polls auctionState.active every 30 seconds until session ends.
 *
 * @param {Discord.Client} client - Discord bot client
 * @param {Object} config - Bot configuration
 */
function scheduleSession2AfterCompletion(client, config) {
  if (!DUAL_SESSION_CONFIG.enabled) {
    console.log(`${EMOJI.INFO} Dual-session auctions disabled, skipping Session 2 scheduling`);
    return;
  }

  // Clear any existing poll interval
  if (sessionPollInterval) {
    clearInterval(sessionPollInterval);
    sessionPollInterval = null;
  }

  let pollAttempts = 0;
  console.log(`${EMOJI.CLOCK} Monitoring Session 1 completion for Session 2 scheduling...`);

  sessionPollInterval = setInterval(async () => {
    pollAttempts++;

    // Safety limit - stop polling after max attempts
    if (pollAttempts >= DUAL_SESSION_CONFIG.maxPollAttempts) {
      console.log(`${EMOJI.WARNING} Max poll attempts reached, stopping Session 2 monitoring`);
      clearInterval(sessionPollInterval);
      sessionPollInterval = null;
      return;
    }

    // Check if Session 1 has ended AND finalization is complete
    // We check both flags to ensure tallies are submitted and items moved before announcing rest period
    if (!auctionState.active && auctionState.sessionFinalized) {
      console.log(`${EMOJI.SUCCESS} Session 1 completed and finalized! Scheduling Session 2 after ${DUAL_SESSION_CONFIG.restPeriodMinutes} minute rest...`);

      // Stop polling
      clearInterval(sessionPollInterval);
      sessionPollInterval = null;

      // Announce the rest period
      try {
        const biddingChannel = await discordCache.getChannel('bidding_channel_id');
        const announcementChannel = await discordCache.getChannel('guild_announcement_channel_id').catch(() => null);

        const session2StartTime = Date.now() + (DUAL_SESSION_CONFIG.restPeriodMinutes * 60 * 1000);
        const session2Timestamp = Math.floor(session2StartTime / 1000);

        const restEmbed = new EmbedBuilder()
          .setColor(COLORS.INFO)
          .setTitle(`${EMOJI.CLOCK} Session 1 Complete - Rest Period`)
          .setDescription(
            '**Session 1 has ended!**\n\n' +
            `⏰ **Session 2 starts:** <t:${session2Timestamp}:R> (<t:${session2Timestamp}:t>)\n\n` +
            '📦 Leftover items from Session 1 will be auctioned\n' +
            '💰 Points will be refreshed before Session 2\n\n' +
            '**Take a break and come back for more bidding!**'
          )
          .setTimestamp();

        if (biddingChannel) {
          await biddingChannel.send({ embeds: [restEmbed] });
        }

        // Also announce in the announcement channel
        if (announcementChannel) {
          await announcementChannel.send({
            content: '@everyone',
            embeds: [restEmbed]
          });
        }
      } catch (announceErr) {
        console.error(`${EMOJI.ERROR} Failed to announce rest period:`, announceErr);
      }

      // Schedule Session 2 after rest period
      const restDelayMs = DUAL_SESSION_CONFIG.restPeriodMinutes * 60 * 1000;

      // Clear any existing session 2 timer
      if (session2Timer) {
        clearTimeout(session2Timer);
      }

      // 15-minute warning before Session 2
      const warningDelayMs = restDelayMs - (15 * 60 * 1000);
      if (warningDelayMs > 0) {
        setTimeout(async () => {
          try {
            const announcementChannel = await discordCache.getChannel('guild_announcement_channel_id').catch(() => null);
            if (announcementChannel) {
              await announcementChannel.send({
                content: '@everyone',
                embeds: [
                  new EmbedBuilder()
                    .setColor(COLORS.WARNING)
                    .setTitle(`${EMOJI.BELL} Session 2 Starting Soon!`)
                    .setDescription('**The second auction session starts in 15 minutes!**\n\nPrepare your points and get ready to bid on leftover items!')
                    .setTimestamp()
                ]
              });
            }
          } catch (warnErr) {
            console.error(`${EMOJI.ERROR} Failed to send Session 2 warning:`, warnErr);
          }
        }, warningDelayMs);
      }

      // Start Session 2
      session2Timer = setTimeout(async () => {
        await startSession2(client, config);
        session2Timer = null;
      }, restDelayMs);

      console.log(`${EMOJI.SUCCESS} Session 2 scheduled to start in ${DUAL_SESSION_CONFIG.restPeriodMinutes} minutes`);
    }
  }, DUAL_SESSION_CONFIG.pollIntervalMs);
}

/**
 * Schedules automatic weekly auctions every Sunday at 12:00 PM GMT+8 (Manila Time).
 *
 * FEATURES:
 * - Calculates next Sunday at 12:00 PM in GMT+8 timezone
 * - Automatically schedules next week's auction after completion
 * - Logs countdown until next auction
 * - Handles auction-already-running case
 *
 * PROCESS:
 * 1. Calculates time until next Sunday 12:00 PM GMT+8
 * 2. Sets timeout for that duration
 * 3. On trigger: starts auction if not already running
 * 4. Reschedules for next Sunday
 *
 * ERROR HANDLING:
 * - Skips if auction already active
 * - Notifies admin logs on failure
 * - Always reschedules regardless of success/failure
 *
 * @param {Discord.Client} client - Discord bot client
 * @param {Object} config - Bot configuration
 */
function scheduleWeeklySundayAuction(client, config) {
  // Prevent duplicate schedulers
  if (weeklyAuctionTimer) {
    console.log(`${EMOJI.WARNING} Weekly auction scheduler already running, skipping initialization`);
    return;
  }

  console.log(`${EMOJI.CLOCK} Initializing weekly Sunday auction scheduler...`);

  const calculateNextSunday12PM = () => {
    const now = new Date();

    // GMT+8 offset in milliseconds
    const GMT8_OFFSET = 8 * 60 * 60 * 1000;

    // Get current time in GMT+8
    const nowGMT8 = new Date(now.getTime() + GMT8_OFFSET);

    // Set to 12:00 PM (noon) today in GMT+8
    const targetGMT8 = new Date(nowGMT8);
    targetGMT8.setUTCHours(12, 0, 0, 0);

    // Get current day of week (0 = Sunday, 6 = Saturday)
    const currentDay = targetGMT8.getUTCDay();

    // Calculate days until next Sunday
    let daysUntilSunday;
    if (currentDay === 0) {
      // Today is Sunday
      if (targetGMT8.getTime() > nowGMT8.getTime()) {
        // Haven't reached 12:00 PM yet today
        daysUntilSunday = 0;
      } else {
        // Already past 12:00 PM, schedule for next Sunday
        daysUntilSunday = 7;
      }
    } else {
      // Not Sunday, calculate days until next Sunday
      daysUntilSunday = 7 - currentDay;
    }

    // Add days to target date
    targetGMT8.setUTCDate(targetGMT8.getUTCDate() + daysUntilSunday);

    // Convert back to UTC for the actual timer
    const targetUTC = new Date(targetGMT8.getTime() - GMT8_OFFSET);

    return targetUTC;
  };

  const scheduleNext = () => {
    const nextUTC = calculateNextSunday12PM();
    const now = new Date();
    const delay = nextUTC.getTime() - now.getTime();

    // Format for display in Manila time
    const displayTime = new Date(nextUTC.getTime() + 8 * 60 * 60 * 1000);
    const days = Math.floor(delay / 1000 / 60 / 60 / 24);
    const hours = Math.floor((delay / 1000 / 60 / 60) % 24);
    const minutes = Math.floor((delay / 1000 / 60) % 60);

    // Get day name
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayName = dayNames[displayTime.getUTCDay()];

    console.log(`${EMOJI.CLOCK} Next Sunday auction scheduled for: ${dayName}, ${displayTime.toISOString().replace('T', ' ').substring(0, 19)} GMT+8 (in ${days}d ${hours}h ${minutes}m)`);

    // Schedule announcement 15 minutes before auction
    const ANNOUNCEMENT_LEAD_TIME = 15 * 60 * 1000; // 15 minutes
    const announcementDelay = delay - ANNOUNCEMENT_LEAD_TIME;

    if (announcementDelay > 0) {
      setTimeout(async () => {
        try {
          console.log(`${EMOJI.BELL} Sending 15-minute auction warning to announcement channel...`);
          const announcementChannel = await discordCache.getChannel('guild_announcement_channel_id').catch(() => null);

          if (announcementChannel) {
            await announcementChannel.send({
              content: '@everyone',
              embeds: [
                new EmbedBuilder()
                  .setColor(0xffa500) // Orange
                  .setTitle(`${EMOJI.AUCTION} Auction Starting Soon!`)
                  .setDescription('The weekly auction will begin in **15 minutes**!')
                  .addFields(
                    { name: '⏰ Start Time', value: '<t:' + Math.floor(nextUTC.getTime() / 1000) + ':R>', inline: true },
                    { name: '📍 Location', value: '<#' + config.bidding_channel_id + '>', inline: true }
                  )
                  .setFooter({ text: 'Prepare your points and get ready to bid!' })
                  .setTimestamp()
              ]
            });
            console.log(`${EMOJI.SUCCESS} Auction announcement sent to announcement channel`);
          } else {
            console.warn(`${EMOJI.WARNING} Could not fetch announcement channel for pre-auction warning`);
          }
        } catch (err) {
          console.error(`${EMOJI.ERROR} Failed to send auction announcement:`, err);
        }
      }, announcementDelay);
    }

    weeklyAuctionTimer = setTimeout(async () => {
      console.log(`${EMOJI.AUCTION} Sunday auction time! Starting auction...`);

      try {
        // Check if auction is already running
        if (auctionState.active) {
          console.log(`${EMOJI.WARNING} Auction already running, skipping scheduled start`);
          scheduleNext();
          return;
        }

        // Fetch the bidding channel
        const biddingChannel = await discordCache.getChannel('bidding_channel_id');

        if (!biddingChannel) {
          console.error(`${EMOJI.ERROR} Could not fetch bidding channel for scheduled auction`);
          scheduleNext();
          return;
        }

        // Start Session 1 of the auction
        await startAuctioneering(client, config, biddingChannel);
        console.log(`${EMOJI.SUCCESS} Scheduled Sunday auction Session 1 started successfully`);

        // Schedule Session 2 to start after Session 1 completes
        // This monitors when Session 1 ends and schedules Session 2 after rest period
        scheduleSession2AfterCompletion(client, config);
      } catch (err) {
        console.error(`${EMOJI.ERROR} Failed to start scheduled auction:`, err);

        // Try to notify admin logs
        try {
          const adminLogs = await discordCache.getChannel('admin_logs_channel_id').catch(() => null);

          if (adminLogs) {
            await adminLogs.send(
              `${EMOJI.ERROR} **Scheduled Auction Failed**\n` +
              `Failed to start Sunday auction at 12:00 PM GMT+8.\n` +
              `**Error:** ${err.message}\n\n` +
              `Please check bot logs and try running \`!startauction\` manually.`
            );
          }
        } catch (notifyErr) {
          console.error(`${EMOJI.ERROR} Could not notify admin logs:`, notifyErr);
        }
      }

      // Schedule next Sunday's auction
      scheduleNext();
    }, delay);
  };

  scheduleNext();
  console.log(`${EMOJI.SUCCESS} Weekly Sunday auction scheduler initialized (12:00 PM GMT+8)`);
}

/**
 * Schedule pre-auction sync (Sheets → MongoDB) 1 hour before Sunday auction
 * Ensures all manual Google Sheets edits to bidding points are synced to MongoDB
 * before the auction starts and loads points from MongoDB.
 *
 * TIMING:
 * - Runs every Sunday at 11:00 AM GMT+8 (1 hour before 12:00 PM auction)
 * - Syncs: BiddingPoints (Google Sheets → MongoDB)
 * - Also syncs: Boss Rotation (for good measure)
 *
 * PURPOSE:
 * - Admin may manually adjust points in Google Sheets between auctions
 * - Bot loads points from Sheets at auction start, but MongoDB might be stale
 * - This sync ensures MongoDB has latest data before auction
 *
 * @param {SheetAPI} sheetAPI - Google Sheets API instance
 * @param {Object} bossRotation - Boss rotation module reference
 */
let preAuctionSyncTimer = null;

function schedulePreAuctionSync(sheetAPI, bossRotation) {
  // Prevent duplicate schedulers
  if (preAuctionSyncTimer) {
    console.log(`${EMOJI.WARNING} Pre-auction sync scheduler already running`);
    return;
  }

  console.log(`${EMOJI.CLOCK} Initializing pre-auction sync scheduler (1 hour before auction)...`);

  const calculateNextSunday11AM = () => {
    const now = new Date();
    const GMT8_OFFSET = 8 * 60 * 60 * 1000;
    const nowGMT8 = new Date(now.getTime() + GMT8_OFFSET);

    // Set to 11:00 AM (1 hour before noon) in GMT+8
    const targetGMT8 = new Date(nowGMT8);
    targetGMT8.setUTCHours(11, 0, 0, 0);

    const currentDay = targetGMT8.getUTCDay();
    let daysUntilSunday;

    if (currentDay === 0) {
      // Today is Sunday
      if (targetGMT8.getTime() > nowGMT8.getTime()) {
        daysUntilSunday = 0;
      } else {
        daysUntilSunday = 7;
      }
    } else {
      daysUntilSunday = 7 - currentDay;
    }

    targetGMT8.setUTCDate(targetGMT8.getUTCDate() + daysUntilSunday);
    return new Date(targetGMT8.getTime() - GMT8_OFFSET);
  };

  const scheduleNext = () => {
    const nextUTC = calculateNextSunday11AM();
    const now = new Date();
    const delay = nextUTC.getTime() - now.getTime();

    const displayTime = new Date(nextUTC.getTime() + 8 * 60 * 60 * 1000);
    const days = Math.floor(delay / 1000 / 60 / 60 / 24);
    const hours = Math.floor((delay / 1000 / 60 / 60) % 24);
    const minutes = Math.floor((delay / 1000 / 60) % 60);

    console.log(`${EMOJI.CLOCK} Next pre-auction sync scheduled for: ${displayTime.toISOString().replace('T', ' ').substring(0, 19)} GMT+8 (in ${days}d ${hours}h ${minutes}m)`);

    preAuctionSyncTimer = setTimeout(async () => {
      try {
        console.log(`${EMOJI.RESET} [PRE-AUCTION SYNC] Starting 1-hour pre-auction sync (Sheets → MongoDB)...`);
        const startTime = Date.now();

        // Sync bidding points: Sheets → MongoDB
        const mongoHelpers = require('./utils/mongodb-helpers');
        const dbAPI = require('./utils/database-api');

        try {
          const pointsData = await sheetAPI.call('getBiddingPoints');
          const members = pointsData.members || pointsData.data?.members || [];

          if (members.length === 0) {
            console.warn(`${EMOJI.WARNING} [PRE-AUCTION SYNC] No points data received from Sheets`);
          } else {
            const db = await dbAPI.connect();
            const membersCollection = db.collection('members');
            let syncedCount = 0;

            for (const member of members) {
              const username = member?.username?.trim();
              if (!username) continue;

              const pointsLeft = Number(member?.pointsLeft) || 0;
              const pointsLocked = Number(member?.pointsLocked) || 0;

              await membersCollection.updateOne(
                { username: username },
                {
                  $set: {
                    pointsLeft: pointsLeft,
                    pointsLocked: pointsLocked,
                    lastSyncFromSheets: new Date()
                  }
                },
                { upsert: true }
              );

              syncedCount++;
            }

            console.log(`${EMOJI.SUCCESS} [PRE-AUCTION SYNC] Synced ${syncedCount} member points from Sheets → MongoDB`);
          }
        } catch (pointsError) {
          console.error(`${EMOJI.ERROR} [PRE-AUCTION SYNC] Failed to sync points:`, pointsError.message);
        }

        // Also sync boss rotation (good measure)
        try {
          await bossRotation.refreshRotationCache();
          console.log(`${EMOJI.SUCCESS} [PRE-AUCTION SYNC] Boss rotation synced`);
        } catch (rotationError) {
          console.error(`${EMOJI.ERROR} [PRE-AUCTION SYNC] Failed to sync rotation:`, rotationError.message);
        }

        const duration = Date.now() - startTime;
        console.log(`${EMOJI.SUCCESS} [PRE-AUCTION SYNC] Sync complete (${duration}ms) - Ready for auction in 1 hour!`);

      } catch (error) {
        console.error(`${EMOJI.ERROR} [PRE-AUCTION SYNC] Failed:`, error.message);
      }

      // Schedule next week's sync
      scheduleNext();
    }, delay);
  };

  scheduleNext();
  console.log(`${EMOJI.SUCCESS} Pre-auction sync scheduler initialized (11:00 AM GMT+8 every Sunday)`);
}

/**
 * Resets session finalization state and clears Session 2 polling/timers.
 * Use this when finalization crashed and left sessionFinalized stuck at false.
 *
 * @returns {Object} Status object with what was reset
 */
function resetSessionState() {
  const status = {
    previousFinalized: auctionState.sessionFinalized,
    previousActive: auctionState.active,
    clearedPollInterval: false,
    clearedSession2Timer: false,
  };

  // Reset the finalization flag
  auctionState.sessionFinalized = true;
  auctionState.active = false;

  // Clear Session 2 polling interval if running
  if (sessionPollInterval) {
    clearInterval(sessionPollInterval);
    sessionPollInterval = null;
    status.clearedPollInterval = true;
  }

  // Clear Session 2 timer if scheduled
  if (session2Timer) {
    clearTimeout(session2Timer);
    session2Timer = null;
    status.clearedSession2Timer = true;
  }

  console.log(`${EMOJI.SUCCESS} Session state reset:`, status);
  return status;
}

module.exports = {
  initialize,
  itemEnd,
  startAuctioneering,
  auctionNextItem, // Used internally by startAuctioneering and itemEnd
  endAuctionSession,
  getAuctionState: () => auctionState,
  // canUserBid - REMOVED: Not used anywhere
  setPostToSheet,
  getPostToSheet, // Used internally by startAuctioneering
  pauseSession,
  resumeSession,
  stopCurrentItem,
  extendCurrentItem,
  updateCurrentItemState,
  rescheduleItemTimers, // Reschedule timers after bid extension
  safelyClearItemTimers, // Clear item timers immediately (prevents race condition)
  handleQueueList,
  handleMyPoints,
  handleBidStatus,
  handleCancelItem,
  handleSkipItem,
  handleForceSubmitResults,
  handleMoveToDistribution,
  scheduleWeeklySundayAuction, // Weekly Sunday 12:00 PM GMT+8 auction scheduler
  schedulePreAuctionSync, // Pre-auction sync (Sheets → MongoDB) 1 hour before auction
  resetSessionState, // Reset sessionFinalized flag and clear Session 2 timers
  // getCurrentSessionBoss: () => currentSessionBoss - REMOVED: Not used anywhere
};
