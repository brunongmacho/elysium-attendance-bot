/**
 * ============================================================================
 * EVENT REMINDER SERVICE (MongoDB-Powered)
 * ============================================================================
 *
 * PURPOSE:
 * Manages event reminders with MongoDB storage
 * Provides notification system for scheduled events
 *
 * FEATURES:
 * - MongoDB-first storage (eventReminders collection)
 * - Automatic reminder checking (1-minute intervals)
 * - Recurring reminder support
 * - Event types: boss_spawn, auction, guild_event, custom
 * - Role mention support
 *
 * MONGODB INTEGRATION (Phase 10):
 * - All reminder data stored in MongoDB
 * - Fast queries with indexes
 * - Automatic recurring reminder management
 *
 * @module event-reminders
 * ============================================================================
 */

const mongoHelpers = require('../utils/mongodb-helpers');
const { EmbedBuilder } = require('discord.js');
const { DISCORD_ERRORS } = require('../utils/constants');

// ============================================================================
// CONFIGURATION
// ============================================================================

const CHECK_INTERVAL = 60 * 1000; // Check every 1 minute for due reminders

// ============================================================================
// SERVICE STATE
// ============================================================================

let client = null;
let checkTimer = null;
let isRunning = false;

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize event reminder service
 * @param {Object} discordClient - Discord.js client
 */
function initialize(discordClient) {
  client = discordClient;
  console.log('✅ Event reminder service initialized');
}

/**
 * Start reminder checking service
 */
function start() {
  if (isRunning) {
    console.log('⚠️ Event reminder service already running');
    return;
  }

  isRunning = true;
  console.log(`✅ Event reminder service started (checking every ${CHECK_INTERVAL / 1000}s)`);

  // Check immediately
  checkDueReminders();

  // Then check periodically
  checkTimer = setInterval(() => {
    checkDueReminders();
  }, CHECK_INTERVAL);
}

/**
 * Stop reminder checking service
 */
function stop() {
  if (!isRunning) {
    return;
  }

  if (checkTimer) {
    clearInterval(checkTimer);
    checkTimer = null;
  }

  isRunning = false;
  console.log('✅ Event reminder service stopped');
}

// ============================================================================
// REMINDER CHECKING
// ============================================================================

/**
 * Check for due reminders and send notifications
 */
async function checkDueReminders() {
  try {
    const dueReminders = await mongoHelpers.getDueReminders();

    if (dueReminders.length === 0) {
      return;
    }

    console.log(`📅 Found ${dueReminders.length} due reminder(s)`);

    for (const reminder of dueReminders) {
      await sendReminderNotification(reminder);
    }
  } catch (error) {
    console.error('❌ Error checking due reminders:', error.message);
  }
}

/**
 * Send reminder notification to Discord channel (PHASE 2: Enhanced validation)
 * @param {Object} reminder - Reminder object
 */
async function sendReminderNotification(reminder) {
  try {
    // PHASE 2.1: Enhanced channel validation with explicit error handling
    let channel;
    try {
      channel = await client.channels.fetch(reminder.channelId);
    } catch (fetchError) {
      // Handle channel fetch failures explicitly
      console.error(`❌ Failed to fetch channel ${reminder.channelId} for reminder "${reminder.eventName}":`, fetchError.message);

      // Deactivate reminder if channel is permanently inaccessible
      if (fetchError.code === DISCORD_ERRORS.UNKNOWN_CHANNEL) {
        console.log(`⚠️ Channel ${reminder.channelId} no longer exists, deactivating reminder "${reminder.eventName}"`);
        await mongoHelpers.deactivateReminder(reminder._id.toString());
      } else if (fetchError.code === DISCORD_ERRORS.MISSING_ACCESS) {
        console.log(`⚠️ No access to channel ${reminder.channelId}, deactivating reminder "${reminder.eventName}"`);
        await mongoHelpers.deactivateReminder(reminder._id.toString());
      } else {
        // Temporary error - don't deactivate, will retry next check
        console.log(`⚠️ Temporary error fetching channel, will retry next check`);
      }
      return;
    }

    // Additional validation: ensure channel is text-based
    if (!channel) {
      console.error(`❌ Channel not found for reminder: ${reminder.eventName}`);
      await mongoHelpers.deactivateReminder(reminder._id.toString());
      return;
    }

    if (!channel.isTextBased()) {
      console.error(`❌ Channel ${reminder.channelId} is not text-based, deactivating reminder "${reminder.eventName}"`);
      await mongoHelpers.deactivateReminder(reminder._id.toString());
      return;
    }

    // Build message content
    let content = reminder.message;

    // Add role mention if specified
    if (reminder.mentionRole) {
      content = `<@&${reminder.mentionRole}> ${content}`;
    }

    // Create embed
    const embed = new EmbedBuilder()
      .setColor(0x00AE86)
      .setTitle(`📅 Reminder: ${reminder.eventName}`)
      .setDescription(content)
      .setTimestamp()
      .setFooter({ text: `Event Type: ${reminder.eventType}` });

    // Send notification with error handling
    try {
      await channel.send({ embeds: [embed] });
      console.log(`✅ Sent reminder: ${reminder.eventName}`);
    } catch (sendError) {
      console.error(`❌ Failed to send message for reminder "${reminder.eventName}":`, sendError.message);

      // Deactivate if permissions issue or channel deleted
      if (sendError.code === DISCORD_ERRORS.MISSING_PERMISSIONS || sendError.code === DISCORD_ERRORS.UNKNOWN_CHANNEL) {
        console.log(`⚠️ Deactivating reminder "${reminder.eventName}" due to send failure`);
        await mongoHelpers.deactivateReminder(reminder._id.toString());
        return;
      }

      // Other errors - don't deactivate, will retry
      throw sendError;
    }

    // Update reminder after triggering
    const nextTrigger = calculateNextTrigger(reminder);
    await mongoHelpers.updateReminderAfterTrigger(reminder._id.toString(), nextTrigger);

  } catch (error) {
    console.error(`❌ Unexpected error in reminder "${reminder.eventName}":`, error.message);
    // Don't deactivate on unexpected errors - log and continue
    // This prevents accidental deactivation of working reminders
  }
}

/**
 * Calculate next trigger time for recurring reminders
 * @param {Object} reminder - Reminder object
 * @returns {Date|null} Next trigger time or null if not recurring
 */
function calculateNextTrigger(reminder) {
  if (!reminder.recurring || !reminder.recurrenceRule) {
    return null; // Not recurring
  }

  const now = new Date();
  let next = null;

  switch (reminder.recurrenceRule) {
    case 'daily':
      next = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      break;

    case 'weekly':
      next = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      break;

    case 'monthly':
      next = new Date(now);
      next.setMonth(next.getMonth() + 1);
      break;

    default:
      console.warn(`⚠️ Unknown recurrence rule: ${reminder.recurrenceRule}`);
      return null;
  }

  return next;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Create a new reminder
 * @param {Object} reminderData - Reminder data
 * @returns {Promise<Object>} Created reminder
 */
async function createReminder(reminderData) {
  return await mongoHelpers.createReminder(reminderData);
}

/**
 * Get all active reminders
 * @returns {Promise<Array>} Array of active reminders
 */
async function getActiveReminders() {
  return await mongoHelpers.getActiveReminders();
}

/**
 * Delete reminder
 * @param {string} reminderId - Reminder ID
 * @returns {Promise<Object>} Delete result
 */
async function deleteReminder(reminderId) {
  return await mongoHelpers.deleteReminder(reminderId);
}

/**
 * Deactivate reminder
 * @param {string} reminderId - Reminder ID
 * @returns {Promise<Object>} Update result
 */
async function deactivateReminder(reminderId) {
  return await mongoHelpers.deactivateReminder(reminderId);
}

/**
 * Get reminders by event type
 * @param {string} eventType - Event type
 * @returns {Promise<Array>} Array of reminders
 */
async function getRemindersByType(eventType) {
  return await mongoHelpers.getRemindersByType(eventType);
}

// ============================================================================
// EVENT SCHEDULE SYNC (Phase 10.5)
// ============================================================================

/**
 * Generate next N days of occurrences for a schedule event
 * @param {Object} event - Event schedule object from JSON
 * @param {number} daysAhead - Number of days to look ahead (default: 28)
 * @returns {Array<{eventTime: Date, reminderOffsetMinutes: number}>} Array of occurrences
 */
function generateEventOccurrences(event, daysAhead = 28) {
  const occurrences = [];
  const now = new Date();
  const offset = 8 * 60; // GMT+8 offset in minutes

  for (let d = 0; d < daysAhead; d++) {
    const date = new Date(now);
    date.setDate(date.getDate() + d);
    date.setHours(0, 0, 0, 0); // Start of day UTC

    // Use GMT+8 for day calculation
    const gmt8Date = new Date(date.getTime() + offset * 60 * 1000);
    const dayOfWeek = gmt8Date.getUTCDay(); // 0=Sun, 1=Mon, ...

    let shouldInclude = false;

    if (event.isDaily) {
      shouldInclude = true;
    } else if (event.days && event.days.length > 0) {
      shouldInclude = event.days.includes(dayOfWeek);
    }

    if (!shouldInclude) continue;

    // Calculate event time in GMT+8
    const eventDate = new Date(date.getTime() + offset * 60 * 1000);
    eventDate.setUTCHours(event.startTime.hour, event.startTime.minute, 0, 0);

    // Convert back to UTC for storage
    const eventTime = new Date(eventDate.getTime() - offset * 60 * 1000);

    // Skip if event time is already past (more than 10 minutes ago)
    if (eventTime.getTime() < now.getTime() - 10 * 60 * 1000) continue;

    const reminderOffsetMinutes = event.reminderOffsetMinutes || 10;

    occurrences.push({
      eventTime,
      reminderOffsetMinutes,
    });
  }

  return occurrences;
}

/**
 * Sync event schedule to MongoDB reminders
 * Reads the shared event-schedules.json and creates/updates reminders in MongoDB
 * @param {Object} config - Bot configuration (needs reminders_channel_id)
 * @param {boolean} force - Force re-sync (delete and recreate all)
 * @returns {Promise<Object>} { created, skipped }
 */
async function syncEventScheduleToMongoDB(config, force = false) {
  const channelId = config.reminders_channel_id;

  if (!channelId) {
    console.log('⚠️ [Event Schedule Sync] No reminders channel configured (use !setup reminders)');
    return { created: 0, skipped: 0, error: 'no_channel' };
  }

  console.log('📅 [Event Schedule Sync] Syncing event schedule to MongoDB reminders...');
  const startTime = Date.now();

  let events;
  try {
    // Path from services/ to dashboard/data/event-schedules.json
    events = require('../dashboard/data/event-schedules.json');
  } catch (err) {
    console.error('❌ [Event Schedule Sync] Failed to load event-schedules.json:', err.message);
    return { created: 0, skipped: 0, error: 'load_failed' };
  }

  if (!events || !Array.isArray(events) || events.length === 0) {
    console.log('⚠️ [Event Schedule Sync] No events found in schedule');
    return { created: 0, skipped: 0, error: 'empty' };
  }

  let created = 0;
  let skipped = 0;

  // If force mode, delete all existing guild_event reminders
  if (force) {
    try {
      const result = await mongoHelpers.deleteRemindersByType('guild_event');
      console.log(`🧹 [Event Schedule Sync] Force mode: deleted ${result.deletedCount || 0} existing guild_event reminders`);
    } catch (err) {
      console.error('❌ [Event Schedule Sync] Failed to clear existing reminders:', err.message);
    }
  }

  for (const event of events) {
    const occurrences = generateEventOccurrences(event);

    for (const occ of occurrences) {
      // Calculate reminder trigger time (event time minus offset minutes)
      const triggerTime = new Date(occ.eventTime.getTime() - occ.reminderOffsetMinutes * 60 * 1000);

      // Skip if trigger time is already past
      if (triggerTime <= new Date()) continue;

      // Check if reminder already exists for this event + trigger time
      // Use event name + trigger time as dedup key
      const existing = await mongoHelpers.getReminderByEventTime(event.name, triggerTime);
      if (existing) {
        skipped++;
        continue;
      }

      await mongoHelpers.createReminder({
        eventType: 'guild_event',
        eventName: `${event.icon || '📅'} ${event.name}`,
        reminderTime: triggerTime, // When the reminder fires (createReminder sets nextTrigger = reminderTime)
        notifyBefore: occ.reminderOffsetMinutes * 60 * 1000,
        channelId: channelId,
        message: `⏰ **${event.name}** starts in **${occ.reminderOffsetMinutes} minutes**!`,
        recurring: false,
        createdBy: 'system',
      });
      created++;
    }
  }

  // Clean up past reminders
  try {
    await mongoHelpers.cleanupPastReminders();
  } catch (err) {
    console.warn('⚠️ [Event Schedule Sync] Failed to clean up past reminders:', err.message);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`✅ [Event Schedule Sync] Complete: ${created} created, ${skipped} skipped (${elapsed}s)`);

  return { created, skipped };
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  initialize,
  start,
  stop,
  createReminder,
  getActiveReminders,
  deleteReminder,
  deactivateReminder,
  getRemindersByType,
  checkDueReminders, // For manual testing
  generateEventOccurrences,
  syncEventScheduleToMongoDB,
};
