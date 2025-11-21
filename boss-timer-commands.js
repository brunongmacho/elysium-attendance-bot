/**
 * ============================================================================
 * BOSS TIMER COMMANDS
 * ============================================================================
 *
 * Command handlers for boss timer system.
 * Commands: !killed, !nextspawn, !timers, !unkill, !nospawn, !spawned,
 *           !maintenance, !clearkills
 *
 * @module boss-timer-commands
 * ============================================================================
 */

const { EmbedBuilder } = require('discord.js');
const bossTimer = require('./boss-timer');

/**
 * Handle !killed command
 * Usage: !killed <boss> [time] [mm/dd]
 */
async function handleKilled(message, args, config) {
  // Check if in correct channel
  if (message.channel.id !== config.bossTimerChannelId) {
    const channel = await message.client.channels.fetch(config.bossTimerChannelId);
    return message.reply(`⚠️ Please use ${channel} for boss timer commands`);
  }

  if (args.length < 1) {
    return message.reply('❌ Usage: `!killed <boss> [time] [mm/dd]`\nExample: `!killed venatus 9:15 01/19`');
  }

  // Parse boss name (might be multi-word)
  let bossNameParts = [args[0]];
  let timeArg = null;
  let dateArg = null;

  // Check if second arg is a time or part of boss name
  if (args.length >= 2) {
    if (args[1].includes(':') || args[1].includes('am') || args[1].includes('pm')) {
      // It's a time
      timeArg = args[1];
      dateArg = args[2]; // Optional
    } else {
      // It's part of boss name
      bossNameParts.push(args[1]);
      if (args.length >= 3 && (args[2].includes(':') || args[2].includes('am') || args[2].includes('pm'))) {
        timeArg = args[2];
        dateArg = args[3];
      }
    }
  }

  const bossInput = bossNameParts.join(' ');
  const bossName = bossTimer.findBossName(bossInput);

  if (!bossName) {
    return message.reply(`❌ Boss not found: **${bossInput}**\nCheck spelling or use \`!timers\` to see valid boss names.`);
  }

  try {
    // Parse kill time
    const killTime = bossTimer.parseKillTime(timeArg, dateArg);

    // Record kill
    const result = await bossTimer.recordKill(bossName, killTime, message.author.username);

    // Send confirmation
    const timestamp = Math.floor(result.nextSpawn.getTime() / 1000);
    const killTimestamp = Math.floor(killTime.getTime() / 1000);

    const embed = new EmbedBuilder()
      .setColor(0x00ff00)
      .setTitle('✅ Boss Kill Recorded')
      .setDescription(`**${result.bossName}** killed at <t:${killTimestamp}:t>`)
      .addFields({
        name: '⏰ Next Spawn',
        value: `<t:${timestamp}:F> - <t:${timestamp}:R>`,
        inline: false
      })
      .setFooter({ text: `Recorded by ${message.author.username}` })
      .setTimestamp();

    await message.reply({ embeds: [embed] });
  } catch (error) {
    console.error('Error in !killed command:', error);
    return message.reply(`❌ Error: ${error.message}`);
  }
}

/**
 * Handle !nextspawn command
 */
async function handleNextSpawn(message) {
  try {
    const upcoming = bossTimer.getUpcomingSpawns(24);

    if (upcoming.length === 0) {
      return message.reply('📋 No bosses spawning in the next 24 hours.');
    }

    // Build embed
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('🕒 Boss Spawns in Next 24 Hours')
      .setDescription('**Upcoming Spawns**\n');

    let description = '';
    const now = new Date();

    for (const boss of upcoming) {
      const timestamp = Math.floor(boss.nextSpawn.getTime() / 1000);
      const bossLabel = boss.type === 'schedule' ? `${boss.bossName} (Scheduled)` : boss.bossName;

      // Check if tomorrow
      const spawnDate = boss.nextSpawn.toDateString();
      const todayDate = now.toDateString();
      const tomorrowDate = new Date(now.getTime() + 24 * 60 * 60 * 1000).toDateString();

      let timePrefix = '';
      if (spawnDate === tomorrowDate) {
        timePrefix = 'Tomorrow, ';
      }

      description += `\n**${bossLabel.toUpperCase()}**\n`;
      description += `${timePrefix}<t:${timestamp}:t> - <t:${timestamp}:R>\n`;
    }

    embed.setDescription(description);
    embed.setFooter({ text: `Total: ${upcoming.length} boss${upcoming.length > 1 ? 'es' : ''}` });
    embed.setTimestamp();

    await message.reply({ embeds: [embed] });
  } catch (error) {
    console.error('Error in !nextspawn command:', error);
    return message.reply(`❌ Error: ${error.message}`);
  }
}

/**
 * Handle !timers command (admin)
 */
async function handleTimers(message, config) {
  try {
    const { timerBased, scheduleBased } = bossTimer.getAllTimers();

    const embed = new EmbedBuilder()
      .setColor(0xff9900)
      .setTitle('⏱️ Active Boss Timers');

    // Timer-based bosses
    if (timerBased.length > 0) {
      let timerText = '';
      for (const boss of timerBased) {
        const timestamp = Math.floor(boss.nextSpawn.getTime() / 1000);
        timerText += `• **${boss.bossName}** - <t:${timestamp}:F> - <t:${timestamp}:R>\n`;
      }
      embed.addFields({
        name: `Timer-Based (${timerBased.length} active)`,
        value: timerText || 'None',
        inline: false
      });
    } else {
      embed.addFields({
        name: 'Timer-Based',
        value: 'No active timers. Use `!killed` to record boss kills.',
        inline: false
      });
    }

    // Schedule-based bosses
    let scheduleText = '';
    for (const boss of scheduleBased.slice(0, 5)) { // Show first 5
      const timestamp = Math.floor(boss.nextSpawn.getTime() / 1000);
      scheduleText += `• **${boss.bossName}** - <t:${timestamp}:t>\n`;
    }
    if (scheduleBased.length > 5) {
      scheduleText += `\n...and ${scheduleBased.length - 5} more`;
    }
    embed.addFields({
      name: `Schedule-Based (${scheduleBased.length} total)`,
      value: scheduleText,
      inline: false
    });

    embed.setFooter({ text: 'Use !nextspawn to see upcoming spawns' });
    embed.setTimestamp();

    await message.reply({ embeds: [embed] });
  } catch (error) {
    console.error('Error in !timers command:', error);
    return message.reply(`❌ Error: ${error.message}`);
  }
}

/**
 * Handle !unkill command
 */
async function handleUnkill(message, args, config) {
  // Check if in correct channel
  if (message.channel.id !== config.bossTimerChannelId) {
    const channel = await message.client.channels.fetch(config.bossTimerChannelId);
    return message.reply(`⚠️ Please use ${channel} for boss timer commands`);
  }

  if (args.length < 1) {
    return message.reply('❌ Usage: `!unkill <boss>`\nExample: `!unkill venatus`');
  }

  const bossInput = args.join(' ');
  const bossName = bossTimer.findBossName(bossInput);

  if (!bossName) {
    return message.reply(`❌ Boss not found: **${bossInput}**`);
  }

  try {
    const cancelled = await bossTimer.cancelTimer(bossName);

    if (cancelled) {
      await message.reply(`↩️ Cancelled timer for **${bossName}**`);
    } else {
      await message.reply(`⚠️ No active timer found for **${bossName}**`);
    }
  } catch (error) {
    console.error('Error in !unkill command:', error);
    return message.reply(`❌ Error: ${error.message}`);
  }
}

/**
 * Handle !maintenance command (admin)
 */
async function handleMaintenance(message) {
  try {
    const count = await bossTimer.maintenance();

    // Find first spawn
    const upcoming = bossTimer.getUpcomingSpawns(48);
    const firstSpawn = upcoming[0];

    const embed = new EmbedBuilder()
      .setColor(0x9b59b6)
      .setTitle('🔧 Maintenance Mode Activated')
      .setDescription(`✅ Reset **${count}** timer-based bosses`)
      .setTimestamp();

    if (firstSpawn) {
      const timestamp = Math.floor(firstSpawn.nextSpawn.getTime() / 1000);
      embed.addFields({
        name: '⏰ First Spawn',
        value: `**${firstSpawn.bossName}** at <t:${timestamp}:F> - <t:${timestamp}:R}`,
        inline: false
      });
    }

    await message.reply({ embeds: [embed] });
  } catch (error) {
    console.error('Error in !maintenance command:', error);
    return message.reply(`❌ Error: ${error.message}`);
  }
}

/**
 * Handle !clearkills command (admin)
 */
async function handleClearKills(message) {
  try {
    const count = await bossTimer.clearKills();

    const embed = new EmbedBuilder()
      .setColor(0xe74c3c)
      .setTitle('🗑️ Cleared All Timer-Based Kills')
      .setDescription(`✅ **${count}** timers cancelled`)
      .addFields({
        name: 'ℹ️ Note',
        value: 'Schedule-based bosses are unaffected.\nUse `!killed` to record new kills.',
        inline: false
      })
      .setTimestamp();

    await message.reply({ embeds: [embed] });
  } catch (error) {
    console.error('Error in !clearkills command:', error);
    return message.reply(`❌ Error: ${error.message}`);
  }
}

/**
 * Handle !nospawn command - boss didn't spawn as predicted
 * Usage: !nospawn <boss>
 */
async function handleNoSpawn(message, args, config) {
  // Check if in correct channel
  if (message.channel.id !== config.bossTimerChannelId) {
    const channel = await message.client.channels.fetch(config.bossTimerChannelId);
    return message.reply(`⚠️ Please use ${channel} for boss timer commands`);
  }

  if (args.length < 1) {
    return message.reply('❌ Usage: `!nospawn <boss>`\nExample: `!nospawn venatus`');
  }

  // Parse boss name (might be multi-word)
  const bossInput = args.join(' ');
  const bossName = bossTimer.findBossName(bossInput);

  if (!bossName) {
    return message.reply(`❌ Boss "${bossInput}" not found. Use \`!timers\` to see available bosses.`);
  }

  try {
    const result = await bossTimer.handleNoSpawn(bossName, message.author.id);

    if (!result.success) {
      return message.reply(`❌ Error: ${result.error}`);
    }

    const embed = new EmbedBuilder()
      .setColor(0xe74c3c)
      .setTitle('❌ False Alarm Reported')
      .setDescription(`**${bossName}** did not spawn as predicted`)
      .addFields({
        name: '✅ Actions Taken',
        value:
          (result.timerCancelled ? '• Timer cancelled\n' : '') +
          (result.threadFound ? '• Attendance thread locked and archived\n' : '') +
          '• Announcement posted',
        inline: false
      })
      .addFields({
        name: 'ℹ️ Next Steps',
        value: 'When boss actually spawns, use `!spawned <boss>` to record the correct time.',
        inline: false
      })
      .setTimestamp();

    await message.reply({ embeds: [embed] });
  } catch (error) {
    console.error('Error in !nospawn command:', error);
    return message.reply(`❌ Error: ${error.message}`);
  }
}

/**
 * Handle !spawned command - confirm boss spawned and create attendance thread
 * Usage: !spawned <boss>
 */
async function handleSpawned(message, args, config) {
  // Check if in correct channel
  if (message.channel.id !== config.bossTimerChannelId) {
    const channel = await message.client.channels.fetch(config.bossTimerChannelId);
    return message.reply(`⚠️ Please use ${channel} for boss timer commands`);
  }

  if (args.length < 1) {
    return message.reply('❌ Usage: `!spawned <boss>`\nExample: `!spawned venatus`');
  }

  // Parse boss name (might be multi-word)
  const bossInput = args.join(' ');
  const bossName = bossTimer.findBossName(bossInput);

  if (!bossName) {
    return message.reply(`❌ Boss "${bossInput}" not found. Use \`!timers\` to see available bosses.`);
  }

  try {
    const result = await bossTimer.handleSpawned(bossName, message.author.id);

    if (!result.success) {
      return message.reply(`❌ Error: ${result.error}`);
    }

    const embed = new EmbedBuilder()
      .setColor(result.alreadyHandled ? 0xf39c12 : 0x2ecc71)
      .setTitle(result.alreadyHandled ? 'ℹ️ Already Handled' : '✅ Boss Spawn Confirmed')
      .setDescription(result.alreadyHandled
        ? `**${bossName}** spawn already recorded!`
        : `**${bossName}** has spawned!`)
      .addFields({
        name: '📝 Attendance Thread',
        value: result.alreadyHandled
          ? `Existing thread: <#${result.threadId}>`
          : `Thread created: <#${result.threadId}>`,
        inline: false
      })
      .addFields({
        name: '💡 Next Step',
        value: `When boss is killed, use \`!killed ${bossName} <time>\` to track next spawn.`,
        inline: false
      })
      .setTimestamp();

    await message.reply({ embeds: [embed] });
  } catch (error) {
    console.error('Error in !spawned command:', error);
    return message.reply(`❌ Error: ${error.message}`);
  }
}

module.exports = {
  handleKilled,
  handleNextSpawn,
  handleTimers,
  handleUnkill,
  handleMaintenance,
  handleClearKills,
  handleNoSpawn,
  handleSpawned,
};
