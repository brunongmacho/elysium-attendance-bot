/**
 * Report generation: weekly and monthly summary reports.
 */

const { EmbedBuilder } = require('discord.js');
const { addGuildThumbnail } = require('../../utils/embed-branding');
const state = require('./state');
const { fetchAttendanceLeaderboard, fetchBiddingLeaderboard } = require('./bidding-leaderboard');

// ============================================================================
// DATA FETCHING
// ============================================================================

/**
 * Fetches weekly summary data from Google Sheets
 * @returns {Promise<Object>} Weekly summary data object
 */
async function fetchWeeklySummary() {
  const startTime = Date.now();
  try {
    const result = await state.sheetAPI.call('getWeeklySummary');
    const duration = Date.now() - startTime;
    console.log(`⚡ Fetched weekly summary in ${duration}ms`);
    return result;
  } catch (error) {
    console.error('❌ Error fetching weekly summary:', error);
    throw error;
  }
}

// ============================================================================
// WEEKLY REPORT
// ============================================================================

/**
 * Generates and sends the weekly summary report to admin-logs
 * @param {Object|null} targetChannel - If provided, send report only to this channel
 * @returns {Promise<void>}
 */
async function sendWeeklyReport(targetChannel = null) {
  try {
    if (!state.client || !state.config) {
      console.error('❌ Leaderboard system not initialized');
      return;
    }

    console.log('📅 Generating weekly report...');

    const data = await fetchWeeklySummary();

    if (!data) {
      console.error('❌ No weekly summary data available');
      return;
    }

    let adminLogsChannel = null;
    let elysiumCommandsChannel = null;

    if (targetChannel) {
      if (!targetChannel || typeof targetChannel.send !== 'function') {
        console.error('❌ Invalid targetChannel provided:', targetChannel);
        return;
      }

      if (!targetChannel.id) {
        console.error('❌ targetChannel missing id property');
        return;
      }

      console.log(`📍 Sending weekly report to specific channel: ${targetChannel.name || targetChannel.id} (type: ${targetChannel.type})`);
    } else {
      if (!state.discordCache) {
        console.error('❌ discordCache is not initialized');
        return;
      }

      adminLogsChannel = await state.discordCache.getChannel('admin_logs_channel_id');
      elysiumCommandsChannel = state.config.elysium_commands_channel_id
        ? await state.discordCache.getChannel('elysium_commands_channel_id').catch(() => null)
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

    const channelForGuild = targetChannel || adminLogsChannel;
    if (channelForGuild?.guild) {
      addGuildThumbnail(embed, channelForGuild.guild);
    }

    // Week-specific statistics
    if (data.weekSpecific) {
      const weekAtt = data.weekSpecific.attendance;
      const weekBid = data.weekSpecific.bidding;

      if (weekAtt) {
        let weekAttText = `**Total Spawns:** ${weekAtt.totalSpawns || 0}\n`;
        weekAttText += `**Unique Attendees:** ${weekAtt.uniqueAttendees || 0}\n`;
        weekAttText += `**Average Attendance per Spawn:** ${weekAtt.averagePerSpawn || 0}\n`;

        if (weekAtt.topAttendees && weekAtt.topAttendees.length > 0) {
          weekAttText += `\n**Top 5 Attendees This Week:**\n`;
          weekAtt.topAttendees.slice(0, 5).forEach((member, index) => {
            if (!member || typeof member !== 'object') {
              console.warn('⚠️ Invalid member object in weekAtt.topAttendees:', member);
              return;
            }
            const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
            const memberName = member.name || member.username || 'Unknown';
            const memberPoints = member.points || 0;
            weekAttText += `${medal} ${memberName} - ${memberPoints} pts\n`;
          });
        }

        embed.addFields({
          name: '📅 This Week\'s Attendance (Monday-Sunday)',
          value: weekAttText,
          inline: false
        });
      }

      if (weekBid && weekBid.totalConsumed > 0) {
        let weekBidText = `**Points Consumed This Week:** ${weekBid.totalConsumed || 0}\n`;

        if (weekBid.topSpenders && weekBid.topSpenders.length > 0) {
          weekBidText += `\n**Top 5 Spenders This Week:**\n`;
          weekBid.topSpenders.slice(0, 5).forEach((member, index) => {
            if (!member || typeof member !== 'object') {
              console.warn('⚠️ Invalid member object in weekBid.topSpenders:', member);
              return;
            }
            const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
            const memberName = member.name || member.username || 'Unknown';
            const memberConsumed = member.consumed || 0;
            weekBidText += `${medal} ${memberName} - ${memberConsumed} pts consumed\n`;
          });
        }

        embed.addFields({
          name: '💸 This Week\'s Bidding Activity (Monday-Sunday)',
          value: weekBidText,
          inline: false
        });
      }
    }

    // Last week's statistics
    if (data.lastWeek && data.lastWeekName) {
      const lastWeekAtt = data.lastWeek.attendance;
      const lastWeekBid = data.lastWeek.bidding;

      if (lastWeekAtt && (lastWeekAtt.topAttendees.length > 0 || lastWeekAtt.totalSpawns > 0)) {
        let lastWeekAttText = `**Total Spawns:** ${lastWeekAtt.totalSpawns || 0}\n`;
        lastWeekAttText += `**Unique Attendees:** ${lastWeekAtt.uniqueAttendees || 0}\n`;
        lastWeekAttText += `**Average Attendance per Spawn:** ${lastWeekAtt.averagePerSpawn || 0}\n`;

        if (lastWeekAtt.topAttendees && lastWeekAtt.topAttendees.length > 0) {
          lastWeekAttText += `\n**Top 5 Attendees Last Week:**\n`;
          lastWeekAtt.topAttendees.slice(0, 5).forEach((member, index) => {
            if (!member || typeof member !== 'object') {
              console.warn('⚠️ Invalid member object in lastWeekAtt.topAttendees:', member);
              return;
            }
            const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
            const memberName = member.name || member.username || 'Unknown';
            const memberPoints = member.points || 0;
            lastWeekAttText += `${medal} ${memberName} - ${memberPoints} pts\n`;
          });
        }

        embed.addFields({
          name: '📆 Last Week\'s Attendance',
          value: lastWeekAttText,
          inline: false
        });
      }

      if (lastWeekBid && lastWeekBid.totalConsumed > 0) {
        let lastWeekBidText = `**Points Consumed Last Week:** ${lastWeekBid.totalConsumed || 0}\n`;

        if (lastWeekBid.topSpenders && lastWeekBid.topSpenders.length > 0) {
          lastWeekBidText += `\n**Top 5 Spenders Last Week:**\n`;
          lastWeekBid.topSpenders.slice(0, 5).forEach((member, index) => {
            if (!member || typeof member !== 'object') {
              console.warn('⚠️ Invalid member object in lastWeekBid.topSpenders:', member);
              return;
            }
            const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
            const memberName = member.name || member.username || 'Unknown';
            const memberConsumed = member.consumed || 0;
            lastWeekBidText += `${medal} ${memberName} - ${memberConsumed} pts consumed\n`;
          });
        }

        embed.addFields({
          name: '💵 Last Week\'s Bidding Activity',
          value: lastWeekBidText,
          inline: false
        });
      }
    }

    // Overall statistics
    if (data.attendance) {
      const att = data.attendance;
      let attText = `**Total Spawns (All-Time):** ${att.totalSpawns || 0}\n`;
      attText += `**Total Unique Attendees:** ${att.uniqueAttendees || 0}\n`;
      attText += `**Average Attendance per Spawn:** ${att.averagePerSpawn || 0}\n`;

      if (att.topAttendees && att.topAttendees.length > 0) {
        attText += `\n**Top 3 Attendees (All-Time):**\n`;
        att.topAttendees.slice(0, 3).forEach((member, index) => {
          if (!member || typeof member !== 'object') {
            console.warn('⚠️ Invalid member object in att.topAttendees:', member);
            return;
          }
          const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉';
          const memberName = member.name || member.username || 'Unknown';
          const memberPoints = member.points || 0;
          attText += `${medal} ${memberName} - ${memberPoints} pts\n`;
        });
      }

      embed.addFields({
        name: '📈 Overall Attendance Summary',
        value: attText,
        inline: false
      });

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

    if (data.bidding) {
      const bid = data.bidding;
      let bidText = `**Total Points Distributed:** ${bid.totalDistributed || 0}\n`;
      bidText += `**Total Points Consumed:** ${bid.totalConsumed || 0}\n`;
      bidText += `**Total Points Remaining:** ${bid.totalRemaining || 0}\n`;

      if (bid.topSpenders && bid.topSpenders.length > 0) {
        bidText += `\n**Top 3 Spenders (All-Time):**\n`;
        bid.topSpenders.slice(0, 3).forEach((member, index) => {
          if (!member || typeof member !== 'object') {
            console.warn('⚠️ Invalid member object in bid.topSpenders:', member);
            return;
          }
          const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉';
          const memberName = member.name || member.username || 'Unknown';
          const memberConsumed = member.consumed || 0;
          bidText += `${medal} ${memberName} - ${memberConsumed} pts consumed\n`;
        });
      }

      embed.addFields({
        name: '💰 Overall Bidding Summary',
        value: bidText,
        inline: false
      });
    }

    if (data.mostActive && data.mostActive.length > 0) {
      let activeText = '';
      data.mostActive.slice(0, 5).forEach((member, index) => {
        if (!member || typeof member !== 'object') {
          console.warn('⚠️ Invalid member object in data.mostActive:', member);
          return;
        }
        const memberName = member.name || member.username || 'Unknown';
        const memberScore = member.score || 0;
        activeText += `${index + 1}. **${memberName}** - Activity Score: ${memberScore}\n`;
      });

      embed.addFields({
        name: '⭐ Most Active Members',
        value: activeText,
        inline: false
      });
    }

    embed.setFooter({ text: 'Generated automatically every Monday at 2:59am GMT+8' });

    if (targetChannel) {
      try {
        await targetChannel.send({ embeds: [embed] });
        console.log(`✅ Weekly report sent to ${targetChannel.name || targetChannel.id}`);
      } catch (sendError) {
        console.error(`❌ Error sending to targetChannel:`, sendError);
        throw sendError;
      }
    } else {
      await adminLogsChannel.send({ embeds: [embed] });
      console.log('✅ Weekly report sent to admin logs channel');

      if (elysiumCommandsChannel) {
        await elysiumCommandsChannel.send({ embeds: [embed] });
        console.log(`✅ Weekly report sent to guild commands channel`);
      }

      if (state.crashRecovery) {
        await state.crashRecovery.markWeeklyReportCompleted();
      }
    }
  } catch (error) {
    console.error('❌ Error sending weekly report:', error);
  }
}

// ============================================================================
// MONTHLY REPORT
// ============================================================================

/**
 * Generates and sends the monthly summary report.
 * @param {Object|null} targetChannel - If provided, send report only to this channel
 * @returns {Promise<void>}
 */
async function sendMonthlyReport(targetChannel = null) {
  try {
    if (!state.client || !state.config) {
      console.error('❌ Leaderboard system not initialized');
      return;
    }

    console.log('📅 Generating monthly report...');

    let adminLogsChannel = null;
    let guildChatChannel = null;

    if (targetChannel) {
      if (!targetChannel || typeof targetChannel.send !== 'function') {
        console.error('❌ Invalid targetChannel provided:', targetChannel);
        return;
      }

      if (!targetChannel.id) {
        console.error('❌ targetChannel missing id property');
        return;
      }

      console.log(`📍 Sending monthly report to specific channel: ${targetChannel.name || targetChannel.id} (type: ${targetChannel.type})`);
    } else {
      [adminLogsChannel, guildChatChannel] = await Promise.all([
        state.client.channels.fetch(state.config.admin_logs_channel_id).catch((err) => {
          console.error('❌ Error fetching admin logs channel:', err);
          return null;
        }),
        state.client.channels.fetch(state.config.elysium_commands_channel_id).catch((err) => {
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
    }

    const [attendanceData, biddingData] = await Promise.all([
      fetchAttendanceLeaderboard(),
      fetchBiddingLeaderboard()
    ]);

    console.log('📊 Bidding data structure:', JSON.stringify({
      totalPointsDistributed: biddingData.totalPointsDistributed,
      totalPointsConsumed: biddingData.totalPointsConsumed,
      leaderboardCount: biddingData.leaderboard?.length,
      sampleMember: biddingData.leaderboard?.[0]
    }, null, 2));

    const now = new Date();
    const gmt8Time = new Date(now.getTime() + (8 * 60 * 60 * 1000));
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                        'July', 'August', 'September', 'October', 'November', 'December'];
    const lastMonth = (gmt8Time.getUTCMonth() - 1 + 12) % 12;
    const year = lastMonth === 11 ? gmt8Time.getUTCFullYear() - 1 : gmt8Time.getUTCFullYear();
    const monthName = `${monthNames[lastMonth]} ${year}`;

    const totalSpawns = attendanceData.totalSpawns || 0;
    const uniqueAttendees = attendanceData.leaderboard ? attendanceData.leaderboard.length : 0;
    const avgAttendance = totalSpawns > 0
      ? Math.round((attendanceData.leaderboard.reduce((sum, p) => sum + p.points, 0) / totalSpawns) * 10) / 10
      : 0;

    const totalPointsDistributed = biddingData.totalPointsDistributed || 0;
    const totalPointsConsumed = biddingData.totalPointsConsumed || 0;
    const avgBid = totalPointsConsumed > 0 && biddingData.leaderboard
      ? Math.round(totalPointsConsumed / biddingData.leaderboard.length)
      : 0;

    const embed = new EmbedBuilder()
      .setTitle(`📅 Monthly Guild Report - ${monthName}`)
      .setDescription(`Comprehensive summary of guild activity for ${monthName}`)
      .setColor(0x9B59B6)
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

    if (attendanceData.leaderboard && attendanceData.leaderboard.length > 0) {
      const top3Attendance = attendanceData.leaderboard
        .slice(0, 3)
        .map((p, i) => {
          const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉';
          return `${medal} **${p.name}** - ${p.points} points`;
        })
        .join('\n');

      embed.addFields({ name: '🏆 Top Attendees', value: top3Attendance, inline: false });
    }

    if (biddingData.leaderboard && biddingData.leaderboard.length > 0) {
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

      embed.addFields({ name: '💎 Top Bidders (Most Spent)', value: top3Bidding, inline: false });
    }

    embed.setFooter({ text: 'Next monthly report: Last day of next month at 11:59pm GMT+8' });
    embed.setTimestamp();

    const channelForGuild = targetChannel || adminLogsChannel || guildChatChannel;
    if (channelForGuild?.guild) {
      addGuildThumbnail(embed, channelForGuild.guild);
    }

    console.log(`📤 Attempting to send monthly report embed...`);

    if (targetChannel) {
      try {
        const msg = await targetChannel.send({ embeds: [embed] });
        console.log(`✅ Monthly report sent to ${targetChannel.name || targetChannel.id} - Message ID: ${msg.id}`);
      } catch (err) {
        console.error('❌ Error sending monthly report to target channel:', err);
      }
    } else {
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
    }

  } catch (error) {
    console.error('❌ Error sending monthly report:', error);
  }
}

module.exports = {
  fetchWeeklySummary,
  sendWeeklyReport,
  sendMonthlyReport
};
