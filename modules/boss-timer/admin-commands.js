/**
 * Admin commands and state management for the boss timer system.
 * Handles server down, maintenance, clear kills, no-spawn, spawned confirmation.
 */

const mongoHelpers = require('../../utils/mongodb-helpers');
const crashRecovery = require('../../utils/crash-recovery');
const { normalizeTimestamp } = require('../../utils/common');
const state = require('./state');
const { clearAllTimerRecoveryData } = require('./cleanup');
const {
  findBossName,
  getBossType,
  findNextScheduledTime,
  scheduleReminder,
  setRescheduleScheduleBasedBossFn,
} = require('./spawn-tracking');
const { rescheduleScheduleBasedBoss } = require('./thread-management');

// Wire up the reschedule function reference for spawn-tracking.js
setRescheduleScheduleBasedBossFn(rescheduleScheduleBasedBoss);

// ============================================================================
// RECENTLY HANDLED CACHE
// ============================================================================

/**
 * Check if boss was recently handled by timer system
 * @param {string} bossName - Boss name
 * @returns {Object|null} Recently handled data or null
 */
function wasRecentlyHandled(bossName) {
  const normalizedName = bossName.toLowerCase();
  return state.recentlyHandledBosses.get(normalizedName) || null;
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
  const existing = state.recentlyHandledBosses.get(normalizedName);
  if (existing && existing.clearTimeoutId) {
    clearTimeout(existing.clearTimeoutId);
    console.log(`🔄 Cleared old timeout for ${bossName} before overwriting cache`);
  }

  // Set new cache entry with 15 minute TTL
  const clearTimeoutId = setTimeout(() => {
    state.recentlyHandledBosses.delete(normalizedName);
    console.log(`🗑️ Cleared recently-handled cache for ${bossName}`);
  }, 15 * 60 * 1000); // 15 minutes

  state.recentlyHandledBosses.set(normalizedName, {
    handledAt: new Date(),
    spawnTime,
    threadId,
    clearTimeoutId
  });
}

// ============================================================================
// SERVER DOWN
// ============================================================================

/**
 * Enable server down mode - prevents attendance thread creation
 * Clears all boss timers making them available again
 * @returns {Promise<number>} Number of timers cleared
 */
async function serverDown() {
  console.log('🛑 Entering server down mode');

  state.isServerDown = true;

  // Cancel and clear all boss timers
  let count = 0;
  for (const [bossName, data] of state.bossKillTimes) {
    if (data.timerId) {
      clearTimeout(data.timerId);
      count++;
    }
  }
  state.bossKillTimes.clear();

  // Save state for crash recovery
  await saveServerDownState();

  console.log(`✅ Server down mode activated - cleared ${count} timers`);
  return count;
}

/**
 * Get server down status
 * @returns {boolean} True if server is down
 */
function getServerDownStatus() {
  return state.isServerDown;
}

// ============================================================================
// MAINTENANCE
// ============================================================================

/**
 * Maintenance spawn threads for all bosses
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
  if (state.isServerDown) {
    console.log('✅ Exiting server down mode - resuming normal operations');
    state.isServerDown = false;
    await saveServerDownState();
  }

  // Clear all timer-based boss entries from MongoDB and Google Sheets
  await clearAllTimerRecoveryData();

  // Cancel all existing timer-based timers
  for (const [bossName, data] of state.bossKillTimes) {
    if (data.timerId) {
      clearTimeout(data.timerId);
    }
  }
  state.bossKillTimes.clear();

  // Create immediate attendance threads for all timer-based bosses (maintenance mode)
  console.log('📝 Creating attendance threads for all timer-based bosses...');
  for (const [bossName, bossConfig] of Object.entries(state.bossSpawnConfig.timerBasedBosses)) {
    if (bossName.startsWith('_')) continue;

    try {
      const thread = await state.attendance.createThreadForBoss(state.client, bossName, now, true, true);
      console.log(`✅ Created maintenance thread for ${bossName}: ${thread.id}`);
      timerCount++;

      // Create attendance record in MongoDB so dashboard shows boss as spawned
      const spawnIntervalMs = (bossConfig.spawnIntervalHours || 24) * 60 * 60 * 1000;
      const killTimestamp = new Date(now.getTime() - spawnIntervalMs);

      await mongoHelpers.addAttendanceRecord({
        memberId: 'system_maintenance',
        memberName: 'System',
        bossName: bossName,
        bossPoints: 0,
        timestamp: killTimestamp,
        weekStartDate: now,
        weekLabel: 'Maintenance',
        verified: true,
        threadId: thread.id
      });
      console.log(`📊 Created attendance record for ${bossName} in MongoDB`);
    } catch (error) {
      console.error(`❌ Failed to create thread for ${bossName}:`, error.message);
    }
  }

  console.log(`✅ Created ${timerCount} attendance threads for timer-based bosses`);

  // Clear all existing scheduled boss timers to prevent duplicates
  console.log('🔄 Clearing existing scheduled boss timers...');
  for (const [bossName, data] of state.scheduledBossTimers) {
    if (data.timerId) {
      clearTimeout(data.timerId);
    }
  }
  state.scheduledBossTimers.clear();
  console.log('✅ Cleared all scheduled boss timers');

  // Schedule all schedule-based bosses (no API calls, just setTimeout)
  console.log('🔄 Scheduling all schedule-based bosses...');
  for (const [bossName, bossConfig] of Object.entries(state.bossSpawnConfig.scheduleBasedBosses)) {
    if (bossName.startsWith('_')) continue;

    const nextSpawn = findNextScheduledTime(bossConfig.schedules);
    if (nextSpawn && !isNaN(nextSpawn.getTime())) {
      const timerId = scheduleReminder(bossName, nextSpawn);

      state.scheduledBossTimers.set(bossName.toLowerCase(), {
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

// ============================================================================
// CLEAR KILLS
// ============================================================================

/**
 * Clear all timer-based kills
 * @returns {Promise<number>} Number of timers cleared
 */
async function clearKills() {
  let count = 0;

  // Cancel all timer-based timers
  for (const [bossName, data] of state.bossKillTimes) {
    const actualName = findBossName(bossName);
    if (getBossType(actualName) === 'timer' && data.timerId) {
      clearTimeout(data.timerId);
      count++;
    }
  }

  // Clear timer-based from cache
  for (const bossName of Object.keys(state.bossSpawnConfig.timerBasedBosses)) {
    if (bossName.startsWith('_')) continue;
    state.bossKillTimes.delete(bossName.toLowerCase());
  }

  // Clear from MongoDB
  try {
    for (const bossName of Object.keys(state.bossSpawnConfig.timerBasedBosses)) {
      if (!bossName.startsWith('_')) {
        await mongoHelpers.deleteBossTimer(bossName);
      }
    }
    console.log('✅ Cleared timer-based bosses from MongoDB');
  } catch (error) {
    console.error(`⚠️ Failed to clear MongoDB:`, error.message);
  }

  // Clear from Sheets
  try {
    await state.sheetAPI.call('clearBossTimerRecovery', { type: 'timer-based' });
  } catch (error) {
    console.error(`⚠️ Failed to clear recovery data:`, error.message);
  }

  return count;
}

// ============================================================================
// NO-SPAWN HANDLER
// ============================================================================

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
    const { cancelTimer } = require('./spawn-tracking');
    const timerCancelled = await cancelTimer(bossName);

    // Check if boss was recently handled (has thread)
    const recentlyHandled = state.recentlyHandledBosses.get(normalizedName);

    if (recentlyHandled && recentlyHandled.threadId) {
      // Get the thread
      const guild = await state.client.guilds.fetch(state.config.main_guild_id);
      const attChannel = await guild.channels.fetch(state.config.attendance_channel_id);
      const thread = await attChannel.threads.fetch(recentlyHandled.threadId);

      if (thread) {
        // CRITICAL: Clean up spawn state from attendance module BEFORE locking thread
        const activeSpawns = state.attendance.getActiveSpawns();
        const spawnInfo = activeSpawns[thread.id];

        if (spawnInfo) {
          spawnInfo.closed = true;

          // Remove from activeColumns to prevent duplicate detection
          const activeColumns = state.attendance.getActiveColumns();
          const cacheKey = `${spawnInfo.boss.toUpperCase()}|${normalizeTimestamp(spawnInfo.timestamp)}`;
          delete activeColumns[cacheKey];

          // Clean up pending verifications for this thread
          const pendingVerifications = state.attendance.getPendingVerifications();
          const pendingInThread = Object.keys(pendingVerifications).filter(
            (msgId) => pendingVerifications[msgId].threadId === thread.id
          );
          pendingInThread.forEach((msgId) => delete pendingVerifications[msgId]);

          // Clean up pending closures for this thread
          const pendingClosures = state.attendance.getPendingClosures();
          const closuresInThread = Object.keys(pendingClosures).filter(
            (msgId) => pendingClosures[msgId].threadId === thread.id
          );
          closuresInThread.forEach((msgId) => delete pendingClosures[msgId]);

          // Clean up confirmation messages
          const confirmationMessages = state.attendance.getConfirmationMessages();
          delete confirmationMessages[thread.id];

          // Close confirmation thread if it exists
          if (spawnInfo.confirmThreadId) {
            try {
              const confirmThread = await guild.channels.fetch(spawnInfo.confirmThreadId).catch(() => null);
              if (confirmThread) {
                await confirmThread.send(`⚠️ Spawn cancelled: **${spawnInfo.boss}** (${spawnInfo.timestamp}) - Thread marked as false alarm`);
                await confirmThread.delete().catch(err => console.error('Failed to delete confirm thread for false alarm:', err.message));
              }
            } catch (error) {
              console.error(`⚠️ Failed to clean up confirmation thread:`, error.message);
            }
          }

          // Remove from activeSpawns
          delete activeSpawns[thread.id];

          // Sync state back to attendance module
          state.attendance.setActiveSpawns(activeSpawns);
          state.attendance.setActiveColumns(activeColumns);
          state.attendance.setPendingVerifications(pendingVerifications);
          state.attendance.setPendingClosures(pendingClosures);
          state.attendance.setConfirmationMessages(confirmationMessages);

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
      const announcementChannel = await state.client.channels.fetch(state.config.boss_spawn_announcement_channel_id);
      if (announcementChannel) {
        await announcementChannel.send(`❌ **${bossName} spawn cancelled** - Wrong timer data reported by <@${userId}>\n\nPlease wait for actual spawn confirmation.`);
      }

      // Keep in recently handled cache to prevent external bot duplicate
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

// ============================================================================
// SPAWNED HANDLER
// ============================================================================

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
    // Check if already handled recently or currently being handled
    const existing = state.recentlyHandledBosses.get(normalizedName);
    if (existing) {
      // If pending, wait for the handler promise to complete
      if (existing.handlerPromise) {
        console.log(`⏳ ${bossName} handler already in progress - waiting for result`);
        try {
          const result = await existing.handlerPromise;
          console.log(`✅ Returning result from concurrent handler for ${bossName}`);
          return result;
        } catch (err) {
          console.error(`❌ Concurrent handler failed for ${bossName}:`, err.message);
          throw err;
        }
      }

      // Already handled (not pending)
      const timeSince = Math.round((Date.now() - existing.handledAt) / 1000 / 60);
      console.log(`⚠️ ${bossName} already handled ${timeSince}min ago - returning existing thread`);

      return {
        success: true,
        threadId: existing.threadId,
        threadUrl: `https://discord.com/channels/${state.config.main_guild_id}/${state.config.attendance_channel_id}/${existing.threadId}`,
        bossName,
        alreadyHandled: true
      };
    }

    // Mark this handler as in-progress so concurrent calls wait for us
    let resolveHandler, rejectHandler;
    const handlerPromise = new Promise((resolve, reject) => {
      resolveHandler = resolve;
      rejectHandler = reject;
    });

    state.recentlyHandledBosses.set(normalizedName, {
      handledAt: new Date(),
      handlerPromise,
      pending: true
    });
    console.log(`🔒 Marked ${bossName} handler as pending`);

    try {
      // Create attendance thread for current spawn
      const thread = await state.attendance.createThreadForBoss(state.client, bossName, now);

      // Post confirmation in announcement channel with embed and thumbnail
      const announcementChannel = await state.client.channels.fetch(state.config.boss_spawn_announcement_channel_id);
      if (announcementChannel) {
        const timestamp = Math.floor(now.getTime() / 1000);

        const { EmbedBuilder } = require('discord.js');
        const { getBossImageAttachment, getBossImageAttachmentURL } = require('../../utils/boss-images');
        const { addGuildFooter } = require('../../utils/embed-branding');

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

        const guild = await state.client.guilds.fetch(state.config.main_guild_id);

        const bossImage = getBossImageAttachment(bossName);
        const bossImageURL = getBossImageAttachmentURL(bossName, guild);
        if (bossImageURL) {
          embed.setThumbnail(bossImageURL);
        }

        addGuildFooter(embed, guild);

        const messagePayload = { embeds: [embed] };
        if (bossImage) {
          messagePayload.files = [bossImage];
        }

        await announcementChannel.send(messagePayload);
      }

      // Add to recently handled cache
      addToRecentlyHandled(bossName, now, thread.id);
      console.log(`📌 Added ${bossName} to recently-handled cache (15min TTL) - Thread: ${thread.id}`);

      const result = {
        success: true,
        threadId: thread.id,
        threadUrl: thread.url,
        bossName
      };

      resolveHandler(result);

      return result;
    } catch (error) {
      console.error(`❌ Handler failed for ${bossName}:`, error.message);

      rejectHandler(error);

      state.recentlyHandledBosses.delete(normalizedName);

      return {
        success: false,
        error: error.message
      };
    }
  } catch (error) {
    console.error(`❌ Failed to handle spawned for ${bossName}:`, error);
    return {
      success: false,
      error: error.message
    };
  }
}

// ============================================================================
// CRASH RECOVERY - SERVER DOWN STATE
// ============================================================================

/**
 * Save server down state with PARALLEL DUAL-WRITE (MongoDB + crash recovery)
 */
async function saveServerDownState() {
  try {
    const mongoSavePromise = (async () => {
      try {
        await mongoHelpers.saveServerDownState(state.isServerDown);
        return { success: true };
      } catch (error) {
        console.error(`❌ MongoDB save failed for server state:`, error.message);
        return { success: false };
      }
    })();

    const crashSavePromise = (async () => {
      try {
        await crashRecovery.saveBossTimerState({
          isServerDown: state.isServerDown,
        });
        return { success: true };
      } catch (error) {
        console.error(`❌ Crash recovery save failed for server state:`, error.message);
        return { success: false };
      }
    })();

    await Promise.all([mongoSavePromise, crashSavePromise]);
  } catch (error) {
    console.error('⚠️ Failed to save server down state:', error.message);
  }
}

/**
 * Restore server down state from MongoDB (with fallback to crash recovery)
 */
async function restoreServerDownState() {
  try {
    let restored = false;

    // Try MongoDB first
    try {
      const serverDown = await mongoHelpers.getServerDownState();
      if (serverDown !== undefined) {
        state.isServerDown = serverDown;
        const status = state.isServerDown ? 'DOWN' : 'UP';
        console.log(`🔄 [MONGODB] Restored server state: ${status}`);
        restored = true;

        if (state.isServerDown) {
          console.log('⚠️ Bot restarted in SERVER DOWN mode - attendance threads will NOT be created');
          console.log('💡 Use !maintenance to resume normal operations');
        }
      }
    } catch (mongoError) {
      console.warn(`⚠️ MongoDB unavailable for server state: ${mongoError.message}`);
    }

    // Fallback to crash recovery if MongoDB failed
    if (!restored) {
      const recoveryState = crashRecovery.getRecoveryState();
      if (recoveryState?.bossTimer?.isServerDown !== undefined) {
        state.isServerDown = recoveryState.bossTimer.isServerDown;
        const status = state.isServerDown ? 'DOWN' : 'UP';
        console.log(`🔄 [CRASH RECOVERY] Restored server state: ${status} (fallback)`);

        if (state.isServerDown) {
          console.log('⚠️ Bot restarted in SERVER DOWN mode - attendance threads will NOT be created');
          console.log('💡 Use !maintenance to resume normal operations');
        }
      }
    }
  } catch (error) {
    console.error('⚠️ Failed to restore server down state:', error.message);
  }
}

// ============================================================================
// EXPORTS
// ============================================================================
module.exports = {
  wasRecentlyHandled,
  addToRecentlyHandled,
  serverDown,
  getServerDownStatus,
  maintenance,
  clearKills,
  handleNoSpawn,
  handleSpawned,
  saveServerDownState,
  restoreServerDownState,
};
