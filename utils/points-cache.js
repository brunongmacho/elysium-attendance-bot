/**
 * ============================================================================
 * POINTS CACHE MODULE
 * ============================================================================
 *
 * Provides high-performance bidding points lookup with O(1) complexity.
 * Optimizes the inefficient Object.keys().find() pattern used throughout
 * the bot for case-insensitive username lookups.
 *
 * Performance Benefits:
 * - O(1) lookup instead of O(n) iteration through all keys
 * - Case-insensitive matching without repeated toLowerCase() calls
 * - Pre-built lookup map for instant username resolution
 *
 * Usage:
 * ```javascript
 * const pointsCache = new PointsCache(pointsData);
 * const userPoints = pointsCache.getPoints(username); // Fast O(1) lookup
 * ```
 *
 * @module utils/points-cache
 * @author Elysium Attendance Bot Team
 * @version 1.0
 * ============================================================================
 */

/**
 * High-performance cache for bidding points lookups.
 *
 * This class wraps a points object (username -> points mapping) and provides
 * efficient O(1) case-insensitive lookups using a pre-built Map structure.
 *
 * OLD APPROACH (O(n)):
 * ```javascript
 * const match = Object.keys(points).find(
 *   (n) => n.toLowerCase() === username.toLowerCase()
 * );
 * const userPoints = match ? points[match] : 0;
 * ```
 *
 * NEW APPROACH (O(1)):
 * ```javascript
 * const pointsCache = new PointsCache(points);
 * const userPoints = pointsCache.getPoints(username);
 * ```
 *
 * @class PointsCache
 * @example
 * const points = { "Player1": 100, "Player2": 200 };
 * const cache = new PointsCache(points);
 *
 * console.log(cache.getPoints("player1")); // 100 (case-insensitive)
 * console.log(cache.getPoints("Player2")); // 200 (exact match)
 * console.log(cache.getPoints("Unknown")); // 0 (not found)
 */
class PointsCache {
  /**
   * Creates a new PointsCache instance.
   *
   * Builds internal lookup maps for fast O(1) access:
   * - data: Map of actual usernames to points
   * - lowerCaseMap: Map of lowercase usernames to actual usernames
   *
   * @constructor
   * @param {Object} pointsData - Object mapping usernames to point values
   *   Example: { "Player1": 100, "Player2": 200 }
   */
  constructor(pointsData) {
    // Main data store: actual username -> points
    this.data = new Map();

    // Lookup map: lowercase username -> actual username
    // This allows O(1) case-insensitive lookups
    this.lowerCaseMap = new Map();

    // Handle null/undefined input gracefully
    if (!pointsData) {
      return;
    }

    // Build both maps from input data
    for (const [name, points] of Object.entries(pointsData)) {
      // Store exact username mapping
      this.data.set(name, points);

      // Store lowercase mapping for case-insensitive lookups
      // If there are duplicate lowercase names, the last one wins
      // (This matches the existing behavior of Object.keys().find())
      this.lowerCaseMap.set(name.toLowerCase(), name);
    }
  }

  /**
   * Get points for a user with case-insensitive matching.
   *
   * Performs fast O(1) lookup using pre-built maps:
   * 1. Try exact match first (fastest)
   * 2. Try case-insensitive match via lowerCaseMap
   * 3. Return 0 if not found
   *
   * This matches the existing behavior where unknown users get 0 points
   * and are allowed to bid (with a warning).
   *
   * @method getPoints
   * @param {string} username - Username to lookup (case-insensitive)
   * @returns {number} Points for the user, or 0 if not found
   *
   * @example
   * const cache = new PointsCache({ "Player1": 100 });
   *
   * cache.getPoints("Player1");  // 100 (exact match)
   * cache.getPoints("player1");  // 100 (case-insensitive)
   * cache.getPoints("PLAYER1");  // 100 (case-insensitive)
   * cache.getPoints("Unknown");  // 0 (not found)
   */
  getPoints(username) {
    // Fast path: Try exact match first
    if (this.data.has(username)) {
      return this.data.get(username) || 0;
    }

    // Slow path: Case-insensitive lookup
    const lowerUsername = username.toLowerCase();
    const actualName = this.lowerCaseMap.get(lowerUsername);

    if (actualName) {
      return this.data.get(actualName) || 0;
    }

    // User not found - return 0 (matches existing behavior)
    return 0;
  }

  /**
   * Get the actual username (with proper casing) for a given input.
   *
   * This is useful when you need to know the canonical username
   * from a case-insensitive input.
   *
   * @method getActualUsername
   * @param {string} username - Username to lookup (case-insensitive)
   * @returns {string|null} Actual username with proper casing, or null if not found
   *
   * @example
   * const cache = new PointsCache({ "Player1": 100 });
   *
   * cache.getActualUsername("player1");  // "Player1"
   * cache.getActualUsername("PLAYER1");  // "Player1"
   * cache.getActualUsername("Unknown");  // null
   */
  getActualUsername(username) {
    // Fast path: Try exact match first
    if (this.data.has(username)) {
      return username;
    }

    // Slow path: Case-insensitive lookup
    const lowerUsername = username.toLowerCase();
    return this.lowerCaseMap.get(lowerUsername) || null;
  }

  /**
   * Check if a user exists in the cache (case-insensitive).
   *
   * @method hasUser
   * @param {string} username - Username to check (case-insensitive)
   * @returns {boolean} True if user exists, false otherwise
   *
   * @example
   * const cache = new PointsCache({ "Player1": 100 });
   *
   * cache.hasUser("Player1");   // true
   * cache.hasUser("player1");   // true
   * cache.hasUser("Unknown");   // false
   */
  hasUser(username) {
    return this.data.has(username) ||
           this.lowerCaseMap.has(username.toLowerCase());
  }

  /**
   * Get the number of users in the cache.
   *
   * @method size
   * @returns {number} Number of users in the cache
   *
   * @example
   * const cache = new PointsCache({ "Player1": 100, "Player2": 200 });
   * console.log(cache.size()); // 2
   */
  size() {
    return this.data.size;
  }

  /**
   * Get all usernames in the cache.
   *
   * Returns an array of all usernames (with original casing) stored in the cache.
   * This is useful for operations that need to iterate over all users.
   *
   * @method getAllUsernames
   * @returns {string[]} Array of all usernames
   *
   * @example
   * const cache = new PointsCache({ "Player1": 100, "Player2": 200 });
   * console.log(cache.getAllUsernames()); // ["Player1", "Player2"]
   */
  getAllUsernames() {
    return Array.from(this.data.keys());
  }

  /**
   * Get all entries as an array of [username, points] pairs.
   *
   * Returns an array similar to Object.entries() for compatibility with
   * existing code that needs to iterate over username-points pairs.
   *
   * @method entries
   * @returns {Array<[string, number]>} Array of [username, points] pairs
   *
   * @example
   * const cache = new PointsCache({ "Player1": 100, "Player2": 200 });
   * console.log(cache.entries()); // [["Player1", 100], ["Player2", 200]]
   */
  entries() {
    return Array.from(this.data.entries());
  }

  /**
   * Convert back to plain object format.
   *
   * Useful when you need to pass the data to functions that expect
   * the old object format.
   *
   * @method toObject
   * @returns {Object} Plain object mapping usernames to points
   *
   * @example
   * const cache = new PointsCache({ "Player1": 100 });
   * const obj = cache.toObject(); // { "Player1": 100 }
   */
  toObject() {
    const result = {};
    for (const [name, points] of this.data) {
      result[name] = points;
    }
    return result;
  }
}

/**
 * Helper function to create a PointsCache from points data.
 *
 * This is a convenience function for when you want to create a cache
 * inline without using the 'new' keyword.
 *
 * @function createPointsCache
 * @param {Object} pointsData - Object mapping usernames to point values
 * @returns {PointsCache} New PointsCache instance
 *
 * @example
 * const cache = createPointsCache({ "Player1": 100 });
 */
function createPointsCache(pointsData) {
  return new PointsCache(pointsData);
}

// ============================================================================
// MODULE EXPORTS
// ============================================================================

module.exports = {
  PointsCache,
  createPointsCache
};
