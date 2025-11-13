/**
 * ============================================================================
 * ML INTEGRATION MODULE
 * ============================================================================
 *
 * Integrates ML spawn prediction into the existing bot
 * Easy to toggle on/off via config.json
 */

const { MLSpawnPredictor } = require('./ml-spawn-predictor');

class MLIntegration {
  constructor(config, sheetAPI) {
    this.config = config;
    this.enabled = config.ml_enabled !== false; // Default true
    this.learningInterval = null; // Store interval ID for cleanup

    if (this.enabled) {
      console.log('🤖 Initializing ML spawn prediction...');

      // Initialize ML spawn predictor
      this.spawnPredictor = new MLSpawnPredictor(sheetAPI, config);

      // Start learning from historical data
      this.startBackgroundLearning();

      console.log('✅ ML Spawn Prediction ready');
    } else {
      console.log('⚠️ ML features disabled in config');
      this.spawnPredictor = null;
    }
  }

  /**
   * Start background learning tasks with robust error handling
   */
  async startBackgroundLearning() {
    try {
      // Learn spawn patterns on startup
      console.log('🤖 Initial ML learning from historical data...');
      await this.spawnPredictor.learnPatterns();
      console.log('✅ Initial ML learning complete');

      // Re-learn spawn patterns every 6 hours with error handling
      this.learningInterval = setInterval(async () => {
        try {
          console.log('🤖 Re-learning spawn patterns (scheduled update)...');
          await this.spawnPredictor.learnPatterns();
          console.log('✅ ML patterns updated successfully');
        } catch (intervalError) {
          // Don't crash the interval - just log and continue
          console.error('❌ ML re-learning failed (will retry in 6h):', intervalError.message);
        }
      }, 6 * 60 * 60 * 1000);

    } catch (error) {
      console.error('❌ Initial ML learning failed:', error.message);
      console.warn('⚠️ ML will run with fallback mode until next learning cycle');
      // Don't throw - allow bot to start even if initial learning fails
    }
  }

  /**
   * Cleanup method to stop background tasks (prevents memory leaks)
   */
  cleanup() {
    if (this.learningInterval) {
      clearInterval(this.learningInterval);
      this.learningInterval = null;
      console.log('🧹 ML learning interval cleared');
    }
  }

  /**
   * Enhance spawn prediction with ML
   * @param {string} bossName - Name of boss
   * @param {Date} lastKillTime - Last kill timestamp
   * @param {number} configuredInterval - Configured spawn interval (hours)
   * @returns {Promise<Object>} ML-enhanced prediction
   */
  async enhanceSpawnPrediction(bossName, lastKillTime, configuredInterval) {
    if (!this.enabled || !this.spawnPredictor) {
      // ML disabled, return basic prediction
      return null;
    }

    try {
      return await this.spawnPredictor.predictSpawn(
        bossName,
        lastKillTime,
        configuredInterval
      );
    } catch (error) {
      console.error(`ML spawn prediction error for ${bossName}:`, error);
      return null;
    }
  }

  /**
   * Get ML stats for admin
   */
  async getStats() {
    if (!this.enabled) {
      return { enabled: false };
    }

    return {
      enabled: true,
      spawn: {
        patternsLearned: this.spawnPredictor.learnedPatterns.size,
        patterns: await this.spawnPredictor.exportPatterns(),
      },
    };
  }

  /**
   * Format spawn prediction for Discord
   */
  formatSpawnPrediction(prediction) {
    if (!prediction) return null;
    return this.spawnPredictor.formatPrediction(prediction);
  }
}

module.exports = { MLIntegration };
