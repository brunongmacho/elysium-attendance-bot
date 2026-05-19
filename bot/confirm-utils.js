/**
 * =============================================================================
 * CONFIRMATION UTILITIES - Button-based confirmations and dialogs
 * =============================================================================
 *
 * Extracted from index2.js to improve modularity and testability.
 * All functions receive their dependencies as parameters.
 *
 * @module confirm-utils
 */

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} = require("discord.js");
const { createLogger } = require('../utils/logger');
const logger = createLogger('confirm-utils');

// =============================================================================
// DISABLED ROW UTILITY
// =============================================================================

/**
 * Creates a disabled button row from two buttons.
 * Uses fresh ButtonBuilder instances to avoid mutation issues with ButtonBuilder.from().
 *
 * @param {ButtonBuilder} btn1 - First button to disable
 * @param {ButtonBuilder} btn2 - Second button to disable
 * @returns {ActionRowBuilder} Row with both buttons disabled
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

// =============================================================================
// UNIVERSAL CONFIRMATION DIALOG
// =============================================================================

/**
 * Universal confirmation dialog with button-based user response.
 *
 * Flow:
 * 1. Sends confirmation message (embed or text)
 * 2. Adds ✅ Confirm and ❌ Cancel buttons
 * 3. Waits for user to click (configurable timeout)
 * 4. Executes onConfirm or onCancel callback
 * 5. Disables buttons after response
 *
 * This function centralizes all confirmation logic across the bot,
 * ensuring consistent UX for destructive or important operations.
 *
 * @async
 * @param {Message} message - Original message that triggered the confirmation
 * @param {GuildMember} member - Member who must confirm (only their clicks count)
 * @param {EmbedBuilder|string} embedOrText - Confirmation prompt (embed or plain text)
 * @param {Function} onConfirm - Async callback when user confirms (✅)
 * @param {Function} onCancel - Async callback when user cancels (❌)
 * @param {Object} [options] - Additional options
 * @param {number} [options.confirmationTimeout=30000] - Timeout in ms for confirmation
 * @param {Object} [options.errorHandler] - Error handler with silentError and safeEdit methods
 * @returns {Promise<void>}
 *
 * @example
 * await awaitConfirmation(
 *   message,
 *   member,
 *   "Are you sure you want to delete this?",
 *   async (confirmMsg) => { await performDeletion(); },
 *   async (confirmMsg) => { await message.reply("Canceled"); },
 *   { confirmationTimeout: 30000, errorHandler }
 * );
 */
async function awaitConfirmation(
  message,
  member,
  embedOrText,
  onConfirm,
  onCancel,
  options = {}
) {
  const { confirmationTimeout = 30000, errorHandler } = options;

  try {
    const confirmButton = new ButtonBuilder()
      .setCustomId(`confirm_yes_${member.user.id}_${Date.now()}`)
      .setLabel('✅ Confirm')
      .setStyle(ButtonStyle.Success)
      .setDisabled(false);

    const cancelButton = new ButtonBuilder()
      .setCustomId(`confirm_no_${member.user.id}_${Date.now()}`)
      .setLabel('❌ Cancel')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(false);

    const row = new ActionRowBuilder().addComponents(confirmButton, cancelButton);

    const isEmbed = embedOrText instanceof EmbedBuilder;
    const confirmMsg = isEmbed
      ? await message.reply({ embeds: [embedOrText], components: [row] })
      : await message.reply({ content: embedOrText, components: [row] });

    console.log(`🔘 [BUTTON] Confirmation sent to ${member.user.tag} (${member.user.id})`);

    const collector = confirmMsg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: confirmationTimeout,
      filter: i => {
        const matches = i.user.id === member.user.id;
        if (!matches) {
          console.log(`🔘 [BUTTON] Ignoring click from ${i.user.tag} (expected ${member.user.tag})`);
        }
        return matches;
      }
    });

    collector.on('collect', async (interaction) => {
      try {
        const isConfirm = interaction.customId.startsWith('confirm_yes_');
        console.log(`🔘 [BUTTON] ${member.user.tag} clicked ${isConfirm ? 'Confirm' : 'Cancel'}`);

        // Create fresh disabled buttons (defensive: avoid any potential mutation of originals)
        const disabledConfirmButton = new ButtonBuilder()
          .setCustomId(confirmButton.data.custom_id)
          .setLabel(confirmButton.data.label)
          .setStyle(confirmButton.data.style)
          .setDisabled(true);

        const disabledCancelButton = new ButtonBuilder()
          .setCustomId(cancelButton.data.custom_id)
          .setLabel(cancelButton.data.label)
          .setStyle(cancelButton.data.style)
          .setDisabled(true);

        const disabledRow = new ActionRowBuilder().addComponents(
          disabledConfirmButton,
          disabledCancelButton
        );

        await interaction.update({ components: [disabledRow] }).catch(err => {
          console.error(`❌ [BUTTON] Failed to disable buttons: ${err.message}`);
        });

        if (isConfirm) {
          await onConfirm(confirmMsg);
        } else {
          await onCancel(confirmMsg);
        }

        collector.stop();
      } catch (err) {
        console.error(`❌ [BUTTON] Error handling button click: ${err.message}`);
        await interaction.reply({ content: `❌ An error occurred: ${err.message}`, ephemeral: true }).catch(err => errorHandler?.silentError(err, 'button error interaction reply'));
      }
    });

    collector.on('end', async (collected, reason) => {
      console.log(`🔘 [BUTTON] Collector ended: ${reason} (${collected.size} interactions)`);

      if (reason === 'time' && collected.size === 0) {
        // Create fresh disabled buttons (defensive: avoid any potential mutation of originals)
        const disabledConfirmButton = new ButtonBuilder()
          .setCustomId(confirmButton.data.custom_id)
          .setLabel(confirmButton.data.label)
          .setStyle(confirmButton.data.style)
          .setDisabled(true);

        const disabledCancelButton = new ButtonBuilder()
          .setCustomId(cancelButton.data.custom_id)
          .setLabel(cancelButton.data.label)
          .setStyle(cancelButton.data.style)
          .setDisabled(true);

        const disabledRow = new ActionRowBuilder().addComponents(
          disabledConfirmButton,
          disabledCancelButton
        );

        if (errorHandler?.safeEdit) {
          await errorHandler.safeEdit(confirmMsg, { components: [disabledRow] }, 'confirmation timeout disable buttons');
        }
        await message.reply("⏱️ Confirmation timed out.").catch(err => errorHandler?.silentError(err, 'confirmation timeout reply'));
      }
    });
  } catch (err) {
    console.error(`❌ [BUTTON] Error in awaitConfirmation: ${err.message}`);
    throw err;
  }
}

module.exports = {
  createDisabledRow,
  awaitConfirmation,
};
