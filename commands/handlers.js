/**
 * =============================================================================
 * SLASH COMMAND HANDLERS
 * =============================================================================
 *
 * Handles slash command execution by routing to existing bot modules.
 * Maintains compatibility with existing prefix commands.
 *
 * @module commands/handlers
 * @author TENCHU Development Team
 */

const { EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle, ComponentType } = require('discord.js');
const tipSystem = require('./tip-system');
const fs = require('fs');
const path = require('path');
const mongoHelpers = require('../utils/mongodb-helpers');
const { detectChannelType, CHANNEL_TYPES } = require('../help-system-v2');

// Feature Flags
const USE_MONGODB_ATTENDANCE = process.env.USE_MONGODB_ATTENDANCE === 'true';

// Load boss points configuration
const bossPoints = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'boss_points.json')));

// Channel restriction mapping for slash commands
// Maps command name → array of allowed channel types (from CHANNEL_TYPES)
// Commands not listed here are unrestricted (work everywhere)
const SLASH_CHANNEL_MAP = {
  // Attendance thread commands (only work inside attendance threads)
  'close': [CHANNEL_TYPES.ATTENDANCE_THREAD],

  // Boss timer commands (only in boss timer channel)
  'killed': [CHANNEL_TYPES.BOSS_TIMER],
  'spawned': [CHANNEL_TYPES.BOSS_TIMER],
  'nextspawn': [CHANNEL_TYPES.BOSS_TIMER],
  'setboss': [CHANNEL_TYPES.BOSS_TIMER],
  'maintenance': [CHANNEL_TYPES.BOSS_TIMER],
  'clearkills': [CHANNEL_TYPES.BOSS_TIMER],

  // Admin commands (admin_logs channel only)
  'status': [CHANNEL_TYPES.ADMIN_LOGS],
  'closeall': [CHANNEL_TYPES.ADMIN_LOGS],
  'openthread': [CHANNEL_TYPES.ATTENDANCE_THREAD],
  'overrideclose': [CHANNEL_TYPES.ATTENDANCE_THREAD],
  'remove-member': [CHANNEL_TYPES.ADMIN_LOGS],
  'rotation': [CHANNEL_TYPES.ADMIN_LOGS],
  'auction': [CHANNEL_TYPES.ADMIN_LOGS],
  'bidding': [CHANNEL_TYPES.ADMIN_LOGS],
  'queue': [CHANNEL_TYPES.ADMIN_LOGS],
  'weekly': [CHANNEL_TYPES.ADMIN_LOGS],
  'monthly': [CHANNEL_TYPES.ADMIN_LOGS],
  'emergency': [CHANNEL_TYPES.ADMIN_LOGS],

  // Auction thread commands (only inside auction threads)
  'bid': [CHANNEL_TYPES.AUCTION_THREAD],

  // Public commands (guild chat or bot commands)
  'stats': [CHANNEL_TYPES.GUILD_CHAT, CHANNEL_TYPES.BOT_COMMANDS],
  'newmember': [CHANNEL_TYPES.GUILD_CHAT, CHANNEL_TYPES.BOT_COMMANDS],
  'leaderboards': [CHANNEL_TYPES.GUILD_CHAT, CHANNEL_TYPES.BOT_COMMANDS],
  'activity': [CHANNEL_TYPES.GUILD_CHAT, CHANNEL_TYPES.BOT_COMMANDS, CHANNEL_TYPES.ADMIN_LOGS],

  // Universal commands (help is unrestricted - 'all')
};

// Friendly channel names for error messages
const CHANNEL_NAME_MAP = {
  [CHANNEL_TYPES.ADMIN_LOGS]: 'Admin Logs',
  [CHANNEL_TYPES.ATTENDANCE_THREAD]: 'an attendance thread',
  [CHANNEL_TYPES.AUCTION_THREAD]: 'an auction thread',
  [CHANNEL_TYPES.GUILD_CHAT]: 'Guild Chat',
  [CHANNEL_TYPES.BOT_COMMANDS]: 'Bot Commands',
  [CHANNEL_TYPES.BOSS_TIMER]: 'the boss timer channel',
  [CHANNEL_TYPES.ATTENDANCE]: 'the attendance channel',
  [CHANNEL_TYPES.BIDDING]: 'the bidding channel',
};

// Constants
const CONFIRMATION_TIMEOUT = 30000; // 30 seconds

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
  const { attendance, bossTimer, bossTimerCommands, bossRotation, bidding, auctioneering, emergencyCommands, sheetAPI } = modules;
  const commandName = interaction.commandName;

  // Track slash command usage for tip system
  tipSystem.trackSlashCommandUsage(interaction.user.id, commandName);

  try {
    // ═══════════════════════════════════════════════════════════════
    // CHANNEL RESTRICTION CHECK
    // ═══════════════════════════════════════════════════════════════
    const allowedTypes = SLASH_CHANNEL_MAP[commandName];
    if (allowedTypes) {
      const channelType = detectChannelType(interaction);
      if (!allowedTypes.includes(channelType)) {
        const channelNames = allowedTypes.map(t => CHANNEL_NAME_MAP[t] || t);
        const channelList = channelNames.join(' or ');
        await interaction.reply({
          content: `❌ This command cannot be used here. Please use it in **${channelList}**.`,
          ephemeral: true
        });
        return;
      }
    }

    // =========================================================================
    // ATTENDANCE COMMANDS
    // =========================================================================

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

        // Create confirmation buttons
        const confirmButton = new ButtonBuilder()
          .setCustomId(`closeall_confirm_${interaction.user.id}_${Date.now()}`)
          .setLabel('✅ Confirm')
          .setStyle(ButtonStyle.Success);

        const cancelButton = new ButtonBuilder()
          .setCustomId(`closeall_cancel_${interaction.user.id}_${Date.now()}`)
          .setLabel('❌ Cancel')
          .setStyle(ButtonStyle.Secondary);

        const row = new ActionRowBuilder().addComponents(confirmButton, cancelButton);

        // Build confirmation content, truncating spawn list to stay under 2000-char limit
        const spawnListLines = openSpawns
          .map(
            (s, i) =>
              `${i + 1}. **${s.spawnInfo.boss}** (${s.spawnInfo.timestamp}) - ${s.spawnInfo.members.length} verified`
          );
        let spawnListBlock = spawnListLines.slice(0, 20).join('\n');
        if (openSpawns.length > 20) {
          spawnListBlock += `\n\n➕ ...and ${openSpawns.length - 20} more`;
        }

        const confirmMsg = await interaction.editReply({
          content:
            `⚠️ **MASS CLOSE ALL THREADS?**\n\n` +
            `This will:\n` +
            `• Verify ALL pending members in ALL threads\n` +
            `• Close and submit ${openSpawns.length} spawn thread(s)\n` +
            `• Process one thread at a time (to avoid rate limits)\n\n` +
            `**Threads to close:**\n` +
            spawnListBlock +
            `\n\nClick ✅ Confirm or ❌ Cancel button below.\n\n` +
            `⏱️ This will take approximately ${openSpawns.length * 5} seconds.`,
          components: [row]
        });

        console.log(`🔘 [BUTTON] /closeall confirmation sent to ${interaction.user.tag} (${interaction.user.id})`);

        // Create button collector
        const collector = confirmMsg.createMessageComponentCollector({
          componentType: ComponentType.Button,
          time: CONFIRMATION_TIMEOUT,
          filter: i => i.user.id === interaction.user.id
        });

        collector.on('collect', async (buttonInteraction) => {
          try {
            const isConfirm = buttonInteraction.customId.includes('confirm');
            console.log(`🔘 [BUTTON] ${interaction.user.tag} clicked ${isConfirm ? 'Confirm' : 'Cancel'}`);

            // Disable buttons
            const disabledRow = new ActionRowBuilder().addComponents(
              ButtonBuilder.from(confirmButton).setDisabled(true),
              ButtonBuilder.from(cancelButton).setDisabled(true)
            );

            await buttonInteraction.update({ components: [disabledRow] });

            if (!isConfirm) {
              await interaction.followUp({
                content: '❌ Mass close cancelled.',
                ephemeral: true
              });
              collector.stop();
              return;
            }

            // Process the mass close
            await interaction.followUp({
              content:
                `📁 **Starting mass close...**\n\n` +
                `Processing ${openSpawns.length} thread(s) one by one...\n` +
                `Please wait, this may take a few minutes.`
            });

            const normalizeUsername = (username) => username.toLowerCase().replace(/\s+/g, '');
            const pendingVerifications = attendance.getPendingVerifications();

            let successCount = 0;
            let failCount = 0;
            const results = [];

            for (let i = 0; i < openSpawns.length; i++) {
              const { threadId, thread, spawnInfo } = openSpawns[i];

              try {
                const progress = Math.floor(((i + 1) / openSpawns.length) * 20);
                const progressBar = '█'.repeat(progress) + '░'.repeat(20 - progress);
                const progressPercent = Math.floor(((i + 1) / openSpawns.length) * 100);

                await interaction.followUp({
                  content:
                    `📋 **[${i + 1}/${openSpawns.length}]** ${progressBar} ${progressPercent}%\n` +
                    `Processing: **${spawnInfo.boss}** (${spawnInfo.timestamp})...`
                });

                // Auto-verify pending members
                const pendingInThread = Object.entries(pendingVerifications).filter(
                  ([msgId, p]) => p.threadId === threadId
                );

                if (pendingInThread.length > 0) {
                  const newMembers = pendingInThread.filter(
                    ([msgId, p]) =>
                      !spawnInfo.members.some(
                        (m) => normalizeUsername(m) === normalizeUsername(p.author)
                      )
                  );

                  if (!spawnInfo.memberIds) spawnInfo.memberIds = {};
                  for (const [msgId, p] of newMembers) {
                    spawnInfo.members.push(p.author);
                    spawnInfo.memberIds[p.author] = p.authorId;
                  }

                  pendingInThread.forEach(([msgId]) => delete pendingVerifications[msgId]);

                  await interaction.followUp({
                    content: `   ✅ Auto-verified ${newMembers.length} member(s) (${pendingInThread.length - newMembers.length} duplicates)`
                  });
                }

                spawnInfo.closed = true;

                // Submit to Google Sheets if there are members
                if (spawnInfo.members.length === 0) {
                  // Even with 0 members, increment boss rotation
                  await bossRotation.handleBossKill(spawnInfo.boss);
                  await bossRotation.deleteRotationWarning(spawnInfo.boss);
                  await bossRotation.checkAndDeleteDailySchedule(spawnInfo.boss);

                  await thread.setLocked(true).catch((err) => console.error('[handlers] thread setLocked (0 members path) failed:', err?.message || err));
                  await thread.setArchived(true).catch((err) => console.error('[handlers] thread setArchived (0 members path) failed:', err?.message || err));

                  delete activeSpawns[threadId];
                  successCount++;
                  results.push(`⚠️ **${spawnInfo.boss}** - 0 members (no submission)`);

                  console.log(`📍 /closeall: ${spawnInfo.boss} at ${spawnInfo.timestamp} (0 members)`);
                } else {
                  // ═══════════════════════════════════════════════════════════════
                  // PARALLEL SAVE: MongoDB + Google Sheets (SIMULTANEOUS)
                  // ═══════════════════════════════════════════════════════════════
                  let submitted = false;
                  let submissionSource = 'Unknown';

                  if (USE_MONGODB_ATTENDANCE) {
                    console.log(`📊 /closeall: Submitting ${spawnInfo.members.length} members for ${spawnInfo.boss} (${spawnInfo.timestamp})`);

                    // Prepare MongoDB save promise
                    const mongoSavePromise = (async () => {
                      try {
                        // Add attendance records for each member
                        for (const memberName of spawnInfo.members) {
                          // Get Discord ID from memberIds map if available
                          const discordId = spawnInfo.memberIds?.[memberName];

                          await mongoHelpers.addAttendance({
                            username: memberName,
                            discordId: discordId, // Pass Discord ID for reliable identification
                            boss: spawnInfo.boss,
                            timestamp: spawnInfo.timestamp,
                            date: spawnInfo.date,
                            time: spawnInfo.time,
                            points: bossPoints[spawnInfo.boss]?.points || 1
                          });
                        }
                        return { success: true, source: 'MongoDB' };
                      } catch (error) {
                        console.error(`   ❌ [MongoDB] Failed to submit attendance:`, error.message);
                        return { success: false, source: 'MongoDB', error };
                      }
                    })();

                    // Prepare Google Sheets save promise
                    const sheetSavePromise = (async () => {
                      try {
                        const payload = {
                          action: 'submitAttendance',
                          boss: spawnInfo.boss,
                          date: spawnInfo.date,
                          time: spawnInfo.time,
                          timestamp: spawnInfo.timestamp,
                          members: spawnInfo.members
                        };

                        const resp = await attendance.postToSheet(payload);

                        if (resp.ok) {
                          return { success: true, source: 'Google Sheets' };
                        } else {
                          return { success: false, source: 'Google Sheets', error: resp.text || resp.err };
                        }
                      } catch (error) {
                        console.error(`   ❌ [Sheets] Failed to submit attendance:`, error.message);
                        return { success: false, source: 'Google Sheets', error };
                      }
                    })();

                    // Execute both saves in parallel
                    const [mongoResult, sheetResult] = await Promise.all([
                      mongoSavePromise,
                      sheetSavePromise
                    ]);

                    // Log results
                    if (mongoResult.success) {
                      console.log(`   ✅ [MongoDB] Submitted ${spawnInfo.members.length} attendance records`);
                    }
                    if (sheetResult.success) {
                      console.log(`   ✅ [Sheets] Submitted ${spawnInfo.members.length} attendance records`);
                    }

                    // Consider successful if at least one succeeded
                    if (mongoResult.success || sheetResult.success) {
                      submitted = true;
                      submissionSource = [
                        mongoResult.success ? 'MongoDB' : null,
                        sheetResult.success ? 'Sheets' : null
                      ].filter(Boolean).join(' + ');
                    } else {
                      console.error(`   ❌ Both MongoDB and Sheets failed!`);
                    }

                  } else {
                    // ═════════════════════════════════════════════════════════════════
                    // SHEETS ONLY PATH (when MongoDB disabled)
                    // ═════════════════════════════════════════════════════════════════
                    const payload = {
                      action: 'submitAttendance',
                      boss: spawnInfo.boss,
                      date: spawnInfo.date,
                      time: spawnInfo.time,
                      timestamp: spawnInfo.timestamp,
                      members: spawnInfo.members
                    };

                    const resp = await attendance.postToSheet(payload);

                    if (resp.ok) {
                      console.log(`   ✅ Submitted ${spawnInfo.members.length} members to Google Sheets`);
                      submitted = true;
                      submissionSource = 'Google Sheets';
                    } else {
                      console.log(`   ❌ Failed to submit attendance: ${resp.text || resp.err}`);
                    }
                  }

                  if (submitted) {
                    console.log(`   📊 Submission source: ${submissionSource}`);

                    // Auto-increment boss rotation
                    await bossRotation.handleBossKill(spawnInfo.boss);
                    await bossRotation.deleteRotationWarning(spawnInfo.boss);
                    await bossRotation.checkAndDeleteDailySchedule(spawnInfo.boss);

                    await thread.setLocked(true).catch((err) => console.error('[handlers] thread setLocked (submitted path) failed:', err?.message || err));
                    await thread.setArchived(true).catch((err) => console.error('[handlers] thread setArchived (submitted path) failed:', err?.message || err));

                    delete activeSpawns[threadId];
                    successCount++;
                    results.push(`✅ **${spawnInfo.boss}** - ${spawnInfo.members.length} members submitted (${submissionSource})`);

                    console.log(`📍 /closeall: ${spawnInfo.boss} at ${spawnInfo.timestamp} (${spawnInfo.members.length} members)`);
                  } else {
                    failCount++;
                    results.push(`❌ **${spawnInfo.boss}** - Failed to submit to both MongoDB and Sheets`);
                    console.error(`❌ /closeall failed for ${spawnInfo.boss}: Both MongoDB and Sheets failed`);
                  }
                }

                // Rate limiting delay
                await new Promise(resolve => setTimeout(resolve, 2000));

              } catch (threadError) {
                failCount++;
                results.push(`❌ **${spawnInfo.boss}** - Error: ${threadError.message}`);
                console.error(`❌ /closeall error processing ${spawnInfo.boss}:`, threadError);
              }
            }

            // Send summary
            let summaryResults = results.join('\n');
            if (summaryResults.length > 3800) {
              summaryResults = results.slice(0, 50).join('\n') + `\n\n➕ ...and ${results.length - 50} more`;
            }

            const summaryEmbed = new EmbedBuilder()
              .setColor(failCount === 0 ? 0x00ff00 : 0xffa500)
              .setTitle('📋 Mass Close Complete')
              .setDescription(
                `**Summary:**\n` +
                `✅ Success: ${successCount}\n` +
                `❌ Failed: ${failCount}\n\n` +
                `**Results:**\n${summaryResults}`
              )
              .setTimestamp();

            await interaction.followUp({ embeds: [summaryEmbed] });

            collector.stop();

          } catch (error) {
            console.error('❌ [BUTTON] Error in /closeall button handler:', error);
            await buttonInteraction.followUp({
              content: `❌ An error occurred: ${error.message}`,
              ephemeral: true
            }).catch((err) => console.error('[handlers] closeall button error followUp failed:', err?.message || err));
          }
        });

        collector.on('end', async (collected, reason) => {
          console.log(`🔘 [BUTTON] /closeall collector ended: ${reason} (${collected.size} interactions)`);

          if (reason === 'time' && collected.size === 0) {
            const disabledRow = new ActionRowBuilder().addComponents(
              ButtonBuilder.from(confirmButton).setDisabled(true),
              ButtonBuilder.from(cancelButton).setDisabled(true)
            );

            await interaction.editReply({ components: [disabledRow] }).catch((err) => console.error('[handlers] closeall collector end editReply failed:', err?.message || err));
            await interaction.followUp({
              content: '⏱️ Confirmation timed out.',
              ephemeral: true
            }).catch((err) => console.error('[handlers] closeall collector end followUp failed:', err?.message || err));
          }
        });

      } catch (error) {
        console.error('Error in /closeall command:', error);
        await interaction.editReply({
          content: `❌ Failed to process closeall: ${error.message}`,
          components: []
        }).catch((err) => console.error('[handlers] closeall outer catch editReply failed:', err?.message || err));
      }

      return;
    }

    // =========================================================================
    // ATTENDANCE OVERRIDE COMMANDS
    // =========================================================================

    // /openthread command - Reopen closed attendance thread
    if (commandName === 'openthread') {
      // Defer with ephemeral to acknowledge interaction
      // The handler sends confirmation buttons to channel, not as interaction response
      await interaction.deferReply({ ephemeral: true });

      // Create synthetic message object to reuse existing !openthread handler
      const syntheticMessage = {
        author: interaction.user,
        member: interaction.member,
        channel: interaction.channel,
        guild: interaction.guild,
        content: '!openthread',
        mentions: { members: new Map() },
        reply: async (content) => {
          // Send directly to channel (not as interaction response)
          // This allows the handler's confirmation flow to work naturally
          if (typeof content === 'string') {
            return await interaction.channel.send({ content });
          } else if (content.embeds) {
            return await interaction.channel.send({ embeds: content.embeds, content: content.content || null });
          } else {
            return await interaction.channel.send(content);
          }
        }
      };

      try {
        const { commandHandlers } = require('../index2.js');
        await commandHandlers.openthread(syntheticMessage, interaction.member);
        // Properly resolve the deferred interaction (ephemeral, only user sees this)
        await interaction.editReply({ content: '✅ Command processed' });
      } catch (error) {
        console.error('Error in /openthread command:', error);
        await interaction.editReply({ content: `❌ Error: ${error.message}` });
      }
      return;
    }

    // /overrideclose command - Close and overwrite attendance
    if (commandName === 'overrideclose') {
      // Immediately acknowledge interaction to prevent timeout
      await interaction.reply({ content: '🔄 Processing override close...', ephemeral: true });

      // Create synthetic message object to reuse existing !overrideclose handler
      const syntheticMessage = {
        author: interaction.user,
        member: interaction.member,
        channel: interaction.channel,
        guild: interaction.guild,
        content: '!overrideclose',
        mentions: { members: new Map() },
        reply: async (content) => {
          // Send directly to channel (not as interaction response)
          if (typeof content === 'string') {
            return await interaction.channel.send({ content });
          } else if (content.embeds) {
            return await interaction.channel.send({ embeds: content.embeds, content: content.content || null });
          } else {
            return await interaction.channel.send(content);
          }
        }
      };

      try {
        const { commandHandlers } = require('../index2.js');
        // Run handler asynchronously (don't await - prevents interaction timeout)
        commandHandlers.overrideclose(syntheticMessage, interaction.member)
          .then(() => {
            interaction.editReply({ content: '✅ Override close completed!', ephemeral: true })
              .catch(err => console.log('Could not edit reply:', err.message));
          })
          .catch(async (error) => {
            console.error('Error in /overrideclose command:', error);
            interaction.editReply({ content: `❌ Error: ${error.message}`, ephemeral: true })
              .catch(err => console.log('Could not edit reply:', err.message));
          });
      } catch (error) {
        console.error('Error in /overrideclose command:', error);
        await interaction.editReply({ content: `❌ Error: ${error.message}` }).catch((err) => console.error('[handlers] overrideclose error editReply failed:', err?.message || err));
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
        client: client,
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
        client: client,
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
        client: client,
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

    if (commandName === 'setboss') {
      const boss = interaction.options.getString('boss');
      const status = interaction.options.getString('status');

      await interaction.deferReply();

      const syntheticMessage = {
        content: `!setboss ${boss} ${status}`,
        author: interaction.user,
        channel: interaction.channel,
        guild: interaction.guild,
        client: client,
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
        client: client,
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
        client: client,
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
  const MAX_FIELDS = 25;

  // =========================================================
  // STATUS
  // =========================================================
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

      let bossSpawnConfig = null;
      try {
        const configPath = path.join(__dirname, '..', 'boss_spawn_config.json');
        bossSpawnConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      } catch {}

      const bossData = [];

      for (const boss of rotatingBosses) {
        const rotation = allRotations[boss];
        if (!rotation) continue;

        const emoji = rotation.isOurTurn ? '🟢' : '🔴';
        const status = rotation.isOurTurn ? 'TENCHU\'S TURN' : `${rotation.currentGuild}'s turn`;

        let spawnInfo = '';
        let tenchuTurnInfo = '';
        let nextSpawnDate = null;

        try {
          const timerData = bossTimer.getNextSpawn(boss);
          if (timerData?.nextSpawn) {
            nextSpawnDate = timerData.nextSpawn;
          }
        } catch {}

        const hasGuilds = Array.isArray(rotation.guilds) && rotation.guilds.length > 0;
        const guildCount = hasGuilds ? rotation.guilds.length : 5;

        let nextGuild = rotation.currentGuild || 'Unknown';
        if (hasGuilds) {
          nextGuild = rotation.guilds[rotation.currentIndex % guildCount];
        }

        const dataWarning = !hasGuilds ? '\n⚠️ Guild list incomplete in sheet' : '';

        bossData.push({
          boss,
          emoji,
          status,
          rotation,
          nextGuild,
          guildCount,
          spawnInfo,
          tenchuTurnInfo,
          dataWarning,
          isOurTurn: rotation.isOurTurn || false,
          sortKey: nextSpawnDate ? nextSpawnDate.getTime() : Number.MAX_SAFE_INTEGER
        });
      }

      bossData.sort((a, b) => {
        if (a.isOurTurn !== b.isOurTurn) {
          return b.isOurTurn ? 1 : -1;
        }
        return a.sortKey - b.sortKey;
      });

      const embeds = [];
      let embed = new EmbedBuilder()
        .setColor(0x4a90e8)
        .setTitle('🔄 Boss Rotation Status')
        .setDescription('Track which guild\'s turn it is for rotating bosses')
        .setTimestamp();

      let fieldCount = 0;

      for (const data of bossData) {
        if (fieldCount === MAX_FIELDS) {
          embeds.push(embed);
          embed = new EmbedBuilder()
            .setColor(0x4a90e8)
            .setTitle('🔄 Boss Rotation Status (cont.)')
            .setTimestamp();
          fieldCount = 0;
        }

        embed.addFields({
          name: `${data.emoji} ${data.boss}`,
          value: `Guild ${data.rotation.currentIndex}/${data.guildCount} - **${data.status}**\nNext: ${data.nextGuild}${data.spawnInfo}${data.tenchuTurnInfo}${data.dataWarning}`,
          inline: false
        });

        fieldCount++;
      }

      embeds.push(embed);
      await interaction.editReply({ embeds });

    } catch (error) {
      console.error('Error in /rotation status:', error);
      await interaction.editReply({
        content: `❌ Failed to get rotation status: ${error.message}`
      });
    }

    return;
  }

  // =========================================================
  // SET
  // =========================================================
  if (subcommand === 'set') {
    const boss = interaction.options.getString('boss');
    const position = interaction.options.getInteger('position');

    await interaction.deferReply();

    try {
      const result = await bossRotation.setRotation(boss, position);

      if (!result.success) {
        await interaction.editReply({ content: `❌ Failed to set rotation: ${result.message}` });
        return;
      }

      const data = result.data;
      const emoji = data.isOurTurn ? '🟢' : '🔴';
      const status = data.isOurTurn ? 'TENCHU\'S TURN' : `${data.currentGuild}'s turn`;

      const embed = new EmbedBuilder()
        .setColor(data.isOurTurn ? 0x00ff00 : 0xff0000)
        .setTitle(`${emoji} Rotation Updated`)
        .setDescription(`**${boss}** rotation manually set`)
        .addFields(
          { name: 'Previous', value: `Index ${data.oldIndex} (${data.oldGuild})`, inline: true },
          { name: 'Current', value: `Index ${data.newIndex} (${data.newGuild})`, inline: true },
          { name: 'Status', value: `**${status}**`, inline: false }
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

    } catch (error) {
      console.error('Error in /rotation set:', error);
      await interaction.editReply({
        content: `❌ Failed to set rotation: ${error.message}`
      });
    }

    return;
  }

  // =========================================================
  // INCREMENT
  // =========================================================
  if (subcommand === 'increment') {
    const boss = interaction.options.getString('boss');
    await interaction.deferReply();

    try {
      const result = await bossRotation.incrementRotation(boss);

      if (result.updated === false) {
        await interaction.editReply({ content: '❌ Failed to increment rotation.' });
        return;
      }

      const emoji = result.isNowOurTurn ? '🟢' : '🔴';
      const status = result.isNowOurTurn ? 'TENCHU\'S TURN' : `${result.newGuild}'s turn`;

      const embed = new EmbedBuilder()
        .setColor(result.isNowOurTurn ? 0x00ff00 : 0xff0000)
        .setTitle(`${emoji} Rotation Advanced`)
        .setDescription(`**${boss}** rotation incremented`)
        .addFields(
          { name: 'Previous', value: `Index ${result.oldIndex} (${result.oldGuild})`, inline: true },
          { name: 'Current', value: `Index ${result.newIndex} (${result.newGuild})`, inline: true },
          { name: 'Status', value: `**${status}**`, inline: false }
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

    } catch (error) {
      console.error('Error in /rotation increment:', error);
      await interaction.editReply({
        content: `❌ Failed to increment rotation: ${error.message}`
      });
    }

    return;
  }

  // =========================================================
  // REFRESH
  // =========================================================
  if (subcommand === 'refresh') {
    await interaction.deferReply();

    try {
      await bossRotation.refreshRotationCache();

      const allRotations = await bossRotation.getAllRotations();
      const rotatingBosses = bossRotation.getRotatingBosses();

      if (Object.keys(allRotations).length === 0) {
        await interaction.editReply({
          content: '⚠️ No rotation data found after refresh.'
        });
        return;
      }

      const embeds = [];
      let embed = new EmbedBuilder()
        .setColor(0x00ff00)
        .setTitle('✅ Rotation Data Refreshed')
        .setDescription(`Loaded ${rotatingBosses.length} rotating bosses`)
        .setTimestamp();

      let fieldCount = 0;

      for (const boss of rotatingBosses) {
        const rotation = allRotations[boss];
        if (!rotation) continue;

        if (fieldCount === MAX_FIELDS) {
          embeds.push(embed);
          embed = new EmbedBuilder()
            .setColor(0x00ff00)
            .setTitle('✅ Rotation Data Refreshed (cont.)')
            .setTimestamp();
          fieldCount = 0;
        }

        const emoji = rotation.isOurTurn ? '🟢' : '🔴';
        const status = rotation.isOurTurn ? 'TENCHU\'S TURN' : `${rotation.currentGuild}'s turn`;
        const hasGuilds = Array.isArray(rotation.guilds) && rotation.guilds.length > 0;
        const guildCount = hasGuilds ? rotation.guilds.length : 5;
        const dataWarning = !hasGuilds ? ' ⚠️ (incomplete)' : '';

        embed.addFields({
          name: `${emoji} ${boss}`,
          value: `Guild ${rotation.currentIndex}/${guildCount} - **${status}**${dataWarning}`,
          inline: false
        });

        fieldCount++;
      }

      embeds.push(embed);
      await interaction.editReply({ embeds });

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
      await bidding.handleCommand('!bid', syntheticMessage, [String(amount)], client, config);
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
        await auctioneering.startAuctioneering(client, config, interaction.channel);
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
        // Update the original deferred reply after force submit completes
        await interaction.editReply({ content: '✅ Force submit completed. Check the channel for results.' }).catch(() => {});
        return;
      }

      if (subcommand === 'start-now') {
        const auctState = auctioneering.getAuctionState();
        if (auctState.active) {
          await interaction.editReply({
            content: '❌ Auction is already running!'
          });
          return;
        }
        await auctioneering.startAuctioneering(client, config, interaction.channel, true);
        await interaction.editReply({
          content: '✅ Auction started immediately (cooldown bypassed)!'
        });
        return;
      }

      if (subcommand === 'end') {
        const auctState = auctioneering.getAuctionState();
        if (!auctState.active) {
          await interaction.editReply({
            content: '❌ No active auction to end.'
          });
          return;
        }
        const biddingChannel = interaction.channel;
        await auctioneering.endAuctionSession(client, config, biddingChannel);
        await interaction.editReply({
          content: '✅ Auction session ended.'
        });
        return;
      }

    }

    // /bidding command - Admin bidding management
    if (commandName === 'bidding') {
      const subcommand = interaction.options.getSubcommand();

      if (subcommand === 'fix-points') {
        // Permission check
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
          author: interaction.user,
          member: interaction.member,
          channel: interaction.channel,
          guild: interaction.guild,
          content: '!fixlockedpoints',
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

        try {
          await bidding.handleCommand('!fixlockedpoints', syntheticMessage, [], client, config);
        } catch (error) {
          console.error('Error in /bidding fix-points:', error);
          await interaction.editReply({ content: `❌ Error: ${error.message}` });
        }
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
          client: client,
          content: '!queuelist',
          isSlashCommand: true, // Flag to indicate this is a slash command
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

      await interaction.deferReply();

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

      try {
        // Call stats handler from index2
        const { commandHandlers } = require('../index2.js');
        await commandHandlers.stats(syntheticMessage, interaction.member, args);
      } catch (error) {
        console.error('Error in /stats command:', error);
        await interaction.editReply({ content: `❌ Error: ${error.message}` });
      }
      return;
    }

    // /weekly command - Weekly report
    if (commandName === 'weekly') {
      await interaction.deferReply();

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

      try {
        const { commandHandlers } = require('../index2.js');
        await commandHandlers.weekly(syntheticMessage, interaction.member);
        // Handler uses channel.send(), so manually resolve the deferred interaction
        if (!interaction.replied) {
          await interaction.editReply({ content: '✅ Weekly report generated' });
        }
      } catch (error) {
        console.error('Error in /weekly command:', error);
        await interaction.editReply({ content: `❌ Error: ${error.message}` });
      }
      return;
    }

    // /monthly command - Monthly report
    if (commandName === 'monthly') {
      await interaction.deferReply();

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

      try {
        const { commandHandlers } = require('../index2.js');
        await commandHandlers.monthly(syntheticMessage, interaction.member);
        if (!interaction.replied) {
          await interaction.editReply({ content: '✅ Monthly report generated' });
        }
      } catch (error) {
        console.error('Error in /monthly command:', error);
        await interaction.editReply({ content: `❌ Error: ${error.message}` });
      }
      return;
    }

    // =========================================================================
    // MEMBER SLASH COMMANDS (NEW)
    // =========================================================================

    if (commandName === 'help') {
      await interaction.reply({ content: '📚 Opening help...', ephemeral: true });

      const syntheticMessage = {
        author: interaction.user,
        member: interaction.member,
        channel: interaction.channel,
        guild: interaction.guild,
        content: '!help',
        reply: async (content) => {
          if (typeof content === 'string') {
            return await interaction.channel.send({ content });
          } else if (content.embeds) {
            return await interaction.channel.send({ embeds: content.embeds, content: content.content || null });
          } else {
            return await interaction.channel.send(content);
          }
        }
      };

      try {
        const { commandHandlers } = require('../index2.js');
        await commandHandlers.help(syntheticMessage, interaction.member);
      } catch (error) {
        console.error('Error in /help command:', error);
      }
      return;
    }

    if (commandName === 'newmember') {
      await interaction.reply({ content: '📚 Loading new member guide...', ephemeral: true });

      const syntheticMessage = {
        author: interaction.user,
        member: interaction.member,
        channel: interaction.channel,
        guild: interaction.guild,
        content: '!newmember',
        reply: async (content) => {
          if (typeof content === 'string') {
            return await interaction.channel.send({ content });
          } else if (content.embeds) {
            return await interaction.channel.send({ embeds: content.embeds, content: content.content || null });
          } else {
            return await interaction.channel.send(content);
          }
        }
      };

      try {
        const { commandHandlers } = require('../index2.js');
        await commandHandlers.newmember(syntheticMessage, interaction.member);
      } catch (error) {
        console.error('Error in /newmember command:', error);
      }
      return;
    }

    if (commandName === 'leaderboards') {
      const type = interaction.options.getString('type');

      await interaction.reply({ content: '📊 Loading leaderboards...', ephemeral: true });

      let handlerName;
      if (type === 'attendance') handlerName = 'leaderboardattendance';
      else if (type === 'bidding') handlerName = 'leaderboardbidding';
      else handlerName = 'leaderboards';

      const syntheticMessage = {
        author: interaction.user,
        member: interaction.member,
        channel: interaction.channel,
        guild: interaction.guild,
        content: `!${handlerName}`,
        reply: async (content) => {
          if (typeof content === 'string') {
            return await interaction.channel.send({ content });
          } else if (content.embeds) {
            return await interaction.channel.send({ embeds: content.embeds, content: content.content || null });
          } else {
            return await interaction.channel.send(content);
          }
        }
      };

      try {
        const { commandHandlers } = require('../index2.js');
        await commandHandlers[handlerName](syntheticMessage, interaction.member);
      } catch (error) {
        console.error(`Error in /leaderboards ${type}:`, error);
      }
      return;
    }

    if (commandName === 'activity') {
      const week = interaction.options.getString('week') || '';

      await interaction.reply({ content: '📊 Generating activity heatmap...', ephemeral: true });

      const syntheticMessage = {
        author: interaction.user,
        member: interaction.member,
        channel: interaction.channel,
        guild: interaction.guild,
        content: `!activity ${week}`.trim(),
        reply: async (content) => {
          if (typeof content === 'string') {
            return await interaction.channel.send({ content });
          } else if (content.embeds) {
            return await interaction.channel.send({ embeds: content.embeds, content: content.content || null });
          } else {
            return await interaction.channel.send(content);
          }
        }
      };

      try {
        const { commandHandlers } = require('../index2.js');
        await commandHandlers.activity(syntheticMessage, interaction.member);
      } catch (error) {
        console.error('Error in /activity command:', error);
      }
      return;
    }

    // =========================================================================
    // ADMIN SLASH COMMANDS (NEW)
    // =========================================================================

    if (commandName === 'status') {
      // Permission check
      const guild = interaction.guild;
      const member = await guild.members.fetch(interaction.user.id).catch(() => null);
      if (!member || !isAdmin(member, config)) {
        await interaction.reply({
          content: '❌ Admin only command',
          ephemeral: true
        });
        return;
      }

      await interaction.deferReply({ ephemeral: true });

      const syntheticMessage = {
        author: interaction.user,
        member: interaction.member,
        channel: interaction.channel,
        guild: interaction.guild,
        content: '!status',
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

      try {
        const { commandHandlers } = require('../index2.js');
        await commandHandlers.status(syntheticMessage, interaction.member);
      } catch (error) {
        console.error('Error in /status command:', error);
        await interaction.editReply({ content: `❌ Error: ${error.message}` });
      }
      return;
    }

    if (commandName === 'remove-member') {
      // Permission check
      const guild = interaction.guild;
      const member = await guild.members.fetch(interaction.user.id).catch(() => null);
      if (!member || !isAdmin(member, config)) {
        await interaction.reply({
          content: '❌ Admin only command',
          ephemeral: true
        });
        return;
      }

      const memberName = interaction.options.getString('member');

      await interaction.deferReply({ ephemeral: true });

      const syntheticMessage = {
        author: interaction.user,
        member: interaction.member,
        channel: interaction.channel,
        guild: interaction.guild,
        content: `!removemember ${memberName}`,
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

      try {
        const { commandHandlers } = require('../index2.js');
        await commandHandlers.removemember(syntheticMessage, interaction.member);
      } catch (error) {
        console.error('Error in /remove-member command:', error);
        await interaction.editReply({ content: `❌ Error: ${error.message}` });
      }
      return;
    }

    // =========================================================================
    // EMERGENCY SLASH COMMANDS (NEW)
    // =========================================================================

    // /emergency command - Emergency recovery toolkit
    if (commandName === 'emergency') {
      const subcommand = interaction.options.getSubcommand();

      // Permission check
      const guild = interaction.guild;
      const member = await guild.members.fetch(interaction.user.id).catch(() => null);
      if (!member || !isAdmin(member, config)) {
        await interaction.reply({
          content: '❌ Admin only command',
          ephemeral: true
        });
        return;
      }

      await interaction.deferReply({ ephemeral: true });

      // Map subcommands to emergency handler args
      let emergencyArgs;
      switch (subcommand) {
        case 'close':
          const threadOption = interaction.options.getChannel('thread');
          emergencyArgs = ['close', threadOption ? threadOption.id : interaction.channel.id];
          break;
        case 'close-all':
          emergencyArgs = ['closeall'];
          break;
        case 'end-auction':
          emergencyArgs = ['endauction'];
          break;
        case 'unlock-points':
          emergencyArgs = ['unlock'];
          break;
        case 'clear-bids':
          emergencyArgs = ['clearbids'];
          break;
        case 'diagnostics':
          emergencyArgs = ['diag'];
          break;
        case 'force-sync':
          emergencyArgs = ['sync'];
          break;
        default:
          await interaction.editReply({
            content: `❌ Unknown emergency subcommand: ${subcommand}`
          });
          return;
      }

      const syntheticMessage = {
        author: interaction.user,
        member: interaction.member,
        channel: interaction.channel,
        guild: interaction.guild,
        content: `!emergency ${emergencyArgs.join(' ')}`,
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

      try {
        await emergencyCommands.handleEmergencyCommand(syntheticMessage, emergencyArgs);
      } catch (error) {
        console.error(`Error in /emergency ${subcommand}:`, error);
        await interaction.editReply({ content: `❌ Error: ${error.message}` });
      }
      return;
    }

    // =========================================================================
    // WEBHOOK URL COMMAND
    // =========================================================================

    // /weburl command - Update webhook URL
    if (commandName === 'weburl') {
      const guild = interaction.guild;
      const member = await guild.members.fetch(interaction.user.id).catch(() => null);
      if (!member || !isAdmin(member, config)) {
        await interaction.reply({
          content: '❌ Admin only command',
          ephemeral: true
        });
        return;
      }

      const newUrl = interaction.options.getString('url', true).trim();
      if (!newUrl.startsWith('https://')) {
        await interaction.reply({
          content: '❌ Invalid URL. Must start with `https://`',
          ephemeral: true
        });
        return;
      }

      await interaction.deferReply();

      try {
        // Update runtime config
        config.sheet_webhook_url = newUrl;

        // Update sheetAPI instance immediately
        sheetAPI.webhookUrl = newUrl;

        // Save to config.json
        const configPath = __dirname + '/../config.json';
        const fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        fileConfig.sheet_webhook_url = newUrl;
        fs.writeFileSync(configPath, JSON.stringify(fileConfig, null, 2), 'utf8');

        console.log(`🌐 Webhook URL updated to: ${newUrl} (via /weburl)`);

        await interaction.editReply({
          content: '✅ **Webhook URL updated!** Bot restarting in 2 seconds...'
        });

        setTimeout(() => {
          console.log('🔄 Restarting after webhook URL update...');
          process.exit(0);
        }, 2000);

      } catch (error) {
        console.error('❌ /weburl failed:', error.message);
        await interaction.editReply({
          content: `❌ Failed to update webhook URL: ${error.message}`
        });
      }
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
