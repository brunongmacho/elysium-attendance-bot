/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                    NLP LEARNING SYSTEM - ADMIN COMMANDS                   ║
 * ║                  Dashboard & Management Interface                         ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * @fileoverview Admin commands for monitoring and managing NLP learning system
 * Provides statistics, pattern management, and troubleshooting tools.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ADMIN COMMANDS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * !nlpstats         - View learning statistics and progress
 * !learned          - List all learned patterns with confidence scores
 * !unrecognized     - Show phrases bot doesn't understand yet
 * !teachbot "phrase" → !command - Manually teach a new pattern
 * !clearlearned [phrase] - Remove specific or all learned patterns
 * !nlpunhide        - Unhide NLP tabs in Google Sheets for viewing
 * !myprofile        - View your personal learning profile (member accessible)
 */

const { EmbedBuilder } = require('discord.js');

// ═══════════════════════════════════════════════════════════════════════════
// COMMAND: !nlpstats
// Show overall NLP learning statistics
// ═══════════════════════════════════════════════════════════════════════════

async function showNLPStats(message, learningSystem) {
  try {
    const stats = learningSystem.getStatistics();

    const embed = new EmbedBuilder()
      .setTitle('🧠 NLP Learning System - Statistics')
      .setColor(0x5865f2)
      .setDescription('Self-improving natural language processing with multilingual support')
      .addFields(
        {
          name: '📊 Learning Progress',
          value: [
            `**Patterns Learned:** ${stats.learnedPatternsCount}`,
            `**Recognition Rate:** ${(stats.recognitionRate * 100).toFixed(1)}%`,
            `**Users Tracked:** ${stats.usersTracked}`,
            `**Unrecognized Phrases:** ${stats.unrecognizedCount}`,
          ].join('\n'),
          inline: true,
        },
        {
          name: '📈 Activity Stats',
          value: [
            `**Messages Analyzed:** ${stats.messagesAnalyzed.toLocaleString()}`,
            `**Successful:** ${stats.successfulInterpretations}`,
            `**Failed:** ${stats.failedInterpretations}`,
            `**Last Sync:** ${stats.lastSync ? stats.lastSync.toLocaleString('en-US', { timeZone: 'Asia/Manila' }) : 'Never'}`,
          ].join('\n'),
          inline: true,
        },
        {
          name: '🌐 Language Distribution',
          value: [
            `**English:** ${stats.languageDistribution.en || 0}`,
            `**Tagalog:** ${stats.languageDistribution.tl || 0}`,
            `**Taglish:** ${stats.languageDistribution.taglish || 0}`,
          ].join('\n'),
          inline: false,
        },
        {
          name: '💡 How It Works',
          value: [
            '• **Passive Learning:** Bot learns from all messages without responding',
            '• **Smart Activation:** Responds in admin-logs, auction threads, or when @mentioned',
            '• **Fuzzy Matching:** Handles typos/shortcuts (max 2 chars, 75% similarity)',
            '• **Self-Improving:** Patterns improve with usage (confidence 0.7 → 0.95+)',
            '• **Persistent:** Syncs to Google Sheets every 5 minutes',
          ].join('\n'),
          inline: false,
        }
      )
      .setFooter({ text: 'Use !learned to see patterns | !unrecognized to see missed phrases' })
      .setTimestamp();

    await message.reply({ embeds: [embed] });
  } catch (error) {
    console.error('Error showing NLP stats:', error);
    await message.reply('❌ Error retrieving NLP statistics.');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// COMMAND: !learned
// Show all learned patterns with confidence scores
// ═══════════════════════════════════════════════════════════════════════════

async function showLearned(message, learningSystem) {
  try {
    const patterns = learningSystem.getLearnedPatterns();

    if (patterns.length === 0) {
      await message.reply('📝 No learned patterns yet. The bot will learn as users interact with it.');
      return;
    }

    // Group patterns by confidence level
    const high = patterns.filter(p => p.confidence >= 0.9);
    const medium = patterns.filter(p => p.confidence >= 0.75 && p.confidence < 0.9);
    const low = patterns.filter(p => p.confidence < 0.75);

    const embed = new EmbedBuilder()
      .setTitle('📚 Learned Patterns')
      .setColor(0x57f287)
      .setDescription(`Total: ${patterns.length} patterns | Sorted by confidence`)
      .setFooter({ text: 'Confidence increases with successful usage' })
      .setTimestamp();

    // High confidence patterns (> 90%)
    if (high.length > 0) {
      const highList = high.slice(0, 10).map(p =>
        `**"${p.phrase}"** → \`${p.command}\` (${(p.confidence * 100).toFixed(0)}% | ${p.usageCount} uses)`
      ).join('\n');
      embed.addFields({
        name: `✅ High Confidence (${high.length})`,
        value: highList + (high.length > 10 ? `\n_...and ${high.length - 10} more_` : ''),
        inline: false,
      });
    }

    // Medium confidence patterns (75-90%)
    if (medium.length > 0) {
      const mediumList = medium.slice(0, 5).map(p =>
        `**"${p.phrase}"** → \`${p.command}\` (${(p.confidence * 100).toFixed(0)}% | ${p.usageCount} uses)`
      ).join('\n');
      embed.addFields({
        name: `⚠️ Medium Confidence (${medium.length})`,
        value: mediumList + (medium.length > 5 ? `\n_...and ${medium.length - 5} more_` : ''),
        inline: false,
      });
    }

    // Low confidence patterns (< 75%)
    if (low.length > 0) {
      const lowList = low.slice(0, 3).map(p =>
        `**"${p.phrase}"** → \`${p.command}\` (${(p.confidence * 100).toFixed(0)}% | ${p.usageCount} uses)`
      ).join('\n');
      embed.addFields({
        name: `❓ Low Confidence (${low.length})`,
        value: lowList + (low.length > 3 ? `\n_...and ${low.length - 3} more_` : ''),
        inline: false,
      });
    }

    await message.reply({ embeds: [embed] });
  } catch (error) {
    console.error('Error showing learned patterns:', error);
    await message.reply('❌ Error retrieving learned patterns.');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// COMMAND: !unrecognized
// Show phrases bot doesn't understand yet
// ═══════════════════════════════════════════════════════════════════════════

async function showUnrecognized(message, learningSystem) {
  try {
    const phrases = learningSystem.getUnrecognizedPhrases();

    if (phrases.length === 0) {
      await message.reply('✅ No unrecognized phrases! Bot is understanding everything perfectly.');
      return;
    }

    const top20 = phrases.slice(0, 20);

    const embed = new EmbedBuilder()
      .setTitle('❓ Unrecognized Phrases')
      .setColor(0xfee75c)
      .setDescription(`Top ${top20.length} phrases the bot doesn't understand yet`)
      .addFields(
        top20.map((phrase, index) => ({
          name: `${index + 1}. "${phrase.phrase}"`,
          value: `**Count:** ${phrase.count} | **Users:** ${phrase.userCount} | **Last seen:** ${new Date(phrase.lastSeen).toLocaleString('en-US', { timeZone: 'Asia/Manila' })}`,
          inline: false,
        }))
      )
      .setFooter({ text: 'Use !teachbot "phrase" → !command to teach these patterns' })
      .setTimestamp();

    await message.reply({ embeds: [embed] });
  } catch (error) {
    console.error('Error showing unrecognized phrases:', error);
    await message.reply('❌ Error retrieving unrecognized phrases.');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// COMMAND: !teachbot "phrase" → !command
// Manually teach bot a new pattern
// ═══════════════════════════════════════════════════════════════════════════

async function teachBot(message, args, learningSystem) {
  try {
    // Parse: !teachbot "phrase" → !command
    const fullText = args.join(' ');
    const match = fullText.match(/^"(.+?)"\s*→\s*(!?\w+)/);

    if (!match) {
      await message.reply({
        content: '❌ **Invalid syntax!**\n\n**Usage:** `!teachbot "phrase" → !command`\n\n**Examples:**\n• `!teachbot "bawi ko 500" → !bid`\n• `!teachbot "ilan na ko" → !mypoints`',
      });
      return;
    }

    const [, phrase, command] = match;
    const normalizedCommand = command.startsWith('!') ? command : `!${command}`;

    // Teach the pattern
    learningSystem.teachPattern(phrase, normalizedCommand, message.author.id);

    const embed = new EmbedBuilder()
      .setTitle('✅ Pattern Taught Successfully')
      .setColor(0x57f287)
      .setDescription(`Bot will now recognize this phrase`)
      .addFields(
        {
          name: '📝 Phrase',
          value: `"${phrase}"`,
          inline: true,
        },
        {
          name: '➡️ Command',
          value: `\`${normalizedCommand}\``,
          inline: true,
        },
        {
          name: '💡 How to Use',
          value: `Users can now say: **${phrase}** and the bot will interpret it as \`${normalizedCommand}\``,
          inline: false,
        }
      )
      .setFooter({ text: `Taught by ${message.author.username}` })
      .setTimestamp();

    await message.reply({ embeds: [embed] });
  } catch (error) {
    console.error('Error teaching pattern:', error);
    await message.reply('❌ Error teaching pattern.');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// COMMAND: !clearlearned [phrase]
// Remove specific or all learned patterns
// ═══════════════════════════════════════════════════════════════════════════

async function clearLearned(message, args, learningSystem) {
  try {
    if (args.length === 0) {
      // Confirm before clearing all
      await message.reply({
        content: '⚠️ **Are you sure you want to clear ALL learned patterns?**\n\nThis will reset the bot to only use static patterns. Type `!clearlearned confirm` to proceed.',
      });
      return;
    }

    if (args[0] === 'confirm') {
      const count = learningSystem.clearLearned();
      await message.reply(`✅ Cleared ${count} learned patterns. Bot reset to static patterns only.`);
      return;
    }

    // Clear specific phrase
    const phrase = args.join(' ');
    const deleted = learningSystem.clearLearned(phrase);

    if (deleted) {
      await message.reply(`✅ Removed learned pattern: **"${phrase}"**`);
    } else {
      await message.reply(`❌ Pattern **"${phrase}"** not found in learned patterns.`);
    }
  } catch (error) {
    console.error('Error clearing learned patterns:', error);
    await message.reply('❌ Error clearing patterns.');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// COMMAND: !nlpunhide
// Unhide NLP tabs in Google Sheets so they can be viewed
// ═══════════════════════════════════════════════════════════════════════════

async function unhideNLPTabs(message, sheetAPI) {
  try {
    const result = await sheetAPI.call('unhideNLPTabs', {});

    if (result.success) {
      const embed = new EmbedBuilder()
        .setTitle('✅ NLP Tabs Unhidden')
        .setColor(0x57f287)
        .setDescription('The NLP learning tabs are now visible in your Google Sheet!')
        .addFields(
          {
            name: '📊 Unhidden Tabs',
            value: result.unhidden && result.unhidden.length > 0
              ? result.unhidden.map(tab => `• **${tab}**`).join('\n')
              : '_All tabs were already visible_',
            inline: false,
          },
          {
            name: '📝 Where to Find Them',
            value: [
              'Open your [Google Sheet](<https://docs.google.com/spreadsheets/>) and look for these tabs:',
              '• **NLP_LearnedPatterns** - Patterns the bot has learned',
              '• **NLP_UserPreferences** - User language preferences',
              '• **NLP_UnrecognizedPhrases** - Phrases to teach',
              '• **NLP_Analytics** - Learning statistics',
            ].join('\n'),
            inline: false,
          },
          {
            name: '💡 Tip',
            value: 'These tabs are normally hidden to keep your sheet organized. You can hide them again manually if needed.',
            inline: false,
          }
        )
        .setTimestamp();

      await message.reply({ embeds: [embed] });
    } else {
      await message.reply(`❌ Failed to unhide tabs: ${result.message || 'Unknown error'}`);
    }
  } catch (error) {
    console.error('Error unhiding NLP tabs:', error);
    await message.reply('❌ Error unhiding NLP tabs. Please try again or check Google Sheets manually.');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// COMMAND: !myprofile
// Show user's personal learning profile (member accessible)
// ═══════════════════════════════════════════════════════════════════════════

async function showMyProfile(message, learningSystem) {
  try {
    const profile = learningSystem.getUserProfile(message.author.id);

    if (!profile) {
      await message.reply({
        content: '📝 No learning profile yet. Start interacting with the bot using natural language, and it will build your profile!',
      });
      return;
    }

    const langScores = profile.languageScores || { en: 0, tl: 0, taglish: 0 };
    const totalLang = langScores.en + langScores.tl + langScores.taglish;

    const embed = new EmbedBuilder()
      .setTitle(`🧠 Learning Profile: ${message.author.username}`)
      .setColor(0x5865f2)
      .setThumbnail(message.author.displayAvatarURL())
      .addFields(
        {
          name: '📊 Activity',
          value: [
            `**Messages Analyzed:** ${profile.messageCount}`,
            `**Preferred Language:** ${profile.language.toUpperCase()}`,
            `**Learning Enabled:** ${profile.learningEnabled ? 'Yes ✅' : 'No ❌'}`,
          ].join('\n'),
          inline: true,
        },
        {
          name: '🌐 Language Usage',
          value: [
            `**English:** ${langScores.en} (${totalLang > 0 ? ((langScores.en / totalLang) * 100).toFixed(0) : 0}%)`,
            `**Tagalog:** ${langScores.tl} (${totalLang > 0 ? ((langScores.tl / totalLang) * 100).toFixed(0) : 0}%)`,
            `**Taglish:** ${langScores.taglish} (${totalLang > 0 ? ((langScores.taglish / totalLang) * 100).toFixed(0) : 0}%)`,
          ].join('\n'),
          inline: true,
        },
        {
          name: '💡 What This Means',
          value: 'The bot tracks your language preferences to better understand how you communicate. It adapts to your style over time!',
          inline: false,
        }
      )
      .setFooter({ text: `Last updated: ${new Date(profile.lastUpdated).toLocaleString('en-US', { timeZone: 'Asia/Manila' })}` })
      .setTimestamp();

    await message.reply({ embeds: [embed] });
  } catch (error) {
    console.error('Error showing user profile:', error);
    await message.reply('❌ Error retrieving your profile.');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
  showNLPStats,
  showLearned,
  showUnrecognized,
  teachBot,
  clearLearned,
  unhideNLPTabs,
  showMyProfile,
};
