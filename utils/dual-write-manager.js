/**
 * ============================================================================
 * DUAL-WRITE MANAGER - MongoDB + Google Sheets Parallel Write Handler
 * ============================================================================
 *
 * PURPOSE:
 * Manages parallel writes to MongoDB (primary) and Google Sheets (backup)
 * with retry logic to prevent data loss when Sheets API fails.
 *
 * FEATURES:
 * - MongoDB-first priority (fast and reliable)
 * - Automatic Sheets retry with exponential backoff (3 attempts)
 * - Admin alerts on persistent Sheets failures
 * - Failed write tracking for manual recovery
 * - Retry queue for failed Sheets operations
 *
 * FIXES: CRIT-003 - Data loss risk in dual-write pattern
 *
 * @module utils/dual-write-manager
 * @version 1.0.0
 */

const { EmbedBuilder } = require('discord.js');

class DualWriteManager {
  constructor(sheetAPI) {
    this.sheetAPI = sheetAPI;
    this.failedWrites = [];
    this.maxRetries = 3;
    this.retryDelay = 2000; // Start at 2 seconds
    this.adminChannel = null;
    this.stats = {
      totalWrites: 0,
      mongoSuccesses: 0,
      mongoFailures: 0,
      sheetsSuccesses: 0,
      sheetsFailures: 0,
      retriesPerformed: 0
    };
  }

  /**
   * Set admin channel for alerts
   * @param {TextChannel} channel - Discord admin channel
   */
  setAdminChannel(channel) {
    this.adminChannel = channel;
    console.log('✅ [Dual-Write] Admin channel configured for failure alerts');
  }

  /**
   * Perform dual-write with MongoDB priority and Sheets retry
   *
   * @param {string} operation - Operation name for logging
   * @param {Function} mongoWrite - Async MongoDB write function
   * @param {Object} sheetsCall - { action: string, data: Object } for Sheets API
   * @param {Object} options - Configuration options
   * @param {boolean} options.critical - If true, fail fast if MongoDB fails (default: true)
   * @param {boolean} options.alertOnFailure - Send admin alert if Sheets fails (default: true)
   * @param {boolean} options.trackFailure - Track failed Sheets writes for recovery (default: true)
   * @returns {Promise<Object>} Result object with success status and details
   */
  async dualWrite(operation, mongoWrite, sheetsCall, options = {}) {
    const {
      critical = true,
      alertOnFailure = true,
      trackFailure = true
    } = options;

    const startTime = Date.now();
    this.stats.totalWrites++;

    console.log(`🔄 [DUAL-WRITE] ${operation} - Starting parallel write...`);

    // ========================================================================
    // STEP 1: MongoDB Write (Priority - Fast and Reliable)
    // ========================================================================

    let mongoResult = null;
    const mongoStartTime = Date.now();

    try {
      mongoResult = await mongoWrite();
      const mongoDuration = Date.now() - mongoStartTime;

      this.stats.mongoSuccesses++;
      console.log(`   ✅ [MongoDB] ${operation} completed (${mongoDuration}ms)`);

    } catch (mongoError) {
      const mongoDuration = Date.now() - mongoStartTime;
      this.stats.mongoFailures++;

      console.error(`   ❌ [MongoDB] ${operation} FAILED (${mongoDuration}ms):`, mongoError.message);

      if (critical) {
        // MongoDB is critical - abort entire operation if it fails
        throw new Error(`MongoDB write failed for ${operation}: ${mongoError.message}`);
      }

      mongoResult = { success: false, error: mongoError.message };
    }

    // ========================================================================
    // STEP 2: Google Sheets Write (Backup - With Retry Logic)
    // ========================================================================

    const sheetsStartTime = Date.now();
    let sheetsSuccess = false;
    let sheetsError = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const sheetsResult = await this.sheetAPI.call(sheetsCall.action, sheetsCall.data);
        const sheetsDuration = Date.now() - sheetsStartTime;

        this.stats.sheetsSuccesses++;
        if (attempt > 1) {
          this.stats.retriesPerformed++;
        }

        console.log(`   ✅ [Sheets] ${operation} completed on attempt ${attempt} (${sheetsDuration}ms)`);
        sheetsSuccess = true;
        break;

      } catch (error) {
        sheetsError = error;
        console.error(`   ⚠️ [Sheets] ${operation} failed (attempt ${attempt}/${this.maxRetries}):`, error.message);

        // Retry logic with exponential backoff
        if (attempt < this.maxRetries) {
          const delay = this.retryDelay * Math.pow(2, attempt - 1); // 2s, 4s, 8s
          console.log(`   ⏳ [Sheets] Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    // ========================================================================
    // STEP 3: Handle Sheets Failure
    // ========================================================================

    if (!sheetsSuccess) {
      this.stats.sheetsFailures++;
      const sheetsDuration = Date.now() - sheetsStartTime;

      console.error(`   ❌ [Sheets] ${operation} FAILED after ${this.maxRetries} attempts (${sheetsDuration}ms)`);

      // Track failed write for manual recovery
      if (trackFailure) {
        this.failedWrites.push({
          operation,
          sheetsCall,
          mongoResult,
          timestamp: new Date(),
          error: sheetsError?.message || 'Unknown error',
          attempts: this.maxRetries
        });

        console.log(`   📝 [Sheets] Failure tracked (${this.failedWrites.length} total pending)`);
      }

      // Send admin alert
      if (alertOnFailure) {
        await this.alertAdminSheetFailure(operation, sheetsError, mongoResult);
      }
    }

    // ========================================================================
    // STEP 4: Return Results
    // ========================================================================

    const totalTime = Date.now() - startTime;
    const status = sheetsSuccess ? '✅' : '❌';

    console.log(`✅ [DUAL-WRITE] ${operation} completed in ${totalTime}ms (MongoDB: ✅, Sheets: ${status})`);

    return {
      success: mongoResult && mongoResult.success !== false,
      mongoResult,
      sheetsSuccess,
      duration: totalTime,
      stats: this.getStats()
    };
  }

  /**
   * Alert admins about persistent Sheets write failure
   * @param {string} operation - Operation that failed
   * @param {Error} error - Error that occurred
   * @param {*} mongoResult - Result from MongoDB write
   */
  async alertAdminSheetFailure(operation, error, mongoResult) {
    try {
      if (!this.adminChannel) {
        console.warn('⚠️ [Dual-Write] Cannot send failure alert: Admin channel not configured');
        return;
      }

      const embed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('⚠️ Google Sheets Backup Failure')
        .setDescription(
          `**Operation**: \`${operation}\`\n` +
          `**Status**: MongoDB ✅ | Google Sheets ❌\n` +
          `**Attempts**: ${this.maxRetries} (all failed)`
        )
        .addFields(
          {
            name: '❌ Error',
            value: `\`\`\`${error?.message?.substring(0, 500) || 'Unknown error'}\`\`\``,
            inline: false
          },
          {
            name: '📊 Impact',
            value: '• Data successfully saved in **MongoDB** (primary)\n' +
                   '• Data **NOT backed up** to Google Sheets\n' +
                   '• Manual intervention may be required',
            inline: false
          },
          {
            name: '🔧 Action Required',
            value: '1. Check Google Sheets API status\n' +
                   '2. Verify webhook configuration\n' +
                   '3. Run `!syncbackup` to retry failed writes\n' +
                   '4. Check `!dualwritestats` for more details',
            inline: false
          },
          {
            name: '📝 Failed Writes Queue',
            value: `${this.failedWrites.length} operation(s) pending retry`,
            inline: true
          },
          {
            name: '⏰ Timestamp',
            value: new Date().toISOString(),
            inline: true
          }
        )
        .setTimestamp();

      await this.adminChannel.send({ embeds: [embed] });
      console.log('✅ [Dual-Write] Admin alert sent successfully');

    } catch (alertError) {
      console.error('❌ [Dual-Write] Failed to send admin alert:', alertError.message);
    }
  }

  /**
   * Retry all failed Sheets writes from the queue
   * @returns {Promise<Object>} Retry results summary
   */
  async retryFailedWrites() {
    if (this.failedWrites.length === 0) {
      return {
        success: true,
        message: 'No failed writes to retry',
        retried: 0,
        succeeded: 0,
        failed: 0,
        remaining: 0
      };
    }

    console.log(`🔄 [Dual-Write] Retrying ${this.failedWrites.length} failed Sheets writes...`);
    const results = [];
    const startTime = Date.now();

    // Create a copy to iterate over
    const toRetry = [...this.failedWrites];

    for (const failed of toRetry) {
      console.log(`   🔄 Retrying: ${failed.operation}...`);

      try {
        // Retry the Sheets API call
        await this.sheetAPI.call(failed.sheetsCall.action, failed.sheetsCall.data);

        console.log(`   ✅ Retry successful: ${failed.operation}`);

        // Remove from failed list
        const index = this.failedWrites.findIndex(f => f === failed);
        if (index > -1) {
          this.failedWrites.splice(index, 1);
        }

        results.push({
          operation: failed.operation,
          success: true
        });

      } catch (error) {
        console.error(`   ❌ Retry failed: ${failed.operation}:`, error.message);

        results.push({
          operation: failed.operation,
          success: false,
          error: error.message
        });
      }

      // Small delay between retries to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    const duration = Date.now() - startTime;
    const succeeded = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    console.log(`✅ [Dual-Write] Retry complete: ${succeeded}/${results.length} succeeded (${duration}ms)`);

    return {
      success: failed === 0,
      retried: results.length,
      succeeded,
      failed,
      remaining: this.failedWrites.length,
      duration,
      details: results
    };
  }

  /**
   * Get failed writes summary
   * @returns {Object} Summary of failed writes
   */
  getFailedWritesSummary() {
    return {
      count: this.failedWrites.length,
      operations: this.failedWrites.map(f => ({
        operation: f.operation,
        timestamp: f.timestamp.toISOString(),
        error: f.error,
        attempts: f.attempts
      }))
    };
  }

  /**
   * Get dual-write statistics
   * @returns {Object} Statistics about dual-write operations
   */
  getStats() {
    const mongoSuccessRate = this.stats.totalWrites > 0
      ? Math.round((this.stats.mongoSuccesses / this.stats.totalWrites) * 100)
      : 0;

    const sheetsSuccessRate = this.stats.totalWrites > 0
      ? Math.round((this.stats.sheetsSuccesses / this.stats.totalWrites) * 100)
      : 0;

    return {
      totalWrites: this.stats.totalWrites,
      mongo: {
        successes: this.stats.mongoSuccesses,
        failures: this.stats.mongoFailures,
        successRate: `${mongoSuccessRate}%`
      },
      sheets: {
        successes: this.stats.sheetsSuccesses,
        failures: this.stats.sheetsFailures,
        successRate: `${sheetsSuccessRate}%`,
        retriesPerformed: this.stats.retriesPerformed
      },
      failedWritesQueue: this.failedWrites.length
    };
  }

  /**
   * Clear failed writes queue
   * @returns {number} Number of entries cleared
   */
  clearFailedWrites() {
    const count = this.failedWrites.length;
    this.failedWrites = [];
    console.log(`🧹 [Dual-Write] Cleared ${count} failed writes from queue`);
    return count;
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      totalWrites: 0,
      mongoSuccesses: 0,
      mongoFailures: 0,
      sheetsSuccesses: 0,
      sheetsFailures: 0,
      retriesPerformed: 0
    };
    console.log('📊 [Dual-Write] Statistics reset');
  }
}

module.exports = DualWriteManager;
