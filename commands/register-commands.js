/**
 * =============================================================================
 * SLASH COMMAND REGISTRATION UTILITY
 * =============================================================================
 *
 * Registers slash commands with Discord API.
 * Supports both guild-specific (instant) and global (1-hour cache) registration.
 *
 * Dynamically fetches channel names from Discord to include in command descriptions.
 *
 * @module commands/register-commands
 * @author ELYSIUM Development Team
 */

const { REST, Routes } = require('discord.js');
const { generateAllCommands } = require('./slash-commands');
const fs = require('fs');

/**
 * Fetch channel names from Discord for dynamic command descriptions
 *
 * @param {Client} client - Discord client instance
 * @param {string} guildId - Guild ID to fetch channels from
 * @returns {Promise<Object>} Object containing channel names
 */
async function fetchChannelNames(client, guildId) {
  try {
    // Load config to get channel IDs
    const config = JSON.parse(fs.readFileSync('./config.json', 'utf-8'));

    const guild = await client.guilds.fetch(guildId);
    const channelNames = {};

    // Fetch attendance channel name
    if (config.attendance_channel_id) {
      try {
        const attendanceChannel = await guild.channels.fetch(config.attendance_channel_id);
        if (attendanceChannel) {
          channelNames.attendance = attendanceChannel.name;
        }
      } catch (error) {
        console.warn(`⚠️ Could not fetch attendance channel: ${error.message}`);
      }
    }

    // Fetch boss timer channel name
    if (config.boss_timer_channel_id) {
      try {
        const bossTimerChannel = await guild.channels.fetch(config.boss_timer_channel_id);
        if (bossTimerChannel) {
          channelNames.bossTimer = bossTimerChannel.name;
        }
      } catch (error) {
        console.warn(`⚠️ Could not fetch boss timer channel: ${error.message}`);
      }
    }

    console.log(`📝 Fetched channel names:`, channelNames);
    return channelNames;

  } catch (error) {
    console.error('❌ Failed to fetch channel names:', error);
    // Return empty object to use defaults
    return {};
  }
}

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
    // Fetch channel names for dynamic descriptions
    let channelNames = {};
    if (guildId) {
      channelNames = await fetchChannelNames(client, guildId);
    }

    // Generate commands with dynamic channel names
    const { allCommands } = generateAllCommands(channelNames);

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
