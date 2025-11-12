/**
 * ============================================================================
 * ML INTEGRATION MODULE
 * ============================================================================
 *
 * Integrates ML enhancements into the existing bot
 * - ML Spawn Prediction
 * - ML NLP Conversation Enhancement
 *
 * Easy to toggle on/off via config.json
 */

const { MLSpawnPredictor } = require('./ml-spawn-predictor');
const { MLNLPEnhancer } = require('./ml-nlp-enhancer');

class MLIntegration {
  constructor(config, sheetAPI) {
    this.config = config;
    this.enabled = config.ml_enabled !== false; // Default true

    if (this.enabled) {
      console.log('🤖 Initializing ML enhancements...');

      // Initialize ML modules
      this.spawnPredictor = new MLSpawnPredictor(sheetAPI, config);
      this.nlpEnhancer = new MLNLPEnhancer();

      // Start learning from historical data
      this.startBackgroundLearning();

      console.log('✅ ML Integration ready');
    } else {
      console.log('⚠️ ML features disabled in config');
      this.spawnPredictor = null;
      this.nlpEnhancer = null;
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

      // Clear old NLP context daily
      setInterval(() => {
        this.nlpEnhancer.clearOldContext();
      }, 24 * 60 * 60 * 1000);

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
   * Enhance NLP conversation understanding
   * @param {string} userId - Discord user ID
   * @param {string} text - Message text
   * @param {Object} baseIntent - Intent from existing NLP
   * @returns {Promise<Object>} Enhanced analysis
   */
  async enhanceNLPConversation(userId, text, baseIntent = null) {
    if (!this.enabled || !this.nlpEnhancer) {
      return null;
    }

    try {
      return await this.nlpEnhancer.analyzeMessage(userId, text, baseIntent);
    } catch (error) {
      console.error('ML NLP enhancement error:', error);
      return null;
    }
  }

  /**
   * Get suggested response for conversation
   */
  getSuggestedResponse(analysis) {
    if (!this.enabled || !this.nlpEnhancer || !analysis) {
      return null;
    }

    return this.nlpEnhancer.getSuggestedResponse(analysis.responseStrategy);
  }

  /**
   * Learn from successful NLP interaction
   */
  learnNLPSuccess(intent, text, confidence) {
    if (this.enabled && this.nlpEnhancer) {
      this.nlpEnhancer.learnSuccess(intent, text, confidence);
    }
  }

  /**
   * Learn from failed NLP interaction
   */
  learnNLPFailure(intent, text) {
    if (this.enabled && this.nlpEnhancer) {
      this.nlpEnhancer.learnFailure(intent, text);
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
      nlp: this.nlpEnhancer.getStats(),
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
