/**
 * =============================================================================
 * SLASH COMMAND REGISTRATION UTILITY
 * =============================================================================
 *
 * Registers slash commands with Discord API.
 * Supports both guild-specific (instant) and global (1-hour cache) registration.
 *
 * @module commands/register-commands
 * @author ELYSIUM Development Team
 */

const { REST, Routes } = require('discord.js');
const { allCommands } = require('./slash-commands');

/**
 * Register slash commands with Discord
 *
 * @param {Client} client - Discord client instance
 * @param {string} guildId - Guild ID for guild-specific registration (optional)
 * @returns {Promise<void>}
 */
async function registerCommands(client, guildId = null) {
  const rest = new REST({ version: '10' }).setToken(client.token);

  try {
    console.log(`📋 Registering ${allCommands.length} slash commands...`);

    if (guildId) {
      // Guild-specific registration (instant updates)
      await rest.put(
        Routes.applicationGuildCommands(client.user.id, guildId),
        { body: allCommands }
      );
      console.log(`✅ Successfully registered ${allCommands.length} guild commands for guild ${guildId}`);
    } else {
      // Global registration (1-hour cache)
      await rest.put(
        Routes.applicationCommands(client.user.id),
        { body: allCommands }
      );
      console.log(`✅ Successfully registered ${allCommands.length} global commands`);
    }

    // Log registered commands
    console.log(`\n📝 Registered commands:`);
    allCommands.forEach(cmd => {
      console.log(`   - /${cmd.name}: ${cmd.description}`);
    });
    console.log('');

  } catch (error) {
    console.error('❌ Failed to register slash commands:', error);
    throw error;
  }
}

/**
 * Clear all slash commands (for cleanup/testing)
 *
 * @param {Client} client - Discord client instance
 * @param {string} guildId - Guild ID (optional)
 * @returns {Promise<void>}
 */
async function clearCommands(client, guildId = null) {
  const rest = new REST({ version: '10' }).setToken(client.token);

  try {
    console.log('🗑️ Clearing slash commands...');

    if (guildId) {
      await rest.put(
        Routes.applicationGuildCommands(client.user.id, guildId),
        { body: [] }
      );
      console.log('✅ Cleared guild commands');
    } else {
      await rest.put(
        Routes.applicationCommands(client.user.id),
        { body: [] }
      );
      console.log('✅ Cleared global commands');
    }
  } catch (error) {
    console.error('❌ Failed to clear commands:', error);
    throw error;
  }
}

module.exports = {
  registerCommands,
  clearCommands
};
