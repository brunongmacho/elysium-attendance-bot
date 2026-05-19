/**
 * Constants for the boss rotation system.
 */

/** Refresh rotation cache from sheets every 5 minutes */
const CACHE_REFRESH_INTERVAL = 5 * 60 * 1000;

/** Check for upcoming spawns every 5 minutes */
const SPAWN_CHECK_INTERVAL = 5 * 60 * 1000;

/** Warn when spawn is 15 minutes away */
const WARNING_WINDOW_MINUTES = 15;

module.exports = {
  CACHE_REFRESH_INTERVAL,
  SPAWN_CHECK_INTERVAL,
  WARNING_WINDOW_MINUTES
};
