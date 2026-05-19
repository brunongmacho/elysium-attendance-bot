/**
 * Shared state for the boss timer system.
 * All sub-modules access state through this module.
 */

// ============================================================================
// BOSS KILL TIMES CACHE
// ============================================================================
/**
 * Map<bossName, {
 *   killTime: Date,
 *   nextSpawn: Date,
 *   timerId: setTimeout ID,
 *   killedBy: string
 * }>
 */
const bossKillTimes = new Map();

// ============================================================================
// SCHEDULED BOSS TIMERS
// ============================================================================
/**
 * Map<bossName, {
 *   nextSpawn: Date,
 *   timerId: setTimeout ID
 * }>
 */
const scheduledBossTimers = new Map();

// ============================================================================
// SERVER DOWN STATE
// ============================================================================
let isServerDown = false;

// ============================================================================
// RECENTLY HANDLED BOSSES
// ============================================================================
/**
 * Map<bossName, {
 *   handledAt: Date,
 *   spawnTime: Date,
 *   threadId: string,
 *   clearTimeoutId: setTimeout ID
 * }>
 */
const recentlyHandledBosses = new Map();

// ============================================================================
// CONFIGURATION
// ============================================================================
let bossSpawnConfig = null;

// ============================================================================
// EXTERNAL MODULE REFERENCES (injected on init)
// ============================================================================
let sheetAPI = null;
let attendance = null;
let client = null;
let config = null;

// ============================================================================
// INJECTION
// ============================================================================
function setExternalModules(discordClient, botConfig, sheetAPIInstance, attendanceModule) {
  client = discordClient;
  config = botConfig;
  sheetAPI = sheetAPIInstance;
  attendance = attendanceModule;
}

function setBossSpawnConfig(cfg) {
  bossSpawnConfig = cfg;
}

// ============================================================================
// EXPORTS
// ============================================================================
module.exports = {
  bossKillTimes,
  scheduledBossTimers,
  get isServerDown() { return isServerDown; },
  set isServerDown(val) { isServerDown = val; },
  recentlyHandledBosses,
  get bossSpawnConfig() { return bossSpawnConfig; },
  get sheetAPI() { return sheetAPI; },
  get attendance() { return attendance; },
  get client() { return client; },
  get config() { return config; },
  setExternalModules,
  setBossSpawnConfig,
};
