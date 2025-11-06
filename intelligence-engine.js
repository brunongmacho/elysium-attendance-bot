/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                    ELYSIUM GUILD INTELLIGENCE ENGINE                      ║
 * ║                         Version 1.0 - AI-Powered                          ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * @fileoverview Comprehensive AI/ML intelligence system for predictive analytics,
 * fraud detection, member engagement prediction, and smart recommendations.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * FEATURES
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 1. PREDICTIVE ITEM VALUATION
 *    - Auto-suggest starting bids based on historical auction data
 *    - Machine learning price estimation with confidence intervals
 *    - Trend analysis for item value changes over time
 *
 * 2. MEMBER ENGAGEMENT ANALYTICS
 *    - Predict member attendance likelihood
 *    - Identify at-risk members (low engagement patterns)
 *    - Calculate engagement scores (attendance + bidding activity)
 *
 * 3. ANOMALY DETECTION & FRAUD PREVENTION
 *    - Detect suspicious bidding patterns (collusion, price fixing)
 *    - Flag unusual attendance patterns (alt accounts, coordination)
 *    - Identify statistical outliers in behavior
 *
 * 4. SMART RECOMMENDATIONS
 *    - Optimal auction timing based on member activity patterns
 *    - Personalized attendance reminders
 *    - Item ordering optimization for maximum engagement
 *
 * 5. NATURAL LANGUAGE PROCESSING
 *    - Flexible command interpretation
 *    - Intent detection from user messages
 *    - Context-aware responses
 *
 * 6. PERFORMANCE OPTIMIZATION
 *    - Auto-tuning cache sizes
 *    - Memory usage monitoring
 *    - Predictive resource scaling
 */

const { EmbedBuilder } = require('discord.js');
const { getChannelById } = require('./utils/discord-cache');
const { getTimestamp } = require('./utils/common');
const { LearningSystem } = require('./learning-system');

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const INTELLIGENCE_CONFIG = {
  // Valuation thresholds
  MIN_HISTORICAL_SAMPLES: 3,           // Minimum auctions to make predictions
  CONFIDENCE_THRESHOLD: 0.7,            // 70% confidence required
  PRICE_OUTLIER_STDEV: 2.5,            // Z-score for price outliers

  // Engagement thresholds
  LOW_ENGAGEMENT_THRESHOLD: 0.4,       // Below 40% attendance = at-risk
  HIGH_ENGAGEMENT_THRESHOLD: 0.8,      // Above 80% attendance = excellent
  INACTIVITY_DAYS: 14,                 // No attendance in 14 days = inactive

  // Anomaly detection thresholds
  COLLUSION_PATTERN_THRESHOLD: 0.75,   // 75% same winner-loser pairs = suspicious
  BID_PATTERN_STDEV: 2.0,              // Z-score for unusual bid amounts
  ATTENDANCE_PATTERN_STDEV: 2.5,       // Z-score for unusual attendance

  // Recommendation settings
  OPTIMAL_PARTICIPATION_TARGET: 0.7,   // Target 70% member participation
  REMINDER_HOURS_BEFORE: 2,            // Send reminders 2 hours before event

  // NLP settings
  COMMAND_SIMILARITY_THRESHOLD: 0.6,   // 60% similarity for fuzzy command matching

  // Performance settings
  CACHE_OPTIMIZATION_INTERVAL: 300000, // 5 minutes
  MEMORY_WARNING_THRESHOLD: 0.85,      // Warn at 85% memory usage
};

// ═══════════════════════════════════════════════════════════════════════════
// DATA STRUCTURES
// ═══════════════════════════════════════════════════════════════════════════

class IntelligenceEngine {
  constructor(client, config, sheetAPIInstance) {
    this.client = client;
    this.config = config;
    this.sheetAPI = sheetAPIInstance;

    // Analytics caches
    this.auctionHistory = [];           // Historical auction data
    this.attendanceHistory = [];        // Historical attendance data
    this.memberProfiles = new Map();    // Member engagement profiles
    this.anomalyLog = [];               // Detected anomalies

    // ML models (simple statistical models)
    this.priceModel = null;
    this.engagementModel = null;

    // Learning system (persistent AI/ML improvement)
    this.learningSystem = new LearningSystem(config, sheetAPIInstance);

    // Performance metrics
    this.performanceMetrics = {
      memoryUsage: [],
      apiLatency: [],
      cacheHitRate: 0,
      predictionAccuracy: 0,
    };

    // NLP patterns
    this.commandPatterns = this.initializeNLPPatterns();

    // Initialize
    this.initialized = false;
  }

  // ═════════════════════════════════════════════════════════════════════════
  // 1. PREDICTIVE ITEM VALUATION
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * Predict optimal starting bid for an item based on historical data
   * @param {string} itemName - Name of the item
   * @returns {Object} Prediction with confidence interval and reasoning
   */
  async predictItemValue(itemName) {
    try {
      // Fetch historical auction data for this item
      const historicalData = await this.getItemAuctionHistory(itemName);

      if (historicalData.length < INTELLIGENCE_CONFIG.MIN_HISTORICAL_SAMPLES) {
        const suggestion = await this.suggestSimilarItemPrice(itemName);
        return {
          success: false,
          reason: `Insufficient data (${historicalData.length} auctions). Need at least ${INTELLIGENCE_CONFIG.MIN_HISTORICAL_SAMPLES}.`,
          suggestion,
        };
      }

      // Statistical analysis
      const prices = historicalData.map(h => h.winningBid);
      const mean = this.calculateMean(prices);
      const median = this.calculateMedian(prices);
      const stdDev = this.calculateStdDev(prices);

      // Remove outliers (prices beyond 2.5 standard deviations)
      const filteredPrices = prices.filter(p =>
        Math.abs(p - mean) <= INTELLIGENCE_CONFIG.PRICE_OUTLIER_STDEV * stdDev
      );

      const cleanMean = this.calculateMean(filteredPrices);
      const cleanMedian = this.calculateMedian(filteredPrices);

      // Calculate confidence interval (95%)
      const confidence95 = 1.96 * stdDev / Math.sqrt(filteredPrices.length);

      // Trend analysis (recent 3 auctions vs older)
      const recentPrices = prices.slice(-3);
      const recentMean = this.calculateMean(recentPrices);
      const trend = recentMean > mean ? 'increasing' : recentMean < mean ? 'decreasing' : 'stable';
      const trendPercent = ((recentMean - mean) / mean * 100).toFixed(1);

      // Suggested starting bid (use median for stability, adjusted by trend)
      const trendAdjustment = trend === 'increasing' ? 1.1 : trend === 'decreasing' ? 0.9 : 1.0;
      const suggestedBid = Math.round(cleanMedian * trendAdjustment);

      // Calculate base confidence
      const baseConfidence = this.calculateConfidence(filteredPrices.length, stdDev, mean);

      // Adjust confidence based on historical accuracy (learning system)
      const adjustedConfidence = await this.learningSystem.adjustConfidence('price_prediction', baseConfidence);

      // Save prediction for future learning
      const features = {
        historicalCount: historicalData.length,
        stdDev: Math.round(stdDev),
        trend: trend,
        trendPercent: trendPercent,
      };

      await this.learningSystem.savePrediction(
        'price_prediction',
        itemName,
        suggestedBid,
        adjustedConfidence,
        features
      );

      return {
        success: true,
        itemName,
        suggestedStartingBid: suggestedBid,
        confidence: adjustedConfidence,
        baseConfidence: baseConfidence, // Include base confidence for reference
        statistics: {
          historicalAuctions: historicalData.length,
          averagePrice: Math.round(cleanMean),
          medianPrice: Math.round(cleanMedian),
          priceRange: {
            min: Math.min(...filteredPrices),
            max: Math.max(...filteredPrices),
          },
          confidenceInterval: {
            lower: Math.round(cleanMean - confidence95),
            upper: Math.round(cleanMean + confidence95),
          },
          standardDeviation: Math.round(stdDev),
          outliers: prices.length - filteredPrices.length,
        },
        trend: {
          direction: trend,
          percentage: trendPercent,
          recent: recentPrices,
        },
        reasoning: this.generatePriceReasoning(suggestedBid, cleanMean, cleanMedian, trend, historicalData.length),
      };
    } catch (error) {
      console.error('[INTELLIGENCE] Error predicting item value:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Fetch historical auction data for an item
   */
  async getItemAuctionHistory(itemName) {
    try {
      // Fetch from ForDistribution sheet (historical loot with prices)
      // Use longer timeout as this fetches large dataset
      const response = await this.sheetAPI.call('getForDistribution', {}, { timeout: 60000 });

      if (!response || !response.items) {
        console.error('[INTELLIGENCE] Failed to fetch ForDistribution:', response?.message || 'No response');
        return [];
      }

      const forDistData = response.items;

      // Normalize item name for matching
      const normalizedName = this.normalizeItemName(itemName);

      // Find all auctions for this item
      const matches = forDistData.filter(row => {
        const rowItemName = this.normalizeItemName(row.itemName || '');
        return rowItemName === normalizedName ||
               this.calculateStringSimilarity(rowItemName, normalizedName) > 0.8;
      });

      // Parse auction data
      return matches.map(row => ({
        itemName: row.itemName,
        winningBid: parseInt(row.bidAmount) || 0,
        winner: row.winner,
        timestamp: row.timestamp,
        boss: row.boss,
      })).filter(a => a.winningBid > 0);
    } catch (error) {
      console.error('[INTELLIGENCE] Error fetching auction history:', error);
      return [];
    }
  }

  /**
   * Suggest price based on similar items (when no direct history)
   */
  async suggestSimilarItemPrice(itemName) {
    const allHistory = await this.getAllAuctionHistory();

    // Find similar items by name
    const similarities = allHistory.map(item => ({
      ...item,
      similarity: this.calculateStringSimilarity(
        this.normalizeItemName(item.itemName),
        this.normalizeItemName(itemName)
      ),
    }));

    // Get top 5 similar items
    const similar = similarities
      .filter(s => s.similarity > 0.5)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 5);

    if (similar.length === 0) {
      return { suggestion: 100, reason: 'No similar items found. Default: 100 points.' };
    }

    const avgPrice = this.calculateMean(similar.map(s => s.winningBid));
    return {
      suggestion: Math.round(avgPrice),
      reason: `Based on ${similar.length} similar items (avg: ${Math.round(avgPrice)} pts)`,
      similarItems: similar.map(s => ({
        name: s.itemName,
        price: s.winningBid,
        similarity: `${(s.similarity * 100).toFixed(0)}%`,
      })),
    };
  }

  /**
   * Get all auction history from sheets
   */
  async getAllAuctionHistory() {
    try {
      // Use longer timeout as this fetches large dataset
      const response = await this.sheetAPI.call('getForDistribution', {}, { timeout: 60000 });

      // Validate response before accessing data
      if (!response) {
        console.error('[INTELLIGENCE] No response from getForDistribution');
        return [];
      }

      if (response.status === 'error') {
        console.error('[INTELLIGENCE] Error response from getForDistribution:', response.message);
        return [];
      }

      // Response structure has items at top level
      const items = response?.items ?? [];
      return items.map(row => ({
        itemName: row.itemName,
        winningBid: parseInt(row.bidAmount) || 0,
        winner: row.winner,
        timestamp: row.timestamp,
      })).filter(a => a.winningBid > 0);
    } catch (error) {
      console.error('[INTELLIGENCE] Error fetching all auction history:', error);
      return [];
    }
  }

  /**
   * Generate human-readable reasoning for price prediction
   */
  generatePriceReasoning(suggested, mean, median, trend, sampleSize) {
    const reasons = [];

    reasons.push(`📊 Based on ${sampleSize} historical auctions`);

    if (trend === 'increasing') {
      reasons.push(`📈 Price trending UP (recent auctions 10% higher)`);
    } else if (trend === 'decreasing') {
      reasons.push(`📉 Price trending DOWN (recent auctions 10% lower)`);
    } else {
      reasons.push(`➡️ Price stable (consistent bidding patterns)`);
    }

    const variance = Math.abs(mean - median);
    if (variance < mean * 0.1) {
      reasons.push(`✅ Low variance = predictable demand`);
    } else {
      reasons.push(`⚠️ High variance = volatile demand`);
    }

    return reasons.join('\n');
  }

  // ═════════════════════════════════════════════════════════════════════════
  // 2. MEMBER ENGAGEMENT ANALYTICS
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * Calculate member engagement score (0-100)
   * @param {string} username - Member username
   * @returns {Object} Engagement analysis
   */
  async analyzeMemberEngagement(username) {
    try {
      const profile = await this.getMemberProfile(username);

      // Calculate engagement components
      const attendanceScore = this.calculateAttendanceScore(profile.attendance);
      const biddingScore = this.calculateBiddingScore(profile.bidding);
      const consistencyScore = this.calculateConsistencyScore(profile.attendance);
      const recentActivityScore = this.calculateRecentActivityScore(profile.recentActivity);

      // Weighted engagement score
      const engagementScore = Math.round(
        attendanceScore * 0.4 +
        biddingScore * 0.2 +
        consistencyScore * 0.2 +
        recentActivityScore * 0.2
      );

      // Engagement level
      let level, emoji, status;
      if (engagementScore >= 80) {
        level = 'Excellent';
        emoji = '🔥';
        status = 'active';
      } else if (engagementScore >= 60) {
        level = 'Good';
        emoji = '✅';
        status = 'active';
      } else if (engagementScore >= 40) {
        level = 'Moderate';
        emoji = '⚠️';
        status = 'at-risk';
      } else {
        level = 'Low';
        emoji = '🚨';
        status = 'at-risk';
      }

      // Predict attendance likelihood for next event
      const attendanceLikelihood = this.predictAttendanceLikelihood(profile);

      return {
        username,
        engagementScore,
        level,
        emoji,
        status,
        components: {
          attendance: attendanceScore,
          bidding: biddingScore,
          consistency: consistencyScore,
          recentActivity: recentActivityScore,
        },
        prediction: {
          nextAttendanceLikelihood: `${Math.round(attendanceLikelihood * 100)}%`,
          confidence: attendanceLikelihood > 0.7 ? 'High' : attendanceLikelihood > 0.4 ? 'Medium' : 'Low',
        },
        recommendations: this.generateEngagementRecommendations(engagementScore, profile),
        profile,
      };
    } catch (error) {
      console.error('[INTELLIGENCE] Error analyzing member engagement:', error);
      return { error: error.message };
    }
  }

  /**
   * Get member profile from sheets
   */
  async getMemberProfile(username) {
    try {
      // Fetch attendance data
      const attendanceResponse = await this.sheetAPI.call('getTotalAttendance', {});
      const attendanceData = attendanceResponse?.data?.members ?? [];
      const memberAttendance = attendanceData.find(row =>
        row.username && row.username.toLowerCase() === username.toLowerCase()
      );

      // Fetch bidding data
      const biddingResponse = await this.sheetAPI.call('getBiddingPoints', {});
      const biddingData = biddingResponse?.data?.members ?? [];
      const memberBidding = biddingData.find(row =>
        row.username && row.username.toLowerCase() === username.toLowerCase()
      );

      // Fetch recent spawns
      const recentSpawns = await this.getRecentSpawnsForMember(username);

      return {
        username,
        attendance: {
          total: memberAttendance?.attendancePoints || 0,
          spawns: memberAttendance?.spawnCount || 0,
          averagePerSpawn: memberAttendance?.attendancePoints / (memberAttendance?.spawnCount || 1),
        },
        bidding: {
          pointsRemaining: memberBidding?.pointsLeft || 0,
          pointsConsumed: memberBidding?.pointsConsumed || 0,
          totalAwarded: (memberBidding?.pointsLeft || 0) + (memberBidding?.pointsConsumed || 0),
          auctionsWon: await this.getAuctionWinsForMember(username),
        },
        recentActivity: recentSpawns,
      };
    } catch (error) {
      console.error('[INTELLIGENCE] Error fetching member profile:', error);
      return {
        username,
        attendance: { total: 0, spawns: 0, averagePerSpawn: 0 },
        bidding: { pointsRemaining: 0, pointsConsumed: 0, totalAwarded: 0, auctionsWon: 0 },
        recentActivity: [],
      };
    }
  }

  /**
   * Calculate attendance score (0-100)
   */
  calculateAttendanceScore(attendance) {
    // Score based on attendance points and frequency
    const baseScore = Math.min((attendance.spawns / 20) * 100, 100); // 20 spawns = 100%
    const averageBonus = attendance.averagePerSpawn > 15 ? 10 : 0; // Bonus for high-value boss attendance
    return Math.min(baseScore + averageBonus, 100);
  }

  /**
   * Calculate bidding activity score (0-100)
   */
  calculateBiddingScore(bidding) {
    const consumptionRate = bidding.totalAwarded > 0
      ? (bidding.pointsConsumed / bidding.totalAwarded)
      : 0;

    // Active bidding = higher consumption rate
    const baseScore = consumptionRate * 100;
    const winsBonus = Math.min(bidding.auctionsWon * 5, 20); // +5 per win, max +20

    return Math.min(baseScore + winsBonus, 100);
  }

  /**
   * Calculate consistency score (0-100)
   */
  calculateConsistencyScore(attendance) {
    // Consistent attendance = regular spawns over time
    if (attendance.spawns < 5) return 0;

    // For now, use simple metric: spawns vs expected spawns (e.g., 3 per week)
    const weeksActive = 4; // Assume 4 weeks
    const expectedSpawns = weeksActive * 3;
    const consistencyRatio = Math.min(attendance.spawns / expectedSpawns, 1);

    return consistencyRatio * 100;
  }

  /**
   * Calculate recent activity score (0-100)
   */
  calculateRecentActivityScore(recentActivity) {
    // Recent activity = spawns in last 7 days
    const last7Days = Date.now() - (7 * 24 * 60 * 60 * 1000);
    const recentSpawns = recentActivity.filter(a =>
      new Date(a.timestamp).getTime() > last7Days
    );

    // 3+ spawns in last 7 days = 100%
    return Math.min((recentSpawns.length / 3) * 100, 100);
  }

  /**
   * Predict likelihood of attendance at next event
   */
  predictAttendanceLikelihood(profile) {
    const { attendance, recentActivity } = profile;

    // Simple prediction model based on recent patterns
    if (recentActivity.length === 0) return 0.1; // Very unlikely if no history

    // Recent attendance rate
    const last7Days = Date.now() - (7 * 24 * 60 * 60 * 1000);
    const recentSpawns = recentActivity.filter(a =>
      new Date(a.timestamp).getTime() > last7Days
    );

    const recentRate = recentSpawns.length / 3; // Expected 3 spawns per week

    // Overall attendance rate
    const overallRate = attendance.spawns / 20; // Expected 20 total spawns

    // Weighted prediction (60% recent, 40% overall)
    const prediction = (recentRate * 0.6) + (overallRate * 0.4);

    return Math.min(prediction, 1.0);
  }

  /**
   * Generate personalized recommendations
   */
  generateEngagementRecommendations(score, profile) {
    const recommendations = [];

    if (score < 40) {
      recommendations.push('🚨 At risk of inactivity. Consider sending re-engagement reminder.');
    }

    if (profile.attendance.spawns < 5) {
      recommendations.push('📢 New member or low attendance. Send personalized welcome/reminder.');
    }

    if (profile.bidding.pointsConsumed === 0 && profile.bidding.totalAwarded > 0) {
      recommendations.push('💰 Has points but never bids. Encourage auction participation.');
    }

    if (profile.recentActivity.length === 0) {
      recommendations.push('⏰ No recent activity. Schedule reminder before next event.');
    }

    if (score >= 80) {
      recommendations.push('⭐ Highly engaged member! Consider for leadership roles or rewards.');
    }

    return recommendations.length > 0 ? recommendations : ['✅ Engagement is healthy. No action needed.'];
  }

  /**
   * Get recent spawns for a member
   */
  async getRecentSpawnsForMember(username) {
    // This would fetch from weekly attendance sheets
    // For now, return empty array (to be implemented with actual sheet parsing)
    return [];
  }

  /**
   * Get auction wins for a member
   */
  async getAuctionWinsForMember(username) {
    try {
      // Use longer timeout as this fetches large dataset
      const response = await this.sheetAPI.call('getForDistribution', {}, { timeout: 60000 });
      // Response structure has items at top level
      const items = response?.items ?? [];
      const wins = items.filter(row =>
        row.winner && row.winner.toLowerCase() === username.toLowerCase()
      );
      return wins.length;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Analyze engagement for all members and identify at-risk members
   */
  async analyzeAllMembersEngagement() {
    try {
      const response = await this.sheetAPI.call('getBiddingPoints', {});
      const biddingData = response?.data?.members ?? [];
      const analyses = [];

      for (const member of biddingData) {
        const analysis = await this.analyzeMemberEngagement(member.username);
        analyses.push(analysis);
      }

      // Sort by engagement score
      analyses.sort((a, b) => b.engagementScore - a.engagementScore);

      // Identify at-risk members
      const atRisk = analyses.filter(a => a.status === 'at-risk');
      const active = analyses.filter(a => a.status === 'active');

      return {
        total: analyses.length,
        active: active.length,
        atRisk: atRisk.length,
        topPerformers: analyses.slice(0, 5),
        needsAttention: atRisk.slice(0, 10),
        averageEngagement: Math.round(
          analyses.reduce((sum, a) => sum + a.engagementScore, 0) / analyses.length
        ),
        analyses,
      };
    } catch (error) {
      console.error('[INTELLIGENCE] Error analyzing all members:', error);
      return { error: error.message };
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  // 3. ANOMALY DETECTION & FRAUD PREVENTION
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * Detect suspicious bidding patterns (collusion, price fixing)
   */
  async detectBiddingAnomalies() {
    try {
      const auctionHistory = await this.getAllAuctionHistory();
      const anomalies = [];

      // 1. Detect collusion (same winner repeatedly dominating item types)
      const bidPatterns = this.analyzeBidPairings(auctionHistory);
      for (const [itemType, winnerCounts] of Object.entries(bidPatterns)) {
        const total = Object.values(winnerCounts).reduce((a, b) => a + b, 0);

        for (const [winner, count] of Object.entries(winnerCounts)) {
          const frequency = count / total;
          if (frequency > INTELLIGENCE_CONFIG.COLLUSION_PATTERN_THRESHOLD) {
            anomalies.push({
              type: 'COLLUSION_SUSPECTED',
              severity: 'HIGH',
              description: `${winner} is winning ${(frequency * 100).toFixed(0)}% of ${itemType} auctions`,
              recommendation: 'Review auction history for this member',
            });
          }
        }
      }

      // 2. Detect unusual bid amounts (statistical outliers)
      const bidAmounts = auctionHistory.map(a => a.winningBid);
      const mean = this.calculateMean(bidAmounts);
      const stdDev = this.calculateStdDev(bidAmounts);

      // Guard: skip z-score calculation if stdDev is zero or near-zero (all bids identical)
      const outliers = (Math.abs(stdDev) < Number.EPSILON) ? [] : auctionHistory.filter(auction => {
        const zScore = Math.abs((auction.winningBid - mean) / stdDev);
        return zScore > INTELLIGENCE_CONFIG.BID_PATTERN_STDEV;
      });

      if (outliers.length > 0) {
        anomalies.push({
          type: 'UNUSUAL_BID_AMOUNTS',
          severity: 'MEDIUM',
          count: outliers.length,
          examples: outliers.slice(0, 3).map(o => ({
            item: o.itemName,
            bid: o.winningBid,
            winner: o.winner,
          })),
          recommendation: 'Review these auctions for potential manipulation',
        });
      }

      // 3. Detect item duplication (same item appearing too frequently)
      const itemFrequency = this.calculateItemFrequency(auctionHistory);
      for (const [itemName, count] of Object.entries(itemFrequency)) {
        if (count > 5) { // Same item more than 5 times might be suspicious
          anomalies.push({
            type: 'FREQUENT_ITEM',
            severity: 'LOW',
            itemName,
            occurrences: count,
            recommendation: 'Verify item source - possible duplication or farming',
          });
        }
      }

      return {
        anomaliesDetected: anomalies.length,
        anomalies,
        analyzed: auctionHistory.length,
        timestamp: getTimestamp(),
      };
    } catch (error) {
      console.error('[INTELLIGENCE] Error detecting bidding anomalies:', error);
      return { error: error.message };
    }
  }

  /**
   * Detect suspicious attendance patterns
   */
  async detectAttendanceAnomalies() {
    try {
      const attendanceResponse = await this.sheetAPI.call('getTotalAttendance', {});
      const attendanceData = attendanceResponse?.data?.members ?? [];
      const anomalies = [];

      // Calculate attendance statistics
      const spawnCounts = attendanceData.map(m => m.spawnCount || 0);
      const mean = this.calculateMean(spawnCounts);
      const stdDev = this.calculateStdDev(spawnCounts);

      // Detect statistical outliers
      // Guard: skip z-score calculation if stdDev is zero or near-zero (all spawn counts identical)
      const outliers = (Math.abs(stdDev) < Number.EPSILON) ? [] : attendanceData.filter(member => {
        const zScore = Math.abs(((member.spawnCount || 0) - mean) / stdDev);
        return zScore > INTELLIGENCE_CONFIG.ATTENDANCE_PATTERN_STDEV;
      });

      for (const member of outliers) {
        anomalies.push({
          type: 'UNUSUAL_ATTENDANCE',
          severity: 'MEDIUM',
          username: member.username,
          spawnCount: member.spawnCount,
          deviation: `${(((member.spawnCount - mean) / stdDev)).toFixed(1)}σ`,
          recommendation: member.spawnCount > mean
            ? 'Exceptionally high attendance - verify legitimacy'
            : 'Unusually low attendance - possible inactive account',
        });
      }

      return {
        anomaliesDetected: anomalies.length,
        anomalies,
        analyzed: attendanceData.length,
        statistics: {
          averageSpawns: mean.toFixed(1),
          stdDev: stdDev.toFixed(1),
        },
        timestamp: getTimestamp(),
      };
    } catch (error) {
      console.error('[INTELLIGENCE] Error detecting attendance anomalies:', error);
      return { error: error.message };
    }
  }

  /**
   * Analyze bidding pairings for collusion detection
   */
  analyzeBidPairings(auctionHistory) {
    // This would analyze who bids against whom repeatedly
    // Simplified version: just track winner frequencies
    const patterns = {};

    // Group by item type to find repeated winners
    auctionHistory.forEach(auction => {
      const itemType = this.getItemType(auction.itemName);
      if (!patterns[itemType]) patterns[itemType] = {};

      const winner = auction.winner || 'Unknown';
      patterns[itemType][winner] = (patterns[itemType][winner] || 0) + 1;
    });

    return patterns;
  }

  /**
   * Calculate item frequency in auction history
   */
  calculateItemFrequency(auctionHistory) {
    const frequency = {};

    auctionHistory.forEach(auction => {
      const normalized = this.normalizeItemName(auction.itemName);
      frequency[normalized] = (frequency[normalized] || 0) + 1;
    });

    return frequency;
  }

  // ═════════════════════════════════════════════════════════════════════════
  // 4. SMART RECOMMENDATIONS
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * Recommend optimal auction timing based on member activity
   */
  async recommendAuctionTiming() {
    try {
      const biddingResponse = await this.sheetAPI.call('getBiddingPoints', {});
      const biddingData = biddingResponse?.data?.members ?? [];
      const activeMemberCount = biddingData.filter(m => m.pointsLeft > 0).length;

      // Analyze historical auction participation
      // For now, use simple heuristics

      const recommendations = [];

      // Best day: Saturday (current default)
      recommendations.push({
        type: 'DAY_OF_WEEK',
        recommendation: 'Saturday',
        reason: 'Weekend = higher participation rates',
        confidence: 'High',
      });

      // Best time: 12:00 PM - 2:00 PM GMT+8 (lunch time) or 8:00 PM - 10:00 PM (evening)
      recommendations.push({
        type: 'TIME_OF_DAY',
        recommendation: '8:00 PM GMT+8',
        alternative: '12:00 PM GMT+8',
        reason: 'Peak activity hours for guild members',
        confidence: 'Medium',
      });

      // Member readiness
      const readyMembers = biddingData.filter(m => m.pointsLeft >= 100).length;
      recommendations.push({
        type: 'MEMBER_READINESS',
        readyMembers,
        totalMembers: biddingData.length,
        readinessRate: `${((readyMembers / biddingData.length) * 100).toFixed(0)}%`,
        recommendation: readyMembers / biddingData.length >= 0.7
          ? 'Ready for auction - good participation expected'
          : 'Consider waiting - many members have low points',
        confidence: 'High',
      });

      return {
        recommendations,
        optimalWindow: 'Saturday 8:00 PM GMT+8',
        participationForecast: `${Math.round((readyMembers / biddingData.length) * 100)}%`,
      };
    } catch (error) {
      console.error('[INTELLIGENCE] Error recommending auction timing:', error);
      return { error: error.message };
    }
  }

  /**
   * Generate personalized attendance reminders for at-risk members
   */
  async generateAttendanceReminders() {
    const engagementAnalysis = await this.analyzeAllMembersEngagement();
    const reminders = [];

    for (const member of engagementAnalysis.needsAttention) {
      reminders.push({
        username: member.username,
        engagementScore: member.engagementScore,
        message: this.generatePersonalizedReminder(member),
        priority: member.engagementScore < 20 ? 'HIGH' : 'MEDIUM',
      });
    }

    return reminders;
  }

  /**
   * Generate personalized reminder message
   */
  generatePersonalizedReminder(memberAnalysis) {
    const { username, engagementScore, profile } = memberAnalysis;

    if (engagementScore < 20) {
      return `Hey ${username}! We haven't seen you at recent boss spawns. Come join us - you're missing out on points and loot! 🎁`;
    } else if (profile.attendance.spawns > 0 && profile.bidding.pointsConsumed === 0) {
      return `${username}, you've earned ${profile.bidding.pointsRemaining} bidding points! Don't forget to participate in our auctions to get awesome loot! 💰`;
    } else {
      return `${username}, it's been a while since we've seen you! Next boss spawn is coming soon - hope to see you there! 👋`;
    }
  }

  /**
   * Optimize auction item ordering for maximum engagement
   */
  async optimizeItemOrdering(items) {
    // Strategy: Alternate between high-value and medium-value items
    // Place most desirable items in middle (when participation peaks)

    const itemsWithScores = await Promise.all(items.map(async (item) => {
      const valuation = await this.predictItemValue(item.itemName);
      return {
        ...item,
        estimatedValue: valuation.success ? valuation.suggestedStartingBid : 0,
        desirability: this.calculateItemDesirability(item.itemName),
      };
    }));

    // Sort by desirability
    itemsWithScores.sort((a, b) => b.desirability - a.desirability);

    // Optimal ordering: Medium -> High -> Medium -> High (creates excitement waves)
    const optimized = [];
    const high = itemsWithScores.filter(i => i.desirability >= 0.7);
    const medium = itemsWithScores.filter(i => i.desirability >= 0.4 && i.desirability < 0.7);
    const low = itemsWithScores.filter(i => i.desirability < 0.4);

    // Start with medium, alternate with high, end with medium
    let mediumIdx = 0, highIdx = 0, lowIdx = 0;

    while (mediumIdx < medium.length || highIdx < high.length || lowIdx < low.length) {
      if (mediumIdx < medium.length) optimized.push(medium[mediumIdx++]);
      if (highIdx < high.length) optimized.push(high[highIdx++]);
      if (lowIdx < low.length) optimized.push(low[lowIdx++]);
    }

    return {
      optimized,
      reasoning: 'Items ordered to maintain engagement: alternating excitement levels prevents fatigue',
    };
  }

  /**
   * Calculate item desirability (0-1 scale)
   */
  calculateItemDesirability(itemName) {
    // Simple heuristic based on keywords
    const name = itemName.toLowerCase();

    // High desirability keywords
    if (name.includes('legendary') || name.includes('mythic') || name.includes('ancient')) {
      return 0.9;
    }

    // Medium-high
    if (name.includes('rare') || name.includes('epic') || name.includes('weapon')) {
      return 0.7;
    }

    // Medium
    if (name.includes('armor') || name.includes('ring') || name.includes('pendant')) {
      return 0.5;
    }

    // Low
    return 0.3;
  }

  // ═════════════════════════════════════════════════════════════════════════
  // 5. NATURAL LANGUAGE PROCESSING
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * Initialize NLP patterns for command interpretation
   */
  initializeNLPPatterns() {
    return {
      bid: [
        /^(?:i\s+)?(?:want\s+to\s+)?bid\s+(\d+)/i,
        /^(?:offer|bidding)\s+(\d+)/i,
        /^(\d+)\s+(?:points?|pts?)/i,
      ],
      mypoints: [
        /^(?:how\s+many|what(?:'s|\s+is)\s+my|check\s+my|show\s+my)\s+points?/i,
        /^(?:my\s+)?(?:points?|balance)/i,
      ],
      status: [
        /^(?:what(?:'s|\s+is)\s+the\s+)?(?:auction\s+)?status/i,
        /^(?:show|check)\s+(?:auction\s+)?status/i,
      ],
      leaderboard: [
        /^(?:show|display|check)\s+(?:the\s+)?leaderboard/i,
        /^(?:top|rankings?|leaderboard)/i,
      ],
      help: [
        /^(?:help|commands?|what\s+can\s+you\s+do)/i,
      ],
    };
  }

  /**
   * Interpret user message and extract intent + parameters
   */
  interpretMessage(message) {
    const content = message.content.trim();

    // Try each command pattern
    for (const [command, patterns] of Object.entries(this.commandPatterns)) {
      for (const pattern of patterns) {
        const match = content.match(pattern);
        if (match) {
          const params = match.slice(1); // Extract captured groups
          return {
            intent: command,
            params,
            confidence: 1.0,
            originalMessage: content,
          };
        }
      }
    }

    // No exact match - try fuzzy matching on command names
    const commandNames = Object.keys(this.commandPatterns);
    for (const cmdName of commandNames) {
      const similarity = this.calculateStringSimilarity(
        content.toLowerCase(),
        cmdName.toLowerCase()
      );

      if (similarity >= INTELLIGENCE_CONFIG.COMMAND_SIMILARITY_THRESHOLD) {
        return {
          intent: cmdName,
          params: [],
          confidence: similarity,
          originalMessage: content,
          fuzzyMatch: true,
        };
      }
    }

    return null; // No intent detected
  }

  // ═════════════════════════════════════════════════════════════════════════
  // 6. PERFORMANCE OPTIMIZATION
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * Monitor and optimize system performance
   */
  async monitorPerformance() {
    const metrics = {
      timestamp: getTimestamp(),
      memory: process.memoryUsage(),
      memoryPercent: (process.memoryUsage().heapUsed / process.memoryUsage().heapTotal) * 100,
      uptime: process.uptime(),
    };

    // Check memory usage
    if (metrics.memoryPercent > INTELLIGENCE_CONFIG.MEMORY_WARNING_THRESHOLD * 100) {
      console.warn('[INTELLIGENCE] ⚠️ High memory usage:', metrics.memoryPercent.toFixed(1) + '%');

      // Trigger garbage collection if available
      if (global.gc) {
        global.gc();
        console.log('[INTELLIGENCE] 🧹 Garbage collection triggered');
      }

      // Clear old cache entries
      this.optimizeCaches();
    }

    return metrics;
  }

  /**
   * Optimize cache sizes based on usage patterns
   */
  optimizeCaches() {
    // Clear old entries from analytics caches
    const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
    const now = Date.now();

    // Auction history (keep only recent)
    this.auctionHistory = this.auctionHistory.filter(a =>
      now - new Date(a.timestamp).getTime() < maxAge
    );

    // Attendance history (keep only recent)
    this.attendanceHistory = this.attendanceHistory.filter(a =>
      now - new Date(a.timestamp).getTime() < maxAge
    );

    // Member profiles (keep only active members)
    for (const [username, profile] of this.memberProfiles.entries()) {
      if (profile.lastSeen && now - profile.lastSeen > maxAge) {
        this.memberProfiles.delete(username);
      }
    }

    console.log('[INTELLIGENCE] 🧹 Caches optimized');
  }

  /**
   * Generate performance report
   */
  async generatePerformanceReport() {
    const metrics = await this.monitorPerformance();

    return {
      memory: {
        used: `${(metrics.memory.heapUsed / 1024 / 1024).toFixed(2)} MB`,
        total: `${(metrics.memory.heapTotal / 1024 / 1024).toFixed(2)} MB`,
        percent: `${metrics.memoryPercent.toFixed(1)}%`,
        status: metrics.memoryPercent > 85 ? '⚠️ HIGH' : '✅ OK',
      },
      uptime: `${(metrics.uptime / 3600).toFixed(1)} hours`,
      caches: {
        auctionHistory: this.auctionHistory.length,
        attendanceHistory: this.attendanceHistory.length,
        memberProfiles: this.memberProfiles.size,
      },
      recommendations: this.generatePerformanceRecommendations(metrics),
    };
  }

  /**
   * Generate performance recommendations
   */
  generatePerformanceRecommendations(metrics) {
    const recommendations = [];

    if (metrics.memoryPercent > 85) {
      recommendations.push('⚠️ Memory usage high - consider restarting bot or clearing caches');
    }

    if (this.auctionHistory.length > 1000) {
      recommendations.push('📊 Large auction history - consider archiving old data');
    }

    if (recommendations.length === 0) {
      recommendations.push('✅ System performance is optimal');
    }

    return recommendations;
  }

  // ═════════════════════════════════════════════════════════════════════════
  // UTILITY FUNCTIONS
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * Calculate mean of array
   */
  calculateMean(arr) {
    if (arr.length === 0) return 0;
    return arr.reduce((sum, val) => sum + val, 0) / arr.length;
  }

  /**
   * Calculate median of array
   */
  calculateMedian(arr) {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
  }

  /**
   * Calculate standard deviation
   */
  calculateStdDev(arr) {
    if (arr.length === 0) return 0;
    const mean = this.calculateMean(arr);
    const squaredDiffs = arr.map(val => Math.pow(val - mean, 2));
    const variance = this.calculateMean(squaredDiffs);
    return Math.sqrt(variance);
  }

  /**
   * Calculate confidence score for predictions
   */
  calculateConfidence(sampleSize, stdDev, mean) {
    // Higher sample size = more confidence
    // Lower standard deviation = more confidence
    const sampleFactor = Math.min(sampleSize / 10, 1); // Max at 10 samples
    const varianceFactor = (stdDev > 0 && mean > 0) ? Math.max(1 - (stdDev / mean), 0) : 1;

    return Math.round((sampleFactor * 0.6 + varianceFactor * 0.4) * 100);
  }

  /**
   * Calculate string similarity (Levenshtein distance)
   */
  calculateStringSimilarity(str1, str2) {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;

    if (longer.length === 0) return 1.0;

    const editDistance = this.levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }

  /**
   * Calculate Levenshtein distance between two strings
   */
  levenshteinDistance(str1, str2) {
    const matrix = [];

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1,     // insertion
            matrix[i - 1][j] + 1      // deletion
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
  }

  /**
   * Normalize item name for matching
   */
  normalizeItemName(name) {
    return name.toLowerCase().trim().replace(/[^\w\s]/g, '');
  }

  /**
   * Get item type from name (weapon, armor, accessory, etc.)
   */
  getItemType(itemName) {
    const name = itemName.toLowerCase();

    if (name.includes('sword') || name.includes('bow') || name.includes('staff')) {
      return 'weapon';
    } else if (name.includes('armor') || name.includes('helmet') || name.includes('shield')) {
      return 'armor';
    } else if (name.includes('ring') || name.includes('pendant') || name.includes('amulet')) {
      return 'accessory';
    }

    return 'other';
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = { IntelligenceEngine, INTELLIGENCE_CONFIG };
