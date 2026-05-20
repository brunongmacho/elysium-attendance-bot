const fs = require("fs");
const { createLogger } = require('../utils/logger');
const mainLogger = createLogger('config');

/**
 * Bot configuration loaded from config.json and environment variables
 * Environment variables take precedence over config.json values
 * Contains Discord IDs, API endpoints, and bot settings
 * @type {Object}
 */
const config = (() => {
  const fileConfig = JSON.parse(fs.readFileSync("./config.json"));

  // Merge environment variables with file config
  // Environment variables take precedence
  return {
    ...fileConfig,
    // Discord bot token from environment (required for Koyeb deployment)
    token: process.env.DISCORD_TOKEN || fileConfig.token,
    // HTTP server port from environment (used for health checks)
    port: process.env.PORT || fileConfig.port || 3000,
    // Node environment
    node_env: process.env.NODE_ENV || fileConfig.node_env || 'production'
  };
})();

// Guild name from config
const guildName = 'TENCHU';

// Boss point values loaded from boss_points.json
// Maps boss names to point rewards for attendance
const bossPoints = JSON.parse(fs.readFileSync("./boss_points.json"));

// Feature flags
const USE_MONGODB_BIDDING = process.env.USE_MONGODB_BIDDING === 'true';
const USE_MONGODB_ATTENDANCE = process.env.USE_MONGODB_ATTENDANCE === 'true';

// Timing constants for rate limiting and delays (all values in milliseconds)
const TIMING = {
  MIN_SHEET_DELAY: 2000,          // 2 seconds - prevents rate limiting
  OVERRIDE_COOLDOWN: 10000,        // 10 seconds - admin action cooldown
  CONFIRMATION_TIMEOUT: 30000,     // 30 seconds - user has 30s to confirm
  RETRY_DELAY: 5000,               // 5 seconds - wait before retrying
  MASS_CLOSE_DELAY: 3000,          // 3 seconds - spacing for mass operations
  REACTION_RETRY_ATTEMPTS: 3,      // Try up to 3 times
  REACTION_RETRY_DELAY: 1000,      // 1 second between retries
};

/**
 * Bot version identifier
 * @type {string}
 * @constant
 */
const BOT_VERSION = "9.0.0";

/**
 * Bot startup timestamp for uptime calculations
 * @type {number}
 * @constant
 */
const BOT_START_TIME = Date.now();

/**
 * Discord user ID for AlterFrieren (special DM cooldown exemption)
 * @type {string}
 * @constant
 */
const ALTERFRIEREN_ID = '517653312783253505';

/**
 * Discord user ID for ROHYPnol
 * @type {string}
 * @constant
 */
const ROHYPnol_ID = '182081219062661120';

/**
 * Cooldown period after auction ends before new auction can start (10 minutes)
 * @type {number}
 * @constant
 */
const AUCTION_COOLDOWN = 10 * 60 * 1000;

/**
 * Interval for bidding channel cleanup operations (12 hours)
 * @type {number}
 * @constant
 */
const BIDDING_CHANNEL_CLEANUP_INTERVAL = 12 * 60 * 60 * 1000;

/**
 * Validates required configuration fields at startup
 * Prevents late failures and provides clear error messages
 * @throws {Error} If any required field is missing
 */
function validateConfig() {
  const requiredFields = {
    'token': 'Discord bot token',
    'main_guild_id': 'Main guild ID',
    'attendance_channel_id': 'Attendance channel ID',
    'admin_logs_channel_id': 'Admin logs channel ID',
    'bidding_channel_id': 'Bidding channel ID',
    'tenchu_commands_channel_id': 'Tenchu commands channel ID',
    'tenchu_role': 'Tenchu role name',
    'admin_roles': 'Admin roles array',
    'sheet_webhook_url': 'Google Sheets webhook URL'
  };

  const missing = [];
  const invalid = [];

  for (const [field, description] of Object.entries(requiredFields)) {
    if (!config[field]) {
      missing.push(`  ❌ ${field} (${description})`);
    } else if (field === 'admin_roles' && !Array.isArray(config[field])) {
      invalid.push(`  ⚠️ ${field} must be an array`);
    } else if (field === 'sheet_webhook_url' && !config[field].startsWith('http')) {
      invalid.push(`  ⚠️ ${field} must be a valid URL`);
    }
  }

  if (missing.length > 0 || invalid.length > 0) {
    mainLogger.warn('⚠️  Bot not yet configured — run !setup guild in your server to begin');
    if (missing.length > 0) mainLogger.warn('Missing config fields (will be set via !setup):', { missing });
    if (invalid.length > 0) mainLogger.warn('Invalid field values:', { invalid });
    return;  // Don't crash — allow !setup to configure interactively
  }

  mainLogger.info('Configuration validated successfully');
}

// Run validation immediately (non-fatal — logs warnings, allows !setup)
validateConfig();

module.exports = {
  config,
  guildName,
  bossPoints,
  ALTERFRIEREN_ID,
  ROHYPnol_ID,
  AUCTION_COOLDOWN,
  BIDDING_CHANNEL_CLEANUP_INTERVAL,
  BOT_VERSION,
  BOT_START_TIME,
  TIMING,
  USE_MONGODB_BIDDING,
  USE_MONGODB_ATTENDANCE,
};
