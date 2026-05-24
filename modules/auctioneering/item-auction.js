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
 * Groups consecutive same-name items into batches.
 * @param {Array} items - Array of item objects with .item name property
 * @returns {Array} Batches of items: [{name: string, items: []}]
 */
function groupItemsByName(items) {
  const batches = [];
  let current = null;
  for (const item of items) {
    if (!current || current.name !== item.item) {
      current = { name: item.item, items: [] };
      batches.push(current);
    }
    current.items.push(item);
  }
  return batches;
}

/**
 * Auctions the next item(s) in the session queue.
 * Same-name items are batched and run in parallel threads.
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
    // Lazy require to break circular dependency
    const { finalizeSession } = require('./item-completion');
    await finalizeSession(client, config, channel);
    return;
  }

  // Get the current batch of same-name items
  const batches = groupItemsByName(state.auctionState.sessionItems.slice(state.auctionState.currentItemIndex));
  const batch = batches[0];
  const batchSize = batch.items.length;
  state.auctionState.currentBatchSize = batchSize;

  // Send single preview per batch
  const previewText = batchSize > 1
    ? `**${batchSize}x ${batch.name}** auctions starting in 30 seconds!`
    : `**${batch.name}** auction starting in 30 seconds!`;

  const remainingItems = state.auctionState.sessionItems.length - state.auctionState.currentItemIndex;
  const previewEmbed = new EmbedBuilder()
    .setColor(COLORS.AUCTION)
    .setTitle(`${EMOJI.CLOCK} NEXT ITEM COMING UP`)
    .setDescription(previewText)
    .addFields(
      {
        name: `${EMOJI.BID} Starting Price`,
        value: `${batch.items[0].startPrice || 0}pts`,
        inline: true,
      },
      {
        name: `${EMOJI.LIST} Quantity`,
        value: `${batchSize}x`,
        inline: true,
      },
      {
        name: `${EMOJI.LIST} Items Left`,
        value: `${remainingItems} remaining`,
        inline: true,
      }
    );

  if (batch.items[0].bossName && batch.items[0].bossName !== "Unknown") {
    previewEmbed.addFields({
      name: `${EMOJI.TROPHY} Boss`,
      value: `${batch.items[0].bossName}`,
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

  state.logger.info(`${EMOJI.CLOCK} 30-second preview for batch: ${batchSize}x ${batch.name}`);

  // Wait 30 seconds before starting
  await new Promise((resolve) => setTimeout(resolve, TIMEOUTS.PREVIEW_DELAY));

  // Check thread capacity before creating threads
  const { ensureThreadCapacity } = require('./session-lifecycle');
  try {
    await ensureThreadCapacity(channel);
  } catch (err) {
    state.logger.error("❌ Thread capacity check failed:", err);
    state.auctionState.active = false;
    await channel.send(`❌ Cannot start auction - ${err.message}`);
    return;
  }

  // Initialize threadItems map and counter
  state.auctionState.threadItems = state.auctionState.threadItems || {};
  state.auctionState.activeThreadCount = batchSize;

  // Create threads for ALL items in the batch in parallel
  const threads = [];
  let threadCreationFailed = false;

  for (let i = 0; i < batchSize; i++) {
    const item = batch.items[i];
    const displayName = `${item.item} #${i + 1}`;

    const threadName = `${displayName} | ${item.startPrice || 0}pts${item.bossName && item.bossName !== "Unknown" ? ` | ${item.bossName}` : ""}`;

    let auctionThread = null;

    try {
      if (channel.threads && typeof channel.threads.create === "function") {
        auctionThread = await channel.threads.create({
          name: threadName,
          autoArchiveDuration: config.auto_archive_minutes || 60,
          reason: `Auction for ${item.item}`,
        });
      } else {
        const starterMsg = await channel.send({
          content: `@everyone`,
          embeds: [
            new EmbedBuilder()
              .setColor(COLORS.AUCTION)
              .setTitle(`${EMOJI.AUCTION} New Auction Started`)
              .setDescription(
                `**Item:** ${displayName}\n**Start Price:** ${item.startPrice || 0} pts\n**Duration:** ${item.duration || 2} min`
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
          throw new Error("Neither channel.threads.create nor message.startThread are available.");
        }
      }

      if (!auctionThread) {
        throw new Error("Failed to create auction thread (unknown reason).");
      }

      // Initialize item state
      item.curBid = item.startPrice || 0;
      item.curWin = null;
      item.curWinId = null;
      item.bids = [];
      item.extCnt = 0;

      const duration = (item.duration || 2) * 60 * 1000;
      item.endTime = Date.now() + duration;
      item.thread = auctionThread;
      item.threadId = auctionThread.id;

      // Set dummy session for bidding.js compatibility
      item.currentSession = {
        bossName: item.bossName || "Open",
        bossKey: "open",
        attendees: [],
      };

      // Store in threadItems map
      state.auctionState.threadItems[auctionThread.id] = item;

      threads.push(auctionThread);

      // Send "Auction Started" to thread
      await auctionThread.send({
        content: `@everyone`,
        embeds: [
          new EmbedBuilder()
            .setColor(COLORS.AUCTION)
            .setTitle(`${EMOJI.AUCTION} Auction Started: ${displayName}`)
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

      // Schedule per-thread timers
      scheduleItemTimers(client, config, auctionThread);

      state.logger.info(`${EMOJI.SUCCESS} Auction started for: ${displayName} (${duration/60000} min)`);
    } catch (err) {
      state.logger.error(`❌ Failed to create thread for ${displayName}:`, err);
      threadCreationFailed = true;

      // Cleanup already created threads
      for (const t of threads) {
        try {
          await t.setLocked(true, "Auction cancelled due to thread creation failure");
          await t.setArchived(true, "Auction cancelled");
        } catch (_) { /* ignore */ }
      }

      state.auctionState.threadItems = {};
      state.auctionState.activeThreadCount = 0;
      state.auctionState.active = false;

      // Clear locked points
      try {
        if (!state.biddingModule) {
          state.biddingModule = require("../../bidding.js");
        }
        const biddingState = state.biddingModule.getBiddingState();
        biddingState.lp = {};
        state.biddingModule.saveBiddingState();
      } catch (_) { /* ignore */ }

      await channel.send(`❌ Failed to start auction for **${displayName}**. Auction cancelled.`);
      return;
    }
  }

  // Set currentItem to null (using threadItems instead)
  state.auctionState.currentItem = null;
}

module.exports = {
  auctionNextItem,
};
