/**
 * Attendance leaderboard logic: fetching data and displaying rankings.
 */

const { EmbedBuilder } = require('discord.js');
const { addGuildThumbnail } = require('../../utils/embed-branding');
const dbAPI = require('../../utils/database-api');
const { USE_MONGODB_ATTENDANCE } = require('./constants');
const state = require('./state');

// ============================================================================
// DATA FETCHING
// ============================================================================

/**
 * Fetches attendance leaderboard data from Google Sheets or MongoDB
 * @returns {Promise<Object>} Leaderboard data object
 */
async function fetchAttendanceLeaderboard() {
  const startTime = Date.now();

  // ═════════════════════════════════════════════════════════════════════════
  // MONGODB-FIRST PATH (Phase 4)
  // ═════════════════════════════════════════════════════════════════════════
  if (USE_MONGODB_ATTENDANCE) {
    try {
      const db = await dbAPI.connect();

      const attendanceStats = await db.collection('attendance')
        .aggregate([
          {
            $group: {
              _id: '$memberName',
              attendanceCount: { $sum: 1 }
            }
          },
          {
            $sort: { attendanceCount: -1 }
          }
        ]).toArray();

      const duration = Date.now() - startTime;
      console.log(`✅ [MongoDB] Fetched attendance leaderboard from ${attendanceStats.length} members in ${duration}ms`);

      const memberAttendance = attendanceStats.map(stat => ({
        name: stat._id,
        points: stat.attendanceCount
      })).filter(m => m.points > 0);

      const totalPoints = memberAttendance.reduce((sum, m) => sum + m.points, 0);
      const averageAttendance = memberAttendance.length > 0
        ? Math.round(totalPoints / memberAttendance.length)
        : 0;

      return {
        status: 'ok',
        weekName: 'All Time',
        leaderboard: memberAttendance,
        totalSpawns: 0,
        averageAttendance
      };

    } catch (error) {
      console.error(`❌ [MongoDB] Failed to fetch attendance leaderboard:`, error.message);
      console.log(`⚠️ [MongoDB] Falling back to Google Sheets...`);
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  // GOOGLE SHEETS PATH (Fallback or when MongoDB disabled)
  // ═════════════════════════════════════════════════════════════════════════
  try {
    const result = await state.sheetAPI.call('getAttendanceLeaderboard');
    const duration = Date.now() - startTime;
    console.log(`⚡ Fetched attendance leaderboard in ${duration}ms`);
    return result;
  } catch (error) {
    console.error('❌ Error fetching attendance leaderboard:', error);
    throw error;
  }
}

// ============================================================================
// DISPLAY
// ============================================================================

/**
 * Displays the attendance leaderboard in Discord
 * @param {Message} message - Discord message that triggered the command
 * @returns {Promise<void>}
 */
async function displayAttendanceLeaderboard(message) {
  try {
    const data = await fetchAttendanceLeaderboard();

    if (!data || !data.leaderboard || data.leaderboard.length === 0) {
      await message.reply({ content: '📊 No attendance data available yet.', failIfNotExists: false });
      return;
    }

    const embed = new EmbedBuilder()
      .setColor('#3498db')
      .setTitle('🏆 Attendance Leaderboard')
      .setDescription(`**Current Week:** ${data.weekName || 'N/A'}\n**Total Members:** ${data.leaderboard.length}`)
      .setTimestamp();

    addGuildThumbnail(embed, message.guild);

    const topMembers = data.leaderboard.slice(0, 10);
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
      name: '📈 Top 10 Members',
      value: leaderboardText || 'No data',
      inline: false
    });

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

module.exports = {
  fetchAttendanceLeaderboard,
  displayAttendanceLeaderboard
};
