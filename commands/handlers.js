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
          const rotationBosses = Object.keys(allRotations);

          if (rotationBosses.length === 0) {
            await interaction.editReply({
              content: '❌ No rotating bosses found in the system'
            });
            return;
          }

          // Build status message
          let statusMessage = '**🔄 Boss Rotation Status**\n\n';

          for (const bossName of rotationBosses) {
            const rotation = allRotations[bossName];
            const emoji = rotation.isOurTurn ? '🟢' : '🔴';
            const status = rotation.isOurTurn ? 'ELYSIUM' : rotation.currentGuild;

            statusMessage += `${emoji} **${bossName}**\n`;
            statusMessage += `   Position: ${rotation.currentIndex}/${rotation.guilds.length} (${status})\n`;
            statusMessage += `   Next: ${rotation.nextGuild}\n\n`;
          }

          await interaction.editReply({
            content: statusMessage
          });

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

            await interaction.editReply({
              content: `✅ Rotation updated: **${boss}**\n` +
                       `${data.oldIndex} (${data.oldGuild}) → ${data.newIndex} (${data.newGuild})\n\n` +
                       `${emoji} Status: ${data.isOurTurn ? 'ELYSIUM\'S TURN' : data.newGuild + '\'s turn'}`
            });
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

            await interaction.editReply({
              content: `✅ Rotation incremented: **${boss}**\n` +
                       `${result.oldIndex} (${result.oldGuild}) → ${result.newIndex} (${result.newGuild})\n\n` +
                       `${emoji} Status: ${result.isNowOurTurn ? 'ELYSIUM\'S TURN' : result.newGuild + '\'s turn'}`
            });
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
          const rotationBosses = Object.keys(allRotations);

          await interaction.editReply({
            content: `✅ Rotation cache refreshed from Google Sheets!\n\n` +
                     `Synced ${rotationBosses.length} rotating bosses: ${rotationBosses.join(', ')}`
          });

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
