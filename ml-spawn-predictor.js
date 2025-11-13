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
 * - Optimized for maximum performance
 *
 * EXAMPLE:
 * Boss says "spawns 24 hours after kill" but actually spawns 24h ±30 minutes
 * ML learns this variance and predicts: "24h with 90% chance between 23h45m-24h15m"
 */

class MLSpawnPredictor {
  constructor(sheetAPI, config) {
    this.sheetAPI = sheetAPI;
    this.config = config;

    // Learned patterns (optimized - no unused data structures)
    this.learnedPatterns = new Map(); // bossName -> {meanInterval, stdDev, confidence}

    // Cache with 1-hour TTL
    this.cache = {
      lastUpdate: 0,
      ttl: 60 * 60 * 1000, // 1 hour
    };

    console.log('✅ ML Spawn Predictor initialized (optimized)');
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

    // Normalize boss name for lookup (case-insensitive, trim spaces)
    const normalizedName = this.normalizeBossName(bossName);

    // Get learned pattern for this boss (try normalized first, then original)
    let pattern = this.learnedPatterns.get(normalizedName);
    if (!pattern) {
      pattern = this.learnedPatterns.get(bossName);
    }

    // Require minimum 5 samples for ML prediction (higher accuracy threshold)
    if (!pattern || pattern.sampleSize < 5) {
      // Not enough data, use configured interval
      return this.basicPrediction(bossName, lastKillTime, configuredInterval);
    }

    // ML-powered prediction using learned variance
    return this.mlPrediction(bossName, lastKillTime, pattern);
  }

  /**
   * Normalize boss name for consistent lookups
   */
  normalizeBossName(name) {
    return name.trim().toLowerCase();
  }

  /**
   * Get configured spawn interval for a boss from boss_spawn_config.json
   * Used for smart maintenance detection
   */
  getConfiguredInterval(bossName, bossSpawnConfig) {
    if (!bossSpawnConfig) return null;

    const normalizedName = this.normalizeBossName(bossName);

    // Check timer-based bosses
    if (bossSpawnConfig.timerBasedBosses) {
      for (const [configBoss, config] of Object.entries(bossSpawnConfig.timerBasedBosses)) {
        if (this.normalizeBossName(configBoss) === normalizedName) {
          return config.spawnIntervalHours;
        }
      }
    }

    // Schedule-based bosses don't have fixed intervals (they spawn at specific times)
    // So return null for them - they won't use maintenance detection
    return null;
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
   * ML-powered prediction using historical patterns with weighted learning
   */
  mlPrediction(bossName, lastKillTime, pattern) {
    const { meanInterval, stdDev, confidence, sampleSize, coefficientOfVariation } = pattern;

    // Calculate predicted spawn time using weighted learned mean
    const spawnTime = new Date(lastKillTime.getTime() + meanInterval * 60 * 60 * 1000);

    // Confidence interval: Use adaptive z-score based on consistency
    // For very consistent spawns (low CV), use tighter interval
    // For inconsistent spawns (high CV), use wider interval
    let zScore = 1.96; // Default 95% confidence interval

    if (coefficientOfVariation !== undefined) {
      if (coefficientOfVariation < 0.03) {
        zScore = 1.64; // 90% CI for very consistent (tighter window)
      } else if (coefficientOfVariation > 0.15) {
        zScore = 2.33; // 98% CI for inconsistent (wider window)
      }
    }

    const windowHours = zScore * stdDev;
    const windowMinutes = windowHours * 60;

    // Use base confidence from pattern (already optimized in learning phase)
    const adjustedConfidence = Math.min(confidence, 0.98);

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
      message: `ML prediction based on ${sampleSize} historical spawns (weighted by recency)`,
      stats: {
        meanInterval: meanInterval.toFixed(2),
        stdDev: stdDev.toFixed(2),
        sampleSize,
        cv: coefficientOfVariation ? (coefficientOfVariation * 100).toFixed(1) + '%' : 'N/A',
      },
    };
  }

  /**
   * Learn patterns from historical spawn data
   * Fetches from ALL weekly attendance sheets (same method as intelligence-engine.js)
   */
  async learnPatterns() {
    console.log('🤖 Learning spawn patterns from ALL historical sheets...');

    // Load boss spawn configuration for maintenance detection
    let bossSpawnConfig = null;
    try {
      const fs = require('fs').promises;
      const configData = await fs.readFile('boss_spawn_config.json', 'utf8');
      bossSpawnConfig = JSON.parse(configData);
      console.log('✅ Loaded boss spawn config for smart maintenance detection');
    } catch (error) {
      console.warn('⚠️ Could not load boss_spawn_config.json - maintenance detection disabled:', error.message);
    }

    // Get ALL attendance data from all weekly sheets
    // Same method as intelligence-engine.js uses
    const response = await this.sheetAPI.call('getAllWeeklyAttendance', {});
    const allSheets = response?.sheets || [];

    if (allSheets.length === 0) {
      console.log('⚠️ No historical sheets found');
      return;
    }

    console.log(`📊 Found ${allSheets.length} weekly attendance sheets`);

    // Extract all spawn timestamps from all sheets
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

    if (spawnHistory.length === 0) {
      console.log('⚠️ No spawn data found in sheets');
      return;
    }

    console.log(`📊 Loaded ${spawnHistory.length} total spawn records from all sheets`);

    // Group by boss and calculate intervals
    const bossKills = new Map(); // normalizedBossName -> {name, killTimes}

    for (const spawn of spawnHistory) {
      const bossName = spawn.boss;
      const timestamp = spawn.timestamp;

      if (!bossName || !timestamp || isNaN(timestamp.getTime())) continue;

      // Normalize boss name for consistent grouping
      const normalizedName = this.normalizeBossName(bossName);

      if (!bossKills.has(normalizedName)) {
        bossKills.set(normalizedName, {
          name: bossName, // Keep original name for display
          killTimes: []
        });
      }
      bossKills.get(normalizedName).killTimes.push(timestamp);
    }

    // Calculate intervals between consecutive kills with weighted learning
    for (const [normalizedName, bossData] of bossKills.entries()) {
      const killTimes = bossData.killTimes;
      const bossName = bossData.name;

      if (killTimes.length < 2) continue;

      // Sort by time
      killTimes.sort((a, b) => a - b);

      // Calculate intervals with timestamps for weighted learning
      const intervals = [];
      const intervalData = []; // Store interval + timestamp for weighting

      // Get configured interval for smart maintenance detection
      const configuredInterval = this.getConfiguredInterval(bossName, bossSpawnConfig);
      let maintenanceCount = 0;

      for (let i = 1; i < killTimes.length; i++) {
        const intervalMs = killTimes[i] - killTimes[i - 1];
        const intervalHours = intervalMs / (1000 * 60 * 60);

        // SMART MAINTENANCE DETECTION
        // If we have a configured interval, check if this spawn was maintenance
        if (configuredInterval) {
          // Maintenance threshold: interval < 70% of configured interval
          const maintenanceThreshold = configuredInterval * 0.7;

          if (intervalHours < maintenanceThreshold) {
            // This is a maintenance spawn - skip it!
            maintenanceCount++;
            continue;
          }
        }

        // Filter out unrealistic intervals as final safety check
        // Allow up to 7 days (168h) for weekly bosses
        if (intervalHours >= 1 && intervalHours <= 168) {
          intervals.push(intervalHours);
          intervalData.push({
            interval: intervalHours,
            timestamp: killTimes[i], // More recent timestamp
            age: Date.now() - killTimes[i].getTime() // Age in ms
          });
        }
      }

      // Log maintenance spawns detected
      if (maintenanceCount > 0) {
        console.log(`   🔧 Filtered ${maintenanceCount} maintenance spawns for ${bossName} (${Math.round(maintenanceCount / (killTimes.length - 1) * 100)}%)`);
      }

      if (intervals.length < 2) continue;

      // Calculate weighted statistics (recent spawns = higher weight)
      // Use exponential decay: weight = e^(-age / halflife)
      // Halflife = 30 days (spawns from 30 days ago have 50% weight)
      const halfLifeMs = 30 * 24 * 60 * 60 * 1000; // 30 days in milliseconds

      let weightedSum = 0;
      let totalWeight = 0;

      for (const data of intervalData) {
        // Calculate exponential weight (more recent = higher weight)
        const weight = Math.exp(-data.age / halfLifeMs);
        weightedSum += data.interval * weight;
        totalWeight += weight;
      }

      const weightedMean = weightedSum / totalWeight;

      // Calculate weighted variance
      let weightedVarianceSum = 0;
      for (const data of intervalData) {
        const weight = Math.exp(-data.age / halfLifeMs);
        weightedVarianceSum += weight * Math.pow(data.interval - weightedMean, 2);
      }
      const weightedVariance = weightedVarianceSum / totalWeight;
      const weightedStdDev = Math.sqrt(weightedVariance);

      // Calculate coefficient of variation (consistency metric)
      const cv = weightedStdDev / weightedMean;

      // Enhanced confidence calculation based on multiple factors
      let confidence = 0.65; // Base confidence

      // Consistency bonus (lower CV = more consistent)
      if (cv < 0.03) confidence += 0.20; // Extremely consistent
      else if (cv < 0.05) confidence += 0.15; // Very consistent
      else if (cv < 0.08) confidence += 0.12; // Consistent
      else if (cv < 0.10) confidence += 0.08; // Moderately consistent
      else if (cv < 0.15) confidence += 0.05; // Somewhat consistent

      // Sample size bonus (more data = more confident)
      if (intervals.length >= 30) confidence += 0.10;
      else if (intervals.length >= 20) confidence += 0.08;
      else if (intervals.length >= 15) confidence += 0.06;
      else if (intervals.length >= 10) confidence += 0.04;
      else if (intervals.length >= 5) confidence += 0.02;

      confidence = Math.min(confidence, 0.98); // Cap at 98% (never 100%)

      // Store learned pattern with normalized name
      this.learnedPatterns.set(normalizedName, {
        meanInterval: weightedMean,
        stdDev: weightedStdDev,
        confidence,
        sampleSize: intervals.length,
        lastUpdated: new Date(),
        coefficientOfVariation: cv,
      });

      const windowMinutes = Math.round(weightedStdDev * 60 * 1.96); // 95% confidence interval in minutes

      console.log(
        `✅ ${bossName}: ${weightedMean.toFixed(2)}h ±${windowMinutes}min window (${intervals.length} spawns, ${(confidence * 100).toFixed(0)}% confidence, CV: ${(cv * 100).toFixed(1)}%)`
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
