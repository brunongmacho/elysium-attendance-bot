/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║       AUCTIONEERING ITEM COMPLETION - Item Completion & Results          ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Item completion: itemEnd, finalizeSession, buildCombinedResults.
 *
 * @module modules/auctioneering/item-completion
 */

const { EmbedBuilder } = require("discord.js");
const { state } = require('./state');
const { COLORS, EMOJI } = require('./constants');
const { createPaginatedEmbeds } = require('./utilities');
const { logAuctionResult, saveAuctionState } = require('./persistence');
const { safelyCleanupTimers } = require('./timer-mgmt');
const { normalizeUsername } = require("../../utils/common");
const { getCurrentTimestamp } = require("../../utils/common");

/**
 * Ends the current auction item and processes the winner.
 *
 * @param {Discord.Client} client - Discord bot client
 * @param {Object} config - Bot configuration
 * @param {Discord.ThreadChannel} channel - Auction thread channel
 * @returns {Promise<void>}
 */
async function itemEnd(client, config, channel) {
  if (!client || !config || !channel) {
    state.logger.error(`${EMOJI.ERROR} Invalid parameters to itemEnd`);
    return;
  }

  if (!state.auctionState.active) return;

  // Resolve item from threadItems or currentItem
  const threadId = channel?.id;
  const item = state.auctionState.threadItems?.[threadId] || state.auctionState.currentItem;
  if (!item) return;

  item.status = "ended";

  // Clear timers to avoid duplicates (use prefixed keys for thread items)
  safelyCleanupTimers(threadId && state.auctionState.threadItems?.[threadId] ? threadId : null, "itemEnd", "go1", "go2", "go3");

  const timestamp = state.getTimestamp();
  const totalBids = item.bids ? item.bids.length : 0;
  const bidCount = item.curWin
    ? item.bids.filter((b) => normalizeUsername(b.user) === normalizeUsername(item.curWin)).length
    : 0;

  // Record end time
  const auctionEndTime = getCurrentTimestamp();
  const endTimeStr = `${auctionEndTime.date} ${auctionEndTime.time}`;
  item.auctionEndTime = endTimeStr;

  if (item.curWin) {
    // ITEM SOLD
    try {
      await channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(COLORS.AUCTION)
            .setTitle(`${EMOJI.AUCTION} SOLD!`)
            .setDescription(`**${item.item}** sold!`)
            .addFields(
              {
                name: `${EMOJI.FIRE} Winner`,
                value: `<@${item.curWinId}>`,
                inline: true,
              },
              {
                name: `${EMOJI.BID} Price`,
                value: `${item.curBid} pts`,
                inline: true,
              },
              {
                name: `${EMOJI.INFO} Source`,
                value: "📊 Google Sheet",
                inline: true,
              }
            )
            .setFooter({ text: `${timestamp}` })
            .setTimestamp(),
        ],
      });
    } catch (err) {
      state.logger.error(`${EMOJI.ERROR} Failed to send SOLD message:`, err);
    }

    // Log result to sheet/database
    try {
      await logAuctionResult(
        item.source === "GoogleSheet" ? item.sheetIndex : -1,
        item.curWin,
        item.curBid,
        totalBids,
        bidCount,
        item.source,
        timestamp,
        item.curWinId,
        item._id
      );
    } catch (err) {
      state.logger.error(`${EMOJI.ERROR} Failed to log auction result:`, err);
    }

    // AUTO-UPDATE LEARNING SYSTEM
    try {
      if (state.intelligenceEngine && state.intelligenceEngine.learningSystem) {
        const updated = await state.intelligenceEngine.learningSystem.updatePredictionAccuracy(
          'price_prediction',
          item.item,
          item.curBid
        );

        if (updated) {
          state.logger.info(`🧠 [LEARNING] Auto-updated prediction accuracy for "${item.item}" (actual: ${item.curBid}pts)`);

          try {
            const adminChannel = await state.discordCache?.getChannel('admin_logs_channel_id');
            if (adminChannel) {
              await adminChannel.send(
                `🧠 **Bot Learning Update**\n` +
                `✅ Updated prediction accuracy for **${item.item}**\n` +
                `Actual sale price: ${item.curBid}pts\n` +
                `Bot is getting smarter! Check \`!learningmetrics\` to see accuracy.`
              );
            }
          } catch (notifyErr) {
            state.logger.info(`[LEARNING] Could not send admin notification: ${notifyErr.message}`);
          }
        } else {
          state.logger.info(`[LEARNING] No pending prediction found for "${item.item}" (may not have been predicted)`);
        }
      }
    } catch (learnErr) {
      state.logger.error(`${EMOJI.ERROR} Failed to update learning system:`, learnErr);
    }

    // Update item in queue array with winner info
    const sessionIdx = state.auctionState.threadItems?.[threadId]
      ? state.auctionState.sessionItems.findIndex(si => si === item)
      : state.auctionState.currentItemIndex;
    const sessionItem = state.auctionState.sessionItems[sessionIdx];
    if (sessionItem) {
      sessionItem.winner = item.curWin;
      sessionItem.winnerId = item.curWinId;
      sessionItem.amount = item.curBid;
      sessionItem.timestamp = timestamp;
      sessionItem.auctionEndTime = endTimeStr;
    }
  } else {
    // NO WINNER
    try {
      await channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(COLORS.INFO)
            .setTitle(`${EMOJI.ERROR} NO BIDS`)
            .setDescription(
              `**${item.item}** had no bids (will not be recorded).`
            )
            .addFields({
              name: `${EMOJI.INFO} Note`,
              value: "Item remains in BiddingItems sheet for future auctions.",
              inline: false,
            }),
        ],
      });
    } catch (err) {
      state.logger.error(`${EMOJI.ERROR} Failed to send NO BIDS message:`, err);
    }
  }

  // Lock and archive the thread after the auction ends
  try {
    if (channel && (channel.type === 11 || channel.type === 12)) {
      const refreshedThread = await channel.fetch().catch(() => null);
      if (!refreshedThread) {
        state.logger.warn(
          `⚠️ Thread ${channel.id} no longer exists, skipping lock/archive`
        );
      } else {
        if (typeof refreshedThread.setLocked === "function") {
          await refreshedThread
            .setLocked(true, "Auction ended")
            .catch((err) => {
              state.logger.warn(
                `⚠️ Failed to lock thread ${refreshedThread.id}:`,
                err.message
              );
            });
          state.logger.info(`🔒 Locked thread for ${item.item}`);
        }

        await new Promise((resolve) => setTimeout(resolve, 500));

        if (typeof refreshedThread.setArchived === "function") {
          await refreshedThread
            .setArchived(true, "Auction ended")
            .catch((err) => {
              state.logger.warn(
                `⚠️ Failed to archive thread ${refreshedThread.id}:`,
                err.message
              );
            });
          state.logger.info(`📦 Archived thread for ${item.item}`);
        }
      }
    }
  } catch (err) {
    state.logger.warn(`⚠️ Error locking/archiving thread:`, err.message);
  }

  // If this was a parallel thread item, remove from threadItems
  if (threadId && state.auctionState.threadItems?.[threadId]) {
    delete state.auctionState.threadItems[threadId];

    state.auctionState.activeThreadCount--;

    if (state.auctionState.activeThreadCount > 0) {
      // More parallel threads still running — return without advancing currentItemIndex
      state.logger.info(`⏳ ${state.auctionState.activeThreadCount} parallel thread(s) still running for this batch...`);
      return;
    }

    // All threads in batch complete — advance by batch size
    state.auctionState.currentItemIndex += state.auctionState.currentBatchSize || 1;
    state.auctionState.currentItem = null;

    // Get the parent bidding channel
    let biddingChannel = channel;
    if (channel && (channel.type === 11 || channel.type === 12) && channel.parent) {
      biddingChannel = channel.parent;
    }

    // Check if there are more items
    if (state.auctionState.currentItemIndex < state.auctionState.sessionItems.length) {
      state.logger.info(`⏭️ Moving to next item...`);
      const { auctionNextItem } = require('./item-auction');
      await auctionNextItem(client, config, biddingChannel);
    } else {
      state.logger.info(`🎉 All items completed. Finalizing session.`);
      const { finalizeSession } = require('./item-completion');
      await finalizeSession(client, config, biddingChannel);
    }
    return;
  }

  // Move to next item (single-item session path)
  state.auctionState.currentItemIndex++;
  state.auctionState.currentItem = null;

  // Get the parent bidding channel for next auction
  let biddingChannel = channel;
  if (
    channel &&
    (channel.type === 11 || channel.type === 12) &&
    channel.parent
  ) {
    biddingChannel = channel.parent;
  }

  // Just check if there are more items
  if (state.auctionState.currentItemIndex < state.auctionState.sessionItems.length) {
    state.logger.info(`⏭️ Moving to next item...`);
    // Lazy require to break circular dependency
    const { auctionNextItem } = require('./item-auction');
    await auctionNextItem(client, config, biddingChannel);
  } else {
    state.logger.info(`🎉 All items completed. Finalizing session.`);
    const { finalizeSession } = require('./item-completion');
    await finalizeSession(client, config, biddingChannel);
  }
}

/**
 * Finalizes the auction session after all items are completed.
 *
 * @param {Discord.Client} client - Discord bot client
 * @param {Object} config - Bot configuration
 * @param {Discord.TextChannel} channel - Bidding channel
 * @returns {Promise<void>}
 */
async function finalizeSession(client, config, channel) {
  if (!client || !config || !channel) {
    state.logger.error(`${EMOJI.ERROR} Invalid parameters to finalizeSession`);
    return;
  }

  if (!state.auctionState.active) return;

  try {
    state.auctionState.active = false;
    clearAllTimers();

    // Stop cache auto-refresh timer from bidding module
    if (
      state.biddingModule &&
      typeof state.biddingModule.stopCacheAutoRefresh === "function"
    ) {
      state.biddingModule.stopCacheAutoRefresh();
    }

    // Get only items that were sold (have winners)
    const soldItems = state.auctionState.sessionItems.filter((s) => s.winner);

    const summary = soldItems
      .map((s, i) => `${i + 1}. **${s.item}** 📊: ${s.winner} - ${s.amount}pts`)
      .join("\n");

    // Create multiple embeds instead of truncating
    const soldItemStrings = soldItems.length > 0
      ? soldItems.map((s, i) => `${i + 1}. **${s.item}**: ${s.winner} - ${s.amount}pts`)
      : ["No items sold"];

    const summaryEmbeds = createPaginatedEmbeds(
      `${EMOJI.SUCCESS} Auction Session Complete - ${soldItems.length} Items`,
      soldItemStrings,
      15,
      { color: COLORS.SUCCESS, footer: `Total: ${soldItems.length} items sold` }
    );

    summaryEmbeds[0].setDescription(`**${soldItems.length}** item(s) sold`);

    for (const embed of summaryEmbeds) {
      await channel.send({ embeds: [embed] });
    }

    // Build combined results for tally
    const combinedResults = await buildCombinedResults(config);

    // Skip submission if no results were built
    if (combinedResults.length === 0) {
      state.logger.warn(`${EMOJI.WARNING} No combined results available - skipping bidding results submission`);
    } else {
      // Submit combined results
      const submitPayload = {
        action: "submitBiddingResults",
        results: combinedResults,
      };

      try {
      if (!state.postToSheetFunc) {
        state.logger.error(
          `${EMOJI.ERROR} postToSheet not initialized - cannot submit session results`
        );
        state.logger.info(
          `${EMOJI.WARNING} Session results (for manual recovery):`,
          JSON.stringify(submitPayload, null, 2)
        );
      } else {
        const { action, ...data } = submitPayload;
        const result = await state.sheetAPI.call(action, data);
        if (result.status !== "ok") {
          throw new Error(result.message || "Unknown error from sheets");
        }

        state.logger.info(`${EMOJI.SUCCESS} Session results submitted successfully`);

        // Display tally summary in bidding channel
        const winnersWithSpending = combinedResults.filter(
          (r) => r.totalSpent > 0
        );
        if (winnersWithSpending.length > 0) {
          const sortedWinners = winnersWithSpending.sort((a, b) => b.totalSpent - a.totalSpent);
          const winnerStrings = sortedWinners.map((r, i) => `${i + 1}. **${r.member}** - ${r.totalSpent} pts`);
          const totalSpent = winnersWithSpending.reduce((sum, r) => sum + r.totalSpent, 0);

          const tallyEmbeds = createPaginatedEmbeds(
            `${EMOJI.CHART} Bidding Points Tally`,
            winnerStrings,
            15,
            { color: COLORS.SUCCESS, footer: `Total: ${totalSpent} pts spent` }
          );

          tallyEmbeds[0].setDescription(`**Points spent this session:**`);

          for (const embed of tallyEmbeds) {
            await channel.send({ embeds: [embed] });
          }
        }
      }
      } catch (err) {
      state.logger.error(`${EMOJI.ERROR} Failed to submit bidding results:`, err);
      state.logger.info(
        `${EMOJI.WARNING} Session results (for manual recovery):`,
        JSON.stringify(submitPayload, null, 2)
      );
      }
      }

    // Move all auctioned items to ForDistribution sheet
    state.logger.info(`📦 Moving completed auction items to ForDistribution...`);

    const maxRetries = 3;
    let moveSuccess = false;
    let moveData = null;
    let lastError = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        state.logger.info(`📦 Move attempt ${attempt}/${maxRetries}...`);

        moveData = await state.sheetAPI.call('moveAuctionedItemsToForDistribution');

        if (moveData && moveData.status === 'ok') {
          state.logger.info(`✅ Moved ${moveData.moved || 0} items to ForDistribution (skipped ${moveData.skipped || 0})`);
          moveSuccess = true;

          const mainGuild = await client.guilds.fetch(config.main_guild_id);
          const adminLogs = await mainGuild.channels
            .fetch(config.admin_logs_channel_id)
            .catch(() => null);

          if (adminLogs && moveData.moved > 0) {
            await adminLogs.send(
              `📦 **Items Moved to ForDistribution:** ${moveData.moved} completed auction(s) (${moveData.skipped || 0} skipped)`
            );
          }

          break;
        } else {
          lastError = moveData?.message || 'Unknown error from sheets API';
          state.logger.error(`⚠️ Move attempt ${attempt} failed: ${lastError}`);

          if (attempt < maxRetries) {
            const delay = Math.pow(2, attempt) * 1000;
            state.logger.info(`⏳ Retrying in ${delay/1000}s...`);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      } catch (err) {
        lastError = err.message;
        state.logger.error(`⚠️ Move attempt ${attempt} error:`, err);

        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 1000;
          state.logger.info(`⏳ Retrying in ${delay/1000}s...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    if (!moveSuccess) {
      state.logger.error(`❌ Failed to move items after ${maxRetries} attempts: ${lastError}`);

      const mainGuild = await client.guilds.fetch(config.main_guild_id);
      const adminLogs = await mainGuild.channels
        .fetch(config.admin_logs_channel_id)
        .catch(() => null);

      if (adminLogs) {
        await adminLogs.send(
          `⚠️ **ForDistribution Move Failed**\n` +
          `Failed to move items after ${maxRetries} attempts.\n` +
          `**Error:** ${lastError}\n\n` +
          `**Manual Fix:**\n` +
          `Use \`!movetodistribution\` command to retry, or\n` +
          `Run \`moveAllItemsWithWinnersToForDistribution()\` in Google Apps Script editor.`
        );
      }
    }

    // Send detailed summary to admin logs
    const mainGuild = await client.guilds.fetch(config.main_guild_id);
    const adminLogs = await mainGuild.channels
      .fetch(config.admin_logs_channel_id)
      .catch(() => null);

    if (adminLogs) {
      const itemsWithWinners = soldItems.length;
      const totalRevenue = soldItems.reduce((sum, s) => sum + s.amount, 0);

      const resultLines = soldItems.map(
        (s, i) => `${i + 1}. **${s.item}** 📊: ${s.winner} - ${s.amount}pts`
      );
      const fullText = resultLines.join('\n');
      const fitsInField = resultLines.length === 0 || fullText.length <= 1024;

      const fieldValue = resultLines.length === 0
        ? 'No sales recorded'
        : fitsInField
          ? fullText
          : `${resultLines[0]}\n...and ${resultLines.length - 1} more items`;

      const adminEmbed = new EmbedBuilder()
        .setColor(COLORS.SUCCESS)
        .setTitle(`${EMOJI.SUCCESS} Session Summary`)
        .setDescription(`Auctioneering session completed successfully`);

      try {
        adminEmbed.addFields(
          {
            name: `📊 Items Sold`,
            value: `**With Winners:** ${itemsWithWinners}`,
            inline: true,
          },
          {
            name: `💰 Revenue`,
            value: `**Total:** ${totalRevenue}pts`,
            inline: true,
          },
          {
            name: `📋 Results`,
            value: fieldValue,
            inline: false,
          }
        );
      } catch (err) {
        state.logger.error(`${EMOJI.ERROR} Error adding fields to embed:`, err);
        adminEmbed.addFields({
          name: `📊 Summary`,
          value: `Items: ${itemsWithWinners} | Revenue: ${totalRevenue}pts`,
          inline: false,
        });
      }

      adminEmbed
        .setFooter({ text: `Session completed by !startauction` })
        .setTimestamp();

      await adminLogs.send({ embeds: [adminEmbed] });

      // Send paginated full results if they don't fit in one field
      if (resultLines.length > 0 && !fitsInField) {
        const paginatedEmbeds = createPaginatedEmbeds(
          `${EMOJI.SUCCESS} Full Results (${resultLines.length} items)`,
          resultLines,
          15,
          { color: COLORS.SUCCESS }
        );
        for (const pe of paginatedEmbeds) {
          await adminLogs.send({ embeds: [pe] });
        }
      }
    }

    state.logger.info("🧹 Clearing session data...");
    state.auctionState.sessionItems = [];
    state.auctionState.threadItems = {};
    state.auctionState.activeThreadCount = 0;
    state.auctionState.currentBatchSize = 1;

    // Clear bidding module cache
    if (!state.biddingModule) {
      state.biddingModule = require("../../bidding.js");
    }
    state.biddingModule.clearPointsCache();

    state.logger.info("✅ Session data cleared");

    // Save state if config is available
    if (state.cfg && state.cfg.sheet_webhook_url) {
      await saveAuctionState().catch((err) => {
        state.logger.error(`${EMOJI.ERROR} Failed to save state:`, err);
      });
    }
  } finally {
    // ALWAYS clear locked points, even if errors occurred
    try {
      if (!state.biddingModule) {
        state.biddingModule = require("../../bidding.js");
      }
      const biddingState = state.biddingModule.getBiddingState();
      biddingState.lp = {};
      state.biddingModule.saveBiddingState();
      state.logger.info("✅ Locked points released");
    } catch (err) {
      state.logger.error(`${EMOJI.ERROR} Failed to clear locked points:`, err);
    }

    // Mark session as fully finalized
    state.auctionState.sessionFinalized = true;
    state.logger.info(`${EMOJI.SUCCESS} Session finalization complete (tallies submitted, items moved)`);
  }
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
 * Builds combined results for all members showing total spending.
 *
 * @param {Object} config - Bot configuration with webhook URL
 * @returns {Promise<Array<Object>>} Array of {member, totalSpent} objects
 */
async function buildCombinedResults(config) {
  state.logger.info(`${EMOJI.CHART} Building combined results for ${state.auctionState.sessionItems?.length || 0} session items...`);

  // Fetch fresh points from sheet
  let allPoints = {};
  try {
    const data = await state.sheetAPI.call('getBiddingPoints');
    allPoints = data.points || {};
    state.logger.info(`${EMOJI.SUCCESS} Fetched points for ${Object.keys(allPoints).length} members`);
  } catch (err) {
    state.logger.error(`${EMOJI.ERROR} Failed to fetch bidding points:`, err);
    return [];
  }

  if (!state.auctionState.sessionItems || !Array.isArray(state.auctionState.sessionItems)) {
    state.logger.error(`${EMOJI.ERROR} Invalid sessionItems array in auctionState`);
    return [];
  }

  const pointsCache = new state.PointsCache(allPoints);
  const allMembers = pointsCache.getAllUsernames();

  const winners = {};
  let skippedItems = 0;
  let processedItems = 0;

  state.auctionState.sessionItems.forEach((item, index) => {
    if (!item.winner || !item.amount) {
      skippedItems++;
      state.logger.info(`${EMOJI.WARNING} Skipping item ${index + 1} "${item.item}" - no winner or amount`);
      return;
    }

    const normalizedWinner = normalizeUsername(item.winner);
    winners[normalizedWinner] = (winners[normalizedWinner] || 0) + item.amount;
    processedItems++;
  });

  state.logger.info(`${EMOJI.SUCCESS} Processed ${processedItems} items with winners, skipped ${skippedItems} unsold items`);

  const results = allMembers.map((m) => {
    const normalizedMember = normalizeUsername(m);
    return {
      member: m,
      totalSpent: winners[normalizedMember] || 0,
    };
  });

  state.logger.info(
    `${EMOJI.CHART} Built results: ${results.filter((r) => r.totalSpent > 0).length} winners out of ${results.length} members`
  );

  return results;
}

module.exports = {
  itemEnd,
  finalizeSession,
  buildCombinedResults,
};
