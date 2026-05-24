/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║          AUCTIONEERING ADMIN CONTROLS - Admin Controls                   ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Admin controls: stopCurrentItem, extendCurrentItem, safelyClearItemTimers,
 * rescheduleItemTimers, getAuctionState.
 *
 * @module modules/auctioneering/admin-controls
 */

const { EmbedBuilder } = require("discord.js");
const { state } = require('./state');
const { COLORS, EMOJI } = require('./constants');
const { safelyCleanupTimers, scheduleItemTimers } = require('./timer-mgmt');

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
 * Force-stops the current auction item and moves to the next.
 *
 * @param {Discord.Client} client - Discord bot client
 * @param {Object} config - Bot configuration
 * @param {Discord.ThreadChannel} channel - Auction thread channel
 * @returns {Promise<boolean>} True if successfully stopped, false otherwise
 */
async function stopCurrentItem(client, config, channel) {
  if (!state.auctionState.active || !state.auctionState.currentItem) {
    state.logger.warn("⚠️ No active item to stop.");
    return false;
  }

  safelyCleanupTimers(null, "itemEnd", "go1", "go2", "go3");

  const item = state.auctionState.currentItem;

  if (item.status === "ended") {
    state.logger.warn("⚠️ Item already ended — skipping force stop.");
    return false;
  }

  state.logger.info(`🛑 Forced stop for: ${item.item}`);

  // Announce forced stop in admin logs
  try {
    const guild = await client.guilds.fetch(config.main_guild_id);
    const adminLogs = await guild.channels
      .fetch(config.admin_logs_channel_id)
      .catch(() => null);

    if (adminLogs) {
      await adminLogs.send({
        embeds: [
          new EmbedBuilder()
            .setColor(COLORS.WARNING)
            .setTitle(`${EMOJI.STOP} Auction Force-Stopped`)
            .setDescription(`**${item.item}** manually finalized by admin.`)
            .addFields(
              {
                name: `${EMOJI.BID} Highest Bid`,
                value: item.curBid
                  ? `${item.curBid} pts by ${item.curWin || "No bids"}`
                  : "No bids placed",
                inline: true,
              },
              {
                name: `${EMOJI.TIME} Status`,
                value: "✅ Finalized early (manual override)",
                inline: true,
              }
            )
            .setFooter({ text: "Proceeding to next item automatically..." })
            .setTimestamp(),
        ],
      });
    }
  } catch (err) {
    state.logger.error("❌ Failed to announce force-stop:", err);
  }

  // Mark as ended and finalize normally
  try {
    item.status = "ended";
    const { itemEnd } = require('./item-completion');
    await itemEnd(client, config, channel);
  } catch (err) {
    state.logger.error("❌ Error finalizing forced stop:", err);
  }

  return true;
}

/**
 * Extends the current auction item duration by specified minutes.
 *
 * @param {number} minutes - Number of minutes to extend
 * @returns {boolean} True if successfully extended, false if no active item
 */
function extendCurrentItem(minutes) {
  if (!state.auctionState.active || !state.auctionState.currentItem) return false;
  if (state.cfg && state.cfg.sheet_webhook_url) {
    const { saveAuctionState } = require('./persistence');
    saveAuctionState().catch(err => console.error('Failed to save auction state on extend:', err.message));
  }

  state.auctionState.currentItem.endTime += minutes * 60000;
  state.logger.info(`${EMOJI.TIME} Extended by ${minutes}m`);
  return true;
}

/**
 * Safely clears only item-specific timers without affecting session timers.
 * If threadId is provided, uses prefixed timer keys: `${threadId}_go1`, etc.
 *
 * @param {string} [threadId] - Optional thread ID for prefixed timers
 */
function safelyClearItemTimers(threadId) {
  const timerKeys = ['go1', 'go2', 'go3', 'itemEnd'];
  timerKeys.forEach(key => {
    const fullKey = threadId ? `${threadId}_${key}` : key;
    if (state.auctionState.timers[fullKey]) {
      clearTimeout(state.auctionState.timers[fullKey]);
      delete state.auctionState.timers[fullKey];
      state.logger.info(`🛑 Cleared timer: ${fullKey}`);
    }
  });
}

/**
 * Reschedules item timers after time extension.
 *
 * @param {Discord.Client} client - Discord bot client
 * @param {Object} config - Bot configuration
 * @param {Discord.ThreadChannel} channel - Auction thread channel
 * @param {string} [threadId] - Optional thread ID for prefixed timer keys
 * @returns {boolean} True if successfully rescheduled, false if no active item
 */
function rescheduleItemTimers(client, config, channel, threadId) {
  const item = state.auctionState.threadItems?.[threadId] || state.auctionState.currentItem;
  if (!state.auctionState.active || !item) {
    state.logger.warn(`${EMOJI.WARNING} Cannot reschedule timers - no active item`);
    return false;
  }

  // Clear existing item timers FIRST to prevent race condition
  const timerKeys = ['go1', 'go2', 'go3', 'itemEnd'];
  timerKeys.forEach(key => {
    const fullKey = threadId ? `${threadId}_${key}` : key;
    if (state.auctionState.timers[fullKey]) {
      clearTimeout(state.auctionState.timers[fullKey]);
      delete state.auctionState.timers[fullKey];
    }
  });

  // Reset announcement flags AFTER clearing timers
  item.go1 = false;
  item.go2 = false;

  // Reschedule based on new endTime
  scheduleItemTimers(client, config, channel);
  state.logger.info(`${EMOJI.SUCCESS} Item timers rescheduled for ${item.item}`);
  return true;
}

/**
 * Returns the current auction state object.
 *
 * @returns {Object} The auctionState object with all session data
 */
function getAuctionState() {
  return state.auctionState;
}

module.exports = {
  stopCurrentItem,
  extendCurrentItem,
  clearAllTimers,
  safelyClearItemTimers,
  rescheduleItemTimers,
  getAuctionState,
};
