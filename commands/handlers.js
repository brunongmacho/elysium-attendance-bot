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
const tipSystem = require('./tip-system');

/**
 * Handle slash commands
 *
 * @param {CommandInteraction} interaction - Discord command interaction
 * @param {Object} modules - Bot modules (attendance, bossTimer, bossTimerCommands, bossRotation, bidding, auctioneering)
 * @param {Object} config - Bot configuration
 * @param {Client} client - Discord client
 * @returns {Promise<void>}
 */
async function handleSlashCommand(interaction, modules, config, client) {
  const { attendance, bossTimer, bossTimerCommands, bossRotation, bidding, auctioneering } = modules;
  const commandName = interaction.commandName;

  // Track slash command usage for tip system
  tipSystem.trackSlashCommandUsage(interaction.user.id, commandName);

  try {
    // =========================================================================
    // ATTENDANCE COMMANDS
    // =========================================================================

    if (commandName === 'verify') {
      const memberName = interaction.options.getString('member');

      await interaction.deferReply();

      try {
        const thread = interaction.channel;
        if (!thread.isThread()) {
          await interaction.editReply({
            content: '❌ This command must be used inside an attendance thread.'
          });
          return;
        }

        const activeSpawns = attendance.getActiveSpawns();
        const pendingVerifications = attendance.getPendingVerifications();
        const spawnInfo = activeSpawns[thread.id];

        if (!spawnInfo || spawnInfo.closed) {
          await interaction.editReply({
            content: '⚠️ This spawn is closed or not found.'
          });
          return;
        }

        // Find the pending verification for this member
        const pendingEntry = Object.entries(pendingVerifications).find(
          ([msgId, p]) =>
            p.threadId === thread.id &&
            p.author.toLowerCase() === memberName.toLowerCase()
        );

        if (!pendingEntry) {
          await interaction.editReply({
            content: `⚠️ No pending verification found for **${memberName}** in this thread.`
          });
          return;
        }

        const [msgId, pending] = pendingEntry;

        // Check for duplicates
        const normalizeUsername = (username) => username.toLowerCase().replace(/\s+/g, '');
        const isDuplicate = spawnInfo.members.some(
          (m) => normalizeUsername(m) === normalizeUsername(pending.author)
        );

        if (isDuplicate) {
          await interaction.editReply({
            content: `⚠️ **${pending.author}** is already verified for this spawn.`
          });
          return;
        }

        // Add to verified members
        spawnInfo.members.push(pending.author);

        // Clean up verification buttons
        if (pending.verificationMsgId) {
          const verificationMsg = await thread.messages
            .fetch(pending.verificationMsgId)
            .catch(() => null);
          if (verificationMsg && verificationMsg.components.length > 0) {
            await verificationMsg.edit({ components: [] }).catch(() => {});
          }
        }

        // Remove from pending
        delete pendingVerifications[msgId];
        attendance.setPendingVerifications(pendingVerifications);

        await interaction.editReply({
          content: `✅ **${pending.author}** manually verified by ${interaction.user.username}`
        });

        // Send to confirmation thread if exists
        if (spawnInfo.confirmThreadId) {
          const confirmThread = await interaction.guild.channels
            .fetch(spawnInfo.confirmThreadId)
            .catch(() => null);
          if (confirmThread) {
            await confirmThread.send(
              `✅ **${pending.author}** verified by ${interaction.user.username} (slash command)`
            );
          }
        }

        console.log(
          `✅ /verify: ${pending.author} for ${spawnInfo.boss} by ${interaction.user.username}`
        );

      } catch (error) {
        console.error('Error in /verify command:', error);
        await interaction.editReply({
          content: `❌ Failed to verify member: ${error.message}`
        });
      }

      return;
    }

    if (commandName === 'deny') {
      const memberName = interaction.options.getString('member');
      const reason = interaction.options.getString('reason') || 'No reason provided';

      await interaction.deferReply();

      try {
        const thread = interaction.channel;
        if (!thread.isThread()) {
          await interaction.editReply({
            content: '❌ This command must be used inside an attendance thread.'
          });
          return;
        }

        const activeSpawns = attendance.getActiveSpawns();
        const pendingVerifications = attendance.getPendingVerifications();
        const spawnInfo = activeSpawns[thread.id];

        if (!spawnInfo || spawnInfo.closed) {
          await interaction.editReply({
            content: '⚠️ This spawn is closed or not found.'
          });
          return;
        }

        // Find the pending verification for this member
        const pendingEntry = Object.entries(pendingVerifications).find(
          ([msgId, p]) =>
            p.threadId === thread.id &&
            p.author.toLowerCase() === memberName.toLowerCase()
        );

        if (!pendingEntry) {
          await interaction.editReply({
            content: `⚠️ No pending verification found for **${memberName}** in this thread.`
          });
          return;
        }

        const [msgId, pending] = pendingEntry;

        // Clean up verification buttons
        if (pending.verificationMsgId) {
          const verificationMsg = await thread.messages
            .fetch(pending.verificationMsgId)
            .catch(() => null);
          if (verificationMsg && verificationMsg.components.length > 0) {
            await verificationMsg.edit({ components: [] }).catch(() => {});
          }
        }

        // Remove from pending (member is NOT added to verified list)
        delete pendingVerifications[msgId];
        attendance.setPendingVerifications(pendingVerifications);

        await interaction.editReply({
          content: `❌ **${pending.author}** denied by ${interaction.user.username}\n**Reason:** ${reason}`
        });

        // Send to confirmation thread if exists
        if (spawnInfo.confirmThreadId) {
          const confirmThread = await interaction.guild.channels
            .fetch(spawnInfo.confirmThreadId)
            .catch(() => null);
          if (confirmThread) {
            await confirmThread.send(
              `❌ **${pending.author}** denied by ${interaction.user.username} - ${reason}`
            );
          }
        }

        console.log(
          `❌ /deny: ${pending.author} for ${spawnInfo.boss} by ${interaction.user.username} - ${reason}`
        );

      } catch (error) {
        console.error('Error in /deny command:', error);
        await interaction.editReply({
          content: `❌ Failed to deny member: ${error.message}`
        });
      }

      return;
    }

    if (commandName === 'verifyall') {
      await interaction.deferReply();

      try {
        const thread = interaction.channel;
        if (!thread.isThread()) {
          await interaction.editReply({
            content: '❌ This command must be used inside an attendance thread.'
          });
          return;
        }

        const activeSpawns = attendance.getActiveSpawns();
        const pendingVerifications = attendance.getPendingVerifications();
        const spawnInfo = activeSpawns[thread.id];

        if (!spawnInfo || spawnInfo.closed) {
          await interaction.editReply({
            content: '⚠️ This spawn is closed or not found.'
          });
          return;
        }

        const pendingInThread = Object.entries(pendingVerifications).filter(
          ([msgId, p]) => p.threadId === thread.id
        );

        if (pendingInThread.length === 0) {
          await interaction.editReply({
            content: 'ℹ️ No pending verifications in this thread.'
          });
          return;
        }

        let verifiedCount = 0, duplicateCount = 0;
        const verifiedMembers = [];
        const normalizeUsername = (username) => username.toLowerCase().replace(/\s+/g, '');

        for (const [msgId, pending] of pendingInThread) {
          const isDuplicate = spawnInfo.members.some(
            (m) => normalizeUsername(m) === normalizeUsername(pending.author)
          );

          if (!isDuplicate) {
            spawnInfo.members.push(pending.author);
            verifiedMembers.push(pending.author);
            verifiedCount++;
          } else {
            duplicateCount++;
          }

          // Clean up verification buttons
          if (pending.verificationMsgId) {
            const verificationMsg = await thread.messages
              .fetch(pending.verificationMsgId)
              .catch(() => null);
            if (verificationMsg && verificationMsg.components.length > 0) {
              await verificationMsg.edit({ components: [] }).catch(() => {});
            }
          }

          delete pendingVerifications[msgId];
        }

        attendance.setPendingVerifications(pendingVerifications);

        await interaction.editReply({
          content:
            `✅ **Verify All Complete!**\n\n` +
            `✅ Verified: ${verifiedCount}\n` +
            `⚠️ Duplicates skipped: ${duplicateCount}\n` +
            `📊 Total processed: ${pendingInThread.length}\n\n` +
            `**Verified members:**\n${verifiedMembers.join(', ') || 'None (all were duplicates)'}`
        });

        if (spawnInfo.confirmThreadId && verifiedCount > 0) {
          const confirmThread = await interaction.guild.channels
            .fetch(spawnInfo.confirmThreadId)
            .catch(() => null);
          if (confirmThread) {
            await confirmThread.send(
              `✅ **Bulk Verification by ${interaction.user.username}**\n` +
              `Verified ${verifiedCount} member(s): ${verifiedMembers.join(', ')}`
            );
          }
        }

        console.log(
          `✅ /verifyall: ${verifiedCount} verified, ${duplicateCount} duplicates for ${spawnInfo.boss} by ${interaction.user.username}`
        );

      } catch (error) {
        console.error('Error in /verifyall command:', error);
        await interaction.editReply({
          content: `❌ Failed to verify all: ${error.message}`
        });
      }

      return;
    }

    if (commandName === 'denyall') {
      await interaction.deferReply();

      try {
        const thread = interaction.channel;
        if (!thread.isThread()) {
          await interaction.editReply({
            content: '❌ This command must be used inside an attendance thread.'
          });
          return;
        }

        const activeSpawns = attendance.getActiveSpawns();
        const pendingVerifications = attendance.getPendingVerifications();
        const spawnInfo = activeSpawns[thread.id];

        if (!spawnInfo || spawnInfo.closed) {
          await interaction.editReply({
            content: '⚠️ This spawn is closed or not found.'
          });
          return;
        }

        const pendingInThread = Object.entries(pendingVerifications).filter(
          ([msgId, p]) => p.threadId === thread.id
        );

        if (pendingInThread.length === 0) {
          await interaction.editReply({
            content: 'ℹ️ No pending verifications in this thread.'
          });
          return;
        }

        const deniedMembers = pendingInThread.map(([msgId, p]) => p.author);

        // Clean up all verification buttons and remove from pending
        for (const [msgId, pending] of pendingInThread) {
          if (pending.verificationMsgId) {
            const verificationMsg = await thread.messages
              .fetch(pending.verificationMsgId)
              .catch(() => null);
            if (verificationMsg && verificationMsg.components.length > 0) {
              await verificationMsg.edit({ components: [] }).catch(() => {});
            }
          }
          delete pendingVerifications[msgId];
        }

        attendance.setPendingVerifications(pendingVerifications);

        await interaction.editReply({
          content:
            `❌ **Deny All Complete!**\n\n` +
            `Denied ${deniedMembers.length} member(s): ${deniedMembers.join(', ')}\n\n` +
            `These members were NOT added to the verified list.`
        });

        if (spawnInfo.confirmThreadId) {
          const confirmThread = await interaction.guild.channels
            .fetch(spawnInfo.confirmThreadId)
            .catch(() => null);
          if (confirmThread) {
            await confirmThread.send(
              `❌ **Bulk Denial by ${interaction.user.username}**\n` +
              `Denied ${deniedMembers.length} member(s): ${deniedMembers.join(', ')}`
            );
          }
        }

        console.log(
          `❌ /denyall: ${deniedMembers.length} denied for ${spawnInfo.boss} by ${interaction.user.username}`
        );

      } catch (error) {
        console.error('Error in /denyall command:', error);
        await interaction.editReply({
          content: `❌ Failed to deny all: ${error.message}`
        });
      }

      return;
    }

    if (commandName === 'close') {
      await interaction.deferReply();

      try {
        const threadOption = interaction.options.getChannel('thread');
        const thread = threadOption || interaction.channel;

        if (!thread.isThread()) {
          await interaction.editReply({
            content: '❌ Must specify a thread or use this command inside a thread.'
          });
          return;
        }

        const activeSpawns = attendance.getActiveSpawns();
        const spawnInfo = activeSpawns[thread.id];

        if (!spawnInfo || spawnInfo.closed) {
          await interaction.editReply({
            content: '⚠️ This spawn is already closed or not found.'
          });
          return;
        }

        await interaction.editReply({
          content: `🔄 Closing attendance thread for **${spawnInfo.boss}** (${spawnInfo.timestamp})...\n\nThis may take a moment.`
        });

        // Use synthetic message to call existing close logic
        const syntheticMessage = {
          content: 'close',
          author: interaction.user,
          channel: thread,
          guild: interaction.guild,
          reply: async (content) => thread.send(content)
        };

        // Trigger the close command by sending "close" message
        // The existing handler in index2.js will process it
        await thread.send('close');

        console.log(
          `🔒 /close: ${spawnInfo.boss} by ${interaction.user.username}`
        );

      } catch (error) {
        console.error('Error in /close command:', error);
        await interaction.editReply({
          content: `❌ Failed to close thread: ${error.message}`
        });
      }

      return;
    }

    if (commandName === 'closeall') {
      await interaction.deferReply();

      try {
        const guild = interaction.guild;
        const attChannel = await guild.channels
          .fetch(config.attendance_channel_id)
          .catch(() => null);

        if (!attChannel) {
          await interaction.editReply({
            content: '❌ Could not find attendance channel.'
          });
          return;
        }

        const attThreads = await attChannel.threads.fetchActive().catch(() => null);
        if (!attThreads || attThreads.threads.size === 0) {
          await interaction.editReply({
            content: '🔭 No active threads found in attendance channel.'
          });
          return;
        }

        const activeSpawns = attendance.getActiveSpawns();
        const openSpawns = [];

        for (const [threadId, thread] of attThreads.threads) {
          const spawnInfo = activeSpawns[threadId];
          if (spawnInfo && !spawnInfo.closed) {
            openSpawns.push({ threadId, thread, spawnInfo });
          }
        }

        if (openSpawns.length === 0) {
          await interaction.editReply({
            content: '🔭 No open spawn threads found in bot memory.'
          });
          return;
        }

        await interaction.editReply({
          content:
            `⚠️ **MASS CLOSE ALL THREADS?**\n\n` +
            `This will close ${openSpawns.length} spawn thread(s):\n` +
            openSpawns
              .map(
                (s, i) =>
                  `${i + 1}. **${s.spawnInfo.boss}** (${s.spawnInfo.timestamp}) - ${s.spawnInfo.members.length} verified`
              )
              .join('\n') +
            `\n\n**React with ✅ to confirm or ❌ to cancel.**\n` +
            `⏱️ This will take approximately ${openSpawns.length * 5} seconds.`
        });

        // Note: For now, we'll just inform. Full implementation would require
        // button confirmation similar to !closeallthread
        console.log(
          `📋 /closeall: Requested by ${interaction.user.username} for ${openSpawns.length} threads`
        );

      } catch (error) {
        console.error('Error in /closeall command:', error);
        await interaction.editReply({
          content: `❌ Failed to close all threads: ${error.message}`
        });
      }

      return;
    }

    if (commandName === 'resetpending') {
      await interaction.deferReply();

      try {
        const thread = interaction.channel;
        if (!thread.isThread()) {
          await interaction.editReply({
            content: '❌ This command must be used inside an attendance thread.'
          });
          return;
        }

        const pendingVerifications = attendance.getPendingVerifications();
        const pendingInThread = Object.keys(pendingVerifications).filter(
          (msgId) => pendingVerifications[msgId].threadId === thread.id
        );

        if (pendingInThread.length === 0) {
          await interaction.editReply({
            content: '✅ No pending verifications in this thread.'
          });
          return;
        }

        pendingInThread.forEach((msgId) => delete pendingVerifications[msgId]);
        attendance.setPendingVerifications(pendingVerifications);

        await interaction.editReply({
          content:
            `✅ **Cleared ${pendingInThread.length} pending verification(s).**\n\n` +
            `You can now close the thread.`
        });

        console.log(
          `🔧 /resetpending: ${thread.id} by ${interaction.user.username} (${pendingInThread.length} cleared)`
        );

      } catch (error) {
        console.error('Error in /resetpending command:', error);
        await interaction.editReply({
          content: `❌ Failed to reset pending: ${error.message}`
        });
      }

      return;
    }

    // =========================================================================
    // BOSS TIMER COMMANDS
    // =========================================================================

    if (commandName === 'killed') {
      const boss = interaction.options.getString('boss');
      const timestamp = interaction.options.getString('timestamp') || 'now';

      await interaction.deferReply();

      // Create a synthetic message object for compatibility with existing handler
      const syntheticMessage = {
        content: `!killed ${boss} ${timestamp}`,
        author: interaction.user,
        channel: interaction.channel,
        guild: interaction.guild,
        reply: async (content) => interaction.editReply(content)
      };

      const args = [boss];
      if (timestamp !== 'now') {
        args.push(timestamp);
      }

      try {
        // Call existing boss timer command handler
        // Handler will reply via syntheticMessage.reply which maps to interaction.editReply
        await bossTimerCommands.handleKilled(syntheticMessage, args, config);
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
        // Handler will reply via syntheticMessage.reply which maps to interaction.editReply
        await bossTimerCommands.handleSpawned(syntheticMessage, [boss], config);
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
        // Handler will reply via syntheticMessage.reply which maps to interaction.editReply
        await bossTimerCommands.handleUnkill(syntheticMessage, [boss], config);
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
        // Handler will reply via syntheticMessage.reply which maps to interaction.editReply
        await bossTimerCommands.handleSetBoss(syntheticMessage, [boss, status], config);
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
        // Handler will reply via syntheticMessage.reply which maps to interaction.editReply
        await bossTimerCommands.handleNoSpawn(syntheticMessage, [boss], config);
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
        // Handler will reply via syntheticMessage.reply which maps to interaction.editReply
        await bossTimerCommands.handleMaintenance(syntheticMessage);
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
        // Handler will reply via syntheticMessage.reply which maps to interaction.editReply
        await bossTimerCommands.handleServerDown(syntheticMessage);
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
        // Handler will reply via syntheticMessage.reply which maps to interaction.editReply
        await bossTimerCommands.handleClearKills(syntheticMessage);
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

              // Handle guilds array - check if it's empty or missing
              const hasGuilds = rotation.guilds && Array.isArray(rotation.guilds) && rotation.guilds.length > 0;
              const guildCount = hasGuilds ? rotation.guilds.length : 5;

              let nextGuild = 'Unknown';
              if (hasGuilds && rotation.guilds[rotation.currentIndex % guildCount]) {
                nextGuild = rotation.guilds[rotation.currentIndex % guildCount];
              } else if (rotation.nextGuild) {
                nextGuild = rotation.nextGuild;
              } else if (rotation.currentGuild) {
                nextGuild = rotation.currentGuild;
              }

              // Show warning if guilds data is incomplete
              const dataWarning = !hasGuilds ? '\n⚠️ Guild list incomplete in sheet' : '';

              embed.addFields({
                name: `${emoji} ${boss}`,
                value: `Guild ${rotation.currentIndex}/${guildCount} - **${status}**\nNext: ${nextGuild}${spawnInfo}${dataWarning}`,
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

              // Handle guilds array - check if it's empty or missing
              const hasGuilds = rotation.guilds && Array.isArray(rotation.guilds) && rotation.guilds.length > 0;
              const guildCount = hasGuilds ? rotation.guilds.length : 5;

              // Show warning if guilds data is incomplete
              const dataWarning = !hasGuilds ? ' ⚠️ (incomplete)' : '';

              embed.addFields({
                name: `${emoji} ${boss}`,
                value: `Guild ${rotation.currentIndex}/${guildCount} - **${status}**${dataWarning}`,
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

    // =========================================================================
    // AUCTION/BIDDING COMMANDS
    // =========================================================================

    // /bid command - Place a bid
    if (commandName === 'bid') {
      const amount = interaction.options.getInteger('amount');

      // Create synthetic message for compatibility with existing bidding.handleCommand
      const syntheticMessage = {
        author: interaction.user,
        member: interaction.member,
        channel: interaction.channel,
        guild: interaction.guild,
        content: `!bid ${amount}`,
        reply: async (content) => {
          if (typeof content === 'string') {
            return await interaction.editReply({ content });
          } else if (content.embeds) {
            return await interaction.editReply({ embeds: content.embeds, content: content.content || null });
          } else {
            return await interaction.editReply(content);
          }
        }
      };

      await interaction.deferReply();
      await bidding.handleCommand(syntheticMessage, config);
      return;
    }

    // /auction subcommands
    if (commandName === 'auction') {
      const subcommand = interaction.options.getSubcommand();

      await interaction.deferReply();

      if (subcommand === 'start') {
        // Check if auction is already running
        const auctState = auctioneering.getAuctionState();
        if (auctState.active) {
          await interaction.editReply({
            content: '❌ Auction is already running!'
          });
          return;
        }

        // Start auction
        await auctioneering.startAuctioneering(interaction.guild, config, client);
        await interaction.editReply({
          content: '✅ Auction session started!'
        });
        return;
      }

      if (subcommand === 'forceend') {
        const syntheticMessage = {
          author: interaction.user,
          member: interaction.member,
          channel: interaction.channel,
          guild: interaction.guild,
          content: '!forcesubmitresults',
          reply: async (content) => {
            if (typeof content === 'string') {
              return await interaction.editReply({ content });
            } else if (content.embeds) {
              return await interaction.editReply({ embeds: content.embeds, content: content.content || null });
            } else {
              return await interaction.editReply(content);
            }
          }
        };

        await auctioneering.handleForceSubmitResults(syntheticMessage, config, bidding);
        return;
      }
    }

    // /queue subcommands
    if (commandName === 'queue') {
      const subcommand = interaction.options.getSubcommand();

      await interaction.deferReply();

      if (subcommand === 'list') {
        const syntheticMessage = {
          author: interaction.user,
          member: interaction.member,
          channel: interaction.channel,
          guild: interaction.guild,
          content: '!queuelist',
          reply: async (content) => {
            if (typeof content === 'string') {
              return await interaction.editReply({ content });
            } else if (content.embeds) {
              return await interaction.editReply({ embeds: content.embeds, content: content.content || null });
            } else {
              return await interaction.editReply(content);
            }
          }
        };

        await auctioneering.handleQueueList(syntheticMessage, bidding.getBiddingState());
        return;
      }
    }

    // =========================================================================
    // STATS & REPORTS COMMANDS
    // =========================================================================

    // /stats command - Member statistics lookup
    if (commandName === 'stats') {
      const memberOption = interaction.options.getString('member');

      // Build args array for stats command
      const args = memberOption ? memberOption.split(' ') : [];

      const syntheticMessage = {
        author: interaction.user,
        member: interaction.member,
        channel: interaction.channel,
        guild: interaction.guild,
        content: memberOption ? `!stats ${memberOption}` : '!stats',
        mentions: { members: new Map() }, // Empty mentions map
        reply: async (content) => {
          if (typeof content === 'string') {
            return await interaction.editReply({ content });
          } else if (content.embeds) {
            return await interaction.editReply({ embeds: content.embeds, content: content.content || null });
          } else {
            return await interaction.editReply(content);
          }
        }
      };

      await interaction.deferReply();

      // Call stats handler from index2
      const { commandHandlers } = require('../index2.js');
      await commandHandlers.stats(syntheticMessage, interaction.member, args);
      return;
    }

    // /weekly command - Weekly report
    if (commandName === 'weekly') {
      const syntheticMessage = {
        author: interaction.user,
        member: interaction.member,
        channel: interaction.channel,
        guild: interaction.guild,
        content: '!weekly',
        reply: async (content) => {
          if (typeof content === 'string') {
            return await interaction.editReply({ content });
          } else if (content.embeds) {
            return await interaction.editReply({ embeds: content.embeds, content: content.content || null });
          } else {
            return await interaction.editReply(content);
          }
        }
      };

      await interaction.deferReply();

      const { commandHandlers } = require('../index2.js');
      await commandHandlers.weekly(syntheticMessage, interaction.member);
      return;
    }

    // /monthly command - Monthly report
    if (commandName === 'monthly') {
      const syntheticMessage = {
        author: interaction.user,
        member: interaction.member,
        channel: interaction.channel,
        guild: interaction.guild,
        content: '!monthly',
        reply: async (content) => {
          if (typeof content === 'string') {
            return await interaction.editReply({ content });
          } else if (content.embeds) {
            return await interaction.editReply({ embeds: content.embeds, content: content.content || null });
          } else {
            return await interaction.editReply(content);
          }
        }
      };

      await interaction.deferReply();

      const { commandHandlers } = require('../index2.js');
      await commandHandlers.monthly(syntheticMessage, interaction.member);
      return;
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
