/**
 * =============================================================================
 * SLASH COMMAND HANDLERS
 * =============================================================================
 *
 * Handles slash command execution by routing to existing bot modules.
 * Maintains compatibility with existing prefix commands.
 *
 * @module commands/handlers
 * @author ELYSIUM Development Team
 */

const { EmbedBuilder } = require('discord.js');

/**
 * Handle slash commands
 *
 * @param {CommandInteraction} interaction - Discord command interaction
 * @param {Object} modules - Bot modules (attendance, bossTimer, bossTimerCommands, bossRotation)
 * @param {Object} config - Bot configuration
 * @param {Client} client - Discord client
 * @returns {Promise<void>}
 */
async function handleSlashCommand(interaction, modules, config, client) {
  const { attendance, bossTimer, bossTimerCommands, bossRotation } = modules;
  const commandName = interaction.commandName;

  try {
    // =========================================================================
    // ATTENDANCE COMMANDS
    // =========================================================================

    if (commandName === 'verify') {
      const member = interaction.options.getString('member');
      // Call existing attendance verification logic
      // For now, route to the existing command handler
      await interaction.reply(`🚧 /verify ${member} - Implementation in progress`);
      return;
    }

    if (commandName === 'deny') {
      const member = interaction.options.getString('member');
      const reason = interaction.options.getString('reason') || 'No reason provided';
      await interaction.reply(`🚧 /deny ${member} (${reason}) - Implementation in progress`);
      return;
    }

    if (commandName === 'verifyall') {
      await interaction.reply(`🚧 /verifyall - Implementation in progress`);
      return;
    }

    if (commandName === 'denyall') {
      await interaction.reply(`🚧 /denyall - Implementation in progress`);
      return;
    }

    if (commandName === 'close') {
      const thread = interaction.options.getChannel('thread');
      await interaction.reply(`🚧 /close ${thread ? thread.id : 'current'} - Implementation in progress`);
      return;
    }

    if (commandName === 'closeall') {
      await interaction.reply(`🚧 /closeall - Implementation in progress`);
      return;
    }

    if (commandName === 'resetpending') {
      await interaction.reply(`🚧 /resetpending - Implementation in progress`);
      return;
    }

    // =========================================================================
    // BOSS TIMER COMMANDS
    // =========================================================================

    if (commandName === 'killed') {
      const boss = interaction.options.getString('boss');
      const timestamp = interaction.options.getString('timestamp') || 'now';

      // Create a synthetic message object for compatibility with existing handler
      const syntheticMessage = {
        content: `!killed ${boss} ${timestamp}`,
        author: interaction.user,
        channel: interaction.channel,
        guild: interaction.guild,
        reply: async (content) => interaction.reply(content)
      };

      const args = [boss];
      if (timestamp !== 'now') {
        args.push(timestamp);
      }

      // Defer reply for potentially long-running operation
      await interaction.deferReply();

      try {
        // Call existing boss timer command handler
        await bossTimerCommands.handleKilled(syntheticMessage, args, config);

        // Edit the deferred reply
        await interaction.editReply({
          content: `✅ Boss marked as killed: **${boss}** at ${timestamp}\n\n💡 **Tip:** Slash commands support autocomplete for boss names!`
        });
      } catch (error) {
        console.error('Error in /killed command:', error);
        await interaction.editReply({
          content: `❌ Failed to mark boss as killed: ${error.message}`
        });
      }

      return;
    }

    if (commandName === 'spawned') {
      const boss = interaction.options.getString('boss');

      await interaction.deferReply();

      const syntheticMessage = {
        content: `!spawned ${boss}`,
        author: interaction.user,
        channel: interaction.channel,
        guild: interaction.guild,
        reply: async (content) => interaction.editReply(content)
      };

      try {
        await bossTimerCommands.handleSpawned(syntheticMessage, [boss], config);
        await interaction.editReply({
          content: `✅ Boss marked as spawned: **${boss}**\n\n💡 **Tip:** Try /killed for recording boss kills!`
        });
      } catch (error) {
        console.error('Error in /spawned command:', error);
        await interaction.editReply({
          content: `❌ Failed to mark boss as spawned: ${error.message}`
        });
      }

      return;
    }

    if (commandName === 'nextspawn') {
      await interaction.deferReply();

      const syntheticMessage = {
        content: `!nextspawn`,
        author: interaction.user,
        channel: interaction.channel,
        guild: interaction.guild,
        reply: async (content) => interaction.editReply(content)
      };

      try {
        await bossTimerCommands.handleNextSpawn(syntheticMessage);
        // Handler replies via syntheticMessage.reply which now maps to interaction.editReply
      } catch (error) {
        console.error('Error in /nextspawn command:', error);
        await interaction.editReply({
          content: `❌ Failed to get next spawn: ${error.message}`
        });
      }

      return;
    }

    if (commandName === 'unkill') {
      const boss = interaction.options.getString('boss');

      await interaction.deferReply();

      const syntheticMessage = {
        content: `!unkill ${boss}`,
        author: interaction.user,
        channel: interaction.channel,
        guild: interaction.guild,
        reply: async (content) => interaction.editReply(content)
      };

      try {
        await bossTimerCommands.handleUnkill(syntheticMessage, [boss], config);
        await interaction.editReply({
          content: `✅ Boss kill record removed: **${boss}**`
        });
      } catch (error) {
        console.error('Error in /unkill command:', error);
        await interaction.editReply({
          content: `❌ Failed to unkill boss: ${error.message}`
        });
      }

      return;
    }

    if (commandName === 'setboss') {
      const boss = interaction.options.getString('boss');
      const status = interaction.options.getString('status');

      await interaction.deferReply();

      const syntheticMessage = {
        content: `!setboss ${boss} ${status}`,
        author: interaction.user,
        channel: interaction.channel,
        guild: interaction.guild,
        reply: async (content) => interaction.editReply(content)
      };

      try {
        await bossTimerCommands.handleSetBoss(syntheticMessage, [boss, status], config);
        await interaction.editReply({
          content: `✅ Boss status set: **${boss}** → ${status}`
        });
      } catch (error) {
        console.error('Error in /setboss command:', error);
        await interaction.editReply({
          content: `❌ Failed to set boss status: ${error.message}`
        });
      }

      return;
    }

    if (commandName === 'nospawn') {
      const boss = interaction.options.getString('boss');

      await interaction.deferReply();

      const syntheticMessage = {
        content: `!nospawn ${boss}`,
        author: interaction.user,
        channel: interaction.channel,
        guild: interaction.guild,
        reply: async (content) => interaction.editReply(content)
      };

      try {
        await bossTimerCommands.handleNoSpawn(syntheticMessage, [boss], config);
        await interaction.editReply({
          content: `✅ Boss marked as not spawning: **${boss}**`
        });
      } catch (error) {
        console.error('Error in /nospawn command:', error);
        await interaction.editReply({
          content: `❌ Failed to mark boss as not spawning: ${error.message}`
        });
      }

      return;
    }

    if (commandName === 'maintenance') {
      // Check admin permission
      const guild = interaction.guild;
      const member = await guild.members.fetch(interaction.user.id).catch(() => null);

      if (!member || !isAdmin(member, config)) {
        await interaction.reply({
          content: '❌ Admin only command',
          ephemeral: true
        });
        return;
      }

      await interaction.deferReply();

      const syntheticMessage = {
        content: `!maintenance`,
        author: interaction.user,
        channel: interaction.channel,
        guild: interaction.guild,
        reply: async (content) => interaction.editReply(content)
      };

      try {
        await bossTimerCommands.handleMaintenance(syntheticMessage);
        await interaction.editReply({
          content: `✅ All bosses spawned (server maintenance mode)`
        });
      } catch (error) {
        console.error('Error in /maintenance command:', error);
        await interaction.editReply({
          content: `❌ Failed to spawn bosses: ${error.message}`
        });
      }

      return;
    }

    if (commandName === 'serverdown') {
      // Check admin permission
      const guild = interaction.guild;
      const member = await guild.members.fetch(interaction.user.id).catch(() => null);

      if (!member || !isAdmin(member, config)) {
        await interaction.reply({
          content: '❌ Admin only command',
          ephemeral: true
        });
        return;
      }

      await interaction.deferReply();

      const syntheticMessage = {
        content: `!serverdown`,
        author: interaction.user,
        channel: interaction.channel,
        guild: interaction.guild,
        reply: async (content) => interaction.editReply(content)
      };

      try {
        await bossTimerCommands.handleServerDown(syntheticMessage);
        await interaction.editReply({
          content: `✅ Server down mode activated`
        });
      } catch (error) {
        console.error('Error in /serverdown command:', error);
        await interaction.editReply({
          content: `❌ Failed to activate server down mode: ${error.message}`
        });
      }

      return;
    }

    if (commandName === 'clearkills') {
      // Check admin permission
      const guild = interaction.guild;
      const member = await guild.members.fetch(interaction.user.id).catch(() => null);

      if (!member || !isAdmin(member, config)) {
        await interaction.reply({
          content: '❌ Admin only command',
          ephemeral: true
        });
        return;
      }

      await interaction.deferReply();

      const syntheticMessage = {
        content: `!clearkills`,
        author: interaction.user,
        channel: interaction.channel,
        guild: interaction.guild,
        reply: async (content) => interaction.editReply(content)
      };

      try {
        await bossTimerCommands.handleClearKills(syntheticMessage);
        await interaction.editReply({
          content: `✅ All boss kill records cleared`
        });
      } catch (error) {
        console.error('Error in /clearkills command:', error);
        await interaction.editReply({
          content: `❌ Failed to clear kills: ${error.message}`
        });
      }

      return;
    }

    // =========================================================================
    // BOSS ROTATION COMMANDS
    // =========================================================================

    if (commandName === 'rotation') {
      const subcommand = interaction.options.getSubcommand();

      if (subcommand === 'status') {
        await interaction.deferReply();

        try {
          const allRotations = await bossRotation.getAllRotations();
          const rotatingBosses = bossRotation.getRotatingBosses();

          if (Object.keys(allRotations).length === 0) {
            await interaction.editReply({
              content: '⚠️ No rotation data available. BossRotation sheet may not be set up.'
            });
            return;
          }

          const embed = new EmbedBuilder()
            .setColor(0x4a90e8)
            .setTitle('🔄 Boss Rotation Status')
            .setDescription('Current rotation for 5-guild system')
            .setTimestamp();

          for (const boss of rotatingBosses) {
            const rotation = allRotations[boss];
            if (rotation) {
              const emoji = rotation.isOurTurn ? '🟢' : '🔴';
              const status = rotation.isOurTurn ? 'ELYSIUM\'S TURN' : `${rotation.currentGuild}'s turn`;

              // Get spawn time from boss timer if available
              let spawnInfo = '';
              try {
                const timerData = bossTimer.getNextSpawn(boss);
                if (timerData && timerData.nextSpawn) {
                  const spawnTimestamp = Math.floor(timerData.nextSpawn.getTime() / 1000);
                  spawnInfo = `\n📍 Next Spawn: <t:${spawnTimestamp}:R> ⏱️`;
                }
              } catch (timerError) {
                // Silently continue without spawn info
              }

              const guildCount = rotation.guilds ? rotation.guilds.length : 5;
              const nextGuild = rotation.guilds
                ? rotation.guilds[rotation.currentIndex % guildCount]
                : (rotation.nextGuild || rotation.currentGuild || 'Unknown');

              embed.addFields({
                name: `${emoji} ${boss}`,
                value: `Guild ${rotation.currentIndex}/${guildCount} - **${status}**\nNext: ${nextGuild}${spawnInfo}`,
                inline: false
              });
            }
          }

          await interaction.editReply({ embeds: [embed] });

        } catch (error) {
          console.error('Error in /rotation status:', error);
          await interaction.editReply({
            content: `❌ Failed to get rotation status: ${error.message}`
          });
        }

        return;
      }

      if (subcommand === 'set') {
        const boss = interaction.options.getString('boss');
        const position = interaction.options.getInteger('position');

        await interaction.deferReply();

        try {
          const result = await bossRotation.setRotation(boss, position);

          if (result.success) {
            const data = result.data;
            const emoji = data.isOurTurn ? '🟢' : '🔴';
            const status = data.isOurTurn ? 'ELYSIUM\'S TURN' : `${data.currentGuild}'s turn`;

            const embed = new EmbedBuilder()
              .setColor(data.isOurTurn ? 0x00ff00 : 0xff0000)
              .setTitle(`${emoji} Rotation Updated`)
              .setDescription(`**${boss}** rotation manually set`)
              .addFields(
                {
                  name: 'Previous',
                  value: `Index ${data.oldIndex} (${data.oldGuild})`,
                  inline: true
                },
                {
                  name: 'Current',
                  value: `Index ${data.newIndex} (${data.newGuild})`,
                  inline: true
                },
                {
                  name: 'Status',
                  value: `**${status}**`,
                  inline: false
                }
              )
              .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
          } else {
            await interaction.editReply({
              content: `❌ Failed to set rotation: ${result.message}`
            });
          }

        } catch (error) {
          console.error('Error in /rotation set:', error);
          await interaction.editReply({
            content: `❌ Failed to set rotation: ${error.message}`
          });
        }

        return;
      }

      if (subcommand === 'increment') {
        const boss = interaction.options.getString('boss');

        await interaction.deferReply();

        try {
          const result = await bossRotation.incrementRotation(boss);

          if (result.updated !== false) {
            const emoji = result.isNowOurTurn ? '🟢' : '🔴';
            const status = result.isNowOurTurn ? 'ELYSIUM\'S TURN' : `${result.newGuild}'s turn`;

            const embed = new EmbedBuilder()
              .setColor(result.isNowOurTurn ? 0x00ff00 : 0xff0000)
              .setTitle(`${emoji} Rotation Advanced`)
              .setDescription(`**${boss}** rotation incremented`)
              .addFields(
                {
                  name: 'Previous',
                  value: `Index ${result.oldIndex} (${result.oldGuild})`,
                  inline: true
                },
                {
                  name: 'Current',
                  value: `Index ${result.newIndex} (${result.newGuild})`,
                  inline: true
                },
                {
                  name: 'Status',
                  value: `**${status}**`,
                  inline: false
                }
              )
              .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
          } else {
            await interaction.editReply({
              content: `❌ Failed to increment rotation: ${result.error || 'Unknown error'}`
            });
          }

        } catch (error) {
          console.error('Error in /rotation increment:', error);
          await interaction.editReply({
            content: `❌ Failed to increment rotation: ${error.message}`
          });
        }

        return;
      }

      if (subcommand === 'refresh') {
        await interaction.deferReply();

        try {
          await bossRotation.refreshRotationCache();

          const allRotations = await bossRotation.getAllRotations();
          const rotatingBosses = bossRotation.getRotatingBosses();

          if (Object.keys(allRotations).length === 0) {
            await interaction.editReply({
              content: '⚠️ No rotation data found after refresh. BossRotation sheet may not be set up.'
            });
            return;
          }

          const embed = new EmbedBuilder()
            .setColor(0x00ff00)
            .setTitle('✅ Rotation Data Refreshed')
            .setDescription(`Loaded ${rotatingBosses.length} rotating bosses from Google Sheets`)
            .setTimestamp();

          for (const boss of rotatingBosses) {
            const rotation = allRotations[boss];
            if (rotation) {
              const emoji = rotation.isOurTurn ? '🟢' : '🔴';
              const status = rotation.isOurTurn ? 'ELYSIUM\'S TURN' : `${rotation.currentGuild}'s turn`;
              const guildCount = rotation.guilds ? rotation.guilds.length : 5;

              embed.addFields({
                name: `${emoji} ${boss}`,
                value: `Guild ${rotation.currentIndex}/${guildCount} - **${status}**`,
                inline: false
              });
            }
          }

          await interaction.editReply({ embeds: [embed] });

        } catch (error) {
          console.error('Error in /rotation refresh:', error);
          await interaction.editReply({
            content: `❌ Failed to refresh rotation cache: ${error.message}`
          });
        }

        return;
      }
    }

    // Unknown command
    await interaction.reply({
      content: '❌ Unknown command',
      ephemeral: true
    });

  } catch (error) {
    console.error(`❌ Error handling slash command /${commandName}:`, error);

    // Try to respond if we haven't already
    try {
      if (interaction.deferred) {
        await interaction.editReply({
          content: `❌ An error occurred: ${error.message}`
        });
      } else if (!interaction.replied) {
        await interaction.reply({
          content: `❌ An error occurred: ${error.message}`,
          ephemeral: true
        });
      }
    } catch (replyError) {
      console.error('Failed to send error response:', replyError);
    }
  }
}

/**
 * Check if user is admin
 * @param {GuildMember} member - Guild member
 * @param {Object} config - Bot configuration
 * @returns {boolean} True if admin
 */
function isAdmin(member, config) {
  return config.admin_roles.some(role => member.roles.cache.has(role));
}

module.exports = {
  handleSlashCommand
};
