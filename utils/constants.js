/**
 * ============================================================================
 * CONSTANTS MODULE
 * ============================================================================
 *
 * Centralized configuration and constants for the entire bot.
 * All colors, emojis, timing values, limits, and configuration are defined
 * here to ensure consistency and make updates easier.
 *
 * This module exports:
 * - COLORS: Discord embed colors for different message types
 * - EMOJIS: Unicode emojis for reactions and messages
 * - TIMING: Time-based constants (milliseconds) for delays, timeouts, etc.
 * - RATE_LIMITS: Rate limiting configurations
 * - LIMITS: Numeric limits and thresholds
 * - BOT_CONFIG: Bot configuration settings
 * - THREAD_TYPES: Discord thread type codes
 * - AUCTION_STATES: Auction state machine values
 * - COMMON_ALIASES: Command alias mappings
 * - MESSAGES: Predefined message templates
 * - LOGGING: Production logging configuration
 *
 * @module utils/constants
 * @author Elysium Attendance Bot Team
 * @version 2.0
 * ============================================================================
 */

// ============================================================================
// LOGGING CONFIGURATION
// ============================================================================

/**
 * Production mode check - set NODE_ENV=production to reduce verbose logging
 * @constant {boolean} PRODUCTION_MODE
 */
const PRODUCTION_MODE = process.env.NODE_ENV === 'production';

/**
 * Optimized logging functions that respect production mode
 * console.error and console.warn always execute (critical messages)
 * console.log only executes in development mode
 *
 * @constant {Object} LOGGING
 */
const LOGGING = {
  PRODUCTION_MODE,

  /**
   * Debug/info logging - disabled in production
   * @param {...any} args - Arguments to log
   */
  log: (...args) => {
    if (!PRODUCTION_MODE) {
      console.log(...args);
    }
  },

  /**
   * Error logging - always enabled
   * @param {...any} args - Arguments to log
   */
  error: (...args) => console.error(...args),

  /**
   * Warning logging - always enabled
   * @param {...any} args - Arguments to log
   */
  warn: (...args) => console.warn(...args),
};

// ============================================================================
// DISCORD EMBED COLORS
// ============================================================================

/**
 * Discord embed colors in hexadecimal format.
 *
 * Use these for consistent color coding of bot messages:
 * - SUCCESS: Green for successful operations
 * - ERROR: Red for errors
 * - WARNING: Orange for warnings
 * - INFO: Blue for informational messages
 * - NEUTRAL: Gray for neutral/system messages
 * - GOLD/PURPLE/DARK_RED: Thematic colors for special features
 *
 * @constant {Object} COLORS
 */
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

// ============================================================================
// EMOJI CONSTANTS
// ============================================================================

/**
 * Unicode emojis used throughout the bot.
 *
 * Organized into categories:
 * - Reactions: Standard emojis for user feedback (CHECK, CROSS, etc.)
 * - Status: Indicators for bot/user status (ONLINE, OFFLINE, etc.)
 * - Actions: Emojis for action buttons (PENCIL, TRASH, etc.)
 * - Numbers: Number emojis for numbered choices
 *
 * @constant {Object} EMOJIS
 */
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

// ============================================================================
// TIMING CONSTANTS
// ============================================================================

/**
 * Time-based constants in milliseconds.
 *
 * All timing values are in milliseconds for consistency. Organized by category:
 * - API & Network: Delays and timeouts for external API calls
 * - User Interactions: Timeouts for user input and confirmations
 * - Reaction Handling: Retry settings for Discord reactions
 * - Delays: General operation delays
 * - Auction Timings: All auction-related timing values
 * - Cache & Cleanup: Background maintenance intervals
 * - Memory Management: Discord.js cache management
 * - Pending Confirmation Cleanup: Stale confirmation handling
 *
 * @constant {Object} TIMING
 */
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

// ============================================================================
// RATE LIMITING
// ============================================================================

/**
 * Rate limiting configurations in milliseconds.
 *
 * Enforces cooldowns to prevent spam and API rate limits:
 * - BID_PER_USER: Prevents users from spamming bids
 * - SHEET_API_CALLS: Prevents Google Sheets API rate limit errors
 * - SPAWN_CHECK_IN: Prevents check-in spam
 *
 * @constant {Object} RATE_LIMITS
 */
const RATE_LIMITS = {
  BID_PER_USER: 3000,                  // Milliseconds between bids per user
  SHEET_API_CALLS: 1000,               // Milliseconds between Sheet API calls
  SPAWN_CHECK_IN: 1000,                // Milliseconds between check-ins per user
};

// ============================================================================
// LIMITS AND THRESHOLDS
// ============================================================================

/**
 * Numeric limits and thresholds for various bot features.
 *
 * Includes:
 * - Auction limits (max bid, min increment)
 * - Discord API limits (max fetches)
 * - Feature-specific limits (max members per spawn)
 * - Logging limits (error stack length, embed sizes)
 * - Fuzzy matching threshold
 *
 * @constant {Object} LIMITS
 */
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

// ============================================================================
// BOT CONFIGURATION
// ============================================================================

/**
 * Bot configuration settings.
 *
 * General bot settings including:
 * - Version number for tracking releases
 * - Health check port for deployment platforms (Koyeb)
 * - Memory limits for resource management
 * - Garbage collection interval
 *
 * @constant {Object} BOT_CONFIG
 */
const BOT_CONFIG = {
  VERSION: '9.1',                      // Bot version
  HEALTH_CHECK_PORT: 8000,             // HTTP health check port for Koyeb
  MAX_MEMORY_MB: 200,                  // Maximum memory allocation (for Koyeb)
  GC_INTERVAL: 600000,                 // Garbage collection interval (10 minutes)
};

// ============================================================================
// DISCORD THREAD TYPES
// ============================================================================

/**
 * Discord thread type codes.
 *
 * These are the numeric codes used by Discord.js to identify thread types.
 * Used when creating threads or checking thread properties.
 *
 * @constant {Object} THREAD_TYPES
 * @see {@link https://discord.js.org/#/docs/discord.js/main/typedef/ThreadChannelType}
 */
const THREAD_TYPES = {
  PUBLIC_THREAD: 11,
  PRIVATE_THREAD: 12,
  ANNOUNCEMENT_THREAD: 10,
};

// ============================================================================
// AUCTION STATE MACHINE
// ============================================================================

/**
 * Auction state values for state machine.
 *
 * Defines the possible states an auction can be in:
 * - PREVIEW: Auction announced but not started (preview period)
 * - ACTIVE: Auction running, accepting bids
 * - PAUSED: Auction temporarily paused by admin
 * - ENDED: Auction completed
 *
 * @constant {Object} AUCTION_STATES
 */
const AUCTION_STATES = {
  PREVIEW: 'preview',
  ACTIVE: 'active',
  PAUSED: 'paused',
  ENDED: 'ended',
};

// ============================================================================
// COMMAND ALIASES
// ============================================================================

/**
 * Common command aliases for user convenience.
 *
 * Maps short aliases to full command names. Users can type either the
 * alias or full command name. This makes the bot more user-friendly by
 * supporting common abbreviations.
 *
 * Categories:
 * - Bidding commands
 * - Status commands
 * - Auction control commands
 * - Help commands
 * - Leaderboard commands
 *
 * @constant {Object} COMMON_ALIASES
 */
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

// ============================================================================
// PREDEFINED MESSAGE TEMPLATES
// ============================================================================

/**
 * Predefined message templates for consistent bot responses.
 *
 * Organized by category:
 * - Errors: Error messages for various failure conditions
 * - Success: Confirmation messages for successful operations
 * - Info: Informational messages for user feedback
 *
 * Using these templates ensures:
 * - Consistent messaging across the bot
 * - Easier translation/localization in the future
 * - Centralized message management
 *
 * @constant {Object} MESSAGES
 */
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

// ============================================================================
// MODULE EXPORTS
// ============================================================================

/**
 * Exported constants.
 *
 * All constants are grouped into logical categories and exported as
 * named exports. Import only what you need in your modules:
 *
 * @example
 * const { COLORS, EMOJIS } = require('./utils/constants');
 * const { TIMING } = require('./utils/constants');
 *
 * @exports COLORS - Discord embed colors
 * @exports EMOJIS - Unicode emojis
 * @exports TIMING - Time-based constants in milliseconds
 * @exports RATE_LIMITS - Rate limiting configurations
 * @exports LIMITS - Numeric limits and thresholds
 * @exports BOT_CONFIG - Bot configuration settings
 * @exports THREAD_TYPES - Discord thread type codes
 * @exports AUCTION_STATES - Auction state machine values
 * @exports COMMON_ALIASES - Command alias mappings
 * @exports MESSAGES - Predefined message templates
 */
module.exports = {
  LOGGING, // Production logging configuration (add this to reduce I/O in production)
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
