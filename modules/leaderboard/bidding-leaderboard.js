/**
 * Bidding leaderboard logic: fetching data and displaying rankings.
 * Also handles combined leaderboard display.
 */

const { EmbedBuilder } = require('discord.js');
const { addGuildThumbnail } = require('../../utils/embed-branding');
const mongoHelpers = require('../../utils/mongodb-helpers');
const { USE_MONGODB_BIDDING } = require('./constants');
const state = require('./state');
const { fetchAttendanceLeaderboard } = require('./attendance-leaderboard');

// ============================================================================
// DATA FETCHING
// ============================================================================

/**
 * Fetches bidding points leaderboard data from Google Sheets or MongoDB
 * @returns {Promise<Object>} Leaderboard data object
 */
async function fetchBiddingLeaderboard() {
  const startTime = Date.now();

  // ═════════════════════════════════════════════════════════════════════════
  // MONGODB-FIRST PATH (Phase 4)
  // ═════════════════════════════════════════════════════════════════════════
  if (USE_MONGODB_BIDDING) {
    try {
      const members = await mongoHelpers.getAllMembers();
      const duration = Date.now() - startTime;
      console.log(`✅ [MongoDB] Fetched bidding leaderboard from ${members.length} members in ${duration}ms`);

      const activeMembers = members.filter(m => m.isActive !== false);

      const sortedMembers = activeMembers
        .filter(m => m.username)
        .sort((a, b) => (b.pointsAvailable || 0) - (a.pointsAvailable || 0));

      const totalPointsDistributed = activeMembers.reduce((sum, m) =>
        sum + (m.pointsAvailable || 0) + (m.pointsSpent || 0), 0
      );
      const totalPointsConsumed = activeMembers.reduce((sum, m) =>
        sum + (m.pointsSpent || 0), 0
      );

      const leaderboard = sortedMembers.map(m => ({
        name: m.username,
        pointsLeft: m.pointsAvailable || 0,
        pointsConsumed: m.pointsSpent || 0
      }));

      return {
        status: 'ok',
        leaderboard,
        totalPointsDistributed,
        totalPointsConsumed
      };

    } catch (error) {
      console.error(`❌ [MongoDB] Failed to fetch bidding leaderboard:`, error.message);
      console.log(`⚠️ [MongoDB] Falling back to Google Sheets...`);
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  // GOOGLE SHEETS PATH (Fallback or when MongoDB disabled)
  // ═════════════════════════════════════════════════════════════════════════
  try {
    const result = await state.sheetAPI.call('getBiddingLeaderboard');
    const duration = Date.now() - startTime;
    console.log(`⚡ Fetched bidding leaderboard in ${duration}ms`);
    return result;
  } catch (error) {
    console.error('❌ Error fetching bidding leaderboard:', error);
    throw error;
  }
}

// ============================================================================
// DISPLAY
// ============================================================================

/**
 * Displays the bidding points leaderboard in Discord
 * @param {Message} message - Discord message that triggered the command
 * @returns {Promise<void>}
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

    addGuildThumbnail(embed, message.guild);

    const topMembers = data.leaderboard.slice(0, 10);
    let leaderboardText = '';

    const maxPointsLeft = topMembers.length > 0 ? topMembers[0].pointsLeft : 1;

    topMembers.forEach((member, index) => {
      const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;

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
 * @param {Message} message - Discord message that triggered the command
 * @returns {Promise<void>}
 */
async function displayCombinedLeaderboards(message) {
  try {
    const [attData, bidData] = await Promise.all([
      fetchAttendanceLeaderboard(),
      fetchBiddingLeaderboard()
    ]);

    const embed = new EmbedBuilder()
      .setColor('#9b59b6')
      .setTitle(`🏆 ${state.guildName} Leaderboards`)
      .setDescription('**Combined Attendance & Bidding Rankings**')
      .setTimestamp();

    addGuildThumbnail(embed, message.guild);

    // Attendance Leaderboard
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

    // Bidding Leaderboard
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

module.exports = {
  fetchBiddingLeaderboard,
  displayBiddingLeaderboard,
  displayCombinedLeaderboards
};
