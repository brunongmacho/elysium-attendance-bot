/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║        AUCTIONEERING SESSION LIFECYCLE - Session Management              ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Session lifecycle management: startAuctioneering, ensureThreadCapacity.
 *
 * @module modules/auctioneering/session-lifecycle
 */

const { EmbedBuilder } = require("discord.js");
const { state } = require('./state');
const { COLORS, EMOJI, TIMEOUTS } = require('./constants');
const { fetchSheetItems } = require('./persistence');
const { scheduleItemTimers } = require('./timer-mgmt');
const { auctionNextItem } = require('./item-auction');
const { finalizeSession } = require('./item-completion');

/**
 * Starts a new auction session with items from Google Sheets.
 *
 * @param {Discord.Client} client - Discord bot client
 * @param {Object} config - Bot configuration with channel IDs and webhook URL
 * @param {Discord.TextChannel} channel - Discord channel to start auction in
 * @returns {Promise<void>}
 */
async function startAuctioneering(client, config, channel) {
  if (!client || !config || !channel) {
    state.logger.error(`${EMOJI.ERROR} Invalid parameters to startAuctioneering`);
    return;
  }

  if (state.auctionState.active) {
    await channel.send(`❌ Auction already running`);
    return;
  }

  try {
    const biddingChannel = await state.discordCache.getChannel('bidding_channel_id');

    if (!biddingChannel) {
      state.logger.error(`❌ Could not fetch bidding channel with ID: ${config.bidding_channel_id}`);
      await channel.send(`❌ Bidding channel not found. Please check config.`);
      return;
    }

    channel = biddingChannel;

    state.logger.info(`✅ Using bidding channel: ${channel.name} (${channel.id}), Type: ${channel.type}`);

    if (![0, 5].includes(channel.type)) {
      state.logger.error(
        `❌ Invalid channel type (${channel.type}) for bidding channel.\n` +
        `   Channel: ${channel.name} (${channel.id})\n` +
        `   Expected: Text (0) or Announcement (5)\n` +
        `   Got: ${channel.type === 11 ? 'Thread (11)' : channel.type === 12 ? 'Private Thread (12)' : `Unknown (${channel.type})`}\n` +
        `   This means config.bidding_channel_id is pointing to the wrong channel.\n` +
        `   Please update config with the correct text channel ID.`
      );

      const errorMsg = `❌ **Configuration Error**\n\n` +
        `The configured bidding channel is not a valid text channel.\n` +
        `**Current:** ${channel.name} (Type: ${channel.type})\n` +
        `**Required:** Text or Announcement channel\n\n` +
        `Please update \`config.bidding_channel_id\` with the correct channel ID.`;

      await channel.send(errorMsg).catch(state.errorHandler.safeCatch('send bidding channel config error'));
      return;
    }
  } catch (err) {
    state.logger.error(`❌ Failed to fetch bidding channel:`, err);
    await channel.send(`❌ Failed to fetch bidding channel: ${err.message}`).catch(state.errorHandler.safeCatch('send fetch bidding channel error'));
    return;
  }

  // Load points cache
  try {
    const pointsData = await state.sheetAPI.call('getBiddingPoints');
    const members = pointsData.members || pointsData.data?.members || [];
    const points = pointsData.points || pointsData.data?.points || {};

    if (members.length === 0 && Object.keys(points).length === 0) {
      await channel.send(`❌ No points data received`);
      return;
    }

    const pointsMap = Object.keys(points).length > 0 ? points : members.reduce((acc, member) => {
      const name = member?.username?.trim();
      if (!name) return acc;
      acc[name] = Number(member?.pointsLeft) || 0;
      return acc;
    }, {});

    const biddingState = state.biddingModule.getBiddingState();
    biddingState.cp = new state.PointsCache(pointsMap);
    biddingState.ct = Date.now();
    state.biddingModule.saveBiddingState();

    state.logger.info(`✅ Loaded ${biddingState.cp.size()} members' points`);
  } catch (err) {
    state.logger.error(`❌ Failed to load points:`, err);
    await channel.send(`❌ Failed to load points: ${err.message}`);
    return;
  }

  // Fetch sheet items with fallback cache
  const sheetItems = await fetchSheetItems();

  if (sheetItems.length === 0) {
    const status = state.auctionCache.getStatus();

    await channel.send(
      `❌ **No auction items available**\n\n` +
      `**Status:**\n` +
      `• Google Sheets API: ${status.circuit.state === 'OPEN' ? '🔴 DOWN' : '🟢 UP'}\n` +
      `• Cached Items: ${status.cache.itemCount}\n` +
      `• Cache Age: ${status.cache.age ? Math.floor(status.cache.age / 1000 / 60) + ' minutes' : 'Never cached'}\n\n` +
      `**Actions:**\n` +
      `• Wait for Google Sheets to recover\n` +
      `• Check BiddingItems sheet has items\n` +
      `• Use \`!auctionstate\` to check system status`
    );
    return;
  }

  // Filter out items that already have winners
  const availableItems = sheetItems.filter((item) => {
    const winner = item.winner;
    const hasWinner =
      winner !== null &&
      winner !== undefined &&
      winner !== "" &&
      winner.toString().trim() !== "";

    if (hasWinner) {
      state.logger.info(`⭐ Skipping "${item.item}" - already has winner: ${winner}`);
    }
    return !hasWinner;
  });

  if (availableItems.length === 0) {
    await channel.send(
      `❌ No available items to auction.\n\n` +
        `All items in BiddingItems sheet already have winners.\n` +
        `Please add new items or clear the Winner column (Column D) for items you want to re-auction.`
    );
    return;
  }

  state.logger.info(
    `✅ Filtered items: ${availableItems.length}/${sheetItems.length} available (${sheetItems.length - availableItems.length} already have winners)`
  );

  // Warn about large datasets
  const LARGE_DATASET_WARNING = 1000;
  const CRITICAL_DATASET_SIZE = 5000;
  if (availableItems.length >= CRITICAL_DATASET_SIZE) {
    state.logger.error(`${EMOJI.ERROR} CRITICAL: ${availableItems.length} items exceeds safe limit (${CRITICAL_DATASET_SIZE})!`);
    await channel.send(
      `${EMOJI.ERROR} **Too many items!** (${availableItems.length})\n` +
      `The bot can safely handle up to ${CRITICAL_DATASET_SIZE} items.\n` +
      `Please auction items in batches or archive completed items.`
    );
    return;
  } else if (availableItems.length >= LARGE_DATASET_WARNING) {
    state.logger.warn(`${EMOJI.WARNING} Large dataset: ${availableItems.length} items (may impact performance)`);
    await channel.send(
      `${EMOJI.WARNING} **Large auction session** (${availableItems.length} items)\n` +
      `Consider splitting into multiple sessions for better performance.`
    );
  }

  // Treat all items as ONE session
  const allItems = [];

  availableItems.forEach((item) => {
    const qty = parseInt(item.quantity) || 1;
    for (let q = 0; q < qty; q++) {
      allItems.push({
        ...item,
        quantity: 1,
        batchNumber: qty > 1 ? q + 1 : null,
        batchTotal: qty > 1 ? qty : null,
        source: "GoogleSheet",
        bossName: (item.boss || "").split(" ")[0] || "Unknown",
      });
    }
  });

  if (allItems.length === 0) {
    await channel.send(`❌ No items to auction`);
    return;
  }

  // Initialize auction state
  state.auctionState.active = true;
  state.auctionState.sessionFinalized = false;
  state.auctionState.sessionItems = allItems;
  state.auctionState.currentItemIndex = 0;

  // Show preview
  const previewList = allItems
    .slice(0, 10)
    .map((item, i) => {
      return `${i + 1}. **${item.item}** - ${item.startPrice}pts • ${item.duration}m${item.bossName !== "Unknown" ? ` (${item.bossName})` : ""}`;
    })
    .join("\n");

  const moreItems = allItems.length > 10 ? `\n\n*...+${allItems.length - 10} more items*` : "";

  const countdownEmbed = new EmbedBuilder()
    .setColor(COLORS.AUCTION)
    .setTitle(`${EMOJI.FIRE} Auctioneering Started!`)
    .setDescription(
      `**${allItems.length} item(s)** queued for auction\n\n${previewList}${moreItems}\n\n` +
        `✅ **No attendance required** - All guild members can bid!`
    )
    .setFooter({ text: "Starting first item in 30s..." })
    .setTimestamp();

  const feedbackMsg = await channel.send({
    content: "@everyone",
    embeds: [countdownEmbed],
  });

  // Clear any existing countdown timer before creating new one
  if (state.auctionState.timers.sessionStartCountdown) {
    clearInterval(state.auctionState.timers.sessionStartCountdown);
    delete state.auctionState.timers.sessionStartCountdown;
  }

  // Countdown feedback every 5 seconds
  let countdown = 30;
  const countdownInterval = setInterval(async () => {
    try {
      countdown -= 5;
      if (countdown > 0) {
        countdownEmbed
          .setTitle(`${EMOJI.FIRE} Auctioneering Started! - Starting in ${countdown}s`)
          .setFooter({
            text: `Starting first item in ${countdown}s...`,
          });
        await feedbackMsg
          .edit({ embeds: [countdownEmbed] })
          .catch((err) =>
            state.logger.warn(`⚠️ Failed to update countdown:`, err.message)
          );
      }
    } catch (error) {
      state.logger.error("❌ Error in countdown interval:", error.message);
    }
  }, 5000);

  state.auctionState.timers.sessionStartCountdown = countdownInterval;

  state.auctionState.timers.sessionStart = setTimeout(async () => {
    clearInterval(state.auctionState.timers.sessionStartCountdown);
    delete state.auctionState.timers.sessionStartCountdown;
    try {
      const biddingChannel = await state.discordCache.getChannel('bidding_channel_id');

      state.logger.info(
        `✅ Using bidding channel: ${biddingChannel.name} (${biddingChannel.id})`
      );
      await auctionNextItem(client, config, biddingChannel);
    } catch (err) {
      state.logger.error("❌ Failed to fetch bidding channel:", err);

      // Cleanup on error
      state.auctionState.active = false;
      clearAllTimers();
      if (
        state.biddingModule &&
        typeof state.biddingModule.stopCacheAutoRefresh === "function"
      ) {
        state.biddingModule.stopCacheAutoRefresh();
      }

      await channel
        .send(
          `❌ Failed to start auction. Please try again or contact an admin.`
        )
        .catch(state.errorHandler.safeCatch('send auction start failure message'));
    }
  }, 30000);
}

/**
 * Clears all active timers in the auction state.
 */
function clearAllTimers() {
  Object.values(state.auctionState.timers).forEach((t) => {
    clearTimeout(t);
    clearInterval(t);
  });
  state.auctionState.timers = {};
}

/**
 * Ensures Discord thread capacity before creating a new auction thread.
 *
 * @param {Discord.TextChannel} channel - Channel to check thread capacity
 * @returns {Promise<void>}
 * @throws {Error} If thread limit reached and cleanup didn't help
 */
async function ensureThreadCapacity(channel) {
  try {
    const activeThreads = await channel.threads.fetchActive();
    const activeCount = activeThreads.threads.size;

    const THREAD_LIMIT = 50;
    const THREAD_WARNING = 40;

    state.logger.info(`📊 Active threads in ${channel.name}: ${activeCount}/${THREAD_LIMIT}`);

    if (activeCount >= THREAD_WARNING) {
      state.logger.info(`⚠️ Approaching thread limit (${activeCount}/${THREAD_LIMIT}) - cleaning up...`);

      let archivedCount = 0;
      const threadsToArchive = [];

      for (const [id, thread] of activeThreads.threads) {
        const isAuctionThread = thread.name.includes(' | ');
        const isLocked = thread.locked;
        const age = Date.now() - thread.createdTimestamp;
        const isOld = age > 60 * 60 * 1000;

        if (isAuctionThread && (isLocked || isOld)) {
          threadsToArchive.push(thread);
        }
      }

      for (const thread of threadsToArchive) {
        try {
          if (!thread.archived) {
            await thread.setArchived(true, 'Auto-cleanup for thread capacity');
            archivedCount++;
            state.logger.info(`📦 Auto-archived thread: ${thread.name}`);

            if (archivedCount % 5 === 0) {
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
          }
        } catch (err) {
          state.logger.warn(`⚠️ Failed to archive thread ${thread.name}:`, err.message);
        }
      }

      state.logger.info(`✅ Cleaned up ${archivedCount} old auction threads`);

      const activeAfterCleanup = await channel.threads.fetchActive();
      const newCount = activeAfterCleanup.threads.size;

      state.logger.info(`📊 After cleanup: ${newCount}/${THREAD_LIMIT} active threads`);

      if (newCount >= THREAD_LIMIT - 2) {
        throw new Error(
          `Thread limit reached (${newCount}/${THREAD_LIMIT})! ` +
          `Please manually archive old threads in ${channel.name}.`
        );
      }
    }
  } catch (err) {
    state.logger.error(`❌ Thread capacity check failed:`, err.message);

    if (err.message.includes('Thread limit reached')) {
      throw err;
    }
  }
}

module.exports = {
  startAuctioneering,
  ensureThreadCapacity,
  clearAllTimers,
};
