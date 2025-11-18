/**
 * ============================================================================
 * GAME EVENT REMINDER SYSTEM
 * ============================================================================
 *
 * Automated reminder system for recurring game events with crash recovery.
 *
 * FEATURES:
 * - Scheduled reminders for Individual Arena, Coop Arena, Guild War, and World Boss
 * - @everyone mentions in guild chat channel
 * - Auto-deletion after events end
 * - Crash recovery via Google Sheets persistence
 * - Guild Leader queue reminders for Guild War
 * - Timezone-aware scheduling (GMT+8)
 *
 * EVENTS:
 * - Individual Arena: Mon, Wed, Fri at 19:30 - 20:30
 * - Coop Round Arena: Tue, Thu, Sat at 19:30 - 20:30
 * - Guild War: Fri, Sat, Sun at 19:25 - 19:28
 * - World Boss Event: Daily at 11:00 AM and 20:00 PM (8:00 PM)
 * - Guild War Queue Reminder: Thu, Fri, Sat at 23:00 (auto-delete at 01:00)
 *
 * @module event-reminders
 */

const { EmbedBuilder } = require('discord.js');

// ============================================================================
// CONFIGURATION
// ============================================================================

const TIMEZONE_OFFSET = 8 * 60 * 60 * 1000; // GMT+8 in milliseconds
const REMINDER_OFFSET_MINUTES = 10; // Send reminders 10 minutes before event starts

/**
 * Game event definitions
 * NOTE: startTime is the ACTUAL event start time, reminders are sent BEFORE this
 */
const GAME_EVENTS = {
  individualArena: {
    name: '⚔️ Individual Arena',
    days: [1, 3, 5], // Monday, Wednesday, Friday (0=Sunday)
    startTime: { hour: 19, minute: 30 }, // Actual event time
    durationMinutes: 60,
    color: 0xff6b6b, // Red
    description: 'Individual Arena is starting soon!',
    reminderOffsetMinutes: REMINDER_OFFSET_MINUTES, // Remind 10 min before
  },
  coopArena: {
    name: '🤝 Coop Round Arena',
    days: [2, 4, 6], // Tuesday, Thursday, Saturday
    startTime: { hour: 19, minute: 30 }, // Actual event time
    durationMinutes: 60,
    color: 0x4ecdc4, // Teal
    description: 'Coop Round Arena is starting soon!',
    reminderOffsetMinutes: REMINDER_OFFSET_MINUTES, // Remind 10 min before
  },
  guildWar: {
    name: '⚔️ Guild War',
    days: [5, 6, 0], // Friday, Saturday, Sunday
    startTime: { hour: 19, minute: 25 }, // Actual event time
    durationMinutes: 3,
    color: 0xff4757, // Dark red
    description: '**GUILD WAR** is starting soon! Get ready!',
    reminderOffsetMinutes: 20, // Remind 20 min before (gives players time to prepare)
  },
  gvg: {
    name: '⚔️ GvG (Guild vs Guild)',
    days: [5, 6, 0], // Friday, Saturday, Sunday (same as Guild War)
    startTime: { hour: 12, minute: 25 }, // Actual event time
    durationMinutes: 3, // GvG duration (12:25 - 12:28)
    color: 0xf39c12, // Orange
    description: '**GvG (Guild vs Guild)** is starting soon! Get ready to attend!',
    reminderOffsetMinutes: 20, // Remind 20 min before (12:05)
    createAttendanceThread: true, // Special flag to create attendance thread
    attendanceAutoCloseMinutes: 20, // Auto-close thread 20 min after event starts (12:45)
  },
  guildBoss: {
    name: '⚔️ Guild Boss',
    days: [1], // Monday only
    startTime: { hour: 21, minute: 0 }, // 21:00 (9:00 PM) GMT+8
    durationMinutes: 5, // Guild Boss duration (21:00 - 21:05)
    color: 0xe74c3c, // Red
    description: '**Guild Boss** is starting soon! Attend for 15 bidding points!',
    reminderOffsetMinutes: 20, // Remind 20 min before (20:40)
    createAttendanceThread: true, // Create attendance thread
    attendanceAutoCloseMinutes: 30, // Auto-close thread 30 min after event starts (21:30)
  },
};

/**
 * Daily game event definitions (occur every day, not weekly)
 */
const DAILY_EVENTS = {
  worldBossMorning: {
    name: '🐉 World Boss Event',
    startTime: { hour: 11, minute: 0 }, // 11:00 AM GMT+8
    durationMinutes: 30,
    color: 0x9b59b6, // Purple
    description: '**World Boss** is spawning soon! Prepare for battle!',
    reminderOffsetMinutes: 10, // Remind 10 min before
  },
  worldBossEvening: {
    name: '🐉 World Boss Event',
    startTime: { hour: 20, minute: 0 }, // 20:00 (8:00 PM) GMT+8
    durationMinutes: 30,
    color: 0x9b59b6, // Purple
    description: '**World Boss** is spawning soon! Prepare for battle!',
    reminderOffsetMinutes: 10, // Remind 10 min before
  },
};

/**
 * Guild War queue reminder (for guild leader)
 */
const GUILD_WAR_QUEUE_REMINDER = {
  name: '🎯 Guild War Queue Reminder',
  days: [4, 5, 6], // Thursday, Friday, Saturday
  startTime: { hour: 23, minute: 0 }, // 11pm
  deleteAfterMinutes: 120, // Delete at 1am (2 hours later)
  color: 0xffa502, // Orange
  description: '⏰ **REMINDER:** Please queue for Guild War before reset!',
};

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

/**
 * Active event reminder messages (for auto-deletion)
 * Format: { messageId: { channelId, deleteAt, eventType } }
 */
let activeReminders = {};

/**
 * Scheduled event timers
 * Format: { eventKey: { eventTimer, deleteTimer } }
 */
let eventTimers = {};

/**
 * Guild war queue reminder timers
 */
let queueReminderTimers = {};

/**
 * Bot client and config references
 */
let client = null;
let config = null;
let sheetAPI = null;
let attendance = null; // For creating GvG attendance threads

// ============================================================================
// SCHEDULING HELPERS
// ============================================================================

/**
 * Get current time in GMT+8
 * @returns {Date}
 */
function getCurrentGMT8() {
  const now = new Date();
  const utc = now.getTime();
  return new Date(utc + TIMEZONE_OFFSET);
}

/**
 * Calculate next occurrence of a specific day and time in GMT+8
 * @param {number} targetDay - Day of week (0=Sunday, 1=Monday, etc.)
 * @param {number} hour - Hour in 24h format
 * @param {number} minute - Minute
 * @returns {Date} UTC date of next occurrence
 */
function calculateNextOccurrence(targetDay, hour, minute) {
  const now = new Date();
  const nowGMT8 = getCurrentGMT8();

  // Start with today at the target time in GMT+8
  let next = new Date(nowGMT8);
  next.setHours(hour, minute, 0, 0);

  // Calculate days until target day
  const currentDay = nowGMT8.getDay();
  let daysUntilTarget = targetDay - currentDay;

  // If target day is today but time has passed, or target day is earlier in the week, add 7 days
  if (daysUntilTarget < 0 || (daysUntilTarget === 0 && nowGMT8 >= next)) {
    daysUntilTarget += 7;
  }

  // Add days to reach target
  next.setDate(next.getDate() + daysUntilTarget);

  // Convert back to UTC
  const utcNext = new Date(next.getTime() - TIMEZONE_OFFSET);

  return utcNext;
}

/**
 * Calculate next daily occurrence of a specific time in GMT+8
 * @param {number} hour - Hour in 24h format
 * @param {number} minute - Minute
 * @returns {Date} UTC date of next occurrence
 */
function calculateNextDailyOccurrence(hour, minute) {
  const now = new Date();
  const nowGMT8 = getCurrentGMT8();

  // Start with today at the target time in GMT+8
  let next = new Date(nowGMT8);
  next.setHours(hour, minute, 0, 0);

  // If time has already passed today, schedule for tomorrow
  if (nowGMT8 >= next) {
    next.setDate(next.getDate() + 1);
  }

  // Convert back to UTC
  const utcNext = new Date(next.getTime() - TIMEZONE_OFFSET);

  return utcNext;
}

/**
 * Format time remaining until event
 * @param {number} msUntilEvent - Milliseconds until event
 * @returns {string}
 */
function formatTimeRemaining(msUntilEvent) {
  const hours = Math.floor(msUntilEvent / (1000 * 60 * 60));
  const minutes = Math.floor((msUntilEvent % (1000 * 60 * 60)) / (1000 * 60));

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

/**
 * Format date in GMT+8
 * @param {Date} date - UTC date
 * @returns {string}
 */
function formatGMT8(date) {
  const gmt8Date = new Date(date.getTime() + TIMEZONE_OFFSET);
  const options = {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  };
  return gmt8Date.toLocaleString('en-US', options) + ' GMT+8';
}

// ============================================================================
// EVENT REMINDER FUNCTIONS
// ============================================================================

/**
 * Create event attendance thread (for GvG, Guild Boss, etc.)
 * @param {Object} event - Event configuration
 * @param {Date} eventTime - Event start time
 * @param {Message} reminderMessage - The reminder message that was sent
 * @returns {Promise<void>}
 */
async function createGvGAttendanceThread(event, eventTime, reminderMessage) {
  try {
    // Determine event type and configuration
    const isGvG = event.name.includes('GvG');
    const isGuildBoss = event.name.includes('Guild Boss');
    const eventType = isGvG ? 'GvG' : isGuildBoss ? 'Guild Boss' : 'Event';
    const eventPoints = isGvG ? 5 : isGuildBoss ? 15 : 10;
    const logTag = isGvG ? 'GVG' : isGuildBoss ? 'GUILD BOSS' : 'EVENT';

    console.log(`🎯 [${logTag}] Creating attendance thread for ${event.name}`);

    // Get attendance channel
    const attChannel = await client.channels.fetch(config.attendance_channel_id);
    if (!attChannel) {
      console.error(`❌ [${logTag}] Attendance channel not found`);
      return;
    }

    // Format timestamp for thread name (GMT+8)
    const gmt8Time = new Date(eventTime.getTime() + TIMEZONE_OFFSET);
    const month = String(gmt8Time.getUTCMonth() + 1).padStart(2, '0');
    const day = String(gmt8Time.getUTCDate()).padStart(2, '0');
    const hours = String(gmt8Time.getUTCHours()).padStart(2, '0');
    const minutes = String(gmt8Time.getUTCMinutes()).padStart(2, '0');
    const timestamp = `${month}-${day} ${hours}:${minutes}`;

    // Create thread with appropriate name
    const thread = await attChannel.threads.create({
      name: `${eventType} ${timestamp}`,
      autoArchiveDuration: 60,
      reason: `${eventType} attendance thread (auto-created by event reminder)`
    });

    console.log(`✅ [${logTag}] Created thread: ${eventType} ${timestamp} (${thread.id})`);

    // Send initial message in thread with appropriate description
    const eventDescription = isGvG
      ? '**Guild vs Guild attendance tracking**'
      : isGuildBoss
      ? '**Guild Boss attendance tracking**'
      : '**Event attendance tracking**';

    const embed = new EmbedBuilder()
      .setColor(event.color)
      .setTitle(`📋 ${eventType} Attendance - ${timestamp}`)
      .setDescription(
        `${eventDescription}\n\n` +
        `⏰ **Event Time:** <t:${Math.floor(eventTime.getTime() / 1000)}:F>\n` +
        `📸 **Post your attendance screenshot** to be verified\n` +
        `✅ **Admins will verify** your attendance\n` +
        `🎁 **Points:** ${eventPoints} bidding points per attendance\n\n` +
        `⏱️ **Thread auto-closes:** <t:${Math.floor((eventTime.getTime() + event.attendanceAutoCloseMinutes * 60 * 1000) / 1000)}:R>`
      )
      .setTimestamp();

    await thread.send({ embeds: [embed] });

    // Register the spawn with attendance system
    const spawnInfo = {
      boss: eventType, // Use event type as the "boss" name for attendance tracking
      date: `${gmt8Time.getUTCFullYear()}-${month}-${day}`,
      time: `${hours}:${minutes}`,
      timestamp: timestamp,
      members: [],
      closed: false,
      createdAt: Date.now(),
      confirmThreadId: null // Auto-events don't need confirmation thread
    };

    const activeSpawns = attendance.getActiveSpawns();
    activeSpawns[thread.id] = spawnInfo;
    attendance.setActiveSpawns(activeSpawns);

    // Save state
    await attendance.saveAttendanceStateToSheet(false);

    // Schedule auto-close
    const autoCloseDelay = event.attendanceAutoCloseMinutes * 60 * 1000;
    setTimeout(async () => {
      await autoCloseGvGThread(thread.id);
    }, autoCloseDelay);

    console.log(`⏱️ [${logTag}] Thread will auto-close in ${event.attendanceAutoCloseMinutes} minutes`);

  } catch (error) {
    console.error(`❌ [EVENT] Failed to create attendance thread:`, error.message);
  }
}

/**
 * Auto-close GvG attendance thread and submit to sheets
 * @param {string} threadId - Thread ID
 * @returns {Promise<void>}
 */
async function autoCloseGvGThread(threadId) {
  try {
    const activeSpawns = attendance.getActiveSpawns();
    const spawnInfo = activeSpawns[threadId];

    if (!spawnInfo || spawnInfo.closed) {
      console.log(`⚠️ [GVG] Thread ${threadId} already closed or not found`);
      return;
    }

    console.log(`⏰ [GVG] Auto-closing thread ${threadId}...`);

    const thread = await client.channels.fetch(threadId);
    if (!thread) {
      console.error(`❌ [GVG] Thread ${threadId} not found`);
      return;
    }

    // Mark as closed
    spawnInfo.closed = true;
    attendance.setActiveSpawns(activeSpawns);

    // Send closing message
    await thread.send(`⏰ **Auto-closing GvG attendance thread**\nSubmitting ${spawnInfo.members.length} members to Google Sheets...`);

    // Submit to Google Sheets
    if (spawnInfo.members.length > 0) {
      const payload = {
        action: 'submitAttendance',
        boss: 'GvG',
        date: spawnInfo.date,
        time: spawnInfo.time,
        timestamp: spawnInfo.timestamp,
        members: spawnInfo.members
      };

      const resp = await attendance.postToSheet(payload);

      if (resp.ok) {
        await thread.send(`✅ Attendance submitted successfully! (${spawnInfo.members.length} members)\nArchiving thread...`);
        console.log(`✅ [GVG] Submitted ${spawnInfo.members.length} members`);
      } else {
        await thread.send(`⚠️ Failed to submit attendance: ${resp.text || resp.err}\n\n**Members list (for manual entry):**\n${spawnInfo.members.join(', ')}`);
        console.error(`❌ [GVG] Failed to submit attendance:`, resp.text || resp.err);
      }
    } else {
      await thread.send(`⚠️ Thread closed with no verified members. No data submitted.`);
      console.log(`⚠️ [GVG] No members to submit`);
    }

    // Clean up reactions
    await attendance.cleanupAllThreadReactions(thread);

    // Archive thread
    await thread.setArchived(true, 'GvG attendance auto-close');

    // Clean up state
    delete activeSpawns[threadId];
    const activeColumns = attendance.getActiveColumns();
    delete activeColumns[`GvG|${spawnInfo.timestamp}`];
    attendance.setActiveColumns(activeColumns);

    // Save state
    await attendance.saveAttendanceStateToSheet(false);

    console.log(`✅ [GVG] Thread ${threadId} closed and archived`);

  } catch (error) {
    console.error(`❌ [GVG] Error auto-closing thread:`, error.message);
  }
}

/**
 * Send event reminder to guild chat
 * @param {Object} event - Event configuration
 * @param {Date} eventTime - Event start time (UTC)
 * @returns {Promise<void>}
 */
async function sendEventReminder(event, eventTime) {
  try {
    const channel = await client.channels.fetch(config.elysium_commands_channel_id);
    if (!channel) {
      console.error(`❌ [EVENT REMINDER] Channel not found: ${config.elysium_commands_channel_id}`);
      return;
    }

    const now = new Date();
    const endTime = new Date(eventTime.getTime() + event.durationMinutes * 60 * 1000);

    // Convert to Unix timestamp (seconds) for Discord's dynamic timestamp
    const eventTimestamp = Math.floor(eventTime.getTime() / 1000);

    const embed = new EmbedBuilder()
      .setColor(event.color)
      .setTitle(event.name)
      .setDescription(event.description)
      .addFields(
        {
          name: '⏰ Start Time',
          value: `<t:${eventTimestamp}:F>`, // Full date/time format
          inline: true,
        },
        {
          name: '⏱️ Duration',
          value: `${event.durationMinutes} minutes`,
          inline: true,
        },
        {
          name: '⏳ Starts In',
          value: `<t:${eventTimestamp}:R>`, // Relative time (live countdown!)
          inline: true,
        }
      )
      .setTimestamp();

    if (event.thumbnail) {
      embed.setThumbnail(event.thumbnail);
    }

    const message = await channel.send({
      content: '@everyone',
      embeds: [embed],
    });

    console.log(`✅ [EVENT REMINDER] Sent: ${event.name} at ${formatGMT8(eventTime)}`);

    // Schedule auto-deletion after event ends
    const deleteAt = endTime.getTime();
    activeReminders[message.id] = {
      channelId: channel.id,
      deleteAt,
      eventType: event.name,
    };

    // Persist to Google Sheets
    await persistActiveReminders();

    // Schedule deletion
    const deleteDelay = deleteAt - now.getTime();
    setTimeout(() => deleteEventReminder(message.id), deleteDelay);

    // Create attendance thread if event requires it (GvG)
    if (event.createAttendanceThread && attendance) {
      await createGvGAttendanceThread(event, eventTime, message);
    }

  } catch (error) {
    console.error(`❌ [EVENT REMINDER] Failed to send reminder for ${event.name}:`, error.message);
  }
}

/**
 * Send Guild War queue reminder to guild leader
 * @returns {Promise<void>}
 */
async function sendGuildWarQueueReminder() {
  try {
    const channel = await client.channels.fetch(config.elysium_commands_channel_id);
    if (!channel) {
      console.error(`❌ [QUEUE REMINDER] Channel not found: ${config.elysium_commands_channel_id}`);
      return;
    }

    const guild = await client.guilds.fetch(config.main_guild_id);
    const guildLeaderRole = guild.roles.cache.find(role => role.name === 'GUILD LEADER');

    if (!guildLeaderRole) {
      console.error(`❌ [QUEUE REMINDER] Guild Leader role not found`);
      return;
    }

    const now = new Date();
    const deleteAt = now.getTime() + (GUILD_WAR_QUEUE_REMINDER.deleteAfterMinutes * 60 * 1000);
    const deleteTimestamp = Math.floor(deleteAt / 1000);

    const embed = new EmbedBuilder()
      .setColor(GUILD_WAR_QUEUE_REMINDER.color)
      .setTitle(GUILD_WAR_QUEUE_REMINDER.name)
      .setDescription(
        `${GUILD_WAR_QUEUE_REMINDER.description}\n\n` +
        `📋 **Action Required:**\n` +
        `Please queue the guild for tomorrow's Guild War before server reset.\n\n` +
        `⏰ This reminder will be deleted <t:${deleteTimestamp}:R> (<t:${deleteTimestamp}:t>)`
      )
      .setTimestamp();

    const message = await channel.send({
      content: `${guildLeaderRole}`,
      embeds: [embed],
    });

    console.log(`✅ [QUEUE REMINDER] Sent Guild War queue reminder to ${guildLeaderRole.name}`);

    // Schedule auto-deletion
    activeReminders[message.id] = {
      channelId: channel.id,
      deleteAt,
      eventType: 'Guild War Queue Reminder',
    };

    // Persist to Google Sheets
    await persistActiveReminders();

    // Schedule deletion
    setTimeout(() => deleteEventReminder(message.id), GUILD_WAR_QUEUE_REMINDER.deleteAfterMinutes * 60 * 1000);

  } catch (error) {
    console.error(`❌ [QUEUE REMINDER] Failed to send reminder:`, error.message);
  }
}

/**
 * Delete an event reminder message
 * @param {string} messageId - Message ID to delete
 * @returns {Promise<void>}
 */
async function deleteEventReminder(messageId) {
  try {
    const reminder = activeReminders[messageId];
    if (!reminder) return;

    const channel = await client.channels.fetch(reminder.channelId);
    if (!channel) {
      console.error(`❌ [EVENT REMINDER] Channel not found for deletion: ${reminder.channelId}`);
      delete activeReminders[messageId];
      await persistActiveReminders();
      return;
    }

    const message = await channel.messages.fetch(messageId).catch(() => null);
    if (message) {
      await message.delete();
      console.log(`🗑️ [EVENT REMINDER] Deleted: ${reminder.eventType}`);
    }

    delete activeReminders[messageId];
    await persistActiveReminders();

  } catch (error) {
    console.error(`❌ [EVENT REMINDER] Failed to delete message ${messageId}:`, error.message);
    // Remove from tracking even if deletion fails
    delete activeReminders[messageId];
    await persistActiveReminders();
  }
}

// ============================================================================
// SCHEDULING SYSTEM
// ============================================================================

/**
 * Schedule a single event reminder
 * @param {string} eventKey - Unique event key
 * @param {Object} event - Event configuration
 * @param {number} targetDay - Day of week
 * @returns {void}
 */
function scheduleEventReminder(eventKey, event, targetDay) {
  // Calculate the actual event start time
  const eventStartTime = calculateNextOccurrence(
    targetDay,
    event.startTime.hour,
    event.startTime.minute
  );

  // Calculate when to send the reminder (offset minutes before event)
  const reminderOffsetMs = (event.reminderOffsetMinutes || REMINDER_OFFSET_MINUTES) * 60 * 1000;
  const reminderTime = new Date(eventStartTime.getTime() - reminderOffsetMs);

  const now = new Date();
  const delay = reminderTime.getTime() - now.getTime();

  // Clear existing timer if any
  if (eventTimers[eventKey]?.eventTimer) {
    clearTimeout(eventTimers[eventKey].eventTimer);
  }

  // CRASH RECOVERY: If reminder time has passed but event hasn't started yet
  // (e.g., bot restarted at 19:12, reminder was at 19:05, event is at 19:25)
  // Send the reminder immediately instead of waiting for next week
  if (delay < 0 && now < eventStartTime) {
    console.log(
      `⚠️ [EVENT REMINDER] Missed reminder for ${event.name} at ${formatGMT8(reminderTime)}\n` +
      `   Event hasn't started yet (${formatGMT8(eventStartTime)}), sending reminder NOW!`
    );

    // Send immediately
    sendEventReminder(event, eventStartTime);

    // Wait until after the event finishes, then reschedule for next week
    // This prevents infinite loops where the bot keeps detecting the same "missed" reminder
    const eventEndTime = eventStartTime.getTime() + (event.durationMinutes * 60 * 1000);
    const delayUntilAfterEvent = eventEndTime - now.getTime() + 1000; // Add 1 second buffer

    eventTimers[eventKey] = {
      eventTimer: setTimeout(() => {
        scheduleEventReminder(eventKey, event, targetDay);
      }, delayUntilAfterEvent),
      nextRun: new Date(eventEndTime),
      eventTime: eventStartTime,
    };

    console.log(
      `📅 [EVENT REMINDER] Will reschedule ${event.name} after event ends at ${formatGMT8(new Date(eventEndTime))}`
    );

    return;
  }

  // If both reminder time AND event time have passed, skip to next occurrence
  if (delay < 0) {
    console.log(
      `⏭️ [EVENT REMINDER] Event ${event.name} already finished at ${formatGMT8(eventStartTime)}\n` +
      `   Scheduling for next occurrence...`
    );
    // Event already passed, schedule for next week
    scheduleEventReminder(eventKey, event, targetDay);
    return;
  }

  // Schedule event reminder
  eventTimers[eventKey] = {
    eventTimer: setTimeout(async () => {
      await sendEventReminder(event, eventStartTime); // Pass actual event time for display

      // CRITICAL FIX: Wait until after the event ends before rescheduling
      // This prevents rescheduling during the reminder window (which would cause double-posting)
      const eventEndTime = eventStartTime.getTime() + (event.durationMinutes * 60 * 1000);
      const now = Date.now();
      const delayUntilAfterEvent = eventEndTime - now + 1000; // Add 1 second buffer

      // Only wait if event hasn't ended yet
      if (delayUntilAfterEvent > 0) {
        setTimeout(() => {
          scheduleEventReminder(eventKey, event, targetDay);
        }, delayUntilAfterEvent);
      } else {
        // Event already ended, reschedule immediately
        scheduleEventReminder(eventKey, event, targetDay);
      }
    }, delay),
    nextRun: reminderTime,
    eventTime: eventStartTime,
  };

  console.log(
    `📅 [EVENT REMINDER] Scheduled: ${event.name} on ${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][targetDay]}\n` +
    `   Reminder at: ${formatGMT8(reminderTime)} (in ${formatTimeRemaining(delay)})\n` +
    `   Event starts: ${formatGMT8(eventStartTime)}`
  );
}

/**
 * Schedule a daily event reminder (occurs every day, not weekly)
 * @param {string} eventKey - Unique event key
 * @param {Object} event - Event configuration
 * @returns {void}
 */
function scheduleDailyEventReminder(eventKey, event) {
  // Calculate the actual event start time (next daily occurrence)
  const eventStartTime = calculateNextDailyOccurrence(
    event.startTime.hour,
    event.startTime.minute
  );

  // Calculate when to send the reminder (offset minutes before event)
  const reminderOffsetMs = (event.reminderOffsetMinutes || REMINDER_OFFSET_MINUTES) * 60 * 1000;
  const reminderTime = new Date(eventStartTime.getTime() - reminderOffsetMs);

  const now = new Date();
  const delay = reminderTime.getTime() - now.getTime();

  // Clear existing timer if any
  if (eventTimers[eventKey]?.eventTimer) {
    clearTimeout(eventTimers[eventKey].eventTimer);
  }

  // CRASH RECOVERY: If reminder time has passed but event hasn't started yet
  if (delay < 0 && now < eventStartTime) {
    console.log(
      `⚠️ [EVENT REMINDER] Missed reminder for ${event.name} at ${formatGMT8(reminderTime)}\n` +
      `   Event hasn't started yet (${formatGMT8(eventStartTime)}), sending reminder NOW!`
    );

    // Send immediately
    sendEventReminder(event, eventStartTime);

    // Wait until after the event finishes, then reschedule for next day
    const eventEndTime = eventStartTime.getTime() + (event.durationMinutes * 60 * 1000);
    const delayUntilAfterEvent = eventEndTime - now.getTime() + 1000;

    eventTimers[eventKey] = {
      eventTimer: setTimeout(() => {
        scheduleDailyEventReminder(eventKey, event);
      }, delayUntilAfterEvent),
      nextRun: new Date(eventEndTime),
      eventTime: eventStartTime,
    };

    console.log(
      `📅 [EVENT REMINDER] Will reschedule ${event.name} after event ends at ${formatGMT8(new Date(eventEndTime))}`
    );

    return;
  }

  // If both reminder time AND event time have passed, skip to next occurrence
  if (delay < 0) {
    console.log(
      `⏭️ [EVENT REMINDER] Event ${event.name} already finished at ${formatGMT8(eventStartTime)}\n` +
      `   Scheduling for next occurrence...`
    );
    // Event already passed, schedule for next day
    scheduleDailyEventReminder(eventKey, event);
    return;
  }

  // Schedule event reminder
  eventTimers[eventKey] = {
    eventTimer: setTimeout(async () => {
      await sendEventReminder(event, eventStartTime);

      // CRITICAL FIX: Wait until after the event ends before rescheduling
      // This prevents rescheduling during the reminder window (which would cause double-posting)
      const eventEndTime = eventStartTime.getTime() + (event.durationMinutes * 60 * 1000);
      const now = Date.now();
      const delayUntilAfterEvent = eventEndTime - now + 1000; // Add 1 second buffer

      // Only wait if event hasn't ended yet
      if (delayUntilAfterEvent > 0) {
        setTimeout(() => {
          scheduleDailyEventReminder(eventKey, event);
        }, delayUntilAfterEvent);
      } else {
        // Event already ended, reschedule immediately
        scheduleDailyEventReminder(eventKey, event);
      }
    }, delay),
    nextRun: reminderTime,
    eventTime: eventStartTime,
  };

  const nowGMT8 = getCurrentGMT8();
  const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][nowGMT8.getDay()];

  console.log(
    `📅 [EVENT REMINDER] Scheduled: ${event.name} (Daily)\n` +
    `   Reminder at: ${formatGMT8(reminderTime)} (in ${formatTimeRemaining(delay)})\n` +
    `   Event starts: ${formatGMT8(eventStartTime)}`
  );
}

/**
 * Schedule Guild War queue reminder
 * @param {number} targetDay - Day of week
 * @returns {void}
 */
function scheduleQueueReminder(targetDay) {
  const nextOccurrence = calculateNextOccurrence(
    targetDay,
    GUILD_WAR_QUEUE_REMINDER.startTime.hour,
    GUILD_WAR_QUEUE_REMINDER.startTime.minute
  );

  const now = new Date();
  const delay = nextOccurrence.getTime() - now.getTime();
  const queueKey = `queue_${targetDay}`;

  // Clear existing timer if any
  if (queueReminderTimers[queueKey]) {
    clearTimeout(queueReminderTimers[queueKey]);
  }

  // CRASH RECOVERY: If reminder time has passed, skip to next occurrence
  // (Queue reminders are posted once and deleted after 2 hours, no need to re-send)
  if (delay < 0) {
    console.log(
      `⏭️ [QUEUE REMINDER] Missed queue reminder at ${formatGMT8(nextOccurrence)}\n` +
      `   Scheduling for next occurrence...`
    );
    // Skip to next week
    scheduleQueueReminder(targetDay);
    return;
  }

  // Schedule queue reminder
  queueReminderTimers[queueKey] = setTimeout(async () => {
    await sendGuildWarQueueReminder();
    // Reschedule for next week
    scheduleQueueReminder(targetDay);
  }, delay);

  console.log(
    `📅 [QUEUE REMINDER] Scheduled: ${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][targetDay]} ` +
    `at ${formatGMT8(nextOccurrence)} (in ${formatTimeRemaining(delay)})`
  );
}

/**
 * Schedule all game event reminders
 * @returns {void}
 */
function scheduleAllEvents() {
  console.log('📅 [EVENT REMINDER] Scheduling all game events...');

  // Schedule Individual Arena (Mon, Wed, Fri)
  GAME_EVENTS.individualArena.days.forEach((day, index) => {
    scheduleEventReminder(`individualArena_${day}`, GAME_EVENTS.individualArena, day);
  });

  // Schedule Coop Arena (Tue, Thu, Sat)
  GAME_EVENTS.coopArena.days.forEach((day, index) => {
    scheduleEventReminder(`coopArena_${day}`, GAME_EVENTS.coopArena, day);
  });

  // Schedule Guild War (Fri, Sat, Sun)
  GAME_EVENTS.guildWar.days.forEach((day, index) => {
    scheduleEventReminder(`guildWar_${day}`, GAME_EVENTS.guildWar, day);
  });

  // Schedule GvG (Fri, Sat, Sun) - Creates attendance thread
  GAME_EVENTS.gvg.days.forEach((day, index) => {
    scheduleEventReminder(`gvg_${day}`, GAME_EVENTS.gvg, day);
  });

  // Schedule Guild Boss (Monday only) - Creates attendance thread
  GAME_EVENTS.guildBoss.days.forEach((day, index) => {
    scheduleEventReminder(`guildBoss_${day}`, GAME_EVENTS.guildBoss, day);
  });

  // Schedule Daily Events (World Boss)
  scheduleDailyEventReminder('worldBossMorning', DAILY_EVENTS.worldBossMorning);
  scheduleDailyEventReminder('worldBossEvening', DAILY_EVENTS.worldBossEvening);

  // Schedule Guild War queue reminders (Thu, Fri, Sat)
  GUILD_WAR_QUEUE_REMINDER.days.forEach(day => {
    scheduleQueueReminder(day);
  });

  console.log(`✅ [EVENT REMINDER] Scheduled ${Object.keys(eventTimers).length} event reminders`);
  console.log(`✅ [QUEUE REMINDER] Scheduled ${Object.keys(queueReminderTimers).length} queue reminders`);
}

// ============================================================================
// CRASH RECOVERY
// ============================================================================

/**
 * Persist active reminders to Google Sheets
 * @returns {Promise<void>}
 */
async function persistActiveReminders() {
  try {
    if (!sheetAPI) return;

    await sheetAPI.call('saveEventReminders', {
      reminders: activeReminders,
    }, { silent: true });

  } catch (error) {
    console.error('⚠️ [EVENT REMINDER] Failed to persist reminders:', error.message);
  }
}

/**
 * Load active reminders from Google Sheets (crash recovery)
 * @returns {Promise<void>}
 */
async function loadActiveReminders() {
  try {
    if (!sheetAPI) return;

    console.log('📥 [EVENT REMINDER] Loading active reminders from Google Sheets...');

    const response = await sheetAPI.call('loadEventReminders', {});

    if (response?.reminders) {
      activeReminders = response.reminders;
      const count = Object.keys(activeReminders).length;
      console.log(`✅ [EVENT REMINDER] Loaded ${count} active reminders`);

      // Reschedule deletions for loaded reminders
      const now = Date.now();
      for (const [messageId, reminder] of Object.entries(activeReminders)) {
        const timeUntilDelete = reminder.deleteAt - now;

        if (timeUntilDelete > 0) {
          // Still needs to be deleted
          setTimeout(() => deleteEventReminder(messageId), timeUntilDelete);
          console.log(`🔄 [EVENT REMINDER] Rescheduled deletion: ${reminder.eventType} (in ${formatTimeRemaining(timeUntilDelete)})`);
        } else {
          // Should have been deleted already, delete now
          await deleteEventReminder(messageId);
        }
      }
    } else {
      console.log('✅ [EVENT REMINDER] No active reminders found (starting fresh)');
    }

  } catch (error) {
    console.error('⚠️ [EVENT REMINDER] Failed to load reminders:', error.message);
  }
}

// ============================================================================
// INITIALIZATION & CLEANUP
// ============================================================================

/**
 * Initialize event reminder system
 * @param {Discord.Client} discordClient - Discord bot client
 * @param {Object} botConfig - Bot configuration
 * @param {SheetAPI} sheetAPIInstance - Google Sheets API instance
 * @returns {Promise<void>}
 */
async function initializeEventReminders(discordClient, botConfig, sheetAPIInstance, attendanceModule = null) {
  client = discordClient;
  config = botConfig;
  sheetAPI = sheetAPIInstance;
  attendance = attendanceModule; // For GvG attendance threads

  console.log('🎯 [EVENT REMINDER] Initializing game event reminder system...');

  // Load active reminders (crash recovery)
  await loadActiveReminders();

  // Schedule all events
  scheduleAllEvents();

  console.log('✅ [EVENT REMINDER] System initialized');
}

/**
 * Cleanup all timers (for graceful shutdown)
 * @returns {void}
 */
function cleanup() {
  console.log('🧹 [EVENT REMINDER] Cleaning up timers...');

  // Clear event timers
  for (const [key, timer] of Object.entries(eventTimers)) {
    if (timer.eventTimer) clearTimeout(timer.eventTimer);
  }
  eventTimers = {};

  // Clear queue reminder timers
  for (const [key, timer] of Object.entries(queueReminderTimers)) {
    clearTimeout(timer);
  }
  queueReminderTimers = {};

  console.log('✅ [EVENT REMINDER] Cleanup complete');
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  initializeEventReminders,
  cleanup,
  getStats: () => ({
    activeReminders: Object.keys(activeReminders).length,
    scheduledEvents: Object.keys(eventTimers).length,
    queueReminders: Object.keys(queueReminderTimers).length,
  }),
};
