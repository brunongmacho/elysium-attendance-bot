/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                 ELYSIUM NLP ADMIN DASHBOARD                               ║
 * ║           Commands to Monitor and Manage NLP Learning                     ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */

const { EmbedBuilder } = require('discord.js');

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN COMMANDS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Show NLP learning statistics
 * @param {Message} message - Discord message
 * @param {NLPLearningSystem} learningSystem - Learning system instance
 */
async function showNLPStats(message, learningSystem) {
  const stats = learningSystem.getStatistics();

  const embed = new EmbedBuilder()
    .setColor('#00ff00')
    .setTitle('🧠 NLP Learning System Statistics')
    .setDescription('Overview of bot learning progress')
    .addFields(
      {
        name: '📚 Learned Patterns',
        value: `Total: **${stats.totalLearnedPatterns}** patterns\nUsers tracked: **${stats.totalUsers}**`,
        inline: true,
      },
      {
        name: '❓ Unrecognized Phrases',
        value: `Total: **${stats.totalUnrecognizedPhrases}**\nRecent messages: **${stats.recentMessagesCount}**`,
        inline: true,
      },
      {
        name: '🌍 Language Distribution',
        value: Object.entries(stats.languageDistribution)
          .map(([lang, count]) => `${lang.toUpperCase()}: ${count} users`)
          .join('\n') || 'No data yet',
        inline: false,
      }
    )
    .setFooter({ text: `Last sync: ${new Date(stats.lastSync).toLocaleString() || 'Never'}` })
    .setTimestamp();

  await message.reply({ embeds: [embed] });
}

/**
 * Show top unrecognized phrases (for learning opportunities)
 * @param {Message} message - Discord message
 * @param {NLPLearningSystem} learningSystem - Learning system instance
 */
async function showUnrecognizedPhrases(message, learningSystem) {
  const stats = learningSystem.getStatistics();

  if (stats.topUnrecognized.length === 0) {
    return message.reply('✅ No unrecognized phrases! Bot understands everything so far.');
  }

  const embed = new EmbedBuilder()
    .setColor('#ffaa00')
    .setTitle('❓ Top Unrecognized Phrases')
    .setDescription('These phrases were not recognized by the bot. Consider teaching the bot or adding to static patterns.')
    .setTimestamp();

  stats.topUnrecognized.forEach((item, index) => {
    embed.addFields({
      name: `${index + 1}. "${item.phrase}"`,
      value: `Used **${item.count}** times by **${item.userCount}** user(s)`,
      inline: false,
    });
  });

  embed.setFooter({ text: 'Use !teachbot to manually teach new patterns' });

  await message.reply({ embeds: [embed] });
}

/**
 * Show top learned patterns
 * @param {Message} message - Discord message
 * @param {NLPLearningSystem} learningSystem - Learning system instance
 */
async function showLearnedPatterns(message, learningSystem) {
  const stats = learningSystem.getStatistics();

  if (stats.topLearnedPatterns.length === 0) {
    return message.reply('📚 No learned patterns yet. Bot is still learning from user interactions.');
  }

  const embed = new EmbedBuilder()
    .setColor('#0099ff')
    .setTitle('📚 Top Learned Patterns')
    .setDescription('Most frequently used patterns learned from user confirmations')
    .setTimestamp();

  stats.topLearnedPatterns.forEach((item, index) => {
    const confidenceEmoji = item.confidence >= 0.9 ? '🟢' : item.confidence >= 0.7 ? '🟡' : '🔴';
    embed.addFields({
      name: `${index + 1}. "${item.phrase}" → ${item.command}`,
      value: `${confidenceEmoji} Confidence: **${(item.confidence * 100).toFixed(1)}%** | Used: **${item.usageCount}** times`,
      inline: false,
    });
  });

  embed.setFooter({ text: '🟢 High confidence | 🟡 Medium | 🔴 Low confidence' });

  await message.reply({ embeds: [embed] });
}

/**
 * Manually teach bot a new pattern
 * Usage: !teachbot "phrase" → !command
 * @param {Message} message - Discord message
 * @param {Array} args - Command arguments
 * @param {NLPLearningSystem} learningSystem - Learning system instance
 */
async function teachBot(message, args, learningSystem) {
  if (args.length < 3) {
    return message.reply(
      '❌ **Usage:** `!teachbot "phrase" → !command`\n' +
      '**Example:** `!teachbot "pusta 500" → !bid`'
    );
  }

  // Parse: "phrase" → !command
  const fullText = args.join(' ');
  const match = fullText.match(/["'](.+?)["']\s*→\s*(![\w]+)/);

  if (!match) {
    return message.reply(
      '❌ **Invalid format!**\n' +
      'Use: `!teachbot "phrase" → !command`\n' +
      'Example: `!teachbot "pusta 500" → !bid`'
    );
  }

  const [, phrase, command] = match;

  // Validate command
  const validCommands = [
    '!bid', '!mypoints', '!present', '!leaderboard', '!bidstatus',
    '!help', '!startauction', '!pause', '!resume', '!stop',
    '!skip', '!skipitem', '!cancel', '!cancelitem', '!extend',
  ];

  if (!validCommands.includes(command)) {
    return message.reply(
      `❌ **Invalid command:** ${command}\n` +
      `Valid commands: ${validCommands.join(', ')}`
    );
  }

  // Create confirmation ID
  const confirmationId = `teach_${Date.now()}`;

  // Store in pending confirmations
  learningSystem.pendingConfirmations.set(confirmationId, {
    userId: message.author.id,
    phrase: phrase.toLowerCase(),
    suggestedCommand: command,
    timestamp: Date.now(),
  });

  // Ask for confirmation
  const confirmMsg = await message.reply(
    `🤔 **Confirm Teaching:**\n` +
    `Phrase: "${phrase}"\n` +
    `Command: \`${command}\`\n\n` +
    `React with ✅ to confirm or ❌ to cancel.`
  );

  await confirmMsg.react('✅');
  await confirmMsg.react('❌');

  // Wait for reaction
  const filter = (reaction, user) =>
    ['✅', '❌'].includes(reaction.emoji.name) && user.id === message.author.id;

  try {
    const collected = await confirmMsg.awaitReactions({ filter, max: 1, time: 30000, errors: ['time'] });
    const reaction = collected.first();

    if (reaction.emoji.name === '✅') {
      // Confirm and teach
      await learningSystem.confirmPattern(confirmationId, command);
      await confirmMsg.edit(
        `✅ **Successfully taught!**\n` +
        `The bot will now recognize "${phrase}" as \`${command}\``
      );
    } else {
      // Cancelled
      learningSystem.pendingConfirmations.delete(confirmationId);
      await confirmMsg.edit('❌ Teaching cancelled.');
    }
  } catch (error) {
    // Timeout
    learningSystem.pendingConfirmations.delete(confirmationId);
    await confirmMsg.edit('⏱️ Teaching timed out (30s). Please try again.');
  }
}

/**
 * Clear all learned patterns (admin only, requires confirmation)
 * @param {Message} message - Discord message
 * @param {NLPLearningSystem} learningSystem - Learning system instance
 */
async function clearLearnedPatterns(message, learningSystem) {
  const confirmMsg = await message.reply(
    '⚠️  **WARNING:** This will delete ALL learned patterns!\n' +
    `Currently: **${learningSystem.learnedPatterns.size}** patterns\n\n` +
    'React with ✅ to confirm or ❌ to cancel.'
  );

  await confirmMsg.react('✅');
  await confirmMsg.react('❌');

  const filter = (reaction, user) =>
    ['✅', '❌'].includes(reaction.emoji.name) && user.id === message.author.id;

  try {
    const collected = await confirmMsg.awaitReactions({ filter, max: 1, time: 30000, errors: ['time'] });
    const reaction = collected.first();

    if (reaction.emoji.name === '✅') {
      const count = learningSystem.learnedPatterns.size;
      learningSystem.learnedPatterns.clear();
      await learningSystem.syncToGoogleSheets();
      await confirmMsg.edit(`✅ Cleared **${count}** learned patterns.`);
    } else {
      await confirmMsg.edit('❌ Operation cancelled.');
    }
  } catch (error) {
    await confirmMsg.edit('⏱️ Operation timed out (30s).');
  }
}

/**
 * Show user's language preference and statistics
 * @param {Message} message - Discord message
 * @param {NLPLearningSystem} learningSystem - Learning system instance
 */
async function showUserProfile(message, learningSystem) {
  const userId = message.author.id;
  const prefs = learningSystem.userPreferences.get(userId);

  if (!prefs) {
    return message.reply('📊 No profile data yet. Send more messages for the bot to learn your preferences!');
  }

  const embed = new EmbedBuilder()
    .setColor('#9b59b6')
    .setTitle('👤 Your NLP Profile')
    .setDescription(`Language preferences and statistics for ${message.author.username}`)
    .addFields(
      {
        name: '🌍 Preferred Language',
        value: `**${prefs.language.toUpperCase()}** (${prefs.language === 'en' ? 'English' : prefs.language === 'tl' ? 'Tagalog' : 'Taglish'})`,
        inline: true,
      },
      {
        name: '📝 Messages Analyzed',
        value: `**${prefs.messageCount}** messages`,
        inline: true,
      },
      {
        name: '📊 Language Usage',
        value: Object.entries(prefs.languageScores)
          .map(([lang, count]) => `${lang.toUpperCase()}: ${count}`)
          .join('\n'),
        inline: false,
      }
    )
    .setTimestamp();

  if (Object.keys(prefs.shortcuts || {}).length > 0) {
    embed.addFields({
      name: '⚡ Personal Shortcuts',
      value: Object.entries(prefs.shortcuts)
        .map(([shortcut, command]) => `"${shortcut}" → ${command}`)
        .join('\n'),
      inline: false,
    });
  }

  await message.reply({ embeds: [embed] });
}

// ═══════════════════════════════════════════════════════════════════════════
// COMMAND ROUTER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Route NLP admin commands
 * @param {Message} message - Discord message
 * @param {string} command - Command name
 * @param {Array} args - Command arguments
 * @param {NLPLearningSystem} learningSystem - Learning system instance
 */
async function routeNLPAdminCommand(message, command, args, learningSystem) {
  switch (command) {
    case '!nlpstats':
      await showNLPStats(message, learningSystem);
      break;

    case '!unrecognized':
      await showUnrecognizedPhrases(message, learningSystem);
      break;

    case '!learned':
      await showLearnedPatterns(message, learningSystem);
      break;

    case '!teachbot':
      await teachBot(message, args, learningSystem);
      break;

    case '!clearlearned':
      await clearLearnedPatterns(message, learningSystem);
      break;

    case '!myprofile':
    case '!nlpprofile':
      await showUserProfile(message, learningSystem);
      break;

    default:
      return false; // Command not handled
  }

  return true; // Command handled
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
  routeNLPAdminCommand,
  showNLPStats,
  showUnrecognizedPhrases,
  showLearnedPatterns,
  teachBot,
  clearLearnedPatterns,
  showUserProfile,
};
