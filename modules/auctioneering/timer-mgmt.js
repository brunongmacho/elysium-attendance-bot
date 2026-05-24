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
  if (!client || !config || !channel) {
    state.logger.error(`${EMOJI.ERROR} Invalid parameters to scheduleItemTimers`);
    return;
  }

  const tid = channel.id;
  const item = state.auctionState.threadItems?.[tid] || state.auctionState.currentItem;
  if (!item) {
    state.logger.error(`${EMOJI.ERROR} No item found for thread ${tid} in scheduleItemTimers`);
    return;
  }

  const t = Math.max(0, item.endTime - Date.now());

  if (t > 60000 && !item.go1) {
    state.auctionState.timers[`${tid}_go1`] = setTimeout(
      async () => await itemGo1(client, config, channel),
      t - 60000
    );
  }
  if (t > 30000 && !item.go2) {
    state.auctionState.timers[`${tid}_go2`] = setTimeout(
      async () => await itemGo2(client, config, channel),
      t - 30000
    );
  }
  if (t > 10000) {
    state.auctionState.timers[`${tid}_go3`] = setTimeout(
      async () => await itemGo3(client, config, channel),
      t - 10000
    );
  }
  state.auctionState.timers[`${tid}_itemEnd`] = setTimeout(
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
  const tid = channel?.id;
  const item = state.auctionState.threadItems?.[tid] || state.auctionState.currentItem;
  if (
    !state.auctionState.active ||
    !item ||
    item.go1
  )
    return;
  item.go1 = true;
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
  const tid = channel?.id;
  const item = state.auctionState.threadItems?.[tid] || state.auctionState.currentItem;
  if (
    !state.auctionState.active ||
    !item ||
    item.go2
  )
    return;
  item.go2 = true;
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
  const tid = channel?.id;
  const item = state.auctionState.threadItems?.[tid] || state.auctionState.currentItem;
  if (!state.auctionState.active || !item || item.go3) return;
  item.go3 = true;
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
 * If channelId is provided, keys are prefixed: `${channelId}_${key}`.
 *
 * @param {string} [channelId] - Optional thread ID for prefixed timer keys
 * @param {...string} timerKeys - Timer keys to clean up
 */
function safelyCleanupTimers(channelId, ...timerKeys) {
  timerKeys.forEach((key) => {
    const fullKey = channelId ? `${channelId}_${key}` : key;
    if (state.auctionState.timers[fullKey]) {
      clearTimeout(state.auctionState.timers[fullKey]);
      delete state.auctionState.timers[fullKey];
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
