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
 *
 * @example
 * init(client, config);
 */
function init(discordClient, botConfig, cache = null) {
  client = discordClient;
  config = botConfig;
  sheetAPI = new SheetAPI(botConfig.sheet_webhook_url);
  discordCache = cache;
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
async function sendWeeklyReport() {
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

    // Get admin-logs channel and ELYSIUM commands channel
    const adminLogsChannel = await discordCache.getChannel('admin_logs_channel_id');
    const elysiumCommandsChannel = config.elysium_commands_channel_id
      ? await discordCache.getChannel('elysium_commands_channel_id').catch(() => null)
      : null;

    if (!adminLogsChannel) {
      console.error('❌ Admin logs channel not found');
      return;
    }

    const embed = new EmbedBuilder()
      .setColor('#2ecc71')
      .setTitle('📊 Weekly Report')
      .setDescription(`**Week:** ${data.weekName || 'N/A'}\n**Report Generated:** ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' })}`)
      .setTimestamp();

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
          weekAttText += `\n**Top 3 Attendees This Week:**\n`;
          weekAtt.topAttendees.slice(0, 3).forEach((member, index) => {
            const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉';
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
          weekBidText += `\n**Top 3 Spenders This Week:**\n`;
          weekBid.topSpenders.slice(0, 3).forEach((member, index) => {
            const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉';
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

    // Send to admin logs channel
    await adminLogsChannel.send({ embeds: [embed] });
    console.log('✅ Weekly report sent to admin logs channel');

    // Also send to ELYSIUM commands channel if configured
    if (elysiumCommandsChannel) {
      await elysiumCommandsChannel.send({ embeds: [embed] });
      console.log('✅ Weekly report sent to ELYSIUM commands channel');
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
// MODULE EXPORTS
// ============================================================================

module.exports = {
  init,
  displayAttendanceLeaderboard,
  displayBiddingLeaderboard,
  displayCombinedLeaderboards,
  sendWeeklyReport,
  scheduleWeeklyReport
};
