/**
 * Centralized Constants
 * All emoji, color, timing, and configuration constants in one place
 */

// Discord Embed Colors
const COLORS = {
  SUCCESS: 0x00FF00,    // Green
  ERROR: 0xFF0000,      // Red
  WARNING: 0xFFA500,    // Orange
  INFO: 0x0099FF,       // Blue
  NEUTRAL: 0x808080,    // Gray
  GOLD: 0xFFD700,       // Gold
  PURPLE: 0x9B59B6,     // Purple
  DARK_RED: 0x8B0000,   // Dark Red
};

// Emoji Constants
const EMOJIS = {
  // Reactions
  CHECK: '✅',
  CROSS: '❌',
  CLOCK: '⏰',
  HOURGLASS: '⏳',
  WARNING: '⚠️',
  INFO: 'ℹ️',
  TROPHY: '🏆',
  STAR: '⭐',
  FIRE: '🔥',
  COIN: '💰',
  HAMMER: '🔨',
  SHIELD: '🛡️',
  SWORD: '⚔️',
  BOW: '🏹',
  SCROLL: '📜',
  CROWN: '👑',
  GEM: '💎',

  // Status
  ONLINE: '🟢',
  OFFLINE: '🔴',
  IDLE: '🟡',

  // Actions
  PENCIL: '✏️',
  TRASH: '🗑️',
  PIN: '📌',
  BELL: '🔔',
  LOCK: '🔒',
  UNLOCK: '🔓',

  // Numbers (for confirmation buttons)
  ONE: '1️⃣',
  TWO: '2️⃣',
  THREE: '3️⃣',
  FOUR: '4️⃣',
  FIVE: '5️⃣',
};

// Timing Constants (all in milliseconds)
const TIMING = {
  // API & Network
  MIN_SHEET_DELAY: 1000,              // Minimum delay between Google Sheets API calls
  HTTP_TIMEOUT: 10000,                 // HTTP request timeout (10 seconds)
  HTTP_RETRY_ATTEMPTS: 4,              // Number of retry attempts
  HTTP_RETRY_BASE_DELAY: 2000,         // Base delay for exponential backoff (2 seconds)

  // User Interactions
  REACTION_TIMEOUT: 30000,             // Time to wait for user reactions (30 seconds)
  CONFIRMATION_TIMEOUT: 60000,         // Time to wait for bid confirmations (60 seconds)
  VERIFICATION_TIMEOUT: 30000,         // Time to wait for verification (30 seconds)

  // Reaction Handling
  REACTION_RETRY_ATTEMPTS: 3,
  REACTION_RETRY_DELAY: 500,

  // Delays
  SUBMIT_DELAY: 2000,                  // Delay before submitting data (2 seconds)
  BID_COOLDOWN: 3000,                  // Cooldown between bids per user (3 seconds)

  // Auction Timings
  AUCTION_PREVIEW: 30000,              // Auction preview duration (30 seconds)
  AUCTION_COOLDOWN: 600000,            // Cooldown between auctions (10 minutes)
  AUCTION_GOING_ONCE: 60000,           // "Going once" announcement (60 seconds before end)
  AUCTION_GOING_TWICE: 30000,          // "Going twice" announcement (30 seconds before end)
  AUCTION_FINAL_CALL: 10000,           // "Final call" announcement (10 seconds before end)
  AUCTION_EXTEND_TIME: 60000,          // Time to extend auction on last-second bid (60 seconds)

  // Cache & Cleanup
  CACHE_REFRESH_INTERVAL: 1800000,     // Cache refresh interval (30 minutes)
  CLEANUP_INTERVAL: 43200000,          // Cleanup interval for old data (12 hours)
  STATE_SYNC_INTERVAL: 300000,         // State sync interval (5 minutes)

  // Memory Management
  MESSAGE_CACHE_INTERVAL: 300000,      // Message cache sweep interval (5 minutes)
  MESSAGE_CACHE_LIFETIME: 600000,      // Message cache lifetime (10 minutes)
  USER_CACHE_INTERVAL: 600000,         // User cache sweep interval (10 minutes)
  MEMBER_CACHE_INTERVAL: 900000,       // Member cache sweep interval (15 minutes)

  // Pending Confirmation Cleanup
  CONFIRMATION_STALE_TIME: 60000,      // Time before confirmation is considered stale (60 seconds)
  CONFIRMATION_CLEANUP_INTERVAL: 30000, // Cleanup interval for stale confirmations (30 seconds)
};

// Rate Limiting
const RATE_LIMITS = {
  BID_PER_USER: 3000,                  // Milliseconds between bids per user
  SHEET_API_CALLS: 1000,               // Milliseconds between Sheet API calls
  SPAWN_CHECK_IN: 1000,                // Milliseconds between check-ins per user
};

// Limits & Thresholds
const LIMITS = {
  MAX_BID_AMOUNT: 999999,              // Maximum bid amount
  MIN_BID_INCREMENT: 1,                // Minimum bid increment
  MAX_THREAD_FETCH: 50,                // Maximum threads to fetch at once
  MAX_MESSAGE_FETCH: 50,               // Maximum messages to fetch at once
  MAX_MEMBERS_PER_SPAWN: 100,          // Maximum members per spawn thread
  MAX_ERROR_STACK_LENGTH: 1000,        // Maximum error stack trace length for logging
  MAX_EMBED_DESCRIPTION: 4096,         // Maximum Discord embed description length
  MAX_EMBED_FIELD_VALUE: 1024,         // Maximum Discord embed field value length
  FUZZY_MATCH_MAX_DISTANCE: 2,         // Maximum Levenshtein distance for fuzzy matching
};

// Bot Configuration
const BOT_CONFIG = {
  VERSION: '9.1',                      // Bot version
  HEALTH_CHECK_PORT: 8000,             // HTTP health check port for Koyeb
  MAX_MEMORY_MB: 200,                  // Maximum memory allocation (for Koyeb)
  GC_INTERVAL: 600000,                 // Garbage collection interval (10 minutes)
};

// Thread Types (Discord)
const THREAD_TYPES = {
  PUBLIC_THREAD: 11,
  PRIVATE_THREAD: 12,
  ANNOUNCEMENT_THREAD: 10,
};

// Auction States
const AUCTION_STATES = {
  PREVIEW: 'preview',
  ACTIVE: 'active',
  PAUSED: 'paused',
  ENDED: 'ended',
};

// Command Aliases Map (most common ones)
const COMMON_ALIASES = {
  // Bidding
  'b': 'bid',
  'mybid': 'mypoints',
  'pts': 'mypoints',
  'points': 'mypoints',
  'bp': 'mypoints',

  // Status
  'st': 'status',
  'stat': 'status',

  // Auction Control
  'p': 'pause',
  's': 'stop',
  'r': 'resume',
  'e': 'extend',

  // Help
  'h': 'help',
  '?': 'help',

  // Leaderboard
  'lb': 'leaderboard',
  'top': 'leaderboard',
};

// Response Messages
const MESSAGES = {
  // Errors
  ERROR_NO_ACTIVE_AUCTION: '❌ No active auction at the moment.',
  ERROR_BID_TOO_LOW: '❌ Bid must be higher than the current bid.',
  ERROR_INSUFFICIENT_POINTS: '❌ Insufficient points for this bid.',
  ERROR_BID_COOLDOWN: '⏳ Please wait before placing another bid.',
  ERROR_INVALID_AMOUNT: '❌ Invalid bid amount. Please enter a valid number.',
  ERROR_NOT_ADMIN: '❌ This command is restricted to administrators.',
  ERROR_WRONG_CHANNEL: '❌ This command can only be used in the designated channel.',
  ERROR_NO_ACTIVE_SPAWN: '❌ No active spawn found.',
  ERROR_ALREADY_CHECKED_IN: '⚠️ You have already checked in for this spawn.',
  ERROR_BOSS_NOT_FOUND: '❌ Boss not found. Please check the name and try again.',
  ERROR_THREAD_NOT_FOUND: '❌ Thread not found.',
  ERROR_TIMEOUT: '⏰ Operation timed out. Please try again.',
  ERROR_RATE_LIMIT: '⚠️ Rate limit exceeded. Please wait a moment.',
  ERROR_NETWORK: '❌ Network error. Please try again later.',
  ERROR_UNKNOWN: '❌ An unexpected error occurred. Please try again.',

  // Success
  SUCCESS_BID_PLACED: '✅ Bid placed successfully!',
  SUCCESS_AUCTION_STARTED: '✅ Auction started successfully!',
  SUCCESS_AUCTION_ENDED: '✅ Auction ended successfully!',
  SUCCESS_CHECKED_IN: '✅ Successfully checked in!',
  SUCCESS_VERIFIED: '✅ Verification successful!',
  SUCCESS_SPAWN_CLOSED: '✅ Spawn thread closed successfully!',

  // Info
  INFO_AUCTION_PREVIEW: '📢 Auction starting soon...',
  INFO_GOING_ONCE: '⚠️ Going once...',
  INFO_GOING_TWICE: '⚠️ Going twice...',
  INFO_FINAL_CALL: '🔥 Final call!',
  INFO_BID_PROCESSING: '⏳ Processing your bid...',
  INFO_LOADING: '⏳ Loading...',
  INFO_PLEASE_WAIT: '⏳ Please wait...',
};

module.exports = {
  COLORS,
  EMOJIS,
  TIMING,
  RATE_LIMITS,
  LIMITS,
  BOT_CONFIG,
  THREAD_TYPES,
  AUCTION_STATES,
  COMMON_ALIASES,
  MESSAGES,
};
