/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║          AUCTIONEERING COMMANDS - Command Handlers                       ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Command handlers: handleQueueList,
 * handleCancelItem, handleSkipItem, handleForceSubmitResults,
 * endAuctionSession, handleMoveToDistribution, updateCurrentItemState.
 *
 * @module modules/auctioneering/commands
 */

const { EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle, ComponentType } = require("discord.js");
const { state } = require('./state');
const { COLORS, EMOJI, TIMEOUTS } = require('./constants');
const { createPaginatedEmbeds, createDisabledRow } = require('./utilities');
const { fetchSheetItems } = require('./persistence');
const { finalizeSession } = require('./item-completion');
const { clearAllAuctionTimers } = require('./utilities');

/**
 * Creates pagination buttons for queue navigation.
 */
function createPaginationButtons(currentPage, totalPages, userId) {
  const prevButton = new ButtonBuilder()
    .setCustomId(`queuelist_prev_${userId}_${Date.now()}`)
    .setLabel('◀ Previous')
    .setStyle(ButtonStyle.Primary)
    .setDisabled(currentPage === 0);

  const nextButton = new ButtonBuilder()
    .setCustomId(`queuelist_next_${userId}_${Date.now()}`)
    .setLabel('Next ▶')
    .setStyle(ButtonStyle.Primary)
    .setDisabled(currentPage >= totalPages - 1);

  return new ActionRowBuilder().addComponents(prevButton, nextButton);
}

/**
 * Builds an embed for a specific page of the queue.
 */
function buildQueuePage(sheetItems, bossGroups, noBossItems, currentPage, itemsPerPage = 15) {
  let queueText = "";
  let itemsShown = 0;
  let position = currentPage * itemsPerPage + 1;
  const startIndex = currentPage * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;

  const allOrderedItems = [];
  let sessionNum = 1;

  for (const [boss, items] of Object.entries(bossGroups)) {
    allOrderedItems.push({ type: 'header', boss, sessionNum });
    items.forEach(item => {
      allOrderedItems.push({ type: 'item', ...item, boss, sessionNum });
    });
    sessionNum++;
  }

  if (noBossItems.length > 0) {
    allOrderedItems.push({ type: 'header', boss: 'GENERAL ITEMS', sessionNum });
    noBossItems.forEach(item => {
      allOrderedItems.push({ type: 'item', ...item, boss: 'GENERAL ITEMS', sessionNum });
    });
  }

  const itemsOnly = allOrderedItems.filter(x => x.type === 'item');
  const pageItems = itemsOnly.slice(startIndex, endIndex);

  let currentSession = null;

  pageItems.forEach((item, idx) => {
    if (currentSession !== item.sessionNum) {
      currentSession = item.sessionNum;
      queueText += `**🔥 SESSION ${item.sessionNum} - ${item.boss}**\n`;
    }

    const qty = item.quantity > 1 ? ` x${item.quantity}` : "";
    const globalPosition = startIndex + idx + 1;
    queueText += `${globalPosition}. ${item.item}${qty} - ${item.startPrice}pts • ${item.duration}m\n`;
    itemsShown++;
  });

  const totalPages = Math.ceil(itemsOnly.length / itemsPerPage);
  const totalSessions = Object.keys(bossGroups).length + (noBossItems.length > 0 ? 1 : 0);
  const totalItems = sheetItems.length;

  const footerNote = `\n**ℹ️ Note:** Order shown is how items will auction when you run \`!startauction\`\n✅ **All guild members can bid!**`;
  queueText += footerNote;

  const embed = new EmbedBuilder()
    .setColor(0x4a90e2)
    .setTitle(`${EMOJI.LIST} Auction Queue (Preview)`)
    .setDescription(queueText)
    .addFields(
      { name: `${EMOJI.FIRE} Sessions`, value: `${totalSessions}`, inline: true },
      { name: `${EMOJI.LIST} Total Items`, value: `${totalItems}`, inline: true },
      { name: `📄 Page`, value: `${currentPage + 1}/${totalPages}`, inline: true }
    )
    .setFooter({
      text: `Showing items ${startIndex + 1}-${Math.min(endIndex, totalItems)} of ${totalItems} • Use !startauction to begin`,
    })
    .setTimestamp();

  return { embed, totalPages, itemsShown };
}

/**
 * Handles the !queue command to display current auction queue.
 */
async function handleQueueList(message, biddingState) {
  const auctQueue = state.auctionState.sessions || [];
  const biddingQueue = biddingState.q || [];

  // Active auction - show current session items
  if (state.auctionState.active && state.auctionState.sessionItems && state.auctionState.sessionItems.length > 0) {
    const currentIndex = state.auctionState.currentItemIndex || 0;
    const remainingItems = state.auctionState.sessionItems.slice(currentIndex);
    const completedCount = currentIndex;
    const totalCount = state.auctionState.sessionItems.length;

    if (remainingItems.length === 0) {
      return await message.reply(
        `${EMOJI.SUCCESS} **All items in current session completed!**\n` +
        `${completedCount}/${totalCount} items auctioned.\n\n` +
        `Waiting for session finalization...`
      );
    }

    let queueText = "";
    remainingItems.slice(0, 20).forEach((item, idx) => {
      const position = currentIndex + idx + 1;
      const qty = item.quantity > 1 ? ` x${item.quantity}` : "";
      const status = idx === 0 && state.auctionState.currentItem ? " **(ACTIVE NOW)**" : "";
      queueText += `${position}. ${item.item}${qty} - ${item.startPrice}pts • ${item.duration}m${status}\n`;
    });

    if (remainingItems.length > 20) {
      queueText += `\n*...and ${remainingItems.length - 20} more items*\n`;
    }

    const embed = new EmbedBuilder()
      .setColor(COLORS.AUCTION)
      .setTitle(`${EMOJI.LIST} Current Session Queue`)
      .setDescription(
        `**Progress:** ${completedCount}/${totalCount} items completed\n` +
        `**Remaining:** ${remainingItems.length} items\n\n` +
        queueText
      )
      .setFooter({ text: `Session active • ${remainingItems.length} items remaining` })
      .setTimestamp();

    return await message.reply({ embeds: [embed] });
  }

  // No active auction - preview mode
  const cfg = message.client.config;
  const loadingMsg = await message.reply(
    `${EMOJI.CLOCK} Loading items from Google Sheet...`
  );

  if (!cfg || !cfg.sheet_webhook_url) {
    await state.errorHandler.safeEdit(loadingMsg, `${EMOJI.ERROR} Missing sheet webhook URL in config.`);
    return;
  }

  const sheetItems = await fetchSheetItems();

  if (sheetItems === null) {
    await loadingMsg.edit(
      `${EMOJI.ERROR} Failed to fetch items from Google Sheet.`
    );
    return;
  }

  if (!message.isSlashCommand) {
    await state.errorHandler.safeDelete(loadingMsg, 'message deletion');
  }

  if (sheetItems.length === 0) {
    const noItemsMsg = `${EMOJI.LIST} No items in auction queue.\n\n` +
      `Add items to the **BiddingItems** sheet in Google Sheets with proper boss data.`;

    if (message.isSlashCommand) {
      return await loadingMsg.edit({ content: noItemsMsg, embeds: [] });
    } else {
      return await message.reply(noItemsMsg);
    }
  }

  // Group sheet items by boss for preview
  const bossGroups = {};
  const noBossItemsList = [];

  sheetItems.forEach((item) => {
    const boss = item.boss || "";
    if (!boss) {
      noBossItemsList.push(item);
      return;
    }

    if (!bossGroups[boss]) {
      bossGroups[boss] = [];
    }
    bossGroups[boss].push(item);
  });

  const ITEMS_PER_PAGE = 15;
  let currentPage = 0;
  const { embed: initialEmbed, totalPages } = buildQueuePage(
    sheetItems,
    bossGroups,
    noBossItemsList,
    currentPage,
    ITEMS_PER_PAGE
  );

  const userId = message.author?.id || message.user?.id;

  const components = totalPages > 1
    ? [createPaginationButtons(currentPage, totalPages, userId)]
    : [];

  let queueMessage;
  if (message.isSlashCommand) {
    await loadingMsg.edit({ content: null, embeds: [initialEmbed], components });
    queueMessage = loadingMsg;
  } else {
    queueMessage = await message.reply({ embeds: [initialEmbed], components });
  }

  if (totalPages > 1) {
    const collector = queueMessage.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 300000,
      filter: (i) => i.user.id === userId
    });

    collector.on('collect', async (interaction) => {
      const isPrevious = interaction.customId.includes('_prev_');

      if (isPrevious) {
        currentPage = Math.max(0, currentPage - 1);
      } else {
        currentPage = Math.min(totalPages - 1, currentPage + 1);
      }

      const { embed: newEmbed } = buildQueuePage(
        sheetItems,
        bossGroups,
        noBossItemsList,
        currentPage,
        ITEMS_PER_PAGE
      );

      const newButtons = createPaginationButtons(currentPage, totalPages, userId);

      await interaction.update({
        embeds: [newEmbed],
        components: [newButtons]
      });
    });

    collector.on('end', async (collected, reason) => {
      if (reason === 'time' && collected.size === 0) {
        try {
          const disabledRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('prev_disabled')
              .setLabel('◀ Previous')
              .setStyle(ButtonStyle.Primary)
              .setDisabled(true),
            new ButtonBuilder()
              .setCustomId('next_disabled')
              .setLabel('Next ▶')
              .setStyle(ButtonStyle.Primary)
              .setDisabled(true)
          );

          await queueMessage.edit({ components: [disabledRow] });
        } catch (error) {
          // Message might have been deleted
        }
      }
    });
  }
}

/**
 * Handles the !cancelitem command to remove an item from the queue.
 */
async function handleCancelItem(message) {
  if (!state.auctionState.active || !state.auctionState.currentItem) {
    return await message.reply(`${EMOJI.ERROR} No active auction`);
  }

  const cancelConfirmBtn = new ButtonBuilder()
    .setCustomId(`cancelitem_confirm_${message.author.id}_${Date.now()}`)
    .setLabel('✅ Yes, Cancel Item')
    .setStyle(ButtonStyle.Danger);

  const cancelCancelBtn = new ButtonBuilder()
    .setCustomId(`cancelitem_cancel_${message.author.id}_${Date.now()}`)
    .setLabel('❌ No, Keep Item')
    .setStyle(ButtonStyle.Secondary);

  const cancelRow = new ActionRowBuilder().addComponents(cancelConfirmBtn, cancelCancelBtn);

  const canMsg = await message.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0xffa500)
        .setTitle(`${EMOJI.WARNING} Cancel Item?`)
        .setDescription(
          `**${state.auctionState.currentItem.item}**\n\nRefund all locked points?`
        )
        .setFooter({ text: 'Click a button below to confirm' }),
    ],
    components: [cancelRow],
  });

  const cancelCollector = canMsg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: TIMEOUTS.CONFIRMATION,
    filter: i => i.user.id === message.author.id
  });

  cancelCollector.on('collect', async (interaction) => {
    const isConfirm = interaction.customId.startsWith('cancelitem_confirm_');
    const disabledCancelRow = createDisabledRow(cancelConfirmBtn, cancelCancelBtn);

    if (isConfirm) {
      const biddingState = state.biddingModule.getBiddingState();
      if (state.auctionState.currentItem && state.auctionState.currentItem.curWin) {
        const amt = biddingState.lp[state.auctionState.currentItem.curWin] || 0;
        biddingState.lp[state.auctionState.currentItem.curWin] = 0;
        state.biddingModule.saveBiddingState();
      }

      const itemName = state.auctionState.currentItem ? state.auctionState.currentItem.item : "Unknown Item";
      await message.channel.send(`${EMOJI.ERROR} **${itemName}** canceled. Points refunded.`);

      const thread = message.channel;
      if (thread && (thread.type === 11 || thread.type === 12)) {
        try {
          const refreshedThread = await thread.fetch().catch(() => null);
          if (!refreshedThread) {
            state.logger.warn(`⚠️ Thread ${thread.id} no longer exists, skipping lock/archive`);
          } else {
            if (typeof refreshedThread.setLocked === "function") {
              await refreshedThread.setLocked(true, "Item cancelled").catch((err) => {
                state.logger.warn(`⚠️ Failed to lock cancelled thread:`, err.message);
              });
              state.logger.info(`🔒 Locked cancelled thread`);
            }
            await new Promise((resolve) => setTimeout(resolve, 500));
            if (typeof refreshedThread.setArchived === "function") {
              await refreshedThread.setArchived(true, "Item cancelled").catch((err) => {
                state.logger.warn(`⚠️ Failed to archive cancelled thread:`, err.message);
              });
              state.logger.info(`📦 Archived cancelled thread`);
            }
          }
        } catch (err) {
          state.logger.warn(`⚠️ Error closing cancelled thread:`, err.message);
        }
      }

      const parentChannel = thread.parent || message.channel;
      state.auctionState.currentItem = null;
      state.auctionState.currentItemIndex++;
      const { auctionNextItem } = require('./item-auction');
      state.auctionState.timers.nextItem = setTimeout(async () => {
        await auctionNextItem(message.client, state.cfg, parentChannel);
      }, 20000);

      const successEmbed = new EmbedBuilder()
        .setColor(0x00ff00)
        .setTitle(`${EMOJI.SUCCESS} Item Cancelled`)
        .setDescription('Item cancelled and points refunded')
        .setTimestamp();

      await interaction.update({ embeds: [successEmbed], components: [disabledCancelRow] });
      cancelCollector.stop();
    } else {
      const keepEmbed = new EmbedBuilder()
        .setColor(0x00ff00)
        .setTitle(`${EMOJI.SUCCESS} Item Kept`)
        .setDescription('Item cancellation aborted')
        .setTimestamp();

      await interaction.update({ embeds: [keepEmbed], components: [disabledCancelRow] });
      cancelCollector.stop();
    }
  });

  cancelCollector.on('end', async (collected, reason) => {
    if (reason === 'time' && collected.size === 0) {
      const disabledCancelRow = new ActionRowBuilder().addComponents(
        ButtonBuilder.from(cancelConfirmBtn).setDisabled(true),
        ButtonBuilder.from(cancelCancelBtn).setDisabled(true)
      );

      const timeoutEmbed = new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle(`${EMOJI.ERROR} Timed Out`)
        .setDescription('Confirmation expired')
        .setTimestamp();

      await canMsg.edit({ embeds: [timeoutEmbed], components: [disabledCancelRow] }).catch(state.errorHandler.safeCatch('edit cancel confirmation timeout'));
    }
  });
}

/**
 * Handles the !skipitem command to skip the current item without recording a winner.
 */
async function handleSkipItem(message) {
  if (!state.auctionState.active || !state.auctionState.currentItem) {
    return await message.reply(`${EMOJI.ERROR} No active auction`);
  }

  const skipConfirmBtn = new ButtonBuilder()
    .setCustomId(`skipitem_confirm_${message.author.id}_${Date.now()}`)
    .setLabel('✅ Yes, Skip Item')
    .setStyle(ButtonStyle.Primary);

  const skipCancelBtn = new ButtonBuilder()
    .setCustomId(`skipitem_cancel_${message.author.id}_${Date.now()}`)
    .setLabel('❌ No, Continue')
    .setStyle(ButtonStyle.Secondary);

  const skipRow = new ActionRowBuilder().addComponents(skipConfirmBtn, skipCancelBtn);

  const skpMsg = await message.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0xffa500)
        .setTitle(`${EMOJI.WARNING} Skip Item?`)
        .setDescription(
          `**${state.auctionState.currentItem.item}**\n\nMark as no sale, move to next?`
        )
        .setFooter({ text: 'Click a button below to confirm' }),
    ],
    components: [skipRow],
  });

  const skipCollector = skpMsg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: TIMEOUTS.CONFIRMATION,
    filter: i => i.user.id === message.author.id
  });

  skipCollector.on('collect', async (interaction) => {
    const isConfirm = interaction.customId.startsWith('skipitem_confirm_');
    const disabledSkipRow = createDisabledRow(skipConfirmBtn, skipCancelBtn);

    if (isConfirm) {
      const biddingState = state.biddingModule.getBiddingState();
      if (state.auctionState.currentItem && state.auctionState.currentItem.curWin) {
        const amt = biddingState.lp[state.auctionState.currentItem.curWin] || 0;
        biddingState.lp[state.auctionState.currentItem.curWin] = 0;
        state.biddingModule.saveBiddingState();
      }

      const itemName = state.auctionState.currentItem ? state.auctionState.currentItem.item : "Unknown Item";
      await message.channel.send(`⭐️ **${itemName}** skipped (no sale).`);

      const thread = message.channel;
      if (thread && (thread.type === 11 || thread.type === 12)) {
        try {
          const refreshedThread = await thread.fetch().catch(() => null);
          if (!refreshedThread) {
            state.logger.warn(`⚠️ Thread ${thread.id} no longer exists, skipping lock/archive`);
          } else {
            if (typeof refreshedThread.setLocked === "function") {
              await refreshedThread.setLocked(true, "Item skipped").catch((err) => {
                state.logger.warn(`⚠️ Failed to lock skipped thread:`, err.message);
              });
              state.logger.info(`🔒 Locked skipped thread`);
            }
            await new Promise((resolve) => setTimeout(resolve, 500));
            if (typeof refreshedThread.setArchived === "function") {
              await refreshedThread.setArchived(true, "Item skipped").catch((err) => {
                state.logger.warn(`⚠️ Failed to archive skipped thread:`, err.message);
              });
              state.logger.info(`📦 Archived skipped thread`);
            }
          }
        } catch (err) {
          state.logger.warn(`⚠️ Error closing skipped thread:`, err.message);
        }
      }

      const parentChannel = thread.parent || message.channel;
      state.auctionState.currentItem = null;
      state.auctionState.currentItemIndex++;
      const { auctionNextItem } = require('./item-auction');
      state.auctionState.timers.nextItem = setTimeout(async () => {
        await auctionNextItem(message.client, state.cfg, parentChannel);
      }, 20000);

      const successEmbed = new EmbedBuilder()
        .setColor(0x00ff00)
        .setTitle(`${EMOJI.SUCCESS} Item Skipped`)
        .setDescription('Item skipped (no sale)')
        .setTimestamp();

      await interaction.update({ embeds: [successEmbed], components: [disabledSkipRow] });
      skipCollector.stop();
    } else {
      const continueEmbed = new EmbedBuilder()
        .setColor(0x00ff00)
        .setTitle(`${EMOJI.SUCCESS} Continuing`)
        .setDescription('Item skip cancelled')
        .setTimestamp();

      await interaction.update({ embeds: [continueEmbed], components: [disabledSkipRow] });
      skipCollector.stop();
    }
  });

  skipCollector.on('end', async (collected, reason) => {
    if (reason === 'time' && collected.size === 0) {
      const disabledSkipRow = new ActionRowBuilder().addComponents(
        ButtonBuilder.from(skipConfirmBtn).setDisabled(true),
        ButtonBuilder.from(skipCancelBtn).setDisabled(true)
      );

      const timeoutEmbed = new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle(`${EMOJI.ERROR} Timed Out`)
        .setDescription('Confirmation expired')
        .setTimestamp();

      await skpMsg.edit({ embeds: [timeoutEmbed], components: [disabledSkipRow] }).catch(state.errorHandler.safeCatch('edit skip confirmation timeout'));
    }
  });
}

/**
 * Handles the !forcesubmit command to force-submit results if finalization fails.
 */
async function handleForceSubmitResults(message, config, biddingModule) {
  if (state.auctionState.sessionItems.length === 0) {
    return await message.reply(`${EMOJI.ERROR} No results to submit`);
  }

  const submitButton = new ButtonBuilder()
    .setCustomId(`forcesubmit_confirm_${message.author.id}_${Date.now()}`)
    .setLabel('✅ Submit Results')
    .setStyle(ButtonStyle.Success)
    .setDisabled(false);

  const cancelButton = new ButtonBuilder()
    .setCustomId(`forcesubmit_cancel_${message.author.id}_${Date.now()}`)
    .setLabel('❌ Cancel')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(false);

  const row = new ActionRowBuilder().addComponents(submitButton, cancelButton);

  const resultsList = state.auctionState.sessionItems
    .map((a, idx) => `${idx + 1}. **${a.item}**: ${a.winner || 'undefined'} - ${a.amount || 0}pts`);

  const totalItems = state.auctionState.sessionItems.length;
  const totalPoints = state.auctionState.sessionItems.reduce((sum, a) => sum + (a.amount || 0), 0);

  const previewEmbed = new EmbedBuilder()
    .setColor(0xffa500)
    .setTitle(`${EMOJI.WARNING} Force Submit?`)
    .setDescription(`**${totalItems} items** to submit\n**Total points:** ${totalPoints} pts`)
    .addFields({
      name: `${EMOJI.LIST} Preview (first 10)`,
      value: resultsList.slice(0, 10).join('\n') + (totalItems > 10 ? `\n*... and ${totalItems - 10} more*` : ''),
      inline: false,
    })
    .setFooter({ text: 'Click a button below to confirm' });

  const fsMsg = await message.reply({
    embeds: [previewEmbed],
    components: [row],
  });

  const fullResultsEmbeds = createPaginatedEmbeds(
    `${EMOJI.LIST} All Results - Force Submit`,
    resultsList,
    15,
    { color: 0xffa500, footer: `Total: ${totalItems} items, ${totalPoints} pts` }
  );

  state.auctionState._pendingForceSubmitEmbeds = fullResultsEmbeds;
  state.auctionState._pendingForceSubmitTotalPoints = totalPoints;

  const collector = fsMsg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: TIMEOUTS.CONFIRMATION,
    filter: i => i.user.id === message.author.id
  });

  collector.on('collect', async (interaction) => {
    const isConfirm = interaction.customId.startsWith('forcesubmit_confirm_');
    const disabledRow = createDisabledRow(submitButton, cancelButton);

    if (isConfirm) {
      await biddingModule.submitSessionTally(config, state.auctionState.sessionItems);

      const fullEmbeds = state.auctionState._pendingForceSubmitEmbeds || [];
      const totalPts = state.auctionState._pendingForceSubmitTotalPoints || 0;

      if (fullEmbeds.length > 0) {
        fullEmbeds[0]
          .setColor(0x00ff00)
          .setTitle(`${EMOJI.SUCCESS} Results Submitted`)
          .setDescription(`**${state.auctionState.sessionItems.length} items** submitted\n**Total points:** ${totalPts} pts`);
      }

      const channel = interaction.channel;
      try {
        for (const embed of fullEmbeds) {
          await channel.send({ embeds: [embed] });
        }

        const successEmbed = new EmbedBuilder()
          .setColor(0x00ff00)
          .setTitle(`${EMOJI.SUCCESS} Results Submitted`)
          .setDescription(`Results submitted successfully!\nSent ${fullEmbeds.length} embed(s) with all results.`)
          .setTimestamp();

        await interaction.update({ embeds: [successEmbed], components: [disabledRow] });
      } finally {
        state.auctionState.sessionItems = [];
        delete state.auctionState._pendingForceSubmitEmbeds;
        delete state.auctionState._pendingForceSubmitTotalPoints;
        collector.stop();
      }
    } else {
      const cancelEmbed = new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle(`${EMOJI.ERROR} Cancelled`)
        .setDescription('Force submit cancelled')
        .setTimestamp();

      await interaction.update({ embeds: [cancelEmbed], components: [disabledRow] });
      collector.stop();
    }
  });

  collector.on('end', async (collected, reason) => {
    if (reason === 'time' && collected.size === 0) {
      const disabledRow = new ActionRowBuilder().addComponents(
        ButtonBuilder.from(submitButton).setDisabled(true),
        ButtonBuilder.from(cancelButton).setDisabled(true)
      );

      const timeoutEmbed = new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle(`${EMOJI.ERROR} Timed Out`)
        .setDescription('Confirmation expired')
        .setTimestamp();

      await fsMsg.edit({ embeds: [timeoutEmbed], components: [disabledRow] }).catch(state.errorHandler.safeCatch('edit forcesubmit confirmation timeout'));
    }
  });
}

/**
 * Updates the current item's state with new values.
 */
function updateCurrentItemState(updates) {
  if (!state.auctionState.currentItem) return false;

  Object.assign(state.auctionState.currentItem, updates);
  state.logger.info(`${EMOJI.SUCCESS} Item state updated:`, Object.keys(updates));
  return true;
}

/**
 * Manually ends the current auction session.
 */
async function endAuctionSession(client, config, channel) {
  state.logger.info(`🛑 Ending auction session (forced by admin)...`);

  if (!state.auctionState.active) {
    state.logger.info(`${EMOJI.WARNING} No active auction to end`);
    return;
  }

  // Clear all timers
  clearAllAuctionTimers();

  // If there's a current item, mark it as cancelled
  if (state.auctionState.currentItem && state.auctionState.currentItem.status === "active") {
    state.auctionState.currentItem.status = "cancelled";

    try {
      const currentThread = state.auctionState.currentItem.thread;
      if (currentThread && typeof currentThread.send === "function") {
        await currentThread.send({
          embeds: [
            new EmbedBuilder()
              .setColor(COLORS.ERROR)
              .setTitle(`${EMOJI.ERROR} Auction Cancelled`)
              .setDescription(`This auction was ended by an administrator.`),
          ],
        });

        if (typeof currentThread.setArchived === "function") {
          await currentThread.setArchived(true, "Session ended by admin").catch(state.errorHandler.safeCatch('archive thread on session end'));
        }
      }
    } catch (err) {
      state.logger.warn(`⚠️ Could not notify current item thread:`, err.message);
    }
  }

  // Finalize the session
  try {
    await finalizeSession(client, config, channel);
    state.logger.info(`✅ Auction session ended successfully`);
  } catch (err) {
    state.logger.error(`Failed to finalize auction session:`, err.message);
    state.auctionState.sessionItems = []; // Still clear on failure
    state.auctionState.active = false;
  }
}

/**
 * Handles the !movetodistribution command to move won items to distribution sheet.
 */
async function handleMoveToDistribution(message, config, client) {
  state.logger.info(`📦 Admin triggered manual ForDistribution move...`);

  try {
    const statusMsg = await message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(COLORS.INFO)
          .setTitle(`${EMOJI.CLOCK} Moving Items to ForDistribution`)
          .setDescription(
            `Scanning BiddingItems sheet for completed auctions...\n\nThis may take a few seconds.`
          ),
      ],
    });

    const maxRetries = 3;
    let moveSuccess = false;
    let moveData = null;
    let lastError = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        state.logger.info(`📦 Move attempt ${attempt}/${maxRetries}...`);

        moveData = await state.sheetAPI.call('moveAuctionedItemsToForDistribution');
        state.logger.info(`✅ Moved ${moveData.moved || 0} items to ForDistribution`);
        moveSuccess = true;
        break;
      } catch (err) {
        lastError = err.message;
        state.logger.error(`⚠️ Move attempt ${attempt} failed:`, err);

        if (attempt < maxRetries) {
          const delay = Math.min(
            Math.pow(2, attempt) * 1000 + Math.random() * 1000,
            30000
          );
          state.logger.info(`⏳ Retrying in ${Math.round(delay/1000)}s...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    if (moveSuccess) {
      await statusMsg.edit({
        embeds: [
          new EmbedBuilder()
            .setColor(COLORS.SUCCESS)
            .setTitle(`${EMOJI.SUCCESS} Items Moved Successfully`)
            .setDescription(
              `**${moveData.moved || 0} item(s)** moved from BiddingItems to ForDistribution\n\n` +
              `**${moveData.skipped || 0} item(s)** skipped (no winner)\n` +
              `**${moveData.total || 0} total items** processed`
            )
            .addFields({
              name: `${EMOJI.INFO} Details`,
              value:
                `Items with winners have been:\n` +
                `✅ Copied to ForDistribution sheet\n` +
                `✅ Removed from BiddingItems sheet\n\n` +
                `Items without winners remain in BiddingItems for future auctions.`,
              inline: false,
            })
            .setFooter({ text: `Check the ForDistribution sheet in Google Sheets` })
            .setTimestamp(),
        ],
      });

      const mainGuild = await client.guilds.fetch(config.main_guild_id);
      const adminLogs = await mainGuild.channels
        .fetch(config.admin_logs_channel_id)
        .catch(() => null);

      if (adminLogs && moveData.moved > 0) {
        await adminLogs.send(
          `📦 **Manual ForDistribution Move**\n` +
          `Triggered by <@${message.author.id}>\n` +
          `**Moved:** ${moveData.moved} items | **Skipped:** ${moveData.skipped} items`
        );
      }
    } else {
      await statusMsg.edit({
        embeds: [
          new EmbedBuilder()
            .setColor(COLORS.ERROR)
            .setTitle(`${EMOJI.ERROR} Move Failed`)
            .setDescription(
              `Failed to move items after ${maxRetries} attempts.\n\n**Error:** ${lastError}`
            )
            .addFields({
              name: `${EMOJI.WARNING} Possible Causes`,
              value:
                `• Google Sheets API timeout\n` +
                `• Network connectivity issues\n` +
                `• Sheet permissions problem\n` +
                `• Webhook URL misconfigured`,
              inline: false,
            }, {
              name: `${EMOJI.INFO} Manual Fix`,
              value:
                `Open Google Sheets and run:\n` +
                `\`\`\`\nmoveAllItemsWithWinnersToForDistribution()\n\`\`\`\n` +
                `from the Apps Script editor (Extensions → Apps Script)`,
              inline: false,
            })
            .setFooter({ text: `Contact support if issue persists` })
            .setTimestamp(),
        ],
      });
    }
  } catch (err) {
    state.logger.error(`❌ handleMoveToDistribution error:`, err);
    await message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(COLORS.ERROR)
          .setTitle(`${EMOJI.ERROR} Command Error`)
          .setDescription(`An unexpected error occurred:\n\`\`\`${err.message}\`\`\``),
      ],
    });
  }
}

module.exports = {
  createPaginationButtons,
  buildQueuePage,
  handleQueueList,
  handleCancelItem,
  handleSkipItem,
  handleForceSubmitResults,
  updateCurrentItemState,
  endAuctionSession,
  handleMoveToDistribution,
};
