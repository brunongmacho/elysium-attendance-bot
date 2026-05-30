/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║              AUCTIONEERING UTILITIES - Shared Utilities                  ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Shared utility functions: createPaginatedEmbeds, createDisabledRow,
 * initialize, clearAllAuctionTimers.
 *
 * @module modules/auctioneering/utilities
 */

const { EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle } = require("discord.js");
const { state } = require('./state');
const { COLORS } = require('./constants');
const { SheetAPI: SheetAPIClass } = require('../../utils/sheet-api');

/**
 * Splits a list of items into multiple Discord embeds to avoid 1024 char limit.
 * Discord allows max 10 fields per embed and 6000 chars total per embed.
 *
 * @param {string} title - Base title for embeds (will add page number)
 * @param {Array<string>} items - Array of items to display (one per line)
 * @param {number} itemsPerPage - Max items per embed (default 20)
 * @param {Object} options - Additional options
 * @param {number} options.color - Embed color (default gold)
 * @param {string} options.footer - Footer text
 * @returns {Array<EmbedBuilder>} Array of embed builders
 */
function createPaginatedEmbeds(title, items, itemsPerPage = 20, options = {}) {
  const { color = COLORS.AUCTION, footer = '' } = options;
  const embeds = [];
  const totalPages = Math.ceil(items.length / itemsPerPage);

  for (let page = 0; page < totalPages; page++) {
    const startIdx = page * itemsPerPage;
    const endIdx = Math.min(startIdx + itemsPerPage, items.length);
    const pageItems = items.slice(startIdx, endIdx);

    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle(totalPages > 1 ? `${title} (${page + 1}/${totalPages})` : title)
      .setDescription(pageItems.join('\n'))
      .setTimestamp();

    if (footer) {
      embed.setFooter({ text: footer });
    }

    embeds.push(embed);
  }

  return embeds;
}

/**
 * Sends a paginated embed with Previous/Next buttons.
 * Instead of sending multiple separate embeds, this sends a single embed
 * with interactive pagination via Discord message components.
 *
 * @param {TextChannel|ThreadChannel} channel - Discord channel to send to
 * @param {Array<EmbedBuilder>} embeds - Array of embed pages
 * @param {number} [timeout=180000] - How long to keep buttons active (ms)
 */
async function sendPaginatedResults(channel, embeds, timeout = 180000) {
  if (!embeds || embeds.length === 0) return;
  if (embeds.length === 1) {
    await channel.send({ embeds });
    return;
  }

  let currentPage = 0;

  const prevBtn = new ButtonBuilder()
    .setCustomId('results_prev')
    .setLabel('◀ Previous')
    .setStyle(ButtonStyle.Primary)
    .setDisabled(true); // Disabled on first page

  const nextBtn = new ButtonBuilder()
    .setCustomId('results_next')
    .setLabel('Next ▶')
    .setStyle(ButtonStyle.Primary);

  if (embeds.length === 1) nextBtn.setDisabled(true);

  const row = new ActionRowBuilder().addComponents(prevBtn, nextBtn);

  const msg = await channel.send({
    embeds: [embeds[0]],
    components: [row],
  });

  const collector = msg.createMessageComponentCollector({
    time: timeout,
    filter: (i) => i.customId === 'results_prev' || i.customId === 'results_next',
  });

  collector.on('collect', async (interaction) => {
    try {
      if (interaction.customId === 'results_prev') {
        currentPage = Math.max(0, currentPage - 1);
      } else if (interaction.customId === 'results_next') {
        currentPage = Math.min(embeds.length - 1, currentPage + 1);
      }

      const newPrevBtn = ButtonBuilder.from(prevBtn).setDisabled(currentPage === 0);
      const newNextBtn = ButtonBuilder.from(nextBtn).setDisabled(currentPage >= embeds.length - 1);

      await interaction.update({
        embeds: [embeds[currentPage]],
        components: [new ActionRowBuilder().addComponents(newPrevBtn, newNextBtn)],
      });
    } catch (err) {
      state.logger.warn(`⚠️ Pagination interaction error:`, err.message);
    }
  });

  collector.on('end', async () => {
    try {
      const disabledPrev = ButtonBuilder.from(prevBtn).setDisabled(true);
      const disabledNext = ButtonBuilder.from(nextBtn).setDisabled(true);
      await msg.edit({
        components: [new ActionRowBuilder().addComponents(disabledPrev, disabledNext)],
      });
    } catch (err) {
      // Message might have been deleted already
    }
  });
}

/**
 * Creates a disabled row with fresh button instances (defensive: avoids mutation)
 * @param {ButtonBuilder} btn1 - First button to disable
 * @param {ButtonBuilder} btn2 - Second button to disable
 * @returns {ActionRowBuilder} Row with disabled buttons
 */
function createDisabledRow(btn1, btn2) {
  const disabledBtn1 = new ButtonBuilder()
    .setCustomId(btn1.data.custom_id)
    .setLabel(btn1.data.label)
    .setStyle(btn1.data.style)
    .setDisabled(true);

  const disabledBtn2 = new ButtonBuilder()
    .setCustomId(btn2.data.custom_id)
    .setLabel(btn2.data.label)
    .setStyle(btn2.data.style)
    .setDisabled(true);

  return new ActionRowBuilder().addComponents(disabledBtn1, disabledBtn2);
}

/**
 * Clears all active timers from the auction state
 * Optimization: Consolidates timer clearing logic
 *
 * @returns {number} Number of timers cleared
 */
function clearAllAuctionTimers() {
  if (!state.auctionState.timers || typeof state.auctionState.timers !== 'object') return 0;
  const count = Object.keys(state.auctionState.timers).length;
  Object.values(state.auctionState.timers).forEach((t) => clearTimeout(t));
  state.auctionState.timers = {};
  return count;
}

/**
 * Initializes the auctioneering module with required dependencies.
 * Must be called during bot startup before any auctions can run.
 *
 * @param {Object} config - Bot configuration object with channel IDs and settings
 * @param {Function} isAdminFunc - Function to check if a user is an admin
 * @param {Object} biddingModuleRef - Reference to the bidding module for point management
 */
function initialize(config, isAdminFunc, biddingModuleRef, cache = null, intelligenceEngineRef = null) {
  state.cfg = config;
  state.isAdmFunc = isAdminFunc;
  state.biddingModule = biddingModuleRef;
  state.sheetAPI = new SheetAPIClass(config.sheet_webhook_url);
  state.discordCache = cache;
  state.intelligenceEngine = intelligenceEngineRef;
  state.logger.info(`✅ Auctioneering system initialized`);

  if (state.USE_MONGODB_AUCTIONEERING) {
    state.logger.info(`✅ [MongoDB] Auctioneering using MongoDB-first architecture`);
    state.logger.info(`ℹ️ [MongoDB] Background Sheet sync enabled (priorities: IMMEDIATE/HIGH/NORMAL/LOW)`);
  } else {
    state.logger.info(`ℹ️ Auctioneering using Google Sheets (legacy mode)`);
    state.logger.info(`ℹ️ Set USE_MONGODB_AUCTIONEERING=true to enable MongoDB`);
  }

  if (state.intelligenceEngine) {
    state.logger.info(`✅ Intelligence Engine linked to auctioneering (auto-learning enabled)`);
  }
}

module.exports = {
  createPaginatedEmbeds,
  sendPaginatedResults,
  createDisabledRow,
  clearAllAuctionTimers,
  initialize,
};
