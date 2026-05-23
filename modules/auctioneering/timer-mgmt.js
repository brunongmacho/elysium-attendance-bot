/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║         AUCTIONEERING TIMER MGMT - Timer Management                      ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Timer management: scheduleItemTimers, itemGo1-3, safelyCleanupTimers.
 *
 * @module modules/auctioneering/timer-mgmt
 */

const { EmbedBuilder } = require("discord.js");
const { state } = require('./state');
const { COLORS, EMOJI } = require('./constants');
// Lazy-require item-completion to avoid circular dependency at load time

/**
 * Schedules countdown timers for the current auction item.
 *
 * @param {Discord.Client} client - Discord bot client
 * @param {Object} config - Bot configuration
 * @param {Discord.ThreadChannel} channel - Auction thread channel
 */
function scheduleItemTimers(client, config, channel) {
  if (!client || !config || !channel || !state.auctionState.currentItem) {
    state.logger.error(`${EMOJI.ERROR} Invalid parameters to scheduleItemTimers`);
    return;
  }

  const item = state.auctionState.currentItem;
  const t = Math.max(0, item.endTime - Date.now());

  if (t > 60000 && !item.go1) {
    state.auctionState.timers.go1 = setTimeout(
      async () => await itemGo1(client, config, channel),
      t - 60000
    );
  }
  if (t > 30000 && !item.go2) {
    state.auctionState.timers.go2 = setTimeout(
      async () => await itemGo2(client, config, channel),
      t - 30000
    );
  }
  if (t > 10000) {
    state.auctionState.timers.go3 = setTimeout(
      async () => await itemGo3(client, config, channel),
      t - 10000
    );
  }
  state.auctionState.timers.itemEnd = setTimeout(
    async () => {
      const { itemEnd } = require('./item-completion');
      await itemEnd(client, config, channel);
    },
    t
  );
}

/**
 * Announces 60 seconds remaining in the auction.
 */
async function itemGo1(client, config, channel) {
  if (
    !state.auctionState.active ||
    !state.auctionState.currentItem ||
    state.auctionState.currentItem.go1
  )
    return;
  state.auctionState.currentItem.go1 = true;

  const item = state.auctionState.currentItem;
  const endTimestamp = Math.floor(item.endTime / 1000);

  try {
    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(COLORS.WARNING)
          .setTitle(`${EMOJI.WARNING} GOING ONCE!`)
          .setDescription(`Auction ends <t:${endTimestamp}:R>`)
          .addFields({
            name: `${EMOJI.BID} Current`,
            value: item.curWin
              ? `${item.curBid}pts by ${item.curWin}`
              : `${item.startPrice}pts (no bids)`,
          }),
      ],
    });
  } catch (err) {
    state.logger.error(`${EMOJI.ERROR} Failed to send GOING ONCE message:`, err);
  }
}

/**
 * Announces 30 seconds remaining in the auction.
 */
async function itemGo2(client, config, channel) {
  if (
    !state.auctionState.active ||
    !state.auctionState.currentItem ||
    state.auctionState.currentItem.go2
  )
    return;
  state.auctionState.currentItem.go2 = true;

  const item = state.auctionState.currentItem;
  const endTimestamp = Math.floor(item.endTime / 1000);

  try {
    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(COLORS.WARNING)
          .setTitle(`${EMOJI.WARNING} GOING TWICE!`)
          .setDescription(`Auction ends <t:${endTimestamp}:R>`)
          .addFields({
            name: `${EMOJI.BID} Current`,
            value: item.curWin
              ? `${item.curBid}pts by ${item.curWin}`
              : `${item.startPrice}pts (no bids)`,
          }),
      ],
    });
  } catch (err) {
    state.logger.error(`${EMOJI.ERROR} Failed to send GOING TWICE message:`, err);
  }
}

/**
 * Announces 10 seconds remaining in the auction (final countdown).
 */
async function itemGo3(client, config, channel) {
  if (!state.auctionState.active || !state.auctionState.currentItem || state.auctionState.currentItem.go3) return;
  state.auctionState.currentItem.go3 = true;

  const item = state.auctionState.currentItem;
  const endTimestamp = Math.floor(item.endTime / 1000);

  try {
    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(COLORS.ERROR)
          .setTitle(`${EMOJI.WARNING} FINAL CALL!`)
          .setDescription(`Auction ends <t:${endTimestamp}:R>`)
          .addFields({
            name: `${EMOJI.BID} Current`,
            value: item.curWin
              ? `${item.curBid}pts by ${item.curWin}`
              : `${item.startPrice}pts (no bids)`,
          }),
      ],
    });
  } catch (err) {
    state.logger.error(`${EMOJI.ERROR} Failed to send FINAL CALL message:`, err);
  }
}

/**
 * Safely cleans up specific timers by key.
 *
 * @param {...string} timerKeys - Timer keys to clean up
 */
function safelyCleanupTimers(...timerKeys) {
  timerKeys.forEach((key) => {
    if (state.auctionState.timers[key]) {
      clearTimeout(state.auctionState.timers[key]);
      delete state.auctionState.timers[key];
    }
  });
}

module.exports = {
  scheduleItemTimers,
  itemGo1,
  itemGo2,
  itemGo3,
  safelyCleanupTimers,
};
