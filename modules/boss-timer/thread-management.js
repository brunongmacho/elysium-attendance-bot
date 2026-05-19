/**
 * Thread management for the boss timer system.
 * Handles timer scheduling, spawn reminders, and attendance thread creation.
 */

const { EmbedBuilder } = require('discord.js');
const { getBossImageAttachment, getBossImageAttachmentURL } = require('../../utils/boss-images');
const { addGuildFooter } = require('../../utils/embed-branding');
const { normalizeTimestamp } = require('../../utils/common');
const state = require('./state');
const { REMINDER_MINUTES_BEFORE } = require('./constants');
const { deleteRecoveryData } = require('./cleanup');
const {
  formatGMT8,
  getBossType,
  findNextScheduledTime,
  findBossName,
  setScheduleReminderFn,
  setRescheduleScheduleBasedBossFn,
} = require('./spawn-tracking');

// ============================================================================
// RESCHEDULE HELPER (extracted from repeated pattern)
// ============================================================================

/**
 * Reschedule a schedule-based boss for its next occurrence.
 * @param {string} bossName - Boss name
 * @param {string} context - Log context
 */
function rescheduleScheduleBasedBoss(bossName, context) {
  const bossConfig = state.bossSpawnConfig.scheduleBasedBosses[bossName];
  if (!bossConfig || !bossConfig.schedules) return;

  // Clear existing timer if present (prevents duplicates)
  const existing = state.scheduledBossTimers.get(bossName.toLowerCase());
  if (existing && existing.timerId) {
    clearTimeout(existing.timerId);
    console.log(`🔄 Cleared existing timer for ${bossName} before rescheduling (${context})`);
  }

  const nextSpawn = findNextScheduledTime(bossConfig.schedules);
  if (nextSpawn) {
    const timerId = scheduleReminder(bossName, nextSpawn);
    state.scheduledBossTimers.set(bossName.toLowerCase(), {
      nextSpawn,
      timerId
    });
  }
}

// ============================================================================
// TIMER SCHEDULING
// ============================================================================

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

  // Handle late starts: if we're past reminder time but spawn hasn't happened yet
  if (delay < 0) {
    const timeUntilSpawn = spawnTime - now;

    // If spawn time has already passed (more than 1 min ago), skip it
    if (timeUntilSpawn < -60000) {
      console.log(`⏭️ Skipping past spawn for ${bossName} (spawn was: ${formatGMT8(spawnTime)})`);
      return null;
    }

    // If we're past reminder time but spawn is still upcoming/recent, trigger immediately
    console.log(`⚡ Late start detected for ${bossName} - triggering immediately (spawn: ${formatGMT8(spawnTime)})`);
    const timerId = setTimeout(async () => {
      await triggerSpawnReminder(bossName, spawnTime);
    }, Math.max(0, timeUntilSpawn));

    return timerId;
  }

  const timerId = setTimeout(async () => {
    await triggerSpawnReminder(bossName, spawnTime);
  }, delay);

  console.log(`⏰ Scheduled reminder for ${bossName} at ${formatGMT8(reminderTime)} (spawn: ${formatGMT8(spawnTime)})`);

  return timerId;
}

// ============================================================================
// SPAWN REMINDER TRIGGER
// ============================================================================

/**
 * Trigger 5-minute spawn reminder
 * @param {string} bossName - Boss name
 * @param {Date} spawnTime - Spawn time
 */
async function triggerSpawnReminder(bossName, spawnTime) {
  try {
    console.log(`🔔 Triggering spawn reminder for ${bossName}`);

    // Check if server is down - skip thread creation but reschedule
    if (state.isServerDown) {
      console.log(`⚠️ Server down mode active - skipping thread creation for ${bossName}`);

      // Clear from kill times cache
      state.bossKillTimes.delete(bossName.toLowerCase());

      // Handle timer cleanup based on boss type
      const bossType = getBossType(bossName);
      if (bossType === 'timer') {
        await deleteRecoveryData(bossName, 'server down mode');
      } else if (bossType === 'schedule') {
        rescheduleScheduleBasedBoss(bossName, 'server down mode');
      }

      return;
    }

    // Get announcement channel
    const announcementChannel = await state.client.channels.fetch(state.config.boss_spawn_announcement_channel_id);
    if (!announcementChannel) {
      console.error('❌ Boss spawn announcement channel not found');
      return;
    }

    // Check if spawn already exists (prevent duplicates)
    const activeSpawns = state.attendance.getActiveSpawns();
    if (activeSpawns[bossName]) {
      console.log(`⚠️ Spawn already exists for ${bossName}, skipping reminder to prevent duplicate`);

      state.bossKillTimes.delete(bossName.toLowerCase());

      const bossType = getBossType(bossName);
      if (bossType === 'timer') {
        await deleteRecoveryData(bossName, 'duplicate spawn');
      } else if (bossType === 'schedule') {
        rescheduleScheduleBasedBoss(bossName, 'duplicate spawn detected');
      }

      return;
    }

    // Create attendance thread (with duplicate handling)
    let thread;
    try {
      thread = await state.attendance.createThreadForBoss(state.client, bossName, spawnTime);
    } catch (error) {
      if (error.message.includes('duplicate spawn') || error.message.includes('Column already exists')) {
        console.log(`⚠️ Duplicate spawn detected for ${bossName} during thread creation - rescheduling for next spawn`);

        state.bossKillTimes.delete(bossName.toLowerCase());

        const bossType = getBossType(bossName);
        if (bossType === 'timer') {
          await deleteRecoveryData(bossName, 'duplicate error');
        } else if (bossType === 'schedule') {
          rescheduleScheduleBasedBoss(bossName, 'duplicate error');
        }
        return;
      }
      throw error; // Re-throw if not a duplicate error
    }

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

    // Fetch guild for branding and boss image fallback
    const guild = await state.client.guilds.fetch(state.config.main_guild_id);

    // Add boss image if available
    const bossImage = getBossImageAttachment(bossName);
    const bossImageURL = getBossImageAttachmentURL(bossName, guild);
    if (bossImageURL) {
      embed.setThumbnail(bossImageURL);
    }

    // Add guild branding
    addGuildFooter(embed, guild);

    const messagePayload = { content: '@everyone', embeds: [embed] };
    if (bossImage) {
      messagePayload.files = [bossImage];
    }

    await announcementChannel.send(messagePayload);

    // Clear from kill times cache (timer completed)
    state.bossKillTimes.delete(bossName.toLowerCase());

    // Add to recently handled cache to prevent duplicate from external bot
    const { addToRecentlyHandled } = require('./admin-commands');
    addToRecentlyHandled(bossName, spawnTime, thread.id);
    console.log(`📌 Added ${bossName} to recently-handled cache (15min TTL) - Thread: ${thread.id}`);

    // Handle timer cleanup based on boss type
    const bossType = getBossType(bossName);
    if (bossType === 'timer') {
      await deleteRecoveryData(bossName, 'timer completed');
    } else if (bossType === 'schedule') {
      rescheduleScheduleBasedBoss(bossName, 'timer completed');
    }

    console.log(`✅ Spawn reminder sent for ${bossName}`);
  } catch (error) {
    console.error(`❌ Failed to trigger spawn reminder for ${bossName}:`, error);
  }
}

// ============================================================================
// INIT: Wire up function references to avoid circular dependencies
// ============================================================================
setScheduleReminderFn(scheduleReminder);
setRescheduleScheduleBasedBossFn(rescheduleScheduleBasedBoss);

// ============================================================================
// EXPORTS
// ============================================================================
module.exports = {
  scheduleReminder,
  triggerSpawnReminder,
  rescheduleScheduleBasedBoss,
};
