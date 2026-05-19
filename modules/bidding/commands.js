/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                    COMMAND HANDLERS - User & Admin Commands               ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Main command handler that routes user and admin commands to appropriate
 * handlers. Supports both standalone and auctioneering modes.
 *
 * @module modules/bidding/commands
 */

const { EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle, ComponentType } = require("discord.js");
const state = require('./state');
const {
  COLORS,
  EMOJI,
  ERROR_MESSAGES,
  TIMEOUTS,
  COMMAND_ALIASES,
  createPaginatedEmbeds,
  createDisabledRow,
} = require('./constants');
const { save, clearAllTimers, fetchPts, loadBiddingStateFromSheet } = require('./persistence');
const { lock, unlock } = require('./points-locking');
const { loadCache, clearCache, stopCacheAutoRefresh, getPts } = require('./points-cache');
const { submitSessionTally, finalize, schedTimers, startNext, isFinalizingSession } = require('./auction-lifecycle');
const { procBid } = require('./bid-processing');
const { normalizeUsername } = require('./utilities');
const { PointsCache } = require('../../utils/points-cache');
const errorHandler = require('../../utils/error-handler');

// ═══════════════════════════════════════════════════════════════════════════
// COMMAND HANDLER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Main command handler - Routes commands to appropriate handlers
 *
 * COMMAND ROUTING:
 * - Resolves command aliases (!b -> !bid, etc.)
 * - Routes to specific command handler based on command name
 * - Handles both user and admin commands
 *
 * SUPPORTED COMMANDS:
 *
 * USER COMMANDS:
 * - !bid <amount> - Place bid on active auction
 *
 * ADMIN COMMANDS:
 * - !cancelitem - Cancel current auction item (refund points)
 * - !fixlockedpoints - Audit and clear stuck locked points
 *
 * COMMAND ALIASES:
 * - !b -> !bid
 * - !ql, !queue -> !queuelist
 * - !start -> !startauction
 *
 * @param {string} cmd - Command name (with ! prefix)
 * @param {Message} msg - Discord message object
 * @param {Array<string>} args - Command arguments
 * @param {Client} cli - Discord client instance
 * @param {Object} cfg - Bot configuration object
 */
async function handleCmd(cmd, msg, args, cli, cfg) {
  // Handle command aliases
  const actualCmd = COMMAND_ALIASES[cmd] || cmd;

  switch (actualCmd) {
    case "!bid":
      if (args.length === 0) {
        try {
          return await msg.reply(`${EMOJI.ERROR} Usage: \`!bid <amount>\``);
        } catch (err) {
          // If reply fails (message deleted), send regular message
          return await msg.channel.send(
            `${EMOJI.ERROR} Usage: \`!bid <amount>\``
          );
        }
      }
      const res = await procBid(msg, args[0], cfg);
      if (!res.ok) {
        try {
          await msg.reply(`${EMOJI.ERROR} ${res.msg}`);
        } catch (err) {
          // If reply fails (message deleted), send regular message
          await msg.channel.send(
            `${EMOJI.ERROR} <@${msg.author.id}> ${res.msg}`
          );
        }
      }
      break;

    case "!fixlockedpoints": {
      // 🔧 AUDIT AND FIX STUCK LOCKED POINTS
      const lockedMembers = Object.keys(state.st.lp).filter(
        (member) => state.st.lp[member] > 0
      );

      if (lockedMembers.length === 0) {
        return await msg.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(state.getColor(COLORS.SUCCESS))
              .setTitle(`${EMOJI.SUCCESS} All Clear!`)
              .setDescription(`No locked points found. System is clean.`)
              .setTimestamp(),
          ],
        });
      }

      // Build audit report - use paginated embeds
      const auditReportStrings = lockedMembers
        .map((member) => `• **${member}**: ${state.st.lp[member]}pts locked`);

      const clearBtn = new ButtonBuilder()
        .setCustomId(`fixlocked_confirm_${msg.author.id}_${Date.now()}`)
        .setLabel('✅ Clear All')
        .setStyle(ButtonStyle.Danger);

      const cancelBtn = new ButtonBuilder()
        .setCustomId(`fixlocked_cancel_${msg.author.id}_${Date.now()}`)
        .setLabel('❌ Cancel')
        .setStyle(ButtonStyle.Secondary);

      const fixRow = new ActionRowBuilder().addComponents(clearBtn, cancelBtn);

      // Create preview embed (first 10)
      const previewReport = auditReportStrings.slice(0, 10).join('\n') +
        (auditReportStrings.length > 10 ? `\n*... and ${auditReportStrings.length - 10} more*` : '');

      const fixMsg = await msg.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(state.getColor(COLORS.WARNING))
            .setTitle(`${EMOJI.WARNING} Locked Points Found`)
            .setDescription(
              `Found **${lockedMembers.length} members** with locked points:\n\n${previewReport}\n\n` +
                `**Action:** Clear all locked points?\n` +
                `⚠️ Only do this if no auction is running or if points are stuck.`
            )
            .setFooter({
              text: 'Click a button below to confirm',
            }),
        ],
        components: [fixRow],
      });

      const fixCollector = fixMsg.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: TIMEOUTS.CONFIRMATION,
        filter: i => i.user.id === msg.author.id
      });

      fixCollector.on('collect', async (interaction) => {
        const isConfirm = interaction.customId.startsWith('fixlocked_confirm_');

        // CRITICAL: Defer the interaction immediately to prevent timeout
        await interaction.deferUpdate().catch(err => {
          state.logger.error(`⚠️ Failed to defer interaction: ${err.message}`);
        });

        const disabledFixRow = createDisabledRow(clearBtn, cancelBtn);

        if (isConfirm) {
          const clearedCount = lockedMembers.length;
          const totalLocked = Object.values(state.st.lp).reduce(
            (sum, pts) => sum + pts,
            0
          );
          state.st.lp = {};
          await save(true); // Force immediate sync to Google Sheets to persist the change

          const successEmbed = new EmbedBuilder()
            .setColor(state.getColor(COLORS.SUCCESS))
            .setTitle(`${EMOJI.SUCCESS} Locked Points Cleared`)
            .setDescription(
              `Freed **${totalLocked}pts** from **${clearedCount} members**`
            )
            .setFooter({
              text: "Points are now available for bidding",
            })
            .setTimestamp();

          await interaction.editReply({ embeds: [successEmbed], components: [disabledFixRow] }).catch(err => {
            state.logger.error(`⚠️ Failed to update interaction: ${err.message}`);
          });
          fixCollector.stop();
        } else {
          // User cancelled
          const cancelEmbed = new EmbedBuilder()
            .setColor(state.getColor(COLORS.ERROR))
            .setTitle(`${EMOJI.ERROR} Cancelled`)
            .setDescription('Operation cancelled')
            .setTimestamp();

          await interaction.editReply({ embeds: [cancelEmbed], components: [disabledFixRow] }).catch(err => {
            state.logger.error(`⚠️ Failed to update interaction: ${err.message}`);
          });
          fixCollector.stop();
        }
      });

      fixCollector.on('end', async (collected, reason) => {
        if (reason === 'time' && collected.size === 0) {
          const disabledFixRow = createDisabledRow(clearBtn, cancelBtn);

          const timeoutEmbed = new EmbedBuilder()
            .setColor(state.getColor(COLORS.ERROR))
            .setTitle(`${EMOJI.ERROR} Timed Out`)
            .setDescription('Confirmation expired')
            .setTimestamp();

          await errorHandler.safeEdit(fixMsg, { embeds: [timeoutEmbed], components: [disabledFixRow] }, 'fix points confirmation timeout');
        }
      });
      break;
    }

    default:
      // Unknown command - ignore silently (may be handled by other modules)
      break;
  }
}

module.exports = { handleCmd };
