/**
 * Core spawn tracking logic for the boss timer system.
 * Handles kill recording, spawn calculation, time parsing, and boss matching.
 */

const path = require('path');
const fs = require('fs');
const mongoHelpers = require('../../utils/mongodb-helpers');
const { deleteRecoveryData } = require('./cleanup');
const state = require('./state');
const { TIMEZONE_OFFSET, REMINDER_MINUTES_BEFORE } = require('./constants');

// ============================================================================
// BOSS NAME MATCHING
// ============================================================================

/**
 * Find boss name from user input (case-insensitive, supports partial/fuzzy matching)
 * @param {string} input - User input
 * @returns {string|null} Matched boss name or null
 */
function findBossName(input) {
  const normalized = input.toLowerCase().trim();
  const allBosses = [];

  // Collect all boss names
  for (const boss of Object.keys(state.bossSpawnConfig.timerBasedBosses)) {
    if (!boss.startsWith('_')) allBosses.push(boss);
  }
  for (const boss of Object.keys(state.bossSpawnConfig.scheduleBasedBosses)) {
    if (!boss.startsWith('_')) allBosses.push(boss);
  }

  // 1. Exact match (case-insensitive)
  for (const boss of allBosses) {
    if (boss.toLowerCase() === normalized) return boss;
  }

  // 2. Starts with match
  for (const boss of allBosses) {
    if (boss.toLowerCase().startsWith(normalized)) return boss;
  }

  // 3. Contains match
  for (const boss of allBosses) {
    if (boss.toLowerCase().includes(normalized)) return boss;
  }

  // 4. Any word starts with input
  for (const boss of allBosses) {
    const words = boss.toLowerCase().split(' ');
    for (const word of words) {
      if (word.startsWith(normalized)) return boss;
    }
  }

  return null;
}

/**
 * Get boss type (timer or schedule)
 * @param {string} bossName - Boss name
 * @returns {string} 'timer' | 'schedule' | null
 */
function getBossType(bossName) {
  if (state.bossSpawnConfig.timerBasedBosses[bossName]) return 'timer';
  if (state.bossSpawnConfig.scheduleBasedBosses[bossName]) return 'schedule';
  return null;
}

/**
 * Get next scheduled spawn time for a schedule-based boss
 * @param {string} bossName - Boss name
 * @returns {Date|null} Next scheduled spawn time
 */
function getNextScheduledSpawn(bossName) {
  const bossConfig = state.bossSpawnConfig.scheduleBasedBosses[bossName];
  if (!bossConfig || !bossConfig.schedules) return null;
  return findNextScheduledTime(bossConfig.schedules);
}

// ============================================================================
// TIME PARSING
// ============================================================================

/**
 * Parse kill time from user input (times are in GMT+8 / Asia/Manila)
 * Supports formats: "9:15", "21:30", "9:15am", "9:15pm", "9:15 AM", "9:15 PM"
 * @param {string} timeStr - Time string
 * @param {string} dateStr - Date string (e.g., "01/19", "12/31")
 * @returns {Date} Parsed kill time in UTC
 */
function parseKillTime(timeStr, dateStr) {
  const now = new Date();
  const gmt8Now = new Date(now.getTime() + TIMEZONE_OFFSET * 60 * 60 * 1000);

  let year = gmt8Now.getUTCFullYear();
  let month = gmt8Now.getUTCMonth();
  let day = gmt8Now.getUTCDate();
  let hours = gmt8Now.getUTCHours();
  let minutes = gmt8Now.getUTCMinutes();

  if (timeStr) {
    const normalizedTime = timeStr.trim().toLowerCase();
    const isPM = /p\.?m\.?$/i.test(normalizedTime) || normalizedTime.includes('pm');
    const isAM = /a\.?m\.?$/i.test(normalizedTime) || normalizedTime.includes('am');
    const cleanTime = normalizedTime.replace(/\s*(a\.?m\.?|p\.?m\.?)\s*/gi, '').trim();
    const timeParts = cleanTime.split(':');

    hours = parseInt(timeParts[0], 10) || 0;
    minutes = parseInt(timeParts[1], 10) || 0;

    if (isPM && hours !== 12) hours += 12;
    if (isAM && hours === 12) hours = 0;
  }

  if (dateStr) {
    const [m, d] = dateStr.split('/').map(Number);
    month = m - 1;
    day = d;
  }

  const gmt8Timestamp = Date.UTC(year, month, day, hours, minutes, 0, 0);
  const utcTimestamp = gmt8Timestamp - (TIMEZONE_OFFSET * 60 * 60 * 1000);

  return new Date(utcTimestamp);
}

// ============================================================================
// SPAWN TIME CALCULATION
// ============================================================================

/**
 * Calculate next spawn time for a boss
 * @param {string} bossName - Boss name
 * @param {Date} killTime - Kill time
 * @returns {Object} { nextSpawn: Date, skippedSpawns: number }
 */
function calculateNextSpawn(bossName, killTime) {
  const bossType = getBossType(bossName);
  const now = new Date();

  if (bossType === 'timer') {
    const intervalHours = state.bossSpawnConfig?.timerBasedBosses?.[bossName]?.spawnIntervalHours;
    if (!intervalHours || intervalHours <= 0) {
      console.error(`❌ Invalid spawnIntervalHours for ${bossName}: ${intervalHours}`);
      return { nextSpawn: killTime, skippedSpawns: 0 };
    }
    const intervalMs = intervalHours * 60 * 60 * 1000;
    let nextSpawn = new Date(killTime.getTime() + intervalMs);
    let skippedSpawns = 0;

    while (nextSpawn < now) {
      nextSpawn = new Date(nextSpawn.getTime() + intervalMs);
      skippedSpawns++;
    }

    return { nextSpawn, skippedSpawns };
  } else if (bossType === 'schedule') {
    const schedules = state.bossSpawnConfig?.scheduleBasedBosses?.[bossName]?.schedules;
    if (!schedules) {
      console.error(`❌ No schedules found for ${bossName}`);
      return { nextSpawn: null, skippedSpawns: 0 };
    }
    return { nextSpawn: findNextScheduledTime(schedules), skippedSpawns: 0 };
  }

  throw new Error(`Unknown boss type for ${bossName}`);
}

/**
 * Find next scheduled spawn time for schedule-based boss
 * Schedule times are in GMT+8 (Asia/Manila)
 * @param {Array} schedules - Array of {day, time, dayOfWeek}
 * @returns {Date} Next scheduled spawn time (in UTC)
 */
function findNextScheduledTime(schedules) {
  const now = new Date();
  const gmt8Now = new Date(now.getTime() + TIMEZONE_OFFSET * 60 * 60 * 1000);
  let nextSpawn = null;

  for (const schedule of schedules) {
    const [hours, minutes] = schedule.time.split(':').map(Number);

    const currentYear = gmt8Now.getUTCFullYear();
    const currentMonth = gmt8Now.getUTCMonth();
    const currentDate = gmt8Now.getUTCDate();
    const currentDay = gmt8Now.getUTCDay();
    const targetDay = schedule.dayOfWeek;

    let daysUntilSpawn = targetDay - currentDay;

    if (daysUntilSpawn < 0) {
      daysUntilSpawn += 7;
    } else if (daysUntilSpawn === 0) {
      const currentHour = gmt8Now.getUTCHours();
      const currentMinute = gmt8Now.getUTCMinutes();
      if (hours < currentHour || (hours === currentHour && minutes <= currentMinute)) {
        daysUntilSpawn = 7;
      }
    }

    const spawnDay = currentDate + daysUntilSpawn;
    const gmt8Timestamp = Date.UTC(currentYear, currentMonth, spawnDay, hours, minutes, 0, 0);
    const utcTimestamp = gmt8Timestamp - (TIMEZONE_OFFSET * 60 * 60 * 1000);
    const spawnDate = new Date(utcTimestamp);

    if (!nextSpawn || spawnDate < nextSpawn) {
      nextSpawn = spawnDate;
    }
  }

  return nextSpawn;
}

// ============================================================================
// FORMATTING
// ============================================================================

/**
 * Format a Date in GMT+8 for display
 * @param {Date} date - Date to format
 * @returns {string} Formatted date string in GMT+8
 */
function formatGMT8(date) {
  return date.toLocaleString('en-US', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  });
}

/**
 * Format a countdown string with appropriate precision
 * @param {number} timestamp - Unix timestamp in seconds
 * @returns {string} Formatted countdown string
 */
function formatCountdown(timestamp) {
  const now = Math.floor(Date.now() / 1000);
  const diff = timestamp - now;

  if (diff <= 0) {
    return 'now';
  }

  const minutes = Math.floor(diff / 60) % 60;
  const hours = Math.floor(diff / 3600) % 24;
  const days = Math.floor(diff / 86400);

  if (days > 0) {
    if (hours > 0) {
      return `in ${days} day${days !== 1 ? 's' : ''} ${hours} hr${hours !== 1 ? 's' : ''}`;
    }
    return `in ${days} day${days !== 1 ? 's' : ''}`;
  } else if (hours > 0) {
    if (minutes > 0) {
      return `in ${hours} hr${hours !== 1 ? 's' : ''} ${minutes} min${minutes !== 1 ? 's' : ''}`;
    }
    return `in ${hours} hr${hours !== 1 ? 's' : ''}`;
  } else {
    return `in ${minutes} min${minutes !== 1 ? 's' : ''}`;
  }
}

// ============================================================================
// TIMER SCHEDULING (forwarded to thread-management to avoid circular deps)
// ============================================================================

let scheduleReminderFn = null;
let rescheduleScheduleBasedBossFn = null;

function setScheduleReminderFn(fn) { scheduleReminderFn = fn; }
function setRescheduleScheduleBasedBossFn(fn) { rescheduleScheduleBasedBossFn = fn; }

// ============================================================================
// KILL RECORDING
// ============================================================================

/**
 * Record boss kill and schedule next spawn
 * @param {string} bossName - Boss name
 * @param {Date} killTime - Kill time
 * @param {string} killedBy - Username who recorded kill
 * @returns {Promise<Object>} Result with nextSpawn
 */
async function recordKill(bossName, killTime, killedBy) {
  const normalizedName = bossName.toLowerCase();

  // Check if boss already has a timer
  const existing = state.bossKillTimes.get(normalizedName);
  if (existing && existing.timerId) {
    clearTimeout(existing.timerId);
    console.log(`🔄 Overwriting existing timer for ${bossName}`);
  }

  const { nextSpawn, skippedSpawns } = calculateNextSpawn(bossName, killTime);

  if (skippedSpawns > 0) {
    console.log(`⏭️ ${bossName}: Skipped ${skippedSpawns} past spawn(s), next spawn: ${formatGMT8(nextSpawn)}`);
  }

  const timerId = scheduleReminderFn(bossName, nextSpawn);

  state.bossKillTimes.set(normalizedName, {
    killTime,
    nextSpawn,
    timerId,
    killedBy
  });

  await saveRecoveryData(bossName, killTime, nextSpawn, killedBy);

  return { nextSpawn, bossName, skippedSpawns };
}

/**
 * Save recovery data with PARALLEL DUAL-WRITE (MongoDB + Sheets)
 * @param {string} bossName - Boss name
 * @param {Date} killTime - Kill time
 * @param {Date} nextSpawn - Next spawn time
 * @param {string} killedBy - Username
 */
async function saveRecoveryData(bossName, killTime, nextSpawn, killedBy) {
  try {
    if (!killTime || isNaN(killTime.getTime())) {
      console.error(`❌ Invalid killTime for ${bossName}: ${killTime}`);
      return;
    }
    if (!nextSpawn || isNaN(nextSpawn.getTime())) {
      console.error(`❌ Invalid nextSpawn for ${bossName}: ${nextSpawn}`);
      return;
    }

    const mongoSavePromise = (async () => {
      try {
        await mongoHelpers.saveBossTimerData(bossName, killTime, nextSpawn, killedBy);
        return { success: true, source: 'MongoDB' };
      } catch (error) {
        console.error(`❌ MongoDB save failed for ${bossName}:`, error.message);
        return { success: false, source: 'MongoDB', error: error.message };
      }
    })();

    const sheetSavePromise = (async () => {
      try {
        await state.sheetAPI.call('saveBossTimerRecovery', {
          bossName,
          lastKillTime: killTime.toISOString(),
          nextSpawnTime: nextSpawn.toISOString(),
          killedBy
        }, {
          maxRetries: 7,
          rateLimitMaxRetries: 10,
          rateLimitBaseDelay: 20000,
          rateLimitMaxDelay: 300000,
        });
        return { success: true, source: 'Sheets' };
      } catch (error) {
        console.error(`❌ Sheets save failed for ${bossName}:`, error.message);
        return { success: false, source: 'Sheets', error: error.message };
      }
    })();

    const [mongoResult, sheetResult] = await Promise.all([
      mongoSavePromise,
      sheetSavePromise
    ]);

    const overallSuccess = mongoResult.success || sheetResult.success;

    if (overallSuccess) {
      const sources = [];
      if (mongoResult.success) sources.push('MongoDB');
      if (sheetResult.success) sources.push('Sheets');
      console.log(`💾 [DUAL-WRITE] Saved recovery data for ${bossName} (${sources.join(' + ')})`);

      if (mongoResult.success && !sheetResult.success) {
        console.warn(`⚠️ [DUAL-WRITE] Sheets failed but MongoDB succeeded for ${bossName}`);
      } else if (!mongoResult.success && sheetResult.success) {
        console.warn(`⚠️ [DUAL-WRITE] MongoDB failed but Sheets succeeded for ${bossName}`);
      }
    } else {
      console.error(`❌ [DUAL-WRITE] Both saves failed for ${bossName}`);
      console.error(`   MongoDB error: ${mongoResult.error}`);
      console.error(`   Sheets error: ${sheetResult.error}`);
      console.error(`⚠️ Data preserved in local cache, will retry on next save or restart`);
    }
  } catch (error) {
    console.error(`❌ CRITICAL: Unexpected error saving recovery data for ${bossName}:`, error.message);
    console.error(`⚠️ Data preserved in local cache, will retry on next save or restart`);
  }
}

/**
 * Set spawn time directly for a boss (instead of calculating from kill time)
 * @param {string} bossName - Boss name
 * @param {Date} spawnTime - Direct spawn time
 * @param {string} setBy - Username who set the time
 * @returns {Promise<Object>} Result with spawnTime
 */
async function setSpawnTime(bossName, spawnTime, setBy) {
  const normalizedName = bossName.toLowerCase();

  const existing = state.bossKillTimes.get(normalizedName);
  if (existing && existing.timerId) {
    clearTimeout(existing.timerId);
    console.log(`🔄 Overwriting existing timer for ${bossName}`);
  }

  const timerId = scheduleReminderFn(bossName, spawnTime);

  state.bossKillTimes.set(normalizedName, {
    killTime: null,
    nextSpawn: spawnTime,
    timerId,
    killedBy: `set-by-${setBy}`
  });

  await saveRecoveryData(bossName, new Date(), spawnTime, `set-by-${setBy}`);

  return { nextSpawn: spawnTime, bossName };
}

// ============================================================================
// QUERY FUNCTIONS
// ============================================================================

/**
 * Get next spawn time for a boss
 * @param {string} bossName - Boss name
 * @returns {Object|null} {nextSpawn, killTime, killedBy} or null
 */
function getNextSpawn(bossName) {
  const data = state.bossKillTimes.get(bossName.toLowerCase());
  if (data) {
    return {
      nextSpawn: data.nextSpawn,
      killTime: data.killTime,
      killedBy: data.killedBy
    };
  }

  const bossType = getBossType(bossName);
  if (bossType === 'schedule') {
    const schedules = state.bossSpawnConfig?.scheduleBasedBosses?.[bossName]?.schedules;
    if (!schedules) {
      console.error(`❌ No schedules found for ${bossName} (getResetSchedule)`);
      return null;
    }
    return {
      nextSpawn: findNextScheduledTime(schedules),
      killTime: null,
      killedBy: null
    };
  }

  return null;
}

/**
 * Get all upcoming spawns within specified hours
 * Fetches fresh data from MongoDB for accurate real-time results
 * @param {number} hours - Hours to look ahead
 * @returns {Promise<Array>} Array of {bossName, nextSpawn, type}
 */
async function getUpcomingSpawns(hours = 24) {
  const now = new Date();
  const cutoff = new Date(now.getTime() + hours * 60 * 60 * 1000);
  const upcoming = [];

  try {
    const mongoTimers = await mongoHelpers.getAllBossTimers();
    if (mongoTimers && mongoTimers.length > 0) {
      for (const entry of mongoTimers) {
        const nextSpawn = new Date(entry.nextSpawnTime);
        if (!isNaN(nextSpawn.getTime()) && nextSpawn >= now && nextSpawn <= cutoff) {
          upcoming.push({
            bossName: entry.bossName,
            nextSpawn: nextSpawn,
            type: 'timer'
          });
        }
      }
      console.log(`📊 Fetched ${mongoTimers.length} timer-based bosses from MongoDB for !nextspawn`);
    }
  } catch (mongoError) {
    console.warn(`⚠️ MongoDB unavailable for upcoming spawns, using cache: ${mongoError.message}`);
    for (const [bossName, data] of state.bossKillTimes) {
      if (data.nextSpawn >= now && data.nextSpawn <= cutoff) {
        const actualName = findBossName(bossName);
        upcoming.push({
          bossName: actualName,
          nextSpawn: data.nextSpawn,
          type: 'timer'
        });
      }
    }
  }

  for (const [bossName, bossConfig] of Object.entries(state.bossSpawnConfig.scheduleBasedBosses)) {
    if (bossName.startsWith('_')) continue;
    const nextSpawn = findNextScheduledTime(bossConfig.schedules);
    if (nextSpawn >= now && nextSpawn <= cutoff) {
      upcoming.push({
        bossName,
        nextSpawn,
        type: 'schedule'
      });
    }
  }

  upcoming.sort((a, b) => a.nextSpawn - b.nextSpawn);

  return upcoming;
}

/**
 * Get all active timers (for !timers command)
 * @returns {Object} {timerBased, scheduleBased}
 */
function getAllTimers() {
  const timerBased = [];
  const scheduleBased = [];

  for (const [bossName, data] of state.bossKillTimes) {
    const actualName = findBossName(bossName);
    if (getBossType(actualName) === 'timer') {
      timerBased.push({
        bossName: actualName,
        nextSpawn: data.nextSpawn,
        killedBy: data.killedBy
      });
    }
  }

  for (const [bossName, bossConfig] of Object.entries(state.bossSpawnConfig.scheduleBasedBosses)) {
    if (bossName.startsWith('_')) continue;
    const nextSpawn = findNextScheduledTime(bossConfig.schedules);
    scheduleBased.push({
      bossName,
      nextSpawn,
      schedules: bossConfig.schedules
    });
  }

  return { timerBased, scheduleBased };
}

// ============================================================================
// CANCEL TIMER
// ============================================================================

/**
 * Cancel timer for a boss
 * @param {string} bossName - Boss name
 * @returns {Promise<boolean>} True if cancelled
 */
async function cancelTimer(bossName) {
  const normalizedName = bossName.toLowerCase();
  let cancelled = false;

  // Check timer-based bosses
  const timerData = state.bossKillTimes.get(normalizedName);
  if (timerData) {
    if (timerData.timerId) {
      clearTimeout(timerData.timerId);
    }
    state.bossKillTimes.delete(normalizedName);
    cancelled = true;

    // Remove from MongoDB and Sheets (parallel)
    await deleteRecoveryData(bossName, 'cancelled via !unkill');
  }

  // Check scheduled bosses
  const scheduledData = state.scheduledBossTimers.get(normalizedName);
  if (scheduledData) {
    if (scheduledData.timerId) {
      clearTimeout(scheduledData.timerId);
    }
    state.scheduledBossTimers.delete(normalizedName);
    cancelled = true;
  }

  // Clear from recently handled cache if exists
  const recentlyHandled = state.recentlyHandledBosses.get(normalizedName);
  if (recentlyHandled) {
    clearTimeout(recentlyHandled.clearTimeoutId);
    state.recentlyHandledBosses.delete(normalizedName);
    console.log(`🗑️ Cleared ${bossName} from recently-handled cache`);
  }

  return cancelled;
}

// ============================================================================
// EXPORTS
// ============================================================================
module.exports = {
  findBossName,
  getBossType,
  getNextScheduledSpawn,
  parseKillTime,
  calculateNextSpawn,
  findNextScheduledTime,
  formatGMT8,
  formatCountdown,
  recordKill,
  saveRecoveryData,
  setSpawnTime,
  getNextSpawn,
  getUpcomingSpawns,
  getAllTimers,
  cancelTimer,
  setScheduleReminderFn,
  setRescheduleScheduleBasedBossFn,
};
