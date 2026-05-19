/**
 * ============================================================================
 * SHUTDOWN MANAGER - Graceful Bot Shutdown Handler
 * ============================================================================
 *
 * PURPOSE:
 * Manages graceful shutdown of the bot by cleaning up all resources:
 * - Clears all active timers (setInterval/setTimeout)
 * - Closes database connections
 * - Destroys Discord client connection
 * - Runs custom cleanup handlers
 *
 * FIXES: CRIT-001 - Memory Leak from uncleaned timers
 *
 * @module utils/shutdown-manager
 * @version 1.0.0
 */

const { createLogger } = require('./logger');
const logger = createLogger('shutdown');

class ShutdownManager {
  constructor() {
    this.timers = new Map();
    this.intervals = new Map();
    this.cleanupHandlers = [];
    this.isShuttingDown = false;
    this.shutdownTimeout = 30000; // 30 seconds max shutdown time
  }

  /**
   * Register a setTimeout timer for cleanup
   * @param {string} name - Descriptive name for the timer
   * @param {NodeJS.Timeout} timerId - Timer ID from setTimeout
   * @param {Object} metadata - Optional metadata for debugging
   */
  registerTimeout(name, timerId, metadata = {}) {
    this.timers.set(name, {
      id: timerId,
      type: 'timeout',
      registeredAt: new Date(),
      metadata
    });
    logger.debug(`Registered timeout: ${name}`, metadata);
  }

  /**
   * Register a setInterval timer for cleanup
   * @param {string} name - Descriptive name for the interval
   * @param {NodeJS.Timeout} intervalId - Interval ID from setInterval
   * @param {Object} metadata - Optional metadata for debugging
   */
  registerInterval(name, intervalId, metadata = {}) {
    this.intervals.set(name, {
      id: intervalId,
      type: 'interval',
      registeredAt: new Date(),
      metadata
    });
    logger.debug(`Registered interval: ${name}`, metadata);
  }

  /**
   * Unregister and clear a specific timer
   * @param {string} name - Name of the timer to clear
   * @returns {boolean} True if timer was found and cleared
   */
  clearTimer(name) {
    // Check timeouts
    if (this.timers.has(name)) {
      const timer = this.timers.get(name);
      clearTimeout(timer.id);
      this.timers.delete(name);
      logger.debug(`Cleared timeout: ${name}`);
      return true;
    }

    // Check intervals
    if (this.intervals.has(name)) {
      const interval = this.intervals.get(name);
      clearInterval(interval.id);
      this.intervals.delete(name);
      logger.debug(`Cleared interval: ${name}`);
      return true;
    }

    logger.warn(`Timer not found: ${name}`);
    return false;
  }

  /**
   * Register a custom cleanup handler
   * @param {string} name - Descriptive name for the handler
   * @param {Function} handler - Async function to run during shutdown
   * @param {number} priority - Priority (lower = earlier, default 100)
   */
  registerCleanup(name, handler, priority = 100) {
    this.cleanupHandlers.push({
      name,
      handler,
      priority,
      registeredAt: new Date()
    });

    // Sort by priority (lower priority runs first)
    this.cleanupHandlers.sort((a, b) => a.priority - b.priority);

    logger.debug(`Registered cleanup handler: ${name} (priority: ${priority})`);
  }

  /**
   * Get current status of registered timers
   * @returns {Object} Status summary
   */
  getStatus() {
    return {
      timeouts: this.timers.size,
      intervals: this.intervals.size,
      cleanupHandlers: this.cleanupHandlers.length,
      isShuttingDown: this.isShuttingDown,
      timers: {
        timeouts: Array.from(this.timers.keys()),
        intervals: Array.from(this.intervals.keys())
      },
      handlers: this.cleanupHandlers.map(h => ({
        name: h.name,
        priority: h.priority
      }))
    };
  }

  /**
   * Perform graceful shutdown
   * @param {string} signal - Signal that triggered shutdown (SIGTERM, SIGINT, etc.)
   */
  async shutdown(signal = 'UNKNOWN') {
    if (this.isShuttingDown) {
      logger.warn('Shutdown already in progress, ignoring duplicate signal');
      return;
    }

    this.isShuttingDown = true;
    const startTime = Date.now();

    logger.info('╔════════════════════════════════════════════════════════╗');
    logger.info('║          GRACEFUL SHUTDOWN INITIATED                   ║');
    logger.info('╚════════════════════════════════════════════════════════╝');
    logger.info(`Signal: ${signal}`);
    logger.info(`Timestamp: ${new Date().toISOString()}`);

    // Set a hard timeout for shutdown
    const shutdownTimeoutTimer = setTimeout(() => {
      logger.error(`⚠️ Shutdown timeout (${this.shutdownTimeout}ms) - forcing exit`);
      process.exit(1);
    }, this.shutdownTimeout);

    try {
      // Step 1: Clear all timers
      logger.info('\n📍 Step 1/3: Clearing timers...');
      await this.clearAllTimers();

      // Step 2: Run cleanup handlers
      logger.info('\n📍 Step 2/3: Running cleanup handlers...');
      await this.runCleanupHandlers();

      // Step 3: Final cleanup
      logger.info('\n📍 Step 3/3: Final cleanup...');
      clearTimeout(shutdownTimeoutTimer);

      const duration = Date.now() - startTime;
      logger.info('\n╔════════════════════════════════════════════════════════╗');
      logger.info('║          SHUTDOWN COMPLETE                             ║');
      logger.info('╚════════════════════════════════════════════════════════╝');
      logger.info(`Duration: ${duration}ms`);
      logger.info('Goodbye! 👋');

      // Give logs time to flush
      await new Promise(resolve => setTimeout(resolve, 500));

      // Exit cleanly
      process.exit(0);

    } catch (error) {
      logger.error('❌ Error during shutdown:', error);
      clearTimeout(shutdownTimeoutTimer);
      process.exit(1);
    }
  }

  /**
   * Clear all registered timers
   */
  async clearAllTimers() {
    let clearedTimeouts = 0;
    let clearedIntervals = 0;

    // Clear all setTimeout timers
    for (const [name, timer] of this.timers.entries()) {
      try {
        clearTimeout(timer.id);
        clearedTimeouts++;
        logger.debug(`  ✓ Cleared timeout: ${name}`);
      } catch (error) {
        logger.warn(`  ✗ Failed to clear timeout ${name}:`, error.message);
      }
    }

    // Clear all setInterval timers
    for (const [name, interval] of this.intervals.entries()) {
      try {
        clearInterval(interval.id);
        clearedIntervals++;
        logger.debug(`  ✓ Cleared interval: ${name}`);
      } catch (error) {
        logger.warn(`  ✗ Failed to clear interval ${name}:`, error.message);
      }
    }

    this.timers.clear();
    this.intervals.clear();

    logger.info(`  ✅ Cleared ${clearedTimeouts} timeouts and ${clearedIntervals} intervals`);
  }

  /**
   * Run all registered cleanup handlers
   */
  async runCleanupHandlers() {
    let successCount = 0;
    let failureCount = 0;

    for (const { name, handler, priority } of this.cleanupHandlers) {
      try {
        logger.info(`  🔄 Running: ${name} (priority: ${priority})...`);
        const startTime = Date.now();

        await handler();

        const duration = Date.now() - startTime;
        logger.info(`  ✅ ${name} completed (${duration}ms)`);
        successCount++;

      } catch (error) {
        logger.error(`  ❌ ${name} failed:`, error.message);
        failureCount++;
        // Continue with other handlers even if one fails
      }
    }

    logger.info(`  📊 Results: ${successCount} succeeded, ${failureCount} failed`);
  }

  /**
   * Initialize signal handlers
   * NOTE: Signal handling is now delegated to dedicated modules:
   *   - Process error handlers (uncaughtException, unhandledRejection) -> bot/events/error-handlers.js
   *   - Termination signals (SIGTERM, SIGINT)                          -> bot/shutdown.js
   *
   * This method remains as a no-op to avoid breaking existing callers.
   * The shutdown() method can be called directly by any module.
   */
  initialize() {
    logger.info('✅ Shutdown manager initialized (signal handling delegated to bot modules)');
  }

  /**
   * Get debug information about all registered timers
   */
  debugTimers() {
    const info = {
      summary: {
        timeouts: this.timers.size,
        intervals: this.intervals.size,
        handlers: this.cleanupHandlers.length
      },
      timeouts: [],
      intervals: [],
      handlers: []
    };

    // Get timeout details
    for (const [name, timer] of this.timers.entries()) {
      info.timeouts.push({
        name,
        registeredAt: timer.registeredAt,
        metadata: timer.metadata
      });
    }

    // Get interval details
    for (const [name, interval] of this.intervals.entries()) {
      info.intervals.push({
        name,
        registeredAt: interval.registeredAt,
        metadata: interval.metadata
      });
    }

    // Get handler details
    for (const handler of this.cleanupHandlers) {
      info.handlers.push({
        name: handler.name,
        priority: handler.priority,
        registeredAt: handler.registeredAt
      });
    }

    return info;
  }
}

// Export singleton instance
const shutdownManager = new ShutdownManager();

module.exports = shutdownManager;
