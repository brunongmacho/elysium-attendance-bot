/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║              ELYSIUM PROACTIVE INTELLIGENCE SYSTEM                        ║
 * ║                    Auto-Notifications & Alerts                            ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * @fileoverview Proactive monitoring and notification system that prevents
 * problems before they happen through scheduled checks and smart alerts.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * FEATURES
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 1. PRE-AUCTION WARNINGS
 *    - Check member readiness 2 hours before scheduled auctions
 *    - Alert if <70% members have sufficient points
 *    - Suggest postponement or point adjustments
 *
 * 2. ENGAGEMENT MONITORING
 *    - Daily check for at-risk members (14+ days inactive)
 *    - Weekly engagement digest (Monday 9 AM)
 *    - Milestone detection and celebration
 *
 * 3. ANOMALY MONITORING
 *    - Daily anomaly scan (6 PM Manila time)
 *    - Fraud detection alerts
 *    - Suspicious pattern notifications
 *
 * 4. GUILD ACHIEVEMENTS
 *    - Weekly positive summary (Sunday evening)
 *    - Record-breaking events
 *    - Motivation messages
 *
 * 5. AUCTION INTELLIGENCE
 *    - Auto-price suggestions when items load
 *    - Participation forecasts
 *    - Real-time bidding insights
 */

const { EmbedBuilder } = require('discord.js');
const cron = require('node-cron');
const { getChannelById } = require('./utils/discord-cache');
const { getTimestamp } = require('./utils/common');

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const PROACTIVE_CONFIG = {
  // Channel routing
  channels: {
    guildAnnouncement: 'guild_announcement_channel_id',  // Bot announcements (weekly summaries, milestones)
    guildChat: 'elysium_commands_channel_id',            // Guild chat (casual conversation)
    adminLogs: 'admin_logs_channel_id',                  // Sensitive data + detailed analysis
    biddingChannel: 'bidding_channel_id',                // Auction threads
  },

  // Notification schedules (Manila timezone)
  schedules: {
    preAuctionCheck: '2_hours_before',         // Check before Saturday 12 PM auction
    engagementDigest: '0 9 * * 1',            // Monday 9 AM
    anomalyDigest: '0 18 * * *',              // Daily 6 PM
    weeklySummary: '0 20 * * 0',              // Sunday 8 PM
  },

  // Thresholds
  thresholds: {
    auctionReadiness: 0.70,                    // 70% members must have points
    minPointsForAuction: 100,                  // Minimum points to participate
    inactiveDays: 14,                          // 14 days = inactive
    engagementWarning: 40,                     // <40/100 = at-risk
    milestonePoints: [500, 1000, 2000, 5000],  // Celebrate these milestones
  },

  // Feature flags
  features: {
    autoReminders: false,                      // Manual send only (Option C)
    tagHereInAdminLogs: true,                  // @here for important alerts
    celebrateMilestones: true,                 // Public milestone announcements
    showPositiveSummaries: true,               // Guild chat weekly summaries
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// PROACTIVE INTELLIGENCE CLASS
// ═══════════════════════════════════════════════════════════════════════════

class ProactiveIntelligence {
  constructor(client, config, intelligenceEngine) {
    this.client = client;
    this.config = config;
    this.intelligence = intelligenceEngine;

    // Scheduled tasks
    this.cronJobs = [];

    // State tracking
    this.lastChecks = {
      engagement: null,
      anomalies: null,
      milestones: new Set(), // Track already celebrated milestones
    };

    // Initialize
    this.initialized = false;
  }

  /**
   * Initialize proactive monitoring with scheduled tasks
   */
  async initialize() {
    if (this.initialized) return;

    console.log('🤖 [PROACTIVE] Initializing proactive intelligence system...');

    // Schedule engagement digest (Monday 9 AM Manila time)
    this.cronJobs.push(
      cron.schedule('0 9 * * 1', () => this.sendEngagementDigest(), {
        timezone: 'Asia/Manila'
      })
    );

    // Schedule anomaly digest (Daily 6 PM Manila time)
    this.cronJobs.push(
      cron.schedule('0 18 * * *', () => this.sendAnomalyDigest(), {
        timezone: 'Asia/Manila'
      })
    );

    // Schedule weekly positive summary (Sunday 8 PM Manila time)
    this.cronJobs.push(
      cron.schedule('0 20 * * 0', () => this.sendWeeklySummary(), {
        timezone: 'Asia/Manila'
      })
    );

    // Schedule pre-auction check (Saturday 10 AM Manila time - 2h before auction)
    this.cronJobs.push(
      cron.schedule('0 10 * * 6', () => this.checkAuctionReadiness(), {
        timezone: 'Asia/Manila'
      })
    );

    // Check for milestones every hour
    this.cronJobs.push(
      cron.schedule('0 * * * *', () => this.checkMilestones(), {
        timezone: 'Asia/Manila'
      })
    );

    this.initialized = true;
    console.log('✅ [PROACTIVE] Scheduled 5 monitoring tasks');
  }

  /**
   * Stop all scheduled tasks
   */
  stop() {
    this.cronJobs.forEach(job => job.stop());
    console.log('⏹️ [PROACTIVE] Stopped all monitoring tasks');
  }

  // ═════════════════════════════════════════════════════════════════════════
  // PRE-AUCTION READINESS CHECK
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * Check if guild is ready for scheduled auction (Saturday 12 PM)
   * Sends alert to admin logs if readiness is low
   */
  async checkAuctionReadiness() {
    try {
      console.log('🤖 [PROACTIVE] Checking auction readiness...');

      const sheetAPI = require('./utils/sheet-api');
      const biddingData = await sheetAPI.getBiddingPoints();

      if (!biddingData || biddingData.length === 0) {
        console.log('⚠️ [PROACTIVE] No bidding data available');
        return;
      }

      // Calculate readiness
      const totalMembers = biddingData.length;
      const readyMembers = biddingData.filter(m =>
        m.pointsLeft >= PROACTIVE_CONFIG.thresholds.minPointsForAuction
      ).length;

      const readinessRate = readyMembers / totalMembers;
      const readinessPercent = (readinessRate * 100).toFixed(0);

      // Get admin logs channel
      const adminLogsChannel = await getChannelById(
        this.client,
        this.config[PROACTIVE_CONFIG.channels.adminLogs]
      );

      if (!adminLogsChannel) {
        console.error('❌ [PROACTIVE] Admin logs channel not found');
        return;
      }

      // Determine alert level
      const isReady = readinessRate >= PROACTIVE_CONFIG.thresholds.auctionReadiness;
      const tagHere = PROACTIVE_CONFIG.features.tagHereInAdminLogs && !isReady;

      const embed = new EmbedBuilder()
        .setColor(isReady ? 0x00ff00 : 0xff9900)
        .setTitle(`${isReady ? '✅' : '⚠️'} Pre-Auction Readiness Check`)
        .setDescription(
          `**Auction scheduled in 2 hours** (Saturday 12:00 PM GMT+8)\n\n` +
          `${isReady
            ? '✅ **Guild is ready for auction!**'
            : '⚠️ **Low readiness - consider postponing or adjusting**'
          }`
        )
        .addFields(
          {
            name: '📊 Readiness Statistics',
            value:
              `Ready Members: **${readyMembers}** / ${totalMembers} (${readinessPercent}%)\n` +
              `Threshold: ${(PROACTIVE_CONFIG.thresholds.auctionReadiness * 100).toFixed(0)}%\n` +
              `Min Points Required: ${PROACTIVE_CONFIG.thresholds.minPointsForAuction}pts`,
            inline: false,
          }
        )
        .setFooter({ text: 'Powered by AI • Proactive Intelligence System' })
        .setTimestamp();

      // Add recommendations if not ready
      if (!isReady) {
        const notReadyMembers = biddingData.filter(m =>
          m.pointsLeft < PROACTIVE_CONFIG.thresholds.minPointsForAuction
        );

        const recommendations = [];
        recommendations.push(`💡 **${totalMembers - readyMembers} members** have <${PROACTIVE_CONFIG.thresholds.minPointsForAuction} points`);

        if (readinessRate < 0.5) {
          recommendations.push('🚨 **Critical**: <50% ready - strongly recommend postponing');
        } else if (readinessRate < 0.7) {
          recommendations.push('⚠️ **Warning**: Consider postponing or reducing starting bids');
        }

        recommendations.push(`📋 Low-point members: ${notReadyMembers.slice(0, 5).map(m => m.username).join(', ')}${notReadyMembers.length > 5 ? ` +${notReadyMembers.length - 5} more` : ''}`);

        embed.addFields({
          name: '💡 Recommendations',
          value: recommendations.join('\n'),
          inline: false,
        });
      }

      // Send alert
      const message = tagHere ? '@here' : '';
      await adminLogsChannel.send({
        content: message,
        embeds: [embed],
      });

      console.log(`✅ [PROACTIVE] Auction readiness check sent: ${readinessPercent}% ready`);

    } catch (error) {
      console.error('[PROACTIVE] Error checking auction readiness:', error);
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  // ENGAGEMENT MONITORING
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * Send weekly engagement digest to admin logs (Monday 9 AM)
   * Reports at-risk members and suggests actions
   */
  async sendEngagementDigest() {
    try {
      console.log('🤖 [PROACTIVE] Generating engagement digest...');

      // Get engagement analysis
      const analysis = await this.intelligence.analyzeAllMembersEngagement();

      if (analysis.error) {
        console.error('[PROACTIVE] Error analyzing engagement:', analysis.error);
        return;
      }

      const { total, active, atRisk, needsAttention, averageEngagement } = analysis;

      // Get admin logs channel
      const adminLogsChannel = await getChannelById(
        this.client,
        this.config[PROACTIVE_CONFIG.channels.adminLogs]
      );

      if (!adminLogsChannel) {
        console.error('❌ [PROACTIVE] Admin logs channel not found');
        return;
      }

      // Create embed
      const tagHere = PROACTIVE_CONFIG.features.tagHereInAdminLogs && atRisk > 5;

      const embed = new EmbedBuilder()
        .setColor(averageEngagement >= 70 ? 0x00ff00 : averageEngagement >= 50 ? 0xffff00 : 0xff9900)
        .setTitle('📊 Weekly Engagement Digest')
        .setDescription(`Guild engagement analysis for the week`)
        .addFields(
          {
            name: '📈 Overview',
            value:
              `Average Engagement: **${averageEngagement}/100**\n` +
              `Total Members: **${total}**\n` +
              `Active: **${active}** (${((active/total)*100).toFixed(0)}%)\n` +
              `At Risk: **${atRisk}** (${((atRisk/total)*100).toFixed(0)}%)`,
            inline: false,
          }
        )
        .setFooter({ text: 'Powered by AI • Weekly Digest' })
        .setTimestamp();

      // Add at-risk members if any
      if (needsAttention.length > 0) {
        const atRiskList = needsAttention
          .slice(0, 10)
          .map((m, i) => `${i + 1}. **${m.username}** (${m.engagementScore}/100)\n   └ ${m.recommendations[0]}`)
          .join('\n');

        embed.addFields({
          name: `⚠️ Members Needing Attention (${needsAttention.length})`,
          value: atRiskList + (needsAttention.length > 10 ? `\n\n*+${needsAttention.length - 10} more*` : ''),
          inline: false,
        });

        embed.addFields({
          name: '💡 Suggested Actions',
          value:
            `• Use \`!engagement <username>\` for detailed member analysis\n` +
            `• Consider sending personalized reminders to at-risk members\n` +
            `• Review why members are disengaging (too difficult? not enough rewards?)`,
          inline: false,
        });
      }

      // Send digest
      const message = tagHere ? '@here' : '';
      await adminLogsChannel.send({
        content: message,
        embeds: [embed],
      });

      this.lastChecks.engagement = Date.now();
      console.log(`✅ [PROACTIVE] Engagement digest sent: ${atRisk} at-risk members`);

    } catch (error) {
      console.error('[PROACTIVE] Error sending engagement digest:', error);
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  // ANOMALY MONITORING
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * Send daily anomaly digest to admin logs (6 PM)
   * Reports suspicious patterns and fraud detection
   */
  async sendAnomalyDigest() {
    try {
      console.log('🤖 [PROACTIVE] Generating anomaly digest...');

      // Get anomaly detection results
      const [biddingAnomalies, attendanceAnomalies] = await Promise.all([
        this.intelligence.detectBiddingAnomalies(),
        this.intelligence.detectAttendanceAnomalies(),
      ]);

      if (biddingAnomalies.error || attendanceAnomalies.error) {
        console.error('[PROACTIVE] Error detecting anomalies');
        return;
      }

      const totalAnomalies = biddingAnomalies.anomaliesDetected + attendanceAnomalies.anomaliesDetected;

      // Only send if anomalies found
      if (totalAnomalies === 0) {
        console.log('✅ [PROACTIVE] No anomalies detected today');
        return;
      }

      // Get admin logs channel
      const adminLogsChannel = await getChannelById(
        this.client,
        this.config[PROACTIVE_CONFIG.channels.adminLogs]
      );

      if (!adminLogsChannel) {
        console.error('❌ [PROACTIVE] Admin logs channel not found');
        return;
      }

      const tagHere = PROACTIVE_CONFIG.features.tagHereInAdminLogs;

      const embed = new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle('🔍 Daily Anomaly Digest')
        .setDescription(`⚠️ **${totalAnomalies} anomalies detected** - Review recommended.`)
        .addFields(
          {
            name: '📊 Summary',
            value:
              `Bidding Anomalies: **${biddingAnomalies.anomaliesDetected}**\n` +
              `Attendance Anomalies: **${attendanceAnomalies.anomaliesDetected}**\n` +
              `Auctions Analyzed: ${biddingAnomalies.analyzed}\n` +
              `Members Analyzed: ${attendanceAnomalies.analyzed}`,
            inline: false,
          }
        )
        .setFooter({ text: 'Powered by AI • Daily Anomaly Scan' })
        .setTimestamp();

      // Add bidding anomalies
      if (biddingAnomalies.anomaliesDetected > 0) {
        const biddingDetails = biddingAnomalies.anomalies
          .slice(0, 3)
          .map((a) => `• **${a.type}** (${a.severity})\n  └ ${a.recommendation}`)
          .join('\n');

        embed.addFields({
          name: '💰 Bidding Anomalies',
          value: biddingDetails + (biddingAnomalies.anomaliesDetected > 3 ? `\n\n*+${biddingAnomalies.anomaliesDetected - 3} more*` : ''),
          inline: false,
        });
      }

      // Add attendance anomalies
      if (attendanceAnomalies.anomaliesDetected > 0) {
        const attendanceDetails = attendanceAnomalies.anomalies
          .slice(0, 3)
          .map((a) => `• **${a.username}** (${a.deviation})\n  └ ${a.recommendation}`)
          .join('\n');

        embed.addFields({
          name: '📊 Attendance Anomalies',
          value: attendanceDetails + (attendanceAnomalies.anomaliesDetected > 3 ? `\n\n*+${attendanceAnomalies.anomaliesDetected - 3} more*` : ''),
          inline: false,
        });
      }

      embed.addFields({
        name: '💡 Recommended Actions',
        value:
          `• Use \`!detectanomalies\` for full detailed report\n` +
          `• Review flagged patterns for potential fraud\n` +
          `• Investigate statistical outliers`,
        inline: false,
      });

      // Send digest
      const message = tagHere ? '@here' : '';
      await adminLogsChannel.send({
        content: message,
        embeds: [embed],
      });

      this.lastChecks.anomalies = Date.now();
      console.log(`✅ [PROACTIVE] Anomaly digest sent: ${totalAnomalies} anomalies`);

    } catch (error) {
      console.error('[PROACTIVE] Error sending anomaly digest:', error);
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  // WEEKLY SUMMARY (POSITIVE)
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * Send weekly positive summary to guild chat (Sunday 8 PM)
   * Celebrates top performers and guild achievements
   */
  async sendWeeklySummary() {
    try {
      console.log('🤖 [PROACTIVE] Generating weekly summary...');

      // Get engagement analysis
      const analysis = await this.intelligence.analyzeAllMembersEngagement();

      if (analysis.error) {
        console.error('[PROACTIVE] Error analyzing engagement:', analysis.error);
        return;
      }

      const { topPerformers, averageEngagement } = analysis;

      // Get guild chat channel
      const guildChatChannel = await getChannelById(
        this.client,
        this.config[PROACTIVE_CONFIG.channels.guildChat]
      );

      if (!guildChatChannel) {
        console.error('❌ [PROACTIVE] Guild chat channel not found');
        return;
      }

      // Create motivational embed
      const embed = new EmbedBuilder()
        .setColor(0x9b59b6)
        .setTitle('🏆 Weekly Guild Summary')
        .setDescription(`Another great week for ELYSIUM! Here's what we achieved:`)
        .addFields(
          {
            name: '📊 Guild Performance',
            value: `Average Engagement: **${averageEngagement}/100**${averageEngagement >= 70 ? ' 🔥' : ''}`,
            inline: false,
          }
        )
        .setFooter({ text: 'Keep up the great work! 💪' })
        .setTimestamp();

      // Add top 5 performers
      if (topPerformers.length > 0) {
        const top5 = topPerformers
          .slice(0, 5)
          .map((m, i) => {
            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '⭐';
            return `${medal} **${m.username}** - ${m.engagementScore}/100`;
          })
          .join('\n');

        embed.addFields({
          name: '🌟 Top Performers This Week',
          value: top5,
          inline: false,
        });
      }

      // Motivational message
      let motivation = '';
      if (averageEngagement >= 80) {
        motivation = '🔥 **Outstanding!** Best performance yet! Keep this momentum going!';
      } else if (averageEngagement >= 70) {
        motivation = '✨ **Excellent work!** Guild is thriving!';
      } else if (averageEngagement >= 60) {
        motivation = '💪 **Good effort!** Let\'s aim even higher next week!';
      } else {
        motivation = '📈 **Keep improving!** Every small step counts!';
      }

      embed.addFields({
        name: '💬 Message',
        value: motivation,
        inline: false,
      });

      // Send summary
      await guildAnnouncementChannel.send({ embeds: [embed] });

      console.log(`✅ [PROACTIVE] Weekly summary sent to guild announcement`);

    } catch (error) {
      console.error('[PROACTIVE] Error sending weekly summary:', error);
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  // MILESTONE DETECTION
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * Check for member milestones (500pts, 1000pts, etc.) and celebrate
   * Runs every hour to detect new milestones
   */
  async checkMilestones() {
    try {
      if (!PROACTIVE_CONFIG.features.celebrateMilestones) return;

      console.log('🤖 [PROACTIVE] Checking for milestones...');

      const sheetAPI = require('./utils/sheet-api');
      const attendanceData = await sheetAPI.getTotalAttendance();

      if (!attendanceData || attendanceData.length === 0) return;

      // Get guild announcement channel
      const guildAnnouncementChannel = await getChannelById(
        this.client,
        this.config[PROACTIVE_CONFIG.channels.guildAnnouncement]
      );

      if (!guildAnnouncementChannel) {
        console.error('❌ [PROACTIVE] Guild announcement channel not found');
        return;
      }

      // Check each member for milestones
      for (const member of attendanceData) {
        const totalPoints = member.totalPoints || 0;

        // Check if member crossed any milestone
        for (const milestone of PROACTIVE_CONFIG.thresholds.milestonePoints) {
          const milestoneKey = `${member.username}-${milestone}`;

          // If already celebrated, skip
          if (this.lastChecks.milestones.has(milestoneKey)) continue;

          // If member has reached milestone
          if (totalPoints >= milestone) {
            // Celebrate!
            const embed = new EmbedBuilder()
              .setColor(0xffd700)
              .setTitle('🎉 Milestone Achievement!')
              .setDescription(
                `**${member.username}** has reached **${milestone} attendance points!**\n\n` +
                `${this.getMilestoneMessage(milestone)}`
              )
              .setFooter({ text: 'Keep up the amazing work! 🌟' })
              .setTimestamp();

            await guildAnnouncementChannel.send({ embeds: [embed] });

            // Mark as celebrated
            this.lastChecks.milestones.add(milestoneKey);

            console.log(`🎉 [PROACTIVE] Celebrated ${member.username} reaching ${milestone} points`);
          }
        }
      }

    } catch (error) {
      console.error('[PROACTIVE] Error checking milestones:', error);
    }
  }

  /**
   * Get motivational message for milestone
   */
  getMilestoneMessage(milestone) {
    const messages = {
      500: '🌟 Half-way to legend status!',
      1000: '🔥 1K club! Elite dedication!',
      2000: '⚡ 2K milestone! Unstoppable!',
      5000: '👑 5K LEGEND! Hall of Fame material!',
    };

    return messages[milestone] || `🎯 ${milestone} points milestone!`;
  }

  // ═════════════════════════════════════════════════════════════════════════
  // AUCTION INTELLIGENCE (REAL-TIME)
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * Provide real-time intelligence when auction item starts
   * Called by bidding/auctioneering modules
   */
  async provideAuctionIntelligence(itemName, auctionThread) {
    try {
      console.log(`🤖 [PROACTIVE] Analyzing auction item: ${itemName}`);

      // Get price prediction
      const prediction = await this.intelligence.predictItemValue(itemName);

      // Send simple suggestion in auction thread (public)
      if (prediction.success) {
        const { suggestedStartingBid, confidence } = prediction;

        const publicMessage =
          `💰 **AI Price Suggestion**: ${suggestedStartingBid} points ` +
          `(${confidence}% confidence)`;

        await auctionThread.send(publicMessage);
      }

      // Send detailed analysis to admin logs with @here
      const adminLogsChannel = await getChannelById(
        this.client,
        this.config[PROACTIVE_CONFIG.channels.adminLogs]
      );

      if (adminLogsChannel && prediction.success) {
        const { suggestedStartingBid, confidence, statistics, trend, reasoning } = prediction;

        const embed = new EmbedBuilder()
          .setColor(confidence >= 70 ? 0x00ff00 : 0xffff00)
          .setTitle(`📊 Auction Intelligence: ${itemName}`)
          .setDescription(`Detailed AI analysis for current auction item`)
          .addFields(
            {
              name: '🎯 Recommendation',
              value: `Starting Bid: **${suggestedStartingBid} points**\nConfidence: **${confidence}%**`,
              inline: false,
            },
            {
              name: '📈 Historical Data',
              value:
                `Auctions: ${statistics.historicalAuctions}\n` +
                `Average: ${statistics.averagePrice}pts\n` +
                `Median: ${statistics.medianPrice}pts\n` +
                `Range: ${statistics.priceRange.min}-${statistics.priceRange.max}pts`,
              inline: true,
            },
            {
              name: '📉 Trend Analysis',
              value:
                `Direction: ${trend.direction.toUpperCase()}\n` +
                `Change: ${trend.percentage > 0 ? '+' : ''}${trend.percentage}%`,
              inline: true,
            },
            {
              name: '🧠 AI Reasoning',
              value: reasoning,
              inline: false,
            }
          )
          .setFooter({ text: 'Real-time Auction Intelligence' })
          .setTimestamp();

        const message = PROACTIVE_CONFIG.features.tagHereInAdminLogs ? '@here' : '';
        await adminLogsChannel.send({
          content: message,
          embeds: [embed],
        });
      }

      console.log(`✅ [PROACTIVE] Auction intelligence provided for ${itemName}`);

    } catch (error) {
      console.error('[PROACTIVE] Error providing auction intelligence:', error);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = { ProactiveIntelligence, PROACTIVE_CONFIG };
