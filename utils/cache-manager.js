/**
 * Cache Manager for Fuzzy Matching and General Caching
 * Prevents repeated expensive calculations
 */

const levenshtein = require('fast-levenshtein');
const { LIMITS, TIMING } = require('./constants');
const { debug } = require('./error-handler');

// Cache stores
const fuzzyMatchCache = new Map();
const generalCache = new Map();

// Cache statistics
let cacheHits = 0;
let cacheMisses = 0;

/**
 * Find boss match with caching
 * @param {string} input - User input
 * @param {Object} bossPoints - Boss points database
 * @returns {string|null} Matched boss name
 */
function findBossMatchCached(input, bossPoints) {
  const cacheKey = `${input.toLowerCase().trim()}`;

  // Check cache first
  if (fuzzyMatchCache.has(cacheKey)) {
    cacheHits++;
    const cached = fuzzyMatchCache.get(cacheKey);
    debug('Fuzzy match cache hit', { input, result: cached });
    return cached;
  }

  cacheMisses++;

  const q = input.toLowerCase().trim();

  // Exact match first
  for (const name of Object.keys(bossPoints)) {
    if (name.toLowerCase() === q) {
      fuzzyMatchCache.set(cacheKey, name);
      return name;
    }
    const meta = bossPoints[name];
    for (const alias of meta.aliases || []) {
      if (alias.toLowerCase() === q) {
        fuzzyMatchCache.set(cacheKey, name);
        return name;
      }
    }
  }

  // Partial match (contains)
  for (const name of Object.keys(bossPoints)) {
    if (name.toLowerCase().includes(q) || q.includes(name.toLowerCase())) {
      fuzzyMatchCache.set(cacheKey, name);
      return name;
    }
    const meta = bossPoints[name];
    for (const alias of meta.aliases || []) {
      if (alias.toLowerCase().includes(q) || q.includes(alias.toLowerCase())) {
        fuzzyMatchCache.set(cacheKey, name);
        return name;
      }
    }
  }

  // Fuzzy match with adaptive threshold
  let best = { name: null, dist: 999 };
  for (const name of Object.keys(bossPoints)) {
    const dist = levenshtein.get(q, name.toLowerCase());
    if (dist < best.dist) best = { name, dist };
    for (const alias of bossPoints[name].aliases || []) {
      const d2 = levenshtein.get(q, alias.toLowerCase());
      if (d2 < best.dist) best = { name, dist: d2 };
    }
  }

  // Adaptive threshold: allow more errors for longer names
  const maxAllowedDistance = Math.max(
    LIMITS.FUZZY_MATCH_MAX_DISTANCE,
    Math.floor(q.length / 4)
  );

  const result = best.dist <= maxAllowedDistance ? best.name : null;
  fuzzyMatchCache.set(cacheKey, result);

  return result;
}

/**
 * Generic cache getter with TTL support
 * @param {string} key - Cache key
 * @param {Function} generator - Function to generate value if not cached
 * @param {number} ttl - Time to live in milliseconds
 * @returns {Promise<*>} Cached or generated value
 */
async function getCached(key, generator, ttl = TIMING.CACHE_REFRESH_INTERVAL) {
  const cached = generalCache.get(key);

  if (cached && Date.now() - cached.timestamp < ttl) {
    cacheHits++;
    debug('General cache hit', { key });
    return cached.value;
  }

  cacheMisses++;
  const value = await generator();

  generalCache.set(key, {
    value,
    timestamp: Date.now()
  });

  // Auto-cleanup after TTL
  setTimeout(() => {
    generalCache.delete(key);
  }, ttl);

  return value;
}

/**
 * Set cache entry manually
 * @param {string} key - Cache key
 * @param {*} value - Value to cache
 * @param {number} ttl - Time to live in milliseconds
 */
function setCache(key, value, ttl = TIMING.CACHE_REFRESH_INTERVAL) {
  generalCache.set(key, {
    value,
    timestamp: Date.now()
  });

  // Auto-cleanup after TTL
  setTimeout(() => {
    generalCache.delete(key);
  }, ttl);
}

/**
 * Invalidate cache entry or pattern
 * @param {string} keyOrPattern - Cache key or pattern to match
 */
function invalidateCache(keyOrPattern) {
  if (generalCache.has(keyOrPattern)) {
    generalCache.delete(keyOrPattern);
    debug('Invalidated cache entry', { key: keyOrPattern });
    return;
  }

  // Pattern matching
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
 * Clear fuzzy match cache
 */
function clearFuzzyMatchCache() {
  fuzzyMatchCache.clear();
  debug('Cleared fuzzy match cache');
}

/**
 * Clear general cache
 */
function clearGeneralCache() {
  generalCache.clear();
  debug('Cleared general cache');
}

/**
 * Clear all caches
 */
function clearAllCaches() {
  fuzzyMatchCache.clear();
  generalCache.clear();
  cacheHits = 0;
  cacheMisses = 0;
  debug('Cleared all caches');
}

/**
 * Get cache statistics
 * @returns {Object} Cache statistics
 */
function getCacheStats() {
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
    fuzzyMatchKeys: Array.from(fuzzyMatchCache.keys()).slice(0, 10),
    generalCacheKeys: Array.from(generalCache.keys()).slice(0, 10)
  };
}

/**
 * Periodic cache cleanup to prevent memory leaks
 */
function startCacheCleanup() {
  setInterval(() => {
    const now = Date.now();

    // Clean up expired general cache entries
    for (const [key, entry] of generalCache) {
      if (now - entry.timestamp > TIMING.CACHE_REFRESH_INTERVAL) {
        generalCache.delete(key);
      }
    }

    // Limit fuzzy match cache size (keep most recent 1000 entries)
    if (fuzzyMatchCache.size > 1000) {
      const entries = Array.from(fuzzyMatchCache.entries());
      fuzzyMatchCache.clear();

      // Keep only the last 500 entries
      for (const [key, value] of entries.slice(-500)) {
        fuzzyMatchCache.set(key, value);
      }
    }

    debug('Cache cleanup completed', getCacheStats());
  }, TIMING.CLEANUP_INTERVAL);
}

module.exports = {
  findBossMatchCached,
  getCached,
  setCache,
  invalidateCache,
  clearFuzzyMatchCache,
  clearGeneralCache,
  clearAllCaches,
  getCacheStats,
  startCacheCleanup
};
