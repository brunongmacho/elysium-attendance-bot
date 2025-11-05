/**
 * Centralized Error Handling Utility
 * Provides consistent error logging and handling across all modules
 */

/**
 * Log levels for different types of errors
 */
const LOG_LEVELS = {
  ERROR: '❌',
  WARN: '⚠️',
  INFO: 'ℹ️',
  DEBUG: '🔍',
  SUCCESS: '✅'
};

/**
 * Safe error handler that logs errors properly instead of silently catching them
 * @param {Error} error - The error object
 * @param {string} context - Context where the error occurred
 * @param {Object} options - Additional options
 * @param {boolean} options.silent - If true, only log to console (don't throw)
 * @param {Object} options.metadata - Additional metadata to log
 * @returns {void}
 */
function handleError(error, context, options = {}) {
  const { silent = true, metadata = {} } = options;

  const timestamp = new Date().toISOString();
  const errorMessage = error?.message || 'Unknown error';
  const errorStack = error?.stack || '';

  // Format log message
  const logMessage = [
    `${LOG_LEVELS.ERROR} [${timestamp}] Error in ${context}:`,
    `  Message: ${errorMessage}`,
    metadata && Object.keys(metadata).length > 0
      ? `  Metadata: ${JSON.stringify(metadata, null, 2)}`
      : '',
    errorStack ? `  Stack: ${errorStack.split('\n').slice(0, 3).join('\n')}` : ''
  ].filter(Boolean).join('\n');

  console.error(logMessage);

  // Re-throw if not silent
  if (!silent) {
    throw error;
  }
}

/**
 * Creates a safe catch handler for promises
 * @param {string} context - Context where the error might occur
 * @param {Object} options - Additional options
 * @returns {Function} Error handler function
 */
function safeCatch(context, options = {}) {
  return (error) => handleError(error, context, { silent: true, ...options });
}

/**
 * Wraps an async function with error handling
 * @param {Function} fn - Async function to wrap
 * @param {string} context - Context for error logging
 * @param {Object} options - Additional options
 * @returns {Function} Wrapped function
 */
function wrapAsync(fn, context, options = {}) {
  return async function(...args) {
    try {
      return await fn.apply(this, args);
    } catch (error) {
      handleError(error, context, options);
      return options.defaultValue !== undefined ? options.defaultValue : null;
    }
  };
}

/**
 * Logs a warning message
 * @param {string} message - Warning message
 * @param {Object} metadata - Additional metadata
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
 * Logs an info message
 * @param {string} message - Info message
 * @param {Object} metadata - Additional metadata
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
 * Logs a success message
 * @param {string} message - Success message
 * @param {Object} metadata - Additional metadata
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
 * Logs a debug message (only in development)
 * @param {string} message - Debug message
 * @param {Object} metadata - Additional metadata
 */
function debug(message, metadata = {}) {
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
 * Safe delete operation for Discord messages
 * @param {Object} message - Discord message object
 * @param {string} context - Context for error logging
 * @returns {Promise<boolean>} True if successful
 */
async function safeDelete(message, context = 'message deletion') {
  try {
    if (message && typeof message.delete === 'function') {
      await message.delete();
      return true;
    }
    return false;
  } catch (error) {
    // Silently ignore archived thread and unknown message errors (expected during cleanup)
    const isExpectedError =
      error?.code === 10008 || // Unknown Message
      error?.code === 50083 || // Thread is archived
      error?.message?.includes('archived') ||
      error?.message?.includes('Unknown Message');

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
 * Safe reaction remove operation
 * @param {Object} message - Discord message object
 * @param {string} context - Context for error logging
 * @returns {Promise<boolean>} True if successful
 */
async function safeRemoveReactions(message, context = 'reaction removal') {
  try {
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
 * Safe message send operation
 * @param {Object} channel - Discord channel object
 * @param {*} content - Message content
 * @param {string} context - Context for error logging
 * @returns {Promise<Object|null>} Sent message or null
 */
async function safeSend(channel, content, context = 'message send') {
  try {
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
 * Safe message edit operation
 * @param {Object} message - Discord message object
 * @param {*} content - New message content
 * @param {string} context - Context for error logging
 * @returns {Promise<Object|null>} Edited message or null
 */
async function safeEdit(message, content, context = 'message edit') {
  try {
    if (message && typeof message.edit === 'function') {
      return await message.edit(content);
    }
    return null;
  } catch (error) {
    // Silently ignore archived thread and unknown message errors (expected during cleanup)
    const isExpectedError =
      error?.code === 10008 || // Unknown Message
      error?.code === 50083 || // Thread is archived
      error?.message?.includes('archived') ||
      error?.message?.includes('Unknown Message');

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
 * Safe reaction add operation
 * @param {Object} message - Discord message object
 * @param {string} emoji - Emoji to react with
 * @param {string} context - Context for error logging
 * @returns {Promise<boolean>} True if successful
 */
async function safeReact(message, emoji, context = 'reaction add') {
  try {
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

module.exports = {
  LOG_LEVELS,
  handleError,
  safeCatch,
  wrapAsync,
  warn,
  info,
  success,
  debug,
  safeDelete,
  safeRemoveReactions,
  safeSend,
  safeEdit,
  safeReact
};
