/**
 * Schedule-based boss logic: rotation CRUD, notifications, and daily schedule management.
 * Handles the 5-guild rotation system, MongoDB sync, daily schedule posting/cleanup.
 */

const { EmbedBuilder } = require('discord.js');
const { getBossImageAttachment, getBossImageAttachmentURL } = require('../../utils/boss-images');
const { addGuildFooter } = require('../../utils/embed-branding');
const dbAPI = require('../../utils/database-api');
const mongoHelpers = require('../../utils/mongodb-helpers');
const state = require('./state');

// ============================================================================
// SHEET OPERATIONS - BOSS LIST
// ============================================================================

/**
 * Fetches the list of all rotating bosses from Google Sheets
 * Updates the ROTATING_BOSSES array dynamically
 */
async function fetchRotatingBosses() {
  try {
    const result = await state.sheetAPI.call('getAllRotatingBosses');

    if (result.status === 'ok' && result.bosses && result.bosses.length > 0) {
      state.ROTATING_BOSSES = result.bosses;
      console.log(`✅ Loaded ${result.bosses.length} rotating bosses: ${result.bosses.join(', ')}`);
    } else {
      console.warn('ℹ️ No rotating bosses found in sheet - rotation system disabled');
    }
  } catch (err) {
    console.error('❌ Error fetching rotating bosses:', err.message);
  }
}

// ============================================================================
// SHEET OPERATIONS - ROTATION DATA
// ============================================================================

/**
 * Get rotation status for a specific boss
 * @param {string} bossName - Name of the boss
 * @param {boolean} useCache - Whether to use cached data (default true)
 * @returns {Promise<Object>} Rotation data or null
 */
async function getRotationStatus(bossName, useCache = true) {
  try {
    const normalizedName = state.ROTATING_BOSSES.find(
      b => b.toUpperCase() === bossName.toUpperCase()
    );

    if (!normalizedName) {
      return { isRotating: false, bossName };
    }

    // STEP 1: Use cache if available and fresh
    if (useCache && state.rotationCache[normalizedName] && (Date.now() - state.lastCacheRefresh < state.CACHE_REFRESH_INTERVAL)) {
      return { isRotating: true, ...state.rotationCache[normalizedName] };
    }

    // STEP 2: Try MongoDB (faster than Google Sheets)
    const mongoData = await getRotationFromMongoDB(normalizedName);
    if (mongoData) {
      state.rotationCache[normalizedName] = mongoData;
      console.log(`✅ [MongoDB] Fetched ${normalizedName} rotation: Index ${mongoData.currentIndex} (${mongoData.currentGuild})`);
      return mongoData;
    }

    // STEP 3: Fallback to Google Sheets
    console.log(`⚠️ [MongoDB] ${normalizedName} rotation not in MongoDB, fetching from Google Sheets...`);
    const result = await state.sheetAPI.call('getBossRotation', { bossName: normalizedName });

    if (result.status === 'ok' && result.isRotating) {
      const rotationData = {
        isRotating: result.isRotating,
        bossName: result.bossName,
        currentIndex: result.currentIndex,
        currentGuild: result.currentGuild,
        isOurTurn: result.isOurTurn,
        guilds: result.guilds,
        nextGuild: result.nextGuild
      };

      state.rotationCache[normalizedName] = rotationData;
      syncRotationToMongoDB(normalizedName, rotationData).catch(err =>
        console.error(`⚠️ Failed to sync ${normalizedName} rotation to MongoDB:`, err.message)
      );

      return rotationData;
    }

    return { isRotating: false, bossName: normalizedName };

  } catch (err) {
    console.error(`❌ Error getting rotation status for ${bossName}:`, err.message);
    return { isRotating: false, bossName, error: err.message };
  }
}

/**
 * Refresh rotation cache for all rotating bosses
 * Syncs Google Sheets → MongoDB → Cache
 */
async function refreshRotationCache() {
  try {
    console.log('🔄 Refreshing rotation cache from Google Sheets...');

    const oldBosses = Object.keys(state.rotationCache);

    // Fetch latest list of rotating bosses from sheet
    await fetchRotatingBosses();

    let syncedCount = 0;
    for (const boss of state.ROTATING_BOSSES) {
      const result = await state.sheetAPI.call('getBossRotation', { bossName: boss });

      if (result.status === 'ok' && result.isRotating) {
        const rotationData = {
          isRotating: result.isRotating,
          bossName: result.bossName,
          currentIndex: result.currentIndex,
          currentGuild: result.currentGuild,
          isOurTurn: result.isOurTurn,
          guilds: result.guilds,
          nextGuild: result.nextGuild
        };

        state.rotationCache[boss] = rotationData;
        await syncRotationToMongoDB(boss, rotationData, { silent: true });

        syncedCount++;
        console.log(`  ├─ ${boss}: Index ${rotationData.currentIndex} (${rotationData.currentGuild}) ${rotationData.isOurTurn ? '🟢 OUR TURN' : '🔴 NOT OUR TURN'}`);
      }
    }

    const newBosses = state.ROTATING_BOSSES.filter(boss => !oldBosses.includes(boss));

    for (const boss of newBosses) {
      console.log(`  ├─ ➕ New rotating boss detected: ${boss} (use /killed to schedule spawn timer)`);
    }

    const bossesToRemove = oldBosses.filter(boss => !state.ROTATING_BOSSES.includes(boss));
    let removedCount = 0;

    for (const boss of bossesToRemove) {
      delete state.rotationCache[boss];

      try {
        const db = await dbAPI.connect();
        const rotationCollection = db.collection(mongoHelpers.getCollectionName('bossRotation'));
        const bossId = boss.toLowerCase().replace(/\s+/g, '_');
        await rotationCollection.deleteOne({ _id: bossId });
        removedCount++;
        console.log(`  ├─ 🗑️  Removed ${boss} from rotation cache (no longer in sheet)`);
      } catch (err) {
        console.error(`  ├─ ⚠️  Failed to remove ${boss} from MongoDB:`, err.message);
      }

      if (state.bossTimerModule) {
        try {
          await state.bossTimerModule.cancelTimer(boss);
          console.log(`  ├─ ⏹️  Cancelled spawn timer for ${boss}`);
        } catch (err) {
          console.error(`  ├─ ⚠️  Failed to cancel timer for ${boss}:`, err.message);
        }
      }
    }

    state.lastCacheRefresh = Date.now();
    console.log(`✅ Rotation cache refreshed: ${syncedCount} bosses synced, ${newBosses.length} added, ${removedCount} removed & cancelled`);

  } catch (err) {
    console.error('❌ Error refreshing rotation cache:', err.message);
  }
}

/**
 * Sync rotation data to MongoDB
 */
async function syncRotationToMongoDB(bossName, rotationData, options = {}) {
  try {
    const db = await dbAPI.connect();
    const rotationCollection = db.collection(mongoHelpers.getCollectionName('bossRotation'));

    const doc = {
      _id: bossName.toLowerCase().replace(/\s+/g, '_'),
      bossName: bossName,
      currentIndex: rotationData.newIndex || rotationData.currentIndex || 1,
      currentGuild: rotationData.newGuild || rotationData.currentGuild || 'Unknown',
      isOurTurn: rotationData.isNowOurTurn !== undefined ? rotationData.isNowOurTurn : (rotationData.isOurTurn || false),
      guilds: rotationData.guilds || [],
      nextGuild: rotationData.nextGuild || 'Unknown',
      lastUpdated: new Date()
    };

    await rotationCollection.updateOne(
      { _id: doc._id },
      { $set: doc },
      { upsert: true }
    );

    if (!options.silent) {
      console.log(`✅ [MongoDB] Synced ${bossName} rotation to MongoDB: Index ${doc.currentIndex} (${doc.currentGuild})`);
    }
  } catch (error) {
    console.error(`⚠️ [MongoDB] Failed to sync ${bossName} rotation to MongoDB:`, error.message);
  }
}

/**
 * Get rotation data from MongoDB
 */
async function getRotationFromMongoDB(bossName) {
  try {
    const db = await dbAPI.connect();
    const rotationCollection = db.collection(mongoHelpers.getCollectionName('bossRotation'));

    const doc = await rotationCollection.findOne({
      _id: bossName.toLowerCase().replace(/\s+/g, '_')
    });

    if (!doc) return null;

    return {
      isRotating: true,
      bossName: doc.bossName,
      currentIndex: doc.currentIndex,
      currentGuild: doc.currentGuild,
      isOurTurn: doc.isOurTurn,
      guilds: doc.guilds || [],
      nextGuild: doc.nextGuild
    };

  } catch (error) {
    console.error(`⚠️ [MongoDB] Failed to get ${bossName} rotation from MongoDB:`, error.message);
    return null;
  }
}

// ============================================================================
// ROTATION MUTATION
// ============================================================================

/**
 * Increment rotation counter for a boss (called after boss is killed)
 */
async function incrementRotation(bossName) {
  try {
    const normalizedName = state.ROTATING_BOSSES.find(
      b => b.toUpperCase() === bossName.toUpperCase()
    );

    if (!normalizedName) {
      console.log(`ℹ️ ${bossName} is not a rotating boss, skipping rotation increment`);
      return { updated: false, bossName };
    }

    console.log(`🔄 [DUAL-WRITE] Incrementing rotation for ${normalizedName} (parallel Sheets + MongoDB)...`);
    const startTime = Date.now();

    const sheetResult = await (async () => {
      try {
        const result = await state.sheetAPI.call('incrementBossRotation', { bossName: normalizedName });
        if (result.status === 'ok') {
          console.log(`   ✅ [Sheets] Rotation incremented: ${result.oldIndex} → ${result.newIndex}`);
          return { success: true, source: 'Google Sheets', data: result };
        } else {
          return { success: false, source: 'Google Sheets', error: result.message };
        }
      } catch (error) {
        console.error(`   ❌ [Sheets] Failed to increment rotation:`, error.message);
        return { success: false, source: 'Google Sheets', error };
      }
    })();

    if (!sheetResult.success) {
      console.error(`❌ [DUAL-WRITE] Sheets write failed - cannot update MongoDB without new rotation data`);
      return { updated: false, bossName: normalizedName, error: sheetResult.error };
    }

    const result = sheetResult.data;

    const [mongoResult] = await Promise.all([
      (async () => {
        try {
          await syncRotationToMongoDB(normalizedName, result);
          console.log(`   ✅ [MongoDB] Rotation synced successfully`);
          return { success: true, source: 'MongoDB' };
        } catch (error) {
          console.error(`   ❌ [MongoDB] Failed to sync rotation:`, error.message);
          return { success: false, source: 'MongoDB', error };
        }
      })(),
      sendRotationUpdateNotification(result)
    ]);

    const duration = Date.now() - startTime;

    state.rotationCache[normalizedName] = {
      currentIndex: result.newIndex,
      currentGuild: result.newGuild,
      isOurTurn: result.isNowOurTurn
    };

    if (mongoResult.success) {
      console.log(`✅ [DUAL-WRITE] ${normalizedName} rotation: ${result.oldIndex} → ${result.newIndex} (Sheets + MongoDB) [${duration}ms]`);
    } else {
      console.warn(`⚠️ [DUAL-WRITE] ${normalizedName} rotation: ${result.oldIndex} → ${result.newIndex} (Sheets only - MongoDB failed) [${duration}ms]`);
    }

    return result;

  } catch (err) {
    console.error(`❌ Error incrementing rotation for ${bossName}:`, err.message);
    return { updated: false, bossName, error: err.message };
  }
}

/**
 * Manually set rotation index for a boss (admin override)
 */
async function setRotation(bossName, newIndex) {
  try {
    const normalizedName = state.ROTATING_BOSSES.find(
      b => b.toUpperCase() === bossName.toUpperCase()
    );

    if (!normalizedName) {
      return { success: false, message: `${bossName} is not a rotating boss` };
    }

    if (newIndex < 1) {
      return { success: false, message: 'Index must be >= 1' };
    }

    console.log(`⚙️ [DUAL-WRITE] Manually setting ${normalizedName} rotation to index ${newIndex} (parallel Sheets + MongoDB)...`);
    const startTime = Date.now();

    const sheetResult = await (async () => {
      try {
        const result = await state.sheetAPI.call('setBossRotation', { bossName: normalizedName, newIndex });
        if (result.status === 'ok') {
          console.log(`   ✅ [Sheets] Rotation set: ${result.oldIndex} → ${result.newIndex}`);
          return { success: true, source: 'Google Sheets', data: result };
        } else {
          return { success: false, source: 'Google Sheets', error: result.message };
        }
      } catch (error) {
        console.error(`   ❌ [Sheets] Failed to set rotation:`, error.message);
        return { success: false, source: 'Google Sheets', error };
      }
    })();

    if (!sheetResult.success) {
      console.error(`❌ [DUAL-WRITE] Sheets write failed - cannot update MongoDB without rotation data`);
      return { success: false, message: sheetResult.error };
    }

    const result = sheetResult.data;

    const mongoResult = await (async () => {
      try {
        await syncRotationToMongoDB(normalizedName, result);
        console.log(`   ✅ [MongoDB] Rotation synced successfully`);
        return { success: true, source: 'MongoDB' };
      } catch (error) {
        console.error(`   ❌ [MongoDB] Failed to sync rotation:`, error.message);
        return { success: false, source: 'MongoDB', error };
      }
    })();

    const duration = Date.now() - startTime;

    state.rotationCache[normalizedName] = {
      currentIndex: result.newIndex,
      currentGuild: result.currentGuild,
      isOurTurn: result.isOurTurn
    };

    if (mongoResult.success) {
      console.log(`✅ [DUAL-WRITE] ${normalizedName} rotation set: ${result.oldIndex} → ${result.newIndex} (Sheets + MongoDB) [${duration}ms]`);
    } else {
      console.warn(`⚠️ [DUAL-WRITE] ${normalizedName} rotation set: ${result.oldIndex} → ${result.newIndex} (Sheets only - MongoDB failed) [${duration}ms]`);
    }

    return { success: true, data: result };

  } catch (err) {
    console.error(`❌ Error setting rotation for ${bossName}:`, err.message);
    return { success: false, message: err.message };
  }
}

// ============================================================================
// NOTIFICATION SYSTEM
// ============================================================================

/**
 * Send notification to admin-logs when rotation changes
 */
async function sendRotationUpdateNotification(rotationData) {
  try {
    const adminLogsChannelId = state.config.admin_logs_channel_id;
    if (!adminLogsChannelId) return;

    const channel = await state.client.channels.fetch(adminLogsChannelId);
    if (!channel) return;

    const emoji = rotationData.isNowOurTurn ? '🟢' : '🔴';
    const status = rotationData.isNowOurTurn ? `${state.guildName}'S TURN` : `${rotationData.newGuild}'s turn`;

    const embed = new EmbedBuilder()
      .setColor(rotationData.isNowOurTurn ? 0x00ff00 : 0xff0000)
      .setTitle(`${emoji} Boss Rotation Updated`)
      .setDescription(`**${rotationData.bossName}** rotation advanced`)
      .addFields(
        { name: 'Previous', value: `Index ${rotationData.oldIndex} (${rotationData.oldGuild})`, inline: true },
        { name: 'Current', value: `Index ${rotationData.newIndex} (${rotationData.newGuild})`, inline: true },
        { name: 'Status', value: status, inline: false }
      )
      .setTimestamp();

    await channel.send({ embeds: [embed] });

  } catch (err) {
    console.error('❌ Error sending rotation update notification:', err.message);
  }
}

/**
 * Send 15-minute warning when it's our guild's rotation
 */
async function sendRotationWarning(bossName, predictedSpawnTime) {
  try {
    const rotation = await getRotationStatus(bossName);

    if (!rotation.isRotating || !rotation.isOurTurn) return;

    const tenchuCommandsChannelId = state.config.tenchu_commands_channel_id;
    if (!tenchuCommandsChannelId) return;

    const channel = await state.client.channels.fetch(tenchuCommandsChannelId);
    if (!channel) return;

    const spawnTimestamp = Math.floor(predictedSpawnTime.getTime() / 1000);

    const embed = new EmbedBuilder()
      .setColor(0x00ff00)
      .setTitle(`🟢 OUR ROTATION - ${bossName} Spawning Soon!`)
      .setDescription(`**${bossName}** is **${state.guildName}'s rotation**! Get ready!`)
      .addFields(
        { name: '⏰ Predicted Spawn Time', value: `<t:${spawnTimestamp}:F>`, inline: false },
        { name: '⏳ Spawning In', value: `<t:${spawnTimestamp}:R>`, inline: false },
        { name: '🎯 Rotation Status', value: `Guild ${rotation.currentIndex}/5 - **${state.guildName}**`, inline: false }
      )
      .setTimestamp();

    const bossImageURL = getBossImageAttachmentURL(bossName, channel.guild);
    if (bossImageURL) {
      embed.setThumbnail(bossImageURL);
    }

    addGuildFooter(embed, channel.guild, `${state.guildName} Rotation System`);

    const messagePayload = { content: '@everyone', embeds: [embed] };
    const bossImage = getBossImageAttachment(bossName);
    if (bossImage) {
      messagePayload.files = [bossImage];
    }

    const sentMessage = await channel.send(messagePayload);

    state.rotationWarningMessages[bossName] = {
      messageId: sentMessage.id,
      channelId: channel.id
    };

    console.log(`✅ Sent rotation warning for ${bossName} (our turn, spawning in ~15 mins)`);

  } catch (err) {
    console.error(`❌ Error sending rotation warning for ${bossName}:`, err.message);
  }
}

/**
 * Delete rotation warning message when thread closes (cleanup)
 */
async function deleteRotationWarning(bossName) {
  try {
    if (!isRotatingBoss(bossName)) return;

    const warningInfo = state.rotationWarningMessages[bossName];
    if (!warningInfo) return;

    try {
      const channel = await state.client.channels.fetch(warningInfo.channelId);
      if (channel) {
        const message = await channel.messages.fetch(warningInfo.messageId);
        if (message) {
          await message.delete();
          console.log(`🗑️ Deleted rotation warning for ${bossName} (thread closed)`);
        }
      }
    } catch (err) {
      console.log(`⚠️ Could not delete rotation warning for ${bossName}: ${err.message}`);
    }

    delete state.rotationWarningMessages[bossName];

  } catch (err) {
    console.error(`❌ Error deleting rotation warning for ${bossName}:`, err.message);
  }
}

// ============================================================================
// DAILY ROTATION SCHEDULE
// ============================================================================

/**
 * Clean up old daily schedules (both Discord messages and MongoDB documents)
 */
async function cleanupOldSchedules() {
  try {
    const db = await dbAPI.connect();
    const scheduleCollection = db.collection(mongoHelpers.getCollectionName('dailyRotationSchedule'));

    const now = new Date();
    const manilaTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Manila' }));
    const startOfToday = new Date(manilaTime);
    startOfToday.setHours(0, 0, 0, 0);
    const todayDate = startOfToday.toISOString().split('T')[0];

    const oldSchedules = await scheduleCollection.find({ _id: { $ne: todayDate } }).toArray();

    if (oldSchedules.length === 0) {
      console.log('🧹 No old daily schedules to clean up');
      return;
    }

    console.log(`🧹 Found ${oldSchedules.length} old daily schedule(s) to clean up`);

    let deletedMessages = 0;
    let deletedDocs = 0;

    for (const schedule of oldSchedules) {
      try {
        if (schedule.messageId && schedule.channelId) {
          try {
            const channel = await state.client.channels.fetch(schedule.channelId);
            if (channel) {
              const message = await channel.messages.fetch(schedule.messageId);
              if (message) {
                await message.delete();
                deletedMessages++;
                console.log(`   🗑️ Deleted old schedule message from ${schedule._id}`);
              }
            }
          } catch (discordErr) {
            console.log(`   ⚠️ Could not delete message for ${schedule._id}: ${discordErr.message}`);
          }
        }

        await scheduleCollection.deleteOne({ _id: schedule._id });
        deletedDocs++;

      } catch (scheduleErr) {
        console.error(`   ❌ Error cleaning up schedule ${schedule._id}:`, scheduleErr.message);
      }
    }

    console.log(`✅ Cleanup complete: ${deletedMessages} Discord messages deleted, ${deletedDocs} MongoDB documents removed`);

  } catch (err) {
    console.error('❌ Error in cleanupOldSchedules:', err.message);
  }
}

/**
 * Restore daily rotation schedule tracking from MongoDB on bot startup
 */
async function restoreDailyScheduleFromMongoDB() {
  try {
    const now = new Date();
    const manilaTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Manila' }));
    const startOfDay = new Date(manilaTime);
    startOfDay.setHours(0, 0, 0, 0);
    const todayDate = startOfDay.toISOString().split('T')[0];

    const db = await dbAPI.connect();
    const scheduleCollection = db.collection(mongoHelpers.getCollectionName('dailyRotationSchedule'));
    const existingSchedule = await scheduleCollection.findOne({ _id: todayDate });

    if (existingSchedule) {
      state.dailyScheduleMessage = {
        messageId: existingSchedule.messageId,
        channelId: existingSchedule.channelId,
        date: existingSchedule.date,
        bosses: existingSchedule.bosses || [],
        autoDeleteTimer: null
      };

      console.log(`✅ Restored daily schedule from MongoDB (${todayDate}, ${state.dailyScheduleMessage.bosses.length} bosses)`);

      const bosses = existingSchedule.bosses || [];
      const postedAt = existingSchedule.postedAt ? new Date(existingSchedule.postedAt) : null;

      // Case 1: All bosses completed → delete immediately
      if (bosses.length === 0) {
        console.log(`🔧 [CRASH-RECOVERY] All bosses completed - deleting schedule immediately`);
        await deleteDailySchedule();
        return;
      }

      // Case 2: "No rotations" posted more than 1 hour ago → delete immediately
      if (bosses.length === 0 && postedAt) {
        const hoursSincePosted = (Date.now() - postedAt.getTime()) / (1000 * 60 * 60);
        if (hoursSincePosted > 1) {
          console.log(`🔧 [CRASH-RECOVERY] No rotations schedule expired (${hoursSincePosted.toFixed(1)}h old) - deleting`);
          await deleteDailySchedule();
          return;
        } else {
          const remainingMs = (1 * 60 * 60 * 1000) - (Date.now() - postedAt.getTime());
          if (remainingMs > 0) {
            state.dailyScheduleMessage.autoDeleteTimer = setTimeout(async () => {
              try {
                await deleteDailySchedule();
                console.log('🗑️ Auto-deleted "no rotations" schedule after crash recovery');
              } catch (err) {
                console.error('❌ Failed to auto-delete schedule:', err.message);
              }
            }, remainingMs);
            console.log(`⏰ [CRASH-RECOVERY] Re-scheduled auto-delete timer (${Math.round(remainingMs / 60000)} minutes remaining)`);
          }
        }
      }

    } else {
      console.log(`ℹ️ No daily schedule found in MongoDB for ${todayDate}`);
      console.log(`🔧 [MISSED-CRON] Bot was down at midnight - posting today's schedule now`);

      postDailyRotationSchedule().catch(err =>
        console.error('❌ Failed to post missed daily schedule:', err.message)
      );
    }

  } catch (err) {
    console.error('❌ Error restoring daily schedule from MongoDB:', err.message);
  }
}

/**
 * Post daily rotation schedule at 12:00 AM Manila time
 */
async function postDailyRotationSchedule() {
  try {
    if (!state.bossTimerModule) {
      console.warn('⚠️ Boss timer module not available - cannot generate daily schedule');
      return;
    }

    const tenchuCommandsChannelId = state.config.tenchu_commands_channel_id;
    if (!tenchuCommandsChannelId) {
      console.warn('⚠️ Guild commands channel not configured - cannot post daily schedule');
      return;
    }

    const channel = await state.client.channels.fetch(tenchuCommandsChannelId);
    if (!channel) {
      console.warn('⚠️ Guild commands channel not found');
      return;
    }

    const now = new Date();
    const manilaTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Manila' }));

    const startOfDay = new Date(manilaTime);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(manilaTime);
    endOfDay.setHours(23, 59, 59, 999);

    const todayDate = startOfDay.toISOString().split('T')[0];

    console.log(`📅 [DAILY-SCHEDULE] Checking rotations from ${startOfDay.toISOString()} to ${endOfDay.toISOString()}`);

    const db = await dbAPI.connect();
    const scheduleCollection = db.collection(mongoHelpers.getCollectionName('dailyRotationSchedule'));

    const existingSchedule = await scheduleCollection.findOne({ _id: todayDate });
    if (existingSchedule) {
      console.log(`⚠️ Daily schedule already posted for ${todayDate} - skipping to prevent duplicates`);

      if (!state.dailyScheduleMessage) {
        state.dailyScheduleMessage = {
          messageId: existingSchedule.messageId,
          channelId: existingSchedule.channelId,
          date: existingSchedule.date,
          bosses: existingSchedule.bosses || [],
          autoDeleteTimer: null
        };
        console.log(`✅ Restored daily schedule tracking from MongoDB`);
      }
      return;
    }

    const guildRotations = [];

    if (state.ROTATING_BOSSES.length === 0) {
      console.log('📅 [DAILY-SCHEDULE] No rotating bosses configured - rotation reminders disabled');
      return null;
    }

    for (const bossName of state.ROTATING_BOSSES) {
      try {
        const rotation = await getRotationStatus(bossName);

        if (!rotation.isRotating || !rotation.isOurTurn) {
          console.log(`📅 [DAILY-SCHEDULE] ${bossName}: Not our turn (${rotation.currentGuild})`);
          continue;
        }

        console.log(`📅 [DAILY-SCHEDULE] ${bossName}: ${state.guildName}'s turn - checking spawn time...`);

        let spawnTime = null;
        let timerData = null;

        if (state.bossTimerModule) {
          timerData = state.bossTimerModule.getNextSpawn(bossName);
          if (timerData && timerData.nextSpawn) {
            spawnTime = timerData.nextSpawn;
          }
        }

        if (!spawnTime && state.bossSpawnConfig && state.bossSpawnConfig.timerBasedBosses[bossName]) {
          try {
            const lastSpawn = await mongoHelpers.getLastBossSpawn(bossName);
            if (lastSpawn && lastSpawn.timestamp) {
              const bossConfig = state.bossSpawnConfig.timerBasedBosses[bossName];
              const intervalMs = bossConfig.spawnIntervalHours * 60 * 60 * 1000;
              const lastSpawnDate = new Date(lastSpawn.timestamp);

              spawnTime = new Date(lastSpawnDate.getTime() + intervalMs);
              while (spawnTime < now) {
                spawnTime = new Date(spawnTime.getTime() + intervalMs);
              }

              timerData = {
                nextSpawn: spawnTime,
                confidence: 75,
                source: 'attendance'
              };

              console.log(`📋 [DAILY-SCHEDULE] Calculated ${bossName} spawn from attendance: ${spawnTime.toISOString()}`);
            }
          } catch (attendanceError) {
            console.error(`⚠️ [DAILY-SCHEDULE] Failed to calculate ${bossName} spawn from attendance:`, attendanceError.message);
          }
        }

        if (!spawnTime) {
          console.log(`📅 [DAILY-SCHEDULE] ${bossName}: No spawn time available - skipping`);
          continue;
        }

        if (spawnTime <= endOfDay) {
          const spawnDate = new Date(spawnTime);
          const spawnDateManila = new Date(spawnDate.toLocaleString('en-US', { timeZone: 'Asia/Manila' }));
          const spawnDayStart = new Date(spawnDateManila);
          spawnDayStart.setHours(0, 0, 0, 0);

          if (spawnDayStart.getTime() === startOfDay.getTime()) {
            console.log(`📅 [DAILY-SCHEDULE] ${bossName}: ✅ INCLUDED in daily schedule`);
            guildRotations.push({
              bossName,
              spawnTime,
              rotation,
              timerData,
              isPast: spawnTime < now
            });
          } else {
            console.log(`📅 [DAILY-SCHEDULE] ${bossName}: ❌ EXCLUDED - spawn is from a different day`);
          }
        } else {
          console.log(`📅 [DAILY-SCHEDULE] ${bossName}: ❌ EXCLUDED - spawn is after end of day`);
        }

      } catch (bossError) {
        console.error(`❌ Error checking rotation for ${bossName}:`, bossError.message);
      }
    }

    guildRotations.sort((a, b) => a.spawnTime - b.spawnTime);

    console.log(`📊 Found ${guildRotations.length} ${state.guildName} rotations today`);

    if (state.dailyScheduleMessage) {
      await deleteDailySchedule();
    }

    // Case 1: No guild rotations today
    if (guildRotations.length === 0) {
      const embed = new EmbedBuilder()
        .setColor(0x808080)
        .setTitle(`📅 Daily Boss Rotation - ${state.guildName}`)
        .setDescription(`**No ${state.guildName} rotations scheduled for today.**\n\nRotation reminders are disabled. 🌴`)
        .setTimestamp();

      addGuildFooter(embed, channel.guild, `${state.guildName} Daily Schedule`);

      const sentMessage = await channel.send({ embeds: [embed] });

      const autoDeleteTimer = setTimeout(async () => {
        try {
          const msg = await channel.messages.fetch(sentMessage.id);
          if (msg) {
            await msg.delete();
            console.log('🗑️ Auto-deleted "no rotations" daily schedule (1 hour expired)');
          }
        } catch (err) {
          console.error('❌ Failed to auto-delete daily schedule:', err.message);
        }
        state.dailyScheduleMessage = null;
      }, 60 * 60 * 1000);

      state.dailyScheduleMessage = {
        messageId: sentMessage.id,
        channelId: channel.id,
        date: todayDate,
        bosses: [],
        autoDeleteTimer
      };

      await scheduleCollection.updateOne(
        { _id: todayDate },
        {
          $set: {
            messageId: sentMessage.id,
            channelId: channel.id,
            date: todayDate,
            bosses: [],
            postedAt: new Date()
          }
        },
        { upsert: true }
      );

      console.log('✅ Posted "no rotations" daily schedule (will auto-delete in 1 hour)');
      return;
    }

    // Case 2: Guild has rotations today
    const timeGroups = {
      'Night (12am - 6am)': [],
      'Morning (6am - 12pm)': [],
      'Afternoon (12pm - 6pm)': [],
      'Evening (6pm - 12am)': []
    };

    for (const rotation of guildRotations) {
      const spawnTimeManila = new Date(rotation.spawnTime.toLocaleString('en-US', { timeZone: 'Asia/Manila' }));
      const hour = spawnTimeManila.getHours();

      if (hour >= 0 && hour < 6) {
        timeGroups['Night (12am - 6am)'].push(rotation);
      } else if (hour >= 6 && hour < 12) {
        timeGroups['Morning (6am - 12pm)'].push(rotation);
      } else if (hour >= 12 && hour < 18) {
        timeGroups['Afternoon (12pm - 6pm)'].push(rotation);
      } else {
        timeGroups['Evening (6pm - 12am)'].push(rotation);
      }
    }

    const embed = new EmbedBuilder()
      .setColor(0x00ff00)
      .setTitle(`🟢 Daily Boss Rotation - ${state.guildName}`)
      .setDescription(`**${guildRotations.length} boss${guildRotations.length > 1 ? 'es' : ''} rotating today!** Get ready!\n\u200B`);

    for (const [timeLabel, bosses] of Object.entries(timeGroups)) {
      if (bosses.length === 0) continue;

      let fieldValue = '';
      for (const { bossName, spawnTime, rotation, timerData, isPast } of bosses) {
        const spawnTimestamp = Math.floor(spawnTime.getTime() / 1000);
        const guildCount = (rotation.guilds && rotation.guilds.length > 0) ? rotation.guilds.length : 5;

        fieldValue += `**${bossName}**${isPast ? ' 🔴' : ''}\n`;
        fieldValue += `├ 🕐 <t:${spawnTimestamp}:t> (<t:${spawnTimestamp}:R>) ${isPast ? '**[LIVE NOW]**' : ''}\n`;
        fieldValue += `└ 🎯 Guild ${rotation.currentIndex}/${guildCount} - **${state.guildName}**\n\n`;
      }

      embed.addFields({ name: `⏰ ${timeLabel}`, value: fieldValue.trim(), inline: false });
    }

    embed.addFields({
      name: '\u200B',
      value: `**Total Rotations:** ${guildRotations.length}\n**Stay alert and check #tenchu-commands for 15-min warnings!**`,
      inline: false
    });

    const serverIcon = channel.guild.iconURL({ dynamic: true, size: 256 });
    if (serverIcon) {
      embed.setThumbnail(serverIcon);
    }

    addGuildFooter(embed, channel.guild, `${state.guildName} Daily Schedule`);
    embed.setTimestamp();

    const messagePayload = { embeds: [embed] };
    const sentMessage = await channel.send(messagePayload);

    state.dailyScheduleMessage = {
      messageId: sentMessage.id,
      channelId: channel.id,
      date: todayDate,
      bosses: guildRotations.map(r => r.bossName),
      autoDeleteTimer: null
    };

    await scheduleCollection.updateOne(
      { _id: todayDate },
      {
        $set: {
          messageId: sentMessage.id,
          channelId: channel.id,
          date: todayDate,
          bosses: guildRotations.map(r => r.bossName),
          postedAt: new Date()
        }
      },
      { upsert: true }
    );

    console.log(`✅ Posted daily rotation schedule: ${guildRotations.length} ${state.guildName} rotations`);

  } catch (err) {
    console.error('❌ Error posting daily rotation schedule:', err.message);
  }
}

/**
 * Delete daily rotation schedule message
 */
async function deleteDailySchedule() {
  try {
    if (!state.dailyScheduleMessage) return;

    const scheduleDate = state.dailyScheduleMessage.date;

    if (state.dailyScheduleMessage.autoDeleteTimer) {
      clearTimeout(state.dailyScheduleMessage.autoDeleteTimer);
    }

    try {
      const channel = await state.client.channels.fetch(state.dailyScheduleMessage.channelId);
      if (channel) {
        const message = await channel.messages.fetch(state.dailyScheduleMessage.messageId);
        if (message) {
          await message.delete();
          console.log('🗑️ Deleted daily rotation schedule (attendance thread closed)');
        }
      }
    } catch (err) {
      console.log(`⚠️ Could not delete daily schedule message: ${err.message}`);
    }

    try {
      const db = await dbAPI.connect();
      const scheduleCollection = db.collection(mongoHelpers.getCollectionName('dailyRotationSchedule'));
      await scheduleCollection.deleteOne({ _id: scheduleDate });
      console.log(`🗑️ Removed daily schedule from MongoDB (${scheduleDate})`);
    } catch (err) {
      console.error(`⚠️ Failed to remove daily schedule from MongoDB: ${err.message}`);
    }

    state.dailyScheduleMessage = null;

  } catch (err) {
    console.error('❌ Error deleting daily schedule:', err.message);
  }
}

/**
 * Check if a boss is the last one in today's daily schedule
 */
async function checkAndDeleteDailySchedule(bossName) {
  try {
    if (!state.dailyScheduleMessage) return;
    if (!state.dailyScheduleMessage.bosses.includes(bossName)) return;

    const updatedBosses = state.dailyScheduleMessage.bosses.filter(b => b !== bossName);
    state.dailyScheduleMessage.bosses = updatedBosses;

    console.log(`📋 Boss ${bossName} completed. Remaining in daily schedule: ${updatedBosses.length}`);

    try {
      const db = await dbAPI.connect();
      const scheduleCollection = db.collection(mongoHelpers.getCollectionName('dailyRotationSchedule'));
      await scheduleCollection.updateOne(
        { _id: state.dailyScheduleMessage.date },
        { $set: { bosses: updatedBosses } }
      );
    } catch (err) {
      console.error(`⚠️ Failed to update daily schedule in MongoDB: ${err.message}`);
    }

    if (updatedBosses.length === 0) {
      console.log('🎯 Last boss of the day completed - deleting daily schedule');
      await deleteDailySchedule();
    }

  } catch (err) {
    console.error('❌ Error checking daily schedule:', err.message);
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Check if a boss is in the rotating system
 */
function isRotatingBoss(bossName) {
  return state.ROTATING_BOSSES.some(b => b.toUpperCase() === bossName.toUpperCase());
}

/**
 * Get list of all rotating bosses
 */
function getRotatingBosses() {
  return [...state.ROTATING_BOSSES];
}

/**
 * Get rotation status for all rotating bosses
 */
async function getAllRotations() {
  const rotations = {};

  for (const boss of state.ROTATING_BOSSES) {
    const rotation = await getRotationStatus(boss);
    if (rotation.isRotating) {
      rotations[boss] = rotation;
    }
  }

  return rotations;
}

/**
 * Handle boss kill - increment rotation index only
 */
async function handleBossKill(bossName, killTimestamp = null) {
  try {
    if (!isRotatingBoss(bossName)) return;

    console.log(`🔄 Boss killed: ${bossName} (rotating boss - incrementing rotation index)`);

    const result = await incrementRotation(bossName);

    if (result.updated !== false) {
      console.log(`✅ Rotation updated: ${bossName} ${result.oldIndex} → ${result.newIndex} (${result.newGuild})`);
      console.log(`ℹ️  Use /killed ${bossName} to schedule next spawn time`);
    }

  } catch (err) {
    console.error(`❌ Error handling boss kill for rotation: ${bossName}`, err.message);
  }
}

module.exports = {
  getRotationStatus,
  refreshRotationCache,
  incrementRotation,
  setRotation,
  sendRotationWarning,
  deleteRotationWarning,
  postDailyRotationSchedule,
  deleteDailySchedule,
  restoreDailyScheduleFromMongoDB,
  cleanupOldSchedules,
  checkAndDeleteDailySchedule,
  handleBossKill,
  isRotatingBoss,
  getRotatingBosses,
  getAllRotations
};
