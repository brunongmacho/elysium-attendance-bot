/**
 * ============================================================================
 * COMMON UTILITIES MODULE
 * ============================================================================
 *
 * Provides shared utility functions used across all bot modules including:
 * - Timestamp handling and normalization (Manila timezone)
 * - Date formatting and parsing
 * - Boss name fuzzy matching
 * - Username normalization
 * - Error logging and admin notifications
 * - General helper functions
 *
 * This module consolidates common operations to ensure consistency and
 * performance across the entire bot. All timestamp operations use Manila
 * timezone (Asia/Manila) to match the game server timezone.
 *
 * @module utils/common
 * @requires fast-levenshtein - For fuzzy string matching
 * @requires ./cache-manager - For cached boss matching
 * @requires ./constants - For shared constants
 *
 * @author Elysium Attendance Bot Team
 * @version 2.0
 * ============================================================================
 */

// ============================================================================
// DEPENDENCIES
// ============================================================================

const levenshtein = require("fast-levenshtein");
const { findBossMatchCached } = require('./cache-manager');
const constants = require('./constants');

// ============================================================================
// CONSTANTS RE-EXPORTS
// ============================================================================

// Export enhanced constants for convenience
const TIMING_ENHANCED = constants.TIMING;
const COLORS = constants.COLORS;
const EMOJIS = constants.EMOJIS;

// ============================================================================
// TIMESTAMP AND DATE UTILITIES
// ============================================================================

/**
 * Get current timestamp in Manila timezone (Asia/Manila).
 *
 * Returns formatted date and time components that match the game server
 * timezone. All components are zero-padded for consistency.
 *
 * @function getCurrentTimestamp
 * @returns {Object} Timestamp object with formatted components
 * @returns {string} returns.date - Date in MM/DD/YY format (e.g., "10/29/25")
 * @returns {string} returns.time - Time in HH:MM format (e.g., "09:22")
 * @returns {string} returns.full - Full timestamp in MM/DD/YY HH:MM format
 *
 * @example
 * const timestamp = getCurrentTimestamp();
 * console.log(timestamp.full); // "10/29/25 09:22"
 * console.log(timestamp.date); // "10/29/25"
 * console.log(timestamp.time); // "09:22"
 */
function getCurrentTimestamp() {
  // Use cached Manila time conversion for performance (v6.2 optimization)
  const { getManilaTime } = require('./timestamp-cache');
  const manilaTime = getManilaTime();

  // Extract date components with zero-padding
  const month = String(manilaTime.getMonth() + 1).padStart(2, "0");
  const day = String(manilaTime.getDate()).padStart(2, "0");
  const year = String(manilaTime.getFullYear()).slice(-2); // Last 2 digits
  const hours = String(manilaTime.getHours()).padStart(2, "0");
  const mins = String(manilaTime.getMinutes()).padStart(2, "0");

  return {
    date: `${month}/${day}/${year}`,
    time: `${hours}:${mins}`,
    full: `${month}/${day}/${year} ${hours}:${mins}`,
  };
}

/**
 * Get Sunday of current week in YYYYMMDD format (Manila timezone).
 *
 * Used for weekly attendance tracking. The week starts on Sunday and this
 * function calculates the date of the most recent Sunday (or today if today
 * is Sunday).
 *
 * @function getSundayOfWeek
 * @returns {string} Sunday date in YYYYMMDD format (e.g., "20251029")
 *
 * @example
 * // If today is Thursday, Oct 31, 2025
 * const sunday = getSundayOfWeek();
 * console.log(sunday); // "20251026" (Sunday of that week)
 */
function getSundayOfWeek() {
  // Use cached Manila time conversion for performance (v6.2 optimization)
  const { getManilaTime } = require('./timestamp-cache');
  const manilaTime = getManilaTime();

  // Calculate Sunday of the current week
  // getDay() returns 0 for Sunday, 1 for Monday, etc.
  const sunday = new Date(manilaTime);
  sunday.setDate(sunday.getDate() - sunday.getDay());

  // Format as YYYYMMDD
  const year = sunday.getFullYear();
  const month = String(sunday.getMonth() + 1).padStart(2, "0");
  const day = String(sunday.getDate()).padStart(2, "0");

  return `${year}${month}${day}`;
}

/**
 * Format milliseconds into human-readable uptime string.
 *
 * Converts milliseconds to a friendly format showing days, hours, minutes,
 * and seconds. Automatically selects the most appropriate unit based on
 * the duration.
 *
 * @function formatUptime
 * @param {number} ms - Duration in milliseconds
 * @returns {string} Formatted uptime string
 *
 * @example
 * formatUptime(1000);           // "1s"
 * formatUptime(65000);          // "1m 5s"
 * formatUptime(3665000);        // "1h 1m 5s"
 * formatUptime(90061000);       // "1d 1h 1m"
 */
function formatUptime(ms) {
  // Convert milliseconds to seconds, minutes, hours, days
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  // Format based on the largest non-zero unit
  if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
  if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

/**
 * Normalize timestamp to MM/DD/YY HH:MM format for comparison.
 *
 * This function handles multiple timestamp formats from different sources:
 * - Bot format: "10/29/25 09:22" (already normalized)
 * - Non-padded format: "1/5/25 9:22" (needs zero-padding)
 * - Google Sheets format: "Tue Oct 28 2025 18:10:00 GMT+0800 (Philippine Standard Time)"
 * - JavaScript Date objects
 *
 * All timestamps are converted to Manila timezone (Asia/Manila) to ensure
 * consistency with game server time. This is critical for matching spawn
 * threads and attendance records.
 *
 * @function normalizeTimestamp
 * @param {string|Date} timestamp - Timestamp in any supported format
 * @returns {string|null} Normalized timestamp in MM/DD/YY HH:MM format, or null if invalid
 *
 * @example
 * normalizeTimestamp("10/29/25 09:22");     // "10/29/25 09:22"
 * normalizeTimestamp("1/5/25 9:22");        // "01/05/25 09:22"
 * normalizeTimestamp(new Date());           // "10/29/25 09:22"
 * normalizeTimestamp("invalid");            // null
 */
function normalizeTimestamp(timestamp) {
  if (!timestamp) return null;

  const str = timestamp.toString().trim();

  // Check if already in STRICT MM/DD/YY HH:MM format (must be zero-padded)
  // This regex requires exactly 2 digits for MM, DD, YY, HH, and MM
  // Example: "10/29/25 09:22" ✓, "1/5/25 9:22" ✗
  if (/^\d{2}\/\d{2}\/\d{2}\s+\d{2}:\d{2}$/.test(str)) {
    return str; // Already normalized, return as-is
  }

  // Try to parse as Date (for Google Sheets format or non-padded timestamps)
  try {
    const date = new Date(str);

    // Check if date is valid
    if (isNaN(date.getTime())) return null;

    // Convert to Manila timezone (critical for consistency)
    const manilaTime = new Date(date.toLocaleString("en-US", { timeZone: "Asia/Manila" }));

    // Extract and zero-pad all components
    const month = String(manilaTime.getMonth() + 1).padStart(2, "0");
    const day = String(manilaTime.getDate()).padStart(2, "0");
    const year = String(manilaTime.getFullYear()).slice(-2); // Last 2 digits
    const hours = String(manilaTime.getHours()).padStart(2, "0");
    const mins = String(manilaTime.getMinutes()).padStart(2, "0");

    return `${month}/${day}/${year} ${hours}:${mins}`;
  } catch (e) {
    // Invalid date format
    return null;
  }
}

// ============================================================================
// THREAD NAME PARSING
// ============================================================================

/**
 * Parse thread name format: [MM/DD/YY HH:MM] Boss Name.
 *
 * Extracts timestamp and boss name from spawn thread names. Thread names
 * follow a strict format where the timestamp is enclosed in square brackets
 * followed by the boss name.
 *
 * @function parseThreadName
 * @param {string} name - Thread name to parse
 * @returns {Object|null} Parsed components or null if format doesn't match
 * @returns {string} returns.date - Date portion (MM/DD/YY)
 * @returns {string} returns.time - Time portion (HH:MM)
 * @returns {string} returns.timestamp - Full timestamp (MM/DD/YY HH:MM)
 * @returns {string} returns.boss - Boss name
 *
 * @example
 * const parsed = parseThreadName("[10/29/25 09:22] Balrog");
 * // {
 * //   date: "10/29/25",
 * //   time: "09:22",
 * //   timestamp: "10/29/25 09:22",
 * //   boss: "Balrog"
 * // }
 *
 * parseThreadName("Invalid format"); // null
 */
function parseThreadName(name) {
  // Regex pattern: [date time] boss
  // Group 1: date (MM/DD/YY)
  // Group 2: time (HH:MM)
  // Group 3: boss name
  const match = name.match(/^\[(.*?)\s+(.*?)\]\s+(.+)$/);

  if (!match) return null; // Invalid format

  return {
    date: match[1],
    time: match[2],
    timestamp: `${match[1]} ${match[2]}`,
    boss: match[3],
  };
}

// ============================================================================
// BOSS NAME MATCHING
// ============================================================================

/**
 * Find boss match with fuzzy matching (with caching for performance).
 *
 * Attempts to match user input to a boss name using multiple strategies:
 * 1. Exact match (case-insensitive)
 * 2. Alias match (checks boss aliases)
 * 3. Partial match (substring matching)
 * 4. Fuzzy match (Levenshtein distance)
 *
 * Results are cached for improved performance. This function delegates to
 * the cache-manager module which handles the actual matching logic.
 *
 * @function findBossMatch
 * @param {string} input - User input boss name (may be partial or misspelled)
 * @param {Object} bossPoints - Boss points database with aliases
 * @returns {string|null} Matched boss name or null if no match found
 *
 * @example
 * findBossMatch("balrog", bossPoints);     // "Balrog"
 * findBossMatch("bal", bossPoints);        // "Balrog" (partial match)
 * findBossMatch("balrg", bossPoints);      // "Balrog" (fuzzy match)
 * findBossMatch("invalid", bossPoints);    // null
 *
 * @see {@link module:utils/cache-manager.findBossMatchCached}
 */
function findBossMatch(input, bossPoints) {
  // Delegate to cached version for better performance
  // The cache-manager handles all the fuzzy matching logic
  return findBossMatchCached(input, bossPoints);
}

// ============================================================================
// COMPARISON UTILITIES
// ============================================================================

/**
 * Check if two timestamps match after normalization.
 *
 * Normalizes both timestamps to MM/DD/YY HH:MM format in Manila timezone
 * before comparing. This ensures timestamps from different sources (bot,
 * Google Sheets, etc.) are compared correctly.
 *
 * @function timestampsMatch
 * @param {string|Date} ts1 - First timestamp (any supported format)
 * @param {string|Date} ts2 - Second timestamp (any supported format)
 * @returns {boolean} True if timestamps match after normalization
 *
 * @example
 * timestampsMatch("10/29/25 09:22", "10/29/25 09:22");  // true
 * timestampsMatch("1/5/25 9:22", "01/05/25 09:22");     // true (normalized)
 * timestampsMatch("10/29/25 09:22", "10/29/25 10:22");  // false
 * timestampsMatch("invalid", "10/29/25 09:22");         // false
 */
function timestampsMatch(ts1, ts2) {
  const normalized1 = normalizeTimestamp(ts1);
  const normalized2 = normalizeTimestamp(ts2);

  // Both must be valid and equal after normalization
  return normalized1 && normalized2 && normalized1 === normalized2;
}

/**
 * Check if two boss names match (case-insensitive).
 *
 * Performs a case-insensitive comparison of boss names. This is used when
 * exact matching is required (as opposed to fuzzy matching).
 *
 * @function bossNamesMatch
 * @param {string} boss1 - First boss name
 * @param {string} boss2 - Second boss name
 * @returns {boolean} True if boss names match (case-insensitive)
 *
 * @example
 * bossNamesMatch("Balrog", "balrog");    // true
 * bossNamesMatch("Balrog", "BALROG");    // true
 * bossNamesMatch("Balrog", "Papulatus"); // false
 * bossNamesMatch(null, "Balrog");        // false
 */
function bossNamesMatch(boss1, boss2) {
  // Handle null/undefined cases
  if (!boss1 || !boss2) return false;

  // Case-insensitive comparison
  return boss1.toUpperCase() === boss2.toUpperCase();
}

/**
 * Normalize username for comparison.
 *
 * Applies consistent normalization rules to usernames for reliable matching:
 * 1. Converts to lowercase
 * 2. Trims leading/trailing whitespace
 * 3. Replaces multiple consecutive spaces with single space
 * 4. Removes special characters (keeping only alphanumeric and spaces)
 *
 * This ensures usernames like "John Doe", "john doe", and "john  doe" are
 * all treated as the same user.
 *
 * @function normalizeUsername
 * @param {string} username - Username to normalize
 * @returns {string} Normalized username
 *
 * @example
 * normalizeUsername("John Doe");       // "john doe"
 * normalizeUsername("  john  doe  ");  // "john doe"
 * normalizeUsername("John-Doe");       // "johndoe"
 * normalizeUsername("JOHN DOE");       // "john doe"
 * normalizeUsername("");               // ""
 * normalizeUsername(null);             // ""
 */
function normalizeUsername(username) {
  if (!username) return '';

  return username
    .toString()
    .toLowerCase()                  // Convert to lowercase
    .trim()                         // Remove leading/trailing whitespace
    .replace(/\s+/g, ' ')          // Replace multiple spaces with single space
    .replace(/[^\w\s]/g, '');      // Remove special characters (keep alphanumeric and spaces)
}

// ============================================================================
// ASYNC UTILITIES
// ============================================================================

/**
 * Sleep for specified milliseconds.
 *
 * Returns a Promise that resolves after the specified delay. Useful for
 * rate limiting, adding delays between operations, or implementing retry
 * logic with backoff.
 *
 * @function sleep
 * @param {number} ms - Duration to sleep in milliseconds
 * @returns {Promise<void>} Promise that resolves after the delay
 *
 * @example
 * // Wait 2 seconds before next operation
 * await sleep(2000);
 * console.log("2 seconds later...");
 *
 * // Rate limiting API calls
 * for (const item of items) {
 *   await processItem(item);
 *   await sleep(1000); // Wait 1 second between calls
 * }
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// ERROR LOGGING AND NOTIFICATIONS
// ============================================================================

/**
 * Log error to admin channel with formatted embed.
 *
 * Sends a rich error notification to the designated admin channel with:
 * - Error title and description
 * - Error message and stack trace
 * - Additional context (if provided)
 *
 * This function includes robust error handling to prevent failures in the
 * error logging system from cascading. If the admin channel is unavailable
 * or the message fails to send, the error is logged to console instead.
 *
 * @function logErrorToAdmin
 * @async
 * @param {Object} client - Discord.js client instance
 * @param {string} adminChannelId - Admin channel ID (snowflake)
 * @param {Object} options - Error details and context
 * @param {string} options.title - Error title (brief description)
 * @param {string} options.description - Detailed error description
 * @param {Error} [options.error] - Error object (optional)
 * @param {Object} [options.context] - Additional context data (optional)
 * @returns {Promise<void>}
 *
 * @example
 * try {
 *   await riskyOperation();
 * } catch (error) {
 *   await logErrorToAdmin(client, adminChannelId, {
 *     title: 'Failed to process bid',
 *     description: 'Error occurred while processing user bid',
 *     error: error,
 *     context: { userId: '123456', bossName: 'Balrog' }
 *   });
 * }
 */
async function logErrorToAdmin(client, adminChannelId, options) {
  try {
    // Validate required parameters
    if (!client || !adminChannelId) {
      console.warn('⚠️ Cannot log to admin channel: missing client or channel ID');
      return;
    }

    const { title, description, error, context } = options;

    // Get guild (assumes bot is in one guild)
    const guild = client.guilds.cache.first();
    if (!guild) {
      console.warn('⚠️ Cannot log to admin channel: no guild found');
      return;
    }

    // Fetch admin channel
    const adminChannel = await guild.channels.fetch(adminChannelId).catch(() => null);
    if (!adminChannel) {
      console.warn('⚠️ Cannot log to admin channel: channel not found');
      return;
    }

    // Build error embed
    const embed = {
      color: 0xFF0000, // Red for errors
      title: `❌ ${title}`,
      description: description || 'An error occurred',
      fields: [],
      timestamp: new Date().toISOString(),
    };

    // Add error message field if error provided
    if (error) {
      embed.fields.push({
        name: 'Error Message',
        value: `\`\`\`${error.message || 'Unknown error'}\`\`\``,
        inline: false,
      });

      // Add stack trace if available (limited to 1000 chars for Discord)
      if (error.stack) {
        const stackTrace = error.stack.slice(0, 1000);
        embed.fields.push({
          name: 'Stack Trace',
          value: `\`\`\`${stackTrace}\`\`\``,
          inline: false,
        });
      }
    }

    // Add context field if provided
    if (context) {
      const contextStr = JSON.stringify(context, null, 2).slice(0, 1000);
      embed.fields.push({
        name: 'Context',
        value: `\`\`\`json\n${contextStr}\`\`\``,
        inline: false,
      });
    }

    // Send embed to admin channel
    await adminChannel.send({ embeds: [embed] }).catch(err => {
      console.error('❌ Failed to send error log to admin channel:', err);
    });
  } catch (err) {
    // Fail silently to prevent error logging from causing additional errors
    console.error('❌ Error in logErrorToAdmin:', err);
  }
}

// ============================================================================
// MODULE EXPORTS
// ============================================================================

/**
 * Exported utility functions and constants.
 *
 * This module provides essential utilities used throughout the bot:
 * - Timestamp handling and formatting (Manila timezone)
 * - Boss name fuzzy matching with caching
 * - Username normalization for reliable comparison
 * - Error logging and admin notifications
 * - General helper functions (sleep, formatUptime, etc.)
 *
 * All exported functions are stateless and can be safely called from
 * multiple modules concurrently.
 */
module.exports = {
  // Timestamp and Date Utilities
  getCurrentTimestamp,
  getSundayOfWeek,
  formatUptime,
  normalizeTimestamp,

  // Thread Name Parsing
  parseThreadName,

  // Boss Name Matching
  findBossMatch,

  // Comparison Utilities
  timestampsMatch,
  bossNamesMatch,
  normalizeUsername,

  // Async Utilities
  sleep,

  // Error Logging
  logErrorToAdmin,

  // Re-exported Constants
  TIMING_ENHANCED,
  COLORS,
  EMOJIS,
  CONSTANTS: constants,
};
