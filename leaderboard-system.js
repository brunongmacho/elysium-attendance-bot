/**
 * ELYSIUM Leaderboard & Weekly Report System
 * Features: Attendance leaderboard, Bidding points leaderboard, Weekly reports
 */

const { EmbedBuilder } = require('discord.js');
const fetch = require('node-fetch');

let config = null;
let client = null;

/**
 * Initialize the leaderboard system
 */
function init(discordClient, botConfig) {
  client = discordClient;
  config = botConfig;
}

/**
 * Fetch attendance leaderboard from Google Sheets
 */
async function fetchAttendanceLeaderboard() {
  try {
    const response = await fetch(config.sheet_webhook_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'getAttendanceLeaderboard' })
    });

    const result = await response.json();

    if (result.status !== 'ok') {
      throw new Error(result.message || 'Failed to fetch attendance leaderboard');
    }

    return result;
  } catch (error) {
    console.error('❌ Error fetching attendance leaderboard:', error);
    throw error;
  }
}

/**
 * Fetch bidding points leaderboard from Google Sheets
 */
async function fetchBiddingLeaderboard() {
  try {
    const response = await fetch(config.sheet_webhook_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'getBiddingLeaderboard' })
    });

    const result = await response.json();

    if (result.status !== 'ok') {
      throw new Error(result.message || 'Failed to fetch bidding leaderboard');
    }

    return result;
  } catch (error) {
    console.error('❌ Error fetching bidding leaderboard:', error);
    throw error;
  }
}

/**
 * Fetch weekly summary data from Google Sheets
 */
async function fetchWeeklySummary() {
  try {
    const response = await fetch(config.sheet_webhook_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'getWeeklySummary' })
    });

    const result = await response.json();

    if (result.status !== 'ok') {
      throw new Error(result.message || 'Failed to fetch weekly summary');
    }

    return result;
  } catch (error) {
    console.error('❌ Error fetching weekly summary:', error);
    throw error;
  }
}

/**
 * Display attendance leaderboard
 */
async function displayAttendanceLeaderboard(message) {
  try {
    const data = await fetchAttendanceLeaderboard();

    if (!data || !data.leaderboard || data.leaderboard.length === 0) {
      await message.reply('📊 No attendance data available yet.');
      return;
    }

    const embed = new EmbedBuilder()
      .setColor('#3498db')
      .setTitle('🏆 Attendance Leaderboard')
      .setDescription(`**Current Week:** ${data.weekName || 'N/A'}\n**Total Members:** ${data.leaderboard.length}`)
      .setTimestamp();

    // Top 10 members
    const topMembers = data.leaderboard.slice(0, 10);
    let leaderboardText = '';

    topMembers.forEach((member, index) => {
      const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
      const bar = '█'.repeat(Math.min(Math.floor(member.points / 2), 20));
      leaderboardText += `${medal} **${member.name}** - ${member.points} pts\n${bar}\n`;
    });

    embed.addFields({
      name: '📈 Top 10 Members',
      value: leaderboardText || 'No data',
      inline: false
    });

    if (data.totalSpawns) {
      embed.addFields({
        name: '📊 Statistics',
        value: `Total Spawns: **${data.totalSpawns}**\nAverage Attendance: **${data.averageAttendance || 0}** members`,
        inline: false
      });
    }

    await message.reply({ embeds: [embed] });
  } catch (error) {
    console.error('❌ Error displaying attendance leaderboard:', error);
    await message.reply('❌ Failed to fetch attendance leaderboard. Please try again later.');
  }
}

/**
 * Display bidding points leaderboard
 */
async function displayBiddingLeaderboard(message) {
  try {
    const data = await fetchBiddingLeaderboard();

    if (!data || !data.leaderboard || data.leaderboard.length === 0) {
      await message.reply('📊 No bidding points data available yet.');
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

    topMembers.forEach((member, index) => {
      const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
      const bar = '█'.repeat(Math.min(Math.floor(member.pointsLeft / 5), 20));
      leaderboardText += `${medal} **${member.name}**\n`;
      leaderboardText += `   💰 Points Left: **${member.pointsLeft}** | 💸 Consumed: **${member.pointsConsumed}**\n`;
      leaderboardText += `   ${bar}\n`;
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

    await message.reply({ embeds: [embed] });
  } catch (error) {
    console.error('❌ Error displaying bidding leaderboard:', error);
    await message.reply('❌ Failed to fetch bidding points leaderboard. Please try again later.');
  }
}

/**
 * Generate and send weekly report
 */
async function sendWeeklyReport() {
  try {
    if (!client || !config) {
      console.error('❌ Leaderboard system not initialized');
      return;
    }

    console.log('📅 Generating weekly report...');

    const data = await fetchWeeklySummary();

    if (!data) {
      console.error('❌ No weekly summary data available');
      return;
    }

    const guild = await client.guilds.fetch(config.main_guild_id);
    const adminLogsChannel = await guild.channels.fetch(config.admin_logs_channel_id);

    if (!adminLogsChannel) {
      console.error('❌ Admin logs channel not found');
      return;
    }

    const embed = new EmbedBuilder()
      .setColor('#2ecc71')
      .setTitle('📊 Weekly Report')
      .setDescription(`**Week:** ${data.weekName || 'N/A'}\n**Report Generated:** ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' })}`)
      .setTimestamp();

    // Attendance Summary
    if (data.attendance) {
      const att = data.attendance;
      let attText = `**Total Spawns:** ${att.totalSpawns || 0}\n`;
      attText += `**Total Unique Attendees:** ${att.uniqueAttendees || 0}\n`;
      attText += `**Average Attendance per Spawn:** ${att.averagePerSpawn || 0}\n`;

      if (att.topAttendees && att.topAttendees.length > 0) {
        attText += `\n**Top 3 Attendees:**\n`;
        att.topAttendees.slice(0, 3).forEach((member, index) => {
          const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉';
          attText += `${medal} ${member.name} - ${member.points} pts\n`;
        });
      }

      embed.addFields({
        name: '📈 Attendance Summary',
        value: attText,
        inline: false
      });
    }

    // Bidding Summary
    if (data.bidding) {
      const bid = data.bidding;
      let bidText = `**Total Points Distributed:** ${bid.totalDistributed || 0}\n`;
      bidText += `**Total Points Consumed:** ${bid.totalConsumed || 0}\n`;
      bidText += `**Total Points Remaining:** ${bid.totalRemaining || 0}\n`;

      if (bid.topSpenders && bid.topSpenders.length > 0) {
        bidText += `\n**Top 3 Spenders:**\n`;
        bid.topSpenders.slice(0, 3).forEach((member, index) => {
          const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉';
          bidText += `${medal} ${member.name} - ${member.consumed} pts consumed\n`;
        });
      }

      embed.addFields({
        name: '💰 Bidding Summary',
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

    embed.setFooter({ text: 'Generated automatically every Monday at 3am GMT+8' });

    await adminLogsChannel.send({ embeds: [embed] });
    console.log('✅ Weekly report sent successfully');
  } catch (error) {
    console.error('❌ Error sending weekly report:', error);
  }
}

/**
 * Schedule weekly report for 3am Monday GMT+8
 */
function scheduleWeeklyReport() {
  // Calculate next Monday 3am GMT+8
  const calculateNextMonday3AM = () => {
    const now = new Date();
    const manila = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Manila' }));

    // Get current day (0 = Sunday, 1 = Monday, etc.)
    const currentDay = manila.getDay();

    // Calculate days until next Monday (0 if today is Monday)
    let daysUntilMonday = (1 - currentDay + 7) % 7;
    if (daysUntilMonday === 0 && manila.getHours() >= 3) {
      daysUntilMonday = 7; // If it's Monday after 3am, schedule for next Monday
    }

    // Create target date
    const target = new Date(manila);
    target.setDate(target.getDate() + daysUntilMonday);
    target.setHours(3, 0, 0, 0);

    return target;
  };

  const scheduleNext = () => {
    const nextMonday = calculateNextMonday3AM();
    const now = new Date();
    const delay = nextMonday.getTime() - now.getTime();

    console.log(`📅 Next weekly report scheduled for: ${nextMonday.toLocaleString('en-US', { timeZone: 'Asia/Manila' })} (in ${Math.floor(delay / 1000 / 60 / 60)} hours)`);

    setTimeout(async () => {
      await sendWeeklyReport();
      scheduleNext(); // Schedule next week
    }, delay);
  };

  scheduleNext();
  console.log('✅ Weekly report scheduler initialized');
}

module.exports = {
  init,
  displayAttendanceLeaderboard,
  displayBiddingLeaderboard,
  sendWeeklyReport,
  scheduleWeeklyReport
};
