/**
 * =========================================================================
 * INTERACTION HANDLER - Slash commands, autocomplete, and button interactions
 * =========================================================================
 *
 * Manages all Discord interaction types:
 * - Slash commands (delegates to handleSlashCommand)
 * - Autocomplete (delegates to handleAutocomplete)
 * - Attendance verification buttons (verify_approve_* / verify_deny_*)
 * - Spawn closure buttons (close_confirm_* / close_cancel_*)
 *
 * @module interaction-handler
 */

const { Events, EmbedBuilder } = require("discord.js");
const { createLogger } = require('../utils/logger');
const logger = createLogger('interaction-handler');

/**
 * Creates the InteractionCreate event handler
 * @param {Client} client - Discord Client
 * @param {Object} config - Bot configuration
 * @param {Object} deps - Module dependencies
 * @param {Object} deps.stateManager - Global state manager
 * @param {Object} deps.attendance - Attendance tracking module
 * @param {Object} deps.bossPoints - Boss point values
 * @param {Object} deps.bossRotation - Boss rotation system
 * @param {Object} deps.errorHandler - Centralized error handling
 * @param {Function} deps.normalizeUsername - Username normalization function
 * @param {Function} deps.normalizeTimestamp - Timestamp normalization function
 * @param {Function} deps.isAdmin - Admin check function (member) => boolean
 * @param {Function} deps.handleSlashCommand - Slash command handler
 * @param {Function} deps.handleAutocomplete - Autocomplete handler
 * @param {Function} deps.createDisabledRow - Button disabling utility
 * @param {Object} [deps.bossTimer] - Boss timer module (for slash commands)
 * @param {Object} [deps.bossTimerCommands] - Boss timer commands (for slash commands)
 * @param {Object} [deps.bidding] - Bidding module (for slash commands)
 * @param {Object} [deps.auctioneering] - Auctioneering module (for slash commands)
 * @returns {Function} The interaction handler async function
 */
function createInteractionHandler(client, config, deps) {
  const {
    stateManager,
    attendance,
    bossPoints,
    bossRotation,
    errorHandler,
    normalizeUsername,
    normalizeTimestamp,
    isAdmin,
    handleSlashCommand,
    handleAutocomplete,
    createDisabledRow,
    bossTimer,
    bossTimerCommands,
    bidding,
    auctioneering,
    sheetAPI,
  } = deps;

  return async (interaction) => {
    try {
      // ───────────────────────────────────────────────────────────────
      // SLASH COMMAND HANDLING
      // ───────────────────────────────────────────────────────────────
      if (interaction.isChatInputCommand()) {
        const modules = {
          attendance,
          bossTimer,
          bossTimerCommands,
          bossRotation,
          bidding,
          auctioneering,
          sheetAPI,
        };

        await handleSlashCommand(interaction, modules, config, client);
        return;
      }

      // ───────────────────────────────────────────────────────────────
      // AUTOCOMPLETE HANDLING
      // ───────────────────────────────────────────────────────────────
      if (interaction.isAutocomplete()) {
        await handleAutocomplete(interaction, attendance, bossRotation);
        return;
      }

      // ───────────────────────────────────────────────────────────────
      // BUTTON INTERACTION HANDLING
      // ───────────────────────────────────────────────────────────────
      if (!interaction.isButton()) return;
      if (!interaction.message.guild) return;
      if (interaction.message.guild.id !== config.main_guild_id) return;

      const customId = interaction.customId;
      const user = interaction.user;
      const msg = interaction.message;
      const guild = interaction.guild;

      // Sync state from attendance module
      stateManager.activeSpawns = attendance.getActiveSpawns();
      stateManager.pendingVerifications = attendance.getPendingVerifications();
      stateManager.pendingClosures = attendance.getPendingClosures();

      // ── Attendance verification buttons ──────────────────────────
      if (customId.startsWith('verify_')) {
        // Check if admin
        const adminMember = await guild.members.fetch(user.id).catch(() => null);
        if (!adminMember || !isAdmin(adminMember)) {
          await interaction.reply({ content: '⚠️ Only admins can verify attendance.', ephemeral: true });
          return;
        }

        // Re-sync state immediately before processing (prevent race conditions)
        stateManager.activeSpawns = attendance.getActiveSpawns();
        stateManager.pendingVerifications = attendance.getPendingVerifications();

        // Find the pending verification
        let pendingMsgId = null;
        let pending = null;
        for (const [msgId, verification] of Object.entries(stateManager.pendingVerifications)) {
          if (verification.verificationMsgId === msg.id) {
            pendingMsgId = msgId;
            pending = verification;
            break;
          }
        }

        if (!pending) {
          await interaction.reply({ content: '⚠️ Verification already processed or expired.', ephemeral: true });
          return;
        }

        const spawnInfo = stateManager.activeSpawns[pending.threadId];

        if (!spawnInfo || spawnInfo.closed) {
          await interaction.update({ content: "⚠️ This spawn is closed.", components: [] });
          delete stateManager.pendingVerifications[pendingMsgId];
          attendance.setPendingVerifications(stateManager.pendingVerifications);
          return;
        }

        const isApprove = customId.startsWith('verify_approve_');

        // Disable buttons
        const btn1 = interaction.message.components[0].components[0];
        const btn2 = interaction.message.components[0].components[1];
        const disabledRow = createDisabledRow(btn1, btn2);

        if (isApprove) {
          const isDuplicate = spawnInfo.members.some(
            (m) => normalizeUsername(m) === normalizeUsername(pending.author)
          );

          if (isDuplicate) {
            await interaction.update({
              embeds: [EmbedBuilder.from(msg.embeds[0]).setColor(0xff0000).setFooter({ text: 'Already verified' })],
              components: [disabledRow]
            });
            await interaction.followUp({ content: `⚠️ **${pending.author}** already verified.`, ephemeral: false });
            delete stateManager.pendingVerifications[pendingMsgId];
            attendance.setPendingVerifications(stateManager.pendingVerifications);
            return;
          }

          spawnInfo.members.push(pending.author);
          // Store Discord ID for reliable MongoDB lookup
          if (!spawnInfo.memberIds) spawnInfo.memberIds = {};
          spawnInfo.memberIds[pending.author] = pending.authorId;
          attendance.setActiveSpawns(stateManager.activeSpawns);

          console.log(`✅ VERIFY: ${pending.author} added to ${spawnInfo.boss} (${spawnInfo.timestamp}) by ${user.username} | Total: ${spawnInfo.members.length} members`);
          console.log(`   📊 Current verified members: ${spawnInfo.members.join(', ')}`);

          await interaction.update({
            embeds: [EmbedBuilder.from(msg.embeds[0]).setColor(0x00ff00).setFooter({ text: `Verified by ${user.username}` })],
            components: [disabledRow]
          });
          await interaction.followUp({ content: `✅ **${pending.author}** verified by ${user.username}!`, ephemeral: false });

          if (spawnInfo.confirmThreadId) {
            const confirmThread = await guild.channels
              .fetch(spawnInfo.confirmThreadId)
              .catch(() => null);
            if (confirmThread) {
              const embed = new EmbedBuilder()
                .setColor(0x00ff00)
                .setTitle("✅ Attendance Verified")
                .setDescription(
                  `**${pending.author}** verified for **${spawnInfo.boss}**`
                )
                .addFields(
                  { name: "Verified By", value: user.username, inline: true },
                  {
                    name: "Points",
                    value: `+${bossPoints[spawnInfo.boss]?.points}`,
                    inline: true,
                  },
                  {
                    name: "Total Verified",
                    value: `${spawnInfo.members.length}`,
                    inline: true,
                  }
                )
                .setTimestamp();

              await confirmThread.send({ embeds: [embed] });
            }
          }

          delete stateManager.pendingVerifications[pendingMsgId];
          attendance.setPendingVerifications(stateManager.pendingVerifications);
        } else {
          // Deny
          await interaction.update({
            embeds: [EmbedBuilder.from(msg.embeds[0]).setColor(0xff0000).setFooter({ text: `Denied by ${user.username}` })],
            components: [disabledRow]
          });

          await interaction.followUp({
            content: `<@${pending.authorId}>, your attendance was **denied** by ${user.username}. ` +
              `Please repost with a proper screenshot.`,
            ephemeral: false
          });

          delete stateManager.pendingVerifications[pendingMsgId];
          attendance.setPendingVerifications(stateManager.pendingVerifications);
        }

        return;
      }

      // ── Spawn closure confirmation buttons ──────────────────────
      if (customId.startsWith('close_')) {
        // Check if admin
        const adminMember = await guild.members.fetch(user.id).catch(() => null);
        if (!adminMember || !isAdmin(adminMember)) {
          await interaction.reply({ content: '⚠️ Only admins can close spawns.', ephemeral: true });
          return;
        }

        const closePending = stateManager.pendingClosures[msg.id];
        if (!closePending) {
          await interaction.reply({ content: '⚠️ Closure already processed or expired.', ephemeral: true });
          return;
        }

        const spawnInfo = stateManager.activeSpawns[closePending.threadId];
        const isConfirm = customId.startsWith('close_confirm_');

        // Disable buttons
        const btn1 = interaction.message.components[0].components[0];
        const btn2 = interaction.message.components[0].components[1];
        const disabledRow = createDisabledRow(btn1, btn2);

        if (isConfirm) {
          // ── Confirm close ──────────────────────────────────────
          if (!spawnInfo || spawnInfo.closed) {
            await interaction.update({
              embeds: [EmbedBuilder.from(msg.embeds[0]).setFooter({ text: 'Already closed' })],
              components: [disabledRow]
            });
            await interaction.followUp({ content: "⚠️ Spawn already closed.", ephemeral: false });
            delete stateManager.pendingClosures[msg.id];
            attendance.setPendingClosures(stateManager.pendingClosures);
            return;
          }

          console.log(`🔒 MANUAL CLOSE: Marking ${spawnInfo.boss} (${spawnInfo.timestamp}) as closed by ${user.username}`);
          spawnInfo.closed = true;
          attendance.setActiveSpawns(stateManager.activeSpawns);

          await interaction.update({
            embeds: [EmbedBuilder.from(msg.embeds[0]).setColor(0x00ff00).setFooter({ text: `Closed by ${user.username}` })],
            components: [disabledRow]
          });

          // Remove from stateManager.activeColumns cache BEFORE checking Google Sheets
          // This prevents false positives where the thread exists but was never submitted
          const cacheKey = `${spawnInfo.boss.toUpperCase()}|${normalizeTimestamp(spawnInfo.timestamp)}`;
          delete stateManager.activeColumns[cacheKey];

          // Check for duplicate column before submitting
          const columnExists = await attendance.checkColumnExists(spawnInfo.boss, spawnInfo.timestamp);

          if (columnExists) {
            console.log(`⚠️ Duplicate prevented: ${spawnInfo.boss} at ${spawnInfo.timestamp} already exists`);

            await interaction.followUp({
              content: `⚠️ **Attendance already submitted for this spawn!**\n\nColumn already exists in Google Sheets. Closing thread without duplicate submission.`,
              ephemeral: false
            });

            // Skip submission, just close and clean up
            if (spawnInfo.confirmThreadId) {
              const confirmThread = await guild.channels
                .fetch(spawnInfo.confirmThreadId)
                .catch(() => null);
              if (confirmThread) {
                await confirmThread.send(
                  `⚠️ Duplicate prevented: **${spawnInfo.boss}** (${spawnInfo.timestamp}) - Column already exists`
                );
                await errorHandler.safeDelete(confirmThread, 'message deletion');
              }
            }

            // Lock and archive the thread
            await interaction.channel
              .setLocked(true, `Locked by ${user.username} (duplicate prevented)`)
              .catch(err => errorHandler.silentError(err, 'button close lock duplicate thread'));
            await interaction.channel
              .setArchived(true, `Closed by ${user.username} (duplicate prevented)`)
              .catch(err => errorHandler.silentError(err, 'button close archive duplicate thread'));

            // Delete rotation warning message (prevent channel flooding)
            await bossRotation.deleteRotationWarning(spawnInfo.boss);
            await bossRotation.checkAndDeleteDailySchedule(spawnInfo.boss);

            delete stateManager.activeSpawns[closePending.threadId];
            delete stateManager.activeColumns[`${spawnInfo.boss}|${spawnInfo.timestamp}`];
            delete stateManager.pendingClosures[msg.id];
            delete stateManager.confirmationMessages[closePending.threadId];

            attendance.setActiveSpawns(stateManager.activeSpawns);
            attendance.setActiveColumns(stateManager.activeColumns);
            attendance.setPendingClosures(stateManager.pendingClosures);
            attendance.setConfirmationMessages(stateManager.confirmationMessages);

            return;
          }

          // Check if there are any members to submit
          if (spawnInfo.members.length === 0) {
            // No members to submit - just close and archive the thread
            await interaction.followUp({
              content: `⚠️ **No members to submit** (0 verified). Closing thread without Google Sheets submission...`,
              ephemeral: false
            });

            await interaction.channel.send(
              `⚠️ Thread closed with no verified members. No data submitted to Google Sheets.`
            );

            if (spawnInfo.confirmThreadId) {
              const confirmThread = await guild.channels
                .fetch(spawnInfo.confirmThreadId)
                .catch(() => null);
              if (confirmThread) {
                await confirmThread.send(
                  `⚠️ **${spawnInfo.boss}** (${spawnInfo.timestamp}) closed with 0 members`
                );
                await errorHandler.safeDelete(confirmThread, 'message deletion');
              }
            }

            // Lock and archive the thread
            await interaction.channel
              .setLocked(true, `Locked by ${user.username} (no members)`)
              .catch(err => errorHandler.silentError(err, 'button close lock no members'));
            await interaction.channel
              .setArchived(true, `Closed by ${user.username} (no members)`)
              .catch(err => errorHandler.silentError(err, 'button close archive no members'));

            // Delete rotation warning message (prevent channel flooding)
            await bossRotation.deleteRotationWarning(spawnInfo.boss);
            await bossRotation.checkAndDeleteDailySchedule(spawnInfo.boss);

            delete stateManager.activeSpawns[closePending.threadId];
            delete stateManager.activeColumns[`${spawnInfo.boss}|${spawnInfo.timestamp}`];
            delete stateManager.pendingClosures[msg.id];
            delete stateManager.confirmationMessages[closePending.threadId];

            // Sync all changes
            attendance.setActiveSpawns(stateManager.activeSpawns);
            attendance.setActiveColumns(stateManager.activeColumns);
            attendance.setPendingClosures(stateManager.pendingClosures);
            attendance.setConfirmationMessages(stateManager.confirmationMessages);

            return;
          }

          await interaction.followUp({
            content: `🔒 Closing spawn **${spawnInfo.boss}**... Submitting ${spawnInfo.members.length} members...`,
            ephemeral: false
          });

          console.log(`📊 MANUAL CLOSE: Submitting ${spawnInfo.members.length} members for ${spawnInfo.boss} (${spawnInfo.timestamp})`);
          console.log(`   ├─ Members: ${spawnInfo.members.join(', ')}`);

          const payload = {
            action: "submitAttendance",
            boss: spawnInfo.boss,
            date: spawnInfo.date,
            time: spawnInfo.time,
            timestamp: spawnInfo.timestamp,
            members: spawnInfo.members,
          };

          const resp = await attendance.postToSheet(payload);

          if (resp.ok) {
            // Auto-increment boss rotation if it's a rotating boss
            await bossRotation.handleBossKill(spawnInfo.boss);

            // Delete rotation warning message to avoid flooding
            await bossRotation.deleteRotationWarning(spawnInfo.boss);
            await bossRotation.checkAndDeleteDailySchedule(spawnInfo.boss);

            await interaction.channel.send(`✅ Attendance submitted! Archiving...`);

            if (spawnInfo.confirmThreadId) {
              const confirmThread = await guild.channels
                .fetch(spawnInfo.confirmThreadId)
                .catch(() => null);
              if (confirmThread) {
                await confirmThread.send(
                  `✅ Spawn closed: **${spawnInfo.boss}** (${spawnInfo.timestamp}) - ${spawnInfo.members.length} members`
                );
                await errorHandler.safeDelete(confirmThread, 'message deletion');
              }
            }

            // Lock and archive the thread
            await interaction.channel
              .setLocked(true, `Locked by ${user.username}`)
              .catch(err => errorHandler.silentError(err, 'button close lock thread'));
            await interaction.channel
              .setArchived(true, `Closed by ${user.username}`)
              .catch(err => errorHandler.silentError(err, 'button close archive thread'));

            // Delete rotation warning message (prevent channel flooding)
            await bossRotation.deleteRotationWarning(spawnInfo.boss);
            await bossRotation.checkAndDeleteDailySchedule(spawnInfo.boss);

            delete stateManager.activeSpawns[closePending.threadId];
            delete stateManager.activeColumns[`${spawnInfo.boss}|${spawnInfo.timestamp}`];
            delete stateManager.pendingClosures[msg.id];
            delete stateManager.confirmationMessages[closePending.threadId];

            // Sync all changes
            attendance.setActiveSpawns(stateManager.activeSpawns);
            attendance.setActiveColumns(stateManager.activeColumns);
            attendance.setPendingClosures(stateManager.pendingClosures);
            attendance.setConfirmationMessages(stateManager.confirmationMessages);
          } else {
            await interaction.channel.send(
              `⚠️ **Failed!**\n\nError: ${resp.text || resp.err}\n\n` +
                `**Members:** ${spawnInfo.members.join(", ")}`
            );
          }
        } else {
          // Cancel
          await interaction.update({
            embeds: [EmbedBuilder.from(msg.embeds[0]).setFooter({ text: `Cancelled by ${user.username}` })],
            components: [disabledRow]
          });
          await interaction.followUp({ content: "❌ Close canceled.", ephemeral: false });
          delete stateManager.pendingClosures[msg.id];
          attendance.setPendingClosures(stateManager.pendingClosures);
        }

        return;
      }
    } catch (err) {
      logger.error('Interaction handler error:', err.message);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: '⚠️ An error occurred processing your request.',
          ephemeral: true,
        }).catch((err) => console.error('[interaction-handler] error reply failed:', err?.message || err));
      }
    }
  };
}

module.exports = { createInteractionHandler };
