const { EmbedBuilder, ActionRowBuilder, ButtonBuilder } = require("discord.js");

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
 * Splits a list of items into multiple Discord embeds to avoid limits.
 * Discord allows max 10 fields per embed and 6000 chars total per embed.
 * 
 * @param {string} title - Base title for embeds (will add page number)
 * @param {Array<string>} items - Array of items to display (one per line)
 * @param {number} itemsPerPage - Max items per embed (default 20)
 * @param {Object} options - Additional options
 * @param {number} options.color - Embed color (default 0xffd700 gold)
 * @param {string} options.footer - Footer text
 * @returns {Array<EmbedBuilder>} Array of embed builders
 */
function createPaginatedEmbeds(title, items, itemsPerPage = 20, options = {}) {
  const { color = 0xffd700, footer = '' } = options;
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

module.exports = {
  createDisabledRow,
  createPaginatedEmbeds,
};
