/**
 * ============================================================================
 * DISCORD-BASED MONITORING SYSTEM (PHASE 3.3)
 * ============================================================================
 *
 * Internal monitoring using Discord webhooks - no external dependencies!
 * Sends alerts to admin_logs_channel for:
 * - Critical errors (MongoDB, report failures, high error rates)
 * - Memory usage warnings
 * - Daily health digest
 *
 * @module discord-monitoring
 */

const { EmbedBuilder } = require('discord.js');

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Error rate thresholds
 */
const ERROR_THRESHOLDS = {
  HIGH_RATE_PER_MINUTE: 10,  // Alert if >10 errors/minute
  CRITICAL_RATE_PER_MINUTE: 50, // Critical alert if >50 errors/minute
  MEMORY_WARNING_PERCENT: 80, // Warn if heap usage >80%
  MEMORY_CRITICAL_PERCENT: 90 // Critical if heap usage >90%
};

/**
 * Error tracking window (last hour)
 */
const ERROR_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const errorLog = [];

/**
 * Admin channel reference (set during bot initialization)
 */
let adminChannel = null;

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize monitoring system with admin channel
 * @param {Object} channel - Discord channel object for alerts
 */
function initialize(channel) {
  adminChannel = channel;
  console.log('✅ [Monitoring] Discord monitoring initialized');
}

// ============================================================================
// ERROR TRACKING
// ============================================================================

/**
 * Log an error for tracking
 * @param {Error|string} error - Error object or message
 * @param {string} context - Context where error occurred
 * @param {Object} metadata - Additional error metadata
 */
function logError(error, context, metadata = {}) {
  const errorEntry = {
    timestamp: Date.now(),
    message: error?.message || error,
    context,
    metadata,
    stack: error?.stack?.split('\n').slice(0, 3).join('\n') // First 3 lines only
  };

  errorLog.push(errorEntry);

  // Cleanup old errors (older than 1 hour)
  const cutoff = Date.now() - ERROR_WINDOW_MS;
  while (errorLog.length > 0 && errorLog[0].timestamp < cutoff) {
    errorLog.shift();
  }

  // Check if error rate is high
  checkErrorRate();
}

/**
 * Check current error rate and alert if threshold exceeded
 */
function checkErrorRate() {
  const now = Date.now();
  const oneMinuteAgo = now - (60 * 1000);

  // Count errors in last minute
  const recentErrors = errorLog.filter(e => e.timestamp >= oneMinuteAgo);
  const errorRate = recentErrors.length;

  if (errorRate >= ERROR_THRESHOLDS.CRITICAL_RATE_PER_MINUTE) {
    alertHighErrorRate(errorRate, 'CRITICAL', recentErrors.slice(0, 5));
  } else if (errorRate >= ERROR_THRESHOLDS.HIGH_RATE_PER_MINUTE) {
    alertHighErrorRate(errorRate, 'WARNING', recentErrors.slice(0, 3));
  }
}

/**
 * Alert about high error rate
 * @param {number} errorRate - Errors per minute
 * @param {string} severity - WARNING or CRITICAL
 * @param {Array} recentErrors - Sample of recent errors
 */
async function alertHighErrorRate(errorRate, severity, recentErrors) {
  if (!adminChannel) return;

  const color = severity === 'CRITICAL' ? 0xFF0000 : 0xFFA500;
  const emoji = severity === 'CRITICAL' ? '🚨' : '⚠️';

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`${emoji} ${severity}: High Error Rate Detected`)
    .setDescription(`**${errorRate} errors in the last minute**`)
    .setTimestamp();

  // Add sample errors
  if (recentErrors.length > 0) {
    const errorSample = recentErrors.map(e =>
      `• [${e.context}] ${e.message.substring(0, 100)}${e.message.length > 100 ? '...' : ''}`
    ).join('\n');

    embed.addFields({
      name: 'Recent Errors',
      value: errorSample || 'No details available',
      inline: false
    });
  }

  try {
    await adminChannel.send({ embeds: [embed] });
  } catch (err) {
    console.error('❌ Failed to send error rate alert:', err.message);
  }
}

// ============================================================================
// SPECIFIC ALERTS
// ============================================================================

/**
 * Alert about MongoDB connection failure
 * @param {Error} error - MongoDB error
 */
async function alertMongoDBFailure(error) {
  if (!adminChannel) return;

  const embed = new EmbedBuilder()
    .setColor(0xFF0000)
    .setTitle('🚨 CRITICAL: MongoDB Connection Failed')
    .setDescription('The bot cannot connect to MongoDB')
    .addFields(
      { name: 'Error', value: error.message.substring(0, 1000), inline: false },
      { name: 'Impact', value: '• Reports unavailable\n• Data not being saved\n• Bot running in degraded mode', inline: false },
      { name: 'Action Required', value: 'Check MongoDB server status and connection string', inline: false }
    )
    .setTimestamp();

  try {
    await adminChannel.send({ embeds: [embed] });
  } catch (err) {
    console.error('❌ Failed to send MongoDB alert:', err.message);
  }
}

/**
 * Alert about report generation failure
 * @param {string} reportType - 'weekly' or 'monthly'
 * @param {Error} error - Report generation error
 */
async function alertReportFailure(reportType, error) {
  if (!adminChannel) return;

  const embed = new EmbedBuilder()
    .setColor(0xFFA500)
    .setTitle(`⚠️ ${reportType.charAt(0).toUpperCase() + reportType.slice(1)} Report Failed`)
    .setDescription(`Failed to generate ${reportType} report after retries`)
    .addFields(
      { name: 'Error', value: error.message.substring(0, 1000), inline: false },
      { name: 'Retry Status', value: 'All 3 retry attempts exhausted', inline: false }
    )
    .setTimestamp();

  try {
    await adminChannel.send({ embeds: [embed] });
  } catch (err) {
    console.error('❌ Failed to send report failure alert:', err.message);
  }
}

/**
 * Alert about high memory usage
 * @param {number} usagePercent - Current heap usage percentage
 * @param {Object} memoryStats - Full memory statistics
 */
async function alertHighMemory(usagePercent, memoryStats) {
  if (!adminChannel) return;

  const isCritical = usagePercent >= ERROR_THRESHOLDS.MEMORY_CRITICAL_PERCENT;
  const color = isCritical ? 0xFF0000 : 0xFFA500;
  const emoji = isCritical ? '🚨' : '⚠️';
  const severity = isCritical ? 'CRITICAL' : 'WARNING';

  const formatBytes = (bytes) => {
    const mb = bytes / 1024 / 1024;
    return `${Math.round(mb * 10) / 10} MB`;
  };

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`${emoji} ${severity}: High Memory Usage`)
    .setDescription(`**Heap usage at ${usagePercent}%**`)
    .addFields(
      { name: 'Heap Used', value: formatBytes(memoryStats.heapUsed), inline: true },
      { name: 'Heap Total', value: formatBytes(memoryStats.heapTotal), inline: true },
      { name: 'RSS', value: formatBytes(memoryStats.rss), inline: true },
      { name: 'Impact', value: isCritical ? '⚠️ Risk of crashes' : 'Performance may degrade', inline: false },
      { name: 'Recommended Action', value: isCritical ? 'Consider restarting bot' : 'Monitor memory usage', inline: false }
    )
    .setTimestamp();

  try {
    await adminChannel.send({ embeds: [embed] });
  } catch (err) {
    console.error('❌ Failed to send memory alert:', err.message);
  }
}

/**
 * Alert about mass event reminder deactivations
 * @param {number} count - Number of reminders deactivated
 * @param {Array} reminders - Sample of deactivated reminders
 */
async function alertMassReminderDeactivation(count, reminders) {
  if (!adminChannel) return;

  const embed = new EmbedBuilder()
    .setColor(0xFFA500)
    .setTitle('⚠️ Mass Event Reminder Deactivation')
    .setDescription(`**${count} event reminders deactivated** due to channel errors`)
    .addFields({
      name: 'Sample Deactivated Reminders',
      value: reminders.slice(0, 5).map(r =>
        `• ${r.eventName} (Channel: ${r.channelId})`
      ).join('\n') || 'No details available',
      inline: false
    })
    .setTimestamp();

  try {
    await adminChannel.send({ embeds: [embed] });
  } catch (err) {
    console.error('❌ Failed to send reminder deactivation alert:', err.message);
  }
}

// ============================================================================
// DAILY HEALTH DIGEST
// ============================================================================

/**
 * Send daily health digest to admin channel
 * @param {Object} healthData - Health data from /health endpoint
 */
async function sendDailyHealthDigest(healthData) {
  if (!adminChannel) return;

  // Calculate error stats for last 24 hours
  const twentyFourHoursAgo = Date.now() - (24 * 60 * 60 * 1000);
  const dailyErrors = errorLog.filter(e => e.timestamp >= twentyFourHoursAgo);

  const embed = new EmbedBuilder()
    .setColor(0x3498DB)
    .setTitle('📊 Daily Health Digest')
    .setDescription(`**${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}**`)
    .setTimestamp();

  // Bot status
  embed.addFields({
    name: '🤖 Bot Status',
    value: [
      `**Uptime:** ${Math.floor(healthData.uptime / 3600)}h ${Math.floor((healthData.uptime % 3600) / 60)}m`,
      `**Version:** ${healthData.version}`,
      `**Active Spawns:** ${healthData.activeSpawns}`,
      `**Pending Verifications:** ${healthData.pendingVerifications}`
    ].join('\n'),
    inline: false
  });

  // Memory status
  if (healthData.memory) {
    const healthIndicator = parseInt(healthData.memory.heapUsedPercent) >= 80 ? '🔴' :
                           parseInt(healthData.memory.heapUsedPercent) >= 60 ? '🟡' : '🟢';
    embed.addFields({
      name: '💾 Memory',
      value: [
        `${healthIndicator} **Usage:** ${healthData.memory.heapUsed} / ${healthData.memory.heapTotal} (${healthData.memory.heapUsedPercent})`,
        `**RSS:** ${healthData.memory.rss}`
      ].join('\n'),
      inline: true
    });
  }

  // MongoDB status
  if (healthData.mongodb) {
    const mongoIndicator = healthData.mongodb.connected ? '🟢' : '🔴';
    embed.addFields({
      name: '🗄️ MongoDB',
      value: healthData.mongodb.connected ?
        [
          `${mongoIndicator} **Connected**`,
          `**Latency:** ${healthData.mongodb.latencyMs}ms`,
          `**Database:** ${healthData.mongodb.database}`
        ].join('\n') :
        `${mongoIndicator} **Disconnected**`,
      inline: true
    });
  }

  // Cache performance
  if (healthData.caches) {
    const reportsCacheHitRate = healthData.caches.reports?.weekly?.hitRate || 'N/A';
    const attendanceCacheHitRate = healthData.caches.attendance?.hitRate || 'N/A';

    embed.addFields({
      name: '🗂️ Cache Performance',
      value: [
        `**Reports:** ${reportsCacheHitRate}`,
        `**Attendance:** ${attendanceCacheHitRate}`
      ].join('\n'),
      inline: true
    });
  }

  // Error summary
  embed.addFields({
    name: '⚠️ Errors (Last 24h)',
    value: dailyErrors.length > 0 ?
      `**Total:** ${dailyErrors.length} errors\n**Peak:** ${getPeakErrorRate(dailyErrors)}/min` :
      '✅ No errors logged',
    inline: false
  });

  try {
    await adminChannel.send({ embeds: [embed] });
    console.log('✅ Daily health digest sent');
  } catch (err) {
    console.error('❌ Failed to send daily health digest:', err.message);
  }
}

/**
 * Calculate peak error rate from error log
 * @param {Array} errors - Error log entries
 * @returns {number} Peak errors per minute
 */
function getPeakErrorRate(errors) {
  if (errors.length === 0) return 0;

  let peakRate = 0;
  const now = Date.now();

  // Check each minute in the last 24 hours
  for (let i = 0; i < 24 * 60; i++) {
    const minuteStart = now - (i * 60 * 1000);
    const minuteEnd = minuteStart + (60 * 1000);

    const errorsInMinute = errors.filter(e =>
      e.timestamp >= minuteStart && e.timestamp < minuteEnd
    ).length;

    peakRate = Math.max(peakRate, errorsInMinute);
  }

  return peakRate;
}

/**
 * Check memory usage and alert if high
 */
function checkMemoryUsage() {
  const memUsage = process.memoryUsage();
  const usagePercent = Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100);

  if (usagePercent >= ERROR_THRESHOLDS.MEMORY_WARNING_PERCENT) {
    alertHighMemory(usagePercent, memUsage);
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  initialize,
  logError,
  alertMongoDBFailure,
  alertReportFailure,
  alertHighMemory,
  alertMassReminderDeactivation,
  sendDailyHealthDigest,
  checkMemoryUsage,
  ERROR_THRESHOLDS
};
