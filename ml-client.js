/**
 * ML Client - Connects Node.js bot to Python ML service
 * Provides fallback to rule-based predictions if ML service is unavailable
 *
 * Usage:
 *   const mlClient = new MLClient('http://ml-service:8000');
 *   const prediction = await mlClient.predictPrice(itemName, features);
 */

const axios = require('axios');

class MLClient {
  constructor(serviceUrl = 'http://localhost:8000', options = {}) {
    this.serviceUrl = serviceUrl;
    this.timeout = options.timeout || 5000; // 5 second timeout
    this.fallbackEnabled = options.fallbackEnabled !== false; // Default true
    this.cache = new Map();
    this.cacheEnabled = options.cacheEnabled !== false; // Default true
    this.cacheTTL = options.cacheTTL || 300000; // 5 minutes

    // Statistics
    this.stats = {
      mlRequests: 0,
      mlSuccesses: 0,
      mlFailures: 0,
      fallbackUses: 0,
      cacheHits: 0
    };
  }

  /**
   * Predict item price using ML service
   * @param {string} itemName - Name of the item
   * @param {Object} features - Feature dictionary
   * @returns {Promise<Object>} Prediction result
   */
  async predictPrice(itemName, features) {
    const cacheKey = `price:${itemName}:${JSON.stringify(features)}`;

    // Check cache first
    if (this.cacheEnabled && this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.cacheTTL) {
        this.stats.cacheHits++;
        return cached.data;
      } else {
        this.cache.delete(cacheKey);
      }
    }

    try {
      this.stats.mlRequests++;

      // Call ML service
      const response = await axios.post(
        `${this.serviceUrl}/predict/price`,
        {
          item_name: itemName,
          features: features
        },
        {
          timeout: this.timeout,
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      this.stats.mlSuccesses++;
      const result = response.data;

      // Cache result
      if (this.cacheEnabled) {
        this.cache.set(cacheKey, {
          data: result,
          timestamp: Date.now()
        });
      }

      return result;

    } catch (error) {
      this.stats.mlFailures++;
      console.warn(`⚠️ ML service error: ${error.message}`);

      // Fallback to rule-based if enabled
      if (this.fallbackEnabled) {
        this.stats.fallbackUses++;
        return this.predictPriceRuleBased(itemName, features);
      }

      throw error;
    }
  }

  /**
   * Rule-based price prediction (fallback)
   * This mimics the current intelligence-engine.js logic
   * @param {string} itemName - Name of the item
   * @param {Object} features - Feature dictionary
   * @returns {Object} Prediction result
   */
  predictPriceRuleBased(itemName, features) {
    const {
      item_avg_price = 1000,
      item_median_price = item_avg_price,
      item_price_std = item_avg_price * 0.2,
      item_auction_count = 0,
      recent_price_trend = 1.0
    } = features;

    // Use median as base (more robust)
    const basePrice = item_median_price;

    // Apply trend
    const predictedPrice = basePrice * recent_price_trend;

    // Calculate confidence
    let confidence = 0.60; // Base for rule-based

    if (item_auction_count >= 30) confidence += 0.20;
    else if (item_auction_count >= 15) confidence += 0.15;
    else if (item_auction_count >= 10) confidence += 0.10;
    else if (item_auction_count >= 5) confidence += 0.05;

    // Consistency bonus
    if (item_avg_price > 0) {
      const cv = item_price_std / item_avg_price;
      if (cv < 0.15) confidence += 0.10;
      else if (cv < 0.25) confidence += 0.05;
    }

    confidence = Math.min(confidence, 0.85); // Cap at 85% for rule-based

    return {
      predicted_price: predictedPrice,
      confidence: confidence,
      model_used: 'rule_based_fallback',
      confidence_interval: {
        lower: predictedPrice - (1.96 * item_price_std),
        upper: predictedPrice + (1.96 * item_price_std)
      },
      important_features: [
        { feature: 'item_median_price', value: item_median_price, importance: 0.4 },
        { feature: 'recent_price_trend', value: recent_price_trend, importance: 0.3 },
        { feature: 'item_auction_count', value: item_auction_count, importance: 0.2 }
      ],
      message: `Rule-based prediction for ${itemName} (ML service unavailable)`
    };
  }

  /**
   * Check if ML service is healthy
   * @returns {Promise<boolean>} True if healthy
   */
  async isHealthy() {
    try {
      const response = await axios.get(
        `${this.serviceUrl}/health`,
        { timeout: 2000 }
      );
      return response.data.status === 'healthy';
    } catch (error) {
      return false;
    }
  }

  /**
   * Get ML service info
   * @returns {Promise<Object>} Service information
   */
  async getInfo() {
    try {
      const response = await axios.get(
        `${this.serviceUrl}/models/info`,
        { timeout: 2000 }
      );
      return response.data;
    } catch (error) {
      return {
        error: error.message,
        available: false
      };
    }
  }

  /**
   * Get client statistics
   * @returns {Object} Statistics
   */
  getStats() {
    const totalRequests = this.stats.mlRequests;
    const successRate = totalRequests > 0
      ? (this.stats.mlSuccesses / totalRequests * 100).toFixed(1)
      : 0;

    return {
      ...this.stats,
      successRate: `${successRate}%`,
      mlServiceAvailability: successRate
    };
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      mlRequests: 0,
      mlSuccesses: 0,
      mlFailures: 0,
      fallbackUses: 0,
      cacheHits: 0
    };
  }
}

module.exports = { MLClient };
