/**
 * ============================================================================
 * BOSS TIMER MODULE
 * ============================================================================
 *
 * Self-sufficient boss spawn timer system.
 * Entry point that wires all sub-modules together and re-exports the public API.
 *
 * @module boss-timer
 * @author Elysium Attendance Bot Team
 * ============================================================================
 */

// Load sub-modules
const state = require('./state');
const { initialize } = require('./initialization');
const {
  findBossName,
  getBossType,
  getNextScheduledSpawn,
  parseKillTime,
  recordKill,
  setSpawnTime,
  getNextSpawn,
  getUpcomingSpawns,
  getAllTimers,
  cancelTimer,
  formatCountdown,
} = require('./spawn-tracking');
const {
  serverDown,
  getServerDownStatus,
  maintenance,
  clearKills,
  handleNoSpawn,
  handleSpawned,
  wasRecentlyHandled,
  addToRecentlyHandled,
} = require('./admin-commands');
const {
  clearBossTimerOnSpawn,
} = require('./cleanup');
const {
  scheduleReminder,
  triggerSpawnReminder,
} = require('./thread-management');

// ============================================================================
// PUBLIC API - Re-exports matching the original boss-timer.js exports
// ============================================================================
module.exports = {
  initialize,
  recordKill,
  setSpawnTime,
  getNextSpawn,
  getUpcomingSpawns,
  cancelTimer,
  handleNoSpawn,
  handleSpawned,
  maintenance,
  serverDown,
  getServerDownStatus,
  clearKills,
  getAllTimers,
  findBossName,
  parseKillTime,
  wasRecentlyHandled,
  addToRecentlyHandled,
  getBossType,
  getNextScheduledSpawn,
  formatCountdown,
  clearBossTimerOnSpawn,
  bossKillTimes: state.bossKillTimes,
};
