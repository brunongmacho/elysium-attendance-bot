/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ELYSIUM GUILD BOT - Admin Alert System
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Sends critical alerts to admin-logs channel
 * Used for MongoDB failures, circuit breaker events, and system issues
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

const { EmbedBuilder } = require('discord.js');

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

let discordCache = null;
let config = null;

/**
 * Initialize admin alerts system
 * @param {Object} cache - Discord channel cache
 * @param {Object} cfg - Bot configuration
 */
function initialize(cache, cfg) {
  discordCache = cache;
  config = cfg;
}

// ═══════════════════════════════════════════════════════════════════════════
// ALERT TYPES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Alert when MongoDB connection fails
 * @param {Object} details - Failure details
 */
async function alertMongoDBFailure(details) {
  const { module, operation, error, attempts, fallbackUsed } = details;

  const embed = new EmbedBuilder()
    .setTitle('🚨 MongoDB Connection Failure')
    .setDescription(`MongoDB operation failed in **${module}** module`)
    .setColor(0xff0000) // Red
    .addFields(
      { name: 'Operation', value: operation || 'Unknown', inline: true },
      { name: 'Attempts', value: `${attempts || 'N/A'}`, inline: true },
      { name: 'Fallback Used', value: fallbackUsed ? '✅ Sheets' : '❌ No', inline: true },
      { name: 'Error', value: `\`\`\`${error?.message || error || 'Unknown error'}\`\`\``, inline: false }
    )
    .setTimestamp()
    .setFooter({ text: 'MongoDB Alert System' });

  await sendAdminAlert(embed);
}

/**
 * Alert when circuit breaker opens
 * @param {Object} details - Circuit breaker details
 */
async function alertCircuitBreakerOpen(details) {
  const { name, failures, threshold } = details;

  const embed = new EmbedBuilder()
    .setTitle('⚠️ Circuit Breaker Opened')
    .setDescription(`Circuit breaker **${name}** has opened due to repeated failures`)
    .setColor(0xffa500) // Orange
    .addFields(
      { name: 'Circuit', value: name || 'Unknown', inline: true },
      { name: 'Failures', value: `${failures}/${threshold}`, inline: true },
      { name: 'Status', value: 'All requests will use fallback', inline: false }
    )
    .setTimestamp()
    .setFooter({ text: 'Circuit Breaker Alert' });

  await sendAdminAlert(embed);
}

/**
 * Alert when circuit breaker recovers
 * @param {Object} details - Recovery details
 */
async function alertCircuitBreakerRecovered(details) {
  const { name } = details;

  const embed = new EmbedBuilder()
    .setTitle('✅ Circuit Breaker Recovered')
    .setDescription(`Circuit breaker **${name}** has recovered and closed`)
    .setColor(0x00ff00) // Green
    .addFields(
      { name: 'Circuit', value: name || 'Unknown', inline: true },
      { name: 'Status', value: 'Normal operations resumed', inline: true }
    )
    .setTimestamp()
    .setFooter({ text: 'Circuit Breaker Alert' });

  await sendAdminAlert(embed);
}

/**
 * Alert when Sheet sync fails
 * @param {Object} details - Sync failure details
 */
async function alertSheetSyncFailure(details) {
  const { action, attempts, error, data } = details;

  const embed = new EmbedBuilder()
    .setTitle('⚠️ Sheet Sync Failure')
    .setDescription(`Failed to sync data to Google Sheets after ${attempts} attempts`)
    .setColor(0xffa500) // Orange
    .addFields(
      { name: 'Action Type', value: action?.type || 'Unknown', inline: true },
      { name: 'Attempts', value: `${attempts}`, inline: true },
      { name: 'Error', value: `\`\`\`${error?.message || error || 'Unknown error'}\`\`\``, inline: false }
    )
    .setTimestamp()
    .setFooter({ text: 'Sheet Sync Alert' });

  // Add data preview if available (truncate for embed limits)
  if (data) {
    const preview = JSON.stringify(data, null, 2).substring(0, 500);
    embed.addFields({ name: 'Data Preview', value: `\`\`\`json\n${preview}\n\`\`\``, inline: false });
  }

  await sendAdminAlert(embed);
}

/**
 * Alert for MongoDB data inconsistency
 * @param {Object} details - Inconsistency details
 */
async function alertDataInconsistency(details) {
  const { type, mongoValue, sheetValue, identifier } = details;

  const embed = new EmbedBuilder()
    .setTitle('⚠️ Data Inconsistency Detected')
    .setDescription(`Mismatch detected between MongoDB and Google Sheets`)
    .setColor(0xffa500) // Orange
    .addFields(
      { name: 'Type', value: type || 'Unknown', inline: true },
      { name: 'Identifier', value: identifier || 'Unknown', inline: true },
      { name: 'MongoDB Value', value: `\`${mongoValue}\``, inline: true },
      { name: 'Sheet Value', value: `\`${sheetValue}\``, inline: true },
      { name: 'Resolution', value: 'MongoDB is source of truth - Sheet will be updated', inline: false }
    )
    .setTimestamp()
    .setFooter({ text: 'Data Consistency Alert' });

  await sendAdminAlert(embed);
}

/**
 * Alert for successful Discord ID migration
 * @param {Object} details - Migration details
 */
async function alertDiscordIdMigration(details) {
  const { username, oldId, newId } = details;

  const embed = new EmbedBuilder()
    .setTitle('✅ Discord ID Migrated')
    .setDescription(`Member ID successfully migrated from temp to real Discord ID`)
    .setColor(0x00ff00) // Green
    .addFields(
      { name: 'Username', value: username || 'Unknown', inline: true },
      { name: 'Old ID', value: `\`${oldId}\``, inline: true },
      { name: 'New ID', value: `\`${newId}\``, inline: true }
    )
    .setTimestamp()
    .setFooter({ text: 'Discord ID Migration' });

  await sendAdminAlert(embed);
}

// ═══════════════════════════════════════════════════════════════════════════
// CORE ALERT FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Send alert to admin-logs channel
 * @param {EmbedBuilder} embed - Alert embed
 */
async function sendAdminAlert(embed) {
  try {
    if (!discordCache) {
      console.error('❌ [Admin Alerts] Discord cache not initialized');
      return;
    }

    if (!config || !config.admin_logs_channel_id) {
      console.error('❌ [Admin Alerts] Admin logs channel ID not found in config.json');
      return;
    }

    const adminChannel = await discordCache.getChannel(config.admin_logs_channel_id);
    if (!adminChannel) {
      console.error('❌ [Admin Alerts] Admin logs channel not found:', config.admin_logs_channel_id);
      return;
    }

    await adminChannel.send({ embeds: [embed] });
    console.log('✅ [Admin Alerts] Alert sent to admin-logs');

  } catch (error) {
    console.error('❌ [Admin Alerts] Failed to send alert:', error.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
  initialize,
  alertMongoDBFailure,
  alertCircuitBreakerOpen,
  alertCircuitBreakerRecovered,
  alertSheetSyncFailure,
  alertDataInconsistency,
  alertDiscordIdMigration
};
