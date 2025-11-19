/**
 * ============================================================================
 * TIMER REGISTRY
 * ============================================================================
 *
 * Centralized registry for tracking all active timers in the bot.
 * Enables proper cleanup on shutdown to prevent memory leaks and
 * zombie timers.
 *
 * Use this module instead of raw setTimeout/setInterval when you need
 * timers that should be cleaned up on bot shutdown.
 *
 * @module utils/timer-registry
 * @author Elysium Attendance Bot Team
 * @version 1.0
 * ============================================================================
 */

// ============================================================================
// TIMER STORAGE
// ============================================================================

/**
 * Map of all active timers
 * @type {Map<string, {type: string, timer: NodeJS.Timeout, context: string}>}
 */
const activeTimers = new Map();

/**
 * Counter for generating unique timer IDs
 * @type {number}
 */
let timerCounter = 0;

// ============================================================================
// TIMER CREATION FUNCTIONS
// ============================================================================

/**
 * Create a tracked setTimeout
 *
 * @param {Function} callback - Function to execute
 * @param {number} delay - Delay in milliseconds
 * @param {string} [context='unknown'] - Description for debugging
 * @returns {string} Timer ID for cancellation
 *
 * @example
 * const timerId = createTimeout(() => {
 *   console.log('Executed after 5s');
 * }, 5000, 'auction countdown');
 *
 * // Later, to cancel:
 * clearTrackedTimer(timerId);
 */
function createTimeout(callback, delay, context = 'unknown') {
  const id = `timeout_${++timerCounter}`;

  const wrappedCallback = () => {
    activeTimers.delete(id);
    callback();
  };

  const timer = setTimeout(wrappedCallback, delay);

  activeTimers.set(id, {
    type: 'timeout',
    timer,
    context,
    createdAt: Date.now(),
    delay
  });

  return id;
}

/**
 * Create a tracked setInterval
 *
 * @param {Function} callback - Function to execute
 * @param {number} interval - Interval in milliseconds
 * @param {string} [context='unknown'] - Description for debugging
 * @returns {string} Timer ID for cancellation
 *
 * @example
 * const timerId = createInterval(() => {
 *   console.log('Executed every 30s');
 * }, 30000, 'status update');
 *
 * // Later, to cancel:
 * clearTrackedTimer(timerId);
 */
function createInterval(callback, interval, context = 'unknown') {
  const id = `interval_${++timerCounter}`;

  const timer = setInterval(callback, interval);

  activeTimers.set(id, {
    type: 'interval',
    timer,
    context,
    createdAt: Date.now(),
    interval
  });

  return id;
}

// ============================================================================
// TIMER CANCELLATION FUNCTIONS
// ============================================================================

/**
 * Clear a tracked timer by ID
 *
 * @param {string} id - Timer ID returned by createTimeout/createInterval
 * @returns {boolean} True if timer was found and cleared
 *
 * @example
 * clearTrackedTimer('timeout_42');
 */
function clearTrackedTimer(id) {
  const timerInfo = activeTimers.get(id);

  if (!timerInfo) {
    return false;
  }

  if (timerInfo.type === 'timeout') {
    clearTimeout(timerInfo.timer);
  } else {
    clearInterval(timerInfo.timer);
  }

  activeTimers.delete(id);
  return true;
}

/**
 * Clear all timers matching a context pattern
 *
 * @param {string} contextPattern - Substring to match in timer context
 * @returns {number} Number of timers cleared
 *
 * @example
 * // Clear all auction-related timers
 * clearTimersByContext('auction');
 */
function clearTimersByContext(contextPattern) {
  let cleared = 0;

  for (const [id, timerInfo] of activeTimers.entries()) {
    if (timerInfo.context.includes(contextPattern)) {
      if (timerInfo.type === 'timeout') {
        clearTimeout(timerInfo.timer);
      } else {
        clearInterval(timerInfo.timer);
      }
      activeTimers.delete(id);
      cleared++;
    }
  }

  return cleared;
}

/**
 * Clear ALL tracked timers (use on shutdown)
 *
 * @returns {number} Number of timers cleared
 *
 * @example
 * // In shutdown handler:
 * const count = clearAllTimers();
 * console.log(`Cleared ${count} timers`);
 */
function clearAllTimers() {
  let cleared = 0;

  for (const [id, timerInfo] of activeTimers.entries()) {
    if (timerInfo.type === 'timeout') {
      clearTimeout(timerInfo.timer);
    } else {
      clearInterval(timerInfo.timer);
    }
    cleared++;
  }

  activeTimers.clear();

  if (cleared > 0) {
    console.log(`🧹 [TIMER-REGISTRY] Cleared ${cleared} timer(s) on shutdown`);
  }

  return cleared;
}

// ============================================================================
// TIMER INFORMATION FUNCTIONS
// ============================================================================

/**
 * Get statistics about active timers
 *
 * @returns {Object} Timer statistics
 *
 * @example
 * const stats = getTimerStats();
 * console.log(`Active timers: ${stats.total}`);
 */
function getTimerStats() {
  const stats = {
    total: activeTimers.size,
    timeouts: 0,
    intervals: 0,
    byContext: {}
  };

  for (const timerInfo of activeTimers.values()) {
    if (timerInfo.type === 'timeout') {
      stats.timeouts++;
    } else {
      stats.intervals++;
    }

    // Group by context
    const contextKey = timerInfo.context.split(' ')[0]; // First word
    stats.byContext[contextKey] = (stats.byContext[contextKey] || 0) + 1;
  }

  return stats;
}

/**
 * Get list of all active timers (for debugging)
 *
 * @returns {Array} Array of timer info objects
 */
function getActiveTimers() {
  const timers = [];

  for (const [id, timerInfo] of activeTimers.entries()) {
    timers.push({
      id,
      type: timerInfo.type,
      context: timerInfo.context,
      createdAt: timerInfo.createdAt,
      age: Date.now() - timerInfo.createdAt
    });
  }

  return timers.sort((a, b) => a.createdAt - b.createdAt);
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // Creation
  createTimeout,
  createInterval,

  // Cancellation
  clearTrackedTimer,
  clearTimersByContext,
  clearAllTimers,

  // Information
  getTimerStats,
  getActiveTimers
};
