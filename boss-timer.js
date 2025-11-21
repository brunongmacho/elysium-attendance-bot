/**
 * ============================================================================
 * BOSS TIMER MODULE
 * ============================================================================
 *
 * Self-sufficient boss spawn timer system:
 * - Tracks boss kills and calculates spawn times
 * - Schedules 5-minute reminders before spawns
 * - Auto-creates attendance threads
 * - Persists to Google Sheets for crash recovery
 *
 * Features:
 * - Timer-based bosses (22): spawn at kill time + interval
 * - Schedule-based bosses (11): spawn at fixed times
 * - Recovery system: rebuilds timers after restart
 * - Critical data retry: ensures spawn times are never lost
 *
 * @module boss-timer
 * @author Elysium Attendance Bot Team
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');

// ============================================================================
// CONFIGURATION
// ============================================================================

const REMINDER_MINUTES_BEFORE = 5;
const TIMEZONE_OFFSET = 8; // GMT+8

// ============================================================================
// DATA STRUCTURES
// ============================================================================

/**
 * Boss kill times cache - NOT cleared during memory cleanup
 * This is source data, not derived data
 *
 * Map<bossName, {
 *   killTime: Date,
 *   nextSpawn: Date,
 *   timerId: setTimeout ID,
 *   killedBy: string
 * }>
 */
const bossKillTimes = new Map();

/**
 * Recently handled bosses - prevents duplicate threads from external bot
 * Keeps boss in cache for 15 minutes after timer fires
 *
 * Map<bossName, {
 *   handledAt: Date,
 *   spawnTime: Date,
 *   threadId: string,
 *   clearTimeoutId: setTimeout ID
 * }>
 */
const recentlyHandledBosses = new Map();

/**
 * Boss spawn configuration loaded from JSON
 */
let bossSpawnConfig = null;

/**
 * References to external modules (injected on init)
 */
let sheetAPI = null;
let attendance = null;
let client = null;
let config = null;

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize boss timer system
 * @param {Object} discordClient - Discord.js client
 * @param {Object} botConfig - Bot configuration
 * @param {Object} sheetAPIInstance - Sheet API instance
 * @param {Object} attendanceModule - Attendance module
 */
async function initialize(discordClient, botConfig, sheetAPIInstance, attendanceModule) {
  client = discordClient;
  config = botConfig;
  sheetAPI = sheetAPIInstance;
  attendance = attendanceModule;

  // Load boss spawn configuration
  loadBossSpawnConfig();

  // Load recovery data and reschedule timers
  await loadRecoveryAndReschedule();

  console.log('✅ Boss timer system initialized');
}

/**
 * Load boss spawn configuration from JSON
 */
function loadBossSpawnConfig() {
  const configPath = path.join(__dirname, 'boss_spawn_config.json');
  const rawData = fs.readFileSync(configPath, 'utf8');
  bossSpawnConfig = JSON.parse(rawData);
  console.log(`📋 Loaded ${Object.keys(bossSpawnConfig.timerBasedBosses).length} timer-based and ${Object.keys(bossSpawnConfig.scheduleBasedBosses).length} schedule-based bosses`);
}

/**
 * Load recovery data from Sheets and reschedule timers
 */
async function loadRecoveryAndReschedule() {
  try {
    console.log('🔄 Loading boss timer recovery data...');

    const response = await sheetAPI.call('getBossTimerRecovery', {});
    const recoveryData = response?.data || [];

    let rescheduled = 0;
    const now = new Date();

    for (const entry of recoveryData) {
      try {
        const nextSpawn = new Date(entry.nextSpawnTime);

        // Skip if spawn already passed
        if (nextSpawn < now) {
          console.log(`⏭️ Skipping past spawn: ${entry.bossName} (${nextSpawn.toLocaleString()})`);
          continue;
        }

        // Reschedule timer
        const timerId = scheduleReminder(entry.bossName, nextSpawn);

        bossKillTimes.set(entry.bossName.toLowerCase(), {
          killTime: new Date(entry.lastKillTime),
          nextSpawn,
          timerId,
          killedBy: entry.killedBy || 'unknown'
        });

        rescheduled++;
      } catch (error) {
        console.error(`❌ Failed to reschedule ${entry.bossName}:`, error.message);
      }
    }

    // Schedule reminders for schedule-based bosses
    for (const [bossName, bossConfig] of Object.entries(bossSpawnConfig.scheduleBasedBosses)) {
      // Skip metadata keys like _note
      if (bossName.startsWith('_')) continue;
      const nextSpawn = findNextScheduledTime(bossConfig.schedules);
      if (nextSpawn) {
        scheduleReminder(bossName, nextSpawn);
      }
    }

    console.log(`✅ Rescheduled ${rescheduled} boss timers from recovery data`);
  } catch (error) {
    console.error('❌ Failed to load recovery data:', error.message);
    console.log('⚠️ Starting with empty timer cache');
  }
}

// ============================================================================
// BOSS NAME MATCHING
// ============================================================================

/**
 * Find boss name from user input (case-insensitive, handles multi-word)
 * @param {string} input - User input
 * @returns {string|null} Matched boss name or null
 */
function findBossName(input) {
  const normalized = input.toLowerCase().trim();

  // Check timer-based bosses
  for (const boss of Object.keys(bossSpawnConfig.timerBasedBosses)) {
    if (boss.startsWith('_')) continue; // Skip metadata keys
    if (boss.toLowerCase() === normalized) return boss;
  }

  // Check schedule-based bosses
  for (const boss of Object.keys(bossSpawnConfig.scheduleBasedBosses)) {
    if (boss.startsWith('_')) continue; // Skip metadata keys
    if (boss.toLowerCase() === normalized) return boss;
  }

  return null;
}

/**
 * Get boss type (timer or schedule)
 * @param {string} bossName - Boss name
 * @returns {string} 'timer' | 'schedule' | null
 */
function getBossType(bossName) {
  if (bossSpawnConfig.timerBasedBosses[bossName]) return 'timer';
  if (bossSpawnConfig.scheduleBasedBosses[bossName]) return 'schedule';
  return null;
}

// ============================================================================
// TIME PARSING
// ============================================================================

/**
 * Parse kill time from user input (times are in GMT+8 / Asia/Manila)
 * @param {string} timeStr - Time string (e.g., "9:15", "21:30", "9:15am", "9:15pm")
 * @param {string} dateStr - Date string (e.g., "01/19", "12/31")
 * @returns {Date} Parsed kill time in UTC
 */
function parseKillTime(timeStr, dateStr) {
  // Get current date in GMT+8 for defaults
  const now = new Date();
  const gmt8Now = new Date(now.getTime() + TIMEZONE_OFFSET * 60 * 60 * 1000);

  // Start with current date components in GMT+8
  let year = gmt8Now.getUTCFullYear();
  let month = gmt8Now.getUTCMonth();
  let day = gmt8Now.getUTCDate();
  let hours = 0;
  let minutes = 0;

  if (timeStr) {
    // Handle 12hr format (9:15am, 9:15pm)
    const isPM = timeStr.toLowerCase().includes('pm');
    const isAM = timeStr.toLowerCase().includes('am');
    const cleanTime = timeStr.replace(/[ap]m/i, '');
    [hours, minutes] = cleanTime.split(':').map(Number);

    if (isPM && hours !== 12) hours += 12;
    if (isAM && hours === 12) hours = 0;
  }

  if (dateStr) {
    // Parse mm/dd format
    const [m, d] = dateStr.split('/').map(Number);
    month = m - 1;
    day = d;
  }

  // Create timestamp as if it's GMT+8, then convert to UTC
  // by subtracting the timezone offset
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
 * @returns {Date} Next spawn time
 */
function calculateNextSpawn(bossName, killTime) {
  const bossType = getBossType(bossName);

  if (bossType === 'timer') {
    // Timer-based: add spawn interval to kill time
    const intervalHours = bossSpawnConfig.timerBasedBosses[bossName].spawnIntervalHours;
    return new Date(killTime.getTime() + intervalHours * 60 * 60 * 1000);
  } else if (bossType === 'schedule') {
    // Schedule-based: find next scheduled time
    const schedules = bossSpawnConfig.scheduleBasedBosses[bossName].schedules;
    return findNextScheduledTime(schedules);
  }

  throw new Error(`Unknown boss type for ${bossName}`);
}

/**
 * Find next scheduled spawn time for schedule-based boss
 * @param {Array} schedules - Array of {day, time, dayOfWeek}
 * @returns {Date} Next scheduled spawn time
 */
function findNextScheduledTime(schedules) {
  const now = new Date();
  let nextSpawn = null;

  for (const schedule of schedules) {
    const [hours, minutes] = schedule.time.split(':').map(Number);

    // Create date for this schedule
    const spawnDate = new Date();
    spawnDate.setHours(hours, minutes, 0, 0);

    // Find next occurrence of this day
    const currentDay = spawnDate.getDay();
    const targetDay = schedule.dayOfWeek;
    let daysUntilSpawn = targetDay - currentDay;

    if (daysUntilSpawn < 0 || (daysUntilSpawn === 0 && spawnDate <= now)) {
      daysUntilSpawn += 7; // Next week
    }

    spawnDate.setDate(spawnDate.getDate() + daysUntilSpawn);

    // Keep earliest spawn time
    if (!nextSpawn || spawnDate < nextSpawn) {
      nextSpawn = spawnDate;
    }
  }

  return nextSpawn;
}

// ============================================================================
// TIMER SCHEDULING
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
 * Schedule 5-minute reminder for boss spawn
 * @param {string} bossName - Boss name
 * @param {Date} spawnTime - Spawn time
 * @returns {NodeJS.Timeout} Timer ID
 */
function scheduleReminder(bossName, spawnTime) {
  const now = new Date();
  const reminderTime = new Date(spawnTime.getTime() - REMINDER_MINUTES_BEFORE * 60 * 1000);
  const delay = reminderTime - now;

  // Skip if reminder time already passed
  if (delay < 0) {
    console.log(`⏭️ Skipping past reminder for ${bossName} (spawn: ${formatGMT8(spawnTime)})`);
    return null;
  }

  const timerId = setTimeout(async () => {
    await triggerSpawnReminder(bossName, spawnTime);
  }, delay);

  console.log(`⏰ Scheduled reminder for ${bossName} at ${formatGMT8(reminderTime)} (spawn: ${formatGMT8(spawnTime)})`);

  return timerId;
}

/**
 * Trigger 5-minute spawn reminder
 * @param {string} bossName - Boss name
 * @param {Date} spawnTime - Spawn time
 */
async function triggerSpawnReminder(bossName, spawnTime) {
  try {
    console.log(`🔔 Triggering spawn reminder for ${bossName}`);

    // Get announcement channel
    const announcementChannel = await client.channels.fetch(config.bossSpawnAnnouncementChannelId);
    if (!announcementChannel) {
      console.error('❌ Boss spawn announcement channel not found');
      return;
    }

    // Create attendance thread
    const thread = await attendance.createThreadForBoss(bossName, spawnTime);

    // Post reminder to announcement channel
    const timestamp = Math.floor(spawnTime.getTime() / 1000);
    const message = `⏰ **${bossName}** spawning in 5 minutes!\n🕐 Spawn time: <t:${timestamp}:t>\n\n📝 Attendance thread: ${thread.url}\n\n@everyone`;

    await announcementChannel.send(message);

    // Clear from kill times cache (timer completed)
    bossKillTimes.delete(bossName.toLowerCase());

    // Add to recently handled cache to prevent duplicate from external bot
    // Uses shared function that also clears old timeouts
    addToRecentlyHandled(bossName, spawnTime, thread.id);
    console.log(`📌 Added ${bossName} to recently-handled cache (15min TTL) - Thread: ${thread.id}`);

    console.log(`✅ Spawn reminder sent for ${bossName}`);
  } catch (error) {
    console.error(`❌ Failed to trigger spawn reminder for ${bossName}:`, error);
  }
}

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
  const existing = bossKillTimes.get(normalizedName);
  if (existing && existing.timerId) {
    clearTimeout(existing.timerId);
    console.log(`🔄 Overwriting existing timer for ${bossName}`);
  }

  // Calculate next spawn time
  const nextSpawn = calculateNextSpawn(bossName, killTime);

  // Schedule reminder
  const timerId = scheduleReminder(bossName, nextSpawn);

  // Save to cache
  bossKillTimes.set(normalizedName, {
    killTime,
    nextSpawn,
    timerId,
    killedBy
  });

  // Save to Sheets with critical retry
  await saveRecoveryData(bossName, killTime, nextSpawn, killedBy);

  return { nextSpawn, bossName };
}

/**
 * Save recovery data to Sheets with enhanced retry for critical data
 * @param {string} bossName - Boss name
 * @param {Date} killTime - Kill time
 * @param {Date} nextSpawn - Next spawn time
 * @param {string} killedBy - Username
 */
async function saveRecoveryData(bossName, killTime, nextSpawn, killedBy) {
  try {
    await sheetAPI.call('saveBossTimerRecovery', {
      bossName,
      lastKillTime: killTime.toISOString(),
      nextSpawnTime: nextSpawn.toISOString(),
      killedBy
    }, {
      // Critical data - extended retry for 429 errors
      maxRetries: 7,
      rateLimitMaxRetries: 10,
      rateLimitBaseDelay: 20000,
      rateLimitMaxDelay: 300000,
    });

    console.log(`💾 Saved recovery data for ${bossName}`);
  } catch (error) {
    console.error(`❌ CRITICAL: Failed to save recovery data for ${bossName}:`, error.message);
    console.error(`⚠️ Data preserved in local cache, will retry on next save or restart`);
    // Don't throw - keep timer running even if sheet write fails
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

  // Check if boss already has a timer
  const existing = bossKillTimes.get(normalizedName);
  if (existing && existing.timerId) {
    clearTimeout(existing.timerId);
    console.log(`🔄 Overwriting existing timer for ${bossName}`);
  }

  // Schedule reminder
  const timerId = scheduleReminder(bossName, spawnTime);

  // Save to cache (use spawnTime as "killTime" for display purposes)
  bossKillTimes.set(normalizedName, {
    killTime: null, // No kill time - directly set spawn
    nextSpawn: spawnTime,
    timerId,
    killedBy: `set-by-${setBy}`
  });

  // Save to Sheets with critical retry
  await saveRecoveryData(bossName, new Date(), spawnTime, `set-by-${setBy}`);

  return { nextSpawn: spawnTime, bossName };
}

// ============================================================================
// COMMANDS
// ============================================================================

/**
 * Get next spawn time for a boss
 * @param {string} bossName - Boss name
 * @returns {Object|null} {nextSpawn, killTime, killedBy} or null
 */
function getNextSpawn(bossName) {
  const data = bossKillTimes.get(bossName.toLowerCase());
  if (data) {
    return {
      nextSpawn: data.nextSpawn,
      killTime: data.killTime,
      killedBy: data.killedBy
    };
  }

  // For schedule-based bosses, calculate next spawn
  const bossType = getBossType(bossName);
  if (bossType === 'schedule') {
    const schedules = bossSpawnConfig.scheduleBasedBosses[bossName].schedules;
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
 * @param {number} hours - Hours to look ahead
 * @returns {Array} Array of {bossName, nextSpawn, type}
 */
function getUpcomingSpawns(hours = 24) {
  const now = new Date();
  const cutoff = new Date(now.getTime() + hours * 60 * 60 * 1000);
  const upcoming = [];

  // Timer-based bosses (only if kill recorded)
  for (const [bossName, data] of bossKillTimes) {
    if (data.nextSpawn >= now && data.nextSpawn <= cutoff) {
      // Find actual boss name (with proper casing)
      const actualName = findBossName(bossName);
      upcoming.push({
        bossName: actualName,
        nextSpawn: data.nextSpawn,
        type: 'timer'
      });
    }
  }

  // Schedule-based bosses (always show)
  for (const [bossName, bossConfig] of Object.entries(bossSpawnConfig.scheduleBasedBosses)) {
    // Skip metadata keys like _note
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

  // Sort by spawn time
  upcoming.sort((a, b) => a.nextSpawn - b.nextSpawn);

  return upcoming;
}

/**
 * Cancel timer for a boss
 * @param {string} bossName - Boss name
 * @returns {boolean} True if cancelled
 */
async function cancelTimer(bossName) {
  const normalizedName = bossName.toLowerCase();
  const data = bossKillTimes.get(normalizedName);

  if (!data) {
    return false;
  }

  // Clear timeout
  if (data.timerId) {
    clearTimeout(data.timerId);
  }

  // Remove from cache
  bossKillTimes.delete(normalizedName);

  // Clear from recently handled cache if exists
  const recentlyHandled = recentlyHandledBosses.get(normalizedName);
  if (recentlyHandled) {
    clearTimeout(recentlyHandled.clearTimeoutId);
    recentlyHandledBosses.delete(normalizedName);
    console.log(`🗑️ Cleared ${bossName} from recently-handled cache`);
  }

  // Remove from Sheets
  try {
    await sheetAPI.call('deleteBossTimerRecovery', { bossName });
  } catch (error) {
    console.error(`⚠️ Failed to delete recovery data for ${bossName}:`, error.message);
  }

  return true;
}

/**
 * Handle false alarm - boss didn't spawn as predicted
 * @param {string} bossName - Boss name
 * @param {string} userId - User ID who reported false alarm
 * @returns {Promise<Object>} Result with success status
 */
async function handleNoSpawn(bossName, userId) {
  const normalizedName = bossName.toLowerCase();

  try {
    // Cancel timer if exists
    const timerCancelled = await cancelTimer(bossName);

    // Check if boss was recently handled (has thread)
    const recentlyHandled = recentlyHandledBosses.get(normalizedName);

    if (recentlyHandled && recentlyHandled.threadId) {
      // Get the thread
      const guild = await client.guilds.fetch(config.mainGuildId);
      const attChannel = await guild.channels.fetch(config.attendanceChannelId);
      const thread = await attChannel.threads.fetch(recentlyHandled.threadId);

      if (thread) {
        // Post correction in thread
        await thread.send(`⚠️ **FALSE ALARM - Wrong timer data**\n\nBoss did not spawn as predicted.\nThread cancelled by <@${userId}>\n\n❌ Please ignore this thread.`);

        // Rename thread to mark as cancelled
        await thread.setName(`[CANCELLED] ${thread.name}`);

        // Lock the thread
        await thread.setLocked(true);
        await thread.setArchived(true);

        console.log(`🔒 Locked and archived thread ${thread.id} for ${bossName}`);
      }

      // Post in announcement channel
      const announcementChannel = await client.channels.fetch(config.bossSpawnAnnouncementChannelId);
      if (announcementChannel) {
        await announcementChannel.send(`❌ **${bossName} spawn cancelled** - Wrong timer data reported by <@${userId}>\n\nPlease wait for actual spawn confirmation.`);
      }

      // Keep in recently handled cache to prevent external bot duplicate
      // Cache will auto-clear after 15 minutes
      console.log(`📌 Keeping ${bossName} in recently-handled cache to prevent duplicate from external bot`);
    }

    return {
      success: true,
      timerCancelled,
      threadFound: !!recentlyHandled?.threadId
    };
  } catch (error) {
    console.error(`❌ Failed to handle no-spawn for ${bossName}:`, error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Handle boss spawn confirmation - creates attendance thread
 * Does NOT record kill time - use !killed for that
 * @param {string} bossName - Boss name
 * @param {string} userId - User ID who reported spawn
 * @returns {Promise<Object>} Result with thread info
 */
async function handleSpawned(bossName, userId) {
  const now = new Date();
  const normalizedName = bossName.toLowerCase();

  try {
    // Check if already handled recently (prevent duplicate !spawned calls)
    const existing = recentlyHandledBosses.get(normalizedName);
    if (existing) {
      const timeSince = Math.round((Date.now() - existing.handledAt) / 1000 / 60);
      console.log(`⚠️ ${bossName} already handled ${timeSince}min ago - returning existing thread`);

      return {
        success: true,
        threadId: existing.threadId,
        threadUrl: `https://discord.com/channels/${config.mainGuildId}/${config.attendanceChannelId}/${existing.threadId}`,
        bossName,
        alreadyHandled: true
      };
    }

    // Create attendance thread for current spawn
    const thread = await attendance.createThreadForBoss(bossName, now);

    // Post confirmation in announcement channel
    const announcementChannel = await client.channels.fetch(config.bossSpawnAnnouncementChannelId);
    if (announcementChannel) {
      const timestamp = Math.floor(now.getTime() / 1000);
      await announcementChannel.send(
        `✅ **${bossName}** spawned confirmed by <@${userId}>\n` +
        `🕐 Spawn time: <t:${timestamp}:t>\n` +
        `📝 Attendance thread: ${thread.url}\n\n` +
        `💡 Use \`!killed ${bossName} <time>\` when boss is killed to track next spawn.`
      );
    }

    // Add to recently handled cache to prevent duplicate from external bot
    // Uses shared function that also clears old timeouts
    addToRecentlyHandled(bossName, now, thread.id);
    console.log(`📌 Added ${bossName} to recently-handled cache (15min TTL) - Thread: ${thread.id}`);

    return {
      success: true,
      threadId: thread.id,
      threadUrl: thread.url,
      bossName
    };
  } catch (error) {
    console.error(`❌ Failed to handle spawned for ${bossName}:`, error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Reset all timer-based bosses for maintenance
 * @returns {Promise<number>} Number of bosses reset
 */
async function maintenance() {
  const now = new Date();
  const entries = [];
  let count = 0;

  // Cancel all existing timer-based timers
  for (const [bossName, data] of bossKillTimes) {
    if (data.timerId) {
      clearTimeout(data.timerId);
    }
  }
  bossKillTimes.clear();

  // Reset all timer-based bosses
  for (const [bossName, bossConfig] of Object.entries(bossSpawnConfig.timerBasedBosses)) {
    // Skip metadata keys like _note
    if (bossName.startsWith('_')) continue;
    const intervalHours = bossConfig.spawnIntervalHours;
    const nextSpawn = new Date(now.getTime() + intervalHours * 60 * 60 * 1000);

    // Schedule reminder
    const timerId = scheduleReminder(bossName, nextSpawn);

    // Save to cache
    bossKillTimes.set(bossName.toLowerCase(), {
      killTime: now,
      nextSpawn,
      timerId,
      killedBy: 'MAINTENANCE'
    });

    // Prepare bulk save
    entries.push({
      bossName,
      lastKillTime: now.toISOString(),
      nextSpawnTime: nextSpawn.toISOString(),
      killedBy: 'MAINTENANCE'
    });

    count++;
  }

  // Bulk save to Sheets with critical retry
  try {
    await sheetAPI.call('bulkSaveBossTimerRecovery', { entries }, {
      maxRetries: 7,
      rateLimitMaxRetries: 10,
      rateLimitBaseDelay: 20000,
      rateLimitMaxDelay: 300000,
    });
    console.log(`💾 Saved ${count} maintenance timers to recovery sheet`);
  } catch (error) {
    console.error(`❌ CRITICAL: Failed to save maintenance data:`, error.message);
  }

  return count;
}

/**
 * Clear all timer-based kills
 * @returns {Promise<number>} Number of timers cleared
 */
async function clearKills() {
  let count = 0;

  // Cancel all timer-based timers
  for (const [bossName, data] of bossKillTimes) {
    const actualName = findBossName(bossName);
    if (getBossType(actualName) === 'timer' && data.timerId) {
      clearTimeout(data.timerId);
      count++;
    }
  }

  // Clear timer-based from cache
  for (const bossName of Object.keys(bossSpawnConfig.timerBasedBosses)) {
    if (bossName.startsWith('_')) continue; // Skip metadata keys
    bossKillTimes.delete(bossName.toLowerCase());
  }

  // Clear from Sheets
  try {
    await sheetAPI.call('clearBossTimerRecovery', { type: 'timer-based' });
  } catch (error) {
    console.error(`⚠️ Failed to clear recovery data:`, error.message);
  }

  return count;
}

/**
 * Get all active timers (for !timers command)
 * @returns {Object} {timerBased, scheduleBased}
 */
function getAllTimers() {
  const timerBased = [];
  const scheduleBased = [];

  // Timer-based bosses
  for (const [bossName, data] of bossKillTimes) {
    const actualName = findBossName(bossName);
    if (getBossType(actualName) === 'timer') {
      timerBased.push({
        bossName: actualName,
        nextSpawn: data.nextSpawn,
        killedBy: data.killedBy
      });
    }
  }

  // Schedule-based bosses
  for (const [bossName, bossConfig] of Object.entries(bossSpawnConfig.scheduleBasedBosses)) {
    // Skip metadata keys like _note
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
/**
 * Check if boss was recently handled by timer system
 * @param {string} bossName - Boss name
 * @returns {Object|null} Recently handled data or null
 */
function wasRecentlyHandled(bossName) {
  const normalizedName = bossName.toLowerCase();
  return recentlyHandledBosses.get(normalizedName) || null;
}

/**
 * Add boss to recently handled cache (for external bot path)
 * Prevents duplicate threads from multiple external bot announcements
 * @param {string} bossName - Boss name
 * @param {Date} spawnTime - Spawn time
 * @param {string} threadId - Thread ID
 */
function addToRecentlyHandled(bossName, spawnTime, threadId) {
  const normalizedName = bossName.toLowerCase();

  // Clear existing timeout if overwriting (fixes cache overwrite conflict)
  const existing = recentlyHandledBosses.get(normalizedName);
  if (existing && existing.clearTimeoutId) {
    clearTimeout(existing.clearTimeoutId);
    console.log(`🔄 Cleared old timeout for ${bossName} before overwriting cache`);
  }

  // Set new cache entry with 15 minute TTL
  const clearTimeoutId = setTimeout(() => {
    recentlyHandledBosses.delete(normalizedName);
    console.log(`🗑️ Cleared recently-handled cache for ${bossName}`);
  }, 15 * 60 * 1000); // 15 minutes

  recentlyHandledBosses.set(normalizedName, {
    handledAt: new Date(),
    spawnTime,
    threadId,
    clearTimeoutId
  });
}

// ============================================================================
// MODULE EXPORTS
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
  clearKills,
  getAllTimers,
  findBossName,
  parseKillTime,
  wasRecentlyHandled,
  addToRecentlyHandled,
  bossKillTimes, // Export for monitoring/debugging
};
