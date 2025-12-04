/**
 * ============================================================================
 * LRU CACHE - Least Recently Used Cache with Size Limits
 * ============================================================================
 *
 * PURPOSE:
 * Implements a memory-efficient cache with automatic eviction of least
 * recently used entries when size limit is reached.
 *
 * FEATURES:
 * - Maximum size limit (prevents unbounded growth)
 * - TTL (Time-To-Live) expiration
 * - LRU eviction policy (removes oldest 20% when full)
 * - Automatic cleanup of expired entries
 * - Access tracking and statistics
 *
 * FIXES: CRIT-004 - Unbounded cache growth in columnCheckCache
 *
 * @module utils/lru-cache
 * @version 1.0.0
 */

class LRUCache {
  /**
   * Create an LRU cache
   * @param {number} maxSize - Maximum number of entries (default: 1000)
   * @param {number} ttl - Time-to-live in milliseconds (default: 5 minutes)
   */
  constructor(maxSize = 1000, ttl = 5 * 60 * 1000) {
    this.maxSize = maxSize;
    this.ttl = ttl;
    this.cache = new Map();
    this.accessOrder = []; // Track access order for LRU
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      expirations: 0,
      sets: 0
    };
  }

  /**
   * Set a value in the cache
   * @param {string} key - Cache key
   * @param {*} value - Value to cache
   * @returns {void}
   */
  set(key, value) {
    const now = Date.now();

    // Remove if already exists (to update access order)
    if (this.cache.has(key)) {
      this.delete(key);
    }

    // Check size limit and evict if necessary
    if (this.cache.size >= this.maxSize) {
      this.evictOldest();
    }

    // Add new entry
    this.cache.set(key, {
      value,
      cachedAt: now,
      expiresAt: now + this.ttl,
      lastAccessed: now,
      accessCount: 1
    });

    this.accessOrder.push(key);
    this.stats.sets++;
  }

  /**
   * Get a value from the cache
   * @param {string} key - Cache key
   * @returns {*} Cached value or undefined if not found/expired
   */
  get(key) {
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      return undefined;
    }

    const now = Date.now();

    // Check if expired
    if (now > entry.expiresAt) {
      this.delete(key);
      this.stats.expirations++;
      this.stats.misses++;
      return undefined;
    }

    // Update access tracking
    entry.lastAccessed = now;
    entry.accessCount++;
    this.stats.hits++;

    // Move to end of access order (most recently used)
    const index = this.accessOrder.indexOf(key);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
      this.accessOrder.push(key);
    }

    return entry.value;
  }

  /**
   * Check if a key exists in the cache (without updating access)
   * @param {string} key - Cache key
   * @returns {boolean} True if key exists and not expired
   */
  has(key) {
    const entry = this.cache.get(key);
    if (!entry) {
      return false;
    }

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.delete(key);
      this.stats.expirations++;
      return false;
    }

    return true;
  }

  /**
   * Delete a key from the cache
   * @param {string} key - Cache key
   * @returns {boolean} True if key was deleted
   */
  delete(key) {
    const deleted = this.cache.delete(key);

    if (deleted) {
      const index = this.accessOrder.indexOf(key);
      if (index > -1) {
        this.accessOrder.splice(index, 1);
      }
    }

    return deleted;
  }

  /**
   * Evict oldest entries when cache is full
   * Removes oldest 20% of entries based on LRU policy
   * @returns {number} Number of entries evicted
   */
  evictOldest() {
    // Calculate how many entries to remove (20% of max size)
    const toRemove = Math.ceil(this.maxSize * 0.2);
    let removed = 0;

    for (let i = 0; i < toRemove && this.accessOrder.length > 0; i++) {
      const oldestKey = this.accessOrder.shift();
      if (this.cache.delete(oldestKey)) {
        removed++;
        this.stats.evictions++;
      }
    }

    if (removed > 0) {
      console.log(`🧹 [LRU Cache] Evicted ${removed} oldest entries (${this.cache.size}/${this.maxSize} remaining)`);
    }

    return removed;
  }

  /**
   * Clean up expired entries
   * @returns {number} Number of entries removed
   */
  cleanup() {
    const now = Date.now();
    let removed = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.delete(key);
        removed++;
        this.stats.expirations++;
      }
    }

    if (removed > 0) {
      console.log(`🧹 [LRU Cache] Cleaned up ${removed} expired entries (${this.cache.size}/${this.maxSize} remaining)`);
    }

    return removed;
  }

  /**
   * Clear all entries from the cache
   */
  clear() {
    this.cache.clear();
    this.accessOrder = [];
    // Don't reset stats - keep for monitoring
  }

  /**
   * Get cache statistics
   * @returns {Object} Statistics about cache usage
   */
  getStats() {
    const totalRequests = this.stats.hits + this.stats.misses;
    const hitRate = totalRequests > 0
      ? Math.round((this.stats.hits / totalRequests) * 100)
      : 0;

    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      utilizationPercent: Math.round((this.cache.size / this.maxSize) * 100),
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate: `${hitRate}%`,
      evictions: this.stats.evictions,
      expirations: this.stats.expirations,
      sets: this.stats.sets,
      oldestEntry: this.accessOrder[0],
      newestEntry: this.accessOrder[this.accessOrder.length - 1]
    };
  }

  /**
   * Get detailed entry information
   * @param {string} key - Cache key
   * @returns {Object|null} Entry details or null if not found
   */
  getEntryInfo(key) {
    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }

    const now = Date.now();
    const age = now - entry.cachedAt;
    const ttlRemaining = entry.expiresAt - now;

    return {
      key,
      value: entry.value,
      cachedAt: new Date(entry.cachedAt).toISOString(),
      expiresAt: new Date(entry.expiresAt).toISOString(),
      lastAccessed: new Date(entry.lastAccessed).toISOString(),
      accessCount: entry.accessCount,
      ageMs: age,
      ttlRemainingMs: ttlRemaining,
      isExpired: ttlRemaining <= 0
    };
  }

  /**
   * Get all keys in the cache (for debugging)
   * @returns {string[]} Array of all keys
   */
  keys() {
    return Array.from(this.cache.keys());
  }

  /**
   * Get cache size
   * @returns {number} Number of entries in cache
   */
  get size() {
    return this.cache.size;
  }

  /**
   * Check if cache is full
   * @returns {boolean} True if cache is at max capacity
   */
  get isFull() {
    return this.cache.size >= this.maxSize;
  }

  /**
   * Get cache utilization percentage
   * @returns {number} Percentage of cache capacity used (0-100)
   */
  get utilization() {
    return Math.round((this.cache.size / this.maxSize) * 100);
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      expirations: 0,
      sets: 0
    };
  }

  /**
   * Export cache contents for debugging
   * @returns {Object[]} Array of all entries with metadata
   */
  exportAll() {
    const entries = [];
    for (const [key, entry] of this.cache.entries()) {
      entries.push({
        key,
        value: entry.value,
        cachedAt: entry.cachedAt,
        expiresAt: entry.expiresAt,
        lastAccessed: entry.lastAccessed,
        accessCount: entry.accessCount
      });
    }
    return entries;
  }
}

module.exports = LRUCache;
