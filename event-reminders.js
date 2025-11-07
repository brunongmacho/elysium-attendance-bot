/**
 * ============================================================================
 * GAME EVENT REMINDER SYSTEM
 * ============================================================================
 *
 * Automated reminder system for recurring game events with crash recovery.
 *
 * FEATURES:
 * - Scheduled reminders for Individual Arena, Coop Arena, and Guild War
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
    thumbnail: 'https://i.imgur.com/7GJvQqz.png', // Arena icon
    reminderOffsetMinutes: REMINDER_OFFSET_MINUTES, // Remind 10 min before
  },
  coopArena: {
    name: '🤝 Coop Round Arena',
    days: [2, 4, 6], // Tuesday, Thursday, Saturday
    startTime: { hour: 19, minute: 30 }, // Actual event time
    durationMinutes: 60,
    color: 0x4ecdc4, // Teal
    description: 'Coop Round Arena is starting soon!',
    thumbnail: 'https://i.imgur.com/7GJvQqz.png', // Arena icon
    reminderOffsetMinutes: REMINDER_OFFSET_MINUTES, // Remind 10 min before
  },
  guildWar: {
    name: '⚔️ Guild War',
    days: [5, 6, 0], // Friday, Saturday, Sunday
    startTime: { hour: 19, minute: 25 }, // Actual event time
    durationMinutes: 3,
    color: 0xff4757, // Dark red
    description: '**GUILD WAR** is starting soon! Get ready!',
    thumbnail: 'https://i.imgur.com/kR2B3Yx.png', // War icon
    reminderOffsetMinutes: 20, // Remind 20 min before (gives players time to prepare)
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
    const timeUntilEvent = eventTime.getTime() - now.getTime();
    const endTime = new Date(eventTime.getTime() + event.durationMinutes * 60 * 1000);

    const embed = new EmbedBuilder()
      .setColor(event.color)
      .setTitle(event.name)
      .setDescription(event.description)
      .addFields(
        {
          name: '⏰ Start Time',
          value: formatGMT8(eventTime),
          inline: true,
        },
        {
          name: '⏱️ Duration',
          value: `${event.durationMinutes} minutes`,
          inline: true,
        },
        {
          name: '⏳ Starts In',
          value: formatTimeRemaining(timeUntilEvent),
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

    const embed = new EmbedBuilder()
      .setColor(GUILD_WAR_QUEUE_REMINDER.color)
      .setTitle(GUILD_WAR_QUEUE_REMINDER.name)
      .setDescription(
        `${GUILD_WAR_QUEUE_REMINDER.description}\n\n` +
        `📋 **Action Required:**\n` +
        `Please queue the guild for tomorrow's Guild War before server reset.\n\n` +
        `⏰ This reminder will be deleted at **1:00 AM GMT+8**`
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

  // Schedule event reminder
  eventTimers[eventKey] = {
    eventTimer: setTimeout(async () => {
      await sendEventReminder(event, eventStartTime); // Pass actual event time for display
      // Reschedule for next week
      scheduleEventReminder(eventKey, event, targetDay);
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
async function initializeEventReminders(discordClient, botConfig, sheetAPIInstance) {
  client = discordClient;
  config = botConfig;
  sheetAPI = sheetAPIInstance;

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
