/**
 * ============================================================================
 * AUCTION CACHE & CIRCUIT BREAKER SYSTEM
 * ============================================================================
 *
 * Provides 100% uptime for auctions even when Google Sheets API fails.
 *
 * This module implements a sophisticated caching and resilience strategy:
 *
 * 1. FALLBACK CACHE:
 *    - Stores auction item data in memory and on disk
 *    - Serves cached data when API is unavailable
 *    - Automatically refreshes when API recovers
 *
 * 2. CIRCUIT BREAKER:
 *    - Prevents repeated failed API calls (cascade failures)
 *    - Three states: CLOSED (normal), OPEN (using cache), HALF_OPEN (testing)
 *    - Automatic state transitions based on success/failure patterns
 *
 * 3. DISK PERSISTENCE:
 *    - Saves cache to .auction-cache.json
 *    - Survives bot restarts
 *    - Maintains cache across deployments
 *
 * 4. HEALTH MONITORING:
 *    - Tracks API success/failure statistics
 *    - Automatic recovery when API becomes available
 *    - Detailed status reporting
 *
 * Circuit Breaker Pattern:
 * - CLOSED: All API calls go through normally
 * - OPEN: API is broken, serve cached data only (after 3 failures)
 * - HALF_OPEN: Testing API recovery (after 60s timeout)
 *
 * @module utils/auction-cache
 * @requires fs/promises - For disk persistence
 * @requires path - For cache file path resolution
 *
 * @author Elysium Attendance Bot Team
 * @version 2.0
 * ============================================================================
 */

// ============================================================================
// DEPENDENCIES
// ============================================================================

const fs = require('fs').promises;
const path = require('path');

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Cache file location on disk.
 * Stored in project root as hidden file.
 * @constant {string}
 */
const CACHE_FILE = path.join(__dirname, '../.auction-cache.json');

/**
 * Circuit breaker states for state machine.
 *
 * @constant {Object} CIRCUIT_STATES
 * @property {string} CLOSED - Normal operation, API calls allowed
 * @property {string} OPEN - API is broken, using cache only
 * @property {string} HALF_OPEN - Testing if API has recovered
 */
const CIRCUIT_STATES = {
  CLOSED: 'CLOSED',       // Normal operation
  OPEN: 'OPEN',           // Too many failures, using cache only
  HALF_OPEN: 'HALF_OPEN'  // Testing if API recovered
};

/**
 * Circuit breaker configuration thresholds.
 *
 * @constant {Object} CIRCUIT_CONFIG
 * @property {number} FAILURE_THRESHOLD - Open circuit after this many failures
 * @property {number} SUCCESS_THRESHOLD - Close circuit after this many successes in half-open
 * @property {number} TIMEOUT - Time to wait before trying half-open (ms)
 * @property {number} RESET_TIMEOUT - Time to reset failure count after success (ms)
 */
const CIRCUIT_CONFIG = {
  FAILURE_THRESHOLD: 3,      // Open circuit after 3 failures
  SUCCESS_THRESHOLD: 2,      // Close circuit after 2 successes in half-open
  TIMEOUT: 60000,            // Try half-open after 60 seconds
  RESET_TIMEOUT: 300000      // Reset failure count after 5 minutes
};

// ============================================================================
// AUCTION CACHE CLASS
// ============================================================================

/**
 * Auction cache with circuit breaker pattern.
 *
 * This class manages auction item caching and API resilience. It implements
 * the circuit breaker pattern to prevent cascade failures when the Google
 * Sheets API is unavailable.
 *
 * @class AuctionCache
 */
class AuctionCache {
  /**
   * Initialize the auction cache.
   *
   * Sets up empty cache, circuit breaker state, and statistics tracking.
   * Call init() after construction to load cached data from disk.
   *
   * @constructor
   */
  constructor() {
    /**
     * Cache storage for auction items and metadata.
     * @type {Object}
     * @property {Array} items - Cached auction items
     * @property {string|null} lastUpdate - ISO timestamp of last successful update
     * @property {number|null} lastFetch - Unix timestamp of last fetch attempt
     * @property {number} fetchCount - Total number of successful fetches
     */
    this.cache = {
      items: [],
      lastUpdate: null,
      lastFetch: null,
      fetchCount: 0
    };

    /**
     * Circuit breaker state.
     * @type {Object}
     * @property {string} state - Current circuit state (CLOSED/OPEN/HALF_OPEN)
     * @property {number} failures - Consecutive failure count
     * @property {number} successes - Success count in HALF_OPEN state
     * @property {number|null} lastFailure - Unix timestamp of last failure
     * @property {number} lastStateChange - Unix timestamp of last state change
     */
    this.circuit = {
      state: CIRCUIT_STATES.CLOSED,
      failures: 0,
      successes: 0,
      lastFailure: null,
      lastStateChange: Date.now()
    };

    /**
     * Usage statistics.
     * @type {Object}
     * @property {number} totalFetches - Total fetch attempts
     * @property {number} cacheHits - Number of times cache was used
     * @property {number} failures - Total failure count
     * @property {string|null} lastError - Last error message
     */
    this.stats = {
      totalFetches: 0,
      cacheHits: 0,
      failures: 0,
      lastError: null
    };
  }

  // ==========================================================================
  // INITIALIZATION AND PERSISTENCE
  // ==========================================================================

  /**
   * Initialize cache from disk.
   *
   * Loads previously cached data from .auction-cache.json. If the circuit
   * was OPEN when the bot shut down, it attempts auto-recovery by
   * transitioning to HALF_OPEN if enough time has passed.
   *
   * This should be called once during bot initialization.
   *
   * @async
   * @returns {Promise<void>}
   *
   * @example
   * const auctionCache = new AuctionCache();
   * await auctionCache.init(); // Load from disk
   */
  async init() {
    try {
      // Read cache file from disk
      const data = await fs.readFile(CACHE_FILE, 'utf8');
      const saved = JSON.parse(data);

      // Restore cache state from disk
      this.cache = saved.cache || this.cache;
      this.circuit = saved.circuit || this.circuit;
      this.stats = saved.stats || this.stats;

      console.log(`✅ Loaded auction cache: ${this.cache.items.length} items (last update: ${this.cache.lastUpdate || 'never'})`);

      // Auto-recover circuit if enough time passed since last failure
      if (this.circuit.state === CIRCUIT_STATES.OPEN) {
        const timeSinceFailure = Date.now() - (this.circuit.lastFailure || 0);
        if (timeSinceFailure > CIRCUIT_CONFIG.TIMEOUT) {
          this.circuit.state = CIRCUIT_STATES.HALF_OPEN;
          console.log('🔄 Circuit breaker: OPEN → HALF_OPEN (auto-recovery attempt)');
        }
      }
    } catch (err) {
      // ENOENT = file doesn't exist (first run)
      if (err.code !== 'ENOENT') {
        console.error('⚠️ Failed to load auction cache:', err.message);
      }
      console.log('📝 Starting with empty auction cache');
    }
  }

  /**
   * Save cache to disk.
   *
   * Persists current cache, circuit state, and statistics to disk.
   * This is called automatically after cache updates and circuit state changes.
   *
   * @async
   * @returns {Promise<void>}
   */
  async save() {
    try {
      // Serialize cache state to JSON
      const data = JSON.stringify({
        cache: this.cache,
        circuit: this.circuit,
        stats: this.stats,
        savedAt: new Date().toISOString()
      }, null, 2);

      // Write to disk
      await fs.writeFile(CACHE_FILE, data, 'utf8');
    } catch (err) {
      console.error('❌ Failed to save auction cache:', err.message);
    }
  }

  // ==========================================================================
  // CIRCUIT BREAKER LOGIC
  // ==========================================================================

  /**
   * Check if circuit should allow an API fetch attempt.
   *
   * Circuit Breaker State Machine:
   * - CLOSED: Always allow (normal operation)
   * - OPEN: Block requests, but transition to HALF_OPEN after timeout
   * - HALF_OPEN: Allow test request to check if API recovered
   *
   * @returns {boolean} True if fetch should be attempted, false if blocked
   *
   * @example
   * if (auctionCache.canAttemptFetch()) {
   *   // Fetch from API
   * } else {
   *   // Use cached data
   * }
   */
  canAttemptFetch() {
    // CLOSED state: Normal operation, allow all requests
    if (this.circuit.state === CIRCUIT_STATES.CLOSED) {
      return true;
    }

    // OPEN state: API is broken, block requests
    if (this.circuit.state === CIRCUIT_STATES.OPEN) {
      // Check if enough time passed to attempt recovery
      const timeSinceFailure = Date.now() - (this.circuit.lastFailure || 0);

      if (timeSinceFailure > CIRCUIT_CONFIG.TIMEOUT) {
        // Transition to HALF_OPEN to test API recovery
        this.circuit.state = CIRCUIT_STATES.HALF_OPEN;
        this.circuit.successes = 0;
        console.log('🔄 Circuit breaker: OPEN → HALF_OPEN (timeout expired)');
        return true;
      }

      // Still in cooldown period, block request
      return false;
    }

    // HALF_OPEN state: Allow test request
    if (this.circuit.state === CIRCUIT_STATES.HALF_OPEN) {
      return true; // Allow to test if API recovered
    }

    return false;
  }

  /**
   * Record successful API fetch.
   *
   * Updates cache with fresh data and manages circuit breaker state:
   * - In HALF_OPEN: Increment success counter, transition to CLOSED if threshold met
   * - In CLOSED: Reset failure counter if enough time passed since last failure
   *
   * @param {Array} items - Fresh auction items from API
   * @returns {void}
   *
   * @example
   * const items = await fetchFromAPI();
   * auctionCache.recordSuccess(items); // Update cache and circuit state
   */
  recordSuccess(items) {
    // Update cache with fresh data
    this.cache.items = items;
    this.cache.lastUpdate = new Date().toISOString();
    this.cache.lastFetch = Date.now();
    this.cache.fetchCount++;

    // Update statistics
    this.stats.totalFetches++;

    // Circuit breaker state transitions
    if (this.circuit.state === CIRCUIT_STATES.HALF_OPEN) {
      // In HALF_OPEN: Count successes
      this.circuit.successes++;

      // If enough successes, API has recovered - close circuit
      if (this.circuit.successes >= CIRCUIT_CONFIG.SUCCESS_THRESHOLD) {
        this.circuit.state = CIRCUIT_STATES.CLOSED;
        this.circuit.failures = 0;
        this.circuit.successes = 0;
        this.circuit.lastStateChange = Date.now();
        console.log('✅ Circuit breaker: HALF_OPEN → CLOSED (API recovered)');
      }
    } else if (this.circuit.state === CIRCUIT_STATES.CLOSED) {
      // In CLOSED: Reset failure count if enough time passed
      const timeSinceLastFailure = Date.now() - (this.circuit.lastFailure || 0);
      if (timeSinceLastFailure > CIRCUIT_CONFIG.RESET_TIMEOUT) {
        this.circuit.failures = 0;
      }
    }

    // Persist to disk
    this.save();
  }

  /**
   * Record failed API fetch.
   *
   * Increments failure counter and manages circuit breaker state:
   * - In CLOSED: Open circuit if failure threshold exceeded
   * - In HALF_OPEN: Return to OPEN (recovery test failed)
   *
   * @param {Error} error - The error that occurred during fetch
   * @returns {void}
   *
   * @example
   * try {
   *   const items = await fetchFromAPI();
   *   auctionCache.recordSuccess(items);
   * } catch (error) {
   *   auctionCache.recordFailure(error); // Update circuit state
   * }
   */
  recordFailure(error) {
    // Update failure tracking
    this.circuit.failures++;
    this.circuit.lastFailure = Date.now();
    this.stats.failures++;
    this.stats.lastError = error.message;

    // Circuit breaker state transitions
    if (this.circuit.state === CIRCUIT_STATES.CLOSED) {
      // In CLOSED: Open circuit if too many failures
      if (this.circuit.failures >= CIRCUIT_CONFIG.FAILURE_THRESHOLD) {
        this.circuit.state = CIRCUIT_STATES.OPEN;
        this.circuit.lastStateChange = Date.now();
        console.log(`🔴 Circuit breaker: CLOSED → OPEN (${this.circuit.failures} failures)`);
      }
    } else if (this.circuit.state === CIRCUIT_STATES.HALF_OPEN) {
      // In HALF_OPEN: Failed recovery test, back to OPEN
      this.circuit.state = CIRCUIT_STATES.OPEN;
      this.circuit.successes = 0;
      this.circuit.lastStateChange = Date.now();
      console.log('🔴 Circuit breaker: HALF_OPEN → OPEN (test failed)');
    }

    // Persist to disk
    this.save();
  }

  // ==========================================================================
  // CACHE ACCESS
  // ==========================================================================

  /**
   * Get cached items (fallback when API is unavailable).
   *
   * Returns the cached auction items and increments the cache hit counter.
   * Use this when the circuit is OPEN or canAttemptFetch() returns false.
   *
   * @returns {Array} Cached auction items
   *
   * @example
   * if (!auctionCache.canAttemptFetch()) {
   *   const items = auctionCache.getCachedItems(); // Use cached data
   * }
   */
  getCachedItems() {
    this.stats.cacheHits++;
    return this.cache.items;
  }

  /**
   * Check if cache is fresh (less than 24 hours old).
   *
   * Used to determine if cached data is still reasonably current.
   * Even when using cache, it's good to know how old it is.
   *
   * @returns {boolean} True if cache is less than 24 hours old
   *
   * @example
   * if (!auctionCache.isCacheFresh()) {
   *   console.warn('Using stale cache data');
   * }
   */
  isCacheFresh() {
    if (!this.cache.lastFetch) return false;

    // Calculate cache age in milliseconds
    const age = Date.now() - this.cache.lastFetch;

    // Consider fresh if < 24 hours old
    return age < 24 * 60 * 60 * 1000;
  }

  // ==========================================================================
  // STATUS AND MONITORING
  // ==========================================================================

  /**
   * Get comprehensive cache and circuit health status.
   *
   * Returns detailed information about:
   * - Cache: Item count, age, freshness
   * - Circuit: State, failure/success counts, timing
   * - Stats: Hit rate, error information
   *
   * Use this for monitoring, debugging, and admin status displays.
   *
   * @returns {Object} Status object with cache, circuit, and stats information
   * @returns {Object} returns.cache - Cache information
   * @returns {Object} returns.circuit - Circuit breaker state
   * @returns {Object} returns.stats - Usage statistics
   *
   * @example
   * const status = auctionCache.getStatus();
   * console.log(`Circuit state: ${status.circuit.state}`);
   * console.log(`Cache hit rate: ${status.stats.cacheHitRate}`);
   * console.log(`Cache age: ${status.cache.age}ms`);
   */
  getStatus() {
    return {
      // Cache information
      cache: {
        itemCount: this.cache.items.length,
        lastUpdate: this.cache.lastUpdate,
        age: this.cache.lastFetch ? Date.now() - this.cache.lastFetch : null,
        isFresh: this.isCacheFresh()
      },

      // Circuit breaker state
      circuit: {
        state: this.circuit.state,
        failures: this.circuit.failures,
        successes: this.circuit.successes,
        lastFailure: this.circuit.lastFailure,
        timeSinceStateChange: Date.now() - this.circuit.lastStateChange
      },

      // Usage statistics
      stats: {
        ...this.stats,
        // Calculate cache hit rate percentage
        cacheHitRate: this.stats.totalFetches > 0
          ? (this.stats.cacheHits / this.stats.totalFetches * 100).toFixed(2) + '%'
          : '0%'
      }
    };
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

/**
 * Singleton instance of AuctionCache.
 *
 * The cache is shared across the entire bot to maintain consistent state.
 * Import this instance in your modules - do not create new instances.
 *
 * @type {AuctionCache}
 *
 * @example
 * const auctionCache = require('./utils/auction-cache');
 *
 * // Initialize on bot startup
 * await auctionCache.init();
 *
 * // Use in auction module
 * if (auctionCache.canAttemptFetch()) {
 *   const items = await fetchFromAPI();
 *   auctionCache.recordSuccess(items);
 * } else {
 *   const items = auctionCache.getCachedItems();
 * }
 */
const auctionCache = new AuctionCache();

module.exports = auctionCache;
