/**
 * Bidding Utilities Module
 *
 * Pure utility functions for bidding system that have no dependencies
 * on state or external modules. These are safe, isolated helpers.
 *
 * @module modules/bidding/utilities
 */

/**
 * Formats duration in minutes to human-readable string
 *
 * @param {number} m - Duration in minutes
 * @returns {string} Formatted duration string
 * @example
 * formatDuration(45)   // "45min"
 * formatDuration(90)   // "1h 30min"
 * formatDuration(120)  // "2h"
 */
function formatDuration(m) {
  return m < 60
    ? `${m}min`
    : m % 60 > 0
    ? `${Math.floor(m / 60)}h ${m % 60}min`
    : `${Math.floor(m / 60)}h`;
}

/**
 * Normalizes a Discord username by removing discriminators and converting to lowercase.
 * Handles both old format (Username#1234) and new format (Username).
 *
 * @param {string} username - The username to normalize
 * @returns {string} Normalized username in lowercase
 * @example
 * normalizeUsername("Player#1234")  // "player"
 * normalizeUsername("Player")       // "player"
 * normalizeUsername("PLAYER")       // "player"
 */
function normalizeUsername(username) {
  if (!username) return '';
  // Remove discriminator if present (e.g., "Username#1234" -> "Username")
  const withoutDiscriminator = username.split('#')[0];
  // Convert to lowercase for case-insensitive comparison
  return withoutDiscriminator.toLowerCase().trim();
}

// Export all utilities
module.exports = {
  formatDuration,
  normalizeUsername,
};
