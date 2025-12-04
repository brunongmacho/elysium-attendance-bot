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
 * Send reminder notification to Discord channel
 * @param {Object} reminder - Reminder object
 */
async function sendReminderNotification(reminder) {
  try {
    const channel = await client.channels.fetch(reminder.channelId);
    if (!channel) {
      console.error(`❌ Channel not found for reminder: ${reminder.eventName}`);
      // Mark as inactive since channel is gone
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

    // Send notification
    await channel.send({ embeds: [embed] });
    console.log(`✅ Sent reminder: ${reminder.eventName}`);

    // Update reminder after triggering
    const nextTrigger = calculateNextTrigger(reminder);
    await mongoHelpers.updateReminderAfterTrigger(reminder._id.toString(), nextTrigger);

  } catch (error) {
    console.error(`❌ Error sending reminder "${reminder.eventName}":`, error.message);
    // Deactivate if error persists (e.g., invalid channel)
    if (error.code === 10003 || error.code === 50001) {
      await mongoHelpers.deactivateReminder(reminder._id.toString());
    }
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
  checkDueReminders // For manual testing
};
