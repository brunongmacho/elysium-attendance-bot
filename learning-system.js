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
      const response = await this.sheetAPI.savePredictionForLearning({
        type,
        target,
        predicted,
        confidence,
        features,
      });

      if (response.status === 'ok') {
        console.log(`[LEARNING] 📚 Saved ${type} prediction for ${target}`);
        return response.data;
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
   * Update prediction with actual result
   * @param {string} type - Prediction type
   * @param {string} target - What was predicted
   * @param {any} actual - Actual observed value
   * @returns {Promise<boolean>} Success status
   */
  async updatePredictionAccuracy(type, target, actual) {
    try {
      const response = await this.sheetAPI.updatePredictionAccuracy({
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

      const response = await this.sheetAPI.getLearningMetrics({});

      if (response.status === 'ok') {
        const metrics = response.data.metrics;

        // Update cache
        this.cache.metrics = metrics;
        this.cache.lastUpdate = now;

        return metrics;
      } else {
        console.error('[LEARNING] ⚠️ Failed to get metrics:', response.message);
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
      const response = await this.sheetAPI.getLearningData({ type, limit });

      if (response.status === 'ok') {
        return response.data.predictions || [];
      } else {
        console.error('[LEARNING] ⚠️ Failed to get learning data:', response.message);
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
