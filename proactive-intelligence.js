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

    // Milestone Tiers - SEPARATE for Attendance vs Bidding
    // Attendance: 1 point per boss spawn
    // Bidding: Attendance × Boss Point Value (actual boss points: 1-3, average ~1.5-2)
    milestonePoints: {
      attendance: {
        major: [1000, 1500, 2000, 3000, 5000, 7500, 10000],  // Guild Announcements
        minor: [100, 250, 500, 750]                          // Guild Chat
      },
      bidding: {
        // Roughly 2x attendance (boss points: 1pt=15 bosses, 2pt=10 bosses, 3pt=8 bosses, avg ~1.5-2x)
        major: [2000, 3000, 4000, 6000, 10000, 15000, 20000],  // Guild Announcements
        minor: [200, 500, 1000, 1500]                           // Guild Chat
      },

      // NEW: Engagement Score Milestones (AI-calculated 0-100)
      engagement: {
        major: [85, 90, 95, 100],                // Guild Announcements
        minor: [60, 70, 80]                      // Guild Chat
      },

      // NEW: Guild-Wide Collective Milestones
      guildWide: {
        totalAttendance: [10000, 25000, 50000, 100000],
        totalBidding: [15000, 30000, 60000, 120000],
        activeMembers: [20, 30, 40, 45, 50]
      },

      // NEW: Streak Milestones
      consecutiveSpawnStreak: {
        major: [75, 100, 150, 200],              // Guild Announcements
        minor: [10, 25, 50]                      // Guild Chat
      },

      calendarDayStreak: {                       // 5+ spawns per day
        major: [45, 60, 90, 180],                // Guild Announcements
        minor: [7, 14, 21, 30]                   // Guild Chat
      },

      // NEW: Perfect Attendance Week (100% spawns in week)
      perfectWeek: {
        major: [10, 20, 30],                     // Guild Announcements
        minor: [1, 3, 5]                         // Guild Chat
      },

      // NEW: Loyalty/Tenure Milestones (days as member)
      tenure: {
        major: [365, 730, 1095],                 // Guild Announcements (1, 2, 3 years)
        minor: [30, 60, 90, 180]                 // Guild Chat
      }
    },
  },

  // Feature flags
  features: {
    autoReminders: false,                      // Manual send only (Option C)
    tagHereInAdminLogs: true,                  // @here for important alerts
    celebrateMilestones: false,                // DISABLED: Public milestone announcements (causing API timeouts)
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

    // NEW: Milestone batching queue (announced daily at 3:01 AM)
    this.milestoneQueue = {
      attendance: [],
      bidding: [],
      engagement: [],
      guildWide: [],
      spawnStreak: [],
      calendarStreak: [],
      tenure: [],
      perfectWeek: []
    };

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

    // Skip milestone initialization if milestones are disabled
    if (PROACTIVE_CONFIG.features.celebrateMilestones) {
      // Ensure milestone tabs exist in Google Sheets
      await this.ensureMilestoneTabsExist();

      // Load milestone queue from Google Sheets (survive bot restarts)
      try {
        console.log('📥 [PROACTIVE] Loading milestone queue from Google Sheets...');
        const response = await this.intelligence.sheetAPI.call('loadMilestoneQueue', {});
        if (response && response.milestoneQueue) {
          this.milestoneQueue = response.milestoneQueue;
          const totalLoaded = Object.values(this.milestoneQueue).reduce((sum, arr) => sum + arr.length, 0);
          console.log(`✅ [PROACTIVE] Loaded ${totalLoaded} queued milestones from Google Sheets`);
          if (totalLoaded > 0) {
            console.log('📌 [PROACTIVE] Queue contents:');
            for (const [type, items] of Object.entries(this.milestoneQueue)) {
              if (items.length > 0) {
                console.log(`   - ${type}: ${items.length} milestone(s)`);
              }
            }
          }
        }
      } catch (error) {
        console.error('⚠️ [PROACTIVE] Failed to load milestone queue from Google Sheets:', error.message);
        console.log('   Starting with empty queue');
      }
    } else {
      console.log('ℹ️ [PROACTIVE] Milestones disabled - skipping milestone initialization');
    }

    // ═══════════════════════════════════════════════════════════════
    // UNIFIED SCHEDULE: Daily 3:01 AM - Batch Announcements & Checks
    // ═══════════════════════════════════════════════════════════════
    this.cronJobs.push(
      cron.schedule('1 3 * * *', () => {
        this.safeExecute('dailyBatch', async () => {
          // 1. Announce all queued milestones from previous day
          await this.announceMilestoneBatch();

          // 2. Check calendar day streaks (5+ spawns yesterday)
          await this.checkCalendarDayStreaks();

          // 3. Check tenure milestones
          await this.checkTenureMilestones();

          // 4. Send anomaly digest (moved from 6 PM)
          await this.sendAnomalyDigest();
        }, false);
      }, {
        timezone: 'Asia/Manila'
      })
    );

    // ═══════════════════════════════════════════════════════════════
    // Monday 3:01 AM - Weekly Engagement Digest (moved from 9 AM)
    // ═══════════════════════════════════════════════════════════════
    this.cronJobs.push(
      cron.schedule('1 3 * * 1', () => {
        this.safeExecute('engagementDigest', () => this.sendEngagementDigest(), false);
      }, {
        timezone: 'Asia/Manila'
      })
    );

    // ═══════════════════════════════════════════════════════════════
    // Saturday 10:00 AM - Pre-Auction Readiness Check (auction-specific)
    // ═══════════════════════════════════════════════════════════════
    this.cronJobs.push(
      cron.schedule('0 10 * * 6', () => {
        this.safeExecute('auctionReadiness', () => this.checkAuctionReadiness(), false);
      }, {
        timezone: 'Asia/Manila'
      })
    );

    // ═══════════════════════════════════════════════════════════════
    // Sunday 8:00 PM - Weekly Summary with Milestone Recap
    // ═══════════════════════════════════════════════════════════════
    this.cronJobs.push(
      cron.schedule('0 20 * * 0', () => {
        this.safeExecute('weeklySummary', () => this.sendWeeklySummary(), false);
      }, {
        timezone: 'Asia/Manila'
      })
    );

    // ═══════════════════════════════════════════════════════════════
    // Sunday 11:59 PM - Perfect Attendance Week Check
    // ═══════════════════════════════════════════════════════════════
    this.cronJobs.push(
      cron.schedule('59 23 * * 0', () => {
        this.safeExecute('perfectWeekCheck', () => this.checkPerfectAttendanceWeek(), false);
      }, {
        timezone: 'Asia/Manila'
      })
    );

    // ═══════════════════════════════════════════════════════════════
    // Hourly - Milestone Detection (QUEUE ONLY, NO ANNOUNCEMENTS)
    // ═══════════════════════════════════════════════════════════════
    this.cronJobs.push(
      cron.schedule('0 * * * *', () => {
        this.safeExecute('milestoneDetection', async () => {
          // Check all milestone types and ADD TO QUEUE
          await this.detectAllMilestones();
        }, true);
      }, {
        timezone: 'Asia/Manila'
      })
    );

    this.initialized = true;
    console.log('✅ [PROACTIVE] Scheduled 6 unified monitoring tasks');
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

      // ═══════════════════════════════════════════════════════════════
      // NEW: Add milestone recap section (skip if milestones disabled)
      // ═══════════════════════════════════════════════════════════════
      if (PROACTIVE_CONFIG.features.celebrateMilestones) {
        try {
          const weeklyMilestonesResponse = await this.intelligence.sheetAPI.call('getWeeklyMilestones', {});
          const weeklyMilestones = weeklyMilestonesResponse?.data || [];

          if (weeklyMilestones.length > 0) {
            // Group milestones by type
            const milestonesByType = {};
            for (const m of weeklyMilestones) {
              const type = m.milestoneType;
              if (!milestonesByType[type]) {
                milestonesByType[type] = [];
              }
              milestonesByType[type].push(m);
            }

            // Build milestone recap text
            const recapLines = [];
            for (const [type, milestones] of Object.entries(milestonesByType)) {
              const count = milestones.length;
              let emoji = '🎯';
              let label = type;

              if (type === 'attendance') {
                emoji = '🎯';
                label = 'Attendance';
              } else if (type === 'bidding') {
                emoji = '💰';
                label = 'Bidding';
              } else if (type === 'engagement') {
                emoji = '🧠';
                label = 'Engagement';
              } else if (type === 'guildWide') {
                emoji = '🏆';
                label = 'Guild-Wide';
              } else if (type === 'spawnStreak') {
                emoji = '⚡';
                label = 'Spawn Streak';
              } else if (type === 'calendarStreak') {
                emoji = '📅';
                label = 'Calendar Streak';
              } else if (type === 'perfectWeek') {
                emoji = '⭐';
                label = 'Perfect Week';
              } else if (type === 'tenure') {
                emoji = '🗿';
                label = 'Tenure';
              }

              recapLines.push(`${emoji} **${count}** ${label} milestone${count > 1 ? 's' : ''}`);
            }

            // Add to embed
            embed.addFields({
              name: '🎉 Milestones This Week',
              value: recapLines.join('\n') || 'No milestones this week',
              inline: false
            });

            console.log(`✅ [PROACTIVE] Added milestone recap: ${weeklyMilestones.length} total`);
          }
        } catch (error) {
          console.error('[PROACTIVE] Error adding milestone recap:', error);
          // Continue without recap if error
        }
      }

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
      if (!PROACTIVE_CONFIG.features.celebrateMilestones) {
        return;
      }

      // Fetch BOTH attendance and bidding data
      const attendanceResponse = await this.intelligence.sheetAPI.call('getTotalAttendance', {});
      const attendanceData = attendanceResponse?.data?.members || attendanceResponse?.members || [];

      const biddingResponse = await this.intelligence.sheetAPI.call('getBiddingPoints', {});
      const biddingData = biddingResponse?.data?.members || biddingResponse?.members || [];

      if (attendanceData.length === 0 && biddingData.length === 0) {
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
      const historyResponse = await this.intelligence.sheetAPI.call('getMilestoneHistory', {});
      const milestoneHistory = historyResponse?.milestoneHistory || {};

      // Get channels for tiered routing
      const guildAnnouncementChannel = await getChannelById(
        this.client,
        this.config.guild_announcement_channel_id
      );

      const guildChatChannel = await getChannelById(
        this.client,
        this.config.elysium_commands_channel_id
      );

      if (!guildAnnouncementChannel || !guildChatChannel) {
        console.error('❌ [PROACTIVE] Required channels not found');
        return;
      }

      // Get guild for member lookups
      const guild = this.client.guilds.cache.get(this.config.main_guild_id);
      if (!guild) {
        console.error('❌ [PROACTIVE] Main guild not found');
        return;
      }

      // Define milestone tiers - SEPARATE for each type
      const ATTENDANCE_MILESTONES = PROACTIVE_CONFIG.thresholds.milestonePoints.attendance;
      const BIDDING_MILESTONES = PROACTIVE_CONFIG.thresholds.milestonePoints.bidding;

      const attendanceMilestoneArray = [...ATTENDANCE_MILESTONES.minor, ...ATTENDANCE_MILESTONES.major].sort((a, b) => a - b);
      const biddingMilestoneArray = [...BIDDING_MILESTONES.minor, ...BIDDING_MILESTONES.major].sort((a, b) => a - b);

      // Track stats
      let membersChecked = 0;
      let milestonesFound = 0;

      // Milestone grouping: { attendance: { 1000: [achiever1, achiever2], 500: [...] }, bidding: {...} }
      const milestoneGroups = {
        attendance: {},
        bidding: {}
      };
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
        for (const milestone of attendanceMilestoneArray) {
          if (totalPoints >= milestone && milestone > lastMilestone) {
            latestMilestone = milestone;
          }
        }

        // If found new milestone, ADD TO GROUP (don't announce yet)
        if (latestMilestone) {
          milestonesFound++;

          // Find Discord user for mention
          const discordMember = await this.findGuildMember(guild, nickname);

          // Initialize group if needed
          if (!milestoneGroups.attendance[latestMilestone]) {
            milestoneGroups.attendance[latestMilestone] = [];
          }

          // Add to group
          milestoneGroups.attendance[latestMilestone].push({
            member,
            nickname,
            totalPoints,
            lastMilestone,
            discordMember
          });
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
        for (const milestone of biddingMilestoneArray) {
          if (totalPoints >= milestone && milestone > lastMilestone) {
            latestMilestone = milestone;
          }
        }

        // If found new milestone, ADD TO GROUP (don't announce yet)
        if (latestMilestone) {
          milestonesFound++;
          console.log(`🎉 [PROACTIVE] NEW BIDDING MILESTONE!`);
          console.log(`   - Member: ${nickname}`);
          console.log(`   - Type: BIDDING`);
          console.log(`   - Total Points: ${totalPoints} (Left: ${bidData.pointsLeft}, Consumed: ${bidData.pointsConsumed})`);
          console.log(`   - New Milestone: ${latestMilestone}`);

          // Find Discord user for mention
          const discordMember = await this.findGuildMember(guild, nickname);

          // Initialize group if needed
          if (!milestoneGroups.bidding[latestMilestone]) {
            milestoneGroups.bidding[latestMilestone] = [];
          }

          // Add to group
          milestoneGroups.bidding[latestMilestone].push({
            member: { username: nickname, biddingPoints: totalPoints },
            nickname,
            totalPoints,
            lastMilestone,
            discordMember
          });
        }
      }

      // ═════════════════════════════════════════════════════════════════════
      // ANNOUNCE GROUPED MILESTONES (One embed per unique milestone)
      // ═════════════════════════════════════════════════════════════════════

      let milestonesQueued = 0;

      // Queue ATTENDANCE milestones
      for (const [milestoneStr, achievers] of Object.entries(milestoneGroups.attendance)) {
        const milestone = parseInt(milestoneStr);

        try {
          for (const achiever of achievers) {
            await this.queueMilestone('attendance', {
              nickname: achiever.nickname,
              milestone: milestone,
              totalPoints: achiever.totalPoints,
              lastMilestone: achiever.lastMilestone,
              discordMember: achiever.discordMember
            });

            await this.intelligence.sheetAPI.call('updateMilestoneHistory', {
              nickname: achiever.nickname,
              milestone: milestone,
              totalPoints: achiever.totalPoints,
              milestoneType: 'attendance'
            }, { silent: true });

            await new Promise(resolve => setTimeout(resolve, 500));
          }

          milestonesQueued += achievers.length;
        } catch (error) {
          console.error(`❌ [PROACTIVE] Error queueing ATTENDANCE milestone ${milestone}:`, error.message);
        }
      }

      // Queue BIDDING milestones
      for (const [milestoneStr, achievers] of Object.entries(milestoneGroups.bidding)) {
        const milestone = parseInt(milestoneStr);

        try {
          for (const achiever of achievers) {
            await this.queueMilestone('bidding', {
              nickname: achiever.nickname,
              milestone: milestone,
              totalPoints: achiever.totalPoints,
              lastMilestone: achiever.lastMilestone,
              discordMember: achiever.discordMember
            });

            await this.intelligence.sheetAPI.call('updateMilestoneHistory', {
              nickname: achiever.nickname,
              milestone: milestone,
              totalPoints: achiever.totalPoints,
              milestoneType: 'bidding'
            }, { silent: true });

            await new Promise(resolve => setTimeout(resolve, 500));
          }

          milestonesQueued += achievers.length;
        } catch (error) {
          console.error(`❌ [PROACTIVE] Error queueing BIDDING milestone ${milestone}:`, error.message);
        }
      }

      if (milestonesQueued > 0) {
        console.log(`🎉 [PROACTIVE] Queued ${milestonesQueued} new milestones`);
      }

    } catch (error) {
      console.error('❌ [PROACTIVE] CRITICAL ERROR checking milestones:', error);
      console.error(error.stack);
    }
  }
  // ═════════════════════════════════════════════════════════════════════════
  // ENHANCED MILESTONE SYSTEM - BATCHING & NEW TYPES
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * Ensure milestone tabs exist in Google Sheets
   */
  async ensureMilestoneTabsExist() {
    try {
      await this.intelligence.sheetAPI.call('ensureMilestoneTabsExist', {});
    } catch (error) {
      console.error('[PROACTIVE] Error ensuring milestone tabs:', error.message);
    }
  }

  /**
   * Detect all milestone types (hourly check - queue only, no announcements)
   */
  async detectAllMilestones() {
    // Skip if milestones are disabled
    if (!PROACTIVE_CONFIG.features.celebrateMilestones) {
      return;
    }

    try {
      console.log('🔍 [PROACTIVE] Detecting milestones (queueing for batch announcement)...');

      // Check existing milestone types (attendance/bidding) - now queues instead of announcing
      await this.checkMilestones();

      // Check new milestone types
      await this.checkEngagementMilestones();
      await this.checkGuildWideMilestones();

      console.log('✅ [PROACTIVE] Milestone detection complete');
    } catch (error) {
      console.error('[PROACTIVE] Error detecting milestones:', error);
    }
  }

  /**
   * Queue a milestone for batch announcement (helper function)
   * Persists to Google Sheets to survive bot restarts
   * PREVENTS DUPLICATES: Checks if same milestone already queued
   */
  async queueMilestone(type, data) {
    // Skip if milestones are disabled
    if (!PROACTIVE_CONFIG.features.celebrateMilestones) {
      return;
    }

    // CRITICAL: Check for duplicates to prevent spam at 3:01 AM
    // Each hourly check might find the same milestone if player continuously meets threshold
    const isDuplicate = this.milestoneQueue[type].some(queued => {
      // For individual player milestones
      if (data.nickname) {
        const normalizedNewNickname = this.normalizeUsername(data.nickname);
        const normalizedQueuedNickname = this.normalizeUsername(queued.nickname);

        // Check if same player + same milestone
        if (normalizedNewNickname === normalizedQueuedNickname) {
          // Different milestone types have different unique identifiers
          if (type === 'attendance' || type === 'bidding') {
            return queued.milestone === data.milestone;
          } else if (type === 'engagement') {
            return queued.milestone === data.milestone;
          } else if (type === 'tenure' || type === 'calendarStreak' || type === 'perfectWeek' || type === 'spawnStreak') {
            return queued.milestone === data.milestone;
          }
        }
      } else if (type === 'guildWide') {
        // For guild-wide milestones, check if same milestone type + threshold
        return queued.milestoneType === data.milestoneType && queued.threshold === data.threshold;
      }
      return false;
    });

    if (isDuplicate) {
      console.log(`⚠️ [PROACTIVE] Duplicate ${type} milestone detected for ${data.nickname || 'Guild'}, skipping queue`);
      return; // Don't queue duplicates
    }

    // Not a duplicate - add to queue
    this.milestoneQueue[type].push({
      ...data,
      queuedAt: new Date()
    });
    console.log(`📌 [PROACTIVE] Queued ${type} milestone for ${data.nickname || 'Guild'}`);

    // Persist queue to Google Sheets to survive bot restarts
    try {
      await this.intelligence.sheetAPI.call('saveMilestoneQueue', {
        milestoneQueue: this.milestoneQueue
      }, { silent: true });
    } catch (error) {
      console.error('⚠️ [PROACTIVE] Failed to persist milestone queue:', error.message);
      // Don't throw - queuing still works, just won't survive restart
    }
  }

  /**
   * Announce all queued milestones in batch (runs daily at 3:01 AM)
   */
  async announceMilestoneBatch() {
    try {
      // Skip if milestones are disabled
      if (!PROACTIVE_CONFIG.features.celebrateMilestones) {
        console.log('ℹ️ [PROACTIVE] Milestones disabled - skipping batch announcement');
        return;
      }

      console.log('🎉 [PROACTIVE] ═══════════════════════════════════════');
      console.log('🎉 [PROACTIVE] Starting daily milestone batch announcement...');

      // Count total queued BEFORE deduplication
      const totalQueued = Object.values(this.milestoneQueue).reduce((sum, arr) => sum + arr.length, 0);

      if (totalQueued === 0) {
        console.log('✅ [PROACTIVE] No milestones queued');
        return;
      }

      console.log(`📊 [PROACTIVE] ${totalQueued} milestones queued for announcement`);

      // ═══════════════════════════════════════════════════════════════
      // DEDUPLICATION LAYER: Remove any duplicate milestones
      // (Safety net in case duplicates snuck through from loaded queue data)
      // ═══════════════════════════════════════════════════════════════
      const deduplicateQueue = (type, queue) => {
        const seen = new Set();
        return queue.filter(item => {
          let key;
          if (item.nickname) {
            const normalized = this.normalizeUsername(item.nickname);
            if (type === 'engagement' || type === 'attendance' || type === 'bidding' || type === 'tenure' || type === 'calendarStreak' || type === 'perfectWeek' || type === 'spawnStreak') {
              key = `${normalized}-${item.milestone}`;
            } else {
              key = `${normalized}`;
            }
          } else if (type === 'guildWide') {
            key = `${item.milestoneType}-${item.threshold}`;
          } else {
            key = JSON.stringify(item);
          }

          if (seen.has(key)) {
            console.log(`⚠️ [PROACTIVE] Removing duplicate ${type} milestone: ${key}`);
            return false;
          }
          seen.add(key);
          return true;
        });
      };

      let duplicatesRemoved = 0;
      for (const [type, queue] of Object.entries(this.milestoneQueue)) {
        const originalLength = queue.length;
        this.milestoneQueue[type] = deduplicateQueue(type, queue);
        const removed = originalLength - this.milestoneQueue[type].length;
        if (removed > 0) {
          duplicatesRemoved += removed;
          console.log(`🔧 [PROACTIVE] Removed ${removed} duplicate ${type} milestones`);
        }
      }

      const totalAfterDedup = Object.values(this.milestoneQueue).reduce((sum, arr) => sum + arr.length, 0);
      if (duplicatesRemoved > 0) {
        console.log(`✅ [PROACTIVE] Deduplication complete: ${duplicatesRemoved} duplicates removed (${totalQueued} → ${totalAfterDedup})`);
      }

      if (totalAfterDedup === 0) {
        console.log('✅ [PROACTIVE] No milestones to announce after deduplication');
        return;
      }

      console.log(`📊 [PROACTIVE] ${totalAfterDedup} unique milestones to announce`);

      // Get channels
      const guildAnnouncementChannel = await getChannelById(
        this.client,
        this.config.guild_announcement_channel_id
      );

      const guildChatChannel = await getChannelById(
        this.client,
        this.config.elysium_commands_channel_id
      );

      if (!guildAnnouncementChannel || !guildChatChannel) {
        console.error('❌ [PROACTIVE] Required channels not found');
        return;
      }

      // Get guild for member lookups
      const guild = this.client.guilds.cache.get(this.config.main_guild_id);
      if (!guild) {
        console.error('❌ [PROACTIVE] Main guild not found');
        return;
      }

      let totalAnnounced = 0;

      // Calculate week range for logging (Manila timezone GMT+8)
      const now = new Date();
      const nowInManila = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Manila" }));
      const weekStart = new Date(nowInManila);
      weekStart.setHours(3, 1, 0, 0);
      const dayOfWeek = weekStart.getDay();
      const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      weekStart.setDate(weekStart.getDate() - daysToMonday);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);

      // ═══════════════════════════════════════════════════════════════
      // Announce Attendance Milestones
      // ═══════════════════════════════════════════════════════════════
      if (this.milestoneQueue.attendance.length > 0) {
        console.log(`📢 [PROACTIVE] Announcing ${this.milestoneQueue.attendance.length} attendance milestones...`);
        const grouped = this.groupMilestonesByThreshold(this.milestoneQueue.attendance);

        for (const [milestone, achievers] of Object.entries(grouped)) {
          const milestoneNum = parseInt(milestone);
          const isMajor = PROACTIVE_CONFIG.thresholds.milestonePoints.attendance.major.includes(milestoneNum);
          const channel = guildChatChannel;

          const embed = await this.createGroupedMilestoneEmbed(
            achievers,
            milestoneNum,
            'attendance',
            [...PROACTIVE_CONFIG.thresholds.milestonePoints.attendance.minor,
             ...PROACTIVE_CONFIG.thresholds.milestonePoints.attendance.major].sort((a, b) => a - b)
          );

          await channel.send({ embeds: [embed] });

          // Log to weekly milestone log
          for (const achiever of achievers) {
            await this.intelligence.sheetAPI.call('logWeeklyMilestone', {
              weekStartDate: weekStart.toISOString(),
              weekEndDate: weekEnd.toISOString(),
              milestoneType: 'attendance',
              nickname: achiever.nickname,
              milestone: milestoneNum,
              value: achiever.totalPoints
            });
          }

          totalAnnounced++;
        }

        this.milestoneQueue.attendance = [];
      }

      // ═══════════════════════════════════════════════════════════════
      // Announce Bidding Milestones
      // ═══════════════════════════════════════════════════════════════
      if (this.milestoneQueue.bidding.length > 0) {
        console.log(`📢 [PROACTIVE] Announcing ${this.milestoneQueue.bidding.length} bidding milestones...`);
        const grouped = this.groupMilestonesByThreshold(this.milestoneQueue.bidding);

        for (const [milestone, achievers] of Object.entries(grouped)) {
          const milestoneNum = parseInt(milestone);
          const isMajor = PROACTIVE_CONFIG.thresholds.milestonePoints.bidding.major.includes(milestoneNum);
          const channel = guildChatChannel;

          const embed = await this.createGroupedMilestoneEmbed(
            achievers,
            milestoneNum,
            'bidding',
            [...PROACTIVE_CONFIG.thresholds.milestonePoints.bidding.minor,
             ...PROACTIVE_CONFIG.thresholds.milestonePoints.bidding.major].sort((a, b) => a - b)
          );

          await channel.send({ embeds: [embed] });

          // Log to weekly milestone log
          for (const achiever of achievers) {
            await this.intelligence.sheetAPI.call('logWeeklyMilestone', {
              weekStartDate: weekStart.toISOString(),
              weekEndDate: weekEnd.toISOString(),
              milestoneType: 'bidding',
              nickname: achiever.nickname,
              milestone: milestoneNum,
              value: achiever.totalPoints
            });
          }

          totalAnnounced++;
        }

        this.milestoneQueue.bidding = [];
      }

      // ═══════════════════════════════════════════════════════════════
      // Announce Engagement Score Milestones
      // ═══════════════════════════════════════════════════════════════
      if (this.milestoneQueue.engagement.length > 0) {
        console.log(`📢 [PROACTIVE] Announcing ${this.milestoneQueue.engagement.length} engagement milestones...`);
        const grouped = this.groupMilestonesByThreshold(this.milestoneQueue.engagement);

        for (const [milestone, achievers] of Object.entries(grouped)) {
          const milestoneNum = parseInt(milestone);
          const isMajor = PROACTIVE_CONFIG.thresholds.milestonePoints.engagement.major.includes(milestoneNum);
          const channel = guildChatChannel;

          const embed = this.createEngagementMilestoneEmbed(achievers, milestoneNum, isMajor);

          await channel.send({ embeds: [embed] });

          // Log to weekly milestone log
          for (const achiever of achievers) {
            await this.intelligence.sheetAPI.call('logWeeklyMilestone', {
              weekStartDate: weekStart.toISOString(),
              weekEndDate: weekEnd.toISOString(),
              milestoneType: 'engagement',
              nickname: achiever.nickname,
              milestone: milestoneNum,
              value: achiever.score
            });
          }

          totalAnnounced++;
        }

        this.milestoneQueue.engagement = [];
      }

      // ═══════════════════════════════════════════════════════════════
      // Announce Guild-Wide Milestones
      // ═══════════════════════════════════════════════════════════════
      if (this.milestoneQueue.guildWide.length > 0) {
        console.log(`📢 [PROACTIVE] Announcing ${this.milestoneQueue.guildWide.length} guild-wide milestones...`);

        for (const milestone of this.milestoneQueue.guildWide) {
          // Validate milestone data before processing
          if (!milestone || typeof milestone.threshold === 'undefined' || typeof milestone.totalValue === 'undefined') {
            console.warn(`⚠️ [PROACTIVE] Skipping invalid guild-wide milestone:`, JSON.stringify(milestone));
            continue;
          }

          const embed = this.createGuildWideMilestoneEmbed(milestone);

          await guildChatChannel.send({ embeds: [embed] });

          // Log to weekly milestone log
          await this.intelligence.sheetAPI.call('logWeeklyMilestone', {
            weekStartDate: weekStart.toISOString(),
            weekEndDate: weekEnd.toISOString(),
            milestoneType: 'guildWide',
            nickname: 'Guild',
            milestone: `${milestone.milestoneType} ${milestone.threshold}`,
            value: milestone.totalValue
          });

          totalAnnounced++;
        }

        this.milestoneQueue.guildWide = [];
      }

      // ═══════════════════════════════════════════════════════════════
      // Announce Streak Milestones (Spawn, Calendar, Perfect Week)
      // ═══════════════════════════════════════════════════════════════
      const streakTypes = ['spawnStreak', 'calendarStreak', 'perfectWeek', 'tenure'];

      for (const streakType of streakTypes) {
        if (this.milestoneQueue[streakType].length > 0) {
          console.log(`📢 [PROACTIVE] Announcing ${this.milestoneQueue[streakType].length} ${streakType} milestones...`);
          const grouped = this.groupMilestonesByThreshold(this.milestoneQueue[streakType]);

          for (const [milestone, achievers] of Object.entries(grouped)) {
            const milestoneNum = parseInt(milestone);

            // Determine if major
            let isMajor = false;
            let configKey = '';

            if (streakType === 'spawnStreak') {
              configKey = 'consecutiveSpawnStreak';
              isMajor = PROACTIVE_CONFIG.thresholds.milestonePoints.consecutiveSpawnStreak.major.includes(milestoneNum);
            } else if (streakType === 'calendarStreak') {
              configKey = 'calendarDayStreak';
              isMajor = PROACTIVE_CONFIG.thresholds.milestonePoints.calendarDayStreak.major.includes(milestoneNum);
            } else if (streakType === 'perfectWeek') {
              configKey = 'perfectWeek';
              isMajor = PROACTIVE_CONFIG.thresholds.milestonePoints.perfectWeek.major.includes(milestoneNum);
            } else if (streakType === 'tenure') {
              configKey = 'tenure';
              isMajor = PROACTIVE_CONFIG.thresholds.milestonePoints.tenure.major.includes(milestoneNum);
            }

            const channel = guildChatChannel;

            const embed = this.createStreakMilestoneEmbed(achievers, milestoneNum, streakType, isMajor);

            await channel.send({ embeds: [embed] });

            // Log to weekly milestone log
            for (const achiever of achievers) {
              await this.intelligence.sheetAPI.call('logWeeklyMilestone', {
                weekStartDate: weekStart.toISOString(),
                weekEndDate: weekEnd.toISOString(),
                milestoneType: streakType,
                nickname: achiever.nickname,
                milestone: milestoneNum,
                value: achiever.streak || achiever.days
              });
            }

            totalAnnounced++;
          }

          this.milestoneQueue[streakType] = [];
        }
      }

      // Clear milestone queue from Google Sheets after successful batch announcement
      try {
        await this.intelligence.sheetAPI.call('clearMilestoneQueue', {});
        console.log('✅ [PROACTIVE] Milestone queue cleared from Google Sheets');
      } catch (error) {
        console.error('⚠️ [PROACTIVE] Failed to clear milestone queue from Google Sheets:', error.message);
      }

      console.log('🎉 [PROACTIVE] ═══════════════════════════════════════');
      console.log(`🎉 [PROACTIVE] Batch announcement complete: ${totalAnnounced} unique milestones announced`);
      console.log('🎉 [PROACTIVE] ═══════════════════════════════════════');

    } catch (error) {
      console.error('❌ [PROACTIVE] Error announcing milestone batch:', error);
      console.error(error.stack);
    }
  }

  /**
   * Group milestones by threshold for batch announcement
   */
  groupMilestonesByThreshold(milestones) {
    const grouped = {};
    for (const milestone of milestones) {
      const threshold = milestone.milestone;
      if (!grouped[threshold]) {
        grouped[threshold] = [];
      }
      grouped[threshold].push(milestone);
    }
    return grouped;
  }

  /**
   * Check engagement score milestones (hourly)
   */
  async checkEngagementMilestones() {
    // Skip if milestones are disabled
    if (!PROACTIVE_CONFIG.features.celebrateMilestones) {
      return;
    }

    try {
      console.log('🧠 [PROACTIVE] Checking engagement score milestones...');

      // Get engagement analysis
      const analysis = await this.intelligence.analyzeAllMembersEngagement();
      if (analysis.error) {
        console.log('⚠️ [PROACTIVE] Error analyzing engagement');
        return;
      }

      const allMilestones = [
        ...PROACTIVE_CONFIG.thresholds.milestonePoints.engagement.minor,
        ...PROACTIVE_CONFIG.thresholds.milestonePoints.engagement.major
      ].sort((a, b) => a - b);

      // Get milestone history
      const historyResponse = await this.intelligence.sheetAPI.call('getMilestoneHistory', {});
      const milestoneHistory = historyResponse?.milestoneHistory || {};

      let milestonesFound = 0;

      // Check each member's engagement score
      for (const member of analysis.members || []) {
        const nickname = member.username;
        const normalizedNickname = this.normalizeUsername(nickname);
        const engagementScore = member.engagementScore || 0;

        // Get last celebrated milestone
        const historyKey = `${normalizedNickname}-engagement`;
        const history = milestoneHistory[historyKey] || {};
        const lastMilestone = history.lastEngagementMilestone || 0;

        // Find highest milestone crossed
        let highestMilestone = null;
        for (const milestone of allMilestones) {
          if (engagementScore >= milestone && milestone > lastMilestone) {
            highestMilestone = milestone;
          }
        }

        if (highestMilestone) {
          milestonesFound++;
          console.log(`🎉 [PROACTIVE] ${nickname} reached engagement ${highestMilestone} (score: ${engagementScore})`);

          // Queue milestone
          await this.queueMilestone('engagement', {
            nickname,
            milestone: highestMilestone,
            score: engagementScore
          });

          // Update Google Sheets with delay to prevent rate limiting
          await this.intelligence.sheetAPI.call('updateMilestoneHistory', {
            nickname,
            milestone: highestMilestone,
            totalPoints: engagementScore,
            milestoneType: 'engagement'
          }, { silent: true });

          // Add small delay between API calls to prevent rate limiting
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      console.log(`✅ [PROACTIVE] Engagement check complete: ${milestonesFound} new milestones`);

    } catch (error) {
      console.error('[PROACTIVE] Error checking engagement milestones:', error);
    }
  }

  /**
   * Check guild-wide collective milestones (hourly)
   */
  async checkGuildWideMilestones() {
    // Skip if milestones are disabled
    if (!PROACTIVE_CONFIG.features.celebrateMilestones) {
      return;
    }

    try {
      console.log('🏆 [PROACTIVE] Checking guild-wide milestones...');

      // Get guild milestones from sheets
      const guildMilestonesResponse = await this.intelligence.sheetAPI.call('getGuildMilestones', {});
      const achievedMilestones = guildMilestonesResponse?.data || [];

      // Helper to check if milestone already achieved
      const isAchieved = (type, threshold) => {
        return achievedMilestones.some(m =>
          m.milestoneType === type &&
          parseInt(m.threshold) === threshold &&
          m.announced === true
        );
      };

      let milestonesFound = 0;

      // ═══════════════════════════════════════════════════════════════
      // Check Total Attendance
      // ═══════════════════════════════════════════════════════════════
      const attendanceResponse = await this.intelligence.sheetAPI.call('getTotalAttendance', {});
      const attendanceData = attendanceResponse?.data?.members || attendanceResponse?.members || [];
      const totalAttendance = attendanceData.reduce((sum, m) => sum + (m.attendancePoints || 0), 0);

      for (const threshold of PROACTIVE_CONFIG.thresholds.milestonePoints.guildWide.totalAttendance) {
        if (totalAttendance >= threshold && !isAchieved('attendance', threshold)) {
          milestonesFound++;
          await this.queueMilestone('guildWide', {
            milestoneType: 'attendance',
            threshold,
            totalValue: totalAttendance
          });

          await this.intelligence.sheetAPI.call('recordGuildMilestone', {
            milestoneType: 'attendance',
            threshold,
            totalValue: totalAttendance
          });
        }
      }

      const biddingResponse = await this.intelligence.sheetAPI.call('getBiddingPoints', {});
      const biddingData = biddingResponse?.data?.members || biddingResponse?.members || [];
      const totalBidding = biddingData.reduce((sum, m) => sum + ((m.pointsLeft || 0) + (m.pointsConsumed || 0)), 0);

      for (const threshold of PROACTIVE_CONFIG.thresholds.milestonePoints.guildWide.totalBidding) {
        if (totalBidding >= threshold && !isAchieved('bidding', threshold)) {
          milestonesFound++;
          await this.queueMilestone('guildWide', {
            milestoneType: 'bidding',
            threshold,
            totalValue: totalBidding
          });

          await this.intelligence.sheetAPI.call('recordGuildMilestone', {
            milestoneType: 'bidding',
            threshold,
            totalValue: totalBidding
          });
        }
      }

      const analysis = await this.intelligence.analyzeAllMembersEngagement();
      if (!analysis.error) {
        const activeCount = analysis.active || 0;

        for (const threshold of PROACTIVE_CONFIG.thresholds.milestonePoints.guildWide.activeMembers) {
          if (activeCount >= threshold && !isAchieved('activeMembers', threshold)) {
            milestonesFound++;
            await this.queueMilestone('guildWide', {
              milestoneType: 'activeMembers',
              threshold,
              totalValue: activeCount
            });

            await this.intelligence.sheetAPI.call('recordGuildMilestone', {
              milestoneType: 'activeMembers',
              threshold,
              totalValue: activeCount
            });
          }
        }
      }

      if (milestonesFound > 0) {
        console.log(`🎉 [PROACTIVE] Guild-wide: ${milestonesFound} new milestones`);
      }

    } catch (error) {
      console.error('[PROACTIVE] Error checking guild-wide milestones:', error);
    }
  }

  /**
   * Check tenure/loyalty milestones (daily at 3:01 AM)
   */
  async checkTenureMilestones() {
    // Skip if milestones are disabled
    if (!PROACTIVE_CONFIG.features.celebrateMilestones) {
      return;
    }

    try {
      console.log('🗿 [PROACTIVE] Checking tenure milestones...');

      // Get attendance data (has memberSinceDate column)
      const attendanceResponse = await this.intelligence.sheetAPI.call('getTotalAttendance', {});
      const attendanceData = attendanceResponse?.data?.members || attendanceResponse?.members || [];

      // Get milestone history
      const historyResponse = await this.intelligence.sheetAPI.call('getMilestoneHistory', {});
      const milestoneHistory = historyResponse?.milestoneHistory || {};

      const allTenureMilestones = [
        ...PROACTIVE_CONFIG.thresholds.milestonePoints.tenure.minor,
        ...PROACTIVE_CONFIG.thresholds.milestonePoints.tenure.major
      ].sort((a, b) => a - b);

      let milestonesFound = 0;
      const now = new Date();

      for (const member of attendanceData) {
        const nickname = member.username;
        const normalizedNickname = this.normalizeUsername(nickname);

        // Get member since date (use earliestAttendance or memberSinceDate)
        let memberSinceDate = member.memberSinceDate || member.earliestAttendance;
        if (!memberSinceDate) continue;

        memberSinceDate = new Date(memberSinceDate);
        const daysAsMember = Math.floor((now - memberSinceDate) / (1000 * 60 * 60 * 24));

        // Get last celebrated tenure milestone
        const historyKey = `${normalizedNickname}-tenure`;
        const history = milestoneHistory[historyKey] || {};
        const lastMilestone = history.lastMilestone || 0;

        // Find highest milestone crossed
        let highestMilestone = null;
        for (const milestone of allTenureMilestones) {
          if (daysAsMember >= milestone && milestone > lastMilestone) {
            highestMilestone = milestone;
          }
        }

        if (highestMilestone) {
          milestonesFound++;
          await this.queueMilestone('tenure', {
            nickname,
            milestone: highestMilestone,
            days: daysAsMember
          });

          await this.intelligence.sheetAPI.call('updateMilestoneHistory', {
            nickname,
            milestone: highestMilestone,
            totalPoints: daysAsMember,
            milestoneType: 'tenure'
          }, { silent: true });
        }
      }

      if (milestonesFound > 0) {
        console.log(`🎉 [PROACTIVE] Tenure: ${milestonesFound} new milestones`);
      }

    } catch (error) {
      console.error('[PROACTIVE] Error checking tenure milestones:', error);
    }
  }

  /**
   * Check calendar day streaks (daily at 3:01 AM)
   * Requires 5+ spawns per day to count as 1 streak day
   */
  async checkCalendarDayStreaks() {
    // Skip if milestones are disabled
    if (!PROACTIVE_CONFIG.features.celebrateMilestones) {
      return;
    }

    try {
      // Calculate yesterday's date range (Manila timezone GMT+8)
      const now = new Date();
      const nowInManila = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Manila" }));
      const yesterdayStart = new Date(nowInManila);
      yesterdayStart.setDate(yesterdayStart.getDate() - 1);
      yesterdayStart.setHours(3, 1, 0, 0);

      const yesterdayEnd = new Date(nowInManila);
      yesterdayEnd.setHours(3, 0, 0, 0);

      // Get all weekly attendance data
      const response = await this.intelligence.sheetAPI.call('getAllWeeklyAttendance', {});
      const allSheets = response?.data?.allSheets || response?.allSheets || [];

      // Count spawns per member yesterday
      const memberSpawnCounts = {};

      for (const sheet of allSheets) {
        const columns = sheet.columns || [];
        for (const col of columns) {
          if (col.boss && col.timestamp) {
            const spawnDate = new Date(col.timestamp);
            if (spawnDate >= yesterdayStart && spawnDate < yesterdayEnd) {
              // Count attendance
              const members = col.members || [];
              for (const member of members) {
                const normalized = this.normalizeUsername(member);
                memberSpawnCounts[normalized] = (memberSpawnCounts[normalized] || 0) + 1;
              }
            }
          }
        }
      }

      console.log(`📊 [PROACTIVE] Found ${Object.keys(memberSpawnCounts).length} members with attendance yesterday`);

      // Get streak data from Google Sheets
      const allMilestones = [
        ...PROACTIVE_CONFIG.thresholds.milestonePoints.calendarDayStreak.minor,
        ...PROACTIVE_CONFIG.thresholds.milestonePoints.calendarDayStreak.major
      ].sort((a, b) => a - b);

      let milestonesFound = 0;

      for (const [normalizedNickname, spawnCount] of Object.entries(memberSpawnCounts)) {
        // Get streak data
        const streakDataResponse = await this.intelligence.sheetAPI.call('getStreakData', { nickname: normalizedNickname });
        const streakData = streakDataResponse?.data || {};

        let currentStreak = streakData.calendarDayStreak || 0;
        const lastCheck = streakData.lastCalendarStreakCheck ? new Date(streakData.lastCalendarStreakCheck) : null;
        const lastMilestone = streakData.lastCalendarStreakMilestone || 0;

        // Check if attended 5+ spawns yesterday
        if (spawnCount >= 5) {
          // Increment streak
          currentStreak++;
          const longestStreak = Math.max(currentStreak, streakData.longestCalendarStreak || 0);

          // Update streak data
          await this.intelligence.sheetAPI.call('updateStreakData', {
            nickname: normalizedNickname,
            calendarDayStreak: currentStreak,
            longestCalendarStreak: longestStreak,
            lastCalendarStreakCheck: now.toISOString()
          });

          // Check for milestone
          let highestMilestone = null;
          for (const milestone of allMilestones) {
            if (currentStreak >= milestone && milestone > lastMilestone) {
              highestMilestone = milestone;
            }
          }

          if (highestMilestone) {
            milestonesFound++;
            console.log(`🎉 [PROACTIVE] ${normalizedNickname} reached ${highestMilestone}-day calendar streak!`);

            // Queue milestone
            await this.queueMilestone('calendarStreak', {
              nickname: normalizedNickname,
              milestone: highestMilestone,
              streak: currentStreak
            });

            // Update milestone in streak data
            await this.intelligence.sheetAPI.call('updateStreakData', {
              nickname: normalizedNickname,
              lastCalendarStreakMilestone: highestMilestone
            });
          }
        } else {
          // Missed day (< 5 spawns), reset streak
          if (currentStreak > 0) {
            console.log(`📉 [PROACTIVE] ${normalizedNickname} streak reset (only ${spawnCount} spawns yesterday)`);
            await this.intelligence.sheetAPI.call('updateStreakData', {
              nickname: normalizedNickname,
              calendarDayStreak: 0,
              lastCalendarStreakCheck: now.toISOString()
            });
          }
        }
      }

      console.log(`✅ [PROACTIVE] Calendar day streak check complete: ${milestonesFound} new milestones`);

    } catch (error) {
      console.error('[PROACTIVE] Error checking calendar day streaks:', error);
    }
  }

  /**
   * Check perfect attendance week (Sunday 11:59 PM)
   */
  async checkPerfectAttendanceWeek() {
    try {
      console.log('⭐ [PROACTIVE] Checking perfect attendance week...');

      // Calculate this week's date range (Monday 3:01 AM to Sunday 11:59 PM) in Manila timezone (GMT+8)
      const now = new Date();
      const nowInManila = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Manila" }));
      const weekStart = new Date(nowInManila);
      weekStart.setHours(3, 1, 0, 0);
      const dayOfWeek = weekStart.getDay();
      const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      weekStart.setDate(weekStart.getDate() - daysToMonday);

      const weekEnd = new Date(nowInManila);
      weekEnd.setHours(23, 59, 0, 0);

      console.log(`📊 [PROACTIVE] Checking spawns from ${weekStart.toISOString()} to ${weekEnd.toISOString()}`);

      // Get all spawns this week
      const response = await this.intelligence.sheetAPI.call('getAllWeeklyAttendance', {});
      const allSheets = response?.data?.allSheets || response?.allSheets || [];

      // Collect all spawns and attendees this week
      const weekSpawns = [];
      for (const sheet of allSheets) {
        const columns = sheet.columns || [];
        for (const col of columns) {
          if (col.boss && col.timestamp) {
            const spawnDate = new Date(col.timestamp);
            if (spawnDate >= weekStart && spawnDate <= weekEnd) {
              weekSpawns.push({
                boss: col.boss,
                timestamp: col.timestamp,
                members: col.members || []
              });
            }
          }
        }
      }

      if (weekSpawns.length === 0) {
        console.log('⚠️ [PROACTIVE] No spawns found this week');
        return;
      }

      console.log(`📊 [PROACTIVE] Found ${weekSpawns.length} spawns this week`);

      // Check each member's attendance
      const memberAttendance = {};

      for (const spawn of weekSpawns) {
        for (const member of spawn.members) {
          const normalized = this.normalizeUsername(member);
          if (!memberAttendance[normalized]) {
            memberAttendance[normalized] = { attended: 0, total: weekSpawns.length };
          }
          memberAttendance[normalized].attended++;
        }
      }

      // Find members with 100% attendance
      const perfectMembers = [];
      for (const [nickname, data] of Object.entries(memberAttendance)) {
        if (data.attended === data.total) {
          perfectMembers.push(nickname);
        }
      }

      console.log(`📊 [PROACTIVE] ${perfectMembers.length} members with perfect attendance this week`);

      const allMilestones = [
        ...PROACTIVE_CONFIG.thresholds.milestonePoints.perfectWeek.minor,
        ...PROACTIVE_CONFIG.thresholds.milestonePoints.perfectWeek.major
      ].sort((a, b) => a - b);

      let milestonesFound = 0;

      for (const nickname of perfectMembers) {
        // Get streak data
        const streakDataResponse = await this.intelligence.sheetAPI.call('getStreakData', { nickname });
        const streakData = streakDataResponse?.data || {};

        const perfectWeeksCount = (streakData.perfectWeeksCount || 0) + 1;
        const lastMilestone = streakData.lastPerfectWeekMilestone || 0;

        // Update perfect weeks count
        await this.intelligence.sheetAPI.call('updateStreakData', {
          nickname,
          perfectWeeksCount,
          lastPerfectWeekDate: now.toISOString()
        });

        // Check for milestone
        let highestMilestone = null;
        for (const milestone of allMilestones) {
          if (perfectWeeksCount >= milestone && milestone > lastMilestone) {
            highestMilestone = milestone;
          }
        }

        if (highestMilestone) {
          milestonesFound++;
          console.log(`🎉 [PROACTIVE] ${nickname} reached ${highestMilestone} perfect weeks!`);

          // Queue milestone
          await this.queueMilestone('perfectWeek', {
            nickname,
            milestone: highestMilestone,
            weeks: perfectWeeksCount
          });

          // Update milestone
          await this.intelligence.sheetAPI.call('updateStreakData', {
            nickname,
            lastPerfectWeekMilestone: highestMilestone
          });
        }
      }

      console.log(`✅ [PROACTIVE] Perfect week check complete: ${milestonesFound} new milestones`);

    } catch (error) {
      console.error('[PROACTIVE] Error checking perfect attendance week:', error);
    }
  }

  /**
   * Check consecutive spawn streak (called on attendance verification)
   * This should be called from attendance.js when a member's attendance is verified
   */
  async checkConsecutiveSpawnStreak(nickname, currentSpawnTimestamp) {
    try {
      // Get streak data
      const streakDataResponse = await this.intelligence.sheetAPI.call('getStreakData', { nickname });
      const streakData = streakDataResponse?.data || {};

      const lastSpawnDate = streakData.lastSpawnDate ? new Date(streakData.lastSpawnDate) : null;
      let currentStreak = streakData.consecutiveSpawnStreak || 0;
      const lastMilestone = streakData.lastSpawnStreakMilestone || 0;

      // Get all recent spawns to check if this is consecutive
      const response = await this.intelligence.sheetAPI.call('getAllWeeklyAttendance', {});
      const allSheets = response?.data?.allSheets || response?.allSheets || [];

      // Collect all spawns
      const allSpawns = [];
      for (const sheet of allSheets) {
        const columns = sheet.columns || [];
        for (const col of columns) {
          if (col.boss && col.timestamp) {
            allSpawns.push({
              timestamp: new Date(col.timestamp),
              members: col.members || []
            });
          }
        }
      }

      // Sort spawns by timestamp
      allSpawns.sort((a, b) => a.timestamp - b.timestamp);

      // Find current spawn in list
      const currentSpawnDate = new Date(currentSpawnTimestamp);
      const currentSpawnIndex = allSpawns.findIndex(s =>
        Math.abs(s.timestamp - currentSpawnDate) < 60000 // Within 1 minute
      );

      if (currentSpawnIndex === -1) {
        console.log('[PROACTIVE] Current spawn not found in spawn list');
        return;
      }

      // Check if member attended previous spawn
      let attendedPrevious = false;
      if (currentSpawnIndex > 0) {
        const previousSpawn = allSpawns[currentSpawnIndex - 1];
        const normalizedNickname = this.normalizeUsername(nickname);
        attendedPrevious = previousSpawn.members.some(m =>
          this.normalizeUsername(m) === normalizedNickname
        );
      } else {
        // First spawn ever, start streak
        attendedPrevious = false;
      }

      // Update streak
      if (attendedPrevious || currentSpawnIndex === 0) {
        currentStreak++;
      } else {
        // Missed previous spawn, reset to 1
        currentStreak = 1;
      }

      const longestStreak = Math.max(currentStreak, streakData.longestSpawnStreak || 0);

      // Update streak data
      await this.intelligence.sheetAPI.call('updateStreakData', {
        nickname,
        consecutiveSpawnStreak: currentStreak,
        longestSpawnStreak: longestStreak,
        lastSpawnDate: currentSpawnDate.toISOString()
      });

      // Check for milestone
      const allMilestones = [
        ...PROACTIVE_CONFIG.thresholds.milestonePoints.consecutiveSpawnStreak.minor,
        ...PROACTIVE_CONFIG.thresholds.milestonePoints.consecutiveSpawnStreak.major
      ].sort((a, b) => a - b);

      let highestMilestone = null;
      for (const milestone of allMilestones) {
        if (currentStreak >= milestone && milestone > lastMilestone) {
          highestMilestone = milestone;
        }
      }

      if (highestMilestone) {
        console.log(`🎉 [PROACTIVE] ${nickname} reached ${highestMilestone} consecutive spawn streak!`);

        // Queue milestone
        await this.queueMilestone('spawnStreak', {
          nickname,
          milestone: highestMilestone,
          streak: currentStreak
        });

        // Update milestone
        await this.intelligence.sheetAPI.call('updateStreakData', {
          nickname,
          lastSpawnStreakMilestone: highestMilestone
        });
      }

    } catch (error) {
      console.error('[PROACTIVE] Error checking consecutive spawn streak:', error);
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  // ENHANCED EMBED CREATORS FOR NEW MILESTONE TYPES
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * Create engagement milestone embed
   */
  createEngagementMilestoneEmbed(achievers, milestone, isMajor) {
    const opening = this.pickRandom(this.getMilestoneOpenings());

    const achieverList = achievers.map(a => {
      return `🧠 **${a.nickname}** - Score: **${a.score}/100**`;
    }).join('\n');

    const color = isMajor ? 0x9B59B6 : 0x3498DB;

    const description = achievers.length === 1
      ? `**${achievers[0].nickname}** just reached **${milestone} engagement score!** 🧠\n\nYour dedication and consistency is outstanding! Keep up the excellent participation!\n\n${achieverList}`
      : `**${achievers.length} members** just reached the **${milestone} engagement score** milestone! 🧠\n\nAmazing dedication from everyone! Keep it up!\n\n${achieverList}`;

    return new EmbedBuilder()
      .setColor(color)
      .setTitle(`${opening}`)
      .setDescription(description)
      .setFooter({ text: `🧠 Engagement Score Milestone | Score: ${milestone}/100` })
      .setTimestamp();
  }

  /**
   * Create guild-wide milestone embed
   */
  createGuildWideMilestoneEmbed(milestone) {
    const opening = '🎊 ELYSIUM GUILD ACHIEVEMENT! 🎊';

    // Defensive: ensure milestone values exist
    const threshold = milestone?.threshold ?? 0;
    const totalValue = milestone?.totalValue ?? 0;

    let typeLabel = '';
    let emoji = '';
    let color = 0xFFD700;

    if (milestone.milestoneType === 'attendance') {
      typeLabel = 'Total Attendance Points';
      emoji = '📊';
    } else if (milestone.milestoneType === 'bidding') {
      typeLabel = 'Total Bidding Points';
      emoji = '💰';
    } else if (milestone.milestoneType === 'activeMembers') {
      typeLabel = 'Active Members';
      emoji = '👥';
      color = 0x2ECC71;
    }

    const description = `Together we've reached **${threshold.toLocaleString()} ${typeLabel}!** ${emoji}\n\n` +
      `This is the result of EVERYONE's hard work!\n` +
      `Every spawn attended, every boss killed - we did this TOGETHER!\n\n` +
      `Current Value: **${totalValue.toLocaleString()}**\n\n` +
      `Let's keep this momentum going! 💪`;

    return new EmbedBuilder()
      .setColor(color)
      .setTitle(opening)
      .setDescription(description)
      .setFooter({ text: `🏆 Guild Achievement | ${typeLabel}` })
      .setTimestamp();
  }

  /**
   * Create streak milestone embed
   */
  createStreakMilestoneEmbed(achievers, milestone, streakType, isMajor) {
    const opening = this.pickRandom(this.getMilestoneOpenings());

    let typeLabel = '';
    let emoji = '';
    let color = isMajor ? 0xE74C3C : 0xF39C12;

    if (streakType === 'spawnStreak') {
      typeLabel = 'Consecutive Spawn Streak';
      emoji = '⚡';
    } else if (streakType === 'calendarStreak') {
      typeLabel = 'Calendar Day Streak';
      emoji = '📅';
    } else if (streakType === 'perfectWeek') {
      typeLabel = 'Perfect Attendance Weeks';
      emoji = '⭐';
    } else if (streakType === 'tenure') {
      typeLabel = 'Days as Member';
      emoji = '🗿';
      color = isMajor ? 0x95A5A6 : 0xBDC3C7;
    }

    const achieverList = achievers.map(a => {
      const value = a.streak || a.days || a.weeks;
      return `${emoji} **${a.nickname}** - ${value} ${streakType === 'tenure' ? 'days' : streakType.includes('Week') ? 'weeks' : 'streak'}`;
    }).join('\n');

    const description = achievers.length === 1
      ? `**${achievers[0].nickname}** just reached **${milestone} ${typeLabel}!** ${emoji}\n\nConsistency is key! Amazing dedication! 🔥\n\n${achieverList}`
      : `**${achievers.length} members** just hit the **${milestone} ${typeLabel}** milestone! ${emoji}\n\nIncredible consistency from everyone!\n\n${achieverList}`;

    return new EmbedBuilder()
      .setColor(color)
      .setTitle(`${opening}`)
      .setDescription(description)
      .setFooter({ text: `${emoji} ${typeLabel} | Milestone: ${milestone}` })
      .setTimestamp();
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
   * @param {Array<number>} milestoneArray - Array of milestone thresholds for this type
   */
  async createMilestoneEmbed(member, milestone, totalPoints, lastMilestone, milestoneType, discordMember, milestoneArray) {
    // Calculate next milestone using the provided milestone array
    const nextMilestone = milestoneArray.find(m => m > milestone);

    // Pick random components from variety system
    const opening = this.pickRandom(this.getMilestoneOpenings());
    const announcement = this.getMilestoneAnnouncement(member, milestone, totalPoints, milestoneType, discordMember);
    const closing = this.getMilestoneClosing(nextMilestone, totalPoints);

    // Determine color based on milestone type
    const milestoneConfig = PROACTIVE_CONFIG.thresholds.milestonePoints[milestoneType];
    const isMajor = milestoneConfig.major.includes(milestone);
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
   * Create GROUPED milestone embed (multiple achievers, one announcement)
   * Used when 2+ members hit the same milestone at the same time
   * @param {Array} achievers - Array of achiever objects { member, nickname, totalPoints, discordMember }
   * @param {number} milestone - Milestone reached
   * @param {string} milestoneType - 'attendance' or 'bidding'
   * @param {Array<number>} milestoneArray - Array of milestone thresholds for this type
   */
  async createGroupedMilestoneEmbed(achievers, milestone, milestoneType, milestoneArray) {
    // Calculate next milestone
    const nextMilestone = milestoneArray.find(m => m > milestone);

    // Pick random opening
    const opening = this.pickRandom(this.getMilestoneOpenings());

    // Determine color based on milestone type
    const milestoneConfig = PROACTIVE_CONFIG.thresholds.milestonePoints[milestoneType];
    const isMajor = milestoneConfig.major.includes(milestone);
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

    // Sort achievers by total points (descending - highest first)
    const sortedAchievers = achievers.sort((a, b) => b.totalPoints - a.totalPoints);

    // Create achiever list with mentions
    const achieverList = sortedAchievers.map(achiever => {
      const userMention = achiever.discordMember
        ? `<@${achiever.discordMember.id}>`
        : `**${achiever.nickname}**`;
      return `${typeInfo.emoji} ${userMention} - **${achiever.totalPoints.toLocaleString()}** total`;
    }).join('\n');

    // Announcement message for groups - DIFFERENT for major vs minor milestones
    let groupAnnouncements;

    if (isMajor) {
      // MAJOR MILESTONES: Epic, legendary, guild-wide celebration
      groupAnnouncements = [
        `🏆 **LEGENDARY ACHIEVEMENT!** 🏆\n**${achievers.length} elite members** have reached the prestigious **${milestone.toLocaleString()} ${typeInfo.label}** milestone! This is guild history!`,
        `⚡ **TANGINA! MAJOR MILESTONE!** ⚡\nGrabe talaga! **${achievers.length} guild legends** conquered **${milestone.toLocaleString()} ${typeInfo.label}!** INSANE! 🔥🔥🔥`,
        `👑 **HALL OF FAME MOMENT!** 👑\n**${achievers.length} champions** just unlocked **${milestone.toLocaleString()} ${typeInfo.label}!** Elite tier na yan! RESPETO! 🙏`,
        `💎 **PUTANGINA! DIAMOND TIER!** 💎\nSaludo sa **${achievers.length} absolute units** na nag-**${milestone.toLocaleString()} ${typeInfo.label}!** WALANG KATULAD! 💪💪`,
        `🌟 **GUILD RECORD TERRITORY!** 🌟\n**${achievers.length} unstoppable members** reached **${milestone.toLocaleString()} ${typeInfo.label}!** ELYSIUM PRIDE! 🇵🇭`,
        `🔥 **GAGO! GODLIKE TIER!** 🔥\n**${achievers.length} immortals** hit **${milestone.toLocaleString()} ${typeInfo.label}!** BEYOND LEGENDARY! 👹`,
        `💯 **MAJOR BREAKTHROUGH!** 💯\nHISTORIC MOMENT! **${achievers.length} powerhouses** achieved **${milestone.toLocaleString()} ${typeInfo.label}!** PEAK PERFORMANCE! ⚡`,
        `🎖️ **MILITARY HONOR!** 🎖️\n**${achievers.length} decorated veterans** earned **${milestone.toLocaleString()} ${typeInfo.label}!** SALUTE! 🫡`,
      ];
    } else {
      // MINOR MILESTONES: Encouraging, supportive, friendly
      groupAnnouncements = [
        `**${achievers.length} members** just hit the **${milestone.toLocaleString()} ${typeInfo.label}** milestone! 🎉`,
        `Grabe! **${achievers.length} guild members** reached **${milestone.toLocaleString()} ${typeInfo.label}!** 🔥`,
        `Saludo sa **${achievers.length} achievers** na nag-**${milestone.toLocaleString()} ${typeInfo.label}!** 👑`,
        `**${achievers.length} legends** unlocked **${milestone.toLocaleString()} ${typeInfo.label}!** Lakasss! ⚡`,
        `Tuloy-tuloy! **${achievers.length} members** conquered **${milestone.toLocaleString()} ${typeInfo.label}!** 💪`,
        `Ayos! **${achievers.length} solid members** hit **${milestone.toLocaleString()} ${typeInfo.label}!** Keep it up! 🌟`,
        `Nice! **${achievers.length} grinders** reached **${milestone.toLocaleString()} ${typeInfo.label}!** Sipag! 📈`,
        `Congrats! **${achievers.length} active members** achieved **${milestone.toLocaleString()} ${typeInfo.label}!** Laban! 👊`,
      ];
    }

    const announcement = this.pickRandom(groupAnnouncements);

    // Closing with next goal
    const closing = this.getMilestoneClosing(nextMilestone, milestone);

    return new EmbedBuilder()
      .setColor(color)
      .setTitle(`${opening}`)
      .setDescription(
        `${announcement}\n\n${achieverList}\n\n${closing}`
      )
      .setFooter({
        text: `${typeInfo.emoji} ${typeInfo.label} | Milestone: ${milestone.toLocaleString()} | ${achievers.length} Achievers`
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
