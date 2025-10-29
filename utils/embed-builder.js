/**
 * Utility functions for building Discord embeds
 */

const { EmbedBuilder } = require("discord.js");

// Color constants
const COLORS = {
  SUCCESS: 0x00ff00,
  WARNING: 0xffa500,
  ERROR: 0xff0000,
  INFO: 0x4a90e2,
  AUCTION: 0xffd700,
};

// Emoji constants
const EMOJI = {
  SUCCESS: "✅",
  ERROR: "❌",
  WARNING: "⚠️",
  INFO: "ℹ️",
  AUCTION: "🔨",
  BID: "💰",
  TIME: "⏱️",
  TROPHY: "🏆",
  FIRE: "🔥",
  LOCK: "🔒",
  CHART: "📊",
  PAUSE: "⏸️",
  PLAY: "▶️",
  CLOCK: "🕐",
  LIST: "📋",
};

/**
 * Create a success embed
 */
function createSuccessEmbed(title, description, fields = []) {
  const embed = new EmbedBuilder()
    .setColor(COLORS.SUCCESS)
    .setTitle(`${EMOJI.SUCCESS} ${title}`)
    .setTimestamp();

  if (description) embed.setDescription(description);
  if (fields.length > 0) embed.addFields(fields);

  return embed;
}

/**
 * Create an error embed
 */
function createErrorEmbed(title, description, fields = []) {
  const embed = new EmbedBuilder()
    .setColor(COLORS.ERROR)
    .setTitle(`${EMOJI.ERROR} ${title}`)
    .setTimestamp();

  if (description) embed.setDescription(description);
  if (fields.length > 0) embed.addFields(fields);

  return embed;
}

/**
 * Create a warning embed
 */
function createWarningEmbed(title, description, fields = []) {
  const embed = new EmbedBuilder()
    .setColor(COLORS.WARNING)
    .setTitle(`${EMOJI.WARNING} ${title}`)
    .setTimestamp();

  if (description) embed.setDescription(description);
  if (fields.length > 0) embed.addFields(fields);

  return embed;
}

/**
 * Create an info embed
 */
function createInfoEmbed(title, description, fields = []) {
  const embed = new EmbedBuilder()
    .setColor(COLORS.INFO)
    .setTitle(`${EMOJI.INFO} ${title}`)
    .setTimestamp();

  if (description) embed.setDescription(description);
  if (fields.length > 0) embed.addFields(fields);

  return embed;
}

/**
 * Create an auction embed
 */
function createAuctionEmbed(title, description, fields = []) {
  const embed = new EmbedBuilder()
    .setColor(COLORS.AUCTION)
    .setTitle(`${EMOJI.AUCTION} ${title}`)
    .setTimestamp();

  if (description) embed.setDescription(description);
  if (fields.length > 0) embed.addFields(fields);

  return embed;
}

/**
 * Safely add fields to an embed with validation
 */
function safeAddFields(embed, fields) {
  try {
    // Validate and truncate field values if needed
    const validatedFields = fields.map(field => {
      let value = field.value || 'No value';

      // Discord embed field values have a 1024 character limit
      if (value.length > 1024) {
        value = value.substring(0, 1020) + "...";
      }

      // Ensure it's not empty
      if (!value || value.trim().length === 0) {
        value = "No value";
      }

      return {
        name: field.name,
        value: value,
        inline: field.inline !== undefined ? field.inline : false
      };
    });

    embed.addFields(...validatedFields);
  } catch (err) {
    console.error(`${EMOJI.ERROR} Error adding fields to embed:`, err);
    // Fallback: add a single error field
    embed.addFields({
      name: "Error",
      value: "Failed to format some fields",
      inline: false
    });
  }

  return embed;
}

/**
 * Create a tally summary embed
 */
function createTallySummary(results) {
  const winnersWithSpending = results.filter(r => r.totalSpent > 0);

  if (winnersWithSpending.length === 0) {
    return createInfoEmbed(
      "Bidding Points Tally",
      "No points were spent this session."
    );
  }

  const totalSpent = winnersWithSpending.reduce((sum, r) => sum + r.totalSpent, 0);
  const description = `**Points spent this session:**\n\n${
    winnersWithSpending
      .sort((a, b) => b.totalSpent - a.totalSpent)
      .map((r, i) => `${i + 1}. **${r.member}** - ${r.totalSpent} pts`)
      .join('\n')
  }`;

  return new EmbedBuilder()
    .setColor(COLORS.SUCCESS)
    .setTitle(`${EMOJI.CHART} Bidding Points Tally`)
    .setDescription(description)
    .setFooter({ text: `Total: ${totalSpent} pts spent` })
    .setTimestamp();
}

module.exports = {
  COLORS,
  EMOJI,
  createSuccessEmbed,
  createErrorEmbed,
  createWarningEmbed,
  createInfoEmbed,
  createAuctionEmbed,
  safeAddFields,
  createTallySummary,
};
