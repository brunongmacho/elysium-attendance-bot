/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║              GUILD MEMBER UPDATE EVENT HANDLER                           ║
 * ║  Detects Discord nickname changes and syncs to Google Sheets             ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * @file bot/events/guild-member-update.js
 * @description Detects when a guild member's nickname changes and
 *              automatically updates the Member Registry and all WEEK_*
 *              attendance sheets to reflect the new name.
 *
 * @dependencies
 * - discord.js (Events)
 * - utils/logger
 *
 * @usage
 *   const { createGuildMemberUpdateHandler } = require('./bot/events/guild-member-update');
 *   client.on(Events.GuildMemberUpdate, createGuildMemberUpdateHandler(client, config, {
 *     sheetAPI,
 *   }));
 */

const { Events } = require("discord.js");
const { createLogger } = require('../../utils/logger');
const logger = createLogger('guild-member-update');

/**
 * Creates a handler for Discord GuildMemberUpdate events.
 *
 * When a member's nickname changes, this handler:
 * 1. Detects the old vs new nickname
 * 2. Calls Code.js `renameMember` to update Member Registry
 * 3. Find-and-replaces old nickname in all WEEK_* attendance sheets
 *
 * @param {import('discord.js').Client} client - Discord Client
 * @param {Object} config - Bot configuration
 * @param {Object} modules - Additional dependencies
 * @param {Object} modules.sheetAPI - Sheet API for webhook calls
 * @returns {Function} Handler function for GuildMemberUpdate event
 */
function createGuildMemberUpdateHandler(client, config, { sheetAPI }) {
  /**
   * @param {import('discord.js').GuildMember} oldMember - Member state before update
   * @param {import('discord.js').GuildMember} newMember - Member state after update
   */
  return async (oldMember, newMember) => {
    // Skip bots
    if (oldMember.user.bot) return;

    // Get nicknames (fall back to username if no server nickname)
    const oldNickname = oldMember.nickname || oldMember.user.displayName;
    const newNickname = newMember.nickname || newMember.user.displayName;

    // Only proceed if the nickname actually changed
    if (oldNickname === newNickname) return;

    const tag = newMember.user.tag;
    const id = newMember.id;

    logger.info(`👤 Nickname change detected: ${oldNickname} → ${newNickname} (${tag})`);

    try {
      const result = await sheetAPI.call('renameMember', {
        discordId: id,
        oldNickname: oldNickname,
        newNickname: newNickname,
        discordUsername: newMember.user.username,
      });

      logger.info(`✅ Registry updated: ${oldNickname} → ${newNickname} (${tag}): ${result.message}`);
    } catch (error) {
      logger.error(`❌ Failed to update registry for ${tag} (${id}): ${error.message}`);
    }
  };
}

module.exports = { createGuildMemberUpdateHandler };
