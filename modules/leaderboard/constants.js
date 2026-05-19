/**
 * Feature flags and constants for the leaderboard system.
 */

/** Feature flag: Enable MongoDB for bidding leaderboard */
const USE_MONGODB_BIDDING = process.env.USE_MONGODB_BIDDING === 'true';

/** Feature flag: Enable MongoDB for attendance leaderboard */
const USE_MONGODB_ATTENDANCE = process.env.USE_MONGODB_ATTENDANCE === 'true';

module.exports = {
  USE_MONGODB_BIDDING,
  USE_MONGODB_ATTENDANCE
};
