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
   * Start background learning tasks
   */
  async startBackgroundLearning() {
    try {
      // Learn spawn patterns on startup
      await this.spawnPredictor.learnPatterns();

      // Re-learn spawn patterns every 6 hours
      setInterval(async () => {
        console.log('🤖 Re-learning spawn patterns...');
        await this.spawnPredictor.learnPatterns();
      }, 6 * 60 * 60 * 1000);

    } catch (error) {
      console.error('Error in ML background learning:', error);
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
