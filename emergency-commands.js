/**
 * EMERGENCY COMMANDS MODULE
 * Provides admin-only commands to recover from stuck states
 * All commands require confirmation to prevent accidental use
 */

const { EmbedBuilder } = require("discord.js");
const errorHandler = require('./utils/error-handler');

const EMOJI = {
  SUCCESS: "✅",
  ERROR: "❌",
  WARNING: "⚠️",
  EMERGENCY: "🚨",
  FIRE: "🔥",
  LOCK: "🔒",
  UNLOCK: "🔓",
  CLEANUP: "🧹",
  RESET: "🔄",
};

const COLORS = {
  SUCCESS: 0x00ff00,
  ERROR: 0xff0000,
  WARNING: 0xffa500,
  EMERGENCY: 0xff4444,
};

let config = null;
let attendance = null;
let bidding = null;
let auctioneering = null;
let isAdminFunc = null;

function initialize(cfg, attModule, bidModule, auctModule, isAdmin) {
  config = cfg;
  attendance = attModule;
  bidding = bidModule;
  auctioneering = auctModule;
  isAdminFunc = isAdmin;
  console.log("🚨 Emergency commands module initialized");
}

// ==========================================
// EMERGENCY: FORCE CLOSE ALL ATTENDANCE THREADS
// ==========================================
async function forceCloseAllAttendance(message) {
  const confirmEmbed = new EmbedBuilder()
    .setColor(COLORS.EMERGENCY)
    .setTitle(`${EMOJI.EMERGENCY} EMERGENCY: Close All Attendance?`)
    .setDescription(
      `**This will forcefully:**\n` +
      `• Close ALL active attendance threads\n` +
      `• Archive all threads immediately\n` +
      `• Clear all pending verifications\n` +
      `• Clear active spawns from memory\n\n` +
      `⚠️ **WARNING:** This does NOT submit attendance to sheets!\n` +
      `Use this only if threads are stuck and cannot be closed normally.`
    )
    .setFooter({ text: `${EMOJI.SUCCESS} confirm / ${EMOJI.ERROR} cancel • 15s timeout` });

  const conf = await message.reply({ embeds: [confirmEmbed] });
  await conf.react(EMOJI.SUCCESS);
  await conf.react(EMOJI.ERROR);

  try {
    const collected = await conf.awaitReactions({
      filter: (r, u) => [EMOJI.SUCCESS, EMOJI.ERROR].includes(r.emoji.name) && u.id === message.author.id,
      max: 1,
      time: 15000,
      errors: ["time"],
    });

    if (collected.first().emoji.name === EMOJI.ERROR) {
      await conf.edit({ embeds: [EmbedBuilder.from(confirmEmbed).setColor(COLORS.SUCCESS).setFooter({ text: "Cancelled" })] });
      await errorHandler.safeRemoveReactions(conf, 'reaction removal');
      return;
    }

    await errorHandler.safeRemoveReactions(conf, 'reaction removal');

    const guild = await message.client.guilds.fetch(config.main_guild_id);
    const attChannel = await guild.channels.fetch(config.attendance_channel_id);
    const adminLogs = await guild.channels.fetch(config.admin_logs_channel_id);

    const threads = await attChannel.threads.fetchActive();
    let closedCount = 0;
    let errorCount = 0;

    for (const [threadId, thread] of threads.threads) {
      try {
        await thread.send(`${EMOJI.EMERGENCY} **EMERGENCY CLOSURE** by admin ${message.author.username}`);
        await attendance.cleanupAllThreadReactions(thread);
        await thread.setArchived(true, "Emergency closure by admin");
        closedCount++;
      } catch (err) {
        console.error(`Failed to close thread ${threadId}:`, err.message);
        errorCount++;
      }
    }

    // Clear all state
    const activeSpawns = attendance.getActiveSpawns();
    const activeColumns = attendance.getActiveColumns();
    const pendingVerifications = attendance.getPendingVerifications();
    const pendingClosures = attendance.getPendingClosures();

    const spawnCount = Object.keys(activeSpawns).length;
    const verificationCount = Object.keys(pendingVerifications).length;

    attendance.setActiveSpawns({});
    attendance.setActiveColumns({});
    attendance.setPendingVerifications({});
    attendance.setPendingClosures({});
    attendance.setConfirmationMessages({});

    // Force save state
    await attendance.saveAttendanceStateToSheet(true);

    const resultEmbed = new EmbedBuilder()
      .setColor(COLORS.SUCCESS)
      .setTitle(`${EMOJI.SUCCESS} Emergency Closure Complete`)
      .addFields(
        { name: "Threads Closed", value: `${closedCount}`, inline: true },
        { name: "Errors", value: `${errorCount}`, inline: true },
        { name: "Spawns Cleared", value: `${spawnCount}`, inline: true },
        { name: "Verifications Cleared", value: `${verificationCount}`, inline: true }
      )
      .setFooter({ text: "State saved to Google Sheets" })
      .setTimestamp();

    await conf.edit({ embeds: [resultEmbed] });
    await adminLogs.send({ embeds: [resultEmbed] });

  } catch (err) {
    if (err.message === "time") {
      await conf.edit({ embeds: [EmbedBuilder.from(confirmEmbed).setFooter({ text: "Timed out" })] });
      await errorHandler.safeRemoveReactions(conf, 'reaction removal');
    } else {
      console.error("Emergency close all error:", err);
      await message.reply(`${EMOJI.ERROR} Error: ${err.message}`);
    }
  }
}

// ==========================================
// EMERGENCY: FORCE CLOSE SPECIFIC ATTENDANCE THREAD
// ==========================================
async function forceCloseAttendanceThread(message, args) {
  if (args.length === 0) {
    return await message.reply(
      `${EMOJI.ERROR} Usage: \`!emergency close <thread_id>\`\n\n` +
      `Get thread ID by right-clicking the thread and selecting "Copy ID"`
    );
  }

  const threadId = args[0];

  try {
    const guild = await message.client.guilds.fetch(config.main_guild_id);
    const thread = await guild.channels.fetch(threadId).catch(() => null);

    if (!thread || !thread.isThread()) {
      return await message.reply(`${EMOJI.ERROR} Thread not found or invalid ID`);
    }

    await thread.send(`${EMOJI.EMERGENCY} **FORCE CLOSED** by admin ${message.author.username}`);
    await attendance.cleanupAllThreadReactions(thread);
    await thread.setArchived(true, `Emergency closure by ${message.author.username}`);

    // Clear from state
    const activeSpawns = attendance.getActiveSpawns();
    const spawnInfo = activeSpawns[threadId];

    if (spawnInfo) {
      delete activeSpawns[threadId];

      const activeColumns = attendance.getActiveColumns();
      delete activeColumns[`${spawnInfo.boss}|${spawnInfo.timestamp}`];

      attendance.setActiveSpawns(activeSpawns);
      attendance.setActiveColumns(activeColumns);

      await attendance.saveAttendanceStateToSheet(true);
    }

    await message.reply(`${EMOJI.SUCCESS} Thread ${threadId} force closed and removed from state`);

  } catch (err) {
    console.error("Emergency close thread error:", err);
    await message.reply(`${EMOJI.ERROR} Error: ${err.message}`);
  }
}

// ==========================================
// EMERGENCY: FORCE END AUCTION
// ==========================================
async function forceEndAuction(message) {
  const confirmEmbed = new EmbedBuilder()
    .setColor(COLORS.EMERGENCY)
    .setTitle(`${EMOJI.EMERGENCY} EMERGENCY: Force End Auction?`)
    .setDescription(
      `**This will forcefully:**\n` +
      `• End the current auction immediately\n` +
      `• Submit results to sheets (if any winners)\n` +
      `• Clear all timers and state\n` +
      `• Unlock all locked points\n\n` +
      `⚠️ Use this if the auction is stuck or bugged.`
    )
    .setFooter({ text: `${EMOJI.SUCCESS} confirm / ${EMOJI.ERROR} cancel • 15s timeout` });

  const conf = await message.reply({ embeds: [confirmEmbed] });
  await conf.react(EMOJI.SUCCESS);
  await conf.react(EMOJI.ERROR);

  try {
    const collected = await conf.awaitReactions({
      filter: (r, u) => [EMOJI.SUCCESS, EMOJI.ERROR].includes(r.emoji.name) && u.id === message.author.id,
      max: 1,
      time: 15000,
      errors: ["time"],
    });

    if (collected.first().emoji.name === EMOJI.ERROR) {
      await conf.edit({ embeds: [EmbedBuilder.from(confirmEmbed).setColor(COLORS.SUCCESS).setFooter({ text: "Cancelled" })] });
      await errorHandler.safeRemoveReactions(conf, 'reaction removal');
      return;
    }

    await errorHandler.safeRemoveReactions(conf, 'reaction removal');

    // Check auctioneering first
    if (auctioneering) {
      const auctState = auctioneering.getAuctionState();
      if (auctState && auctState.active) {
        const guild = await message.client.guilds.fetch(config.main_guild_id);
        const biddingChannel = await guild.channels.fetch(config.bidding_channel_id);

        await auctioneering.endAuctionSession(message.client, config, biddingChannel);

        await conf.edit({
          embeds: [new EmbedBuilder()
            .setColor(COLORS.SUCCESS)
            .setTitle(`${EMOJI.SUCCESS} Auctioneering Session Ended`)
            .setDescription("Results submitted, state cleared")
            .setTimestamp()]
        });
        return;
      }
    }

    // Check bidding.js auction
    const biddingState = bidding.getBiddingState();
    if (biddingState.a) {
      await bidding.forceEndAuction(message.client, config);

      await conf.edit({
        embeds: [new EmbedBuilder()
          .setColor(COLORS.SUCCESS)
          .setTitle(`${EMOJI.SUCCESS} Bidding Auction Ended`)
          .setDescription("Results submitted, state cleared")
          .setTimestamp()]
      });
      return;
    }

    await conf.edit({
      embeds: [new EmbedBuilder()
        .setColor(COLORS.WARNING)
        .setTitle(`${EMOJI.WARNING} No Active Auction`)
        .setDescription("No auction found to end")]
    });

  } catch (err) {
    if (err.message === "time") {
      await conf.edit({ embeds: [EmbedBuilder.from(confirmEmbed).setFooter({ text: "Timed out" })] });
      await errorHandler.safeRemoveReactions(conf, 'reaction removal');
    } else {
      console.error("Emergency end auction error:", err);
      await message.reply(`${EMOJI.ERROR} Error: ${err.message}`);
    }
  }
}

// ==========================================
// EMERGENCY: UNLOCK ALL POINTS
// ==========================================
async function unlockAllPoints(message) {
  const biddingState = bidding.getBiddingState();
  const lockedCount = Object.keys(biddingState.lp).length;

  if (lockedCount === 0) {
    return await message.reply(`${EMOJI.SUCCESS} No locked points found`);
  }

  const lockedList = Object.entries(biddingState.lp)
    .map(([user, pts]) => `• ${user}: ${pts}pts`)
    .join("\n");

  const confirmEmbed = new EmbedBuilder()
    .setColor(COLORS.EMERGENCY)
    .setTitle(`${EMOJI.EMERGENCY} EMERGENCY: Unlock All Points?`)
    .setDescription(
      `**Currently locked:**\n${lockedList}\n\n` +
      `⚠️ This will unlock ALL points immediately.\n` +
      `Use this if points are stuck locked after a crashed auction.`
    )
    .setFooter({ text: `${EMOJI.SUCCESS} confirm / ${EMOJI.ERROR} cancel • 15s timeout` });

  const conf = await message.reply({ embeds: [confirmEmbed] });
  await conf.react(EMOJI.SUCCESS);
  await conf.react(EMOJI.ERROR);

  try {
    const collected = await conf.awaitReactions({
      filter: (r, u) => [EMOJI.SUCCESS, EMOJI.ERROR].includes(r.emoji.name) && u.id === message.author.id,
      max: 1,
      time: 15000,
      errors: ["time"],
    });

    if (collected.first().emoji.name === EMOJI.ERROR) {
      await conf.edit({ embeds: [EmbedBuilder.from(confirmEmbed).setColor(COLORS.SUCCESS).setFooter({ text: "Cancelled" })] });
      await errorHandler.safeRemoveReactions(conf, 'reaction removal');
      return;
    }

    await errorHandler.safeRemoveReactions(conf, 'reaction removal');

    const totalUnlocked = Object.values(biddingState.lp).reduce((sum, pts) => sum + pts, 0);

    biddingState.lp = {};
    bidding.saveBiddingState();

    await conf.edit({
      embeds: [new EmbedBuilder()
        .setColor(COLORS.SUCCESS)
        .setTitle(`${EMOJI.UNLOCK} All Points Unlocked`)
        .addFields(
          { name: "Users Affected", value: `${lockedCount}`, inline: true },
          { name: "Total Points", value: `${totalUnlocked}pts`, inline: true }
        )
        .setTimestamp()]
    });

  } catch (err) {
    if (err.message === "time") {
      await conf.edit({ embeds: [EmbedBuilder.from(confirmEmbed).setFooter({ text: "Timed out" })] });
      await errorHandler.safeRemoveReactions(conf, 'reaction removal');
    } else {
      console.error("Emergency unlock error:", err);
      await message.reply(`${EMOJI.ERROR} Error: ${err.message}`);
    }
  }
}

// ==========================================
// EMERGENCY: CLEAR PENDING CONFIRMATIONS
// ==========================================
async function clearPendingConfirmations(message) {
  const biddingState = bidding.getBiddingState();
  const pendingCount = Object.keys(biddingState.pc).length;

  if (pendingCount === 0) {
    return await message.reply(`${EMOJI.SUCCESS} No pending confirmations`);
  }

  const confirmEmbed = new EmbedBuilder()
    .setColor(COLORS.EMERGENCY)
    .setTitle(`${EMOJI.EMERGENCY} EMERGENCY: Clear Pending Confirmations?`)
    .setDescription(
      `**${pendingCount} pending bid confirmations** will be cleared.\n\n` +
      `⚠️ Users will need to re-bid.\n` +
      `Use this if confirmations are stuck.`
    )
    .setFooter({ text: `${EMOJI.SUCCESS} confirm / ${EMOJI.ERROR} cancel • 15s timeout` });

  const conf = await message.reply({ embeds: [confirmEmbed] });
  await conf.react(EMOJI.SUCCESS);
  await conf.react(EMOJI.ERROR);

  try {
    const collected = await conf.awaitReactions({
      filter: (r, u) => [EMOJI.SUCCESS, EMOJI.ERROR].includes(r.emoji.name) && u.id === message.author.id,
      max: 1,
      time: 15000,
      errors: ["time"],
    });

    if (collected.first().emoji.name === EMOJI.ERROR) {
      await conf.edit({ embeds: [EmbedBuilder.from(confirmEmbed).setColor(COLORS.SUCCESS).setFooter({ text: "Cancelled" })] });
      await errorHandler.safeRemoveReactions(conf, 'reaction removal');
      return;
    }

    await errorHandler.safeRemoveReactions(conf, 'reaction removal');

    // Try to delete all pending confirmation messages
    const guild = message.guild;
    let deletedCount = 0;

    for (const [msgId, pending] of Object.entries(biddingState.pc)) {
      try {
        const threadId = pending.threadId || pending.auctStateRef?.currentItem?.threadId;
        if (threadId) {
          const thread = await guild.channels.fetch(threadId).catch(() => null);
          if (thread) {
            const msg = await thread.messages.fetch(msgId).catch(() => null);
            if (msg) {
              await errorHandler.safeDelete(msg, 'message deletion');
              deletedCount++;
            }
          }
        }
      } catch (err) {
        console.error(`Failed to delete confirmation ${msgId}:`, err.message);
      }
    }

    biddingState.pc = {};
    bidding.saveBiddingState();

    await conf.edit({
      embeds: [new EmbedBuilder()
        .setColor(COLORS.SUCCESS)
        .setTitle(`${EMOJI.CLEANUP} Confirmations Cleared`)
        .addFields(
          { name: "Cleared", value: `${pendingCount}`, inline: true },
          { name: "Messages Deleted", value: `${deletedCount}`, inline: true }
        )
        .setTimestamp()]
    });

  } catch (err) {
    if (err.message === "time") {
      await conf.edit({ embeds: [EmbedBuilder.from(confirmEmbed).setFooter({ text: "Timed out" })] });
      await errorHandler.safeRemoveReactions(conf, 'reaction removal');
    } else {
      console.error("Emergency clear confirmations error:", err);
      await message.reply(`${EMOJI.ERROR} Error: ${err.message}`);
    }
  }
}

// ==========================================
// EMERGENCY: STATE DIAGNOSTICS
// ==========================================
async function stateDiagnostics(message) {
  const activeSpawns = attendance.getActiveSpawns();
  const activeColumns = attendance.getActiveColumns();
  const pendingVerifications = attendance.getPendingVerifications();
  const pendingClosures = attendance.getPendingClosures();
  const biddingState = bidding.getBiddingState();
  const auctState = auctioneering ? auctioneering.getAuctionState() : null;

  const embed = new EmbedBuilder()
    .setColor(COLORS.WARNING)
    .setTitle(`${EMOJI.WARNING} State Diagnostics`)
    .addFields(
      { name: "📋 Active Attendance Spawns", value: `${Object.keys(activeSpawns).length}`, inline: true },
      { name: "📊 Active Sheet Columns", value: `${Object.keys(activeColumns).length}`, inline: true },
      { name: "⏳ Pending Verifications", value: `${Object.keys(pendingVerifications).length}`, inline: true },
      { name: "🔒 Pending Closures", value: `${Object.keys(pendingClosures).length}`, inline: true },
      { name: "💰 Locked Points", value: `${Object.keys(biddingState.lp).length} users`, inline: true },
      { name: "⏰ Pending Confirmations", value: `${Object.keys(biddingState.pc).length}`, inline: true },
      { name: "🔨 Bidding.js Auction", value: biddingState.a ? `Active: ${biddingState.a.item}` : "None", inline: false },
      { name: "🎯 Auctioneering Session", value: auctState?.active ? `Active: ${auctState.sessions?.length || 0} sessions` : "None", inline: false }
    )
    .setFooter({ text: "Use emergency commands if any values look stuck" })
    .setTimestamp();

  await message.reply({ embeds: [embed] });
}

// ==========================================
// EMERGENCY: FORCE SYNC STATE TO SHEETS
// ==========================================
async function forceSyncState(message) {
  await message.reply(`${EMOJI.RESET} Syncing all state to Google Sheets...`);

  try {
    await Promise.all([
      attendance.saveAttendanceStateToSheet(true),
      bidding.forceSaveState(),
    ]);

    await message.reply(`${EMOJI.SUCCESS} State synced successfully to Google Sheets`);
  } catch (err) {
    console.error("Force sync error:", err);
    await message.reply(`${EMOJI.ERROR} Sync error: ${err.message}`);
  }
}

// ==========================================
// COMMAND ROUTER
// ==========================================
async function handleEmergencyCommand(message, args) {
  const subCommand = args[0]?.toLowerCase();

  if (!subCommand) {
    const helpEmbed = new EmbedBuilder()
      .setColor(COLORS.EMERGENCY)
      .setTitle(`${EMOJI.EMERGENCY} Emergency Commands`)
      .setDescription("**Admin-only commands to recover from stuck states**")
      .addFields(
        {
          name: "🚨 Attendance Commands",
          value:
            "`!emergency closeall` - Force close all attendance threads\n" +
            "`!emergency close <id>` - Force close specific thread",
          inline: false
        },
        {
          name: "🔨 Auction Commands",
          value: "`!emergency endauction` - Force end current auction",
          inline: false
        },
        {
          name: "💰 Points Commands",
          value:
            "`!emergency unlock` - Unlock all locked points\n" +
            "`!emergency clearbids` - Clear pending bid confirmations",
          inline: false
        },
        {
          name: "🔧 System Commands",
          value:
            "`!emergency diag` - Show state diagnostics\n" +
            "`!emergency sync` - Force sync state to sheets",
          inline: false
        }
      )
      .setFooter({ text: "⚠️ All commands require confirmation" });

    return await message.reply({ embeds: [helpEmbed] });
  }

  switch (subCommand) {
    case "closeall":
      await forceCloseAllAttendance(message);
      break;

    case "close":
      await forceCloseAttendanceThread(message, args.slice(1));
      break;

    case "endauction":
      await forceEndAuction(message);
      break;

    case "unlock":
      await unlockAllPoints(message);
      break;

    case "clearbids":
      await clearPendingConfirmations(message);
      break;

    case "diag":
    case "diagnostics":
      await stateDiagnostics(message);
      break;

    case "sync":
      await forceSyncState(message);
      break;

    default:
      await message.reply(`${EMOJI.ERROR} Unknown emergency command. Use \`!emergency\` for help.`);
  }
}

module.exports = {
  initialize,
  handleEmergencyCommand,
};
