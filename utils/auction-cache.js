/**
 * AUCTION CACHE & CIRCUIT BREAKER SYSTEM
 * Provides 100% uptime for auctions even when Google Sheets API fails
 *
 * Features:
 * - Fallback cache for auction items
 * - Circuit breaker to prevent cascade failures
 * - Disk persistence across bot restarts
 * - Health monitoring and auto-recovery
 */

const fs = require('fs').promises;
const path = require('path');

// Cache file location
const CACHE_FILE = path.join(__dirname, '../.auction-cache.json');

// Circuit breaker states
const CIRCUIT_STATES = {
  CLOSED: 'CLOSED',       // Normal operation
  OPEN: 'OPEN',           // Too many failures, using cache only
  HALF_OPEN: 'HALF_OPEN'  // Testing if API recovered
};

// Circuit breaker configuration
const CIRCUIT_CONFIG = {
  FAILURE_THRESHOLD: 3,      // Open circuit after 3 failures
  SUCCESS_THRESHOLD: 2,      // Close circuit after 2 successes in half-open
  TIMEOUT: 60000,            // Try half-open after 60 seconds
  RESET_TIMEOUT: 300000      // Reset failure count after 5 minutes
};

class AuctionCache {
  constructor() {
    this.cache = {
      items: [],
      lastUpdate: null,
      lastFetch: null,
      fetchCount: 0
    };

    this.circuit = {
      state: CIRCUIT_STATES.CLOSED,
      failures: 0,
      successes: 0,
      lastFailure: null,
      lastStateChange: Date.now()
    };

    this.stats = {
      totalFetches: 0,
      cacheHits: 0,
      failures: 0,
      lastError: null
    };
  }

  /**
   * Initialize cache from disk
   */
  async init() {
    try {
      const data = await fs.readFile(CACHE_FILE, 'utf8');
      const saved = JSON.parse(data);

      this.cache = saved.cache || this.cache;
      this.circuit = saved.circuit || this.circuit;
      this.stats = saved.stats || this.stats;

      console.log(`✅ Loaded auction cache: ${this.cache.items.length} items (last update: ${this.cache.lastUpdate || 'never'})`);

      // Auto-recover circuit if enough time passed
      if (this.circuit.state === CIRCUIT_STATES.OPEN) {
        const timeSinceFailure = Date.now() - (this.circuit.lastFailure || 0);
        if (timeSinceFailure > CIRCUIT_CONFIG.TIMEOUT) {
          this.circuit.state = CIRCUIT_STATES.HALF_OPEN;
          console.log('🔄 Circuit breaker: OPEN → HALF_OPEN (auto-recovery attempt)');
        }
      }
    } catch (err) {
      if (err.code !== 'ENOENT') {
        console.error('⚠️ Failed to load auction cache:', err.message);
      }
      console.log('📝 Starting with empty auction cache');
    }
  }

  /**
   * Save cache to disk
   */
  async save() {
    try {
      const data = JSON.stringify({
        cache: this.cache,
        circuit: this.circuit,
        stats: this.stats,
        savedAt: new Date().toISOString()
      }, null, 2);

      await fs.writeFile(CACHE_FILE, data, 'utf8');
    } catch (err) {
      console.error('❌ Failed to save auction cache:', err.message);
    }
  }

  /**
   * Check if circuit should allow request
   */
  canAttemptFetch() {
    if (this.circuit.state === CIRCUIT_STATES.CLOSED) {
      return true;
    }

    if (this.circuit.state === CIRCUIT_STATES.OPEN) {
      // Check if enough time passed to try half-open
      const timeSinceFailure = Date.now() - (this.circuit.lastFailure || 0);
      if (timeSinceFailure > CIRCUIT_CONFIG.TIMEOUT) {
        this.circuit.state = CIRCUIT_STATES.HALF_OPEN;
        this.circuit.successes = 0;
        console.log('🔄 Circuit breaker: OPEN → HALF_OPEN (timeout expired)');
        return true;
      }
      return false; // Still open, don't attempt
    }

    if (this.circuit.state === CIRCUIT_STATES.HALF_OPEN) {
      return true; // Allow test request
    }

    return false;
  }

  /**
   * Record successful fetch
   */
  recordSuccess(items) {
    this.cache.items = items;
    this.cache.lastUpdate = new Date().toISOString();
    this.cache.lastFetch = Date.now();
    this.cache.fetchCount++;

    this.stats.totalFetches++;

    // Update circuit breaker
    if (this.circuit.state === CIRCUIT_STATES.HALF_OPEN) {
      this.circuit.successes++;
      if (this.circuit.successes >= CIRCUIT_CONFIG.SUCCESS_THRESHOLD) {
        this.circuit.state = CIRCUIT_STATES.CLOSED;
        this.circuit.failures = 0;
        this.circuit.successes = 0;
        this.circuit.lastStateChange = Date.now();
        console.log('✅ Circuit breaker: HALF_OPEN → CLOSED (API recovered)');
      }
    } else if (this.circuit.state === CIRCUIT_STATES.CLOSED) {
      // Reset failure count after successful fetch
      const timeSinceLastFailure = Date.now() - (this.circuit.lastFailure || 0);
      if (timeSinceLastFailure > CIRCUIT_CONFIG.RESET_TIMEOUT) {
        this.circuit.failures = 0;
      }
    }

    this.save(); // Persist to disk
  }

  /**
   * Record failed fetch
   */
  recordFailure(error) {
    this.circuit.failures++;
    this.circuit.lastFailure = Date.now();
    this.stats.failures++;
    this.stats.lastError = error.message;

    // Open circuit if too many failures
    if (this.circuit.state === CIRCUIT_STATES.CLOSED) {
      if (this.circuit.failures >= CIRCUIT_CONFIG.FAILURE_THRESHOLD) {
        this.circuit.state = CIRCUIT_STATES.OPEN;
        this.circuit.lastStateChange = Date.now();
        console.log(`🔴 Circuit breaker: CLOSED → OPEN (${this.circuit.failures} failures)`);
      }
    } else if (this.circuit.state === CIRCUIT_STATES.HALF_OPEN) {
      // Failed during test, back to open
      this.circuit.state = CIRCUIT_STATES.OPEN;
      this.circuit.successes = 0;
      this.circuit.lastStateChange = Date.now();
      console.log('🔴 Circuit breaker: HALF_OPEN → OPEN (test failed)');
    }

    this.save(); // Persist to disk
  }

  /**
   * Get cached items (fallback)
   */
  getCachedItems() {
    this.stats.cacheHits++;
    return this.cache.items;
  }

  /**
   * Check if cache is fresh (< 24 hours old)
   */
  isCacheFresh() {
    if (!this.cache.lastFetch) return false;
    const age = Date.now() - this.cache.lastFetch;
    return age < 24 * 60 * 60 * 1000; // 24 hours
  }

  /**
   * Get cache and circuit health status
   */
  getStatus() {
    return {
      cache: {
        itemCount: this.cache.items.length,
        lastUpdate: this.cache.lastUpdate,
        age: this.cache.lastFetch ? Date.now() - this.cache.lastFetch : null,
        isFresh: this.isCacheFresh()
      },
      circuit: {
        state: this.circuit.state,
        failures: this.circuit.failures,
        successes: this.circuit.successes,
        lastFailure: this.circuit.lastFailure,
        timeSinceStateChange: Date.now() - this.circuit.lastStateChange
      },
      stats: {
        ...this.stats,
        cacheHitRate: this.stats.totalFetches > 0
          ? (this.stats.cacheHits / this.stats.totalFetches * 100).toFixed(2) + '%'
          : '0%'
      }
    };
  }
}

// Singleton instance
const auctionCache = new AuctionCache();

module.exports = auctionCache;
