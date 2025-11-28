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
const { EmbedBuilder } = require('discord.js');
const crashRecovery = require('./utils/crash-recovery');
const { normalizeTimestamp } = require('./utils/common');
const { getBossImageAttachment, getBossImageAttachmentURL } = require('./utils/boss-images');
const { addGuildFooter } = require('./utils/embed-branding');

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
 * Scheduled boss timers - tracks active timers for schedule-based bosses
 * Used to prevent duplicate timers when rescheduling (e.g., during !maintenance)
 *
 * Map<bossName, {
 *   nextSpawn: Date,
 *   timerId: setTimeout ID
 * }>
 */
const scheduledBossTimers = new Map();

/**
 * Server down state - when true, bot will not create attendance threads
 * Set by !serverdown command, cleared by !maintenance command
 * @type {boolean}
 */
let isServerDown = false;

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

  // Restore server down state from crash recovery (must be before reschedule)
  await restoreServerDownState();

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
        let nextSpawn = new Date(entry.nextSpawnTime);

        // Skip invalid dates
        if (!nextSpawn || isNaN(nextSpawn.getTime())) {
          console.error(`❌ Invalid nextSpawnTime for ${entry.bossName}: ${entry.nextSpawnTime}`);
          continue;
        }

        // Parse killTime (may be null/invalid for directly set spawns)
        let killTime = null;
        if (entry.lastKillTime) {
          const parsed = new Date(entry.lastKillTime);
          if (!isNaN(parsed.getTime())) {
            killTime = parsed;
          }
        }

        // If spawn already passed, recalculate to find next future spawn
        if (nextSpawn < now) {
          const bossType = getBossType(entry.bossName);
          if (bossType === 'timer' && killTime) {
            // Recalculate with auto-forward
            const result = calculateNextSpawn(entry.bossName, killTime);
            nextSpawn = result.nextSpawn;
            console.log(`⏭️ ${entry.bossName}: Past spawn detected, fast-forwarded to ${formatGMT8(nextSpawn)}`);

            // Update sheet with new spawn time
            saveRecoveryData(entry.bossName, killTime, nextSpawn, entry.killedBy || 'recovery');
          } else {
            console.log(`⏭️ Skipping past spawn: ${entry.bossName} (${formatGMT8(nextSpawn)})`);
            continue;
          }
        }

        // Reschedule timer
        const timerId = scheduleReminder(entry.bossName, nextSpawn);

        bossKillTimes.set(entry.bossName.toLowerCase(), {
          killTime,
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

      // Clear existing timer if present (prevents duplicates)
      const existing = scheduledBossTimers.get(bossName.toLowerCase());
      if (existing && existing.timerId) {
        clearTimeout(existing.timerId);
        console.log(`🔄 Cleared existing timer for scheduled boss: ${bossName}`);
      }

      const nextSpawn = findNextScheduledTime(bossConfig.schedules);
      if (nextSpawn && !isNaN(nextSpawn.getTime())) {
        const timerId = scheduleReminder(bossName, nextSpawn);

        // Track the timer to prevent duplicates
        scheduledBossTimers.set(bossName.toLowerCase(), {
          nextSpawn,
          timerId
        });
      } else {
        console.error(`❌ Invalid scheduled spawn time for ${bossName}`);
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
 * Find boss name from user input (case-insensitive, supports partial/fuzzy matching)
 * @param {string} input - User input
 * @returns {string|null} Matched boss name or null
 */
function findBossName(input) {
  const normalized = input.toLowerCase().trim();
  const allBosses = [];

  // Collect all boss names
  for (const boss of Object.keys(bossSpawnConfig.timerBasedBosses)) {
    if (!boss.startsWith('_')) allBosses.push(boss);
  }
  for (const boss of Object.keys(bossSpawnConfig.scheduleBasedBosses)) {
    if (!boss.startsWith('_')) allBosses.push(boss);
  }

  // 1. Exact match (case-insensitive)
  for (const boss of allBosses) {
    if (boss.toLowerCase() === normalized) return boss;
  }

  // 2. Starts with match (e.g., "baron" matches "Baron Braudmore")
  for (const boss of allBosses) {
    if (boss.toLowerCase().startsWith(normalized)) return boss;
  }

  // 3. Contains match (e.g., "braud" matches "Baron Braudmore")
  for (const boss of allBosses) {
    if (boss.toLowerCase().includes(normalized)) return boss;
  }

  // 4. Any word starts with input (e.g., "aquleus" matches "General Aquleus")
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
  if (bossSpawnConfig.timerBasedBosses[bossName]) return 'timer';
  if (bossSpawnConfig.scheduleBasedBosses[bossName]) return 'schedule';
  return null;
}

/**
 * Get next scheduled spawn time for a schedule-based boss
 * @param {string} bossName - Boss name
 * @returns {Date|null} Next scheduled spawn time
 */
function getNextScheduledSpawn(bossName) {
  const bossConfig = bossSpawnConfig.scheduleBasedBosses[bossName];
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
  // Get current date in GMT+8 for defaults
  const now = new Date();
  const gmt8Now = new Date(now.getTime() + TIMEZONE_OFFSET * 60 * 60 * 1000);

  // Start with current date/time components in GMT+8
  // If no time is provided, use the current time (not midnight)
  let year = gmt8Now.getUTCFullYear();
  let month = gmt8Now.getUTCMonth();
  let day = gmt8Now.getUTCDate();
  let hours = gmt8Now.getUTCHours();
  let minutes = gmt8Now.getUTCMinutes();

  if (timeStr) {
    // Normalize the time string - remove spaces around am/pm
    const normalizedTime = timeStr.trim().toLowerCase();

    // Check for AM/PM (handles "9:15pm", "9:15 pm", "9:15PM", "9:15 PM")
    const isPM = /p\.?m\.?$/i.test(normalizedTime) || normalizedTime.includes('pm');
    const isAM = /a\.?m\.?$/i.test(normalizedTime) || normalizedTime.includes('am');

    // Remove am/pm and any surrounding spaces, then extract time
    const cleanTime = normalizedTime.replace(/\s*(a\.?m\.?|p\.?m\.?)\s*/gi, '').trim();
    const timeParts = cleanTime.split(':');

    hours = parseInt(timeParts[0], 10) || 0;
    minutes = parseInt(timeParts[1], 10) || 0;

    // Convert 12-hour to 24-hour format
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
 * @returns {Object} { nextSpawn: Date, skippedSpawns: number }
 */
function calculateNextSpawn(bossName, killTime) {
  const bossType = getBossType(bossName);
  const now = new Date();

  if (bossType === 'timer') {
    // Timer-based: add spawn interval to kill time
    const intervalHours = bossSpawnConfig.timerBasedBosses[bossName].spawnIntervalHours;
    const intervalMs = intervalHours * 60 * 60 * 1000;
    let nextSpawn = new Date(killTime.getTime() + intervalMs);
    let skippedSpawns = 0;

    // If spawn time is in the past, keep adding intervals until it's in the future
    while (nextSpawn < now) {
      nextSpawn = new Date(nextSpawn.getTime() + intervalMs);
      skippedSpawns++;
    }

    return { nextSpawn, skippedSpawns };
  } else if (bossType === 'schedule') {
    // Schedule-based: find next scheduled time
    const schedules = bossSpawnConfig.scheduleBasedBosses[bossName].schedules;
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
  // Get current time in GMT+8 for day/time comparison
  const gmt8Now = new Date(now.getTime() + TIMEZONE_OFFSET * 60 * 60 * 1000);
  let nextSpawn = null;

  for (const schedule of schedules) {
    const [hours, minutes] = schedule.time.split(':').map(Number);

    // Get current date components in GMT+8
    const currentYear = gmt8Now.getUTCFullYear();
    const currentMonth = gmt8Now.getUTCMonth();
    const currentDate = gmt8Now.getUTCDate();
    const currentDay = gmt8Now.getUTCDay();
    const targetDay = schedule.dayOfWeek;

    // Calculate days until target day
    let daysUntilSpawn = targetDay - currentDay;

    // Check if we need to go to next week
    if (daysUntilSpawn < 0) {
      daysUntilSpawn += 7;
    } else if (daysUntilSpawn === 0) {
      // Same day - check if time has passed
      const currentHour = gmt8Now.getUTCHours();
      const currentMinute = gmt8Now.getUTCMinutes();
      if (hours < currentHour || (hours === currentHour && minutes <= currentMinute)) {
        daysUntilSpawn = 7; // Next week
      }
    }

    // Create spawn date in GMT+8, then convert to UTC
    const spawnDay = currentDate + daysUntilSpawn;
    const gmt8Timestamp = Date.UTC(currentYear, currentMonth, spawnDay, hours, minutes, 0, 0);
    const utcTimestamp = gmt8Timestamp - (TIMEZONE_OFFSET * 60 * 60 * 1000);
    const spawnDate = new Date(utcTimestamp);

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

    // Check if server is down - skip thread creation but reschedule
    if (isServerDown) {
      console.log(`⚠️ Server down mode active - skipping thread creation for ${bossName}`);

      // Clear from kill times cache
      bossKillTimes.delete(bossName.toLowerCase());

      // For scheduled bosses, reschedule for next occurrence
      const bossType = getBossType(bossName);
      if (bossType === 'schedule') {
        const bossConfig = bossSpawnConfig.scheduleBasedBosses[bossName];
        if (bossConfig && bossConfig.schedules) {
          const nextSpawn = findNextScheduledTime(bossConfig.schedules);
          if (nextSpawn) {
            scheduleReminder(bossName, nextSpawn);
            console.log(`🔄 Rescheduled ${bossName} for next occurrence (server down mode)`);
          }
        }
      }

      return;
    }

    // Get announcement channel
    const announcementChannel = await client.channels.fetch(config.boss_spawn_announcement_channel_id);
    if (!announcementChannel) {
      console.error('❌ Boss spawn announcement channel not found');
      return;
    }

    // Create attendance thread
    const thread = await attendance.createThreadForBoss(client, bossName, spawnTime);

    // Post reminder to announcement channel with embed and thumbnail
    const timestamp = Math.floor(spawnTime.getTime() / 1000);

    const embed = new EmbedBuilder()
      .setColor(0xffaa00)
      .setTitle(`⏰ ${bossName} Spawning Soon!`)
      .setDescription(`**Spawning in 5 minutes!**`)
      .addFields(
        { name: '🕐 Spawn Time', value: `<t:${timestamp}:t>`, inline: true },
        { name: '📝 Thread', value: `[Click here](${thread.url})`, inline: true }
      )
      .setTimestamp();

    // Add boss image if available
    const bossImage = getBossImageAttachment(bossName);
    const bossImageURL = getBossImageAttachmentURL(bossName);
    if (bossImageURL) {
      embed.setThumbnail(bossImageURL);
    }

    // Add guild branding
    const guild = await client.guilds.fetch(config.main_guild_id);
    addGuildFooter(embed, guild);

    const messagePayload = { content: '@everyone', embeds: [embed] };
    if (bossImage) {
      messagePayload.files = [bossImage];
    }

    await announcementChannel.send(messagePayload);

    // Clear from kill times cache (timer completed)
    bossKillTimes.delete(bossName.toLowerCase());

    // Add to recently handled cache to prevent duplicate from external bot
    // Uses shared function that also clears old timeouts
    addToRecentlyHandled(bossName, spawnTime, thread.id);
    console.log(`📌 Added ${bossName} to recently-handled cache (15min TTL) - Thread: ${thread.id}`);

    // For scheduled bosses, reschedule for next occurrence
    const bossType = getBossType(bossName);
    if (bossType === 'schedule') {
      const bossConfig = bossSpawnConfig.scheduleBasedBosses[bossName];
      if (bossConfig && bossConfig.schedules) {
        const nextSpawn = findNextScheduledTime(bossConfig.schedules);
        if (nextSpawn) {
          const timerId = scheduleReminder(bossName, nextSpawn);

          // Track the timer to prevent duplicates
          scheduledBossTimers.set(bossName.toLowerCase(), {
            nextSpawn,
            timerId
          });

          console.log(`🔄 Rescheduled ${bossName} for next occurrence`);
        }
      }
    }

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

  // Calculate next spawn time (auto-fast-forwards if spawn is in past)
  const { nextSpawn, skippedSpawns } = calculateNextSpawn(bossName, killTime);

  if (skippedSpawns > 0) {
    console.log(`⏭️ ${bossName}: Skipped ${skippedSpawns} past spawn(s), next spawn: ${formatGMT8(nextSpawn)}`);
  }

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

  return { nextSpawn, bossName, skippedSpawns };
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
    // Validate dates before saving
    if (!killTime || isNaN(killTime.getTime())) {
      console.error(`❌ Invalid killTime for ${bossName}: ${killTime}`);
      return;
    }
    if (!nextSpawn || isNaN(nextSpawn.getTime())) {
      console.error(`❌ Invalid nextSpawn for ${bossName}: ${nextSpawn}`);
      return;
    }

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
  let cancelled = false;

  // Check timer-based bosses
  const timerData = bossKillTimes.get(normalizedName);
  if (timerData) {
    // Clear timeout
    if (timerData.timerId) {
      clearTimeout(timerData.timerId);
    }

    // Remove from cache
    bossKillTimes.delete(normalizedName);
    cancelled = true;

    // Remove from Sheets
    try {
      await sheetAPI.call('deleteBossTimerRecovery', { bossName });
    } catch (error) {
      console.error(`⚠️ Failed to delete recovery data for ${bossName}:`, error.message);
    }
  }

  // Check scheduled bosses
  const scheduledData = scheduledBossTimers.get(normalizedName);
  if (scheduledData) {
    // Clear timeout
    if (scheduledData.timerId) {
      clearTimeout(scheduledData.timerId);
    }

    // Remove from cache
    scheduledBossTimers.delete(normalizedName);
    cancelled = true;
  }

  // Clear from recently handled cache if exists
  const recentlyHandled = recentlyHandledBosses.get(normalizedName);
  if (recentlyHandled) {
    clearTimeout(recentlyHandled.clearTimeoutId);
    recentlyHandledBosses.delete(normalizedName);
    console.log(`🗑️ Cleared ${bossName} from recently-handled cache`);
  }

  return cancelled;
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
      const guild = await client.guilds.fetch(config.main_guild_id);
      const attChannel = await guild.channels.fetch(config.attendance_channel_id);
      const thread = await attChannel.threads.fetch(recentlyHandled.threadId);

      if (thread) {
        // CRITICAL: Clean up spawn state from attendance module BEFORE locking thread
        // This prevents auto-close from submitting to Google Sheets after 30 minutes
        const activeSpawns = attendance.getActiveSpawns();
        const spawnInfo = activeSpawns[thread.id];

        if (spawnInfo) {
          // Mark as closed to prevent auto-close from processing it
          spawnInfo.closed = true;

          // Remove from activeColumns to prevent duplicate detection
          const activeColumns = attendance.getActiveColumns();
          const cacheKey = `${spawnInfo.boss.toUpperCase()}|${normalizeTimestamp(spawnInfo.timestamp)}`;
          delete activeColumns[cacheKey];

          // Clean up pending verifications for this thread
          const pendingVerifications = attendance.getPendingVerifications();
          const pendingInThread = Object.keys(pendingVerifications).filter(
            (msgId) => pendingVerifications[msgId].threadId === thread.id
          );
          pendingInThread.forEach((msgId) => delete pendingVerifications[msgId]);

          // Clean up pending closures for this thread
          const pendingClosures = attendance.getPendingClosures();
          const closuresInThread = Object.keys(pendingClosures).filter(
            (msgId) => pendingClosures[msgId].threadId === thread.id
          );
          closuresInThread.forEach((msgId) => delete pendingClosures[msgId]);

          // Clean up confirmation messages
          const confirmationMessages = attendance.getConfirmationMessages();
          delete confirmationMessages[thread.id];

          // Close confirmation thread if it exists
          if (spawnInfo.confirmThreadId) {
            try {
              const confirmThread = await guild.channels.fetch(spawnInfo.confirmThreadId).catch(() => null);
              if (confirmThread) {
                await confirmThread.send(`⚠️ Spawn cancelled: **${spawnInfo.boss}** (${spawnInfo.timestamp}) - Thread marked as false alarm`);
                await confirmThread.delete().catch(console.error);
              }
            } catch (error) {
              console.error(`⚠️ Failed to clean up confirmation thread:`, error.message);
            }
          }

          // Remove from activeSpawns
          delete activeSpawns[thread.id];

          // Sync state back to attendance module
          attendance.setActiveSpawns(activeSpawns);
          attendance.setActiveColumns(activeColumns);
          attendance.setPendingVerifications(pendingVerifications);
          attendance.setPendingClosures(pendingClosures);
          attendance.setConfirmationMessages(confirmationMessages);

          console.log(`🧹 Cleaned up spawn state for ${bossName} (thread ${thread.id})`);
        }

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
      const announcementChannel = await client.channels.fetch(config.boss_spawn_announcement_channel_id);
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
        threadUrl: `https://discord.com/channels/${config.main_guild_id}/${config.attendance_channel_id}/${existing.threadId}`,
        bossName,
        alreadyHandled: true
      };
    }

    // Create attendance thread for current spawn
    const thread = await attendance.createThreadForBoss(client, bossName, now);

    // Post confirmation in announcement channel with embed and thumbnail
    const announcementChannel = await client.channels.fetch(config.boss_spawn_announcement_channel_id);
    if (announcementChannel) {
      const timestamp = Math.floor(now.getTime() / 1000);

      const embed = new EmbedBuilder()
        .setColor(0x2ecc71)
        .setTitle(`✅ ${bossName} Spawn Confirmed`)
        .setDescription(`Confirmed by <@${userId}>`)
        .addFields(
          { name: '🕐 Spawn Time', value: `<t:${timestamp}:t>`, inline: true },
          { name: '📝 Thread', value: `[Click here](${thread.url})`, inline: true }
        )
        .addFields({
          name: '💡 Next Step',
          value: `Use \`!killed ${bossName} <time>\` when boss is killed to track next spawn.`,
          inline: false
        })
        .setTimestamp();

      // Add boss image if available
      const bossImage = getBossImageAttachment(bossName);
      const bossImageURL = getBossImageAttachmentURL(bossName);
      if (bossImageURL) {
        embed.setThumbnail(bossImageURL);
      }

      // Add guild branding
      const guild = await client.guilds.fetch(config.main_guild_id);
      addGuildFooter(embed, guild);

      const messagePayload = { embeds: [embed] };
      if (bossImage) {
        messagePayload.files = [bossImage];
      }

      await announcementChannel.send(messagePayload);
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
 * Enable server down mode - prevents attendance thread creation
 * Clears all boss timers making them available again
 * @returns {Promise<number>} Number of timers cleared
 */
async function serverDown() {
  console.log('🛑 Entering server down mode');

  // Set server down flag
  isServerDown = true;

  // Cancel and clear all boss timers
  let count = 0;
  for (const [bossName, data] of bossKillTimes) {
    if (data.timerId) {
      clearTimeout(data.timerId);
      count++;
    }
  }
  bossKillTimes.clear();

  // Save state for crash recovery
  await saveServerDownState();

  console.log(`✅ Server down mode activated - cleared ${count} timers`);
  return count;
}

/**
 * Create immediate attendance threads for all timer-based bosses (maintenance mode)
 * Automatically exits server down mode and resumes normal operations
 * Also reschedules all schedule-based bosses
 *
 * Timer-based bosses: Creates threads immediately with no auto-close
 * Schedule-based bosses: Schedules timers for next fixed spawn time
 *
 * @returns {Promise<{timerBased: number, scheduleBased: number}>} Number of threads created and bosses scheduled
 */
async function maintenance() {
  const now = new Date();
  let timerCount = 0;
  let scheduleCount = 0;

  // Exit server down mode (if active)
  if (isServerDown) {
    console.log('✅ Exiting server down mode - resuming normal operations');
    isServerDown = false;
    // Save state for crash recovery
    await saveServerDownState();
  }

  // Clear all timer-based boss entries from Google Sheets (single API call)
  try {
    await sheetAPI.call('clearBossTimerRecovery', { type: 'timer-based' });
    console.log('💾 Cleared timer-based boss recovery data from Google Sheets');
  } catch (error) {
    console.error('⚠️ Failed to clear timer-based recovery data:', error.message);
    // Continue anyway - local state will be correct
  }

  // Cancel all existing timer-based timers
  for (const [bossName, data] of bossKillTimes) {
    if (data.timerId) {
      clearTimeout(data.timerId);
    }
  }
  bossKillTimes.clear();

  // Create immediate attendance threads for all timer-based bosses (maintenance mode)
  console.log('📝 Creating attendance threads for all timer-based bosses...');
  for (const [bossName, bossConfig] of Object.entries(bossSpawnConfig.timerBasedBosses)) {
    // Skip metadata keys like _note
    if (bossName.startsWith('_')) continue;

    try {
      // Create thread immediately with noAutoClose = true, skipColumnCheck = true
      const thread = await attendance.createThreadForBoss(client, bossName, now, true, true);
      console.log(`✅ Created maintenance thread for ${bossName}: ${thread.id}`);
      timerCount++;
    } catch (error) {
      console.error(`❌ Failed to create thread for ${bossName}:`, error.message);
    }
  }

  console.log(`✅ Created ${timerCount} attendance threads for timer-based bosses`);

  // Clear all existing scheduled boss timers to prevent duplicates
  console.log('🔄 Clearing existing scheduled boss timers...');
  for (const [bossName, data] of scheduledBossTimers) {
    if (data.timerId) {
      clearTimeout(data.timerId);
    }
  }
  scheduledBossTimers.clear();
  console.log('✅ Cleared all scheduled boss timers');

  // Schedule all schedule-based bosses (no API calls, just setTimeout)
  console.log('🔄 Scheduling all schedule-based bosses...');
  for (const [bossName, bossConfig] of Object.entries(bossSpawnConfig.scheduleBasedBosses)) {
    // Skip metadata keys like _note
    if (bossName.startsWith('_')) continue;

    const nextSpawn = findNextScheduledTime(bossConfig.schedules);
    if (nextSpawn && !isNaN(nextSpawn.getTime())) {
      const timerId = scheduleReminder(bossName, nextSpawn);

      // Track the timer to prevent duplicates
      scheduledBossTimers.set(bossName.toLowerCase(), {
        nextSpawn,
        timerId
      });

      scheduleCount++;
    } else {
      console.error(`❌ Invalid scheduled spawn time for ${bossName}`);
    }
  }

  console.log(`✅ Maintenance complete: ${timerCount} timer-based, ${scheduleCount} schedule-based bosses`);

  return { timerBased: timerCount, scheduleBased: scheduleCount };
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
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Format a countdown string with appropriate precision
 * - Days away: shows "in X days Y hours"
 * - Hours away: shows "in X hours Y minutes"
 * - Minutes away: shows "in X minutes"
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
    // More than a day: show days and hours
    if (hours > 0) {
      return `in ${days} day${days !== 1 ? 's' : ''} ${hours} hr${hours !== 1 ? 's' : ''}`;
    }
    return `in ${days} day${days !== 1 ? 's' : ''}`;
  } else if (hours > 0) {
    // Less than a day: show hours and minutes
    if (minutes > 0) {
      return `in ${hours} hr${hours !== 1 ? 's' : ''} ${minutes} min${minutes !== 1 ? 's' : ''}`;
    }
    return `in ${hours} hr${hours !== 1 ? 's' : ''}`;
  } else {
    // Less than an hour: show minutes only
    return `in ${minutes} min${minutes !== 1 ? 's' : ''}`;
  }
}

// ============================================================================
// CRASH RECOVERY - SERVER DOWN STATE
// ============================================================================

/**
 * Save server down state for crash recovery
 */
async function saveServerDownState() {
  try {
    await crashRecovery.saveBossTimerState({
      isServerDown,
    });
  } catch (error) {
    console.error('⚠️ Failed to save server down state:', error.message);
  }
}

/**
 * Restore server down state from crash recovery
 */
async function restoreServerDownState() {
  try {
    const state = crashRecovery.getRecoveryState();
    if (state?.bossTimer?.isServerDown !== undefined) {
      isServerDown = state.bossTimer.isServerDown;
      const status = isServerDown ? 'DOWN' : 'UP';
      console.log(`🔄 [CRASH RECOVERY] Restored server state: ${status}`);

      if (isServerDown) {
        console.log('⚠️ Bot restarted in SERVER DOWN mode - attendance threads will NOT be created');
        console.log('💡 Use !maintenance to resume normal operations');
      }
    }
  } catch (error) {
    console.error('⚠️ Failed to restore server down state:', error.message);
  }
}

// ============================================================================
// MODULE EXPORTS
// ============================================================================

/**
 * Get server down status
 * @returns {boolean} True if server is down
 */
function getServerDownStatus() {
  return isServerDown;
}

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
  bossKillTimes, // Export for monitoring/debugging
};
