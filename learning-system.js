/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                    ELYSIUM LEARNING SYSTEM                                ║
 * ║                  Persistent AI/ML Learning Engine                         ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * @fileoverview Learning system that improves predictions over time
 * Uses Google Sheets for persistent storage (Koyeb-friendly)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * FEATURES
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 1. PREDICTION TRACKING
 *    - Stores all predictions made by the bot
 *    - Tracks prediction type, target, confidence
 *    - Saves features used in prediction
 *
 * 2. FEEDBACK LOOP
 *    - Updates predictions with actual outcomes
 *    - Calculates accuracy automatically
 *    - Learns from mistakes
 *
 * 3. ADAPTIVE LEARNING
 *    - Adjusts confidence based on historical accuracy
 *    - Improves predictions over time
 *    - Identifies which features are most predictive
 *
 * 4. METRICS & REPORTING
 *    - Overall accuracy by prediction type
 *    - Recent performance trends
 *    - Feature importance analysis
 */

// Note: sheetAPI is expected to be passed from index2.js global instance
// to avoid circular dependencies

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const LEARNING_CONFIG = {
  // Minimum predictions needed before adjusting confidence
  MIN_SAMPLES_FOR_LEARNING: 10,

  // How much to adjust confidence based on accuracy
  CONFIDENCE_ADJUSTMENT_RATE: 0.1, // 10% adjustment

  // Weight recent predictions more heavily
  RECENT_WEIGHT: 0.7,
  HISTORICAL_WEIGHT: 0.3,

  // Cache duration (5 minutes)
  CACHE_DURATION: 5 * 60 * 1000,

  // ENHANCED: With 60GB storage, we can store MUCH more data
  STORE_RICH_FEATURES: true,
  INCLUDE_MARKET_STATE: true,
  INCLUDE_TEMPORAL_CONTEXT: true,
  INCLUDE_BEHAVIORAL_PATTERNS: true,
};

// ═══════════════════════════════════════════════════════════════════════════
// LEARNING SYSTEM CLASS
// ═══════════════════════════════════════════════════════════════════════════

class LearningSystem {
  constructor(config, sheetAPIInstance) {
    this.config = config;
    this.sheetAPI = sheetAPIInstance;
    this.cache = {
      metrics: null,
      lastUpdate: 0,
    };
  }

  /**
   * Save a prediction for future learning
   * @param {string} type - Prediction type (price_prediction, engagement, anomaly)
   * @param {string} target - What was predicted (item name, username)
   * @param {any} predicted - The predicted value
   * @param {number} confidence - Confidence score (0-100)
   * @param {Object} features - Features used in prediction
   * @returns {Promise<Object>} Saved prediction info
   */
  async savePrediction(type, target, predicted, confidence, features = {}) {
    try {
      // ENHANCED: With 60GB storage, enrich features with comprehensive context
      const enrichedFeatures = await this.enrichFeaturesWithContext(features, type, target);

      const response = await this.sheetAPI.call('savePredictionForLearning', {
        type,
        target,
        predicted,
        confidence,
        features: enrichedFeatures,
      });

      if (response.status === 'ok') {
        console.log(`[LEARNING] 📚 Saved ${type} prediction for ${target} (${Object.keys(enrichedFeatures).length} features)`);
        return response;
      } else {
        console.error('[LEARNING] ❌ Failed to save prediction:', response.message);
        return null;
      }
    } catch (error) {
      console.error('[LEARNING] ❌ Error saving prediction:', error);
      return null;
    }
  }

  /**
   * ENHANCED: Enrich features with temporal, market, and behavioral context
   * With 60GB storage, we can store comprehensive data for robust ML
   * @param {Object} baseFeatures - Base features from prediction
   * @param {string} type - Prediction type
   * @param {string} target - Prediction target
   * @returns {Promise<Object>} Enriched features
   */
  async enrichFeaturesWithContext(baseFeatures, type, target) {
    const enriched = { ...baseFeatures };

    // TEMPORAL CONTEXT (when prediction was made)
    if (LEARNING_CONFIG.INCLUDE_TEMPORAL_CONTEXT) {
      const now = new Date();
      enriched.temporal = {
        timestamp: now.toISOString(),
        timestampUnix: now.getTime(),
        dayOfWeek: now.getDay(), // 0 = Sunday, 6 = Saturday
        dayName: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][now.getDay()],
        hour: now.getHours(),
        isWeekend: now.getDay() === 0 || now.getDay() === 6,
        isAuctionDay: now.getDay() === 6, // Saturday
        weekOfYear: this.getWeekNumber(now),
        monthOfYear: now.getMonth() + 1,
        quarterOfYear: Math.floor(now.getMonth() / 3) + 1,
      };
    }

    // MARKET STATE (current guild economy)
    if (LEARNING_CONFIG.INCLUDE_MARKET_STATE) {
      try {
        const resp = await this.sheetAPI.call('getBiddingPoints', {});
        // Handle both nested and top-level response shapes, plus legacy points map
        const d = resp?.data ?? resp;
        const members = Array.isArray(d?.members) ? d.members : [];
        const fallbackFromMap = d?.points && typeof d.points === 'object'
          ? Object.entries(d.points).map(([username, pointsLeft]) => ({ username, pointsLeft, biddingPoints: 0, totalSpent: 0 }))
          : [];
        const m = members.length ? members : fallbackFromMap;

        if (m.length > 0) {
          const points = m.map(x => x.pointsLeft ?? 0);
          const consumed = m.map(x => x.totalSpent ?? 0);

          const pointsSum = points.reduce((a, b) => a + b, 0);
          const consumedSum = consumed.reduce((a, b) => a + b, 0);

          enriched.marketState = {
            totalMembers: m.length,
            avgPointsPerMember: points.length ? pointsSum / points.length : 0,
            medianPoints: this.median(points),
            totalPointsInEconomy: pointsSum,
            avgPointsConsumed: consumed.length ? consumedSum / consumed.length : 0,
            economyActivity: (pointsSum + consumedSum) ? (consumedSum / (pointsSum + consumedSum)) : 0,
          };
        }
      } catch (e) {
        // Silently skip if market state unavailable
      }
    }

    // BEHAVIORAL PATTERNS (recent activity)
    if (LEARNING_CONFIG.INCLUDE_BEHAVIORAL_PATTERNS && type === 'price_prediction') {
      try {
        // Use longer timeout as this fetches large dataset
        const forDist = await this.sheetAPI.call('getForDistribution', {}, { timeout: 60000 });
        // Response structure has items at top level
        const items = forDist?.items || [];
        if (items.length > 0) {
          const recent = items.slice(-20); // Last 20 auctions
          const itemAuctions = recent.filter(a => (a.itemName || a.item) === target);

          enriched.behavioral = {
            recentAuctions: recent.length,
            targetItemFrequency: itemAuctions.length,
            // Use bidAmount or winningBid field, not price
            avgRecentPrice: recent.length ? recent.reduce((a, b) => a + (b.bidAmount || b.winningBid || 0), 0) / recent.length : 0,
            priceVolatility: this.calculateVolatility(recent.map(a => a.bidAmount || a.winningBid || 0)),
            daysSinceLast: itemAuctions.length > 0
              ? Math.floor((Date.now() - new Date(itemAuctions[itemAuctions.length - 1].timestamp).getTime()) / (1000 * 60 * 60 * 24))
              : null,
          };
        }
      } catch (e) {
        // Silently skip if behavioral data unavailable
      }
    }

    // Add metadata
    enriched._meta = {
      enrichmentVersion: '1.0',
      baseFeatureCount: Object.keys(baseFeatures).length,
      totalFeatureCount: Object.keys(enriched).length,
      enrichedAt: new Date().toISOString(),
    };

    return enriched;
  }

  /**
   * Helper: Calculate median of array
   */
  median(arr) {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
  }

  /**
   * Helper: Calculate price volatility (standard deviation)
   */
  calculateVolatility(prices) {
    if (prices.length < 2) return 0;
    const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
    const variance = prices.reduce((sum, price) => sum + Math.pow(price - avg, 2), 0) / prices.length;
    return Math.sqrt(variance);
  }

  /**
   * Helper: Get ISO week number
   */
  getWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  }

  /**
   * Update prediction with actual result
   * @param {string} type - Prediction type
   * @param {string} target - What was predicted
   * @param {any} actual - Actual observed value
   * @returns {Promise<boolean>} Success status
   */
  async updatePredictionAccuracy(type, target, actual) {
    try {
      const response = await this.sheetAPI.call('updatePredictionAccuracy', {
        type,
        target,
        actual,
      });

      if (response.status === 'ok') {
        console.log(`[LEARNING] ✅ Updated ${type} accuracy for ${target}`);
        // Clear cache to force refresh on next metrics request
        this.cache.metrics = null;
        return true;
      } else {
        console.error('[LEARNING] ⚠️ Failed to update accuracy:', response.message);
        return false;
      }
    } catch (error) {
      console.error('[LEARNING] ❌ Error updating accuracy:', error);
      return false;
    }
  }

  /**
   * Get learning metrics and statistics
   * @param {boolean} useCache - Whether to use cached metrics
   * @returns {Promise<Object>} Learning metrics
   */
  async getMetrics(useCache = true) {
    try {
      // Check cache
      const now = Date.now();
      if (useCache && this.cache.metrics && (now - this.cache.lastUpdate) < LEARNING_CONFIG.CACHE_DURATION) {
        return this.cache.metrics;
      }

      const response = await this.sheetAPI.call('getLearningMetrics', {});

      if (response.status === 'ok' && response.metrics) {
        const metrics = response.metrics || {};

        // Update cache
        this.cache.metrics = metrics;
        this.cache.lastUpdate = now;

        return metrics;
      } else {
        console.error('[LEARNING] ⚠️ Failed to get metrics:', response.message || 'No data returned');
        return {};
      }
    } catch (error) {
      console.error('[LEARNING] ❌ Error getting metrics:', error);
      return {};
    }
  }

  /**
   * Get learning data for a specific type
   * @param {string} type - Prediction type
   * @param {number} limit - Max records to fetch
   * @returns {Promise<Array>} Learning records
   */
  async getLearningData(type, limit = 100) {
    try {
      const response = await this.sheetAPI.call('getLearningData', { type, limit });

      if (response.status === 'ok' && response.predictions) {
        return response.predictions || [];
      } else {
        console.error('[LEARNING] ⚠️ Failed to get learning data:', response.message || 'No data returned');
        return [];
      }
    } catch (error) {
      console.error('[LEARNING] ❌ Error getting learning data:', error);
      return [];
    }
  }

  /**
   * Adjust confidence based on historical accuracy
   * @param {string} type - Prediction type
   * @param {number} baseConfidence - Original confidence score
   * @returns {Promise<number>} Adjusted confidence score
   */
  async adjustConfidence(type, baseConfidence) {
    try {
      const metrics = await this.getMetrics();

      if (!metrics.averageAccuracy || !metrics.averageAccuracy[type]) {
        // Not enough data yet, return base confidence
        return baseConfidence;
      }

      const avgAccuracy = parseFloat(metrics.averageAccuracy[type]);
      const recentAccuracy = parseFloat(metrics.recentAccuracy[type]) || avgAccuracy;

      // Calculate total predictions
      const totalPredictions = metrics.byType[type]?.completed || 0;

      if (totalPredictions < LEARNING_CONFIG.MIN_SAMPLES_FOR_LEARNING) {
        // Not enough samples yet
        return baseConfidence;
      }

      // Weighted accuracy (recent predictions matter more)
      const weightedAccuracy = (recentAccuracy * LEARNING_CONFIG.RECENT_WEIGHT) +
                              (avgAccuracy * LEARNING_CONFIG.HISTORICAL_WEIGHT);

      // Adjust confidence based on accuracy
      // If accuracy is high (90%+), increase confidence
      // If accuracy is low (60%-), decrease confidence
      let adjustment = 0;

      if (weightedAccuracy >= 90) {
        adjustment = baseConfidence * LEARNING_CONFIG.CONFIDENCE_ADJUSTMENT_RATE; // Increase
      } else if (weightedAccuracy >= 80) {
        adjustment = baseConfidence * (LEARNING_CONFIG.CONFIDENCE_ADJUSTMENT_RATE / 2); // Small increase
      } else if (weightedAccuracy < 70) {
        adjustment = -baseConfidence * LEARNING_CONFIG.CONFIDENCE_ADJUSTMENT_RATE; // Decrease
      }

      const adjustedConfidence = Math.min(100, Math.max(0, baseConfidence + adjustment));

      console.log(`[LEARNING] 🎯 Adjusted ${type} confidence: ${baseConfidence.toFixed(1)}% → ${adjustedConfidence.toFixed(1)}% (accuracy: ${weightedAccuracy.toFixed(1)}%)`);

      return adjustedConfidence;
    } catch (error) {
      console.error('[LEARNING] ❌ Error adjusting confidence:', error);
      return baseConfidence;
    }
  }

  /**
   * Generate learning report for admins
   * @returns {Promise<string>} Formatted report
   */
  async generateReport() {
    try {
      const metrics = await this.getMetrics(false); // Force fresh data

      if (!metrics.total || metrics.total === 0) {
        return '📚 **Learning System Report**\n\nNo predictions made yet. The bot will improve over time as it makes more predictions!';
      }

      let report = '📚 **Learning System Report**\n\n';
      report += `**Total Predictions:** ${metrics.total}\n\n`;

      for (const type in metrics.byType) {
        const typeData = metrics.byType[type];
        const avgAcc = metrics.averageAccuracy[type] || 'N/A';
        const recentAcc = metrics.recentAccuracy[type] || 'N/A';

        report += `**${type.replace('_', ' ').toUpperCase()}:**\n`;
        report += `  • Total: ${typeData.total} predictions\n`;
        report += `  • Completed: ${typeData.completed}\n`;
        report += `  • Average Accuracy: ${avgAcc}%\n`;
        report += `  • Recent Accuracy: ${recentAcc}%\n`;

        // Trend indicator
        if (avgAcc !== 'N/A' && recentAcc !== 'N/A') {
          const trend = parseFloat(recentAcc) - parseFloat(avgAcc);
          if (trend > 5) {
            report += `  • Trend: 📈 Improving (+${trend.toFixed(1)}%)\n`;
          } else if (trend < -5) {
            report += `  • Trend: 📉 Declining (${trend.toFixed(1)}%)\n`;
          } else {
            report += `  • Trend: ➡️ Stable\n`;
          }
        }

        report += '\n';
      }

      report += '💡 *The bot automatically adjusts confidence based on accuracy!*';

      return report;
    } catch (error) {
      console.error('[LEARNING] ❌ Error generating report:', error);
      return '❌ Error generating learning report.';
    }
  }

  /**
   * Clear cache (useful for testing)
   */
  clearCache() {
    this.cache.metrics = null;
    this.cache.lastUpdate = 0;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = { LearningSystem, LEARNING_CONFIG };
