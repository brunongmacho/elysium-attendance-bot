/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║          AUCTIONEERING ITEM AUCTION - Item Auction Management            ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Item auction management: auctionNextItem with thread creation.
 *
 * @module modules/auctioneering/item-auction
 */

const { EmbedBuilder } = require("discord.js");
const { state } = require('./state');
const { COLORS, EMOJI, TIMEOUTS } = require('./constants');
const { saveAuctionState } = require('./persistence');
// Lazy-require session-lifecycle and timer-mgmt to avoid circular dependency
const { scheduleItemTimers } = require('./timer-mgmt');
// Lazy-require item-completion to avoid circular dependency at load time

/**
 * Auctions the next item in the session queue.
 *
 * @param {Discord.Client} client - Discord bot client
 * @param {Object} config - Bot configuration
 * @param {Discord.TextChannel} channel - Bidding channel for announcements
 * @returns {Promise<void>}
 */
async function auctionNextItem(client, config, channel) {
  // Ensure we're using a proper guild text channel
  if (![0, 5].includes(channel.type)) {
    state.logger.warn(
      `⚠️ Channel type ${channel.type} invalid – refetching bidding channel...`
    );
    try {
      channel = await state.discordCache.getChannel('bidding_channel_id');
      state.logger.info(
        `✅ Corrected to bidding channel: ${channel.name} (${channel.id})`
      );
    } catch (err) {
      state.logger.error("❌ Could not refetch bidding channel:", err);
      return;
    }
  }

  // Ensure channel reference is valid
  if (!channel) {
    state.logger.warn("⚠️ Channel is undefined, attempting to refetch...");
    try {
      channel = await state.discordCache.getChannel('bidding_channel_id');
      if (!channel) {
        state.logger.error("❌ Failed to refetch bidding channel.");
        return;
      }
    } catch (err) {
      state.logger.error("❌ Error refetching bidding channel:", err);
      return;
    }
  }

  // Check if all items are done
  if (
    !state.auctionState.sessionItems ||
    state.auctionState.currentItemIndex >= state.auctionState.sessionItems.length
  ) {
    await channel.send(`✅ All items completed`);
    state.auctionState.active = false;
    // Lazy require to break circular dependency
    const { finalizeSession } = require('./item-completion');
    await finalizeSession(client, config, channel);
    return;
  }

  const item = state.auctionState.sessionItems[state.auctionState.currentItemIndex];
  if (!item) {
    state.logger.error("❌ No item at current index, finalizing...");
    const { finalizeSession } = require('./item-completion');
    await finalizeSession(client, config, channel);
    return;
  }

  // 30-SECOND PREVIEW BEFORE ITEM STARTS
  const remainingItems =
    state.auctionState.sessionItems.length - state.auctionState.currentItemIndex;
  const previewEmbed = new EmbedBuilder()
    .setColor(COLORS.AUCTION)
    .setTitle(`${EMOJI.CLOCK} NEXT ITEM COMING UP`)
    .setDescription(`**${item.item}**`)
    .addFields(
      {
        name: `${EMOJI.BID} Starting Bid`,
        value: `${item.startPrice || 0} points`,
        inline: true,
      },
      {
        name: `${EMOJI.TIME} Duration`,
        value: `${item.duration || 2} minutes`,
        inline: true,
      },
      {
        name: `${EMOJI.LIST} Items Left`,
        value: `${remainingItems} remaining`,
        inline: true,
      }
    );

  if (item.bossName && item.bossName !== "Unknown") {
    previewEmbed.addFields({
      name: `${EMOJI.TROPHY} Boss`,
      value: `${item.bossName}`,
      inline: true,
    });
  }

  previewEmbed
    .setFooter({ text: "Auction starts in 30 seconds" })
    .setTimestamp();

  await channel.send({
    content: "@everyone",
    embeds: [previewEmbed],
  });

  state.logger.info(`${EMOJI.CLOCK} 30-second preview for: ${item.item}`);

  // Wait 30 seconds before starting
  await new Promise((resolve) => setTimeout(resolve, TIMEOUTS.PREVIEW_DELAY));

  // START THE ACTUAL AUCTION
  state.auctionState.currentItem = item;
  state.auctionState.currentItem.status = "active";
  state.auctionState.currentItem.bids = [];

  const threadName = `${item.item} | ${item.startPrice || 0}pts${
    item.bossName !== "Unknown" ? ` | ${item.bossName}` : ""
  }`;

  let auctionThread = null;

  try {
    // Check thread limit before creating
    const { ensureThreadCapacity } = require('./session-lifecycle');
    await ensureThreadCapacity(channel);

    // Try normal thread creation first
    if (channel.threads && typeof channel.threads.create === "function") {
      auctionThread = await channel.threads.create({
        name: threadName,
        autoArchiveDuration: config.auto_archive_minutes || 60,
        reason: `Auction for ${item.item}`,
      });
    } else {
      // Fallback: send starter message and create thread from it
      state.logger.warn(
        "⚠️ channel.threads.create not available – using message.startThread() fallback"
      );
      const starterMsg = await channel.send({
        content: `@everyone`,
        embeds: [
          new EmbedBuilder()
            .setColor(COLORS.AUCTION)
            .setTitle(`${EMOJI.AUCTION} New Auction Started`)
            .setDescription(
              `**Item:** ${item.item}\n**Start Price:** ${item.startPrice || 0} pts\n**Duration:** ${item.duration || 2} min`
            )
            .setFooter({
              text: `Thread created per item • ${state.getTimestamp()}`,
            }),
        ],
      });

      if (starterMsg && typeof starterMsg.startThread === "function") {
        auctionThread = await starterMsg.startThread({
          name: threadName,
          autoArchiveDuration: config.auto_archive_minutes || 60,
          reason: `Auction for ${item.item}`,
        });
      } else {
        throw new Error(
          "Neither channel.threads.create nor message.startThread are available."
        );
      }
    }

    if (!auctionThread) {
      throw new Error("Failed to create auction thread (unknown reason).");
    }

    // Send embed inside the thread (only if we used threads.create)
    if (channel.threads && typeof channel.threads.create === "function") {
      await auctionThread.send({
        content: `@everyone`,
        embeds: [
          new EmbedBuilder()
            .setColor(COLORS.AUCTION)
            .setTitle(`${EMOJI.AUCTION} New Auction Started`)
            .setDescription(
              `**Item:** ${item.item}\n**Start Price:** ${item.startPrice || 0} pts\n**Duration:** ${item.duration || 2} min\n\n✅ **All guild members can bid!**`
            )
            .setFooter({
              text: `Thread created per item • ${state.getTimestamp()}`,
            }),
        ],
      });
    }
  } catch (err) {
    state.logger.error("❌ Failed to create auction thread:", err);
    state.logger.error(
      "→ Check: Bot needs 'Create Public Threads' & 'Send Messages in Threads' in the bidding channel."
    );

    // COMPREHENSIVE cleanup to prevent auction from being stuck
    // Clear all timers first
    const { clearAllTimers } = require('./session-lifecycle');
    clearAllTimers();

    // Clear current item and deactivate
    state.auctionState.currentItem = null;
    state.auctionState.active = false;

    // Clear locked points from failed auction
    try {
      if (!state.biddingModule) {
        state.biddingModule = require("../../bidding.js");
      }
      const biddingState = state.biddingModule.getBiddingState();
      biddingState.lp = {};
      state.biddingModule.saveBiddingState();
      state.logger.info(`${EMOJI.SUCCESS} Cleared locked points after thread creation failure`);
    } catch (unlockErr) {
      state.logger.error(`${EMOJI.ERROR} Failed to clear locked points:`, unlockErr);
    }

    // Save state
    try {
      if (state.cfg?.sheet_webhook_url) {
        await saveAuctionState(state.cfg.sheet_webhook_url);
      }
    } catch (_) {
      // ignore; best-effort
    }

    try {
      await channel.send(
        `❌ Unable to create thread for **${item.item}**. Thread creation failed. Auction cancelled.`
      );
    } catch (e) {
      state.logger.error("❌ Also failed to send fallback message:", e);
    }
    return;
  }

  // Set currentItem properly BEFORE starting the auction
  state.auctionState.currentItem = item;
  item.status = "active";
  item.auctionStartTime = state.getTimestamp();

  // Initialize item auction state
  item.curBid = item.startPrice || 0;
  item.curWin = null;
  item.curWinId = null;
  item.bids = [];
  item.extCnt = 0;

  const duration = (item.duration || 2) * 60 * 1000;
  item.endTime = Date.now() + duration;

  // Store thread reference for later use
  item.thread = auctionThread;
  item.threadId = auctionThread.id;

  // Set dummy session for bidding.js compatibility
  item.currentSession = {
    bossName: item.bossName || "Open",
    bossKey: "open",
    attendees: [],
  };

  // Start bidding in this thread - send announcement
  try {
    await auctionThread.send({
      content: `@everyone`,
      embeds: [
        new EmbedBuilder()
          .setColor(COLORS.AUCTION)
          .setTitle(`${EMOJI.AUCTION} Auction Started: ${item.item}`)
          .setDescription(
            `**Boss:** ${item.bossName !== "Unknown" ? item.bossName : "OPEN"}\n` +
              `**Starting Price:** ${item.startPrice || 0} pts\n` +
              `**Duration:** ${item.duration || 2} min\n\n` +
              `Use \`!bid <amount>\` to place your bids.\n` +
              `✅ **All guild members can bid!**`
          )
          .setFooter({ text: "Auction open — place your bids now!" })
          .setTimestamp(),
      ],
    });

    // Schedule the auction end timers
    scheduleItemTimers(client, config, auctionThread);

    state.logger.info(
      `${EMOJI.SUCCESS} Auction started for: ${item.item} (${duration/60000} min)`
    );
  } catch (err) {
    state.logger.error("❌ Error starting item auction:", err);
    await channel.send(`❌ Failed to start auction for ${item.item}: ${err.message}`);

    state.auctionState.currentItem = null;
    return;
  }
}

module.exports = {
  auctionNextItem,
};
