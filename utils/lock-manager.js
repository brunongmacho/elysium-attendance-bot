/**
 * Lock Manager for Atomic Operations and Timer Management
 * Prevents race conditions and memory leaks
 */

const { warn, debug, handleError } = require('./error-handler');
const { TIMING } = require('./constants');

/**
 * Async Lock implementation for atomic operations
 */
class AsyncLock {
  constructor(name = 'unnamed') {
    this.name = name;
    this.locked = false;
    this.queue = [];
  }

  /**
   * Acquire lock (waits if already locked)
   * @param {number} timeout - Maximum time to wait for lock (ms)
   * @returns {Promise<Function>} Release function
   */
  async acquire(timeout = 30000) {
    if (!this.locked) {
      this.locked = true;
      debug(`Lock acquired: ${this.name}`);
      return () => this.release();
    }

    // Wait for lock to be released
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        // Remove from queue
        const index = this.queue.findIndex(item => item.resolve === resolve);
        if (index !== -1) {
          this.queue.splice(index, 1);
        }
        reject(new Error(`Lock timeout for ${this.name} after ${timeout}ms`));
      }, timeout);

      this.queue.push({
        resolve: (releaseFn) => {
          clearTimeout(timeoutId);
          resolve(releaseFn);
        },
        reject
      });
    });
  }

  /**
   * Release lock
   */
  release() {
    if (!this.locked) {
      warn(`Attempted to release unlocked lock: ${this.name}`);
      return;
    }

    if (this.queue.length > 0) {
      const { resolve } = this.queue.shift();
      debug(`Lock passed to next in queue: ${this.name} (${this.queue.length} remaining)`);
      resolve(() => this.release());
    } else {
      this.locked = false;
      debug(`Lock released: ${this.name}`);
    }
  }

  /**
   * Try to acquire lock without waiting
   * @returns {Function|null} Release function or null if already locked
   */
  tryAcquire() {
    if (this.locked) {
      return null;
    }
    this.locked = true;
    debug(`Lock acquired (non-blocking): ${this.name}`);
    return () => this.release();
  }

  /**
   * Execute function with lock
   * @param {Function} fn - Async function to execute
   * @param {number} timeout - Lock timeout
   * @returns {Promise<*>} Result of function
   */
  async executeWithLock(fn, timeout = 30000) {
    const release = await this.acquire(timeout);
    try {
      return await fn();
    } finally {
      release();
    }
  }

  /**
   * Check if lock is currently held
   * @returns {boolean}
   */
  isLocked() {
    return this.locked;
  }

  /**
   * Get queue size
   * @returns {number}
   */
  getQueueSize() {
    return this.queue.length;
  }
}

/**
 * Timer Manager for preventing memory leaks
 */
class TimerManager {
  constructor(name = 'unnamed') {
    this.name = name;
    this.timers = new Map();
    this.intervals = new Map();
  }

  /**
   * Set a timeout and track it
   * @param {string} key - Timer identifier
   * @param {Function} callback - Function to execute
   * @param {number} delay - Delay in milliseconds
   * @returns {number} Timer ID
   */
  setTimeout(key, callback, delay) {
    // Clear existing timer with same key
    this.clearTimeout(key);

    const timerId = setTimeout(() => {
      try {
        callback();
      } catch (error) {
        handleError(error, `TimerManager.setTimeout[${this.name}:${key}]`, {
          silent: true
        });
      } finally {
        this.timers.delete(key);
      }
    }, delay);

    this.timers.set(key, {
      id: timerId,
      type: 'timeout',
      createdAt: Date.now(),
      delay
    });

    debug(`Timer set: ${this.name}.${key} (${delay}ms)`, {
      activeTimers: this.timers.size
    });

    return timerId;
  }

  /**
   * Set an interval and track it
   * @param {string} key - Interval identifier
   * @param {Function} callback - Function to execute
   * @param {number} delay - Delay in milliseconds
   * @returns {number} Interval ID
   */
  setInterval(key, callback, delay) {
    // Clear existing interval with same key
    this.clearInterval(key);

    const intervalId = setInterval(() => {
      try {
        callback();
      } catch (error) {
        handleError(error, `TimerManager.setInterval[${this.name}:${key}]`, {
          silent: true
        });
      }
    }, delay);

    this.intervals.set(key, {
      id: intervalId,
      type: 'interval',
      createdAt: Date.now(),
      delay
    });

    debug(`Interval set: ${this.name}.${key} (${delay}ms)`, {
      activeIntervals: this.intervals.size
    });

    return intervalId;
  }

  /**
   * Clear a specific timeout
   * @param {string} key - Timer identifier
   * @returns {boolean} True if timer was cleared
   */
  clearTimeout(key) {
    const timer = this.timers.get(key);
    if (timer) {
      clearTimeout(timer.id);
      this.timers.delete(key);
      debug(`Timer cleared: ${this.name}.${key}`);
      return true;
    }
    return false;
  }

  /**
   * Clear a specific interval
   * @param {string} key - Interval identifier
   * @returns {boolean} True if interval was cleared
   */
  clearInterval(key) {
    const interval = this.intervals.get(key);
    if (interval) {
      clearInterval(interval.id);
      this.intervals.delete(key);
      debug(`Interval cleared: ${this.name}.${key}`);
      return true;
    }
    return false;
  }

  /**
   * Clear all timers and intervals
   */
  clearAll() {
    for (const [key, timer] of this.timers) {
      clearTimeout(timer.id);
    }
    for (const [key, interval] of this.intervals) {
      clearInterval(interval.id);
    }

    const timerCount = this.timers.size;
    const intervalCount = this.intervals.size;

    this.timers.clear();
    this.intervals.clear();

    debug(`All timers cleared for ${this.name}`, {
      timersCleared: timerCount,
      intervalsCleared: intervalCount
    });
  }

  /**
   * Get all active timer keys
   * @returns {Array<string>}
   */
  getActiveTimers() {
    return Array.from(this.timers.keys());
  }

  /**
   * Get all active interval keys
   * @returns {Array<string>}
   */
  getActiveIntervals() {
    return Array.from(this.intervals.keys());
  }

  /**
   * Get statistics about timers
   * @returns {Object}
   */
  getStats() {
    return {
      name: this.name,
      activeTimers: this.timers.size,
      activeIntervals: this.intervals.size,
      timerKeys: this.getActiveTimers(),
      intervalKeys: this.getActiveIntervals()
    };
  }

  /**
   * Clean up stale timers (older than specified age)
   * @param {number} maxAge - Maximum age in milliseconds
   * @returns {number} Number of timers cleaned up
   */
  cleanupStaleTimers(maxAge = TIMING.CLEANUP_INTERVAL) {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, timer] of this.timers) {
      if (now - timer.createdAt > maxAge) {
        this.clearTimeout(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      warn(`Cleaned up ${cleaned} stale timers in ${this.name}`);
    }

    return cleaned;
  }
}

// Global lock instances for common operations
const bidLock = new AsyncLock('bid-processing');
const auctionLock = new AsyncLock('auction-control');
const attendanceLock = new AsyncLock('attendance-sync');
const stateLock = new AsyncLock('state-sync');

// Global timer managers
const auctionTimers = new TimerManager('auction');
const attendanceTimers = new TimerManager('attendance');
const systemTimers = new TimerManager('system');

/**
 * Clean up all resources on shutdown
 */
function cleanupAll() {
  auctionTimers.clearAll();
  attendanceTimers.clearAll();
  systemTimers.clearAll();

  console.log('✅ All locks and timers cleaned up');
}

module.exports = {
  AsyncLock,
  TimerManager,
  bidLock,
  auctionLock,
  attendanceLock,
  stateLock,
  auctionTimers,
  attendanceTimers,
  systemTimers,
  cleanupAll
};
