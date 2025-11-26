/**
 * ============================================================================
 * BOSS TIMER COMMANDS
 * ============================================================================
 *
 * Command handlers for boss timer system.
 * Commands: !killed, !setboss, !nextspawn, !unkill, !nospawn, !spawned,
 *           !maintenance, !clearkills
 *
 * @module boss-timer-commands
 * ============================================================================
 */

const { EmbedBuilder } = require('discord.js');
const bossTimer = require('./boss-timer');

/**
 * Parse command args to extract boss name, time, and date
 * Handles cases where AM/PM is a separate argument (e.g., "09:35 PM")
 * @param {string[]} args - Command arguments
 * @returns {{bossName: string, timeArg: string|null, dateArg: string|null}}
 */
function parseCommandArgs(args) {
  let bossNameParts = [];
  let timeArg = null;
  let dateArg = null;
  let i = 0;

  // Helper to check if string looks like a time
  const isTime = (str) => str && (str.includes(':') || /^\d{1,2}(am|pm)$/i.test(str));

  // Helper to check if string is AM/PM suffix
  const isAmPm = (str) => str && /^(a\.?m\.?|p\.?m\.?)$/i.test(str);

  // Helper to check if string looks like a date (mm/dd)
  const isDate = (str) => str && /^\d{1,2}\/\d{1,2}$/.test(str);

  // Collect boss name parts until we hit a time
  while (i < args.length) {
    if (isTime(args[i])) {
      timeArg = args[i];
      i++;
      // Check if next arg is AM/PM (separate from time)
      if (i < args.length && isAmPm(args[i])) {
        timeArg += args[i]; // Combine: "09:35" + "PM" = "09:35PM"
        i++;
      }
      // Check for optional date
      if (i < args.length && isDate(args[i])) {
        dateArg = args[i];
        i++;
      }
      break;
    } else if (isAmPm(args[i])) {
      // Standalone AM/PM without time - skip it
      i++;
    } else if (isDate(args[i])) {
      // Date without time
      dateArg = args[i];
      i++;
    } else {
      // Part of boss name
      bossNameParts.push(args[i]);
      i++;
    }
  }

  return {
    bossName: bossNameParts.join(' '),
    timeArg,
    dateArg
  };
}

/**
 * Handle !killed command
 * Usage: !killed <boss> [time] [mm/dd]
 */
async function handleKilled(message, args, config) {
  // Check if in correct channel
  if (message.channel.id !== config.boss_timer_channel_id) {
    const channel = await message.client.channels.fetch(config.boss_timer_channel_id);
    return message.reply(`⚠️ Please use ${channel} for boss timer commands`);
  }

  if (args.length < 1) {
    return message.reply('❌ Usage: `!killed <boss> [time] [mm/dd]`\nExample: `!killed venatus 9:15 01/19`');
  }

  // Parse args (handles "09:35 PM" split across arguments)
  const { bossName: bossInput, timeArg, dateArg } = parseCommandArgs(args);
  const bossName = bossTimer.findBossName(bossInput);

  if (!bossName) {
    return message.reply(`❌ Boss not found: **${bossInput}**\nCheck spelling or use \`!timers\` to see valid boss names.`);
  }

  try {
    // Parse kill time
    const killTime = bossTimer.parseKillTime(timeArg, dateArg);
    const killTimestamp = Math.floor(killTime.getTime() / 1000);

    // Check if scheduled boss - they have fixed spawn times
    const bossType = bossTimer.getBossType(bossName);
    if (bossType === 'schedule') {
      // For scheduled bosses, just log the kill and show next scheduled spawn
      const nextSpawn = bossTimer.getNextScheduledSpawn(bossName);
      const timestamp = Math.floor(nextSpawn.getTime() / 1000);

      const embed = new EmbedBuilder()
        .setColor(0x9b59b6)
        .setTitle('📅 Scheduled Boss Kill Logged')
        .setDescription(`**${bossName}** killed at <t:${killTimestamp}:t>`)
        .addFields({
          name: '📌 Next Scheduled Spawn',
          value: `<t:${timestamp}:F> - ${bossTimer.formatCountdown(timestamp)}`,
          inline: false
        })
        .addFields({
          name: 'ℹ️ Note',
          value: 'This is a scheduled boss - spawn time is fixed regardless of kill time.',
          inline: false
        })
        .setFooter({ text: `Logged by ${message.author.username}` })
        .setTimestamp();

      await message.reply({ embeds: [embed] });
      return;
    }

    // Timer-based boss - record kill and calculate spawn time
    const result = await bossTimer.recordKill(bossName, killTime, message.author.username);

    // Send confirmation
    const timestamp = Math.floor(result.nextSpawn.getTime() / 1000);

    const embed = new EmbedBuilder()
      .setColor(0x00ff00)
      .setTitle('✅ Boss Kill Recorded')
      .setDescription(`**${result.bossName}** killed at <t:${killTimestamp}:t>`)
      .addFields({
        name: '⏰ Next Spawn',
        value: `<t:${timestamp}:F> - ${bossTimer.formatCountdown(timestamp)}`,
        inline: false
      });

    // Add note if spawns were skipped (kill time was old)
    if (result.skippedSpawns > 0) {
      embed.addFields({
        name: 'ℹ️ Note',
        value: `Skipped ${result.skippedSpawns} past spawn(s) to calculate next future spawn.`,
        inline: false
      });
    }

    embed
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
      description += `${timePrefix}<t:${timestamp}:t> - ${bossTimer.formatCountdown(timestamp)}\n`;
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
 * Handle !unkill command
 */
async function handleUnkill(message, args, config) {
  // Check if in correct channel
  if (message.channel.id !== config.boss_timer_channel_id) {
    const channel = await message.client.channels.fetch(config.boss_timer_channel_id);
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
    const wasServerDown = bossTimer.getServerDownStatus();
    const count = await bossTimer.maintenance();

    // Find first spawn
    const upcoming = bossTimer.getUpcomingSpawns(48);
    const firstSpawn = upcoming[0];

    const embed = new EmbedBuilder()
      .setColor(0x9b59b6)
      .setTitle('🔧 Maintenance Mode Activated')
      .setDescription(
        `✅ Reset **${count}** timer-based bosses\n` +
        (wasServerDown ? `✅ Exited server down mode - attendance threads will be created again` : '')
      )
      .setTimestamp();

    if (firstSpawn) {
      const timestamp = Math.floor(firstSpawn.nextSpawn.getTime() / 1000);
      embed.addFields({
        name: '⏰ First Spawn',
        value: `**${firstSpawn.bossName}** at <t:${timestamp}:F> - ${bossTimer.formatCountdown(timestamp)}`,
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
 * Handle !serverdown command (admin)
 * Pauses boss attendance operations without affecting other bot features
 */
async function handleServerDown(message) {
  try {
    const count = await bossTimer.serverDown();

    const embed = new EmbedBuilder()
      .setColor(0xe74c3c)
      .setTitle('🛑 Server Down Mode Activated')
      .setDescription(
        `**Boss attendance operations paused**\n\n` +
        `✅ Cleared **${count}** boss timers (all bosses now available)\n` +
        `⏸️ New attendance threads will NOT be created\n` +
        `✅ All other bot features remain active (bidding, auctions, stats)\n\n` +
        `💡 Use \`!maintenance\` to resume normal operations`
      )
      .addFields({
        name: 'ℹ️ What\'s Affected',
        value: '• Boss spawn reminders: **Disabled**\n' +
               '• Attendance threads: **Not created**\n' +
               '• Boss timers: **Cleared**',
        inline: true
      }, {
        name: 'ℹ️ What Still Works',
        value: '• Bidding system: **Active**\n' +
               '• Auction system: **Active**\n' +
               '• Stats & leaderboards: **Active**',
        inline: true
      })
      .setTimestamp();

    await message.reply({ embeds: [embed] });
  } catch (error) {
    console.error('Error in !serverdown command:', error);
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
  if (message.channel.id !== config.boss_timer_channel_id) {
    const channel = await message.client.channels.fetch(config.boss_timer_channel_id);
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
  if (message.channel.id !== config.boss_timer_channel_id) {
    const channel = await message.client.channels.fetch(config.boss_timer_channel_id);
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

/**
 * Handle !setboss command - set spawn time directly
 * Usage: !setboss <boss> <time> [mm/dd]
 */
async function handleSetBoss(message, args, config) {
  // Check if in correct channel
  if (message.channel.id !== config.boss_timer_channel_id) {
    const channel = await message.client.channels.fetch(config.boss_timer_channel_id);
    return message.reply(`⚠️ Please use ${channel} for boss timer commands`);
  }

  if (args.length < 2) {
    return message.reply('❌ Usage: `!setboss <boss> <time am/pm> [mm/dd]`\nExample: `!setboss venatus 7:15pm` or `!setboss venatus 7:15 PM 01/20`');
  }

  // Parse args (handles "09:35 PM" split across arguments)
  const { bossName: bossInput, timeArg, dateArg } = parseCommandArgs(args);

  if (!timeArg) {
    return message.reply('❌ Please provide a spawn time.\nUsage: `!setboss <boss> <time am/pm> [mm/dd]`');
  }

  // Require AM/PM for safety (12-hour format only)
  const hasAmPm = /am|pm/i.test(timeArg);
  if (!hasAmPm) {
    // Delete the wrong command message
    try {
      await message.delete();
    } catch (e) {
      // Ignore if can't delete (permissions)
    }
    // Send error mentioning the user
    const channel = message.channel;
    await channel.send(`<@${message.author.id}> ❌ Please include **AM** or **PM** in your time!\n\nExample: \`!setboss ${bossInput || 'venatus'} ${timeArg}am\` or \`!setboss ${bossInput || 'venatus'} ${timeArg} PM\``);
    return;
  }

  const bossName = bossTimer.findBossName(bossInput);

  if (!bossName) {
    return message.reply(`❌ Boss "${bossInput}" not found. Check spelling or use \`!timers\` to see available bosses.`);
  }

  // Check if scheduled boss - they have fixed spawn times
  const bossType = bossTimer.getBossType(bossName);
  if (bossType === 'schedule') {
    const nextSpawn = bossTimer.getNextScheduledSpawn(bossName);
    const timestamp = Math.floor(nextSpawn.getTime() / 1000);
    return message.reply(`⚠️ **${bossName}** is a scheduled boss with fixed spawn times.\nNext spawn: <t:${timestamp}:F> - ${bossTimer.formatCountdown(timestamp)}\n\nUse \`!setboss\` only for timer-based bosses.`);
  }

  try {
    // Parse the spawn time
    const spawnTime = bossTimer.parseKillTime(timeArg, dateArg);

    // Validate spawn time is in the future
    if (spawnTime <= new Date()) {
      return message.reply('❌ Spawn time must be in the future.');
    }

    const result = await bossTimer.setSpawnTime(bossName, spawnTime, message.author.id);

    const timestamp = Math.floor(result.nextSpawn.getTime() / 1000);
    const reminderTime = new Date(result.nextSpawn.getTime() - 5 * 60 * 1000);
    const reminderTimestamp = Math.floor(reminderTime.getTime() / 1000);

    const embed = new EmbedBuilder()
      .setColor(0x3498db)
      .setTitle('⏰ Boss Spawn Time Set')
      .setDescription(`**${bossName}** spawn time set directly`)
      .addFields({
        name: '🎯 Spawn Time',
        value: `<t:${timestamp}:F>\n${bossTimer.formatCountdown(timestamp)}`,
        inline: true
      })
      .addFields({
        name: '🔔 Reminder At',
        value: `<t:${reminderTimestamp}:t> (5 min before)`,
        inline: true
      })
      .setFooter({ text: `Set by ${message.author.username}` })
      .setTimestamp();

    await message.reply({ embeds: [embed] });
  } catch (error) {
    console.error('Error in !setboss command:', error);
    return message.reply(`❌ Error: ${error.message}`);
  }
}

/**
 * Handle !help command for boss timer channel
 */
async function handleHelp(message) {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('📋 Boss Timer Commands')
    .setDescription('Use these commands to track boss spawns and manage timers.\n\n**All times should be in GMT+8 (Philippine Time)**')
    .addFields(
      {
        name: '⚔️ `!killed <boss> <time>`',
        value: 'Record when a boss was killed to calculate next spawn.\n' +
               '**Examples:**\n' +
               '• `!killed venatus 5:27pm`\n' +
               '• `!killed baron 9:30 AM`\n' +
               '• `!killed ego 14:30 11/21` *(with date)*',
        inline: false
      },
      {
        name: '⏰ `!setboss <boss> <spawn time>`',
        value: 'Manually set the next spawn time for a boss.\n' +
               '**Requires AM/PM** (12-hour format)\n' +
               '**Examples:**\n' +
               '• `!setboss venatus 1:27am`\n' +
               '• `!setboss gareth 8:00 PM 11/22`',
        inline: false
      },
      {
        name: '📅 `!nextspawn`',
        value: 'View all bosses spawning in the next 24 hours.',
        inline: false
      },
      {
        name: '✅ `!spawned <boss>`',
        value: 'Confirm a boss has spawned and create attendance thread.\n' +
               '**Example:** `!spawned venatus`',
        inline: false
      },
      {
        name: '🚫 `!nospawn <boss>`',
        value: 'Report that a boss did not spawn (bugged).\n' +
               '**Example:** `!nospawn venatus`',
        inline: false
      },
      {
        name: '↩️ `!unkill <boss>`',
        value: 'Remove a boss from the timer list.\n' +
               '**Example:** `!unkill venatus`',
        inline: false
      },
      {
        name: '🔧 `!maintenance` *(Admin)*',
        value: 'Put all bosses in maintenance mode (creates threads without auto-close).',
        inline: false
      },
      {
        name: '🗑️ `!clearkills` *(Admin)*',
        value: 'Clear all recorded kills and timers.',
        inline: false
      }
    )
    .addFields({
      name: '💡 Tips',
      value: '• Times are interpreted as **GMT+8** (Philippine Time)\n' +
             '• Boss names are fuzzy-matched (e.g., "ven" → "Venatus")\n' +
             '• If you forgot to `!killed`, the system auto-forwards to next future spawn\n' +
             '• Scheduled bosses (Auraq, Milavy, Ringor) have fixed spawn times',
      inline: false
    })
    .setFooter({ text: 'Boss Timer System • Only boss timer commands work in this channel' })
    .setTimestamp();

  await message.reply({ embeds: [embed] });
}

module.exports = {
  handleKilled,
  handleNextSpawn,
  handleUnkill,
  handleMaintenance,
  handleServerDown,
  handleClearKills,
  handleNoSpawn,
  handleSpawned,
  handleSetBoss,
  handleHelp,
};
