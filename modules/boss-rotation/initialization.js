/**
 * Initialization for the boss rotation system.
 * Handles config loading, sheet setup, cache refresh, and scheduler registration.
 */

const { SheetAPI } = require('../../utils/sheet-api');
const shutdownManager = require('../../utils/shutdown-manager');
const cron = require('node-cron');
const state = require('./state');
const { spawnMonitor } = require('./spawn-monitor');
const scheduleBosses = require('./schedule-bosses');

/**
 * Initializes the boss rotation system
 * @param {Object} cfg - Bot configuration from config.json
 * @param {Client} discordClient - Discord.js client instance
 * @param {Object} bossTimer - Boss timer module for spawn time tracking
 */
async function initialize(cfg, discordClient, bossTimer = null) {
  state.config = cfg;
  state.client = discordClient;
  state.bossTimerModule = bossTimer;
  state.sheetAPI = new SheetAPI(cfg.sheet_webhook_url);

  console.log('✅ Boss Rotation System initialized');

  // Ensure BossRotation sheet exists on startup
  await ensureRotationSheetExists();

  // Load initial rotation status (MUST finish before daily schedule posts)
  console.log('⏳ Loading rotation cache before starting schedulers...');
  await scheduleBosses.refreshRotationCache();
  console.log('✅ Rotation cache loaded - ready to post daily schedules');

  // If no rotating bosses configured, skip all timers and schedules
  if (state.ROTATING_BOSSES.length === 0) {
    console.log('⏭️ No rotating bosses configured - rotation system disabled (skip timers, cron, reminders)');
    console.log('   Add bosses to the BossRotation sheet and run !rotation refresh to enable');
    return;
  }

  // Start spawn warning monitor if boss timer available
  if (state.bossTimerModule) {
    spawnMonitor.startSpawnMonitor();
    console.log('🔔 Rotation spawn monitor started (checks every 5 minutes for 15-min warnings)');
  } else {
    console.warn('⚠️ Boss timer not provided - rotation warnings disabled');
  }

  // Start automatic rotation list refresh (every 6 hours)
  const rotationRefreshTimer = setInterval(async () => {
    try {
      state.logger.info('⏰ [AUTO-REFRESH] Starting scheduled rotation cache refresh (6-hour interval)');
      await scheduleBosses.refreshRotationCache();
      state.logger.info('✅ [AUTO-REFRESH] Rotation cache refresh complete');
    } catch (error) {
      state.logger.error('❌ [AUTO-REFRESH] Failed to refresh rotation cache:', error.message);
    }
  }, 6 * 60 * 60 * 1000);

  shutdownManager.registerInterval('boss-rotation-refresh', rotationRefreshTimer, { frequency: '6 hours' });
  state.logger.info('✅ Automatic rotation refresh scheduled (every 6 hours)');

  // Schedule daily rotation summary at 12:00 AM Manila time (UTC+8)
  cron.schedule('0 0 * * *', async () => {
    try {
      state.logger.info('⏰ [DAILY-SCHEDULE] Running daily rotation schedule (12:00 AM Manila time)');
      await scheduleBosses.postDailyRotationSchedule();
      state.logger.info('✅ [DAILY-SCHEDULE] Daily rotation schedule posted');
    } catch (error) {
      state.logger.error('❌ [DAILY-SCHEDULE] Failed to post daily rotation schedule:', error.message);
    }
  }, {
    scheduled: true,
    timezone: "Asia/Manila"
  });

  state.logger.info('✅ Daily rotation schedule configured (posts at 12:00 AM Manila time)');

  // Restore daily schedule tracking from MongoDB (in case of bot restart)
  await scheduleBosses.restoreDailyScheduleFromMongoDB();

  // Clean up old daily schedules from MongoDB (every 6 hours)
  const scheduleCleanupTimer = setInterval(async () => {
    try {
      await scheduleBosses.cleanupOldSchedules();
    } catch (err) {
      state.logger.error('⚠️ Failed to clean up old schedules:', err.message);
    }
  }, 6 * 60 * 60 * 1000);

  shutdownManager.registerInterval('boss-rotation-schedule-cleanup', scheduleCleanupTimer, { frequency: '6 hours' });

  // Also run cleanup on startup
  const startupCleanupTimer = setTimeout(async () => {
    try {
      state.logger.info('🧹 Running startup cleanup for old daily schedules...');
      await scheduleBosses.cleanupOldSchedules();
    } catch (err) {
      state.logger.error('⚠️ Failed startup cleanup:', err.message);
    }
  }, 10000);

  shutdownManager.registerTimeout('boss-rotation-startup-cleanup', startupCleanupTimer, { delay: '10 seconds' });
}

/**
 * Ensures the BossRotation sheet exists in Google Sheets
 * Auto-creates if missing
 */
async function ensureRotationSheetExists() {
  try {
    const result = await state.sheetAPI.call('ensureBossRotationSheetExists');
    if (result.status === 'ok') {
      console.log('✅ BossRotation sheet ready');
    } else {
      console.error('❌ Failed to ensure BossRotation sheet exists:', result.message);
    }
  } catch (err) {
    console.error('❌ Error ensuring BossRotation sheet:', err.message);
  }
}

module.exports = {
  initialize,
  ensureRotationSheetExists
};
