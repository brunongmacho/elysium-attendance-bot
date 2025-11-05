/**
 * ============================================================================
 * ERROR HANDLING UTILITY MODULE
 * ============================================================================
 *
 * Provides centralized error handling and logging utilities for the bot.
 * This module ensures consistent error reporting across all modules and
 * includes safe wrappers for Discord API operations.
 *
 * Features:
 * - Structured error logging with timestamps and context
 * - Safe wrappers for Discord operations (send, edit, delete, react)
 * - Different log levels (ERROR, WARN, INFO, DEBUG, SUCCESS)
 * - Async function error handling wrappers
 * - Graceful error handling to prevent bot crashes
 *
 * All logging functions include:
 * - ISO timestamp for tracking
 * - Contextual metadata for debugging
 * - Structured formatting for readability
 *
 * @module utils/error-handler
 * @author Elysium Attendance Bot Team
 * @version 2.0
 * ============================================================================
 */

// ============================================================================
// LOG LEVELS
// ============================================================================

/**
 * Log levels for different types of errors and messages.
 *
 * These emoji-based log levels make it easy to visually scan logs
 * and identify issues quickly.
 *
 * @constant {Object} LOG_LEVELS
 * @property {string} ERROR - Critical errors (❌)
 * @property {string} WARN - Warnings (⚠️)
 * @property {string} INFO - Informational messages (ℹ️)
 * @property {string} DEBUG - Debug messages (🔍)
 * @property {string} SUCCESS - Success messages (✅)
 */
const LOG_LEVELS = {
  ERROR: '❌',
  WARN: '⚠️',
  INFO: 'ℹ️',
  DEBUG: '🔍',
  SUCCESS: '✅'
};

// ============================================================================
// ERROR HANDLING FUNCTIONS
// ============================================================================

/**
 * Safe error handler that logs errors properly instead of silently catching them.
 *
 * This is the core error handling function. It formats and logs errors with
 * context and metadata, making debugging much easier. By default, errors are
 * logged but not re-thrown (silent mode), preventing bot crashes while
 * maintaining visibility into issues.
 *
 * @function handleError
 * @param {Error} error - The error object to handle
 * @param {string} context - Context where the error occurred (e.g., "bid processing")
 * @param {Object} [options={}] - Additional options
 * @param {boolean} [options.silent=true] - If true, only log to console (don't re-throw)
 * @param {Object} [options.metadata={}] - Additional metadata to include in log
 * @returns {void}
 *
 * @example
 * try {
 *   await riskyOperation();
 * } catch (error) {
 *   handleError(error, 'riskyOperation', {
 *     silent: true,
 *     metadata: { userId: '123456', action: 'bid' }
 *   });
 * }
 */
function handleError(error, context, options = {}) {
  const { silent = true, metadata = {} } = options;

  // Extract error details
  const timestamp = new Date().toISOString();
  const errorMessage = error?.message || 'Unknown error';
  const errorStack = error?.stack || '';

  // Build structured log message
  const logMessage = [
    `${LOG_LEVELS.ERROR} [${timestamp}] Error in ${context}:`,
    `  Message: ${errorMessage}`,
    // Include metadata if provided
    metadata && Object.keys(metadata).length > 0
      ? `  Metadata: ${JSON.stringify(metadata, null, 2)}`
      : '',
    // Include first 3 lines of stack trace for context
    errorStack ? `  Stack: ${errorStack.split('\n').slice(0, 3).join('\n')}` : ''
  ].filter(Boolean).join('\n');

  // Log to console
  console.error(logMessage);

  // Re-throw if not silent (useful for critical errors)
  if (!silent) {
    throw error;
  }
}

/**
 * Creates a safe catch handler for promises.
 *
 * Returns a function that can be used as a `.catch()` handler. This is a
 * convenience wrapper around handleError for use with promise chains.
 *
 * @function safeCatch
 * @param {string} context - Context where the error might occur
 * @param {Object} [options={}] - Additional options to pass to handleError
 * @returns {Function} Error handler function for use with .catch()
 *
 * @example
 * fetchData()
 *   .then(processData)
 *   .catch(safeCatch('data processing', { metadata: { source: 'api' } }));
 */
function safeCatch(context, options = {}) {
  return (error) => handleError(error, context, { silent: true, ...options });
}

/**
 * Wraps an async function with automatic error handling.
 *
 * Creates a new function that wraps the original async function with try-catch
 * error handling. If an error occurs, it's logged via handleError and a default
 * value is returned instead of throwing.
 *
 * This is useful for wrapping entire functions that should never crash the bot.
 *
 * @function wrapAsync
 * @param {Function} fn - Async function to wrap
 * @param {string} context - Context for error logging
 * @param {Object} [options={}] - Additional options
 * @param {*} [options.defaultValue=null] - Value to return on error
 * @returns {Function} Wrapped function with error handling
 *
 * @example
 * const safeProcessBid = wrapAsync(processBid, 'bid processing', {
 *   defaultValue: false,
 *   metadata: { feature: 'auction' }
 * });
 *
 * const result = await safeProcessBid(userId, amount); // Never throws
 */
function wrapAsync(fn, context, options = {}) {
  return async function(...args) {
    try {
      return await fn.apply(this, args);
    } catch (error) {
      handleError(error, context, options);
      // Return default value on error (null if not specified)
      return options.defaultValue !== undefined ? options.defaultValue : null;
    }
  };
}

// ============================================================================
// LOGGING FUNCTIONS (INFO, WARN, SUCCESS, DEBUG)
// ============================================================================

/**
 * Logs a warning message with timestamp and metadata.
 *
 * Use for non-critical issues that should be investigated but don't
 * prevent normal operation.
 *
 * @function warn
 * @param {string} message - Warning message
 * @param {Object} [metadata={}] - Additional metadata to include
 * @returns {void}
 *
 * @example
 * warn('Cache miss - falling back to fresh fetch', {
 *   key: 'boss-data',
 *   retryAttempt: 1
 * });
 */
function warn(message, metadata = {}) {
  const timestamp = new Date().toISOString();
  const logMessage = [
    `${LOG_LEVELS.WARN} [${timestamp}] ${message}`,
    metadata && Object.keys(metadata).length > 0
      ? `  Metadata: ${JSON.stringify(metadata, null, 2)}`
      : ''
  ].filter(Boolean).join('\n');

  console.warn(logMessage);
}

/**
 * Logs an informational message with timestamp and metadata.
 *
 * Use for general informational logging about normal operations.
 *
 * @function info
 * @param {string} message - Info message
 * @param {Object} [metadata={}] - Additional metadata to include
 * @returns {void}
 *
 * @example
 * info('Auction started', {
 *   bossName: 'Balrog',
 *   startingBid: 100,
 *   duration: 300000
 * });
 */
function info(message, metadata = {}) {
  const timestamp = new Date().toISOString();
  const logMessage = [
    `${LOG_LEVELS.INFO} [${timestamp}] ${message}`,
    metadata && Object.keys(metadata).length > 0
      ? `  Metadata: ${JSON.stringify(metadata, null, 2)}`
      : ''
  ].filter(Boolean).join('\n');

  console.log(logMessage);
}

/**
 * Logs a success message with timestamp and metadata.
 *
 * Use for confirming successful completion of important operations.
 *
 * @function success
 * @param {string} message - Success message
 * @param {Object} [metadata={}] - Additional metadata to include
 * @returns {void}
 *
 * @example
 * success('Bid processed successfully', {
 *   userId: '123456',
 *   bidAmount: 500,
 *   bossName: 'Balrog'
 * });
 */
function success(message, metadata = {}) {
  const timestamp = new Date().toISOString();
  const logMessage = [
    `${LOG_LEVELS.SUCCESS} [${timestamp}] ${message}`,
    metadata && Object.keys(metadata).length > 0
      ? `  Metadata: ${JSON.stringify(metadata, null, 2)}`
      : ''
  ].filter(Boolean).join('\n');

  console.log(logMessage);
}

/**
 * Logs a debug message with timestamp and metadata (development only).
 *
 * Debug messages are only logged when NODE_ENV is not 'production'.
 * Use for verbose logging during development and testing.
 *
 * @function debug
 * @param {string} message - Debug message
 * @param {Object} [metadata={}] - Additional metadata to include
 * @returns {void}
 *
 * @example
 * debug('Cache lookup performed', {
 *   key: 'boss-match-balrog',
 *   cacheHit: true,
 *   timestamp: Date.now()
 * });
 */
function debug(message, metadata = {}) {
  // Only log in non-production environments
  if (process.env.NODE_ENV !== 'production') {
    const timestamp = new Date().toISOString();
    const logMessage = [
      `${LOG_LEVELS.DEBUG} [${timestamp}] ${message}`,
      metadata && Object.keys(metadata).length > 0
        ? `  Metadata: ${JSON.stringify(metadata, null, 2)}`
        : ''
    ].filter(Boolean).join('\n');

    console.log(logMessage);
  }
}

/**
 * Silent error logger for non-critical operations.
 *
 * Logs errors that occur during non-critical operations (like Discord API
 * cleanup operations) without throwing or causing process interruption.
 * Useful for operations where failure is acceptable but should be logged.
 *
 * @function silentError
 * @param {Error|string} error - Error object or error message
 * @param {string} context - Context where error occurred
 *
 * @example
 * await message.delete().catch((err) => silentError(err, 'message cleanup'));
 * await reaction.users.remove(userId).catch((err) => silentError(err, 'reaction removal'));
 */
function silentError(error, context = 'operation') {
  const errorMsg = error?.message || error || 'Unknown error';
  console.warn(`⚠️ [${context}] ${errorMsg}`);
}

// ============================================================================
// SAFE DISCORD OPERATIONS
// ============================================================================

/**
 * Safe delete operation for Discord messages.
 *
 * Attempts to delete a Discord message with proper error handling. Silently
 * ignores expected errors (archived threads, unknown messages) that occur
 * during normal cleanup operations.
 *
 * @function safeDelete
 * @async
 * @param {Object} message - Discord.js message object
 * @param {string} [context='message deletion'] - Context for error logging
 * @returns {Promise<boolean>} True if deletion succeeded, false otherwise
 *
 * @example
 * const deleted = await safeDelete(message, 'cleanup old messages');
 * if (deleted) {
 *   console.log('Message deleted successfully');
 * }
 */
async function safeDelete(message, context = 'message deletion') {
  try {
    // Validate message object has delete method
    if (message && typeof message.delete === 'function') {
      await message.delete();
      return true;
    }
    return false;
  } catch (error) {
    // Silently ignore expected errors that occur during normal cleanup
    const isExpectedError =
      error?.code === 10008 || // Unknown Message (already deleted)
      error?.code === 50083 || // Thread is archived
      error?.message?.includes('archived') ||
      error?.message?.includes('Unknown Message');

    // Only log unexpected errors
    if (!isExpectedError) {
      handleError(error, context, {
        silent: true,
        metadata: { messageId: message?.id }
      });
    }
    return false;
  }
}

/**
 * Safe reaction remove operation for Discord messages.
 *
 * Removes all reactions from a Discord message with proper error handling.
 * Useful for cleaning up interactive messages after completion.
 *
 * @function safeRemoveReactions
 * @async
 * @param {Object} message - Discord.js message object
 * @param {string} [context='reaction removal'] - Context for error logging
 * @returns {Promise<boolean>} True if removal succeeded, false otherwise
 *
 * @example
 * const removed = await safeRemoveReactions(message, 'cleanup auction reactions');
 * if (removed) {
 *   console.log('Reactions removed successfully');
 * }
 */
async function safeRemoveReactions(message, context = 'reaction removal') {
  try {
    // Check if message has reactions
    if (message?.reactions) {
      await message.reactions.removeAll();
      return true;
    }
    return false;
  } catch (error) {
    handleError(error, context, {
      silent: true,
      metadata: { messageId: message?.id }
    });
    return false;
  }
}

/**
 * Safe message send operation for Discord channels.
 *
 * Sends a message to a Discord channel with proper error handling.
 * Returns the sent message object or null if sending failed.
 *
 * @function safeSend
 * @async
 * @param {Object} channel - Discord.js channel object
 * @param {string|Object} content - Message content (string or MessageOptions)
 * @param {string} [context='message send'] - Context for error logging
 * @returns {Promise<Object|null>} Sent message object or null on failure
 *
 * @example
 * const msg = await safeSend(channel, 'Hello!', 'greeting message');
 * if (msg) {
 *   console.log('Message sent successfully');
 * }
 *
 * const embed = await safeSend(channel, {
 *   embeds: [{ title: 'Auction Started', color: 0x00FF00 }]
 * }, 'auction start notification');
 */
async function safeSend(channel, content, context = 'message send') {
  try {
    // Validate channel object has send method
    if (channel && typeof channel.send === 'function') {
      return await channel.send(content);
    }
    return null;
  } catch (error) {
    handleError(error, context, {
      silent: true,
      metadata: { channelId: channel?.id }
    });
    return null;
  }
}

/**
 * Safe message edit operation for Discord messages.
 *
 * Edits a Discord message with proper error handling. Silently ignores
 * expected errors (archived threads, unknown messages) that may occur
 * during normal operations.
 *
 * @function safeEdit
 * @async
 * @param {Object} message - Discord.js message object
 * @param {string|Object} content - New message content (string or MessageEditOptions)
 * @param {string} [context='message edit'] - Context for error logging
 * @returns {Promise<Object|null>} Edited message object or null on failure
 *
 * @example
 * const edited = await safeEdit(message, 'Updated content', 'auction update');
 * if (edited) {
 *   console.log('Message edited successfully');
 * }
 *
 * const updatedEmbed = await safeEdit(message, {
 *   embeds: [{ title: 'Auction Updated', color: 0x0099FF }]
 * }, 'auction status update');
 */
async function safeEdit(message, content, context = 'message edit') {
  try {
    // Validate message object has edit method
    if (message && typeof message.edit === 'function') {
      return await message.edit(content);
    }
    return null;
  } catch (error) {
    // Silently ignore expected errors that occur during normal operations
    const isExpectedError =
      error?.code === 10008 || // Unknown Message (deleted)
      error?.code === 50083 || // Thread is archived
      error?.message?.includes('archived') ||
      error?.message?.includes('Unknown Message');

    // Only log unexpected errors
    if (!isExpectedError) {
      handleError(error, context, {
        silent: true,
        metadata: { messageId: message?.id }
      });
    }
    return null;
  }
}

/**
 * Safe reaction add operation for Discord messages.
 *
 * Adds a reaction to a Discord message with proper error handling.
 * Useful for interactive messages and confirmation prompts.
 *
 * @function safeReact
 * @async
 * @param {Object} message - Discord.js message object
 * @param {string} emoji - Emoji to react with (Unicode or custom emoji ID)
 * @param {string} [context='reaction add'] - Context for error logging
 * @returns {Promise<boolean>} True if reaction succeeded, false otherwise
 *
 * @example
 * const reacted = await safeReact(message, '✅', 'bid confirmation');
 * if (reacted) {
 *   console.log('Reaction added successfully');
 * }
 */
async function safeReact(message, emoji, context = 'reaction add') {
  try {
    // Validate message object has react method
    if (message && typeof message.react === 'function') {
      await message.react(emoji);
      return true;
    }
    return false;
  } catch (error) {
    handleError(error, context, {
      silent: true,
      metadata: { messageId: message?.id, emoji }
    });
    return false;
  }
}

// ============================================================================
// MODULE EXPORTS
// ============================================================================

/**
 * Exported error handling utilities and safe Discord operations.
 *
 * This module provides:
 * - Core error handling (handleError, safeCatch, wrapAsync)
 * - Logging functions (warn, info, success, debug)
 * - Safe Discord operations (safeDelete, safeSend, safeEdit, safeReact, etc.)
 *
 * All functions handle errors gracefully to prevent bot crashes while
 * maintaining visibility into issues through structured logging.
 */
module.exports = {
  // Log Levels
  LOG_LEVELS,

  // Error Handling
  handleError,
  safeCatch,
  wrapAsync,
  silentError,

  // Logging Functions
  warn,
  info,
  success,
  debug,

  // Safe Discord Operations
  safeDelete,
  safeRemoveReactions,
  safeSend,
  safeEdit,
  safeReact
};
