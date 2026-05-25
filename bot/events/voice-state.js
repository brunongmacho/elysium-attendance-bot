/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                    VOICE STATE UPDATE HANDLER                            ║
 * ║  Tracks voice channel joins/leaves and sends playful DMs                 ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * @file bot/events/voice-state.js
 * @description Extracted from index2.js VoiceStateUpdate event handler.
 *              Logs voice activity and handles special DM interactions
 *              between AlterFrieren and Rohypnol.
 *
 * @dependencies
 * - discord.js (Events, EmbedBuilder)
 * - utils/logger
 *
 * @usage
 *   const { createVoiceStateHandler } = require('./bot/events/voice-state');
 *   client.on(Events.VoiceStateUpdate, createVoiceStateHandler(client, config, {
 *     discordCache, ALTERFRIEREN_ID, ROHYPnol_ID, memberLore, alterFrierenConfig,
 *   }));
 */

const { Events, EmbedBuilder } = require("discord.js");
const { createLogger } = require('../../utils/logger');
const logger = createLogger('voice-state');

// =====================================================================
// MODULE-LEVEL STATE (moved from index2.js)
// =====================================================================

/** @type {number} Timestamp of last DM sent to AlterFrieren */
let lastAlterFrierenDM = 0;

/** @type {number} Cooldown between DMs (1 minute) */
const ALTERFRIEREN_DM_COOLDOWN = 60000;

/** @type {string[]} Recently sent playful DM messages (avoids repeats) */
let recentPlayfulDMs = [];

/**
 * Creates a handler for Discord VoiceStateUpdate events.
 *
 * @param {import('discord.js').Client} client - Discord Client
 * @param {Object} config - Bot configuration
 * @param {Object} modules - Additional dependencies
 * @param {string} modules.ALTERFRIEREN_ID - AlterFrieren's Discord user ID
 * @param {string} modules.ROHYPnol_ID - Rohypnol's Discord user ID
 * @param {Object} modules.alterFrierenConfig - AlterFrieren DM config
 * @returns {Function} Async handler function (oldState, newState) => Promise<void>
 */
function createVoiceStateHandler(client, config, modules) {
  const {
    ALTERFRIEREN_ID,
    ROHYPnol_ID,
    alterFrierenConfig,
  } = modules;

  const guildName = 'TENCHU';

  return async (oldState, newState) => {
    try {
      const member = newState.member;

      if (member.user.bot) return;

      // ONLY process voice updates from main guild
      const guild = newState.guild;
      if (!guild || guild.id !== config.main_guild_id) {
        return; // Skip voice updates from other servers
      }

      const joinedChannel = newState.channelId && !oldState.channelId;
      const leftChannel = !newState.channelId && oldState.channelId;

      if (joinedChannel) {
        const channel = newState.channel;

        const joinEmbed = new EmbedBuilder()
          .setColor(0x43B581)
          .setAuthor({
            name: member.displayName,
            iconURL: member.displayAvatarURL()
          })
          .setDescription(`🟢 **Joined** ${channel.name}`)
          .setThumbnail(member.displayAvatarURL())
          .setFooter({
            text: `${guildName} Guild`,
            iconURL: guild.iconURL()
          })
          .setTimestamp();

        await channel.send({ embeds: [joinEmbed] })
          .catch(err => console.error('❌ Failed to send voice join log:', err.message));

        // 👑 SPECIAL VOICE DM: Send playful DM when both are in same channel
        const generalDMs = alterFrierenConfig.general || [];
        const whenSheJoins = alterFrierenConfig.whenSheJoins || [];
        const whenHeJoins = alterFrierenConfig.whenHeJoins || [];

        console.log(`🎤 Voice check - general: ${generalDMs.length}, sheJoins: ${whenSheJoins.length}, heJoins: ${whenHeJoins.length}`);

        // Helper function to get a random DM that hasn't been sent recently
        const getRandomPlayfulDM = (dmArray) => {
          console.log(`🎤 Pool size: ${dmArray.length}, recentPlayfulDMs: ${recentPlayfulDMs.length}`);

          // Filter out recently sent messages
          const availableDMs = dmArray.filter(dm => !recentPlayfulDMs.includes(dm));
          console.log(`🎤 Available after filter: ${availableDMs.length}`);

          // If all messages used recently, reset the tracking
          let pool = availableDMs.length > 0 ? availableDMs : dmArray;

          const selectedDM = pool[Math.floor(Math.random() * pool.length)];

          // Add to recent list, keep only last 8
          recentPlayfulDMs.push(selectedDM);
          if (recentPlayfulDMs.length > 8) {
            recentPlayfulDMs.shift();
          }

          return selectedDM;
        };

        // Check if the new joiner is AlterFrieren and Rohypnol is already in the same channel
        const joiningUserId = member.id;
        if (joiningUserId === ALTERFRIEREN_ID) {
          // Find if Rohypnol is in THIS channel via voice states
          let rohypnolInThisChannel = false;
          console.log(`🎤 Rohypnol in this channel? ${rohypnolInThisChannel}`);
          if (rohypnolInThisChannel) {
            console.log(`💌 Sending DM to AlterFrieren - She joined, Rohypnol is in channel`);
            const rohypnolUser = await client.users.fetch(ROHYPnol_ID);
            await rohypnolUser.send(`💌 Sent to AlterFrieren: "${randomDM}"`).catch(err => console.error(`💌 Failed to notify Rohypnol: ${err.message}`));
          }
        }

        // Check if the new joiner is Rohypnol and AlterFrieren is already in the same channel
        else if (member.id === ROHYPnol_ID) {
          console.log(`🎤 Rohypnol joined. Checking channel...`);

          // Try both channel.members and guild.voiceStates
          const channelMembers = channel.members;
          console.log(`🎤 Channel members: ${[...channelMembers.values()].map(m => m.displayName).join(', ')}`);

          // Check voice states from guild
          const guild = channel.guild;
          const voiceStates = guild.voiceStates.cache;
          console.log(`🎤 Total voice states: ${voiceStates.size}`);

          // Find if AlterFrieren is in THIS channel via voice states
          let alterInThisChannel = false;
          for (const [userId, vs] of voiceStates) {
            if (vs.channelId === channel.id) {
              // Check by user ID first (use the key from the collection)
              if (userId === ALTERFRIEREN_ID) {
                console.log(`🎤 Voice state found: AlterFrieren (by ID)`);
                alterInThisChannel = true;
                break;
              }
              // Fallback to name check
              const name = vs.member?.displayName || vs.member?.user?.username || 'unknown';
              console.log(`🎤 Voice state found: ${name} (ID: ${userId})`);
              if (name.toLowerCase().includes('alter') ||
                  name.toLowerCase().includes('zoe_bebe') ||
                  name.toLowerCase().includes('alterfrieren')) {
                alterInThisChannel = true;
                break;
              }
            }
          }

          console.log(`🎤 Alter in this channel? ${alterInThisChannel}`);

          if (alterInThisChannel) {
            console.log(`💌 Sending DM to AlterFrieren - Hesu joined, She is in channel`);

            // Check cooldown
            const now = Date.now();
            if (now - lastAlterFrierenDM < ALTERFRIEREN_DM_COOLDOWN) {
              console.log(`💌 DM skipped - cooldown active (${Math.round((ALTERFRIEREN_DM_COOLDOWN - (now - lastAlterFrierenDM))/1000)}s remaining)`);
            } else {
              // Combine general + whenHeJoins pools
              const pool = [...generalDMs, ...whenHeJoins];
              const randomDM = getRandomPlayfulDM(pool);
              try {
                const alterUser = await client.users.fetch(ALTERFRIEREN_ID);
                await alterUser.send(randomDM).catch(err => console.error(`💌 Failed to send DM to AlterFrieren: ${err.message}`));
                const rohypnolUser = await client.users.fetch(ROHYPnol_ID);
                await rohypnolUser.send(`💌 Sent to AlterFrieren: "${randomDM}"`).catch(err => console.error(`💌 Failed to notify Rohypnol: ${err.message}`));
                lastAlterFrierenDM = Date.now();
                console.log(`💌 DM sent: "${randomDM}"`);
              } catch (e) {
                console.error(`💌 Error sending DM: ${e.message}`);
              }
            }
          }
        }

      } else if (leftChannel) {
        const channel = oldState.channel;

        const leaveEmbed = new EmbedBuilder()
          .setColor(0xF04747)
          .setAuthor({
            name: member.displayName,
            iconURL: member.displayAvatarURL()
          })
          .setDescription(`🔴 **Left** ${channel.name}`)
          .setThumbnail(member.displayAvatarURL())
          .setFooter({
            text: `${guildName} Guild`,
            iconURL: guild.iconURL()
          })
          .setTimestamp();

        await channel.send({ embeds: [leaveEmbed] })
          .catch(err => console.error('❌ Failed to send voice leave log:', err.message));
      }

    } catch (error) {
      console.error('❌ Error handling voice state update:', error.message);
    }
  };
}

module.exports = { createVoiceStateHandler };
