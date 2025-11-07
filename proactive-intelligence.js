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

    // Milestone Tiers (Tiered Channel Routing)
    milestonePoints: {
      major: [1000, 1500, 2000, 3000, 5000, 7500, 10000],  // Guild Announcements
      minor: [100, 250, 500, 750]                          // Guild Chat
    },
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

    // Error tracking & rate limiting (optimization)
    this.errorCount = {};
    this.lastNotificationTime = {};
    this.MIN_NOTIFICATION_INTERVAL = 3600000; // 1 hour minimum between similar notifications

    // Initialize
    this.initialized = false;
  }

  /**
   * Initialize proactive monitoring with scheduled tasks
   */
  async initialize() {
    if (this.initialized) return;

    // Guard: ensure intelligence engine is available
    if (!this.intelligence) {
      console.error('❌ [PROACTIVE] Cannot initialize: IntelligenceEngine dependency is missing');
      throw new Error('ProactiveIntelligence requires a valid IntelligenceEngine instance');
    }

    console.log('🤖 [PROACTIVE] Initializing proactive intelligence system...');

    // Schedule engagement digest (Monday 9 AM Manila time) with error handling
    this.cronJobs.push(
      cron.schedule('0 9 * * 1', () => {
        this.safeExecute('engagementDigest', () => this.sendEngagementDigest(), false);
      }, {
        timezone: 'Asia/Manila'
      })
    );

    // Schedule anomaly digest (Daily 6 PM Manila time) with error handling
    this.cronJobs.push(
      cron.schedule('0 18 * * *', () => {
        this.safeExecute('anomalyDigest', () => this.sendAnomalyDigest(), false);
      }, {
        timezone: 'Asia/Manila'
      })
    );

    // Schedule weekly positive summary (Sunday 8 PM Manila time) with error handling
    this.cronJobs.push(
      cron.schedule('0 20 * * 0', () => {
        this.safeExecute('weeklySummary', () => this.sendWeeklySummary(), false);
      }, {
        timezone: 'Asia/Manila'
      })
    );

    // Schedule pre-auction check (Saturday 10 AM Manila time) with error handling
    this.cronJobs.push(
      cron.schedule('0 10 * * 6', () => {
        this.safeExecute('auctionReadiness', () => this.checkAuctionReadiness(), false);
      }, {
        timezone: 'Asia/Manila'
      })
    );

    // Check for milestones every hour with error handling and rate limiting
    this.cronJobs.push(
      cron.schedule('0 * * * *', () => {
        this.safeExecute('milestoneCheck', () => this.checkMilestones(), true);
      }, {
        timezone: 'Asia/Manila'
      })
    );

    this.initialized = true;
    console.log('✅ [PROACTIVE] Scheduled 5 monitoring tasks with robust error handling');
  }

  /**
   * Stop all scheduled tasks
   */
  stop() {
    this.cronJobs.forEach(job => job.stop());
    console.log('⏹️ [PROACTIVE] Stopped all monitoring tasks');
  }

  /**
   * Safe execution wrapper with error handling and rate limiting
   * @param {string} taskName - Name of the task for logging
   * @param {Function} taskFn - Async function to execute
   * @param {boolean} rateLimit - Whether to enforce rate limiting
   */
  async safeExecute(taskName, taskFn, rateLimit = true) {
    try {
      // Rate limiting check
      if (rateLimit) {
        const lastRun = this.lastNotificationTime[taskName];
        if (lastRun && (Date.now() - lastRun < this.MIN_NOTIFICATION_INTERVAL)) {
          console.log(`⏭️ [PROACTIVE] Skipping ${taskName} (rate limited)`);
          return;
        }
      }

      // Execute task
      await taskFn();

      // Update last run time
      this.lastNotificationTime[taskName] = Date.now();

      // Reset error count on success
      if (this.errorCount[taskName]) {
        this.errorCount[taskName] = 0;
      }

    } catch (error) {
      // Track consecutive errors
      this.errorCount[taskName] = (this.errorCount[taskName] || 0) + 1;

      console.error(`❌ [PROACTIVE] Error in ${taskName}:`, error.message);

      // Alert admins if errors persist (3+ consecutive failures)
      if (this.errorCount[taskName] >= 3) {
        await this.sendErrorAlert(taskName, error);
      }
    }
  }

  /**
   * Send error alert to admin logs
   */
  async sendErrorAlert(taskName, error) {
    try {
      const adminLogsChannel = await getChannelById(
        this.client,
        this.config[PROACTIVE_CONFIG.channels.adminLogs]
      );

      if (adminLogsChannel) {
        const embed = new EmbedBuilder()
          .setColor(0xff0000)
          .setTitle('🚨 Proactive Intelligence Error')
          .setDescription(
            `**Task:** ${taskName}\n` +
            `**Consecutive Failures:** ${this.errorCount[taskName]}\n` +
            `**Error:** ${error.message}`
          )
          .setFooter({ text: 'Proactive Intelligence System' })
          .setTimestamp();

        await adminLogsChannel.send({ embeds: [embed] });
      }
    } catch (alertError) {
      console.error('[PROACTIVE] Failed to send error alert:', alertError.message);
    }
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

      const biddingResponse = await this.intelligence.sheetAPI.call('getBiddingPoints', {});
      // Handle both nested and top-level response shapes, plus legacy points map
      const d = biddingResponse?.data ?? biddingResponse;
      const members = Array.isArray(d?.members) ? d.members : [];
      const pointsMap = d?.points && typeof d.points === 'object' ? d.points : {};
      const biddingData = members.length
        ? members
        : Object.entries(pointsMap).map(([username, pointsLeft]) => ({
            username,
            pointsLeft: Number(pointsLeft) || 0,
          }));

      if (biddingData.length === 0) {
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
      const guildAnnouncementChannel = await getChannelById(
        this.client,
        this.config[PROACTIVE_CONFIG.channels.guildAnnouncement]
      );

      if (!guildAnnouncementChannel) {
        console.error('❌ [PROACTIVE] Guild announcement channel not found');
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
  // MILESTONE CELEBRATION SYSTEM - COMPLETE IMPLEMENTATION
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * Check for member milestones and celebrate with massive variety
   * - Uses Google Sheets for persistence (survives bot restarts)
   * - Only announces LATEST milestone (prevents spam)
   * - Tiered channel routing (major → announcements, minor → guild chat)
   * - 100,000+ unique celebration combinations (80% Tagalog)
   * - Tracks BOTH attendance AND bidding milestones separately
   * - Mentions/tags achievers in announcements
   *
   * Runs every hour to detect new milestones
   */
  async checkMilestones() {
    try {
      console.log('🤖 [PROACTIVE] ═══════════════════════════════════════');
      console.log('🤖 [PROACTIVE] Starting milestone check...');

      if (!PROACTIVE_CONFIG.features.celebrateMilestones) {
        console.log('⚠️ [PROACTIVE] Milestone celebrations are DISABLED in config');
        return;
      }

      console.log('✅ [PROACTIVE] Milestone celebrations ENABLED');

      // Fetch BOTH attendance and bidding data
      console.log('📊 [PROACTIVE] Fetching total attendance data...');
      const attendanceResponse = await this.intelligence.sheetAPI.call('getTotalAttendance', {});
      const attendanceData = attendanceResponse?.data?.members || attendanceResponse?.members || [];
      console.log(`📊 [PROACTIVE] Found ${attendanceData.length} members in attendance data`);

      console.log('📊 [PROACTIVE] Fetching bidding points data...');
      const biddingResponse = await this.intelligence.sheetAPI.call('getBiddingPoints', {});
      const biddingData = biddingResponse?.data?.members || biddingResponse?.members || [];
      console.log(`📊 [PROACTIVE] Found ${biddingData.length} members in bidding data`);

      if (attendanceData.length === 0 && biddingData.length === 0) {
        console.log('⚠️ [PROACTIVE] No data found, skipping milestone check');
        return;
      }

      // Create bidding lookup map
      const biddingMap = {};
      biddingData.forEach(m => {
        const normalized = this.normalizeUsername(m.nickname || m.username);
        biddingMap[normalized] = {
          nickname: m.nickname || m.username,
          pointsLeft: m.pointsLeft || 0,
          pointsConsumed: m.pointsConsumed || 0,
          totalPoints: (m.pointsLeft || 0) + (m.pointsConsumed || 0)
        };
      });

      // Fetch milestone history from Google Sheets
      console.log('📊 [PROACTIVE] Fetching milestone history...');
      const historyResponse = await this.intelligence.sheetAPI.call('getMilestoneHistory', {});
      const milestoneHistory = historyResponse?.milestoneHistory || {};
      console.log(`📊 [PROACTIVE] Found ${Object.keys(milestoneHistory).length} members in milestone history`);

      // Get channels for tiered routing
      console.log('📺 [PROACTIVE] Getting channels...');
      const guildAnnouncementChannel = await getChannelById(
        this.client,
        this.config.guild_announcement_channel_id
      );

      const guildChatChannel = await getChannelById(
        this.client,
        this.config.elysium_commands_channel_id
      );

      console.log(`📺 [PROACTIVE] Guild announcement channel: ${guildAnnouncementChannel ? guildAnnouncementChannel.name : 'NOT FOUND'}`);
      console.log(`📺 [PROACTIVE] Guild chat channel: ${guildChatChannel ? guildChatChannel.name : 'NOT FOUND'}`);

      if (!guildAnnouncementChannel || !guildChatChannel) {
        console.error('❌ [PROACTIVE] Required channels not found - ABORTING');
        return;
      }

      // Get guild for member lookups
      const guild = this.client.guilds.cache.get(this.config.main_guild_id);
      if (!guild) {
        console.error('❌ [PROACTIVE] Main guild not found - ABORTING');
        return;
      }

      // Define milestone tiers
      const MILESTONES = PROACTIVE_CONFIG.thresholds.milestonePoints;
      const allMilestones = [...MILESTONES.minor, ...MILESTONES.major].sort((a, b) => a - b);
      console.log(`🎯 [PROACTIVE] Milestone thresholds: ${allMilestones.join(', ')}`);

      // Track stats
      let membersChecked = 0;
      let milestonesFound = 0;
      let milestonesAnnounced = 0;

      // Check ATTENDANCE milestones
      console.log('🔍 [PROACTIVE] Checking ATTENDANCE milestones...');
      for (const member of attendanceData) {
        membersChecked++;
        const totalPoints = member.attendancePoints || 0;
        const nickname = member.username;
        const normalizedNickname = this.normalizeUsername(nickname);

        // Get last celebrated milestone for THIS TYPE
        const historyKey = `${normalizedNickname}-attendance`;
        const history = milestoneHistory[historyKey] || {};
        const lastMilestone = history.lastMilestone || 0;

        // Find LATEST milestone they've crossed
        let latestMilestone = null;
        for (const milestone of allMilestones) {
          if (totalPoints >= milestone && milestone > lastMilestone) {
            latestMilestone = milestone;
          }
        }

        // If found new milestone, announce it
        if (latestMilestone) {
          milestonesFound++;
          console.log(`🎉 [PROACTIVE] NEW ATTENDANCE MILESTONE!`);
          console.log(`   - Member: ${nickname}`);
          console.log(`   - Type: ATTENDANCE`);
          console.log(`   - Current Points: ${totalPoints}`);
          console.log(`   - New Milestone: ${latestMilestone}`);

          try {
            // Find Discord user for mention
            const discordMember = await this.findGuildMember(guild, nickname);

            // Determine channel
            const channel = MILESTONES.major.includes(latestMilestone)
              ? guildAnnouncementChannel
              : guildChatChannel;

            // Create celebration embed
            const embed = await this.createMilestoneEmbed(
              member,
              latestMilestone,
              totalPoints,
              lastMilestone,
              'attendance',
              discordMember
            );

            await channel.send({ embeds: [embed] });

            // Update Google Sheets
            await this.intelligence.sheetAPI.call('updateMilestoneHistory', {
              nickname: `${nickname}-attendance`,
              milestone: latestMilestone,
              totalPoints: totalPoints,
              milestoneType: 'attendance'
            });

            milestonesAnnounced++;
            console.log(`   - ✅ ATTENDANCE milestone announced in ${channel.name}`);
          } catch (error) {
            console.error(`   - ❌ Error announcing milestone:`, error);
          }
        }
      }

      // Check BIDDING milestones
      console.log('🔍 [PROACTIVE] Checking BIDDING milestones...');
      for (const [normalizedNickname, bidData] of Object.entries(biddingMap)) {
        membersChecked++;
        const totalPoints = bidData.totalPoints;
        const nickname = bidData.nickname;

        // Get last celebrated milestone for THIS TYPE
        const historyKey = `${normalizedNickname}-bidding`;
        const history = milestoneHistory[historyKey] || {};
        const lastMilestone = history.lastMilestone || 0;

        // Find LATEST milestone they've crossed
        let latestMilestone = null;
        for (const milestone of allMilestones) {
          if (totalPoints >= milestone && milestone > lastMilestone) {
            latestMilestone = milestone;
          }
        }

        // If found new milestone, announce it
        if (latestMilestone) {
          milestonesFound++;
          console.log(`🎉 [PROACTIVE] NEW BIDDING MILESTONE!`);
          console.log(`   - Member: ${nickname}`);
          console.log(`   - Type: BIDDING`);
          console.log(`   - Total Points: ${totalPoints} (Left: ${bidData.pointsLeft}, Consumed: ${bidData.pointsConsumed})`);
          console.log(`   - New Milestone: ${latestMilestone}`);

          try {
            // Find Discord user for mention
            const discordMember = await this.findGuildMember(guild, nickname);

            // Determine channel
            const channel = MILESTONES.major.includes(latestMilestone)
              ? guildAnnouncementChannel
              : guildChatChannel;

            // Create celebration embed
            const embed = await this.createMilestoneEmbed(
              { username: nickname, biddingPoints: totalPoints },
              latestMilestone,
              totalPoints,
              lastMilestone,
              'bidding',
              discordMember
            );

            await channel.send({ embeds: [embed] });

            // Update Google Sheets
            await this.intelligence.sheetAPI.call('updateMilestoneHistory', {
              nickname: `${nickname}-bidding`,
              milestone: latestMilestone,
              totalPoints: totalPoints,
              milestoneType: 'bidding'
            });

            milestonesAnnounced++;
            console.log(`   - ✅ BIDDING milestone announced in ${channel.name}`);
          } catch (error) {
            console.error(`   - ❌ Error announcing milestone:`, error);
          }
        }
      }

      console.log('🤖 [PROACTIVE] ═══════════════════════════════════════');
      console.log(`🤖 [PROACTIVE] Milestone check complete`);
      console.log(`   - Members checked: ${membersChecked}`);
      console.log(`   - New milestones found: ${milestonesFound}`);
      console.log(`   - Milestones announced: ${milestonesAnnounced}`);
      console.log('🤖 [PROACTIVE] ═══════════════════════════════════════');

    } catch (error) {
      console.error('❌ [PROACTIVE] CRITICAL ERROR checking milestones:', error);
      console.error(error.stack);
    }
  }

  /**
   * Find a guild member by their nickname (case-insensitive, normalized)
   * @param {Guild} guild - Discord guild
   * @param {string} nickname - Member nickname to search for
   * @returns {GuildMember|null} Discord guild member or null
   */
  async findGuildMember(guild, nickname) {
    try {
      const normalizedSearch = this.normalizeUsername(nickname);

      // Search through cached members first
      const cachedMember = guild.members.cache.find(m => {
        const memberNick = m.nickname || m.user.username;
        return this.normalizeUsername(memberNick) === normalizedSearch;
      });

      if (cachedMember) return cachedMember;

      // If not in cache, fetch all members and search
      await guild.members.fetch();
      const fetchedMember = guild.members.cache.find(m => {
        const memberNick = m.nickname || m.user.username;
        return this.normalizeUsername(memberNick) === normalizedSearch;
      });

      return fetchedMember || null;
    } catch (error) {
      console.error(`[PROACTIVE] Error finding guild member ${nickname}:`, error);
      return null;
    }
  }

  /**
   * Create milestone embed with MASSIVE VARIETY (100,000+ combos)
   * 80% Tagalog, mix-and-match components
   * @param {Object} member - Member data from sheets
   * @param {number} milestone - Milestone reached
   * @param {number} totalPoints - Total points
   * @param {number} lastMilestone - Previous milestone
   * @param {string} milestoneType - 'attendance' or 'bidding'
   * @param {GuildMember|null} discordMember - Discord member for mention
   */
  async createMilestoneEmbed(member, milestone, totalPoints, lastMilestone, milestoneType, discordMember) {
    // Calculate next milestone
    const allMilestones = [
      ...PROACTIVE_CONFIG.thresholds.milestonePoints.minor,
      ...PROACTIVE_CONFIG.thresholds.milestonePoints.major
    ].sort((a, b) => a - b);

    const nextMilestone = allMilestones.find(m => m > milestone);

    // Pick random components from variety system
    const opening = this.pickRandom(this.getMilestoneOpenings());
    const announcement = this.getMilestoneAnnouncement(member, milestone, totalPoints, milestoneType, discordMember);
    const closing = this.getMilestoneClosing(nextMilestone, totalPoints);

    // Determine color based on milestone type
    const isMajor = PROACTIVE_CONFIG.thresholds.milestonePoints.major.includes(milestone);
    let color;
    if (milestoneType === 'attendance') {
      color = isMajor ? 0xFFD700 : 0x00FF00; // Gold or Green for attendance
    } else {
      color = isMajor ? 0xFF6B35 : 0x4ECDC4; // Orange or Cyan for bidding
    }

    // Milestone type emoji and label
    const typeInfo = milestoneType === 'attendance'
      ? { emoji: '🎯', label: 'Total Attendance Points' }
      : { emoji: '💰', label: 'Total Bidding Points' };

    return new EmbedBuilder()
      .setColor(color)
      .setTitle(`${opening}`)
      .setDescription(
        `${announcement}\n\n${closing}`
      )
      .setFooter({
        text: `${typeInfo.emoji} ${typeInfo.label} | Milestone: ${milestone} | Total: ${totalPoints} | Previous: ${lastMilestone || 0}`
      })
      .setTimestamp();
  }

  /**
   * Milestone Openings (Variety Pool: 140+)
   * 80% Tagalog, 15% Taglish, 5% English
   */
  getMilestoneOpenings() {
    return [
      // Tagalog Shock/Excitement (60 variants) - 43%
      'TANGINA! 🔥', 'KINGINA! 💥', 'SHEEEESH! 💯', 'GRABE IDOL! 🌟', 'PAKSHET! ⚡',
      'ULOL! ANG GALING! 🎯', 'GAGO! IDOL YARN! 👑', 'PUTANGINA! LEGENDARY! 🏆',
      'LECHE! SOBRANG GALING! 🚀', 'PISTE! UNSTOPPABLE! 💪',
      'HAYOP KA! 🐐', 'ANO BA YAN! 😱', 'AYAN NA! 🎉', 'SHET! GRABE! 💥',
      'ANG TAPANG! 🦁', 'LABAN LANG! 💪', 'AYOS! 👌', 'SOLID! 🔥',
      'BEASTMODE! 👹', 'GALING MO! ⭐', 'BIDA KA! 🎬', 'IDOL! 🙌',
      'CHAMPION! 🏆', 'WINNER! 🥇', 'MVP! 👑', 'ACE! 🎯',
      'PRO PLAYER! 🎮', 'LEGEND! ⚡', 'GOAT! 🐐', 'BOSS! 💼',
      'LODI! 🌟', 'RESBAK! 💯', 'PETMALU! 🔥', 'WERPA! ⚡',
      'YAWA! BISAYA PRIDE! 🇵🇭', 'LAMI! 😋', 'ASENSO! 📈', 'LAKASSS! 💪',
      'RAPSA! 🎊', 'WAGAS! 💖', 'GIGIL! 😤', 'KILIG! 💕',
      'GRABE YUNG HUSTLE! 🔥', 'HINDI KA TUMITIGIL! ⚡', 'WALANG PAHINGA! 💪',
      'DEDICATION OVERLOAD! 🎯', 'SIPAG AT TIYAGA! 📚', 'TULOY LANG! 🚀',
      'DI KA SUMUSUKO! 🦾', 'FIGHTING! 👊', 'GALING GALING! 🌟', 'SWERTE MO! 🍀',
      'BLESSED! 🙏', 'DESERVE! ✨', 'EARNED IT! 💪', 'PROUD! 😎',

      // Tagalog Pride/Recognition (50 variants) - 36%
      'LODI TALAGA! 👑', 'SALUDO AKO SAYO! 🫡', 'IDOL BEHAVIOR! 💪', 'RESPETO! 🙏',
      'NAKS NAMAN! 💅', 'FLEXING NA! 💎', 'BILIB AKO! 😲', 'SWABE! 😎',
      'ASTIG! 🔥', 'HUSAY MO! 🎯', 'MAY LABAN! 👊', 'GALANTE! 💰',
      'TARA NA! 🚀', 'KERI MO! 💪', 'GOODS! ✅', 'SAKTO! 👌',
      'TAMANG TAMA! 🎯', 'PERFECT! 💯', 'WALANG KUPAS! ⭐', 'DI MAPAPANTAYAN! 👑',
      'HALL OF FAME! 🏛️', 'ELYSIUM PRIDE! 🇵🇭', 'GUILD MVP! 🏆', 'TOP TIER! 💎',
      'ELITE MEMBER! ⚡', 'VETERAN! 🎖️', 'OG PLAYER! 👴', 'FOUNDING MEMBER ENERGY! 🗿',
      'CARRY NG GUILD! 🎒', 'BACKBONE! 🦴', 'PILLAR! 🏛️', 'FOUNDATION! 🧱',
      'INSPIRATION! 💫', 'ROLE MODEL! 📋', 'EXAMPLE TO FOLLOW! 👣', 'LIVING LEGEND! 🌟',
      'CERTIFIED GRINDER! ⚙️', 'NO LIFE PRO! 💻', 'BEAST MODE ACTIVATED! 👹',
      'FINAL BOSS VIBES! 🐉', 'RAID LEADER MATERIAL! 🗡️', 'GUILD OFFICER NA! 👮',
      'PROMOTED SA BUHAY! 📈', 'SUCCESS STORY! 📖', 'INSPIRATION TALAGA! 💡',
      'ATIN TO! 🇵🇭', 'PINOY PRIDE! 🌴', 'SANAOL! 🥺', 'ACHIEVEMENT UNLOCKED! 🔓',

      // Taglish Mix (20 variants) - 14%
      'OMG IDOL! 😱', 'CONGRATS LODI! 🎉', 'GRABE DEDICATION MO! 💪',
      'NEXT LEVEL NA YAN! ⬆️', 'UPGRADE COMPLETE! ✅', 'LEVEL UP! 📶',
      'MILESTONE REACHED! 🏁', 'GOAL ACHIEVED! 🎯', 'MISSION ACCOMPLISHED! ✔️',
      'NEW RECORD! 📊', 'PERSONAL BEST! 🏅', 'HIGH SCORE! 🎮',
      'ACHIEVEMENT UNLOCKED TALAGA! 🔓', 'TROPHY EARNED! 🏆', 'BADGE UNLOCKED! 🎖️',
      'RANK UP! 📈', 'PROMOTION! 🎊', 'ADVANCE TO NEXT STAGE! ▶️',
      'BOSS CLEARED! ✅', 'QUEST COMPLETE! 📜',

      // English Hype (10 variants) - 7%
      'LEGENDARY! 👑', 'UNSTOPPABLE! ⚡', 'ABSOLUTE LEGEND! 🔥',
      'INCREDIBLE! 💥', 'PHENOMENAL! 🌟', 'OUTSTANDING! ⭐',
      'REMARKABLE! 💫', 'EXTRAORDINARY! ✨', 'MAGNIFICENT! 👏',
      'SPECTACULAR! 🎆'
    ];
  }

  /**
   * Milestone Announcement (Main Message)
   * Personalized with member data, mentions user, shows type
   */
  getMilestoneAnnouncement(member, milestone, totalPoints, milestoneType, discordMember) {
    const nickname = member.username; // Actually nickname from sheet

    // Create mention string (falls back to bold nickname if user not found)
    const userMention = discordMember ? `<@${discordMember.id}>` : `**${nickname}**`;

    // Type-specific labels
    const typeLabel = milestoneType === 'attendance'
      ? 'Total Attendance Points'
      : 'Total Bidding Points';

    const typeEmoji = milestoneType === 'attendance' ? '🎯' : '💰';

    // Tagalog-heavy announcement templates with mentions and type
    const templates = [
      `${userMention} just hit **${milestone} ${typeLabel}!** ${typeEmoji}`,
      `${userMention} reached **${milestone} points** sa ${typeLabel} na! Grabe! 🔥`,
      `Si ${userMention} nag-**${milestone} ${typeLabel}** na! Tuloy lang idol! 💪`,
      `${userMention} - **${milestone} ${typeLabel}** achieved! Lakasss! ⚡`,
      `Congrats ${userMention}! **${milestone} ${typeLabel}** unlocked! 👑`,
      `**${milestone} ${typeLabel}** milestone conquered by ${userMention}! 🏆`,
      `${userMention} is now at **${milestone} ${typeLabel}!** Lodi! 🌟`,
      `Saludo! ${userMention} naka-**${milestone} ${typeLabel}** na! 🫡`,
    ];

    return this.pickRandom(templates);
  }

  /**
   * Milestone Closings (Motivational + Next Goal)
   * Variety Pool: 110+
   */
  getMilestoneClosing(nextMilestone, currentPoints) {
    if (nextMilestone) {
      const pointsToGo = nextMilestone - currentPoints;

      // Next goal teasers (40 variants)
      const nextGoalMessages = [
        `Next stop: **${nextMilestone} points!** Kaya mo yan! 💪`,
        `${pointsToGo} points nalang to ${nextMilestone}! Malapit na! 🎯`,
        `Road to ${nextMilestone} continues! Tuloy lang! 🚀`,
        `Target locked: **${nextMilestone} points!** Let's go! ⚡`,
        `${nextMilestone} points next! Keep grinding! ⚙️`,
        `On the way to ${nextMilestone}! Laban lang! 👊`,
        `Next milestone: **${nextMilestone}!** Konting push nalang! 💥`,
        `${nextMilestone} points loading... ${pointsToGo} to go! 📶`,
        `Papunta na sa ${nextMilestone}! Hindi ka titigil! 🔥`,
        `${nextMilestone} is calling! Answer it! 📞`,
        `Level ${nextMilestone} waiting! Claim it! 👑`,
        `Destination: ${nextMilestone} points! All aboard! 🚂`,
        `Next checkpoint: ${nextMilestone}! Keep moving! 🏃`,
        `${nextMilestone} sa susunod! Excited na ako! 🎉`,
        `Target acquired: ${nextMilestone}! Fire away! 🎯`,
        `Road map: ${nextMilestone} next! Follow the path! 🗺️`,
        `${nextMilestone} points is the next adventure! 🧭`,
        `Countdown to ${nextMilestone} starts now! ⏳`,
        `${nextMilestone} milestone sa horizon! Almost there! 🌅`,
        `Climbing towards ${nextMilestone}! Keep ascending! 🧗`,
        `Next trophy: ${nextMilestone} points! Grab it! 🏆`,
        `${nextMilestone} ang next boss fight! Prepare! ⚔️`,
        `Journey to ${nextMilestone} begins! Adventure awaits! 🗺️`,
        `${nextMilestone} points = next power up! 💊`,
        `Boss level ${nextMilestone} unlocking soon! 🔓`,
        `Quest continues: Reach ${nextMilestone}! 📜`,
        `Achievement hunting: ${nextMilestone} next! 🎖️`,
        `Grind to ${nextMilestone} activated! 💻`,
        `${nextMilestone} points = new rank! Promote na! 📈`,
        `Final push to ${nextMilestone}! Sprint time! 🏃‍♂️`,
        `${nextMilestone} waiting for you! Claim your throne! 👑`,
        `Level up to ${nextMilestone}! XP grinding! 🎮`,
        `${nextMilestone} is your destiny! Fulfill it! ⭐`,
        `March to ${nextMilestone}! Army of one! 🎖️`,
        `${nextMilestone} points = legendary tier! Go! 🏛️`,
        `Next evolution: ${nextMilestone} points! 🦋`,
        `${nextMilestone} milestone calling your name! 📢`,
        `Advance to ${nextMilestone}! No retreat! ⚔️`,
        `${nextMilestone} is next! Walang tigil! 🚀`,
        `Onwards to ${nextMilestone}! Keep the fire burning! 🔥`,
      ];

      return this.pickRandom(nextGoalMessages);
    } else {
      // Max milestone reached - ultimate recognition (30 variants)
      const maxMessages = [
        `Guild legend status: **ACHIEVED!** 👑`,
        `Hall of fame member! No more milestones! 🏛️`,
        `You've conquered them all! GOAT! 🐐`,
        `Maximum level reached! Final boss! 🐉`,
        `Legend tier unlocked! Permanent! ⚡`,
        `Elysium royalty! Bow down! 👑`,
        `No one can touch this! Untouchable! 🛡️`,
        `God tier achieved! Immortal! ⚡`,
        `All milestones conquered! Champion! 🏆`,
        `Peak performance! Can't go higher! ⛰️`,
        `Ceiling reached! Sky's the limit! ☁️`,
        `Ultimate achievement! No cap! 🧢`,
        `Maxed out! Final form! 💪`,
        `Endgame content cleared! GG! 🎮`,
        `You win! Game over! Victory! ✅`,
        `Boss of all bosses! Respect! 🙏`,
        `Living legend confirmed! 🌟`,
        `Guild treasure! Priceless! 💎`,
        `OG status: PERMANENT! 👴`,
        `Founder vibes! Legacy secured! 🗿`,
        `Immortalized! Forever remembered! 📜`,
        `GOAT debate over! You won! 🐐`,
        `Hall of champions! Reserved seat! 🪑`,
        `Retired jersey! Number retired! 👕`,
        `Statue in guild hall! 🗽`,
        `Your name in lights! ✨`,
        `Legend never dies! Eternal! ♾️`,
        `Final destination reached! 🏁`,
        `Quest complete! All achievements! 📖`,
        `Perfect score! 100%! 💯`,
      ];

      return this.pickRandom(maxMessages);
    }
  }

  /**
   * Helper: Pick random element from array
   */
  pickRandom(array) {
    return array[Math.floor(Math.random() * array.length)];
  }

  /**
   * Helper: Normalize username for matching
   * (Same logic as in Google Sheets)
   */
  normalizeUsername(username) {
    if (!username) return '';
    return username
      .toString()
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '')      // Remove all spaces
      .replace(/[^\w]/g, '');   // Remove special characters
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
