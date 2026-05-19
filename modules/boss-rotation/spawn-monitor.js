/**
 * Timer-based boss logic: spawn monitoring interval and warning checks.
 * Monitors upcoming spawns using boss timer data and sends rotation warnings.
 */

const { SPAWN_CHECK_INTERVAL, WARNING_WINDOW_MINUTES } = require('./constants');
const state = require('./state');
const { scheduleBosses } = require('./schedule-bosses');
const shutdownManager = require('../../utils/shutdown-manager');

/**
 * Start periodic spawn monitoring for rotation warnings
 * Prevents duplicate timers by clearing any existing interval first
 */
function startSpawnMonitor() {
  if (state.spawnMonitorTimer) {
    clearInterval(state.spawnMonitorTimer);
    console.log('⚠️ Cleared existing spawn monitor timer (preventing duplicates)');
  }

  // Run check immediately on startup
  checkUpcomingSpawns();

  state.spawnMonitorTimer = setInterval(() => {
    checkUpcomingSpawns();
  }, SPAWN_CHECK_INTERVAL);
  shutdownManager.registerInterval('spawn-monitor', state.spawnMonitorTimer, { frequency: '5 minutes' });

  console.log(`✅ Spawn monitor started (checking every ${SPAWN_CHECK_INTERVAL / 60000} minutes)`);
}

/**
 * Check if any rotating bosses will spawn soon and send warnings if it's our rotation
 */
async function checkUpcomingSpawns() {
  try {
    if (!state.bossTimerModule) return;

    for (const bossName of state.ROTATING_BOSSES) {
      try {
        let spawnTime = null;

        if (state.bossTimerModule) {
          const timerData = state.bossTimerModule.getNextSpawn(bossName);
          if (timerData && timerData.nextSpawn) {
            spawnTime = timerData.nextSpawn;
          }
        }

        if (!spawnTime) continue;

        const now = new Date();
        const predictedTime = spawnTime;
        const minutesUntilSpawn = (predictedTime - now) / (1000 * 60);

        if (minutesUntilSpawn >= WARNING_WINDOW_MINUTES && minutesUntilSpawn <= (WARNING_WINDOW_MINUTES + 5)) {
          const timestampKey = predictedTime.toISOString().slice(0, 16);
          const spawnKey = `${bossName}::${timestampKey}`;

          if (state.warnedSpawns[spawnKey]) continue;

          const rotation = await scheduleBosses.getRotationStatus(bossName);

          if (rotation.isRotating && rotation.isOurTurn) {
            await scheduleBosses.sendRotationWarning(bossName, predictedTime);

            state.warnedSpawns[spawnKey] = now.getTime();

            console.log(`🟢 Sent 15-min rotation warning for ${bossName} (our turn, spawning at ${predictedTime.toISOString()})`);
          }
        }

        // Clean up old warned spawns (older than 2 hours)
        const twoHoursAgo = now.getTime() - (2 * 60 * 60 * 1000);
        for (const key in state.warnedSpawns) {
          const warnTime = state.warnedSpawns[key];
          if (typeof warnTime === 'number' && warnTime < twoHoursAgo) {
            delete state.warnedSpawns[key];
          }
        }

      } catch (bossError) {
        console.error(`❌ Error checking spawn for ${bossName}:`, bossError.message);
      }
    }

  } catch (err) {
    console.error('❌ Error in spawn monitor:', err.message);
  }
}

module.exports = {
  startSpawnMonitor,
  checkUpcomingSpawns
};
