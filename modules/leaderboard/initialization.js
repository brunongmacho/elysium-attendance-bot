/**
 * Initialization for the leaderboard system.
 */

const { SheetAPI } = require('../../utils/sheet-api');
const state = require('./state');

/**
 * Initializes the leaderboard system with Discord client and config
 *
 * @param {Client} discordClient - Discord.js client instance
 * @param {Object} botConfig - Bot configuration object from config.json
 * @param {Object} cache - Discord cache instance
 * @param {Object} crashRecoveryModule - Crash recovery module (optional)
 */
function initializeLeaderboard(discordClient, botConfig, cache = null, crashRecoveryModule = null) {
  state.client = discordClient;
  state.config = botConfig;
  state.sheetAPI = new SheetAPI(botConfig.sheet_webhook_url);
  state.discordCache = cache;
  state.crashRecovery = crashRecoveryModule;
}

module.exports = {
  initializeLeaderboard
};
