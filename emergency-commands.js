/**
 * ============================================================================
 * EMERGENCY COMMANDS MODULE
 * ============================================================================
 *
 * PURPOSE:
 * Provides admin-only recovery commands for handling stuck or broken states
 * in the bot's various systems (attendance, bidding, auctions).
 *
 * FEATURES:
 * - Force close attendance threads (all or specific)
 * - Force end stuck auctions
 * - Unlock stuck points
 * - Clear pending confirmations
 * - State diagnostics
 * - Force sync state to Google Sheets
 *
 * SAFETY MECHANISMS:
 * - All commands require confirmation (15-30s timeout)
 * - Admin-only access
 * - Detailed feedback on what was changed
 * - Logging to admin-logs channel
 *
 * WORKFLOW:
 * 1. Admin runs emergency command (e.g., !emergency closeall)
 * 2. Bot displays confirmation prompt with details
 * 3. Admin reacts with checkmark or X
 * 4. Bot executes action if confirmed
 * 5. Bot displays results and logs to admin-logs
 *
 * USE CASES:
 * - Attendance thread won't close (stuck reactions, API errors)
 * - Auction ended but state not cleared
 * - Points locked after crashed auction
 * - Pending confirmations from previous session
 * - State desync between bot and sheets
 *
 * PERMISSIONS:
 * - Admin-only (verified by isAdmin function)
 * - Can be used in any channel
 *
 * @module emergency-commands
 */

// ============================================================================
// DEPENDENCIES
// ============================================================================

const { EmbedBuilder } = require("discord.js");
const errorHandler = require('./utils/error-handler');

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Emoji constants for emergency command feedback
 */
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

/**
 * Color codes for embed messages
 */
const COLORS = {
  SUCCESS: 0x00ff00,
  ERROR: 0xff0000,
  WARNING: 0xffa500,
  EMERGENCY: 0xff4444,
};

// ============================================================================
// MODULE STATE
// ============================================================================

/**
 * Module dependencies initialized by initialize()
 */
let config = null;           // Bot configuration
let attendance = null;       // Attendance module reference
let bidding = null;          // Bidding module reference
let auctioneering = null;    // Auctioneering module reference
let isAdminFunc = null;      // Admin check function
let discordCache = null;     // Discord channel cache

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initializes the emergency commands module with required dependencies
 *
 * @param {Object} cfg - Bot configuration object
 * @param {Object} attModule - Attendance module instance
 * @param {Object} bidModule - Bidding module instance
 * @param {Object} auctModule - Auctioneering module instance
 * @param {Function} isAdmin - Function to check admin permissions
 *
 * @example
 * initialize(config, attendance, bidding, auctioneering, isAdmin);
 * // Output: 🚨 Emergency commands module initialized
 */
function initialize(cfg, attModule, bidModule, auctModule, isAdmin, cache = null) {
  config = cfg;
  attendance = attModule;
  bidding = bidModule;
  auctioneering = auctModule;
  isAdminFunc = isAdmin;
  discordCache = cache;
  console.log("🚨 Emergency commands module initialized");
}

// ==========================================
// EMERGENCY: FORCE CLOSE ALL ATTENDANCE THREADS
// ==========================================

/**
 * Forces closure of all active attendance threads
 *
 * USE CASE:
 * When multiple attendance threads are stuck open (won't close normally),
 * this command forcefully closes and archives all of them.
 *
 * WARNING:
 * This does NOT submit attendance to sheets! Only use if threads are
 * genuinely stuck and cannot be closed through normal means.
 *
 * WORKFLOW:
 * 1. Show confirmation prompt with details
 * 2. If confirmed:
 *    - Fetch all active threads in attendance channel
 *    - Send emergency closure message to each thread
 *    - Clean up reactions from each thread
 *    - Archive each thread
 *    - Clear all attendance state (spawns, verifications, closures)
 *    - Save cleared state to sheets
 * 3. Display results (threads closed, errors, state cleared)
 * 4. Log to admin-logs channel
 *
 * @param {Message} message - Discord message that triggered the command
 * @returns {Promise<void>}
 *
 * @example
 * // Admin command: !emergency closeall
 * await forceCloseAllAttendance(message);
 */
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
    .setFooter({ text: 'Click a button below to confirm • 15s timeout' });

  const confirmButton = new ButtonBuilder()
    .setCustomId(`closeall_confirm_${message.author.id}_${Date.now()}`)
    .setLabel('✅ Confirm')
    .setStyle(ButtonStyle.Danger);

  const cancelButton = new ButtonBuilder()
    .setCustomId(`closeall_cancel_${message.author.id}_${Date.now()}`)
    .setLabel('❌ Cancel')
    .setStyle(ButtonStyle.Secondary);

  const row = new ActionRowBuilder().addComponents(confirmButton, cancelButton);

  const conf = await message.reply({ embeds: [confirmEmbed], components: [row] });

  const collector = conf.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 15000,
    filter: i => i.user.id === message.author.id
  });

  let confirmed = false;

  collector.on('collect', async (interaction) => {
    const isConfirm = interaction.customId.startsWith('closeall_confirm_');

    const disabledRow = new ActionRowBuilder().addComponents(
      ButtonBuilder.from(confirmButton).setDisabled(true),
      ButtonBuilder.from(cancelButton).setDisabled(true)
    );

    if (!isConfirm) {
      await interaction.update({
        embeds: [EmbedBuilder.from(confirmEmbed).setColor(COLORS.SUCCESS).setFooter({ text: "Cancelled" })],
        components: [disabledRow]
      });
      collector.stop('cancelled');
      return;
    }

    confirmed = true;
    await interaction.update({ components: [disabledRow] });
    collector.stop('confirmed');

    // OPTIMIZATION v6.4: Use cached channels for instant access
    const [attChannel, adminLogs] = await Promise.all([
      discordCache.getChannel('attendance_channel_id'),
      discordCache.getChannel('admin_logs_channel_id')
    ]);

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
  });

  collector.on('end', async (collected, reason) => {
    if (reason === 'time' && !confirmed) {
      const disabledRow = new ActionRowBuilder().addComponents(
        ButtonBuilder.from(confirmButton).setDisabled(true),
        ButtonBuilder.from(cancelButton).setDisabled(true)
      );

      await conf.edit({
        embeds: [EmbedBuilder.from(confirmEmbed).setFooter({ text: "Timed out" })],
        components: [disabledRow]
      }).catch(() => {});
    }
  });
}

// ==========================================
// EMERGENCY: FORCE CLOSE SPECIFIC ATTENDANCE THREAD
// ==========================================

/**
 * Forces closure of a specific attendance thread by ID
 *
 * USE CASE:
 * When a specific attendance thread is stuck and won't close normally.
 * More surgical than closeall - only affects one thread.
 *
 * WORKFLOW:
 * 1. Validate thread ID argument
 * 2. Fetch and verify thread exists
 * 3. Send emergency closure message
 * 4. Clean up reactions
 * 5. Archive thread
 * 6. Remove from activeSpawns and activeColumns state
 * 7. Save state to sheets
 *
 * @param {Message} message - Discord message that triggered the command
 * @param {Array<string>} args - Command arguments [thread_id]
 * @returns {Promise<void>}
 *
 * @example
 * // Admin command: !emergency close 123456789012345678
 * await forceCloseAttendanceThread(message, ["123456789012345678"]);
 */
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

/**
 * Forces the end of a currently active auction
 *
 * USE CASE:
 * When an auction is stuck (timer didn't fire, state corrupted, etc.)
 * and needs to be forcefully ended with submission to sheets.
 *
 * SYSTEM SUPPORT:
 * - Handles auctioneering.js sessions (multi-item auctions)
 * - Handles bidding.js single auctions
 * - Auto-detects which system is active
 *
 * WORKFLOW:
 * 1. Show confirmation prompt
 * 2. If confirmed:
 *    - Check auctioneering state first
 *    - If auctioneering active: end session
 *    - Otherwise check bidding.js auction state
 *    - If bidding active: force end auction
 *    - If neither active: show "no auction" message
 * 3. Display results
 *
 * @param {Message} message - Discord message that triggered the command
 * @returns {Promise<void>}
 *
 * @example
 * // Admin command: !emergency endauction
 * await forceEndAuction(message);
 */
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
    .setFooter({ text: 'Click a button below to confirm • 15s timeout' });

  const confirmButton = new ButtonBuilder()
    .setCustomId(`endauction_confirm_${message.author.id}_${Date.now()}`)
    .setLabel('✅ Confirm')
    .setStyle(ButtonStyle.Danger);

  const cancelButton = new ButtonBuilder()
    .setCustomId(`endauction_cancel_${message.author.id}_${Date.now()}`)
    .setLabel('❌ Cancel')
    .setStyle(ButtonStyle.Secondary);

  const row = new ActionRowBuilder().addComponents(confirmButton, cancelButton);

  const conf = await message.reply({ embeds: [confirmEmbed], components: [row] });

  const collector = conf.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 15000,
    filter: i => i.user.id === message.author.id
  });

  let confirmed = false;

  collector.on('collect', async (interaction) => {
    const isConfirm = interaction.customId.startsWith('endauction_confirm_');

    const disabledRow = new ActionRowBuilder().addComponents(
      ButtonBuilder.from(confirmButton).setDisabled(true),
      ButtonBuilder.from(cancelButton).setDisabled(true)
    );

    if (!isConfirm) {
      await interaction.update({
        embeds: [EmbedBuilder.from(confirmEmbed).setColor(COLORS.SUCCESS).setFooter({ text: "Cancelled" })],
        components: [disabledRow]
      });
      collector.stop('cancelled');
      return;
    }

    confirmed = true;
    await interaction.update({ components: [disabledRow] });
    collector.stop('confirmed');

    // Check auctioneering first
    if (auctioneering) {
      const auctState = auctioneering.getAuctionState();
      if (auctState && auctState.active) {
        const biddingChannel = await discordCache.getChannel('bidding_channel_id');

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
  });

  collector.on('end', async (collected, reason) => {
    if (reason === 'time' && !confirmed) {
      const disabledRow = new ActionRowBuilder().addComponents(
        ButtonBuilder.from(confirmButton).setDisabled(true),
        ButtonBuilder.from(cancelButton).setDisabled(true)
      );

      await conf.edit({
        embeds: [EmbedBuilder.from(confirmEmbed).setFooter({ text: "Timed out" })],
        components: [disabledRow]
      }).catch(() => {});
    }
  });
}

// ==========================================
// EMERGENCY: UNLOCK ALL POINTS
// ==========================================

/**
 * Unlocks all locked points across all users
 *
 * USE CASE:
 * When an auction crashes or fails to complete, points may remain
 * locked (preventing users from bidding again). This command releases
 * all locked points back to users.
 *
 * WHAT ARE LOCKED POINTS:
 * When a user places a bid, those points are "locked" (reserved for
 * that bid). If the auction completes normally, winning bids are
 * deducted and losing bids are unlocked. If the auction crashes,
 * points may remain locked indefinitely.
 *
 * WORKFLOW:
 * 1. Check if any points are locked
 * 2. If yes, show confirmation with list of affected users
 * 3. If confirmed:
 *    - Calculate total points to unlock
 *    - Clear locked points map (biddingState.lp = {})
 *    - Save state
 * 4. Display results
 *
 * @param {Message} message - Discord message that triggered the command
 * @returns {Promise<void>}
 *
 * @example
 * // Admin command: !emergency unlock
 * await unlockAllPoints(message);
 */
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
    .setFooter({ text: 'Click a button below to confirm • 15s timeout' });

  const confirmButton = new ButtonBuilder()
    .setCustomId(`unlock_confirm_${message.author.id}_${Date.now()}`)
    .setLabel('✅ Confirm')
    .setStyle(ButtonStyle.Danger);

  const cancelButton = new ButtonBuilder()
    .setCustomId(`unlock_cancel_${message.author.id}_${Date.now()}`)
    .setLabel('❌ Cancel')
    .setStyle(ButtonStyle.Secondary);

  const row = new ActionRowBuilder().addComponents(confirmButton, cancelButton);

  const conf = await message.reply({ embeds: [confirmEmbed], components: [row] });

  const collector = conf.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 15000,
    filter: i => i.user.id === message.author.id
  });

  let confirmed = false;

  collector.on('collect', async (interaction) => {
    const isConfirm = interaction.customId.startsWith('unlock_confirm_');

    const disabledRow = new ActionRowBuilder().addComponents(
      ButtonBuilder.from(confirmButton).setDisabled(true),
      ButtonBuilder.from(cancelButton).setDisabled(true)
    );

    if (!isConfirm) {
      await interaction.update({
        embeds: [EmbedBuilder.from(confirmEmbed).setColor(COLORS.SUCCESS).setFooter({ text: "Cancelled" })],
        components: [disabledRow]
      });
      collector.stop('cancelled');
      return;
    }

    confirmed = true;
    await interaction.update({ components: [disabledRow] });
    collector.stop('confirmed');

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
  });

  collector.on('end', async (collected, reason) => {
    if (reason === 'time' && !confirmed) {
      const disabledRow = new ActionRowBuilder().addComponents(
        ButtonBuilder.from(confirmButton).setDisabled(true),
        ButtonBuilder.from(cancelButton).setDisabled(true)
      );

      await conf.edit({
        embeds: [EmbedBuilder.from(confirmEmbed).setFooter({ text: "Timed out" })],
        components: [disabledRow]
      }).catch(() => {});
    }
  });
}

// ==========================================
// EMERGENCY: CLEAR PENDING CONFIRMATIONS
// ==========================================

/**
 * Clears all pending bid confirmations
 *
 * USE CASE:
 * When bid confirmation messages are stuck (bot restarted mid-confirmation,
 * thread deleted, etc.), this command clears them so users can bid again.
 *
 * WHAT ARE PENDING CONFIRMATIONS:
 * When a user places a bid, they must confirm it by reacting to a
 * confirmation message. These are tracked in biddingState.pc. If the
 * bot restarts or the message is deleted, these can become orphaned.
 *
 * WORKFLOW:
 * 1. Check if any confirmations are pending
 * 2. If yes, show confirmation prompt with count
 * 3. If confirmed:
 *    - Attempt to delete each confirmation message
 *    - Clear pending confirmations map (biddingState.pc = {})
 *    - Save state
 * 4. Display results (cleared count, deleted message count)
 *
 * @param {Message} message - Discord message that triggered the command
 * @returns {Promise<void>}
 *
 * @example
 * // Admin command: !emergency clearbids
 * await clearPendingConfirmations(message);
 */
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
    .setFooter({ text: 'Click a button below to confirm • 15s timeout' });

  const confirmButton = new ButtonBuilder()
    .setCustomId(`clearbids_confirm_${message.author.id}_${Date.now()}`)
    .setLabel('✅ Confirm')
    .setStyle(ButtonStyle.Danger);

  const cancelButton = new ButtonBuilder()
    .setCustomId(`clearbids_cancel_${message.author.id}_${Date.now()}`)
    .setLabel('❌ Cancel')
    .setStyle(ButtonStyle.Secondary);

  const row = new ActionRowBuilder().addComponents(confirmButton, cancelButton);

  const conf = await message.reply({ embeds: [confirmEmbed], components: [row] });

  const collector = conf.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 15000,
    filter: i => i.user.id === message.author.id
  });

  let confirmed = false;

  collector.on('collect', async (interaction) => {
    const isConfirm = interaction.customId.startsWith('clearbids_confirm_');

    const disabledRow = new ActionRowBuilder().addComponents(
      ButtonBuilder.from(confirmButton).setDisabled(true),
      ButtonBuilder.from(cancelButton).setDisabled(true)
    );

    if (!isConfirm) {
      await interaction.update({
        embeds: [EmbedBuilder.from(confirmEmbed).setColor(COLORS.SUCCESS).setFooter({ text: "Cancelled" })],
        components: [disabledRow]
      });
      collector.stop('cancelled');
      return;
    }

    confirmed = true;
    await interaction.update({ components: [disabledRow] });
    collector.stop('confirmed');

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
  });

  collector.on('end', async (collected, reason) => {
    if (reason === 'time' && !confirmed) {
      const disabledRow = new ActionRowBuilder().addComponents(
        ButtonBuilder.from(confirmButton).setDisabled(true),
        ButtonBuilder.from(cancelButton).setDisabled(true)
      );

      await conf.edit({
        embeds: [EmbedBuilder.from(confirmEmbed).setFooter({ text: "Timed out" })],
        components: [disabledRow]
      }).catch(() => {});
    }
  });
}

// ==========================================
// EMERGENCY: STATE DIAGNOSTICS
// ==========================================

/**
 * Displays comprehensive diagnostics of all bot state
 *
 * USE CASE:
 * When debugging issues or checking if anything is stuck, this command
 * provides a comprehensive view of all active state across all systems.
 *
 * INFORMATION DISPLAYED:
 * - Active Attendance Spawns: Number of open attendance threads
 * - Active Sheet Columns: Number of attendance columns in use
 * - Pending Verifications: Users waiting for admin verification
 * - Pending Closures: Threads waiting to be closed
 * - Locked Points: Users with locked bidding points
 * - Pending Confirmations: Outstanding bid confirmations
 * - Bidding.js Auction: Current single auction state
 * - Auctioneering Session: Current multi-item auction state
 *
 * This is a read-only command that doesn't change any state.
 *
 * @param {Message} message - Discord message that triggered the command
 * @returns {Promise<void>}
 *
 * @example
 * // Admin command: !emergency diag
 * await stateDiagnostics(message);
 */
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

/**
 * Forces synchronization of all bot state to Google Sheets
 *
 * USE CASE:
 * When state becomes desynced between bot memory and Google Sheets
 * (e.g., manual sheet edits, bot crash during save), this command
 * forces a complete state sync.
 *
 * WHAT GETS SYNCED:
 * - Attendance state (spawns, verifications, closures)
 * - Bidding state (points, locked points, confirmations)
 *
 * This is useful for ensuring persistence after emergency operations.
 *
 * @param {Message} message - Discord message that triggered the command
 * @returns {Promise<void>}
 *
 * @example
 * // Admin command: !emergency sync
 * await forceSyncState(message);
 */
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

/**
 * Main router for all emergency commands
 *
 * Routes subcommands to appropriate handlers and displays help if needed.
 *
 * AVAILABLE SUBCOMMANDS:
 * - closeall: Force close all attendance threads
 * - close <id>: Force close specific thread
 * - endauction: Force end current auction
 * - unlock: Unlock all locked points
 * - clearbids: Clear pending bid confirmations
 * - diag/diagnostics: Show state diagnostics
 * - sync: Force sync state to sheets
 *
 * If no subcommand provided, displays help embed with all commands.
 *
 * @param {Message} message - Discord message that triggered the command
 * @param {Array<string>} args - Command arguments [subcommand, ...subcommand_args]
 * @returns {Promise<void>}
 *
 * @example
 * // Command: !emergency closeall
 * await handleEmergencyCommand(message, ["closeall"]);
 *
 * @example
 * // Command: !emergency (no args)
 * await handleEmergencyCommand(message, []);
 * // Displays help embed
 */
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

// ============================================================================
// MODULE EXPORTS
// ============================================================================

module.exports = {
  initialize,
  handleEmergencyCommand,
};
