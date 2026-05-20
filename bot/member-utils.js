/**
 * =============================================================================
 * MEMBER UTILITIES - Admin checks, recovery, test tools
 * =============================================================================
 *
 * Extracted from index2.js to improve modularity and testability.
 * All functions receive their dependencies as parameters.
 *
 * @module member-utils
 */

const { EmbedBuilder } = require("discord.js");
const { createLogger } = require('../utils/logger');
const { config } = require('./config');
const logger = createLogger('member-utils');

// =============================================================================
// PERMISSION CHECKS
// =============================================================================

/**
 * Checks if a guild member has admin privileges.
 *
 * @param {import('discord.js').GuildMember} member - Discord guild member to check
 * @returns {boolean} True if member has admin role, false otherwise
 */
function isAdmin(member) {
  // Bot owner is always admin
  if (config.owner_id && member.id === config.owner_id) return true;
  return member.roles.cache.some((r) => config.admin_roles.includes(r.id));
}

/**
 * Check if member has the guild (Elysium) role.
 *
 * @param {import('discord.js').GuildMember} member - Discord guild member
 * @returns {boolean} True if member has guild role
 */
function hasElysiumRole(member) {
  return member.roles.cache.some((r) => r.name === config.elysium_role);
}

// =============================================================================
// CRASH RECOVERY
// =============================================================================

/**
 * Moves unfinished auction queue items back to the BiddingItems sheet.
 *
 * Called during recovery to preserve queue items that weren't auctioned
 * before a crash. Items are appended to the BiddingItems sheet for future
 * auction sessions.
 *
 * @async
 * @param {Object} config - Bot configuration object with sheet_webhook_url
 * @param {Array<Object>} queueItems - Array of queue items to move
 * @param {Object} sheetAPI - Google Sheets API instance
 * @returns {Promise<void>}
 */
async function moveQueueItemsToSheet(config, queueItems, sheetAPI) {
  try {
    await sheetAPI.call('moveQueueItemsToSheet', {
      items: queueItems,
    });

    logger.info(`✅ Queue items moved to sheet`);
  } catch (e) {
    logger.error(`❌ Move items error:`, e);
  }
}

/**
 * Recovers bot state after unexpected crashes or restarts.
 *
 * Recovery process:
 * 1. Checks Google Sheets for any active auction state
 * 2. If crashed auction found, finalizes the current item
 * 3. Moves unfinished queue items back to BiddingItems sheet
 * 4. Notifies admins of recovery status
 * 5. Sets cooldown to prevent immediate auction restart
 *
 * @async
 * @param {import('discord.js').Client} client - Discord client instance
 * @param {Object} config - Bot configuration object
 * @param {Object} deps - Additional dependencies
 * @param {Object} deps.sheetAPI - Google Sheets API instance
 * @param {Object} deps.discordCache - Discord channel cache
 * @param {Object} deps.bidding - Bidding module reference
 * @param {Function} deps.moveQueueItemsToSheet - Bound moveQueueItemsToSheet function
 * @param {Function} deps.setLastAuctionEndTime - Callback to set lastAuctionEndTime(value)
 * @returns {Promise<void>}
 *
 * @example
 * await recoverBotStateOnStartup(client, config, {
 *   sheetAPI, discordCache, bidding,
 *   moveQueueItemsToSheet: (cfg, items) => moveQueueItemsToSheet(cfg, items, sheetAPI),
 *   setLastAuctionEndTime: (val) => { lastAuctionEndTime = val; }
 * });
 */
async function recoverBotStateOnStartup(client, config, deps) {
  const { sheetAPI, discordCache, bidding, setLastAuctionEndTime } = deps;

  logger.info(`🔄 Checking for crashed state...`);

  const savedState = await bidding.loadBiddingStateFromSheet(
    config.sheet_webhook_url
  );
  if (!savedState || !savedState.activeAuction) {
    logger.info(`✅ No crashed state found, starting fresh`);
    return;
  }

  logger.info(`⚠️ Found crashed auction state, recovering...`);

  const adminLogs = await discordCache
    .getChannel('admin_logs_channel_id')
    .catch(() => null);

  if (adminLogs) {
    await adminLogs.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0xffa500)
          .setTitle(`🔄 Bot Recovery Started`)
          .setDescription(`Recovering crashed auction state...`)
          .setFooter({ text: `Please wait, this may take a moment...` })
          .setTimestamp(),
      ],
    });
  }

  // Recover and finalize crashed auction
  const auctState = savedState.activeAuction;
  if (auctState && auctState.curWin) {
    const sessionItems = [];
    sessionItems.push({
      item: auctState.item,
      winner: auctState.curWin,
      winnerId: auctState.curWinId,
      amount: auctState.curBid,
      source: auctState.source || 'Recovered',
      timestamp: new Date().toISOString(),
    });

    // If there are unfinished queue items, move them to BiddingItems sheet
    const unfinishedQueue = savedState.queue || [];
    if (unfinishedQueue.length > 0) {
      logger.info(
        `📋 Moving ${unfinishedQueue.length} unfinished queue items to BiddingItems sheet`
      );
      if (deps.moveQueueItemsToSheet) {
        await deps.moveQueueItemsToSheet(config, unfinishedQueue);
      }
    }

    // Submit tally
    logger.info(`💾 Submitting recovered session tally...`);
    await bidding.submitSessionTally(config, sessionItems);

    if (adminLogs) {
      await adminLogs.send({
        embeds: [
          new EmbedBuilder()
            .setColor(0x00ff00)
            .setTitle(`✅ Recovery Complete`)
            .setDescription(
              `Finished item: **${auctState.item}**\nWinner: ${auctState.curWin}\nBid: ${auctState.curBid}pts`
            )
            .addFields({
              name: `📋 Unfinished Items`,
              value: `${unfinishedQueue.length} item(s) moved to BiddingItems sheet`,
              inline: false,
            })
            .setFooter({ text: `Ready for next !startauction` })
            .setTimestamp(),
        ],
      });
    }
  }

  if (setLastAuctionEndTime) setLastAuctionEndTime(Date.now());
  logger.info(`✅ Recovery complete, cooldown started`);
}

// =============================================================================
// EXPORTS
// =============================================================================

module.exports = {
  isAdmin,
  hasElysiumRole,
  recoverBotStateOnStartup,
  moveQueueItemsToSheet,
};
