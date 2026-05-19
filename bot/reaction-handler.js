/**
 * ============================================================================
 * REACTION HANDLER MODULE
 * ============================================================================
 *
 * Extracted from index2.js to reduce file size and improve maintainability.
 * Handles all MessageReactionAdd events including:
 *   - Special 💙 reactions between Rohypnol and AlterFrieren
 *   - Attendance verification (✅ accept / ❌ deny)
 *   - Close confirmation (✅ confirm / ❌ cancel) with sheet submission
 *
 * @module bot/reaction-handler
 * @requires discord.js
 * @requires ../utils/logger
 * @version 1.0
 * ============================================================================
 */

const { Events, EmbedBuilder } = require("discord.js");
const { createLogger } = require('../utils/logger');

const logger = createLogger('reaction-handler');

/**
 * Creates and returns a MessageReactionAdd event handler.
 *
 * The returned closure retains references to all required modules so that
 * the calling file only needs to pass them once at registration time.
 *
 * @param {import('discord.js').Client} client - Discord Client (unused within
 *        the handler itself, but retained for API consistency with other handlers)
 * @param {Object} config - Bot configuration (used for channel / role lookups)
 * @param {Object} modules - Additional module references consumed by the handler
 * @param {Object}  modules.stateManager          - Global state management singleton
 * @param {Object}  modules.attendance             - Attendance tracking module
 * @param {Object}  modules.errorHandler           - Centralized error handling utility
 * @param {Object}  modules.bossRotation           - Boss rotation system
 * @param {Object}  modules.bossPoints             - Boss point value mapping
 * @param {Function} modules.normalizeUsername     - Username normalization utility
 * @param {Function} modules.normalizeTimestamp    - Timestamp normalization utility
 * @param {string}   modules.ALTERFRIEREN_ID       - Discord ID of AlterFrieren
 * @param {string}   modules.ROHYPNol_ID           - Discord ID of Rohypnol
 * @param {Function} modules.isAdmin               - Admin membership check
 * @returns {Function} Async handler suitable for
 *          `client.on(Events.MessageReactionAdd, handler)`
 */
function createReactionHandler(client, config, modules) {
  const {
    stateManager,
    attendance,
    errorHandler,
    bossRotation,
    bossPoints,
    normalizeUsername,
    normalizeTimestamp,
    ALTERFRIEREN_ID,
    ROHYPnol_ID,
    isAdmin,
  } = modules;

  return async (reaction, user) => {
    try {
      // ────────────────────────────────────────────────────────────────────────
      // GUARD CLAUSES — early exits for irrelevant reactions
      // ────────────────────────────────────────────────────────────────────────
      if (user.bot) return;                   // Skip bot reactions
      if (!reaction.message.guild) return;    // Skip DM reactions
      if (reaction.message.guild.id !== config.main_guild_id) return;

    // ──────────────────────────────────────────────────────────────────────────
    // SPECIAL 💙 REACTION — Rohypnol / AlterFrieren interaction
    // 50 % chance for the bot to also react with 💙
    // ──────────────────────────────────────────────────────────────────────────
    if (
      (user.id === ROHYPnol_ID || user.id === ALTERFRIEREN_ID) &&
      reaction.message.author
    ) {
      const otherPersonId =
        user.id === ROHYPnol_ID ? ALTERFRIEREN_ID : ROHYPnol_ID;

      if (reaction.message.author.id === otherPersonId) {
        if (Math.random() < 0.50) {
          await reaction.message
            .react("💙")
            .catch((err) =>
              logger.error(`Failed to react with 💙: ${err.message}`)
            );
        }
      }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // PARTIAL FETCH — ensure full reaction / message data
    // ──────────────────────────────────────────────────────────────────────────
    if (reaction.partial) await reaction.fetch();
    if (reaction.message.partial) await reaction.message.fetch();

    const msg = reaction.message;
    const guild = msg.guild;

    // ──────────────────────────────────────────────────────────────────────────
    // STATE SYNC — pull latest data from the attendance module
    // ──────────────────────────────────────────────────────────────────────────
    stateManager.activeSpawns = attendance.getActiveSpawns();
    stateManager.pendingVerifications = attendance.getPendingVerifications();
    stateManager.pendingClosures = attendance.getPendingClosures();

    // ──────────────────────────────────────────────────────────────────────────
    // GUARD — reject reactions on closed spawn threads
    // ──────────────────────────────────────────────────────────────────────────
    if (
      msg.channel.isThread() &&
      msg.channel.parentId === config.attendance_channel_id
    ) {
      const spawnInfo = stateManager.activeSpawns[msg.channel.id];

      if (!spawnInfo || spawnInfo.closed) {
        try {
          await reaction.users.remove(user.id);
          await msg.channel
            .send(`⚠️ <@${user.id}>, this spawn is closed. Reaction removed.`)
            .then((m) =>
              setTimeout(
                () => errorHandler.safeDelete(m, "closed spawn warning cleanup"),
                5000
              )
            );
        } catch (err) {
          logger.error("Failed to send/delete closed spawn message:", err.message);
        }
        return;
      }
    }

    // NOTE: Bidding confirmations removed — all bids are now instant.

    // ──────────────────────────────────────────────────────────────────────────
    // LOOKUP — check whether this message is waiting for admin action
    // ──────────────────────────────────────────────────────────────────────────
    const pending = stateManager.pendingVerifications[msg.id];
    const closePending = stateManager.pendingClosures[msg.id];

    // Admin check — only attendance / closure reactions require admin role
    if (pending || closePending) {
      const adminMember = await guild.members.fetch(user.id).catch(() => null);
      if (!adminMember || !isAdmin(adminMember)) {
        try {
          await reaction.users.remove(user.id);
        } catch (e) {
          logger.error(
            `Failed to remove non-admin reaction from ${user.tag}:`,
            e.message
          );
        }
        return;
      }
    } else {
      // Not an attendance-related message — ignore
      return;
    }

    // ──────────────────────────────────────────────────────────────────────────
    // ATTENDANCE VERIFICATION
    // ──────────────────────────────────────────────────────────────────────────
    if (pending) {
      const spawnInfo = stateManager.activeSpawns[pending.threadId];

      if (!spawnInfo || spawnInfo.closed) {
        await msg.reply("⚠️ This spawn is closed.");
        delete stateManager.pendingVerifications[msg.id];
        attendance.setPendingVerifications(stateManager.pendingVerifications);
        return;
      }

      if (reaction.emoji.name === "✅") {
        const isDuplicate = spawnInfo.members.some(
          (m) => normalizeUsername(m) === normalizeUsername(pending.author)
        );

        if (isDuplicate) {
          await msg.reply(`⚠️ **${pending.author}** already verified.`);
          await attendance.removeAllReactionsWithRetry(msg);
          delete stateManager.pendingVerifications[msg.id];
          attendance.setPendingVerifications(stateManager.pendingVerifications);
          return;
        }

        spawnInfo.members.push(pending.author);
        // Store Discord ID for reliable MongoDB lookup
        if (!spawnInfo.memberIds) spawnInfo.memberIds = {};
        spawnInfo.memberIds[pending.author] = pending.authorId;
        attendance.setActiveSpawns(stateManager.activeSpawns);

        await attendance.removeAllReactionsWithRetry(msg);
        await msg.reply(
          `✅ **${pending.author}** verified by ${user.username}!`
        );

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

        delete stateManager.pendingVerifications[msg.id];
        attendance.setPendingVerifications(stateManager.pendingVerifications);
      } else if (reaction.emoji.name === "❌") {
        await errorHandler.safeDelete(msg, "message deletion");
        await msg.channel.send(
          `<@${pending.authorId}>, your attendance was **denied** by ${user.username}. ` +
            "Please repost with a proper screenshot."
        );

        delete stateManager.pendingVerifications[msg.id];
        attendance.setPendingVerifications(stateManager.pendingVerifications);
      }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // CLOSE CONFIRMATION
    // ──────────────────────────────────────────────────────────────────────────
    if (closePending) {
      const spawnInfo = stateManager.activeSpawns[closePending.threadId];

      if (reaction.emoji.name === "✅") {
        if (!spawnInfo || spawnInfo.closed) {
          await msg.channel.send("⚠️ Spawn already closed.");
          delete stateManager.pendingClosures[msg.id];
          attendance.setPendingClosures(stateManager.pendingClosures);
          await attendance.removeAllReactionsWithRetry(msg);
          return;
        }

        spawnInfo.closed = true;
        attendance.setActiveSpawns(stateManager.activeSpawns);

        // Remove from stateManager.activeColumns cache BEFORE checking Sheets
        const cacheKey = `${spawnInfo.boss.toUpperCase()}|${normalizeTimestamp(spawnInfo.timestamp)}`;
        delete stateManager.activeColumns[cacheKey];

        const columnExists = await attendance.checkColumnExists(
          spawnInfo.boss,
          spawnInfo.timestamp
        );

        if (columnExists) {
          logger.info(
            `⚠️ Duplicate prevented: ${spawnInfo.boss} at ${spawnInfo.timestamp} already exists`
          );

          await msg.channel.send(
            `⚠️ **Attendance already submitted for this spawn!**\n\n` +
              "Column already exists in Google Sheets. Closing thread without duplicate submission."
          );

          await attendance.removeAllReactionsWithRetry(msg);

          if (spawnInfo.confirmThreadId) {
            const confirmThread = await guild.channels
              .fetch(spawnInfo.confirmThreadId)
              .catch(() => null);
            if (confirmThread) {
              await confirmThread.send(
                `⚠️ Duplicate prevented: **${spawnInfo.boss}** (${spawnInfo.timestamp}) - Column already exists`
              );
              await errorHandler.safeDelete(confirmThread, "message deletion");
            }
          }

          await msg.channel
            .setLocked(true, `Locked by ${user.username} (duplicate prevented)`)
            .catch((err) =>
              errorHandler.silentError(err, "reaction close lock duplicate thread")
            );
          await msg.channel
            .setArchived(
              true,
              `Closed by ${user.username} (duplicate prevented)`
            )
            .catch((err) =>
              errorHandler.silentError(
                err,
                "reaction close archive duplicate thread"
              )
            );

          await bossRotation.deleteRotationWarning(spawnInfo.boss);
          await bossRotation.checkAndDeleteDailySchedule(spawnInfo.boss);

          delete stateManager.activeSpawns[closePending.threadId];
          delete stateManager.activeColumns[cacheKey];
          delete stateManager.pendingClosures[msg.id];
          delete stateManager.confirmationMessages[closePending.threadId];

          attendance.setActiveSpawns(stateManager.activeSpawns);
          attendance.setActiveColumns(stateManager.activeColumns);
          attendance.setPendingClosures(stateManager.pendingClosures);
          attendance.setConfirmationMessages(stateManager.confirmationMessages);

          return;
        }

        await msg.channel.send(
          `🔒 Closing spawn **${spawnInfo.boss}**... Submitting ${spawnInfo.members.length} members...`
        );

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
          await bossRotation.handleBossKill(spawnInfo.boss);
          await bossRotation.deleteRotationWarning(spawnInfo.boss);
          await bossRotation.checkAndDeleteDailySchedule(spawnInfo.boss);

          await msg.channel.send("✅ Attendance submitted! Archiving...");

          await attendance.removeAllReactionsWithRetry(msg);

          if (spawnInfo.confirmThreadId) {
            const confirmThread = await guild.channels
              .fetch(spawnInfo.confirmThreadId)
              .catch(() => null);
            if (confirmThread) {
              await confirmThread.send(
                `✅ Spawn closed: **${spawnInfo.boss}** (${spawnInfo.timestamp}) - ${spawnInfo.members.length} members`
              );
              await errorHandler.safeDelete(confirmThread, "message deletion");
            }
          }

          await msg.channel
            .setLocked(true, `Locked by ${user.username}`)
            .catch((err) =>
              errorHandler.silentError(err, "reaction close lock thread")
            );
          await msg.channel
            .setArchived(true, `Closed by ${user.username}`)
            .catch((err) =>
              errorHandler.silentError(err, "reaction close archive thread")
            );

          await bossRotation.deleteRotationWarning(spawnInfo.boss);
          await bossRotation.checkAndDeleteDailySchedule(spawnInfo.boss);

          delete stateManager.activeSpawns[closePending.threadId];
          delete stateManager.activeColumns[cacheKey];
          delete stateManager.pendingClosures[msg.id];
          delete stateManager.confirmationMessages[closePending.threadId];

          attendance.setActiveSpawns(stateManager.activeSpawns);
          attendance.setActiveColumns(stateManager.activeColumns);
          attendance.setPendingClosures(stateManager.pendingClosures);
          attendance.setConfirmationMessages(stateManager.confirmationMessages);
        } else {
          await msg.channel.send(
            `⚠️ **Failed!**\n\nError: ${resp.text || resp.err}\n\n` +
              `**Members:** ${spawnInfo.members.join(", ")}`
          );
          await attendance.removeAllReactionsWithRetry(msg);
        }
      } else if (reaction.emoji.name === "❌") {
        await msg.channel.send("❌ Close canceled.");
        await attendance.removeAllReactionsWithRetry(msg);
        delete stateManager.pendingClosures[msg.id];
        attendance.setPendingClosures(stateManager.pendingClosures);
      }
    }
    } catch (err) {
      logger.error("Reaction handler error:", err);
    }
  };
}

module.exports = { createReactionHandler };
