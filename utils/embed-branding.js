/**
 * ============================================================================
 * EMBED BRANDING UTILITY
 * ============================================================================
 *
 * Provides helper functions for adding guild branding (logo, footer) to embeds.
 * Ensures consistent branding across all bot messages.
 *
 * @module utils/embed-branding
 * ============================================================================
 */

/**
 * Add guild branding to an embed as footer icon
 * Use this when the embed already has a thumbnail (e.g., boss images, user avatars)
 *
 * @param {EmbedBuilder} embed - The embed to add branding to
 * @param {Guild} guild - Discord guild object
 * @param {string} footerText - Optional custom footer text (defaults to existing or 'ELYSIUM Guild')
 * @returns {EmbedBuilder} The embed with branding added
 */
function addGuildFooter(embed, guild, footerText = null) {
  if (!guild) return embed;

  const iconURL = guild.iconURL();
  if (!iconURL) return embed;

  // Get existing footer text or use default
  const text = footerText || embed.data.footer?.text || 'ELYSIUM Guild';

  embed.setFooter({
    text: text,
    iconURL: iconURL
  });

  return embed;
}

/**
 * Add guild branding to an embed as thumbnail
 * Use this when the embed doesn't have other images
 *
 * @param {EmbedBuilder} embed - The embed to add branding to
 * @param {Guild} guild - Discord guild object
 * @returns {EmbedBuilder} The embed with branding added
 */
function addGuildThumbnail(embed, guild) {
  if (!guild) return embed;

  const iconURL = guild.iconURL();
  if (!iconURL) return embed;

  embed.setThumbnail(iconURL);
  return embed;
}

/**
 * Add guild branding to an embed as author icon
 * Use this for official announcements and notifications
 *
 * @param {EmbedBuilder} embed - The embed to add branding to
 * @param {Guild} guild - Discord guild object
 * @param {string} authorName - Optional custom author name (defaults to guild name)
 * @returns {EmbedBuilder} The embed with branding added
 */
function addGuildAuthor(embed, guild, authorName = null) {
  if (!guild) return embed;

  const iconURL = guild.iconURL();
  if (!iconURL) return embed;

  const name = authorName || guild.name || 'ELYSIUM Guild';

  embed.setAuthor({
    name: name,
    iconURL: iconURL
  });

  return embed;
}

/**
 * Get guild icon URL safely
 * @param {Guild} guild - Discord guild object
 * @returns {string|null} Guild icon URL or null
 */
function getGuildIconURL(guild) {
  if (!guild) return null;
  return guild.iconURL();
}

// ============================================================================
// MODULE EXPORTS
// ============================================================================

module.exports = {
  addGuildFooter,
  addGuildThumbnail,
  addGuildAuthor
};
