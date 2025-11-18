/**
 * ============================================================================
 * ELYSIUM LEADERBOARD & WEEKLY REPORT SYSTEM
 * ============================================================================
 *
 * PURPOSE:
 * Provides ranking and analytics for guild members based on their attendance
 * and bidding activity. Generates automated weekly reports.
 *
 * FEATURES:
 * - Attendance Leaderboard: Ranks members by attendance points
 * - Bidding Points Leaderboard: Shows members' remaining bidding points
 * - Weekly Reports: Automated summary reports every Saturday
 * - Visual Progress Bars: Graphical representation of rankings
 * - Top Performers Highlighting: Gold/silver/bronze medals
 * - Statistics: Total spawns, average attendance, points consumed, etc.
 *
 * LEADERBOARDS:
 * 1. ATTENDANCE LEADERBOARD (!leaderboard attendance)
 *    - Shows top 10 members by attendance points
 *    - Displays visual progress bars
 *    - Shows total spawns and average attendance
 *
 * 2. BIDDING LEADERBOARD (!leaderboard bidding)
 *    - Shows top 10 members by points remaining
 *    - Displays points left and points consumed
 *    - Shows total points distributed and consumed
 *
 * WEEKLY REPORTS:
 * - Auto-generated every Saturday at 11:59pm GMT+8
 * - Sent to admin-logs channel
 * - Includes attendance summary, bidding summary, top members
 * - Timezone-aware scheduling (GMT+8 / Asia/Manila)
 *
 * DATA SOURCE:
 * All data fetched from Google Sheets via webhook
 *
 * @module leaderboard-system
 */

// ============================================================================
// DEPENDENCIES
// ============================================================================

const { EmbedBuilder } = require('discord.js');
const { SheetAPI } = require('./utils/sheet-api');
const { addGuildThumbnail } = require('./utils/embed-branding');

// ============================================================================
// MODULE STATE
// ============================================================================

/**
 * Module configuration and Discord client
 */
let config = null;  // Bot configuration from config.json
let client = null;  // Discord.js client instance
let sheetAPI = null;  // Unified Google Sheets API client
let discordCache = null;  // Discord channel cache
let crashRecovery = null;  // Crash recovery system

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initializes the leaderboard system with Discord client and config
 *
 * Must be called before any leaderboard commands or scheduling.
 *
 * @param {Client} discordClient - Discord.js client instance
 * @param {Object} botConfig - Bot configuration object from config.json
 * @param {Object} cache - Discord cache instance
 * @param {Object} crashRecoveryModule - Crash recovery module (optional)
 *
 * @example
 * init(client, config, cache, crashRecovery);
 */
function init(discordClient, botConfig, cache = null, crashRecoveryModule = null) {
  client = discordClient;
  config = botConfig;
  sheetAPI = new SheetAPI(botConfig.sheet_webhook_url);
  discordCache = cache;
  crashRecovery = crashRecoveryModule;
}

// ============================================================================
// DATA FETCHING
// ============================================================================

/**
 * Fetches attendance leaderboard data from Google Sheets
 *
 * SHEET INTEGRATION:
 * Calls Apps Script with action: "getAttendanceLeaderboard"
 * Apps Script calculates attendance points per member from attendance logs
 *
 * RESPONSE FORMAT:
 * {
 *   status: "ok",
 *   weekName: "Week 45 (Nov 3-9, 2025)",
 *   leaderboard: [
 *     { name: "Player1", points: 150 },
 *     { name: "Player2", points: 145 },
 *     ...
 *   ],
 *   totalSpawns: 25,
 *   averageAttendance: 18
 * }
 *
 * @returns {Promise<Object>} Leaderboard data object
 * @throws {Error} If fetch fails or response status is not 'ok'
 *
 * @example
 * const data = await fetchAttendanceLeaderboard();
 * // { status: "ok", weekName: "Week 45", leaderboard: [...], ... }
 */
async function fetchAttendanceLeaderboard() {
  const startTime = Date.now(); // Performance tracking
  try {
    const result = await sheetAPI.call('getAttendanceLeaderboard');
    const duration = Date.now() - startTime;
    console.log(`⚡ Fetched attendance leaderboard in ${duration}ms`);
    return result;
  } catch (error) {
    console.error('❌ Error fetching attendance leaderboard:', error);
    throw error;
  }
}

/**
 * Fetches bidding points leaderboard data from Google Sheets
 *
 * SHEET INTEGRATION:
 * Calls Apps Script with action: "getBiddingLeaderboard"
 * Apps Script reads MemberPoints tab to get current point balances
 *
 * RESPONSE FORMAT:
 * {
 *   status: "ok",
 *   leaderboard: [
 *     { name: "Player1", pointsLeft: 500, pointsConsumed: 100 },
 *     { name: "Player2", pointsLeft: 450, pointsConsumed: 150 },
 *     ...
 *   ],
 *   totalPointsDistributed: 10000,
 *   totalPointsConsumed: 2500
 * }
 *
 * @returns {Promise<Object>} Leaderboard data object
 * @throws {Error} If fetch fails or response status is not 'ok'
 *
 * @example
 * const data = await fetchBiddingLeaderboard();
 * // { status: "ok", leaderboard: [...], totalPointsDistributed: 10000, ... }
 */
async function fetchBiddingLeaderboard() {
  const startTime = Date.now(); // Performance tracking
  try {
    const result = await sheetAPI.call('getBiddingLeaderboard');
    const duration = Date.now() - startTime;
    console.log(`⚡ Fetched bidding leaderboard in ${duration}ms`);
    return result;
  } catch (error) {
    console.error('❌ Error fetching bidding leaderboard:', error);
    throw error;
  }
}

/**
 * Fetches weekly summary data from Google Sheets
 *
 * SHEET INTEGRATION:
 * Calls Apps Script with action: "getWeeklySummary"
 * Apps Script aggregates data from multiple tabs for comprehensive report
 *
 * RESPONSE FORMAT:
 * {
 *   status: "ok",
 *   weekName: "Week 45 (Nov 3-9, 2025)",
 *   attendance: {
 *     totalSpawns: 25,
 *     uniqueAttendees: 45,
 *     averagePerSpawn: 18,
 *     topAttendees: [{ name: "Player1", points: 150 }, ...]
 *   },
 *   bidding: {
 *     totalDistributed: 10000,
 *     totalConsumed: 2500,
 *     totalRemaining: 7500,
 *     topSpenders: [{ name: "Player1", consumed: 300 }, ...]
 *   },
 *   mostActive: [{ name: "Player1", score: 500 }, ...]
 * }
 *
 * @returns {Promise<Object>} Weekly summary data object
 * @throws {Error} If fetch fails or response status is not 'ok'
 *
 * @example
 * const data = await fetchWeeklySummary();
 * // { status: "ok", weekName: "Week 45", attendance: {...}, bidding: {...} }
 */
async function fetchWeeklySummary() {
  const startTime = Date.now(); // Performance tracking
  try {
    const result = await sheetAPI.call('getWeeklySummary');
    const duration = Date.now() - startTime;
    console.log(`⚡ Fetched weekly summary in ${duration}ms`);
    return result;
  } catch (error) {
    console.error('❌ Error fetching weekly summary:', error);
    throw error;
  }
}

// ============================================================================
// LEADERBOARD DISPLAY
// ============================================================================

/**
 * Displays the attendance leaderboard in Discord
 *
 * VISUAL FEATURES:
 * - Top 10 members ranked by attendance points
 * - Medal emojis for top 3 (🥇🥈🥉)
 * - Progress bars showing relative performance (20 character width)
 * - Percentage relative to top performer
 * - Week name and total member count
 * - Statistics (total spawns, average attendance)
 *
 * WORKFLOW:
 * 1. Fetch attendance data from sheets
 * 2. Check if data exists
 * 3. Build embed with top 10 members
 * 4. Generate visual progress bars
 * 5. Add statistics if available
 * 6. Send embed to channel
 *
 * @param {Message} message - Discord message that triggered the command
 * @returns {Promise<void>}
 *
 * @example
 * // User command: !leaderboard attendance
 * await displayAttendanceLeaderboard(message);
 */
async function displayAttendanceLeaderboard(message) {
  try {
    const data = await fetchAttendanceLeaderboard();

    // Check if data exists
    if (!data || !data.leaderboard || data.leaderboard.length === 0) {
      await message.reply({ content: '📊 No attendance data available yet.', failIfNotExists: false });
      return;
    }

    // Build leaderboard embed
    const embed = new EmbedBuilder()
      .setColor('#3498db')
      .setTitle('🏆 Attendance Leaderboard')
      .setDescription(`**Current Week:** ${data.weekName || 'N/A'}\n**Total Members:** ${data.leaderboard.length}`)
      .setTimestamp();

    // Add guild branding
    addGuildThumbnail(embed, message.guild);

    // Get top 10 members
    const topMembers = data.leaderboard.slice(0, 10);
    let leaderboardText = '';

    // Find max points for percentage calculation (top performer = 100%)
    const maxPoints = topMembers.length > 0 ? topMembers[0].points : 1;

    // Build leaderboard text with visual progress bars
    topMembers.forEach((member, index) => {
      // Medal for top 3, number for others
      const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;

      // Calculate percentage relative to top performer
      const percentage = maxPoints > 0 ? (member.points / maxPoints) * 100 : 0;

      // Create visual bar (20 chars: filled blocks + empty blocks)
      const filledLength = Math.round((percentage / 100) * 20);
      const emptyLength = 20 - filledLength;
      const bar = '█'.repeat(filledLength) + '░'.repeat(emptyLength);

      leaderboardText += `${medal} **${member.name}** - ${member.points} pts\n${bar} ${percentage.toFixed(1)}%\n`;
    });

    embed.addFields({
      name: '📈 Top 10 Members',
      value: leaderboardText || 'No data',
      inline: false
    });

    // Add overall statistics
    if (data.totalSpawns) {
      let statsText = `**Total Spawns:** ${data.totalSpawns}\n`;
      statsText += `**Average Attendance:** ${data.averageAttendance || 0} members\n`;
      if (data.uniqueBosses) {
        statsText += `**Unique Bosses:** ${data.uniqueBosses}`;
      }

      embed.addFields({
        name: '📊 Overall Statistics',
        value: statsText,
        inline: false
      });
    }

    // NEW: Add boss-specific spawn counts
    if (data.bossStats && data.bossStats.length > 0) {
      const top10Bosses = data.bossStats.slice(0, 10);
      let bossText = '';

      top10Bosses.forEach((boss, index) => {
        const icon = index === 0 ? '👑' : index === 1 ? '⭐' : index === 2 ? '✨' : '▪️';
        bossText += `${icon} **${boss.boss}**\n`;
        bossText += `   Spawns: **${boss.spawnCount}** | Avg Members: **${boss.avgMembersPerSpawn}** | Participation: **${boss.participationRate || 0}%**\n`;
      });

      embed.addFields({
        name: '🐲 Boss Spawn Statistics (Top 10)',
        value: bossText || 'No boss data',
        inline: false
      });
    }

    await message.reply({ embeds: [embed], failIfNotExists: false });
  } catch (error) {
    console.error('❌ Error displaying attendance leaderboard:', error);
    await message.reply({ content: '❌ Failed to fetch attendance leaderboard. Please try again later.', failIfNotExists: false });
  }
}

/**
 * Displays the bidding points leaderboard in Discord
 *
 * VISUAL FEATURES:
 * - Top 10 members ranked by points remaining
 * - Medal emojis for top 3 (🥇🥈🥉)
 * - Shows both points left and points consumed
 * - Progress bars showing relative point balances
 * - Percentage relative to top point holder
 * - Total points distributed and consumed
 *
 * WORKFLOW:
 * 1. Fetch bidding data from sheets
 * 2. Check if data exists
 * 3. Build embed with top 10 members
 * 4. Generate visual progress bars
 * 5. Add statistics if available
 * 6. Send embed to channel
 *
 * @param {Message} message - Discord message that triggered the command
 * @returns {Promise<void>}
 *
 * @example
 * // User command: !leaderboard bidding
 * await displayBiddingLeaderboard(message);
 */
async function displayBiddingLeaderboard(message) {
  try {
    const data = await fetchBiddingLeaderboard();

    if (!data || !data.leaderboard || data.leaderboard.length === 0) {
      await message.reply({ content: '📊 No bidding points data available yet.', failIfNotExists: false });
      return;
    }

    const embed = new EmbedBuilder()
      .setColor('#e74c3c')
      .setTitle('🏆 Bidding Points Leaderboard')
      .setDescription(`**Total Members:** ${data.leaderboard.length}`)
      .setTimestamp();

    // Add guild branding
    addGuildThumbnail(embed, message.guild);

    // Top 10 members by points left
    const topMembers = data.leaderboard.slice(0, 10);
    let leaderboardText = '';

    // Find max points for percentage calculation
    const maxPointsLeft = topMembers.length > 0 ? topMembers[0].pointsLeft : 1;

    topMembers.forEach((member, index) => {
      const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;

      // Calculate percentage and create visual bar (20 chars total)
      const percentage = maxPointsLeft > 0 ? (member.pointsLeft / maxPointsLeft) * 100 : 0;
      const filledLength = Math.round((percentage / 100) * 20);
      const emptyLength = 20 - filledLength;
      const bar = '█'.repeat(filledLength) + '░'.repeat(emptyLength);

      leaderboardText += `${medal} **${member.name}**\n`;
      leaderboardText += `   💰 Points Left: **${member.pointsLeft}** | 💸 Consumed: **${member.pointsConsumed}**\n`;
      leaderboardText += `   ${bar} ${percentage.toFixed(1)}%\n`;
    });

    embed.addFields({
      name: '💎 Top 10 by Points Left',
      value: leaderboardText || 'No data',
      inline: false
    });

    if (data.totalPointsDistributed) {
      embed.addFields({
        name: '📊 Statistics',
        value: `Total Points Distributed: **${data.totalPointsDistributed}**\nTotal Points Consumed: **${data.totalPointsConsumed || 0}**`,
        inline: false
      });
    }

    await message.reply({ embeds: [embed], failIfNotExists: false });
  } catch (error) {
    console.error('❌ Error displaying bidding leaderboard:', error);
    await message.reply({ content: '❌ Failed to fetch bidding points leaderboard. Please try again later.', failIfNotExists: false });
  }
}

/**
 * Displays both attendance and bidding leaderboards in Discord
 *
 * VISUAL FEATURES:
 * - Combined view of both leaderboards
 * - Top 10 members for each category
 * - Medal emojis for top 3 (🥇🥈🥉)
 * - Progress bars and statistics
 *
 * WORKFLOW:
 * 1. Fetch both attendance and bidding data
 * 2. Build combined embed with both leaderboards
 * 3. Send to channel where command was issued
 *
 * @param {Message} message - Discord message that triggered the command
 * @returns {Promise<void>}
 *
 * @example
 * // User command: !leaderboards
 * await displayCombinedLeaderboards(message);
 */
async function displayCombinedLeaderboards(message) {
  try {
    // Fetch both leaderboards
    const [attData, bidData] = await Promise.all([
      fetchAttendanceLeaderboard(),
      fetchBiddingLeaderboard()
    ]);

    // Build combined embed
    const embed = new EmbedBuilder()
      .setColor('#9b59b6')
      .setTitle('🏆 ELYSIUM Leaderboards')
      .setDescription('**Combined Attendance & Bidding Rankings**')
      .setTimestamp();

    // Add guild branding
    addGuildThumbnail(embed, message.guild);

    // Add Attendance Leaderboard
    if (attData && attData.leaderboard && attData.leaderboard.length > 0) {
      const topMembers = attData.leaderboard.slice(0, 10);
      let leaderboardText = '';
      const maxPoints = topMembers.length > 0 ? topMembers[0].points : 1;

      topMembers.forEach((member, index) => {
        const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
        const percentage = maxPoints > 0 ? (member.points / maxPoints) * 100 : 0;
        const filledLength = Math.round((percentage / 100) * 20);
        const emptyLength = 20 - filledLength;
        const bar = '█'.repeat(filledLength) + '░'.repeat(emptyLength);
        leaderboardText += `${medal} **${member.name}** - ${member.points} pts\n${bar} ${percentage.toFixed(1)}%\n`;
      });

      embed.addFields({
        name: '📈 Attendance Top 10',
        value: leaderboardText || 'No data',
        inline: false
      });
    } else {
      embed.addFields({
        name: '📈 Attendance Top 10',
        value: 'No attendance data available yet.',
        inline: false
      });
    }

    // Add Bidding Leaderboard
    if (bidData && bidData.leaderboard && bidData.leaderboard.length > 0) {
      const topMembers = bidData.leaderboard.slice(0, 10);
      let leaderboardText = '';
      const maxPointsLeft = topMembers.length > 0 ? topMembers[0].pointsLeft : 1;

      topMembers.forEach((member, index) => {
        const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
        const percentage = maxPointsLeft > 0 ? (member.pointsLeft / maxPointsLeft) * 100 : 0;
        const filledLength = Math.round((percentage / 100) * 20);
        const emptyLength = 20 - filledLength;
        const bar = '█'.repeat(filledLength) + '░'.repeat(emptyLength);
        leaderboardText += `${medal} **${member.name}**\n`;
        leaderboardText += `   💰 Left: **${member.pointsLeft}** | 💸 Used: **${member.pointsConsumed}**\n`;
        leaderboardText += `   ${bar} ${percentage.toFixed(1)}%\n`;
      });

      embed.addFields({
        name: '💎 Bidding Points Top 10',
        value: leaderboardText || 'No data',
        inline: false
      });
    } else {
      embed.addFields({
        name: '💎 Bidding Points Top 10',
        value: 'No bidding data available yet.',
        inline: false
      });
    }

    await message.reply({ embeds: [embed], failIfNotExists: false });
  } catch (error) {
    console.error('❌ Error displaying combined leaderboards:', error);
    await message.reply({ content: '❌ Failed to fetch leaderboards. Please try again later.', failIfNotExists: false });
  }
}

// ============================================================================
// WEEKLY REPORTS
// ============================================================================

/**
 * Generates and sends the weekly summary report to admin-logs
 *
 * REPORT CONTENTS:
 * 1. Attendance Summary:
 *    - Total spawns for the week
 *    - Unique attendees count
 *    - Average attendance per spawn
 *    - Top 3 attendees with medal emojis
 *
 * 2. Bidding Summary:
 *    - Total points distributed
 *    - Total points consumed
 *    - Total points remaining
 *    - Top 3 spenders with medal emojis
 *
 * 3. Most Active Members:
 *    - Combined activity score (attendance + bidding)
 *    - Top 5 most active members
 *
 * SCHEDULING:
 * Called automatically every Saturday at 11:59pm GMT+8
 * Can also be manually triggered for testing
 *
 * ERROR HANDLING:
 * - Validates client and config are initialized
 * - Validates data exists
 * - Validates admin-logs channel exists
 * - Logs errors but doesn't throw (to prevent scheduler crash)
 *
 * @returns {Promise<void>}
 *
 * @example
 * // Automatic (via scheduler)
 * // Every Saturday 11:59pm GMT+8
 *
 * @example
 * // Manual trigger
 * await sendWeeklyReport();
 */
async function sendWeeklyReport(targetChannel = null) {
  try {
    // Validate initialization
    if (!client || !config) {
      console.error('❌ Leaderboard system not initialized');
      return;
    }

    console.log('📅 Generating weekly report...');

    // Fetch summary data from sheets
    const data = await fetchWeeklySummary();

    if (!data) {
      console.error('❌ No weekly summary data available');
      return;
    }

    // If targetChannel is provided, use it exclusively; otherwise use default channels
    let adminLogsChannel = null;
    let elysiumCommandsChannel = null;

    if (targetChannel) {
      // Manual trigger: only send to the channel where command was invoked
      // Validate that targetChannel is a valid channel object
      if (!targetChannel || typeof targetChannel.send !== 'function') {
        console.error('❌ Invalid targetChannel provided:', targetChannel);
        return;
      }
      console.log(`📍 Sending weekly report to specific channel: ${targetChannel.name || targetChannel.id}`);
    } else {
      // Scheduled trigger: send to both admin logs and guild chat
      adminLogsChannel = await discordCache.getChannel('admin_logs_channel_id');
      elysiumCommandsChannel = config.elysium_commands_channel_id
        ? await discordCache.getChannel('elysium_commands_channel_id').catch(() => null)
        : null;

      if (!adminLogsChannel) {
        console.error('❌ Admin logs channel not found');
        return;
      }
    }

    const embed = new EmbedBuilder()
      .setColor('#2ecc71')
      .setTitle('📊 Weekly Report')
      .setDescription(`**Week:** ${data.weekName || 'N/A'}\n**Report Generated:** ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' })}`)
      .setTimestamp();

    // Add guild branding
    addGuildThumbnail(embed, adminLogsChannel.guild);

    // ==========================================
    // NEW: WEEK-SPECIFIC STATISTICS (Sunday-Saturday)
    // ==========================================
    if (data.weekSpecific) {
      const weekAtt = data.weekSpecific.attendance;
      const weekBid = data.weekSpecific.bidding;

      // Week-specific attendance
      if (weekAtt) {
        let weekAttText = `**Total Spawns:** ${weekAtt.totalSpawns || 0}\n`;
        weekAttText += `**Unique Attendees:** ${weekAtt.uniqueAttendees || 0}\n`;
        weekAttText += `**Average Attendance per Spawn:** ${weekAtt.averagePerSpawn || 0}\n`;

        if (weekAtt.topAttendees && weekAtt.topAttendees.length > 0) {
          weekAttText += `\n**Top 5 Attendees This Week:**\n`;
          weekAtt.topAttendees.slice(0, 5).forEach((member, index) => {
            const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
            weekAttText += `${medal} ${member.name} - ${member.points} pts\n`;
          });
        }

        embed.addFields({
          name: '📅 This Week\'s Attendance (Sunday-Saturday)',
          value: weekAttText,
          inline: false
        });
      }

      // Week-specific bidding
      if (weekBid && weekBid.totalConsumed > 0) {
        let weekBidText = `**Points Consumed This Week:** ${weekBid.totalConsumed || 0}\n`;

        if (weekBid.topSpenders && weekBid.topSpenders.length > 0) {
          weekBidText += `\n**Top 5 Spenders This Week:**\n`;
          weekBid.topSpenders.slice(0, 5).forEach((member, index) => {
            const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
            weekBidText += `${medal} ${member.name} - ${member.consumed} pts consumed\n`;
          });
        }

        embed.addFields({
          name: '💸 This Week\'s Bidding Activity (Sunday-Saturday)',
          value: weekBidText,
          inline: false
        });
      }
    }

    // ==========================================
    // NEW: LAST WEEK'S STATISTICS
    // ==========================================
    if (data.lastWeek && data.lastWeekName) {
      const lastWeekAtt = data.lastWeek.attendance;
      const lastWeekBid = data.lastWeek.bidding;

      // Last week's attendance
      if (lastWeekAtt && (lastWeekAtt.topAttendees.length > 0 || lastWeekAtt.totalSpawns > 0)) {
        let lastWeekAttText = `**Total Spawns:** ${lastWeekAtt.totalSpawns || 0}\n`;
        lastWeekAttText += `**Unique Attendees:** ${lastWeekAtt.uniqueAttendees || 0}\n`;
        lastWeekAttText += `**Average Attendance per Spawn:** ${lastWeekAtt.averagePerSpawn || 0}\n`;

        if (lastWeekAtt.topAttendees && lastWeekAtt.topAttendees.length > 0) {
          lastWeekAttText += `\n**Top 5 Attendees Last Week:**\n`;
          lastWeekAtt.topAttendees.slice(0, 5).forEach((member, index) => {
            const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
            lastWeekAttText += `${medal} ${member.name} - ${member.points} pts\n`;
          });
        }

        embed.addFields({
          name: '📆 Last Week\'s Attendance',
          value: lastWeekAttText,
          inline: false
        });
      }

      // Last week's bidding
      if (lastWeekBid && lastWeekBid.totalConsumed > 0) {
        let lastWeekBidText = `**Points Consumed Last Week:** ${lastWeekBid.totalConsumed || 0}\n`;

        if (lastWeekBid.topSpenders && lastWeekBid.topSpenders.length > 0) {
          lastWeekBidText += `\n**Top 5 Spenders Last Week:**\n`;
          lastWeekBid.topSpenders.slice(0, 5).forEach((member, index) => {
            const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
            lastWeekBidText += `${medal} ${member.name} - ${member.consumed} pts consumed\n`;
          });
        }

        embed.addFields({
          name: '💵 Last Week\'s Bidding Activity',
          value: lastWeekBidText,
          inline: false
        });
      }
    }

    // ==========================================
    // OVERALL STATISTICS (All-Time)
    // ==========================================

    // Attendance Summary (Overall)
    if (data.attendance) {
      const att = data.attendance;
      let attText = `**Total Spawns (All-Time):** ${att.totalSpawns || 0}\n`;
      attText += `**Total Unique Attendees:** ${att.uniqueAttendees || 0}\n`;
      attText += `**Average Attendance per Spawn:** ${att.averagePerSpawn || 0}\n`;

      if (att.topAttendees && att.topAttendees.length > 0) {
        attText += `\n**Top 3 Attendees (All-Time):**\n`;
        att.topAttendees.slice(0, 3).forEach((member, index) => {
          const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉';
          attText += `${medal} ${member.name} - ${member.points} pts\n`;
        });
      }

      embed.addFields({
        name: '📈 Overall Attendance Summary',
        value: attText,
        inline: false
      });

      // NEW: Add boss spawn breakdown
      if (att.bossStats && att.bossStats.length > 0) {
        const top5Bosses = att.bossStats.slice(0, 5);
        let bossText = '**Most Spawned Bosses:**\n';

        top5Bosses.forEach((boss, index) => {
          const icon = index === 0 ? '👑' : index === 1 ? '⭐' : index === 2 ? '✨' : '▪️';
          bossText += `${icon} **${boss.boss}** - ${boss.spawnCount} spawns (avg ${boss.avgMembersPerSpawn} members)\n`;
        });

        if (att.bossStats.length > 5) {
          bossText += `\n*...and ${att.bossStats.length - 5} more bosses*`;
        }

        embed.addFields({
          name: '🐲 Boss Activity',
          value: bossText,
          inline: false
        });
      }
    }

    // Bidding Summary (Overall)
    if (data.bidding) {
      const bid = data.bidding;
      let bidText = `**Total Points Distributed:** ${bid.totalDistributed || 0}\n`;
      bidText += `**Total Points Consumed:** ${bid.totalConsumed || 0}\n`;
      bidText += `**Total Points Remaining:** ${bid.totalRemaining || 0}\n`;

      if (bid.topSpenders && bid.topSpenders.length > 0) {
        bidText += `\n**Top 3 Spenders (All-Time):**\n`;
        bid.topSpenders.slice(0, 3).forEach((member, index) => {
          const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉';
          bidText += `${medal} ${member.name} - ${member.consumed} pts consumed\n`;
        });
      }

      embed.addFields({
        name: '💰 Overall Bidding Summary',
        value: bidText,
        inline: false
      });
    }

    // Most Active Members (combination of attendance and bidding activity)
    if (data.mostActive && data.mostActive.length > 0) {
      let activeText = '';
      data.mostActive.slice(0, 5).forEach((member, index) => {
        activeText += `${index + 1}. **${member.name}** - Activity Score: ${member.score}\n`;
      });

      embed.addFields({
        name: '⭐ Most Active Members',
        value: activeText,
        inline: false
      });
    }

    embed.setFooter({ text: 'Generated automatically every Saturday at 11:59pm GMT+8' });

    // Send to appropriate channel(s)
    if (targetChannel) {
      // Manual trigger: send only to the channel where command was invoked
      await targetChannel.send({ embeds: [embed] });
      console.log(`✅ Weekly report sent to ${targetChannel.name || targetChannel.id}`);
    } else {
      // Scheduled trigger: send to both admin logs and guild chat
      await adminLogsChannel.send({ embeds: [embed] });
      console.log('✅ Weekly report sent to admin logs channel');

      // Also send to ELYSIUM commands channel if configured
      if (elysiumCommandsChannel) {
        await elysiumCommandsChannel.send({ embeds: [embed] });
        console.log('✅ Weekly report sent to ELYSIUM commands channel');
      }

      // Mark weekly report as completed in crash recovery (only for scheduled reports)
      if (crashRecovery) {
        await crashRecovery.markWeeklyReportCompleted();
      }
    }
  } catch (error) {
    console.error('❌ Error sending weekly report:', error);
  }
}

// ============================================================================
// SCHEDULER
// ============================================================================

/**
 * Timer reference for the weekly report scheduler
 * Prevents duplicate schedulers from being created
 */
let weeklyReportTimer = null;

/**
 * Timer reference for the monthly report scheduler
 * Prevents duplicate schedulers from being created
 */
let monthlyReportTimer = null;

/**
 * Schedules weekly reports for every Saturday at 11:59pm GMT+8
 *
 * TIMEZONE HANDLING:
 * This function properly handles timezone conversions for GMT+8 (Asia/Manila).
 * The server may be running in any timezone, so we calculate the next
 * Saturday 11:59pm GMT+8 in terms of UTC time.
 *
 * WEEK DEFINITION:
 * Weeks start on Sunday and end on Saturday. Reports are generated at
 * the end of the week (Saturday 11:59pm) to capture all week activity.
 *
 * SCHEDULING LOGIC:
 * 1. Calculate days until next Saturday
 * 2. Set target time to 11:59pm GMT+8 on that Saturday
 * 3. Convert to UTC for setTimeout
 * 4. After report runs, automatically schedule next week
 *
 * DUPLICATE PREVENTION:
 * Checks weeklyReportTimer to prevent multiple schedulers.
 * If scheduler already exists, logs warning and returns.
 *
 * AUTO-RESCHEDULING:
 * After each report is sent, automatically schedules the next one.
 * This creates a recurring weekly schedule.
 *
 * @returns {void}
 *
 * @example
 * // Called once at bot startup
 * scheduleWeeklyReport();
 * // Logs: ✅ Weekly report scheduler initialized (Saturday 11:59pm GMT+8)
 * // Logs: 📅 Next weekly report scheduled for: 2025-11-09 23:59:00 GMT+8 (in 168 hours)
 */
function scheduleWeeklyReport() {
  // ========================================
  // DUPLICATE PREVENTION
  // ========================================
  // Prevent multiple schedulers if function called twice
  if (weeklyReportTimer) {
    console.log('⚠️ Weekly report scheduler already running, skipping initialization');
    return;
  }

  /**
   * Calculates the next Saturday at 11:59pm GMT+8 in UTC time
   *
   * @returns {Date} UTC date object representing next Saturday 11:59pm GMT+8
   */
  const calculateNextSaturday1159PM = () => {
    const now = new Date();

    // GMT+8 offset in milliseconds (Asia/Manila timezone)
    const GMT8_OFFSET = 8 * 60 * 60 * 1000;

    // Get current time in GMT+8 by adding offset
    const nowGMT8 = new Date(now.getTime() + GMT8_OFFSET);

    // Get current day (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
    const currentDay = nowGMT8.getUTCDay();

    // Calculate days until next Saturday
    // Formula: (target_day - current_day + 7) % 7
    let daysUntilSaturday = (6 - currentDay + 7) % 7;

    // Special case: If today IS Saturday and it's already past 11:59pm,
    // schedule for next Saturday (7 days from now)
    if (daysUntilSaturday === 0 && (nowGMT8.getUTCHours() > 23 || (nowGMT8.getUTCHours() === 23 && nowGMT8.getUTCMinutes() >= 59))) {
      daysUntilSaturday = 7;
    }

    // Create target date in GMT+8 timezone
    const targetGMT8 = new Date(nowGMT8);
    targetGMT8.setUTCDate(targetGMT8.getUTCDate() + daysUntilSaturday);
    targetGMT8.setUTCHours(23, 59, 0, 0);  // 11:59:00pm

    // Convert back to UTC for setTimeout (which uses UTC)
    const targetUTC = new Date(targetGMT8.getTime() - GMT8_OFFSET);

    return targetUTC;
  };

  /**
   * Schedules the next weekly report execution
   * Automatically called after each report completes
   */
  const scheduleNext = () => {
    // Calculate when next report should run (in UTC)
    const nextSaturdayUTC = calculateNextSaturday1159PM();
    const now = new Date();
    const delay = nextSaturdayUTC.getTime() - now.getTime();

    // Format for logging (convert back to GMT+8 for display)
    const displayTime = new Date(nextSaturdayUTC.getTime() + 8 * 60 * 60 * 1000);
    const hours = Math.floor(delay / 1000 / 60 / 60);

    console.log(`📅 Next weekly report scheduled for: ${displayTime.toISOString().replace('T', ' ').substring(0, 19)} GMT+8 (in ${hours} hours)`);

    // Save schedule to crash recovery
    if (crashRecovery) {
      crashRecovery.saveLeaderboardReportSchedule(nextSaturdayUTC).catch(err => {
        console.error('⚠️ Failed to save report schedule to crash recovery:', err.message);
      });
    }

    // Schedule the report
    weeklyReportTimer = setTimeout(async () => {
      await sendWeeklyReport();
      scheduleNext(); // Automatically schedule next week's report
    }, delay);
  };

  // Start the scheduling cycle
  scheduleNext();
  console.log('✅ Weekly report scheduler initialized (Saturday 11:59pm GMT+8)');
}

// ============================================================================
// MONTHLY REPORTS
// ============================================================================

/**
 * Generates and sends the monthly summary report to admin-logs.
 *
 * Similar to weekly reports but covers the entire month's activity.
 * Sent on the LAST day of each month at 11:59pm GMT+8.
 *
 * REPORT CONTENTS:
 * 1. Monthly Attendance Summary:
 *    - Total spawns for the month
 *    - Unique attendees count
 *    - Average attendance per spawn
 *    - Most attended bosses
 *
 * 2. Monthly Bidding Summary:
 *    - Total points distributed
 *    - Total points consumed
 *    - Average bid per item
 *    - Top bidders
 *
 * 3. Top Performers:
 *    - Top 3 attendees
 *    - Top 3 bidders
 *    - Month-over-month trends
 *
 * @returns {Promise<void>}
 */
async function sendMonthlyReport() {
  try {
    if (!client || !config) {
      console.error('❌ Leaderboard system not initialized');
      return;
    }

    console.log('📅 Generating monthly report...');

    // Get both admin-logs and guild chat (elysium commands) channels
    const [adminLogsChannel, guildChatChannel] = await Promise.all([
      client.channels.fetch(config.admin_logs_channel_id).catch((err) => {
        console.error('❌ Error fetching admin logs channel:', err);
        return null;
      }),
      client.channels.fetch(config.elysium_commands_channel_id).catch((err) => {
        console.error('❌ Error fetching guild chat channel:', err);
        return null;
      })
    ]);

    if (!adminLogsChannel && !guildChatChannel) {
      console.error(`❌ Neither admin logs nor guild chat channels found`);
      return;
    }

    if (adminLogsChannel) {
      console.log(`📍 Will send monthly report to admin logs: ${adminLogsChannel.name} (${adminLogsChannel.id})`);
    }
    if (guildChatChannel) {
      console.log(`📍 Will send monthly report to guild chat: ${guildChatChannel.name} (${guildChatChannel.id})`);
    }

    // Fetch leaderboard data
    const [attendanceData, biddingData] = await Promise.all([
      fetchAttendanceLeaderboard(),
      fetchBiddingLeaderboard()
    ]);

    // DEBUG: Log the bidding data structure
    console.log('📊 Bidding data structure:', JSON.stringify({
      totalPointsDistributed: biddingData.totalPointsDistributed,
      totalPointsConsumed: biddingData.totalPointsConsumed,
      leaderboardCount: biddingData.leaderboard?.length,
      sampleMember: biddingData.leaderboard?.[0]
    }, null, 2));

    // Get current month info (GMT+8)
    const now = new Date();
    const gmt8Time = new Date(now.getTime() + (8 * 60 * 60 * 1000));
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                        'July', 'August', 'September', 'October', 'November', 'December'];
    const lastMonth = (gmt8Time.getUTCMonth() - 1 + 12) % 12;
    const year = lastMonth === 11 ? gmt8Time.getUTCFullYear() - 1 : gmt8Time.getUTCFullYear();
    const monthName = `${monthNames[lastMonth]} ${year}`;

    // Calculate attendance metrics
    const totalSpawns = attendanceData.totalSpawns || 0;
    const uniqueAttendees = attendanceData.leaderboard ? attendanceData.leaderboard.length : 0;
    const avgAttendance = totalSpawns > 0
      ? Math.round((attendanceData.leaderboard.reduce((sum, p) => sum + p.points, 0) / totalSpawns) * 10) / 10
      : 0;

    // Calculate bidding metrics
    const totalPointsDistributed = biddingData.totalPointsDistributed || 0;
    const totalPointsConsumed = biddingData.totalPointsConsumed || 0;
    const avgBid = totalPointsConsumed > 0 && biddingData.leaderboard
      ? Math.round(totalPointsConsumed / biddingData.leaderboard.length)
      : 0;

    // Create monthly report embed
    const embed = new EmbedBuilder()
      .setTitle(`📅 Monthly Guild Report - ${monthName}`)
      .setDescription(`Comprehensive summary of guild activity for ${monthName}`)
      .setColor(0x9B59B6)  // Purple color for monthly reports
      .addFields(
        {
          name: '📊 Attendance Summary',
          value:
            `• **Total Spawns:** ${totalSpawns}\n` +
            `• **Unique Attendees:** ${uniqueAttendees}\n` +
            `• **Avg Attendance/Spawn:** ${avgAttendance} members\n`,
          inline: false
        },
        {
          name: '💰 Bidding Summary',
          value:
            `• **Total Points Distributed:** ${totalPointsDistributed}\n` +
            `• **Total Points Consumed:** ${totalPointsConsumed}\n` +
            `• **Avg Bid/Member:** ${avgBid} points\n`,
          inline: false
        }
      );

    // Add top 3 attendees
    if (attendanceData.leaderboard && attendanceData.leaderboard.length > 0) {
      const top3Attendance = attendanceData.leaderboard
        .slice(0, 3)
        .map((p, i) => {
          const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉';
          return `${medal} **${p.name}** - ${p.points} points`;
        })
        .join('\n');

      embed.addFields({
        name: '🏆 Top Attendees',
        value: top3Attendance,
        inline: false
      });
    }

    // Add top 3 bidders (most points consumed = highest spenders)
    if (biddingData.leaderboard && biddingData.leaderboard.length > 0) {
      // Sort by most points consumed (highest spenders first)
      const sortedByConsumed = [...biddingData.leaderboard]
        .sort((a, b) => (b.pointsConsumed || 0) - (a.pointsConsumed || 0));

      const top3Bidding = sortedByConsumed
        .slice(0, 3)
        .map((p, i) => {
          const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉';
          const consumed = p.pointsConsumed || 0;
          const remaining = p.pointsLeft || 0;
          return `${medal} **${p.name}** - ${consumed} points spent (${remaining} left)`;
        })
        .join('\n');

      embed.addFields({
        name: '💎 Top Bidders (Most Spent)',
        value: top3Bidding,
        inline: false
      });
    }

    embed.setFooter({ text: 'Next monthly report: Last day of next month at 11:59pm GMT+8' });
    embed.setTimestamp();

    // Add guild branding
    addGuildThumbnail(embed, adminLogsChannel.guild);

    // Send the report to both channels
    console.log(`📤 Attempting to send monthly report embed...`);

    const sendPromises = [];
    if (adminLogsChannel) {
      sendPromises.push(
        adminLogsChannel.send({ embeds: [embed] })
          .then((msg) => {
            console.log(`✅ Monthly report sent to admin logs - Message ID: ${msg.id}`);
            return { channel: 'admin-logs', success: true, messageId: msg.id };
          })
          .catch((err) => {
            console.error('❌ Error sending to admin logs:', err);
            return { channel: 'admin-logs', success: false, error: err.message };
          })
      );
    }

    if (guildChatChannel) {
      console.log(`🔍 Guild chat channel type: ${guildChatChannel.type}, isTextBased: ${guildChatChannel.isTextBased()}`);
      sendPromises.push(
        guildChatChannel.send({ embeds: [embed] })
          .then((msg) => {
            console.log(`✅ Monthly report sent to guild chat - Message ID: ${msg.id}`);
            return { channel: 'guild-chat', success: true, messageId: msg.id };
          })
          .catch((err) => {
            console.error('❌ Error sending to guild chat:', err);
            console.error('❌ Error details:', {
              message: err.message,
              code: err.code,
              httpStatus: err.httpStatus,
              channelId: guildChatChannel.id,
              channelName: guildChatChannel.name
            });
            return { channel: 'guild-chat', success: false, error: err.message };
          })
      );
    } else {
      console.warn('⚠️ Guild chat channel is null/undefined');
    }

    const results = await Promise.all(sendPromises);
    const successCount = results.filter(r => r.success).length;

    if (successCount > 0) {
      console.log(`✅ Monthly report sent successfully for ${monthName} to ${successCount} channel(s)`);
    } else {
      console.error('❌ Failed to send monthly report to any channels');
    }

  } catch (error) {
    console.error('❌ Error sending monthly report:', error);
  }
}

/**
 * Schedules monthly reports for the LAST day of each month at 11:59pm GMT+8.
 *
 * Similar to weekly report scheduler but calculates the last day of current month.
 * Automatically reschedules after each report.
 *
 * TIMEZONE HANDLING:
 * - All calculations done in GMT+8 (Asia/Manila)
 * - Converted to UTC for setTimeout
 * - Logs show GMT+8 times for clarity
 *
 * @returns {void}
 */
function scheduleMonthlyReport() {
  // Prevent duplicate schedulers
  if (monthlyReportTimer) {
    console.log('⚠️ Monthly report scheduler already running, skipping initialization');
    return;
  }

  /**
   * Calculates the last day of current month at 11:59pm GMT+8 in UTC time
   *
   * @returns {Date} UTC date object representing last day of month 11:59pm GMT+8
   */
  const calculateNextLastDayOfMonth1159PM = () => {
    const now = new Date();
    const GMT8_OFFSET = 8 * 60 * 60 * 1000;

    // Get current time in GMT+8
    const nowGMT8 = new Date(now.getTime() + GMT8_OFFSET);

    // Get current date
    const currentDate = nowGMT8.getUTCDate();
    const currentMonth = nowGMT8.getUTCMonth();
    const currentYear = nowGMT8.getUTCFullYear();

    // Calculate last day of current month
    // Get first day of next month, then subtract 1 day to get last day of current month
    const nextMonth = (currentMonth + 1) % 12;
    const nextMonthYear = nextMonth === 0 ? currentYear + 1 : currentYear;
    const firstDayOfNextMonth = new Date(Date.UTC(nextMonthYear, nextMonth, 1, 0, 0, 0, 0));
    const lastDayOfCurrentMonth = new Date(firstDayOfNextMonth.getTime() - (24 * 60 * 60 * 1000));
    const lastDateOfMonth = lastDayOfCurrentMonth.getUTCDate();

    // Determine target month, year, and day
    let targetMonth, targetYear, targetDay;

    // If it's the last day of month and past 11:59pm, schedule for next month's last day
    if (currentDate === lastDateOfMonth && (nowGMT8.getUTCHours() > 23 || (nowGMT8.getUTCHours() === 23 && nowGMT8.getUTCMinutes() >= 59))) {
      targetMonth = nextMonth;
      targetYear = nextMonthYear;
      // Calculate last day of next month
      const monthAfterNext = (nextMonth + 1) % 12;
      const monthAfterNextYear = monthAfterNext === 0 ? nextMonthYear + 1 : nextMonthYear;
      const firstDayOfMonthAfterNext = new Date(Date.UTC(monthAfterNextYear, monthAfterNext, 1, 0, 0, 0, 0));
      const lastDayOfNextMonth = new Date(firstDayOfMonthAfterNext.getTime() - (24 * 60 * 60 * 1000));
      targetDay = lastDayOfNextMonth.getUTCDate();
    }
    // Otherwise, schedule for current month's last day
    else {
      targetMonth = currentMonth;
      targetYear = currentYear;
      targetDay = lastDateOfMonth;
    }

    // Create target date in GMT+8
    const targetGMT8 = new Date(Date.UTC(targetYear, targetMonth, targetDay, 23, 59, 0, 0));

    // Convert back to UTC for setTimeout
    const targetUTC = new Date(targetGMT8.getTime() - GMT8_OFFSET);

    return targetUTC;
  };

  /**
   * Schedules the next monthly report execution
   */
  const scheduleNext = () => {
    const nextLastDayUTC = calculateNextLastDayOfMonth1159PM();
    const now = new Date();
    const delay = nextLastDayUTC.getTime() - now.getTime();

    // Format for logging (convert to GMT+8 for display)
    const displayTime = new Date(nextLastDayUTC.getTime() + 8 * 60 * 60 * 1000);
    const hours = Math.floor(delay / 1000 / 60 / 60);
    const days = Math.floor(hours / 24);

    console.log(`📅 Next monthly report scheduled for: ${displayTime.toISOString().replace('T', ' ').substring(0, 19)} GMT+8 (in ${days} days)`);

    // Schedule the report
    monthlyReportTimer = setTimeout(async () => {
      await sendMonthlyReport();
      scheduleNext(); // Automatically schedule next month's report
    }, delay);
  };

  // Start the scheduling cycle
  scheduleNext();
  console.log('✅ Monthly report scheduler initialized (last day of month 11:59pm GMT+8)');
}

// ============================================================================
// MODULE EXPORTS
// ============================================================================

module.exports = {
  init,
  displayAttendanceLeaderboard,
  displayBiddingLeaderboard,
  displayCombinedLeaderboards,
  sendWeeklyReport,
  scheduleWeeklyReport,
  sendMonthlyReport,
  scheduleMonthlyReport
};
