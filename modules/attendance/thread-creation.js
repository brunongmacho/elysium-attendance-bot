/**
 * Thread creation and management for boss spawns.
 */

const { EmbedBuilder } = require("discord.js");
const { normalizeTimestamp } = require('../../utils/common');
const { getBossImageAttachment, getBossImageAttachmentURL } = require('../../utils/boss-images');
const { addGuildFooter } = require('../../utils/embed-branding');
const { checkColumnExists } = require('./sheets');
const state = require('./state');

// ═══════════════════════════════════════════════════════════════════════════════
// THREAD CREATION AND MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Creates attendance and confirmation threads for a new boss spawn.
 *
 * This is the main entry point for the attendance workflow. It performs the following:
 * 1. Validates the spawn doesn't already exist (prevents duplicates)
 * 2. Creates two threads: attendance thread (public) and confirmation thread (admin)
 * 3. Registers spawn in stateManager.activeSpawns and stateManager.activeColumns for tracking
 * 4. Posts embedded instructions to attendance thread with @everyone ping
 * 5. Posts notification to admin confirmation thread
 *
 * @param {Client} client - Discord.js client instance
 * @param {string} bossName - Normalized boss name (e.g., "VALAKAS", "ANT_QUEEN")
 * @param {string} dateStr - Date string in "MM/DD/YY" format
 * @param {string} timeStr - Time string in "HH:MM" format (24-hour)
 * @param {string} fullTimestamp - Full timestamp in "MM/DD/YY HH:MM" format
 * @param {string} triggerSource - Source that triggered spawn (e.g., "manual", "auto", "bid_auction")
 * @param {boolean} noAutoClose - If true, thread won't auto-close (for maintenance mode)
 * @param {boolean} skipColumnCheck - If true, skips duplicate column check (for maintenance - always new)
 * @returns {Promise<Object>} Result object with success status and threadId
 */
async function createSpawnThreads(
  client,
  bossName,
  dateStr,
  timeStr,
  fullTimestamp,
  triggerSource,
  noAutoClose = false,
  skipColumnCheck = false
) {
  // Validate boss exists in bossPoints
  if (!state.bossPoints[bossName]) {
    console.error(`❌ Unknown boss: ${bossName}`);
    return { success: false, error: `Unknown boss: ${bossName}` };
  }

  // MUTEX: Prevent concurrent thread creation for the same boss
  const creationKey = `${bossName.toUpperCase()}|${normalizeTimestamp(fullTimestamp)}`;
  const MUTEX_TIMEOUT_MS = 60000; // 60 second safety timeout
  if (state.pendingCreations.has(creationKey)) {
    const existingCreation = state.pendingCreations.get(creationKey);
    const waitTime = Date.now() - existingCreation.startedAt;

    // Safety: Clear stale mutex if it's been held too long (indicates a bug/crash)
    if (waitTime > MUTEX_TIMEOUT_MS) {
      console.log(`⚠️ STALE MUTEX: ${bossName} mutex held for ${waitTime}ms - clearing and proceeding`);
      state.pendingCreations.delete(creationKey);
      state.creationPromises.delete(creationKey);
    } else {
      // Another creation is in progress - wait for it to complete and return its result
      console.log(`⏳ CONCURRENT CREATION DETECTED: ${bossName} at ${fullTimestamp} - waiting for existing creation by ${existingCreation.source} (${waitTime}ms ago)`);
      try {
        const existingResult = await state.creationPromises.get(creationKey);
        if (existingResult && existingResult.success) {
          console.log(`✅ Returning existing thread from concurrent creation: ${existingResult.threadId}`);
          return existingResult;
        } else {
          console.log(`⚠️ Existing creation failed, proceeding with new attempt`);
          state.pendingCreations.delete(creationKey);
          state.creationPromises.delete(creationKey);
        }
      } catch (waitErr) {
        console.log(`⚠️ Error waiting for existing creation: ${waitErr.message}`);
        state.pendingCreations.delete(creationKey);
        state.creationPromises.delete(creationKey);
      }
    }
  }

  // Set the mutex lock immediately before any async operations
  state.pendingCreations.set(creationKey, { startedAt: Date.now(), source: triggerSource });
  console.log(`🔒 MUTEX SET: Starting thread creation for ${bossName} at ${fullTimestamp} (source: ${triggerSource})`);

  // Create a promise for this creation so concurrent callers can wait
  const creationPromise = (async () => {
    try {
      // Fetch required guild and channels
      const mainGuild = await client.guilds
        .fetch(state.config.main_guild_id)
        .catch(() => null);
      if (!mainGuild) return { success: false, error: 'Failed to fetch guild' };

      // Batch fetch channels in parallel for faster execution
      const [attChannel, adminLogs] = await Promise.all([
        mainGuild.channels.fetch(state.config.attendance_channel_id).catch(() => null),
        mainGuild.channels.fetch(state.config.admin_logs_channel_id).catch(() => null),
      ]);

      if (!attChannel || !adminLogs) return { success: false, error: 'Failed to fetch channels' };

      // Prevent duplicate spawns by checking if column already exists (skip for maintenance - always new)
      if (!skipColumnCheck) {
        const columnExists = await checkColumnExists(bossName, fullTimestamp);
        if (columnExists) {
          await adminLogs.send(
            `⚠️ **BLOCKED SPAWN:** ${bossName} at ${fullTimestamp}\nColumn already exists.`
          );
          return { success: false, error: 'Column already exists (duplicate spawn)' };
        }
      }

      // NEW: Prevent duplicate threads for same boss if spawn times are close
      const DUPLICATE_TIME_THRESHOLD_MINUTES = 30; // Block if spawn times within 30 min
      for (const [threadId, spawn] of Object.entries(state.stateManager.activeSpawns)) {
        if (spawn.boss.toLowerCase() === bossName.toLowerCase() && !spawn.closed) {
          const existingTimestamp = spawn.timestamp;
          const newTimestamp = fullTimestamp;

          // Simple comparison: if timestamps are identical or very close, block
          if (existingTimestamp === newTimestamp) {
            console.log(`⚠️ BLOCKED DUPLICATE: ${bossName} - identical timestamp ${newTimestamp}`);
            await adminLogs.send(
              `⚠️ **BLOCKED DUPLICATE:** ${bossName} at ${fullTimestamp}\n` +
              `Thread already exists: <#${threadId}> (same timestamp)`
            );
            return { success: false, error: `Thread for ${bossName} at ${newTimestamp} already exists` };
          }

          // Parse timestamps to compare time difference
          try {
            const parseTimestamp = (ts) => {
              const [datePart, timePart] = ts.split(' ');
              const [month, day, year] = datePart.split('/').map(Number);
              const [hours, minutes] = timePart.split(':').map(Number);
              const fullYear = year < 100 ? 2000 + year : year;
              return new Date(fullYear, month - 1, day, hours, minutes);
            };

            const existingTime = parseTimestamp(existingTimestamp);
            const newTime = parseTimestamp(newTimestamp);
            const timeDiffMinutes = Math.abs(newTime - existingTime) / (1000 * 60);

            if (timeDiffMinutes < DUPLICATE_TIME_THRESHOLD_MINUTES) {
              console.log(`⚠️ BLOCKED DUPLICATE: ${bossName} - times too close (${timeDiffMinutes.toFixed(0)} min apart)`);
              await adminLogs.send(
                `⚠️ **BLOCKED DUPLICATE:** ${bossName} at ${fullTimestamp}\n` +
                `Thread already exists: <#${threadId}> at ${existingTimestamp} (${timeDiffMinutes.toFixed(0)} min apart)`
              );
              return { success: false, error: `Thread for ${bossName} already exists (${timeDiffMinutes.toFixed(0)} min apart)` };
            } else {
              console.log(`✅ Allowing new ${bossName} thread - existing at ${existingTimestamp}, new at ${newTimestamp} (${timeDiffMinutes.toFixed(0)} min apart)`);
            }
          } catch (parseError) {
            const hoursSinceCreated = (Date.now() - spawn.createdAt) / (1000 * 60 * 60);
            if (hoursSinceCreated < 1) {
              console.log(`⚠️ BLOCKED DUPLICATE: ${bossName} - created ${hoursSinceCreated.toFixed(1)}h ago (timestamp parse failed)`);
              return { success: false, error: `Thread for ${bossName} already exists` };
            }
          }
        }
      }

      const threadTitle = `[${dateStr} ${timeStr}] ${bossName}`;

      // Create both threads in parallel for efficiency
      const [attThread, confirmThread] = await Promise.all([
        attChannel.threads.create({
          name: threadTitle,
          autoArchiveDuration: state.config.auto_archive_minutes,
          reason: `Boss spawn: ${bossName}`,
        }),
        adminLogs.threads.create({
          name: `✅ ${threadTitle}`,
          autoArchiveDuration: state.config.auto_archive_minutes,
          reason: `Confirmation: ${bossName}`,
        }),
      ]);

      if (!attThread) return { success: false, error: 'Failed to create attendance thread' };

      // Register spawn in state tracking
      state.stateManager.activeSpawns[attThread.id] = {
        boss: bossName,
        date: dateStr,
        time: timeStr,
        timestamp: fullTimestamp,
        members: [],
        memberIds: {},
        confirmThreadId: confirmThread ? confirmThread.id : null,
        closed: false,
        createdAt: Date.now(),
        noAutoClose: noAutoClose,
      };

      // Register in stateManager.activeColumns for duplicate prevention (use normalized key for O(1) lookup)
      const normalizedKey = `${bossName.toUpperCase()}|${normalizeTimestamp(fullTimestamp)}`;
      state.stateManager.activeColumns[normalizedKey] = attThread.id;

      // Calculate auto-close timestamp using TIMING constant
      const autoCloseTime = Date.now() + (state.TIMING.THREAD_AUTO_CLOSE_MINUTES * 60 * 1000);
      const autoCloseTimestamp = Math.floor(autoCloseTime / 1000);

      // Create description based on autoclose setting
      const descriptionText = noAutoClose
        ? `Boss detected! Please check in below.\n\n🔓 **No auto-close** (maintenance spawn - close manually when done)`
        : `Boss detected! Please check in below.\n\n⏰ **Auto-closes <t:${autoCloseTimestamp}:R>** to prevent cheating.`;

      // Create and send attendance instructions embed
      const embed = new EmbedBuilder()
        .setColor(noAutoClose ? 0x9b59b6 : 0xffd700)
        .setTitle(`🎯 ${bossName}`)
        .setDescription(descriptionText)
        .addFields(
          {
            name: "📸 How to Check In",
            value:
              "1. Post `present` or `here`\n2. Attach screenshot (admins exempt)\n3. Wait for admin ✅",
          },
          {
            name: "📊 Points",
            value: `${state.bossPoints?.[bossName]?.points ?? 'N/A'} points`,
            inline: true,
          },
          { name: "🕐 Time", value: timeStr, inline: true },
          { name: "📅 Date", value: dateStr, inline: true },
          {
            name: "⏱️ Attendance Window",
            value: noAutoClose ? "No limit (maintenance)" : `${state.TIMING.THREAD_AUTO_CLOSE_MINUTES} minutes (then auto-closes)`,
            inline: false,
          }
        )
        .setFooter({ text: 'Admins: type "close" to finalize early' })
        .setTimestamp();

      // Add boss image if available
      const bossImage = getBossImageAttachment(bossName);
      const bossImageURL = getBossImageAttachmentURL(bossName, mainGuild);
      if (bossImageURL) {
        embed.setThumbnail(bossImageURL);
      }

      // Add guild branding to footer (preserving existing footer text)
      addGuildFooter(embed, mainGuild, 'Admins: type "close" to finalize early');

      // Prepare message payload with boss image attachment
      const messagePayload = { content: "@everyone", embeds: [embed] };
      if (bossImage) {
        messagePayload.files = [bossImage];
      }

      // Batch send notifications in parallel for faster execution
      const notifications = [
        attThread.send(messagePayload),
      ];

      if (confirmThread) {
        const confirmEmbed = new EmbedBuilder()
          .setColor(0xf1c40f)
          .setTitle('🟨 Boss Spawn Detected')
          .setDescription(`**${bossName}**\n${fullTimestamp}`)
          .setTimestamp();

        if (bossImageURL) {
          confirmEmbed.setThumbnail(bossImageURL);
        }

        const confirmPayload = { embeds: [confirmEmbed] };
        if (bossImage) {
          confirmPayload.files = [bossImage];
        }

        notifications.push(confirmThread.send(confirmPayload));
      }

      await Promise.all(notifications);

      // 🧠 AUTO-UPDATE LEARNING SYSTEM (Bot learns from actual spawn time)
      try {
        if (state.intelligenceEngine && state.intelligenceEngine.learningSystem) {
          const actualSpawnTime = new Date().toISOString();

          const updated = await state.intelligenceEngine.learningSystem.updatePredictionAccuracy(
            'spawn_prediction',
            bossName,
            actualSpawnTime
          );

          if (updated) {
            console.log(`🧠 [LEARNING] Auto-updated spawn prediction accuracy for "${bossName}" (actual: ${actualSpawnTime})`);
          } else {
            console.log(`[LEARNING] No pending spawn prediction found for "${bossName}" (may not have been predicted)`);
          }
        }
      } catch (learningErr) {
        console.log(`[LEARNING] Error updating spawn prediction: ${learningErr.message}`);
      }

      return { success: true, threadId: attThread.id };
    } catch (error) {
      console.error(`❌ Thread creation failed for ${bossName}:`, error.message);
      return { success: false, error: error.message };
    } finally {
      state.pendingCreations.delete(creationKey);
      console.log(`🔓 MUTEX CLEARED: Finished thread creation for ${bossName} at ${fullTimestamp}`);
    }
  })();

  // Store the promise so concurrent callers can wait for it
  state.creationPromises.set(creationKey, creationPromise);

  // Return the promise result
  return await creationPromise;
}

module.exports = { createSpawnThreads };
