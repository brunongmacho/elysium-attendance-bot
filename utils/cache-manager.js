/**
 * ============================================================================
 * CACHE MANAGER MODULE
 * ============================================================================
 *
 * Provides high-performance caching utilities for the bot:
 * - Fuzzy boss name matching with Levenshtein distance
 * - General-purpose TTL-based caching
 * - Automatic cache cleanup and memory management
 * - Cache statistics tracking
 *
 * Caching Strategy:
 * - Fuzzy match cache: Stores boss name matching results to avoid repeated
 *   expensive Levenshtein distance calculations
 * - General cache: TTL-based cache for any data with automatic expiration
 * - Both caches have size limits and automatic cleanup to prevent memory leaks
 *
 * Performance Benefits:
 * - Reduces CPU usage by caching fuzzy match results
 * - Prevents redundant API calls with TTL-based caching
 * - Improves response times for frequently accessed data
 *
 * @module utils/cache-manager
 * @requires fast-levenshtein - For string similarity matching
 * @requires ./constants - For cache configuration
 * @requires ./error-handler - For debug logging
 *
 * @author Elysium Attendance Bot Team
 * @version 2.0
 * ============================================================================
 */

// ============================================================================
// DEPENDENCIES
// ============================================================================

const levenshtein = require('fast-levenshtein');
const { LIMITS, TIMING } = require('./constants');
const { debug } = require('./error-handler');

// ============================================================================
// CACHE STORES
// ============================================================================

/**
 * Cache for fuzzy boss name matching results.
 * Key: normalized user input (lowercase, trimmed)
 * Value: matched boss name or null
 *
 * @type {Map<string, string|null>}
 */
const fuzzyMatchCache = new Map();

/**
 * General-purpose cache with TTL support.
 * Key: cache key (string)
 * Value: { value: any, timestamp: number }
 *
 * @type {Map<string, {value: any, timestamp: number}>}
 */
const generalCache = new Map();

// ============================================================================
// CACHE STATISTICS
// ============================================================================

/**
 * Number of cache hits (data found in cache).
 * @type {number}
 */
let cacheHits = 0;

/**
 * Number of cache misses (data not found, needs computation).
 * @type {number}
 */
let cacheMisses = 0;

// ============================================================================
// FUZZY BOSS NAME MATCHING
// ============================================================================

/**
 * Find boss match with caching using multiple matching strategies.
 *
 * This function attempts to match user input to a boss name using a
 * four-tiered approach:
 * 1. Exact match (case-insensitive)
 * 2. Alias match (checks all boss aliases)
 * 3. Partial match (substring matching)
 * 4. Fuzzy match (Levenshtein distance with adaptive threshold)
 *
 * Results are cached to avoid repeated expensive calculations. The fuzzy
 * matching uses an adaptive threshold that allows more errors for longer
 * input strings (up to 25% of the input length).
 *
 * @function findBossMatchCached
 * @param {string} input - User input boss name (may be partial or misspelled)
 * @param {Object} bossPoints - Boss points database with structure:
 *   {
 *     "BossName": {
 *       points: number,
 *       aliases: string[]
 *     }
 *   }
 * @returns {string|null} Matched boss name or null if no match found
 *
 * @example
 * const boss = findBossMatchCached("balrog", bossData);
 * // Returns "Balrog" (exact match)
 *
 * const boss2 = findBossMatchCached("bal", bossData);
 * // Returns "Balrog" (partial match)
 *
 * const boss3 = findBossMatchCached("balrg", bossData);
 * // Returns "Balrog" (fuzzy match, 1 character difference)
 */
function findBossMatchCached(input, bossPoints) {
  // Normalize input for cache key (lowercase, trimmed)
  const cacheKey = `${input.toLowerCase().trim()}`;

  // Check cache first for performance
  if (fuzzyMatchCache.has(cacheKey)) {
    cacheHits++;
    const cached = fuzzyMatchCache.get(cacheKey);
    debug('Fuzzy match cache hit', { input, result: cached });
    return cached;
  }

  // Cache miss - perform matching
  cacheMisses++;

  const q = input.toLowerCase().trim();

  // STRATEGY 1: Exact match (case-insensitive)
  // This is the fastest check and most reliable
  for (const name of Object.keys(bossPoints)) {
    if (name.toLowerCase() === q) {
      fuzzyMatchCache.set(cacheKey, name);
      return name;
    }
    // Also check aliases for exact match
    const meta = bossPoints[name];
    for (const alias of meta.aliases || []) {
      if (alias.toLowerCase() === q) {
        fuzzyMatchCache.set(cacheKey, name);
        return name;
      }
    }
  }

  // STRATEGY 2: Partial match (substring matching)
  // Checks if input is contained in boss name or vice versa
  for (const name of Object.keys(bossPoints)) {
    if (name.toLowerCase().includes(q) || q.includes(name.toLowerCase())) {
      fuzzyMatchCache.set(cacheKey, name);
      return name;
    }
    // Also check aliases for partial match
    const meta = bossPoints[name];
    for (const alias of meta.aliases || []) {
      if (alias.toLowerCase().includes(q) || q.includes(alias.toLowerCase())) {
        fuzzyMatchCache.set(cacheKey, name);
        return name;
      }
    }
  }

  // STRATEGY 3: Fuzzy match using Levenshtein distance
  // Find the boss name with the smallest edit distance
  let best = { name: null, dist: 999 };

  for (const name of Object.keys(bossPoints)) {
    // Calculate distance to boss name
    const dist = levenshtein.get(q, name.toLowerCase());
    if (dist < best.dist) best = { name, dist };

    // Also check distances to aliases
    for (const alias of bossPoints[name].aliases || []) {
      const d2 = levenshtein.get(q, alias.toLowerCase());
      if (d2 < best.dist) best = { name, dist: d2 };
    }
  }

  // Adaptive threshold: allow more errors for longer input
  // Base threshold is FUZZY_MATCH_MAX_DISTANCE (usually 2)
  // For longer strings, allow up to 25% of the length as errors
  const maxAllowedDistance = Math.max(
    LIMITS.FUZZY_MATCH_MAX_DISTANCE,
    Math.floor(q.length / 4)
  );

  // Only accept match if within threshold
  const result = best.dist <= maxAllowedDistance ? best.name : null;

  // Cache the result (even if null) to avoid repeated calculations
  fuzzyMatchCache.set(cacheKey, result);

  return result;
}

// ============================================================================
// GENERAL-PURPOSE CACHING
// ============================================================================

/**
 * Generic cache getter with TTL (Time To Live) support.
 *
 * Retrieves a value from cache if it exists and hasn't expired. If the value
 * is not cached or has expired, calls the generator function to create a new
 * value, caches it, and returns it.
 *
 * This is useful for caching expensive operations like API calls or complex
 * calculations with automatic expiration.
 *
 * @function getCached
 * @async
 * @param {string} key - Cache key (unique identifier)
 * @param {Function} generator - Async function to generate value if not cached
 * @param {number} [ttl=TIMING.CACHE_REFRESH_INTERVAL] - Time to live in milliseconds
 * @returns {Promise<*>} Cached or freshly generated value
 *
 * @example
 * const userData = await getCached('user-123', async () => {
 *   return await fetchUserFromAPI('123');
 * }, 30000); // Cache for 30 seconds
 */
async function getCached(key, generator, ttl = TIMING.CACHE_REFRESH_INTERVAL) {
  const cached = generalCache.get(key);

  // Check if cached value exists and hasn't expired
  if (cached && Date.now() - cached.timestamp < ttl) {
    cacheHits++;
    debug('General cache hit', { key });
    return cached.value;
  }

  // Cache miss or expired - generate new value
  cacheMisses++;
  const value = await generator();

  // Store in cache with timestamp
  generalCache.set(key, {
    value,
    timestamp: Date.now()
  });

  // Schedule automatic cleanup after TTL expires
  setTimeout(() => {
    generalCache.delete(key);
  }, ttl);

  return value;
}

/**
 * Set cache entry manually with TTL.
 *
 * Stores a value in the general cache with automatic expiration.
 * Use this when you want to manually cache a value without using
 * the getCached generator pattern.
 *
 * @function setCache
 * @param {string} key - Cache key (unique identifier)
 * @param {*} value - Value to cache (any type)
 * @param {number} [ttl=TIMING.CACHE_REFRESH_INTERVAL] - Time to live in milliseconds
 * @returns {void}
 *
 * @example
 * setCache('boss-list', bossData, 60000); // Cache for 1 minute
 */
function setCache(key, value, ttl = TIMING.CACHE_REFRESH_INTERVAL) {
  // Store in cache with current timestamp
  generalCache.set(key, {
    value,
    timestamp: Date.now()
  });

  // Schedule automatic cleanup after TTL expires
  setTimeout(() => {
    generalCache.delete(key);
  }, ttl);
}

// ============================================================================
// CACHE MANAGEMENT
// ============================================================================

/**
 * Invalidate cache entry or entries matching a pattern.
 *
 * Removes one or more entries from the general cache. Can invalidate:
 * - A specific key (exact match)
 * - Multiple keys matching a pattern (substring match)
 *
 * Use this when cached data becomes stale and needs to be refreshed.
 *
 * @function invalidateCache
 * @param {string} keyOrPattern - Cache key or pattern to match
 * @returns {void}
 *
 * @example
 * // Invalidate specific key
 * invalidateCache('user-123');
 *
 * // Invalidate all keys containing 'user'
 * invalidateCache('user'); // Matches 'user-123', 'user-456', etc.
 */
function invalidateCache(keyOrPattern) {
  // Check for exact match first
  if (generalCache.has(keyOrPattern)) {
    generalCache.delete(keyOrPattern);
    debug('Invalidated cache entry', { key: keyOrPattern });
    return;
  }

  // Pattern matching - invalidate all keys containing the pattern
  let invalidated = 0;
  for (const [key] of generalCache) {
    if (key.includes(keyOrPattern)) {
      generalCache.delete(key);
      invalidated++;
    }
  }

  if (invalidated > 0) {
    debug('Invalidated cache entries', { pattern: keyOrPattern, count: invalidated });
  }
}

/**
 * Clear fuzzy match cache.
 *
 * Removes all cached boss name matching results. Use this when the boss
 * database changes or for manual cache management.
 *
 * @function clearFuzzyMatchCache
 * @returns {void}
 *
 * @example
 * clearFuzzyMatchCache(); // Clear all fuzzy match results
 */
function clearFuzzyMatchCache() {
  fuzzyMatchCache.clear();
  debug('Cleared fuzzy match cache');
}

/**
 * Clear general cache.
 *
 * Removes all entries from the general TTL-based cache. Use this for
 * manual cache management or when you need to force refresh all cached data.
 *
 * @function clearGeneralCache
 * @returns {void}
 *
 * @example
 * clearGeneralCache(); // Clear all general cache entries
 */
function clearGeneralCache() {
  generalCache.clear();
  debug('Cleared general cache');
}

/**
 * Clear all caches and reset statistics.
 *
 * Removes all entries from both fuzzy match and general caches, and resets
 * hit/miss counters. Use this for complete cache reset.
 *
 * @function clearAllCaches
 * @returns {void}
 *
 * @example
 * clearAllCaches(); // Complete cache reset
 */
function clearAllCaches() {
  fuzzyMatchCache.clear();
  generalCache.clear();
  cacheHits = 0;
  cacheMisses = 0;
  debug('Cleared all caches');
}

// ============================================================================
// CACHE STATISTICS AND MONITORING
// ============================================================================

/**
 * Get cache statistics and performance metrics.
 *
 * Returns detailed information about cache usage including:
 * - Cache sizes
 * - Hit/miss counts and rate
 * - Sample of cached keys
 *
 * Use this for monitoring cache performance and debugging.
 *
 * @function getCacheStats
 * @returns {Object} Cache statistics object
 * @returns {number} returns.fuzzyMatchCacheSize - Number of fuzzy match entries
 * @returns {number} returns.generalCacheSize - Number of general cache entries
 * @returns {number} returns.totalCacheSize - Total cached entries
 * @returns {number} returns.cacheHits - Number of cache hits
 * @returns {number} returns.cacheMisses - Number of cache misses
 * @returns {string} returns.hitRate - Cache hit rate as percentage
 * @returns {string[]} returns.fuzzyMatchKeys - Sample fuzzy match cache keys (max 10)
 * @returns {string[]} returns.generalCacheKeys - Sample general cache keys (max 10)
 *
 * @example
 * const stats = getCacheStats();
 * console.log(`Hit rate: ${stats.hitRate}`);
 * console.log(`Total entries: ${stats.totalCacheSize}`);
 */
function getCacheStats() {
  // Calculate hit rate as percentage
  const hitRate = cacheHits + cacheMisses > 0
    ? ((cacheHits / (cacheHits + cacheMisses)) * 100).toFixed(2)
    : 0;

  return {
    fuzzyMatchCacheSize: fuzzyMatchCache.size,
    generalCacheSize: generalCache.size,
    totalCacheSize: fuzzyMatchCache.size + generalCache.size,
    cacheHits,
    cacheMisses,
    hitRate: `${hitRate}%`,
    // Include sample of keys for debugging (limit to 10)
    fuzzyMatchKeys: Array.from(fuzzyMatchCache.keys()).slice(0, 10),
    generalCacheKeys: Array.from(generalCache.keys()).slice(0, 10)
  };
}

// ============================================================================
// AUTOMATIC CACHE CLEANUP
// ============================================================================

/**
 * Start periodic cache cleanup to prevent memory leaks.
 *
 * Runs automatically on an interval to:
 * - Remove expired entries from general cache
 * - Limit fuzzy match cache size (max 1000 entries)
 * - Prevent unbounded memory growth
 *
 * This function should be called once during bot initialization.
 * It runs continuously in the background and manages cache memory
 * automatically.
 *
 * Cleanup Strategy:
 * - General cache: Removes entries older than CACHE_REFRESH_INTERVAL
 * - Fuzzy match cache: If size > 1000, keeps only the 500 most recent entries
 * - Runs every CLEANUP_INTERVAL (default: 12 hours)
 *
 * @function startCacheCleanup
 * @returns {void}
 *
 * @example
 * // In bot initialization
 * startCacheCleanup(); // Starts automatic cleanup
 */
function startCacheCleanup() {
  setInterval(() => {
    const now = Date.now();

    // CLEANUP 1: Remove expired general cache entries
    // Entries older than CACHE_REFRESH_INTERVAL are deleted
    for (const [key, entry] of generalCache) {
      if (now - entry.timestamp > TIMING.CACHE_REFRESH_INTERVAL) {
        generalCache.delete(key);
      }
    }

    // CLEANUP 2: Limit fuzzy match cache size
    // Keep maximum 1000 entries to prevent unbounded growth
    if (fuzzyMatchCache.size > 1000) {
      const entries = Array.from(fuzzyMatchCache.entries());

      // Clear entire cache
      fuzzyMatchCache.clear();

      // Restore only the last 500 entries (most recent)
      // This assumes newer entries are more likely to be used again
      for (const [key, value] of entries.slice(-500)) {
        fuzzyMatchCache.set(key, value);
      }
    }

    // Log cleanup completion with current stats
    debug('Cache cleanup completed', getCacheStats());
  }, TIMING.CLEANUP_INTERVAL);
}

// ============================================================================
// MODULE EXPORTS
// ============================================================================

/**
 * Exported cache management functions.
 *
 * This module provides:
 * - Fuzzy boss name matching with caching (findBossMatchCached)
 * - General-purpose TTL-based caching (getCached, setCache)
 * - Cache invalidation (invalidateCache, clear functions)
 * - Cache statistics (getCacheStats)
 * - Automatic cleanup (startCacheCleanup)
 *
 * All caching is in-memory using Map data structures for fast access.
 * Cache cleanup runs automatically to prevent memory leaks.
 */
module.exports = {
  // Fuzzy Matching
  findBossMatchCached,

  // General Caching
  getCached,
  setCache,

  // Cache Management
  invalidateCache,
  clearFuzzyMatchCache,
  clearGeneralCache,
  clearAllCaches,

  // Monitoring
  getCacheStats,
  startCacheCleanup
};
