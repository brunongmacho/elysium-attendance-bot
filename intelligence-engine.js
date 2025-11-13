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
const { getCurrentTimestamp } = require('./utils/timestamp-cache');
const { LearningSystem } = require('./learning-system');
const fs = require('fs');
const path = require('path');

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

    // API call cache to prevent duplicate concurrent calls (reduces timeouts)
    this.apiCallCache = new Map();      // { endpoint: { data, timestamp, promise } }
    this.apiCacheTTL = 60000;           // 60 second cache TTL

    // ML models (simple statistical models)
    this.priceModel = null;
    this.engagementModel = null;

    // Learning system (persistent AI/ML improvement)
    this.learningSystem = new LearningSystem(config, sheetAPIInstance);

    // Spawn prediction cache (reduces redundant calculations and API calls)
    this.spawnPredictionCache = {
      predictions: null,           // Cached predictions for all bosses
      spawnCount: 0,              // Number of spawns when predictions were made
      timestamp: 0,               // When predictions were cached
      ttl: 30 * 60 * 1000,        // 30-minute cache TTL
    };

    // Per-boss prediction cache (prevents spam when checking rotation bosses every 5 min)
    this.bossPredictionCache = new Map(); // Map<bossName, {prediction, timestamp, ttl}>

    // Boss spawn configuration (timer and schedule-based spawns)
    this.bossSpawnConfig = this.loadBossSpawnConfig();

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
  // API CALL CACHING (Prevents timeout from duplicate concurrent calls)
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * Cached API call wrapper to prevent duplicate concurrent requests
   * @param {string} endpoint - API endpoint name
   * @param {Object} data - Request data
   * @param {Object} options - Request options
   * @returns {Promise} API response
   */
  async cachedAPICall(endpoint, data = {}, options = {}) {
    const cacheKey = `${endpoint}:${JSON.stringify(data)}`;
    const now = Date.now();

    // Check if we have a cached result
    const cached = this.apiCallCache.get(cacheKey);
    if (cached) {
      // Return cached data if still fresh
      if (now - cached.timestamp < this.apiCacheTTL) {
        return cached.data;
      }

      // Return in-flight promise if already requesting
      if (cached.promise) {
        return await cached.promise;
      }
    }

    // Create new request and cache the promise
    const promise = this.sheetAPI.call(endpoint, data, options);
    this.apiCallCache.set(cacheKey, { promise, timestamp: now });

    try {
      const result = await promise;

      // Cache the result
      this.apiCallCache.set(cacheKey, { data: result, timestamp: now });

      // Cleanup old cache entries (prevent memory leak)
      if (this.apiCallCache.size > 50) {
        const entriesToDelete = [];
        for (const [key, value] of this.apiCallCache.entries()) {
          if (now - value.timestamp > this.apiCacheTTL) {
            entriesToDelete.push(key);
          }
        }
        entriesToDelete.forEach(key => this.apiCallCache.delete(key));
      }

      return result;
    } catch (error) {
      // Remove failed promise from cache
      this.apiCallCache.delete(cacheKey);
      throw error;
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  // BOSS SPAWN CONFIGURATION
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * Load boss spawn configuration from JSON file
   * @returns {Object} Boss spawn configuration with timer and schedule-based data
   */
  loadBossSpawnConfig() {
    try {
      const configPath = path.join(__dirname, 'boss_spawn_config.json');
      if (fs.existsSync(configPath)) {
        const configData = fs.readFileSync(configPath, 'utf8');
        const config = JSON.parse(configData);
        console.log('[INTELLIGENCE] Boss spawn configuration loaded successfully');
        return config;
      } else {
        console.warn('[INTELLIGENCE] Boss spawn config file not found, using historical data only');
        return { timerBasedBosses: {}, scheduleBasedBosses: {} };
      }
    } catch (error) {
      console.error('[INTELLIGENCE] Error loading boss spawn config:', error);
      return { timerBasedBosses: {}, scheduleBasedBosses: {} };
    }
  }

  /**
   * Get boss spawn type and configuration
   * @param {string} bossName - Boss name
   * @returns {Object|null} Boss spawn info { type: 'timer'|'schedule', config: {...} }
   */
  getBossSpawnType(bossName) {
    if (!this.bossSpawnConfig) {
      return null;
    }

    const normalizedName = bossName.trim();

    // Check timer-based bosses (case-insensitive)
    for (const [configBossName, config] of Object.entries(this.bossSpawnConfig.timerBasedBosses || {})) {
      if (configBossName.toLowerCase() === normalizedName.toLowerCase()) {
        return {
          type: 'timer',
          config: config,
          name: configBossName,
        };
      }
    }

    // Check schedule-based bosses (case-insensitive)
    for (const [configBossName, config] of Object.entries(this.bossSpawnConfig.scheduleBasedBosses || {})) {
      if (configBossName.toLowerCase() === normalizedName.toLowerCase()) {
        return {
          type: 'schedule',
          config: config,
          name: configBossName,
        };
      }
    }

    return null;
  }

  /**
   * Quick check if boss spawn is likely within a time window (uses cache, no API call)
   * Used to avoid expensive predictions when boss is definitely far from spawning
   * @param {string} bossName - Boss name
   * @param {number} maxHoursAway - Max hours away to consider "soon" (default: 2 hours)
   * @returns {boolean} True if spawn might be within window (or unknown), false if definitely far away
   */
  isSpawnLikelySoon(bossName, maxHoursAway = 2) {
    try {
      const cacheKey = bossName.toLowerCase();
      const cached = this.bossPredictionCache.get(cacheKey);

      // If we have a cached prediction, use it for quick check
      if (cached && cached.prediction && cached.prediction.predictedTime) {
        const now = new Date();
        const predictedTime = new Date(cached.prediction.predictedTime);
        const hoursUntilSpawn = (predictedTime - now) / (1000 * 60 * 60);

        // If spawn is definitely far away (>maxHoursAway), return false
        // Add 1 hour buffer for prediction variance
        return hoursUntilSpawn <= (maxHoursAway + 1);
      }

      // No cached data - assume spawn might be soon (don't skip the check)
      return true;
    } catch (error) {
      // On error, assume spawn might be soon (safer to check than skip)
      return true;
    }
  }

  /**
   * Calculate next spawn time for schedule-based boss
   * @param {Object} scheduleConfig - Boss schedule configuration
   * @returns {Date} Next spawn time
   */
  calculateNextScheduledSpawn(scheduleConfig) {
    const now = new Date();
    const schedules = scheduleConfig.schedules || [];

    if (schedules.length === 0) {
      return null;
    }

    const upcomingSpawns = [];

    for (const schedule of schedules) {
      const [hours, minutes] = schedule.time.split(':').map(Number);
      const dayOfWeek = schedule.dayOfWeek;

      // Calculate next occurrence of this schedule
      const nextSpawn = new Date(now);
      const currentDay = nextSpawn.getDay();

      // Days until next occurrence
      let daysUntil = dayOfWeek - currentDay;
      if (daysUntil < 0) {
        daysUntil += 7;
      } else if (daysUntil === 0) {
        // If it's today, check if the time has passed
        const todaySpawnTime = new Date(now);
        todaySpawnTime.setHours(hours, minutes, 0, 0);

        if (now >= todaySpawnTime) {
          // Time has passed, next spawn is next week
          daysUntil = 7;
        }
      }

      nextSpawn.setDate(nextSpawn.getDate() + daysUntil);
      nextSpawn.setHours(hours, minutes, 0, 0);

      upcomingSpawns.push(nextSpawn);
    }

    // Return the soonest spawn time
    upcomingSpawns.sort((a, b) => a - b);
    return upcomingSpawns[0];
  }

  // ═════════════════════════════════════════════════════════════════════════
  // 1. PREDICTIVE ITEM VALUATION
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * Predict optimal starting bid for an item based on historical data
   * @param {string} itemName - Name of the item
   * @param {Array} cachedAuctionHistory - Optional pre-fetched auction history to avoid redundant API calls
   * @returns {Object} Prediction with confidence interval and reasoning
   */
  async predictItemValue(itemName, cachedAuctionHistory = null) {
    try {
      // Fetch historical auction data for this item (use cache if available)
      const historicalData = cachedAuctionHistory
        ? this.filterAuctionHistoryByItem(itemName, cachedAuctionHistory)
        : await this.getItemAuctionHistory(itemName);

      if (historicalData.length < INTELLIGENCE_CONFIG.MIN_HISTORICAL_SAMPLES) {
        const suggestion = await this.suggestSimilarItemPrice(itemName, cachedAuctionHistory);
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
   * Filter cached auction history for a specific item
   * @param {string} itemName - Name of the item to filter for
   * @param {Array} auctionHistory - Pre-fetched auction history data
   * @returns {Array} Filtered auction data for this item
   */
  filterAuctionHistoryByItem(itemName, auctionHistory) {
    // Normalize item name for matching
    const normalizedName = this.normalizeItemName(itemName);

    // Find all auctions for this item
    const matches = auctionHistory.filter(row => {
      const rowItemName = this.normalizeItemName(row.itemName || '');
      return rowItemName === normalizedName ||
             this.calculateStringSimilarity(rowItemName, normalizedName) > 0.8;
    });

    // Return filtered data (already in correct format from getAllAuctionHistory)
    return matches.filter(a => a.winningBid > 0);
  }

  /**
   * Suggest price based on similar items (when no direct history)
   * @param {string} itemName - Name of the item
   * @param {Array} cachedAuctionHistory - Optional pre-fetched auction history to avoid redundant API calls
   */
  async suggestSimilarItemPrice(itemName, cachedAuctionHistory = null) {
    const allHistory = cachedAuctionHistory || await this.getAllAuctionHistory();

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
   * @param {Object} cachedData - Optional pre-fetched data to avoid redundant API calls
   * @returns {Object} Engagement analysis
   */
  async analyzeMemberEngagement(username, cachedData = {}) {
    try {
      const profile = await this.getMemberProfile(username, cachedData);

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
   * @param {string} username - Member username
   * @param {Object} cachedData - Optional pre-fetched data to avoid redundant API calls
   * @param {Array} cachedData.attendanceData - Pre-fetched attendance data
   * @param {Array} cachedData.biddingData - Pre-fetched bidding data
   * @param {Object} cachedData.weeklyAttendance - Pre-fetched weekly attendance data
   * @param {Array} cachedData.auctionData - Pre-fetched auction/distribution data
   */
  async getMemberProfile(username, cachedData = {}) {
    try {
      // Use cached data if available, otherwise fetch
      let attendanceData, biddingData, auctionWins;

      if (cachedData.attendanceData) {
        attendanceData = cachedData.attendanceData;
      } else {
        const attendanceResponse = await this.cachedAPICall('getTotalAttendance', {});
        attendanceData = attendanceResponse?.members ?? [];
      }

      if (cachedData.biddingData) {
        biddingData = cachedData.biddingData;
      } else {
        const biddingResponse = await this.sheetAPI.call('getBiddingPoints', {});
        biddingData = biddingResponse?.members ?? [];
      }

      // Use cached auction data if available to avoid redundant API calls
      if (cachedData.auctionData) {
        // Count wins from cached auction data
        auctionWins = cachedData.auctionData.filter(row =>
          row.winner && row.winner.toLowerCase() === username.toLowerCase()
        ).length;
      } else {
        // Fall back to individual API call if no cached data
        auctionWins = await this.getAuctionWinsForMember(username);
      }

      const memberAttendance = attendanceData.find(row =>
        row.username && row.username.toLowerCase() === username.toLowerCase()
      );

      const memberBidding = biddingData.find(row =>
        row.username && row.username.toLowerCase() === username.toLowerCase()
      );

      // Fetch recent spawns (with optional cached weekly attendance data)
      const recentSpawns = await this.getRecentSpawnsForMember(username, cachedData.weeklyAttendance);

      // Note: attendancePoints is actually the spawn count (Total Attendance Days)
      const spawnCount = memberAttendance?.attendancePoints || 0;

      return {
        username,
        attendance: {
          total: spawnCount * 4, // Each spawn gives 4 points
          spawns: spawnCount,
          averagePerSpawn: 4, // Fixed 4 points per spawn
        },
        bidding: {
          pointsRemaining: memberBidding?.pointsLeft || 0,
          pointsConsumed: memberBidding?.pointsConsumed || 0,
          totalAwarded: (memberBidding?.pointsLeft || 0) + (memberBidding?.pointsConsumed || 0),
          auctionsWon: auctionWins,
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
   * ENHANCED: Now integrated with learning system for continuous improvement
   * @param {Object} profile - Member profile data
   * @param {boolean} saveForLearning - Whether to save this prediction for tracking
   * @returns {Promise<Object>|number} Prediction result with confidence, or just likelihood if not async
   */
  async predictAttendanceLikelihood(profile, saveForLearning = false) {
    const { attendance, recentActivity } = profile;

    // If no attendance history at all, return low likelihood
    if (attendance.spawns === 0) {
      if (saveForLearning) {
        return { likelihood: 0.1, confidence: 10 }; // Very unlikely if no history, low confidence
      }
      return 0.1;
    }

    // Calculate overall attendance rate based on total spawns in system
    // Get total spawns from recent activity (this represents all spawns that have occurred)
    const totalSystemSpawns = recentActivity.length;

    // If we have no spawn data to compare against, use a simple heuristic
    if (totalSystemSpawns === 0) {
      // Base likelihood on number of spawns attended
      // Use a sigmoid-like function: higher attendance = higher likelihood
      // Cap at 0.9 (90%) since we have limited data
      const likelihood = Math.min(0.9, attendance.spawns / (attendance.spawns + 10));

      if (saveForLearning) {
        const baseConfidence = this.calculateAttendanceConfidence(attendance.spawns, 0);
        const adjustedConfidence = await this.learningSystem.adjustConfidence('engagement', baseConfidence);

        await this.learningSystem.savePrediction(
          'engagement',
          profile.username,
          likelihood,
          adjustedConfidence,
          {
            totalSpawns: attendance.spawns,
            recentSpawns: 0,
            calculation: 'sigmoid_fallback',
          }
        );

        return { likelihood, confidence: adjustedConfidence };
      }
      return likelihood;
    }

    // Calculate overall attendance rate: spawns attended / total spawns available
    const overallRate = Math.min(attendance.spawns / totalSystemSpawns, 1.0);

    // Calculate recent attendance (last 14 days)
    const last14Days = Date.now() - (14 * 24 * 60 * 60 * 1000);
    const recentSpawns = recentActivity.filter(a =>
      new Date(a.timestamp).getTime() > last14Days
    );

    // For recent rate, we need to know how many of these recent spawns the user attended
    // Since we don't have individual attendance records here, we'll estimate based on overall rate
    // But give more weight to consistency if user has been active recently
    let recentRate = overallRate; // Default to overall rate

    // If there are recent spawns, adjust based on recency
    if (recentSpawns.length > 0) {
      // If user has attended more recently, boost the rate slightly
      // This is a heuristic: if overall rate is high and there are recent spawns, maintain high likelihood
      const recencyBoost = Math.min(0.1, recentSpawns.length / 50); // Small boost for active period
      recentRate = Math.min(overallRate + recencyBoost, 1.0);
    } else {
      // No recent spawns in system means we can't assess recent behavior
      // Slightly reduce likelihood if there's been a gap
      recentRate = overallRate * 0.9;
    }

    // Weighted prediction (70% overall rate, 30% recent adjustment)
    // Overall rate is more reliable since it's based on actual attendance data
    const likelihood = Math.min((overallRate * 0.7) + (recentRate * 0.3), 1.0);

    // Calculate base confidence based on data quality
    const baseConfidence = this.calculateAttendanceConfidence(attendance.spawns, recentSpawns.length);

    if (saveForLearning) {
      // Adjust confidence based on historical accuracy (learning system)
      const adjustedConfidence = await this.learningSystem.adjustConfidence('engagement', baseConfidence);

      // Save prediction for future learning
      const features = {
        totalSpawns: attendance.spawns,
        totalSystemSpawns: totalSystemSpawns,
        recentSystemSpawns: recentSpawns.length,
        overallRate: overallRate,
        recentRate: recentRate,
      };

      await this.learningSystem.savePrediction(
        'engagement',
        profile.username,
        likelihood,
        adjustedConfidence,
        features
      );

      return {
        likelihood,
        confidence: adjustedConfidence,
      };
    }

    return likelihood;
  }

  /**
   * Calculate confidence for attendance prediction
   * @param {number} totalSpawns - Total spawns attended
   * @param {number} recentSpawns - Recent spawns attended
   * @returns {number} Confidence score (0-100)
   */
  calculateAttendanceConfidence(totalSpawns, recentSpawns) {
    // More data = higher confidence
    let confidence = 50; // Base confidence

    // Add confidence based on total historical data
    if (totalSpawns >= 20) confidence += 30;
    else if (totalSpawns >= 10) confidence += 20;
    else if (totalSpawns >= 5) confidence += 10;

    // Add confidence based on recent data
    if (recentSpawns >= 3) confidence += 20;
    else if (recentSpawns >= 2) confidence += 10;
    else if (recentSpawns >= 1) confidence += 5;

    return Math.min(confidence, 100);
  }

  /**
   * Invalidate spawn prediction cache (call when new spawn is detected)
   */
  invalidateSpawnPredictionCache() {
    this.spawnPredictionCache.predictions = null;
    this.spawnPredictionCache.spawnCount = 0;
    this.spawnPredictionCache.timestamp = 0;
    console.log('[INTELLIGENCE] Spawn prediction cache invalidated');
  }

  /**
   * Predict next boss spawn time based on historical patterns
   * ENHANCED: Integrated with learning system for continuous improvement
   * SMART: When no boss specified, analyzes all bosses and predicts which spawns next
   * @param {string} bossName - Optional: predict for specific boss
   * @returns {Promise<Object>} Prediction with estimated time and confidence
   */
  async predictNextSpawnTime(bossName = null) {
    try {
      // Check per-boss cache first (if specific boss requested)
      if (bossName) {
        const cacheKey = bossName.toLowerCase();
        const cached = this.bossPredictionCache.get(cacheKey);
        const now = Date.now();

        if (cached && (now - cached.timestamp) < cached.ttl) {
          // Cache hit - return cached prediction without API call
          return cached.prediction;
        }
      }

      // Fetch historical spawn data from attendance sheets
      const response = await this.sheetAPI.call('getAllWeeklyAttendance', {});
      const allSheets = response?.sheets || [];

      if (allSheets.length === 0) {
        return {
          error: 'No historical spawn data available',
          confidence: 0,
        };
      }

      // Extract all spawn timestamps
      const spawnHistory = [];
      for (const sheet of allSheets) {
        const columns = sheet.columns || [];
        for (const col of columns) {
          if (col.boss && col.timestamp) {
            spawnHistory.push({
              boss: col.boss,
              timestamp: new Date(col.timestamp),
            });
          }
        }
      }

      if (spawnHistory.length < 3) {
        return {
          error: 'Not enough historical data (need at least 3 spawns)',
          confidence: 0,
        };
      }

      // Sort by timestamp
      spawnHistory.sort((a, b) => a.timestamp - b.timestamp);

      // If boss name specified, predict that specific boss
      if (bossName) {
        const prediction = await this.predictSpecificBoss(spawnHistory, bossName);

        // Cache the prediction (5-minute TTL for boss rotation checks)
        const cacheKey = bossName.toLowerCase();
        this.bossPredictionCache.set(cacheKey, {
          prediction: prediction,
          timestamp: Date.now(),
          ttl: 5 * 60 * 1000, // 5 minutes (matches rotation check interval)
        });

        return prediction;
      }

      // NEW SMART LOGIC: Predict which boss spawns next
      return await this.predictNextAnyBoss(spawnHistory);
    } catch (error) {
      console.error('[INTELLIGENCE] Error predicting spawn time:', error);
      return {
        error: error.message,
        confidence: 0,
      };
    }
  }

  /**
   * Predict next spawn for ANY boss (analyzes all bosses, returns soonest)
   * @param {Array} spawnHistory - All historical spawns
   * @returns {Promise<Object>} Prediction for the boss that will spawn next
   */
  async predictNextAnyBoss(spawnHistory) {
    // Check cache first to avoid redundant calculations
    const now = Date.now();
    const currentSpawnCount = spawnHistory.length;
    const cacheValid =
      this.spawnPredictionCache.predictions !== null &&
      this.spawnPredictionCache.spawnCount === currentSpawnCount &&
      (now - this.spawnPredictionCache.timestamp) < this.spawnPredictionCache.ttl;

    if (cacheValid) {
      console.log(`[INTELLIGENCE] Using cached predictions (${currentSpawnCount} spawns, age: ${Math.round((now - this.spawnPredictionCache.timestamp) / 1000)}s)`);
      return this.spawnPredictionCache.predictions;
    }

    console.log(`[INTELLIGENCE] Cache miss - recalculating predictions for ${currentSpawnCount} spawns`);

    // Group spawns by boss type
    const bossesByType = {};
    for (const spawn of spawnHistory) {
      const bossKey = spawn.boss.toLowerCase();
      if (!bossesByType[bossKey]) {
        bossesByType[bossKey] = {
          name: spawn.boss,
          spawns: [],
        };
      }
      bossesByType[bossKey].spawns.push(spawn);
    }

    // PRE-WARM CACHE: Fetch shared data once before parallel predictions
    // This prevents 32 parallel API calls for the same data
    await Promise.all([
      this.learningSystem.getMetrics(true),      // Cache learning metrics
      this.learningSystem.getMarketState(true),  // Cache market state
    ]);

    // Predict next spawn for each boss type (in parallel for speed)
    const predictionPromises = Object.entries(bossesByType)
      .filter(([bossKey, bossData]) => bossData.spawns.length >= 2)
      .map(([bossKey, bossData]) =>
        this.calculateBossSpawnPrediction(bossData.spawns, bossData.name)
      );

    const allPredictions = await Promise.all(predictionPromises);
    const predictions = allPredictions.filter(prediction => !prediction.error);

    if (predictions.length === 0) {
      return {
        error: 'Not enough data to predict any boss spawn (each boss needs at least 2 historical spawns)',
        confidence: 0,
      };
    }

    // Sort by predicted time (earliest first)
    predictions.sort((a, b) => a.predictedTime - b.predictedTime);

    // Return the boss that will spawn soonest
    const nextBoss = predictions[0];

    // Add info about other upcoming bosses
    nextBoss.upcomingBosses = predictions.slice(1, 4).map(p => ({
      boss: p.bossName,
      predictedTime: p.predictedTime,
      confidence: p.confidence,
    }));

    console.log(`[INTELLIGENCE] Predicted next boss: ${nextBoss.bossName} at ${nextBoss.predictedTime.toISOString()}`);

    // Update cache to avoid redundant calculations
    this.spawnPredictionCache.predictions = nextBoss;
    this.spawnPredictionCache.spawnCount = currentSpawnCount;
    this.spawnPredictionCache.timestamp = now;
    console.log(`[INTELLIGENCE] Cached predictions for ${currentSpawnCount} spawns (TTL: 30min)`);

    return nextBoss;
  }

  /**
   * Predict spawn time for a specific boss
   * @param {Array} spawnHistory - All historical spawns
   * @param {string} bossName - Specific boss to predict
   * @returns {Promise<Object>} Prediction for specific boss
   */
  async predictSpecificBoss(spawnHistory, bossName) {
    const relevantSpawns = spawnHistory.filter(s =>
      s.boss.toLowerCase() === bossName.toLowerCase()
    );

    if (relevantSpawns.length < 2) {
      return {
        error: `Not enough data for ${bossName} (found ${relevantSpawns.length} spawns, need at least 2)`,
        confidence: 0,
      };
    }

    return await this.calculateBossSpawnPrediction(relevantSpawns, bossName);
  }

  /**
   * Calculate spawn prediction for a boss based on its spawn history
   * @param {Array} spawns - Historical spawns for this boss (already filtered)
   * @param {string} bossName - Name of the boss
   * @returns {Promise<Object>} Prediction with time, confidence, and stats
   */
  async calculateBossSpawnPrediction(spawns, bossName) {
    // Check if this is a schedule-based boss
    const bossSpawnType = this.getBossSpawnType(bossName);

    if (bossSpawnType && bossSpawnType.type === 'schedule') {
      // For schedule-based bosses, use fixed schedule instead of historical data
      return this.predictScheduledBoss(bossSpawnType, spawns);
    }

    // For timer-based and unknown bosses, calculate from historical data
    // Calculate intervals between spawns
    const intervals = [];
    for (let i = 1; i < spawns.length; i++) {
      const interval = spawns[i].timestamp - spawns[i - 1].timestamp;
      intervals.push(interval / (1000 * 60 * 60)); // Convert to hours
    }

    // Filter outlier intervals using IQR method to remove anomalies
    // (e.g., long gaps between spawn "seasons")
    const sortedIntervals = [...intervals].sort((a, b) => a - b);

    // Improved quartile calculation using linear interpolation
    const getQuartile = (arr, q) => {
      const pos = (arr.length - 1) * q;
      const base = Math.floor(pos);
      const rest = pos - base;
      if (arr[base + 1] !== undefined) {
        return arr[base] + rest * (arr[base + 1] - arr[base]);
      } else {
        return arr[base];
      }
    };

    const q1 = getQuartile(sortedIntervals, 0.25);
    const q3 = getQuartile(sortedIntervals, 0.75);
    const iqr = q3 - q1;

    // Only apply outlier filtering if we have enough data and significant IQR
    let intervalsToUse = intervals;
    if (intervals.length >= 5 && iqr > 0) {
      // Filter out intervals beyond 1.5 * IQR (standard outlier detection)
      const lowerBound = q1 - (1.5 * iqr);
      const upperBound = q3 + (1.5 * iqr);
      const filteredIntervals = intervals.filter(interval =>
        interval >= lowerBound && interval <= upperBound
      );

      // Only use filtered if we kept at least 60% of data
      if (filteredIntervals.length >= Math.ceil(intervals.length * 0.6)) {
        intervalsToUse = filteredIntervals;
      }
    }

    // Use median interval for more robust prediction (less affected by outliers)
    const medianInterval = this.calculateMedian(intervalsToUse);

    // Also calculate mean for comparison
    const avgInterval = intervalsToUse.reduce((a, b) => a + b, 0) / intervalsToUse.length;

    // Get the most recent CHRONOLOGICAL intervals (not from filtered set)
    // This ensures we're actually looking at recent behavior
    const recentCount = Math.max(1, Math.min(5, Math.ceil(intervals.length * 0.3)));
    const recentIntervals = intervals.slice(-recentCount);
    const recentAvg = recentIntervals.reduce((a, b) => a + b, 0) / recentIntervals.length;

    // Adaptive weighting: use more recent data if sample size is small
    const medianWeight = intervals.length >= 10 ? 0.7 : 0.5;
    const recentWeight = 1 - medianWeight;
    let predictedInterval = (medianInterval * medianWeight) + (recentAvg * recentWeight);

    // ENHANCED: Use timer-based configuration if available
    let usingConfiguredTimer = false;
    if (bossSpawnType && bossSpawnType.type === 'timer') {
      const configuredInterval = bossSpawnType.config.spawnIntervalHours;
      // Removed verbose logging - only log on errors or warnings

      // Blend configured interval with historical data for accuracy
      // If historical data is close to configured (within 15%), trust historical more
      // Otherwise, weight configured interval higher
      const percentDiff = Math.abs(predictedInterval - configuredInterval) / configuredInterval;

      if (percentDiff < 0.15) {
        // Historical data matches config well, use 70% historical, 30% config
        predictedInterval = (predictedInterval * 0.7) + (configuredInterval * 0.3);
      } else {
        // Historical data differs significantly, trust config more (70% config, 30% historical)
        predictedInterval = (configuredInterval * 0.7) + (predictedInterval * 0.3);
      }
      usingConfiguredTimer = true;
    }

    // Calculate standard deviation on filtered intervals
    const variance = intervalsToUse.reduce((sum, interval) =>
      sum + Math.pow(interval - avgInterval, 2), 0) / intervalsToUse.length;
    const stdDev = Math.sqrt(variance);

    // Predict next spawn time
    const lastSpawn = spawns[spawns.length - 1].timestamp;
    const now = new Date();

    // Calculate predicted spawn, accounting for multiple cycles if needed
    let predictedNextSpawn = new Date(lastSpawn.getTime() + (predictedInterval * 60 * 60 * 1000));

    // CRITICAL FIX: If predicted time is in the past, keep adding intervals until we get a future time
    // This handles cases where the boss has already spawned multiple times since last recorded spawn
    while (predictedNextSpawn < now) {
      predictedNextSpawn = new Date(predictedNextSpawn.getTime() + (predictedInterval * 60 * 60 * 1000));
    }

    // Calculate confidence based on consistency of intervals
    let baseConfidence = this.calculateSpawnConfidence(intervalsToUse.length, stdDev, medianInterval);

    // ENHANCED: Boost confidence if using configured timer data
    if (usingConfiguredTimer) {
      // Having exact spawn timer info increases confidence
      // Boost by up to 15 points, scaled by how consistent historical data is
      const consistencyFactor = Math.max(0, 1 - (stdDev / medianInterval));
      const confidenceBoost = 15 * consistencyFactor;
      baseConfidence = Math.min(95, baseConfidence + confidenceBoost);
      // Removed verbose logging
    }

    // Adjust confidence based on time since last spawn (recency penalty)
    const timeSinceLastSpawn = (now - lastSpawn) / (1000 * 60 * 60); // hours
    const percentOfInterval = timeSinceLastSpawn / predictedInterval;

    // If last spawn was VERY recent (< 10% of interval), reduce confidence
    if (percentOfInterval < 0.1) {
      baseConfidence *= 0.7; // Reduce by 30%
    }
    // If we're way past the predicted spawn time (> 150% of interval), reduce confidence
    else if (percentOfInterval > 1.5) {
      baseConfidence *= 0.6; // Reduce by 40% - pattern may have changed
    }
    // If we're significantly past (> 120% of interval), slight reduction
    else if (percentOfInterval > 1.2) {
      baseConfidence *= 0.85; // Reduce by 15%
    }

    // Adjust confidence based on historical accuracy (learning system)
    const adjustedConfidence = await this.learningSystem.adjustConfidence('spawn_prediction', baseConfidence);

    // Save prediction for future learning
    const features = {
      bossName: bossName,
      historicalSpawns: spawns.length,
      avgIntervalHours: predictedInterval,
      medianIntervalHours: medianInterval,
      stdDevHours: stdDev,
      consistency: stdDev / medianInterval, // Lower = more consistent
      outliersRemoved: intervals.length - intervalsToUse.length,
    };

    await this.learningSystem.savePrediction(
      'spawn_prediction',
      bossName,
      predictedNextSpawn.toISOString(),
      adjustedConfidence,
      features
    );

    // Calculate prediction range using filtered stdDev, scaled by confidence
    // Higher confidence = tighter range, lower confidence = wider range
    const confidenceScale = adjustedConfidence / 100;

    // Base range on standard deviation, but scale inversely with confidence
    // Low confidence (20%) -> use 2.5 * stdDev, High confidence (85%) -> use 1.0 * stdDev
    const rangeFactor = 2.5 - (1.5 * confidenceScale);
    let rangeHours = stdDev * rangeFactor;

    // Cap the range at reasonable bounds (min 5% to max 60% of predicted interval)
    const minRange = predictedInterval * 0.05;
    const maxRange = predictedInterval * 0.6;
    rangeHours = Math.max(minRange, Math.min(rangeHours, maxRange));

    const earliestTime = new Date(predictedNextSpawn.getTime() - (rangeHours * 60 * 60 * 1000));
    const latestTime = new Date(predictedNextSpawn.getTime() + (rangeHours * 60 * 60 * 1000));

    return {
      predictedTime: predictedNextSpawn,
      earliestTime,
      latestTime,
      confidence: adjustedConfidence,
      avgIntervalHours: predictedInterval, // Use predicted interval (median + recent trend)
      lastSpawnTime: lastSpawn,
      basedOnSpawns: spawns.length,
      bossName: bossName,
      usingConfiguredTimer: usingConfiguredTimer,
      spawnType: bossSpawnType ? bossSpawnType.type : 'historical',
    };
  }

  /**
   * Predict spawn for schedule-based boss (fixed day/time spawns)
   * @param {Object} bossSpawnType - Boss spawn type info
   * @param {Array} spawns - Historical spawns (for learning system)
   * @returns {Promise<Object>} Prediction with time and confidence
   */
  async predictScheduledBoss(bossSpawnType, spawns) {
    const bossName = bossSpawnType.name;
    const scheduleConfig = bossSpawnType.config;

    console.log(`[INTELLIGENCE] Boss "${bossName}" uses fixed schedule: ${scheduleConfig.description}`);

    // Calculate next scheduled spawn time
    const nextSpawnTime = this.calculateNextScheduledSpawn(scheduleConfig);

    if (!nextSpawnTime) {
      return {
        error: `No valid schedule found for ${bossName}`,
        confidence: 0,
      };
    }

    // For schedule-based bosses, confidence is very high (90%)
    // since spawn times are fixed and don't depend on kill time
    const baseConfidence = 90;

    // Slight adjustment based on historical accuracy (learning system)
    const adjustedConfidence = await this.learningSystem.adjustConfidence('spawn_prediction', baseConfidence);

    // Save prediction for future learning
    const features = {
      bossName: bossName,
      historicalSpawns: spawns.length,
      spawnType: 'schedule',
      scheduleCount: scheduleConfig.schedules.length,
    };

    await this.learningSystem.savePrediction(
      'spawn_prediction',
      bossName,
      nextSpawnTime.toISOString(),
      adjustedConfidence,
      features
    );

    // For schedule-based bosses, the range is very tight (±30 minutes for server time variance)
    const rangeHours = 0.5; // 30 minutes
    const earliestTime = new Date(nextSpawnTime.getTime() - (rangeHours * 60 * 60 * 1000));
    const latestTime = new Date(nextSpawnTime.getTime() + (rangeHours * 60 * 60 * 1000));

    // Calculate when this was last spawned (if we have history)
    const lastSpawn = spawns.length > 0 ? spawns[spawns.length - 1].timestamp : null;

    return {
      predictedTime: nextSpawnTime,
      earliestTime,
      latestTime,
      confidence: adjustedConfidence,
      avgIntervalHours: null, // Not applicable for schedule-based
      lastSpawnTime: lastSpawn,
      basedOnSpawns: spawns.length,
      bossName: bossName,
      spawnType: 'schedule',
      scheduleInfo: scheduleConfig.description,
    };
  }

  /**
   * Calculate confidence for spawn time prediction
   * @param {number} sampleSize - Number of historical spawns
   * @param {number} stdDev - Standard deviation of intervals
   * @param {number} mean - Mean interval
   * @returns {number} Confidence score (0-100)
   */
  calculateSpawnConfidence(sampleSize, stdDev, mean) {
    // Start with lower base confidence for more realistic predictions
    let confidence = 20;

    // Sample size contribution (max +35)
    if (sampleSize >= 30) confidence += 35;
    else if (sampleSize >= 20) confidence += 28;
    else if (sampleSize >= 15) confidence += 22;
    else if (sampleSize >= 10) confidence += 16;
    else if (sampleSize >= 7) confidence += 10;
    else if (sampleSize >= 5) confidence += 6;
    else if (sampleSize >= 3) confidence += 3;

    // Consistency contribution (max +45)
    const coefficientOfVariation = stdDev / mean;
    if (coefficientOfVariation < 0.05) confidence += 45; // Extremely consistent
    else if (coefficientOfVariation < 0.10) confidence += 38; // Very consistent
    else if (coefficientOfVariation < 0.15) confidence += 30; // Consistent
    else if (coefficientOfVariation < 0.25) confidence += 20; // Moderately consistent
    else if (coefficientOfVariation < 0.35) confidence += 12; // Somewhat consistent
    else if (coefficientOfVariation < 0.50) confidence += 6;  // Low consistency
    // else: very high variation, no bonus

    // Cap maximum confidence at 85% (never claim perfect prediction)
    return Math.min(confidence, 85);
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
   * @param {string} username - Member username
   * @param {Object} cachedWeeklyAttendance - Optional pre-fetched weekly attendance data
   */
  async getRecentSpawnsForMember(username, cachedWeeklyAttendance = null) {
    try {
      // Use cached data if available, otherwise fetch
      let allSheets;
      if (cachedWeeklyAttendance) {
        allSheets = cachedWeeklyAttendance.sheets || [];
      } else {
        const response = await this.sheetAPI.call('getAllWeeklyAttendance', {});
        allSheets = response?.sheets || [];
      }

      if (allSheets.length === 0) {
        return [];
      }

      const recentSpawns = [];

      // For each weekly sheet
      for (const weekSheet of allSheets) {
        const columns = weekSheet.columns || [];

        // For each spawn column in this sheet
        for (const column of columns) {
          // We need to fetch the actual attendance data for this member for this spawn
          // This requires getting the member's row from the weekly sheet
          // For now, we'll just add the spawn timestamp if we have it
          if (column.timestamp && column.boss) {
            // Parse timestamp - could be ISO or formatted date
            const timestamp = new Date(column.timestamp);
            if (!isNaN(timestamp.getTime())) {
              recentSpawns.push({
                boss: column.boss,
                timestamp: timestamp.toISOString(),
                weekSheet: weekSheet.weekSheet,
              });
            }
          }
        }
      }

      // Sort by timestamp descending (most recent first)
      recentSpawns.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

      return recentSpawns;
    } catch (error) {
      console.error('[INTELLIGENCE] Error fetching recent spawns:', error);
      return [];
    }
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
   * OPTIMIZED: Fetches all data once instead of per-member to reduce API calls from N*4 to 4
   */
  async analyzeAllMembersEngagement() {
    try {
      // Fetch all data ONCE instead of per-member (massive performance improvement)
      // Use cached API calls to prevent timeouts from duplicate concurrent requests
      const [biddingResponse, attendanceResponse, weeklyAttendanceResponse, auctionResponse] = await Promise.all([
        this.cachedAPICall('getBiddingPoints', {}),
        this.cachedAPICall('getTotalAttendance', {}),
        this.cachedAPICall('getAllWeeklyAttendance', {}),
        this.cachedAPICall('getForDistribution', {}, { timeout: 60000 }),
      ]);

      const biddingData = biddingResponse?.members ?? [];
      const attendanceData = attendanceResponse?.members ?? [];
      const weeklyAttendance = weeklyAttendanceResponse || {};
      const auctionData = auctionResponse?.items ?? [];

      // Create cached data object to pass to each analysis
      const cachedData = {
        attendanceData,
        biddingData,
        weeklyAttendance,
        auctionData,
      };

      const analyses = [];

      for (const member of biddingData) {
        // Pass cached data to avoid redundant API calls
        const analysis = await this.analyzeMemberEngagement(member.username, cachedData);
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
      const [auctionHistory, biddingResponse] = await Promise.all([
        this.getAllAuctionHistory(),
        this.sheetAPI.call('getBiddingPoints', {}),
      ]);
      const biddingData = biddingResponse?.members ?? [];
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
              details: `${count} out of ${total} auctions`,
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
          description: `${outliers.length} auction(s) with unusual bid amounts (>${INTELLIGENCE_CONFIG.BID_PATTERN_STDEV}σ from mean)`,
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
            description: `${itemName} appeared ${count} times in auction history`,
            itemName,
            occurrences: count,
            recommendation: 'Verify item source - possible duplication or farming',
          });
        }
      }

      // 4. Point hoarding detection
      const totalMembers = biddingData.length;
      const hoarders = biddingData.filter(member => {
        const totalPoints = member.pointsLeft + member.pointsConsumed;
        const hoardingRate = totalPoints > 0 ? (member.pointsLeft / totalPoints) : 0;
        return totalPoints >= 100 && hoardingRate > 0.85; // 85% or more points unused with significant balance
      });

      for (const member of hoarders) {
        const totalPoints = member.pointsLeft + member.pointsConsumed;
        const hoardingRate = ((member.pointsLeft / totalPoints) * 100).toFixed(0);
        anomalies.push({
          type: 'POINT_HOARDING',
          severity: 'LOW',
          description: `${member.username} has ${member.pointsLeft}/${totalPoints} points unused (${hoardingRate}%)`,
          username: member.username,
          pointsLeft: member.pointsLeft,
          totalPoints,
          recommendation: 'Member may need reminder to participate in auctions',
        });
      }

      // 5. Bidding velocity analysis (members with unusually high spending)
      const activeBidders = biddingData.filter(m => m.pointsConsumed > 0);
      if (activeBidders.length > 0) {
        const consumptionRates = activeBidders.map(m => {
          const total = m.pointsLeft + m.pointsConsumed;
          return total > 0 ? (m.pointsConsumed / total) : 0;
        });
        const avgConsumption = this.calculateMean(consumptionRates);
        const stdDevConsumption = this.calculateStdDev(consumptionRates);

        const highVelocity = (Math.abs(stdDevConsumption) < Number.EPSILON) ? [] : activeBidders.filter(member => {
          const total = member.pointsLeft + member.pointsConsumed;
          const rate = total > 0 ? (member.pointsConsumed / total) : 0;
          const zScore = (rate - avgConsumption) / stdDevConsumption;
          return zScore > 2.0 && rate > 0.9; // High spenders at >90% consumption
        });

        for (const member of highVelocity) {
          const total = member.pointsLeft + member.pointsConsumed;
          const consumptionRate = ((member.pointsConsumed / total) * 100).toFixed(0);
          anomalies.push({
            type: 'HIGH_BIDDING_VELOCITY',
            severity: 'LOW',
            description: `${member.username} spent ${member.pointsConsumed}/${total} points (${consumptionRate}%)`,
            username: member.username,
            pointsConsumed: member.pointsConsumed,
            totalPoints: total,
            recommendation: 'High engagement - monitor for sustainability',
          });
        }
      }

      return {
        anomaliesDetected: anomalies.length,
        anomalies,
        analyzed: auctionHistory.length,
        totalMembers,
        timestamp: getCurrentTimestamp(),
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
      const [attendanceResponse, biddingResponse] = await Promise.all([
        this.cachedAPICall('getTotalAttendance', {}),
        this.cachedAPICall('getBiddingPoints', {}),
      ]);
      const attendanceData = attendanceResponse?.members ?? [];
      const biddingData = biddingResponse?.members ?? [];
      const anomalies = [];

      // Calculate attendance statistics
      // Note: attendancePoints is the spawn count field (Total Attendance Days)
      const spawnCounts = attendanceData.map(m => m.attendancePoints || 0);
      const mean = this.calculateMean(spawnCounts);
      const stdDev = this.calculateStdDev(spawnCounts);

      // 1. Detect statistical outliers (unusually high/low attendance)
      // Guard: skip z-score calculation if stdDev is zero or near-zero (all spawn counts identical)
      const outliers = (Math.abs(stdDev) < Number.EPSILON) ? [] : attendanceData.filter(member => {
        const memberSpawns = member.attendancePoints || 0;
        const zScore = Math.abs((memberSpawns - mean) / stdDev);
        return zScore > INTELLIGENCE_CONFIG.ATTENDANCE_PATTERN_STDEV;
      });

      for (const member of outliers) {
        const memberSpawns = member.attendancePoints || 0;
        const zScore = ((memberSpawns - mean) / stdDev).toFixed(1);
        anomalies.push({
          type: 'UNUSUAL_ATTENDANCE',
          severity: 'MEDIUM',
          username: member.username,
          spawnCount: memberSpawns,
          description: `${member.username} has ${memberSpawns} spawns (${zScore}σ from avg)`,
          deviation: `${zScore}σ`,
          recommendation: memberSpawns > mean
            ? 'Exceptionally high attendance - verify legitimacy'
            : 'Unusually low attendance - possible inactive account',
        });
      }

      // 2. Detect attendance-bidding correlation anomalies
      // High attendance but low/no bidding activity = potentially problematic
      for (const attendanceMember of attendanceData) {
        const memberSpawns = attendanceMember.attendancePoints || 0;
        if (memberSpawns > mean) { // Only check above-average attenders
          const biddingMember = biddingData.find(b =>
            b.username && attendanceMember.username &&
            b.username.toLowerCase() === attendanceMember.username.toLowerCase()
          );

          if (biddingMember) {
            const totalPoints = biddingMember.pointsLeft + biddingMember.pointsConsumed;
            const consumptionRate = totalPoints > 0 ? (biddingMember.pointsConsumed / totalPoints) : 0;

            // High attendance but very low bidding = suspicious
            if (memberSpawns >= mean * 1.5 && consumptionRate < 0.1 && totalPoints >= 50) {
              anomalies.push({
                type: 'ATTENDANCE_BIDDING_MISMATCH',
                severity: 'MEDIUM',
                username: attendanceMember.username,
                description: `${attendanceMember.username}: ${memberSpawns} spawns but only ${(consumptionRate * 100).toFixed(0)}% points used`,
                spawnCount: memberSpawns,
                consumptionRate: `${(consumptionRate * 100).toFixed(0)}%`,
                recommendation: 'High attendance but minimal bidding - possible point farming',
              });
            }
          }
        }
      }

      // 3. Streak anomaly detection
      // Members with very high calendar streaks vs total spawns might indicate manipulation
      for (const member of attendanceData) {
        const spawns = member.attendancePoints || 0;
        const calendarStreak = member.calendarDayStreak || 0;

        // If calendar streak is suspiciously close to total spawns (suggesting attendance every single day)
        // This is only suspicious if they have very high numbers
        if (spawns >= 30 && calendarStreak >= spawns * 0.9) {
          anomalies.push({
            type: 'SUSPICIOUS_STREAK',
            severity: 'LOW',
            username: member.username,
            description: `${member.username}: ${calendarStreak}-day streak with ${spawns} spawns (${((calendarStreak/spawns)*100).toFixed(0)}% daily rate)`,
            calendarStreak,
            spawnCount: spawns,
            recommendation: 'Verify perfect/near-perfect attendance legitimacy',
          });
        }
      }

      // 4. Detect sudden activity changes (members with recent activity that differs from their pattern)
      // This requires comparing recent spawns vs historical average
      const recentActivityAnomalies = await this.detectSuddenActivityChanges(attendanceData);
      anomalies.push(...recentActivityAnomalies);

      return {
        anomaliesDetected: anomalies.length,
        anomalies,
        analyzed: attendanceData.length,
        statistics: {
          averageSpawns: mean.toFixed(1),
          stdDev: stdDev.toFixed(1),
        },
        timestamp: getCurrentTimestamp(),
      };
    } catch (error) {
      console.error('[INTELLIGENCE] Error detecting attendance anomalies:', error);
      return { error: error.message };
    }
  }

  /**
   * Detect sudden changes in attendance patterns
   */
  async detectSuddenActivityChanges(attendanceData) {
    const anomalies = [];

    try {
      // Get weekly attendance for recent activity analysis
      const weeklyResponse = await this.sheetAPI.call('getAllWeeklyAttendance', {});
      const weeklyData = weeklyResponse?.members ?? [];

      for (const member of attendanceData) {
        const totalSpawns = member.attendancePoints || 0;
        if (totalSpawns < 10) continue; // Skip very new members

        // Find their weekly data
        const weeklyMember = weeklyData.find(w =>
          w.username && member.username &&
          w.username.toLowerCase() === member.username.toLowerCase()
        );

        if (weeklyMember) {
          const weeklySpawns = weeklyMember.spawnsThisWeek || 0;
          const expectedWeeklyRate = totalSpawns / 52; // Rough estimate: total spawns spread over year

          // If this week's activity is >3x their average weekly rate, flag it
          if (weeklySpawns > expectedWeeklyRate * 3 && weeklySpawns >= 10) {
            anomalies.push({
              type: 'SUDDEN_ACTIVITY_SPIKE',
              severity: 'LOW',
              username: member.username,
              description: `${member.username}: ${weeklySpawns} spawns this week (${(weeklySpawns/expectedWeeklyRate).toFixed(1)}x normal rate)`,
              weeklySpawns,
              expectedWeekly: expectedWeeklyRate.toFixed(1),
              recommendation: 'Sudden activity increase - verify legitimacy or returning member',
            });
          }

          // If member has high total but zero this week (sudden drop)
          if (totalSpawns >= 20 && weeklySpawns === 0 && member.calendarDayStreak > 0) {
            anomalies.push({
              type: 'SUDDEN_INACTIVITY',
              severity: 'LOW',
              username: member.username,
              description: `${member.username}: 0 spawns this week (${totalSpawns} total, ${member.calendarDayStreak}-day streak at risk)`,
              totalSpawns,
              calendarStreak: member.calendarDayStreak,
              recommendation: 'Previously active member now inactive - may need reminder',
            });
          }
        }
      }
    } catch (error) {
      // Weekly attendance might not be available - not critical for anomaly detection
      console.log('[INTELLIGENCE] Weekly attendance not available for sudden change detection');
    }

    return anomalies;
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
      timestamp: getCurrentTimestamp(),
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
