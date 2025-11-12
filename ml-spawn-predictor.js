/**
 * ============================================================================
 * ML-POWERED SPAWN PREDICTION
 * ============================================================================
 *
 * Enhances boss spawn predictions by learning from historical variance
 * Uses statistical ML to predict actual spawn windows (not just fixed timers)
 *
 * FEATURES:
 * - Learns that bosses don't spawn exactly on configured time
 * - Accounts for server delays, player behavior patterns
 * - Provides confidence intervals for spawn windows
 * - Lightweight - no external ML libraries needed
 * - Fits in 512MB RAM
 *
 * EXAMPLE:
 * Boss says "spawns 24 hours after kill" but actually spawns 24h ±30 minutes
 * ML learns this variance and predicts: "24h with 90% chance between 23h45m-24h15m"
 */

const fs = require('fs').promises;
const path = require('path');

class MLSpawnPredictor {
  constructor(sheetAPI, config) {
    this.sheetAPI = sheetAPI;
    this.config = config;

    // Historical spawn data (loaded from Google Sheets)
    this.historicalSpawns = new Map(); // bossName -> [{killTime, spawnTime, actualInterval}]

    // Learned patterns
    this.learnedPatterns = new Map(); // bossName -> {meanInterval, stdDev, confidence}

    // Cache
    this.cache = {
      lastUpdate: 0,
      ttl: 60 * 60 * 1000, // 1 hour
    };

    console.log('✅ ML Spawn Predictor initialized');
  }

  /**
   * Predict next spawn time for a boss with ML-enhanced accuracy
   * @param {string} bossName - Name of the boss
   * @param {Date} lastKillTime - When boss was last killed
   * @param {number} configuredInterval - Configured spawn interval (hours)
   * @returns {Object} Prediction with confidence interval
   */
  async predictSpawn(bossName, lastKillTime, configuredInterval) {
    // Load historical data if needed
    await this.ensureDataLoaded();

    // Get learned pattern for this boss
    const pattern = this.learnedPatterns.get(bossName);

    if (!pattern || pattern.sampleSize < 3) {
      // Not enough data, use configured interval
      return this.basicPrediction(bossName, lastKillTime, configuredInterval);
    }

    // ML-powered prediction using learned variance
    return this.mlPrediction(bossName, lastKillTime, pattern);
  }

  /**
   * Basic prediction (fallback when no ML data)
   */
  basicPrediction(bossName, lastKillTime, configuredInterval) {
    const spawnTime = new Date(lastKillTime.getTime() + configuredInterval * 60 * 60 * 1000);

    // Conservative confidence interval (±15 minutes)
    const windowMinutes = 15;

    return {
      bossName,
      predictedSpawn: spawnTime,
      confidence: 0.70,
      confidenceInterval: {
        earliest: new Date(spawnTime.getTime() - windowMinutes * 60 * 1000),
        latest: new Date(spawnTime.getTime() + windowMinutes * 60 * 1000),
        windowMinutes: windowMinutes * 2,
      },
      method: 'configured',
      message: `Based on configured ${configuredInterval}h timer`,
    };
  }

  /**
   * ML-powered prediction using historical patterns
   */
  mlPrediction(bossName, lastKillTime, pattern) {
    const { meanInterval, stdDev, confidence, sampleSize } = pattern;

    // Calculate predicted spawn time using learned mean
    const spawnTime = new Date(lastKillTime.getTime() + meanInterval * 60 * 60 * 1000);

    // Confidence interval: 1.96 * stdDev for 95% confidence
    const windowHours = 1.96 * stdDev;
    const windowMinutes = windowHours * 60;

    // Adjust confidence based on sample size and consistency
    let adjustedConfidence = confidence;
    if (sampleSize >= 10) adjustedConfidence += 0.05;
    if (sampleSize >= 20) adjustedConfidence += 0.05;
    adjustedConfidence = Math.min(adjustedConfidence, 0.98);

    return {
      bossName,
      predictedSpawn: spawnTime,
      confidence: adjustedConfidence,
      confidenceInterval: {
        earliest: new Date(spawnTime.getTime() - windowMinutes * 60 * 1000),
        latest: new Date(spawnTime.getTime() + windowMinutes * 60 * 1000),
        windowMinutes: Math.round(windowMinutes * 2),
      },
      method: 'ml',
      message: `ML prediction based on ${sampleSize} historical spawns`,
      stats: {
        meanInterval: meanInterval.toFixed(2),
        stdDev: stdDev.toFixed(2),
        sampleSize,
      },
    };
  }

  /**
   * Learn patterns from historical spawn data
   */
  async learnPatterns() {
    console.log('🤖 Learning spawn patterns from ALL historical data...');

    // Get ALL attendance data (no time limit - use everything!)
    // This gives us maximum sample size for best accuracy
    const attendanceData = await this.sheetAPI.getAttendanceHistory({ days: 999999 });

    if (!attendanceData || attendanceData.length === 0) {
      console.log('⚠️ No historical data to learn from');
      return;
    }

    console.log(`📊 Loaded ${attendanceData.length} historical spawn records`);
  }

    // Group by boss and calculate intervals
    const bossKills = new Map(); // bossName -> [killTimes]

    for (const record of attendanceData) {
      const bossName = record.bossName || record.boss_name;
      const timestamp = new Date(record.timestamp || record.date_time);

      if (!bossName || !timestamp || isNaN(timestamp.getTime())) continue;

      if (!bossKills.has(bossName)) {
        bossKills.set(bossName, []);
      }
      bossKills.get(bossName).push(timestamp);
    }

    // Calculate intervals between consecutive kills
    for (const [bossName, killTimes] of bossKills.entries()) {
      if (killTimes.length < 2) continue;

      // Sort by time
      killTimes.sort((a, b) => a - b);

      // Calculate intervals
      const intervals = [];
      for (let i = 1; i < killTimes.length; i++) {
        const intervalMs = killTimes[i] - killTimes[i - 1];
        const intervalHours = intervalMs / (1000 * 60 * 60);

        // Filter out unrealistic intervals
        // Allow up to 3 days (72h) for most bosses, 7 days (168h) for weekly bosses
        if (intervalHours >= 1 && intervalHours <= 168) {
          intervals.push(intervalHours);
        }
      }

      // Apply outlier filtering using IQR method (same as your intelligence-engine.js)
      // This removes anomalous gaps (e.g., maintenance, guild break periods)
      if (intervals.length >= 5) {
        const sortedIntervals = [...intervals].sort((a, b) => a - b);

        // Calculate quartiles
        const q1Index = Math.floor(sortedIntervals.length * 0.25);
        const q3Index = Math.floor(sortedIntervals.length * 0.75);
        const q1 = sortedIntervals[q1Index];
        const q3 = sortedIntervals[q3Index];
        const iqr = q3 - q1;

        // Filter outliers beyond 1.5 * IQR
        if (iqr > 0) {
          const lowerBound = q1 - (1.5 * iqr);
          const upperBound = q3 + (1.5 * iqr);
          const filteredIntervals = intervals.filter(
            interval => interval >= lowerBound && interval <= upperBound
          );

          // Only use filtered if we kept at least 60% of data
          if (filteredIntervals.length >= Math.ceil(intervals.length * 0.6)) {
            intervals.splice(0, intervals.length, ...filteredIntervals);
            console.log(`   Filtered ${killTimes.length - filteredIntervals.length} outliers using IQR method`);
          }
        }
      }

      if (intervals.length < 2) continue;

      // Calculate statistics
      const mean = intervals.reduce((sum, val) => sum + val, 0) / intervals.length;
      const variance =
        intervals.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / intervals.length;
      const stdDev = Math.sqrt(variance);

      // Calculate coefficient of variation (consistency metric)
      const cv = stdDev / mean;

      // Confidence based on consistency and sample size
      let confidence = 0.70; // Base confidence
      if (cv < 0.05) confidence += 0.15; // Very consistent
      else if (cv < 0.10) confidence += 0.10; // Consistent
      else if (cv < 0.15) confidence += 0.05; // Somewhat consistent

      if (intervals.length >= 10) confidence += 0.05;

      confidence = Math.min(confidence, 0.95);

      // Store learned pattern
      this.learnedPatterns.set(bossName, {
        meanInterval: mean,
        stdDev,
        confidence,
        sampleSize: intervals.length,
        lastUpdated: new Date(),
      });

      const windowMinutes = Math.round(stdDev * 60 * 1.96); // 95% confidence interval in minutes

      console.log(
        `✅ ${bossName}: ${mean.toFixed(2)}h ±${windowMinutes}min window (${intervals.length} spawns, ${(confidence * 100).toFixed(0)}% confidence, CV: ${(cv * 100).toFixed(1)}%)`
      );
    }

    // Save to cache
    this.cache.lastUpdate = Date.now();
  }

  /**
   * Ensure historical data is loaded
   */
  async ensureDataLoaded() {
    const now = Date.now();
    if (now - this.cache.lastUpdate < this.cache.ttl) {
      return; // Cache still valid
    }

    try {
      await this.learnPatterns();
    } catch (error) {
      console.error('Error loading spawn patterns:', error);
    }
  }

  /**
   * Get learned pattern info for a boss
   */
  getPatternInfo(bossName) {
    const pattern = this.learnedPatterns.get(bossName);
    if (!pattern) {
      return {
        hasPattern: false,
        message: 'No historical data for this boss yet',
      };
    }

    return {
      hasPattern: true,
      meanInterval: pattern.meanInterval,
      stdDev: pattern.stdDev,
      confidence: pattern.confidence,
      sampleSize: pattern.sampleSize,
      lastUpdated: pattern.lastUpdated,
      message: `Learned from ${pattern.sampleSize} spawns: ${pattern.meanInterval.toFixed(
        2
      )}h ±${pattern.stdDev.toFixed(2)}h`,
    };
  }

  /**
   * Format prediction for Discord message
   */
  formatPrediction(prediction) {
    const spawnTime = prediction.predictedSpawn;
    const interval = prediction.confidenceInterval;
    const confidence = (prediction.confidence * 100).toFixed(0);

    const timeFormat = {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: this.config.timezone || 'Asia/Manila',
    };

    const spawnStr = spawnTime.toLocaleString('en-US', {
      ...timeFormat,
      month: 'short',
      day: 'numeric',
    });
    const earliestStr = interval.earliest.toLocaleTimeString('en-US', timeFormat);
    const latestStr = interval.latest.toLocaleTimeString('en-US', timeFormat);

    let message = `🔮 **${prediction.bossName} Spawn Prediction**\n\n`;
    message += `📅 **Most Likely**: ${spawnStr}\n`;
    message += `🎯 **${confidence}% Confidence Window**: ${earliestStr} - ${latestStr}\n`;
    message += `⏱️ **Window Size**: ±${Math.round(interval.windowMinutes / 2)} minutes\n\n`;

    if (prediction.method === 'ml') {
      message += `🤖 **ML Model**: Learned from ${prediction.stats.sampleSize} spawns\n`;
      message += `📊 **Average Interval**: ${prediction.stats.meanInterval}h ±${prediction.stats.stdDev}h\n`;
    } else {
      message += `📋 **Method**: Using configured timer (no historical data yet)\n`;
    }

    return message;
  }

  /**
   * Export learned patterns (for backup)
   */
  async exportPatterns() {
    const data = {};
    for (const [bossName, pattern] of this.learnedPatterns.entries()) {
      data[bossName] = pattern;
    }
    return data;
  }

  /**
   * Import learned patterns (for restore)
   */
  async importPatterns(data) {
    for (const [bossName, pattern] of Object.entries(data)) {
      this.learnedPatterns.set(bossName, pattern);
    }
    console.log(`✅ Imported patterns for ${Object.keys(data).length} bosses`);
  }
}

module.exports = { MLSpawnPredictor };
