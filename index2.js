/**
 * =====================================================================
 * ELYSIUM GUILD BOT - Main Application Entry Point
 * =====================================================================
 *
 * @file index2.js
 * @version 8.1
 * @description Comprehensive Discord bot for ELYSIUM guild management,
 *              integrating attendance tracking and auction bidding systems
 *              with Google Sheets synchronization.
 *
 * @features
 * - Attendance Tracking: Automated spawn thread management and member verification
 * - Auction System: Queue-based bidding with point management and winner tracking
 * - Admin Commands: Full suite of management and override capabilities
 * - Recovery System: Automatic crash recovery and state persistence
 * - Memory Management: Optimized for 256MB RAM environments
 * - Rate Limiting: Built-in protections against Discord API limits
 * - Health Monitoring: HTTP server for uptime checks
 *
 * @architecture
 * ┌─────────────────────────────────────────────────────────────┐
 * │                    ELYSIUM Guild Bot                        │
 * ├─────────────────────────────────────────────────────────────┤
 * │ Core Systems:                                               │
 * │  - Attendance Module (./attendance.js)                      │
 * │  - Bidding Module (./bidding.js)                            │
 * │  - Auctioneering Module (./auctioneering.js)                │
 * │  - Help System (./help-system.js)                           │
 * │  - Loot System (./loot-system.js)                           │
 * │  - Leaderboard System (./leaderboard-system.js)             │
 * │  - Emergency Commands (./emergency-commands.js)             │
 * │  - Error Handler (./utils/error-handler.js)                 │
 * └─────────────────────────────────────────────────────────────┘
 *
 * @sections
 * 1. Imports & Configuration
 * 2. Discord Client Initialization
 * 3. Constants & State Management
 * 4. HTTP Health Check Server
 * 5. Utility Functions
 * 6. Bidding Channel Cleanup
 * 7. Confirmation Utilities
 * 8. Command Handlers
 * 9. Event Handlers
 * 10. Bot Initialization
 *
 * @author ELYSIUM Development Team
 * @license MIT
 */

// =====================================================================
// SECTION 1: IMPORTS & DEPENDENCIES
// =====================================================================

// Discord.js - Official Discord API wrapper
const {
  Client,           // Main Discord client class
  GatewayIntentBits, // Gateway event subscriptions
  Partials,         // Partial data structures for uncached entities
  Events,           // Event type constants
  EmbedBuilder,     // Rich embed message constructor
} = require("discord.js");

// External dependencies
const fs = require("fs");             // File system operations
const http = require("http");         // HTTP server for health checks

// Internal modules - Core systems
const bidding = require("./bidding.js");                    // Auction bidding logic
const helpSystem = require("./help-system.js");             // Command help system
const auctioneering = require("./auctioneering.js");        // Auction management
const attendance = require("./attendance.js");              // Attendance tracking
const lootSystem = require("./loot-system.js");             // Loot distribution
const emergencyCommands = require("./emergency-commands.js"); // Emergency overrides
const leaderboardSystem = require("./leaderboard-system.js"); // Leaderboards
const errorHandler = require('./utils/error-handler');      // Centralized error handling
const { SheetAPI } = require('./utils/sheet-api');          // Unified Google Sheets API
const { DiscordCache } = require('./utils/discord-cache');  // Channel caching system
const { normalizeUsername } = require('./utils/common');    // Username normalization
const { IntelligenceEngine } = require('./intelligence-engine.js'); // AI/ML Intelligence Engine
const { ProactiveIntelligence } = require('./proactive-intelligence.js'); // Proactive Monitoring
const { NLPHandler } = require('./nlp-handler.js'); // Natural Language Processing

/**
 * Command alias mapping for shorthand commands.
 * Maps user-friendly shortcuts to canonical command names.
 *
 * @type {Object.<string, string>}
 * @constant
 *
 * @example
 * "!st" -> "!status"
 * "!b" -> "!bid"
 */
const COMMAND_ALIASES = {
  // Help commands
  "!?": "!help",
  "!commands": "!help",
  "!cmds": "!help",

  // Leaderboard commands
  "!leadatt": "!leaderboardattendance",
  "!leadbid": "!leaderboardbidding",
  "!leaderboards": "!leaderboards",
  "!week": "!weeklyreport",

  // Attendance commands (admin)
  "!st": "!status",
  "!addth": "!addthread",
  "!v": "!verify",
  "!vall": "!verifyall",
  "!resetpend": "!resetpending",
  "!fs": "!forcesubmit",
  "!fc": "!forceclose",
  "!debug": "!debugthread",
  "!closeall": "!closeallthread",
  "!clear": "!clearstate",
  "!maint": "!maintenance",

  // Leaderboard commands (admin)
  "!leadatt": "!leaderboardattendance",
  "!leadbid": "!leaderboardbidding",

  // Bidding commands (admin)
  "!ql": "!queuelist",
  "!queue": "!queuelist",
  "!start": "!startauction",
  "!resetb": "!resetbids",
  "!forcesubmit": "!forcesubmitresults",

  // Emergency commands (admin)
  "!emerg": "!emergency",

  // Intelligence engine commands (admin)
  "!predict": "!predictprice",
  "!suggestprice": "!predictprice",
  "!suggestauction": "!analyzequeue",
  "!bootstrap": "!bootstraplearning",
  "!learnhistory": "!bootstraplearning",
  "!analyzequeue": "!analyzequeue",
  "!engage": "!engagement",
  "!analyze": "!analyzeengagement",
  "!anomaly": "!detectanomalies",
  "!fraud": "!detectanomalies",
  "!recommend": "!recommendations",
  "!suggest": "!recommendations",
  "!perf": "!performance",
  "!nextspawn": "!predictspawn",
  "!whennext": "!predictspawn",
  "!spawntimer": "!predictspawn",

  // Member management commands (admin)
  "!removemem": "!removemember",
  "!rmmember": "!removemember",
  "!delmember": "!removemember",

  // Bidding commands (member)
  "!b": "!bid",
  "!bstatus": "!bidstatus",
  "!bs": "!bidstatus",
  "!pts": "!mypoints",
  "!mypts": "!mypoints",
  "!mp": "!mypoints",

  // Auctioneering commands
  "!auc-start": "!startauction",
  "!begin-auction": "!startauction",
  "!auc-pause": "!pause",
  "!hold": "!pause",
  "!auc-resume": "!resume",
  "!continue": "!resume",
  "!auc-stop": "!stop",
  "!end-item": "!stop",
  "!auc-extend": "!extend",
  "!ext": "!extend",
  "!auc-now": "!startauctionnow",

  // Auction control commands
  "!cancel": "!cancelitem",
  "!skip": "!skipitem",
};

// =====================================================================
// CONFIGURATION LOADING
// =====================================================================

/**
 * Bot configuration loaded from config.json
 * Contains Discord IDs, API endpoints, and bot settings
 * @type {Object}
 */
const config = JSON.parse(fs.readFileSync("./config.json"));

/**
 * Unified Google Sheets API client instance
 * Provides centralized access to Google Sheets with retry logic
 * @type {SheetAPI}
 */
const sheetAPI = new SheetAPI(config.sheet_webhook_url);

/**
 * Global Discord channel cache instance
 * Reduces redundant channel fetch calls by 60-80%
 * @type {DiscordCache|null}
 */
let discordCache = null;

/**
 * Boss point values loaded from boss_points.json
 * Maps boss names to point rewards for attendance
 * @type {Object.<string, number>}
 */
const bossPoints = JSON.parse(fs.readFileSync("./boss_points.json"));

// =====================================================================
// SECTION 2: DISCORD CLIENT INITIALIZATION
// =====================================================================

/**
 * Discord client instance with optimized memory management.
 *
 * Configuration priorities:
 * - Memory efficiency: Aggressive cache sweeping for 256MB environments
 * - Required intents: Guild management, messages, reactions, members
 * - Partial support: Enables handling of uncached entities
 *
 * @type {Client}
 * @constant
 */
const client = new Client({
  // Gateway intents - subscriptions to Discord events
  intents: [
    GatewayIntentBits.Guilds,              // Guild/server events
    GatewayIntentBits.GuildMessages,       // Message events in guilds
    GatewayIntentBits.MessageContent,      // Access to message content
    GatewayIntentBits.GuildMessageReactions, // Reaction events
    GatewayIntentBits.GuildMembers,        // Member events and data
    GatewayIntentBits.DirectMessages,      // DM support
  ],

  // Partials - handle uncached entities
  partials: [Partials.Channel, Partials.Message, Partials.Reaction],

  // Memory optimization: Sweep caches regularly to manage 256MB RAM limit
  // This is critical for long-running bots in memory-constrained environments
  sweepers: {
    messages: {
      interval: 300, // Run every 5 minutes
      lifetime: 600, // Remove messages older than 10 minutes
    },
    users: {
      interval: 600, // Run every 10 minutes
      // Keep only non-bot users and self to reduce memory footprint
      filter: () => (user) => user.bot && user.id !== client.user?.id,
    },
    guildMembers: {
      interval: 900, // Run every 15 minutes
      // Keep only self to minimize cached member data
      filter: () => (member) => member.id !== client.user?.id,
    },
  },
});

// =====================================================================
// SECTION 3: CONSTANTS & STATE MANAGEMENT
// =====================================================================

/**
 * Current bot version number
 * @type {string}
 * @constant
 */
const BOT_VERSION = "8.1";

/**
 * Bot startup timestamp for uptime calculations
 * @type {number}
 * @constant
 */
const BOT_START_TIME = Date.now();

/**
 * HTTP health check server port
 * @type {number}
 * @constant
 */
const PORT = process.env.PORT || 8000;

/**
 * Timing constants for rate limiting and delays (all values in milliseconds)
 *
 * @type {Object}
 * @constant
 * @property {number} MIN_SHEET_DELAY - Minimum delay between Google Sheets API calls
 * @property {number} OVERRIDE_COOLDOWN - Cooldown period for admin overrides
 * @property {number} CONFIRMATION_TIMEOUT - How long to wait for confirmation reactions
 * @property {number} RETRY_DELAY - Delay before retrying failed operations
 * @property {number} MASS_CLOSE_DELAY - Delay between threads in mass close operations
 * @property {number} REACTION_RETRY_ATTEMPTS - Number of times to retry reaction operations
 * @property {number} REACTION_RETRY_DELAY - Delay between reaction retry attempts
 */
const TIMING = {
  MIN_SHEET_DELAY: 2000,          // 2 seconds - prevents rate limiting
  OVERRIDE_COOLDOWN: 10000,        // 10 seconds - admin action cooldown
  CONFIRMATION_TIMEOUT: 30000,     // 30 seconds - user has 30s to confirm
  RETRY_DELAY: 5000,               // 5 seconds - wait before retrying
  MASS_CLOSE_DELAY: 3000,          // 3 seconds - spacing for mass operations
  REACTION_RETRY_ATTEMPTS: 3,      // Try up to 3 times
  REACTION_RETRY_DELAY: 1000,      // 1 second between retries
};

// =====================================================================
// STATE VARIABLES
// =====================================================================
// These track active operations and cached data in memory

/**
 * Maps thread IDs to spawn information
 * @type {Object.<string, Object>}
 * @property {string} boss - Boss name
 * @property {string} timestamp - Spawn timestamp
 * @property {string[]} members - List of verified members
 * @property {boolean} closed - Whether spawn is closed
 * @property {string} confirmThreadId - Confirmation thread ID
 */
let activeSpawns = {};

/**
 * Maps column identifiers to Google Sheets column assignments
 * Prevents duplicate column allocations for the same boss/timestamp
 * @type {Object.<string, string>}
 */
let activeColumns = {};

/**
 * Tracks pending member verifications awaiting admin approval
 * @type {Object.<string, Object>}
 * @property {string} threadId - Thread where verification is pending
 * @property {string} author - Username requesting verification
 * @property {string} userId - Discord user ID
 */
let pendingVerifications = {};

/**
 * Tracks pending spawn closure confirmations
 * @type {Object.<string, Object>}
 * @property {string} threadId - Thread being closed
 * @property {string} adminId - Admin who initiated closure
 * @property {string} type - Closure type ('close', 'forceclose', etc.)
 */
let pendingClosures = {};

/**
 * Maps thread IDs to confirmation message IDs for cleanup
 * @type {Object.<string, string[]>}
 */
let confirmationMessages = {};

/**
 * Timestamp of last Google Sheets API call (for rate limiting)
 * @type {number}
 */
let lastSheetCall = 0;

/**
 * Timestamp of last admin override action (for cooldown)
 * @type {number}
 */
let lastOverrideTime = 0;

/**
 * Timestamp when last auction ended (for cooldown enforcement)
 * @type {number}
 */
let lastAuctionEndTime = 0;

/**
 * Intelligence Engine instance for AI/ML features
 * Provides predictive analytics, engagement analysis, anomaly detection, etc.
 * @type {IntelligenceEngine}
 */
let intelligenceEngine = null;

/**
 * Proactive Intelligence instance for auto-notifications
 * Monitors guild health and sends proactive alerts
 * @type {ProactiveIntelligence}
 */
let proactiveIntelligence = null;

/**
 * NLP Handler for natural language command interpretation
 * Allows flexible command syntax without strict ! prefix
 * @type {NLPHandler}
 */
let nlpHandler = null;

/**
 * Flag indicating bot is currently recovering from a crash
 * @type {boolean}
 */
let isRecovering = false;

/**
 * Flag preventing concurrent bid processing
 * @type {boolean}
 */
let isBidProcessing = false;

/**
 * Timer reference for bidding channel cleanup scheduler
 * @type {NodeJS.Timeout|null}
 */
let biddingChannelCleanupTimer = null;

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

// =====================================================================
// SECTION 4: HTTP HEALTH CHECK SERVER
// =====================================================================

/**
 * HTTP server for health monitoring and uptime checks.
 * Provides status endpoint for external monitoring services (e.g., UptimeRobot).
 *
 * Endpoints:
 * - GET /health - Returns JSON with bot status and metrics
 * - GET / - Same as /health
 *
 * @type {http.Server}
 * @constant
 */
const server = http.createServer((req, res) => {
  // Health check endpoint - returns bot status and metrics
  if (req.url === "/health" || req.url === "/") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: "healthy",
        version: BOT_VERSION,
        uptime: process.uptime(),
        bot: client.user ? client.user.tag : "not ready",
        activeSpawns: Object.keys(activeSpawns).length,
        pendingVerifications: Object.keys(pendingVerifications).length,
        timestamp: new Date().toISOString(),
      })
    );
  } else {
    // Return 404 for all other routes
    res.writeHead(404);
    res.end("Not Found");
  }
});

// Start HTTP server on configured port
server.listen(PORT, () =>
  console.log(`🌐 Health check server on port ${PORT}`)
);

// =====================================================================
// SECTION 5: UTILITY FUNCTIONS
// =====================================================================

/**
 * Recovers bot state after unexpected crashes or restarts.
 *
 * Recovery process:
 * 1. Checks Google Sheets for any active auction state
 * 2. If crashed auction found, finalizes the current item
 * 3. Moves unfinished queue items back to BiddingItems sheet
 * 4. Notifies admins of recovery status
 * 5. Sets cooldown to prevent immediate auction restart
 *
 * This function is critical for maintaining data integrity after crashes,
 * ensuring no auction items or bids are lost.
 *
 * @async
 * @param {Client} client - Discord client instance
 * @param {Object} config - Bot configuration object
 * @returns {Promise<void>}
 *
 * @example
 * await recoverBotStateOnStartup(client, config);
 */
async function recoverBotStateOnStartup(client, config) {
  console.log(`🔄 Checking for crashed state...`);

  const savedState = await bidding.loadBiddingStateFromSheet(
    config.sheet_webhook_url
  );
  if (!savedState || !savedState.activeAuction) {
    console.log(`✅ No crashed state found, starting fresh`);
    return;
  }

  console.log(`⚠️ Found crashed auction state, recovering...`);

  const adminLogs = await discordCache.getChannel('admin_logs_channel_id').catch(() => null);

  if (adminLogs) {
    await adminLogs.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0xffa500)
          .setTitle(`🔄 Bot Recovery Started`)
          .setDescription(`Recovering crashed auction state...`)
          .setFooter({ text: `Please wait, this may take a moment...` })
          .setTimestamp(),
      ],
    });
  }

  // Recover and finalize crashed auction
  const auctState = savedState.activeAuction;
  if (auctState && auctState.curWin) {
    const sessionItems = [];
    sessionItems.push({
      item: auctState.item,
      winner: auctState.curWin,
      winnerId: auctState.curWinId,
      amount: auctState.curBid,
      source: auctState.source || "Recovered",
      timestamp: new Date().toISOString(),
    });

    // If there are unfinished queue items, move them to BiddingItems sheet
    const unfinishedQueue = savedState.queue || [];
    if (unfinishedQueue.length > 0) {
      console.log(
        `📋 Moving ${unfinishedQueue.length} unfinished queue items to BiddingItems sheet`
      );
      await moveQueueItemsToSheet(config, unfinishedQueue);
    }

    // Submit tally
    console.log(`💾 Submitting recovered session tally...`);
    await bidding.submitSessionTally(config, sessionItems);

    if (adminLogs) {
      await adminLogs.send({
        embeds: [
          new EmbedBuilder()
            .setColor(0x00ff00)
            .setTitle(`✅ Recovery Complete`)
            .setDescription(
              `Finished item: **${auctState.item}**\nWinner: ${auctState.curWin}\nBid: ${auctState.curBid}pts`
            )
            .addFields({
              name: `📋 Unfinished Items`,
              value: `${unfinishedQueue.length} item(s) moved to BiddingItems sheet`,
              inline: false,
            })
            .setFooter({ text: `Ready for next !startauction` })
            .setTimestamp(),
        ],
      });
    }
  }

  lastAuctionEndTime = Date.now();
  console.log(`✅ Recovery complete, cooldown started`);
}

/**
 * Moves unfinished auction queue items back to the BiddingItems sheet.
 *
 * Called during recovery to preserve queue items that weren't auctioned
 * before a crash. Items are appended to the BiddingItems sheet for future
 * auction sessions.
 *
 * @async
 * @param {Object} config - Bot configuration object with sheet_webhook_url
 * @param {Array<Object>} queueItems - Array of queue items to move
 * @param {string} queueItems[].item - Item name
 * @param {string} queueItems[].source - Item source/origin
 * @param {number} queueItems[].startBid - Starting bid amount
 * @returns {Promise<void>}
 * @throws {Error} When API call fails
 *
 * @example
 * await moveQueueItemsToSheet(config, [{item: "Sword", source: "Dragon", startBid: 100}]);
 */
async function moveQueueItemsToSheet(config, queueItems) {
  try {
    await sheetAPI.call('moveQueueItemsToSheet', {
      items: queueItems,
    });

    console.log(`✅ Queue items moved to sheet`);
  } catch (e) {
    console.error(`❌ Move items error:`, e);
  }
}

/**
 * Resolves command aliases to their canonical command names.
 *
 * Converts shorthand commands (e.g., "!b", "!st") to their full forms
 * (e.g., "!bid", "!status") using the COMMAND_ALIASES mapping.
 * If no alias exists, returns the command unchanged.
 *
 * @param {string} cmd - Command string to resolve
 * @returns {string} Canonical command name or original if no alias exists
 *
 * @example
 * resolveCommandAlias("!b") // Returns "!bid"
 * resolveCommandAlias("!help") // Returns "!help" (no alias)
 */
function resolveCommandAlias(cmd) {
  const lowerCmd = cmd.toLowerCase();
  return COMMAND_ALIASES[lowerCmd] || lowerCmd;
}

/**
 * Checks if a guild member has admin privileges.
 *
 * Determines admin status by checking if the member has any of the
 * roles listed in config.admin_roles. This is used throughout the bot
 * to restrict access to administrative commands.
 *
 * @param {GuildMember} member - Discord guild member to check
 * @returns {boolean} True if member has admin role, false otherwise
 *
 * @example
 * if (isAdmin(message.member)) {
 *   // Execute admin-only command
 * }
 */
function isAdmin(member) {
  return member.roles.cache.some((r) => config.admin_roles.includes(r.name));
}

/**
 * Check if member has ELYSIUM role
 * @param {GuildMember} member - Discord guild member
 * @returns {boolean} - True if member has ELYSIUM role
 */
function hasElysiumRole(member) {
  return member.roles.cache.some((r) => r.name === config.elysium_role);
}

// =====================================================================
// SECTION 6: BIDDING CHANNEL CLEANUP
// =====================================================================

/**
 * Performs comprehensive cleanup of the bidding channel.
 *
 * Cleanup operations:
 * 1. Thread Management:
 *    - Locks all active auction threads (prevents new messages)
 *    - Archives threads to remove from active list
 *    - Processes both active and archived threads
 *    - Skips cleanup if auction is currently active
 *
 * 2. Message Cleanup:
 *    - Deletes non-admin, non-bot messages
 *    - Preserves admin messages and bot messages
 *    - Rate-limited to prevent Discord API issues
 *    - Processes up to 5000 messages (50 batches of 100)
 *
 * Safety features:
 * - Will not run during active auctions (prevents interference)
 * - Rate limiting: 500ms between operations
 * - Batch processing to handle large message volumes
 * - Error handling with detailed logging
 *
 * This function is critical for maintaining a clean bidding channel
 * by removing clutter from previous auctions.
 *
 * @async
 * @returns {Promise<void>}
 * @throws {Error} Logs errors but does not throw (fail-safe design)
 *
 * @example
 * await cleanupBiddingChannel();
 */
async function cleanupBiddingChannel() {
  try {
    console.log(`🧹 Starting bidding channel cleanup...`);

    const guild = await client.guilds
      .fetch(config.main_guild_id)
      .catch(() => null);
    if (!guild) {
      console.error(`❌ Could not fetch guild for cleanup`);
      return;
    }

    const biddingChannel = await guild.channels
      .fetch(config.bidding_channel_id)
      .catch(() => null);
    if (!biddingChannel) {
      console.error(`❌ Could not fetch bidding channel for cleanup`);
      return;
    }

    // ========================================
    // CLEANUP OLD THREADS (Lock & Archive)
    // ========================================
    console.log(`🧵 Checking for old auction threads...`);

    // Check if there's an active auction session
    const auctionState = auctioneering.getAuctionState();
    const hasActiveAuction = auctionState && auctionState.active;

    let threadsLocked = 0;
    let threadsArchived = 0;
    let threadsSkipped = 0;

    if (hasActiveAuction) {
      console.log(
        `⚠️ Active auction detected - skipping thread cleanup to avoid interfering`
      );
    } else {
      try {
        // Fetch all active threads in the bidding channel
        const activeThreads = await biddingChannel.threads
          .fetchActive()
          .catch(() => null);

        if (activeThreads && activeThreads.threads.size > 0) {
          console.log(
            `📋 Found ${activeThreads.threads.size} active thread(s) in bidding channel`
          );

          for (const [threadId, thread] of activeThreads.threads) {
            try {
              // Check if thread is an auction thread (type 11 or 12)
              if (thread.type !== 11 && thread.type !== 12) {
                threadsSkipped++;
                continue;
              }

              // Lock the thread if not already locked
              if (!thread.locked && typeof thread.setLocked === "function") {
                await thread
                  .setLocked(true, "Bidding channel cleanup")
                  .catch((err) => {
                    console.warn(
                      `⚠️ Failed to lock thread ${thread.name}:`,
                      err.message
                    );
                  });
                threadsLocked++;
                console.log(`🔒 Locked: ${thread.name}`);

                // Small delay to avoid race conditions with Discord API
                await new Promise((resolve) => setTimeout(resolve, 300));
              }

              // Archive the thread if not already archived
              if (
                !thread.archived &&
                typeof thread.setArchived === "function"
              ) {
                await thread
                  .setArchived(true, "Bidding channel cleanup")
                  .catch((err) => {
                    console.warn(
                      `⚠️ Failed to archive thread ${thread.name}:`,
                      err.message
                    );
                  });
                threadsArchived++;
                console.log(`📦 Archived: ${thread.name}`);
              }

              // Rate limit: 500ms between thread operations
              await new Promise((resolve) => setTimeout(resolve, 500));
            } catch (err) {
              console.warn(
                `⚠️ Error processing thread ${thread.name}:`,
                err.message
              );
              threadsSkipped++;
            }
          }

          console.log(
            `✅ Thread cleanup: ${threadsLocked} locked, ${threadsArchived} archived, ${threadsSkipped} skipped`
          );
        } else {
          console.log(`📋 No active threads found in bidding channel`);
        }

        // Also check archived threads (fetch last 50)
        const archivedThreads = await biddingChannel.threads
          .fetchArchived({ limit: 50 })
          .catch(() => null);

        if (archivedThreads && archivedThreads.threads.size > 0) {
          console.log(
            `📋 Found ${archivedThreads.threads.size} archived thread(s) to check`
          );

          for (const [threadId, thread] of archivedThreads.threads) {
            try {
              // Lock archived threads that aren't locked yet
              if (!thread.locked && typeof thread.setLocked === "function") {
                // Must unarchive first, then lock, then re-archive
                await thread
                  .setArchived(false, "Temporary unarchive for locking")
                  .catch(() => {});

                // Small delay after unarchiving
                await new Promise((resolve) => setTimeout(resolve, 300));

                await thread
                  .setLocked(true, "Bidding channel cleanup")
                  .catch((err) => {
                    console.warn(
                      `⚠️ Failed to lock archived thread ${thread.name}:`,
                      err.message
                    );
                  });

                // Small delay after locking
                await new Promise((resolve) => setTimeout(resolve, 300));

                await thread
                  .setArchived(true, "Bidding channel cleanup")
                  .catch(() => {});
                threadsLocked++;
                console.log(`🔒 Locked archived: ${thread.name}`);

                // Rate limit
                await new Promise((resolve) => setTimeout(resolve, 500));
              }
            } catch (err) {
              console.warn(
                `⚠️ Error processing archived thread ${thread.name}:`,
                err.message
              );
            }
          }

          console.log(
            `✅ Archived thread cleanup: ${threadsLocked} additional locked`
          );
        }
      } catch (err) {
        console.error(`❌ Error during thread cleanup:`, err.message);
      }
    }

    // ========================================
    // CLEANUP OLD MESSAGES
    // ========================================
    console.log(`📊 Fetching bidding channel history...`);
    let messagesDeleted = 0;
    let messagesFetched = 0;
    let batchSize = 0;

    // Fetch messages in batches
    let lastMessageId = null;
    let shouldContinue = true;

    while (shouldContinue) {
      try {
        const options = { limit: 100 };
        if (lastMessageId) {
          options.before = lastMessageId;
        }

        const messages = await biddingChannel.messages
          .fetch(options)
          .catch(() => null);
        if (!messages || messages.size === 0) {
          console.log(`📊 Reached end of message history`);
          shouldContinue = false;
          break;
        }

        messagesFetched += messages.size;
        batchSize++;

        for (const [msgId, message] of messages) {
          // SKIP: Bot messages
          if (message.author.bot) {
            continue;
          }

          // SKIP: Admin messages
          if (message.guild) {
            const msgAuthor = await message.guild.members
              .fetch(message.author.id)
              .catch(() => null);
            if (msgAuthor && isAdmin(msgAuthor)) {
              continue;
            }
          }

          // DELETE: Non-admin, non-bot messages
          try {
            await errorHandler.safeDelete(message, 'message deletion');
            messagesDeleted++;

            // Rate limit: 1 delete per 500ms to avoid Discord API issues
            await new Promise((resolve) => setTimeout(resolve, 500));
          } catch (e) {
            console.warn(`⚠️ Could not delete message ${msgId}: ${e.message}`);
          }
        }

        // Get the last message ID for pagination
        if (messages.size > 0) {
          const lastMsg = messages.last();
          lastMessageId = lastMsg.id;
        }

        // Safety: Stop after fetching 50 batches (5000 messages)
        if (batchSize >= 50) {
          console.log(
            `⚠️ Safety limit reached (50 batches, 5000 messages). Stopping cleanup.`
          );
          shouldContinue = false;
        }
      } catch (e) {
        console.error(`❌ Error in cleanup batch ${batchSize}: ${e.message}`);
        shouldContinue = false;
      }
    }

    console.log(`✅ Bidding channel cleanup complete!`);
    console.log(
      `📊 Messages: ${messagesFetched} fetched | ${messagesDeleted} deleted`
    );
    console.log(
      `🧵 Threads: ${threadsLocked} locked | ${threadsArchived} archived | ${threadsSkipped} skipped`
    );
  } catch (e) {
    console.error(`❌ Bidding channel cleanup error:`, e);
  }
}

/**
 * Starts the automated bidding channel cleanup schedule.
 *
 * Schedule behavior:
 * - Runs cleanup immediately on bot startup
 * - Then runs every 12 hours automatically
 * - Stores timer reference in biddingChannelCleanupTimer
 *
 * This ensures the bidding channel stays clean without manual intervention.
 *
 * @returns {void}
 *
 * @example
 * startBiddingChannelCleanupSchedule();
 */
function startBiddingChannelCleanupSchedule() {
  console.log(`⏰ Starting bidding channel cleanup schedule (every 12 hours)`);

  // Run cleanup immediately on startup
  cleanupBiddingChannel().catch(console.error);

  // Then schedule every 12 hours
  biddingChannelCleanupTimer = setInterval(async () => {
    try {
      console.log(`⏰ Running scheduled bidding channel cleanup...`);
      await cleanupBiddingChannel();
    } catch (error) {
      console.error("❌ Error in bidding channel cleanup:", error.message);
      // Continue interval, don't break it
    }
  }, BIDDING_CHANNEL_CLEANUP_INTERVAL);
}

/**
 * Stops the automated bidding channel cleanup schedule.
 *
 * Clears the interval timer and sets the timer reference to null.
 * Used during bot shutdown or when cleanup needs to be disabled.
 *
 * @returns {void}
 *
 * @example
 * stopBiddingChannelCleanupSchedule();
 */
function stopBiddingChannelCleanupSchedule() {
  if (biddingChannelCleanupTimer) {
    clearInterval(biddingChannelCleanupTimer);
    biddingChannelCleanupTimer = null;
    console.log(`⏹️ Bidding channel cleanup schedule stopped`);
  }
}

// =====================================================================
// SECTION 7: CONFIRMATION UTILITIES
// =====================================================================

/**
 * Universal confirmation dialog with reaction-based user response.
 *
 * Flow:
 * 1. Sends confirmation message (embed or text)
 * 2. Adds ✅ and ❌ reaction buttons
 * 3. Waits for user to react (30 second timeout)
 * 4. Executes onConfirm or onCancel callback
 * 5. Cleans up reactions after response
 *
 * This function centralizes all confirmation logic across the bot,
 * ensuring consistent UX for destructive or important operations.
 *
 * @async
 * @param {Message} message - Original message that triggered the confirmation
 * @param {GuildMember} member - Member who must confirm (only their reactions count)
 * @param {EmbedBuilder|string} embedOrText - Confirmation prompt (embed or plain text)
 * @param {Function} onConfirm - Async callback when user confirms (✅)
 * @param {Function} onCancel - Async callback when user cancels (❌)
 * @returns {Promise<void>}
 *
 * @example
 * await awaitConfirmation(
 *   message,
 *   member,
 *   "Are you sure you want to delete this?",
 *   async (confirmMsg) => { await performDeletion(); },
 *   async (confirmMsg) => { await message.reply("Canceled"); }
 * );
 */
async function awaitConfirmation(
  message,
  member,
  embedOrText,
  onConfirm,
  onCancel
) {
  const isEmbed = embedOrText instanceof EmbedBuilder;
  const confirmMsg = isEmbed
    ? await message.reply({ embeds: [embedOrText] })
    : await message.reply(embedOrText);

  // OPTIMIZATION v6.8: Parallel reactions (2x faster)
  await Promise.all([
    confirmMsg.react("✅"),
    confirmMsg.react("❌")
  ]);

  const filter = (reaction, user) =>
    ["✅", "❌"].includes(reaction.emoji.name) && user.id === member.user.id;

  try {
    const collected = await confirmMsg.awaitReactions({
      filter,
      max: 1,
      time: TIMING.CONFIRMATION_TIMEOUT,
      errors: ["time"],
    });
    const reaction = collected.first();

    if (reaction.emoji.name === "✅") {
      await onConfirm(confirmMsg);
    } else {
      await onCancel(confirmMsg);
    }

    await attendance.removeAllReactionsWithRetry(confirmMsg);
  } catch (err) {
    await message.reply("⏱️ Confirmation timed out.");
    await attendance.removeAllReactionsWithRetry(confirmMsg);
  }
}

// =====================================================================
// SECTION 8: COMMAND HANDLERS
// =====================================================================

/**
 * Command handler registry mapping command names to handler functions.
 *
 * This object centralizes all command logic, making the bot modular and
 * maintainable. Each handler is an async function that receives:
 * - message: The Discord message that triggered the command
 * - member: The guild member who sent the command
 * - args: Array of command arguments (optional)
 *
 * Command categories:
 * - Help & Info: help, status, debugthread
 * - Attendance Admin: clearstate, closeallthread, forcesubmit, resetpending
 * - Auction System: startauction, (delegated to auctioneering module)
 * - Loot System: loot
 *
 * All handlers include proper error handling and admin permission checks.
 *
 * @type {Object.<string, Function>}
 * @constant
 */
const commandHandlers = {
  // Help command
  loot: async (message, member, args) => {
    await lootSystem.handleLootCommand(message, args, client);
  },

  help: async (message, member) => {
    const args = message.content.trim().split(/\s+/).slice(1);
    await helpSystem.handleHelp(message, args, member);
  },

  // =========================================================================
  // STATUS COMMAND - Displays bot health and active operations
  // =========================================================================
  status: async (message, member) => {
    const guild = message.guild;
    const uptime = attendance.formatUptime(Date.now() - BOT_START_TIME);
    const timeSinceSheet =
      lastSheetCall > 0
        ? `${Math.floor((Date.now() - lastSheetCall) / 1000)} seconds ago`
        : "Never";

    // Sync state from attendance module to get latest data
    activeSpawns = attendance.getActiveSpawns();
    pendingVerifications = attendance.getPendingVerifications();

    const totalSpawns = Object.keys(activeSpawns).length;

    // Sort spawns by timestamp (oldest first)
    // This helps admins prioritize closing old spawns
    const activeSpawnEntries = Object.entries(activeSpawns);
    const sortedSpawns = activeSpawnEntries.sort((a, b) => {
      // Parse timestamp format: "MM/DD/YY HH:MM"
      const parseTimestamp = (ts) => {
        const [date, time] = ts.split(" ");
        const [month, day, year] = date.split("/");
        const [hour, minute] = time.split(":");
        return new Date(`20${year}`, month - 1, day, hour, minute).getTime();
      };
      return parseTimestamp(a[1].timestamp) - parseTimestamp(b[1].timestamp);
    });

    const spawnList = sortedSpawns.slice(0, 10).map(([threadId, info], i) => {
      const spawnTime = (() => {
        const [date, time] = info.timestamp.split(" ");
        const [month, day, year] = date.split("/");
        const [hour, minute] = time.split(":");
        return new Date(`20${year}`, month - 1, day, hour, minute).getTime();
      })();

      const ageMs = Date.now() - spawnTime;
      const ageHours = Math.floor(ageMs / 3600000);
      const ageMinutes = Math.floor((ageMs % 3600000) / 60000);
      const ageText = ageHours > 0 ? `${ageHours}h ago` : `${ageMinutes}m ago`;

      return `${i + 1}. **${info.boss}** (${info.timestamp}) - ${
        info.members.length
      } verified - ${ageText} - <#${threadId}>`;
    });

    const spawnListText = spawnList.length > 0 ? spawnList.join("\n") : "None";
    const moreSpawns =
      totalSpawns > 10
        ? `\n\n*+${
            totalSpawns - 10
          } more spawns (sorted oldest first - close old ones first!)*`
        : "";

    const biddingState = bidding.getBiddingState();
    const biddingStatus = biddingState.a
      ? `🔴 Active: **${biddingState.a.item}** (${biddingState.a.curBid}pts)`
      : `🟢 Queue: ${biddingState.q.length} item(s)`;

    const embed = new EmbedBuilder()
      .setColor(0x00ff00)
      .setTitle("📊 Bot Status")
      .setDescription("✅ **Healthy**")
      .addFields(
        { name: "⏱️ Uptime", value: uptime, inline: true },
        { name: "🤖 Version", value: BOT_VERSION, inline: true },
        {
          name: "💾 Memory",
          value: `${Math.round(
            process.memoryUsage().heapUsed / 1024 / 1024
          )}MB`,
          inline: true,
        },
        { name: "🎯 Active Spawns", value: `${totalSpawns}`, inline: true },
        {
          name: "⏳ Pending Verifications",
          value: `${Object.keys(pendingVerifications).length}`,
          inline: true,
        },
        { name: "📊 Last Sheet Call", value: timeSinceSheet, inline: true },
        {
          name: "🔗 Spawn Threads (Oldest First)",
          value: spawnListText + moreSpawns,
          inline: false,
        },
        { name: "💰 Bidding System", value: biddingStatus, inline: false }
      )
      .setFooter({ text: `Requested by ${member.user.username}` })
      .setTimestamp();

    await message.reply({ embeds: [embed] });
  },

  // =========================================================================
  // CLEARSTATE COMMAND - Emergency state reset
  // =========================================================================
  clearstate: async (message, member) => {
    await awaitConfirmation(
      message,
      member,
      `⚠️ **WARNING: Clear all bot memory?**\n\n` +
        `This will clear:\n` +
        `• ${Object.keys(activeSpawns).length} active spawn(s)\n` +
        `• ${
          Object.keys(pendingVerifications).length
        } pending verification(s)\n` +
        `• ${Object.keys(activeColumns).length} active column(s)\n\n` +
        `React ✅ to confirm or ❌ to cancel.`,
      async (confirmMsg) => {
        // Reset all state variables to empty objects
        // This is a nuclear option for when the bot gets stuck
        activeSpawns = {};
        activeColumns = {};
        pendingVerifications = {};
        pendingClosures = {};
        confirmationMessages = {};

        // Sync state back to attendance module
        // This ensures both index2.js and attendance.js have consistent state
        attendance.setActiveSpawns(activeSpawns);
        attendance.setActiveColumns(activeColumns);
        attendance.setPendingVerifications(pendingVerifications);
        attendance.setPendingClosures(pendingClosures);
        attendance.setConfirmationMessages(confirmationMessages);

        await message.reply(
          `✅ **State cleared successfully!**\n\nAll bot memory has been reset. Fresh start.`
        );
        console.log(`🔧 State cleared by ${member.user.username}`);
      },
      async (confirmMsg) => {
        await message.reply("❌ Clear state canceled.");
      }
    );
  },

  // =========================================================================
  // CLOSEALLTHREAD COMMAND - Mass close all attendance threads
  // =========================================================================
  closeallthread: async (message, member) => {
    const guild = message.guild;
    const attChannel = await guild.channels
      .fetch(config.attendance_channel_id)
      .catch(() => null);
    if (!attChannel) {
      await message.reply("❌ Could not find attendance channel.");
      return;
    }

    const attThreads = await attChannel.threads.fetchActive().catch(() => null);
    if (!attThreads || attThreads.threads.size === 0) {
      await message.reply("🔭 No active threads found in attendance channel.");
      return;
    }

    const openSpawns = [];
    for (const [threadId, thread] of attThreads.threads) {
      const spawnInfo = activeSpawns[threadId];
      if (spawnInfo && !spawnInfo.closed) {
        openSpawns.push({ threadId, thread, spawnInfo });
      }
    }

    if (openSpawns.length === 0) {
      await message.reply("🔭 No open spawn threads found in bot memory.");
      return;
    }

    await awaitConfirmation(
      message,
      member,
      `⚠️ **MASS CLOSE ALL THREADS?**\n\n` +
        `This will:\n` +
        `• Verify ALL pending members in ALL threads\n` +
        `• Close and submit ${openSpawns.length} spawn thread(s)\n` +
        `• Process one thread at a time (to avoid rate limits)\n\n` +
        `**Threads to close:**\n` +
        openSpawns
          .map(
            (s, i) =>
              `${i + 1}. **${s.spawnInfo.boss}** (${s.spawnInfo.timestamp}) - ${
                s.spawnInfo.members.length
              } verified`
          )
          .join("\n") +
        `\n\nReact ✅ to confirm or ❌ to cancel.\n\n` +
        `⏱️ This will take approximately ${openSpawns.length * 5} seconds.`,
      async (confirmMsg) => {
        await message.reply(
          `📁 **Starting mass close...**\n\n` +
            `Processing ${openSpawns.length} thread(s) one by one...\n` +
            `Please wait, this may take a few minutes.`
        );

        let successCount = 0,
          failCount = 0;
        const results = [];
        let totalReactionsRemoved = 0,
          totalReactionsFailed = 0;

        for (let i = 0; i < openSpawns.length; i++) {
          const { threadId, thread, spawnInfo } = openSpawns[i];
          const operationStartTime = Date.now();

          try {
            const progress = Math.floor(((i + 1) / openSpawns.length) * 20);
            const progressBar =
              "█".repeat(progress) + "░".repeat(20 - progress);
            const progressPercent = Math.floor(
              ((i + 1) / openSpawns.length) * 100
            );

            await message.channel.send(
              `📋 **[${i + 1}/${
                openSpawns.length
              }]** ${progressBar} ${progressPercent}%\n` +
                `Processing: **${spawnInfo.boss}** (${spawnInfo.timestamp})...`
            );

            const pendingInThread = Object.entries(pendingVerifications).filter(
              ([msgId, p]) => p.threadId === threadId
            );

            if (pendingInThread.length > 0) {
              await message.channel.send(
                `   ├─ Found ${pendingInThread.length} pending verification(s)... Auto-verifying all...`
              );

              const newMembers = pendingInThread
                .filter(
                  ([msgId, p]) =>
                    !spawnInfo.members.some(
                      (m) => normalizeUsername(m) === normalizeUsername(p.author)
                    )
                )
                .map(([msgId, p]) => p.author);

              spawnInfo.members.push(...newMembers);

              const messageIds = pendingInThread.map(([msgId, p]) => msgId);
              const messagePromises = messageIds.map((msgId) =>
                thread.messages.fetch(msgId).catch(() => null)
              );
              const fetchedMessages = await Promise.allSettled(messagePromises);

              const reactionPromises = fetchedMessages.map((result) => {
                if (result.status === "fulfilled" && result.value) {
                  return result.value.reactions.removeAll().catch(() => {});
                }
                return Promise.resolve();
              });
              await Promise.allSettled(reactionPromises);

              pendingInThread.forEach(
                ([msgId]) => delete pendingVerifications[msgId]
              );

              await message.channel.send(
                `   ├─ ✅ Auto-verified ${newMembers.length} member(s) (${
                  pendingInThread.length - newMembers.length
                } were duplicates)`
              );
            }

            await thread
              .send(
                `📍 Closing spawn **${spawnInfo.boss}** (${spawnInfo.timestamp})... Submitting ${spawnInfo.members.length} members to Google Sheets...`
              )
              .catch((err) =>
                console.warn(
                  `⚠️ Could not post to spawn thread ${threadId}: ${err.message}`
                )
              );

            spawnInfo.closed = true;

            await message.channel.send(
              `   ├─ 📊 Submitting ${spawnInfo.members.length} member(s) to Google Sheets...`
            );

            const payload = {
              action: "submitAttendance",
              boss: spawnInfo.boss,
              date: spawnInfo.date,
              time: spawnInfo.time,
              timestamp: spawnInfo.timestamp,
              members: spawnInfo.members,
            };

            const resp = await attendance.postToSheet(payload);

            if (resp.ok) {
              await thread
                .send(
                  `✅ Attendance submitted successfully! Archiving thread...`
                )
                .catch((err) =>
                  console.warn(
                    `⚠️ Could not post success to spawn thread ${threadId}: ${err.message}`
                  )
                );

              if (spawnInfo.confirmThreadId) {
                const confirmThread = await guild.channels
                  .fetch(spawnInfo.confirmThreadId)
                  .catch(() => null);
                if (confirmThread) {
                  await confirmThread
                    .send(
                      `✅ Spawn closed: **${spawnInfo.boss}** (${spawnInfo.timestamp}) - ${spawnInfo.members.length} members recorded`
                    )
                    .catch(() => {});
                  await errorHandler.safeDelete(confirmThread, 'message deletion');
                }
              }

              await message.channel.send(
                `   ├─ 🧹 Cleaning up reactions from thread...`
              );
              const cleanupStats = await attendance.cleanupAllThreadReactions(
                thread
              );
              totalReactionsRemoved += cleanupStats.success;
              totalReactionsFailed += cleanupStats.failed;

              if (cleanupStats.failed > 0) {
                await message.channel.send(
                  `   ├─ ⚠️ Warning: ${cleanupStats.failed} message(s) still have reactions`
                );
              }

              await thread
                .setArchived(true, `Mass close by ${member.user.username}`)
                .catch(() => {});

              delete activeSpawns[threadId];
              delete activeColumns[`${spawnInfo.boss}|${spawnInfo.timestamp}`];
              delete confirmationMessages[threadId];

              successCount++;
              results.push(
                `✅ **${spawnInfo.boss}** - ${spawnInfo.members.length} members submitted`
              );

              await message.channel.send(
                `   └─ ✅ **Success!** Thread closed and archived.`
              );

              console.log(
                `📍 Mass close: ${spawnInfo.boss} at ${spawnInfo.timestamp} (${spawnInfo.members.length} members)`
              );
            } else {
              console.warn(
                `⚠️ First attempt failed for ${spawnInfo.boss}, retrying in 5s...`
              );
              await message.channel.send(
                `   ├─ ⚠️ First attempt failed, retrying in 5 seconds...`
              );
              await new Promise((resolve) =>
                setTimeout(resolve, TIMING.RETRY_DELAY)
              );

              const retryResp = await attendance.postToSheet(payload);

              if (retryResp.ok) {
                if (spawnInfo.confirmThreadId) {
                  const confirmThread = await guild.channels
                    .fetch(spawnInfo.confirmThreadId)
                    .catch(() => null);
                  if (confirmThread)
                    await errorHandler.safeDelete(confirmThread, 'message deletion');
                }

                await thread
                  .setArchived(true, `Mass close by ${member.user.username}`)
                  .catch(() => {});

                delete activeSpawns[threadId];
                delete activeColumns[
                  `${spawnInfo.boss}|${spawnInfo.timestamp}`
                ];

                successCount++;
                results.push(
                  `✅ **${spawnInfo.boss}** - ${spawnInfo.members.length} members submitted (retry succeeded)`
                );

                await message.channel.send(
                  `   └─ ✅ **Success on retry!** Thread closed and archived.`
                );

                console.log(
                  `📍 Mass close (retry): ${spawnInfo.boss} at ${spawnInfo.timestamp} (${spawnInfo.members.length} members)`
                );
              } else {
                failCount++;
                results.push(
                  `❌ **${spawnInfo.boss}** - Failed: ${
                    retryResp.text || retryResp.err
                  } (after retry)`
                );

                await message.channel.send(
                  `   └─ ❌ **Failed after retry!** Error: ${
                    retryResp.text || retryResp.err
                  }\n` + `   Members: ${spawnInfo.members.join(", ")}`
                );

                console.error(
                  `❌ Mass close failed (after retry) for ${spawnInfo.boss}:`,
                  retryResp.text || retryResp.err
                );
              }
            }

            const operationTime = Date.now() - operationStartTime;
            const minDelay = TIMING.MASS_CLOSE_DELAY;
            const remainingDelay = Math.max(0, minDelay - operationTime);

            if (i < openSpawns.length - 1) {
              if (remainingDelay > 0) {
                await message.channel.send(
                  `   ⏳ Waiting ${Math.ceil(
                    remainingDelay / 1000
                  )} seconds before next thread...`
                );
                await new Promise((resolve) =>
                  setTimeout(resolve, remainingDelay)
                );
              } else {
                await message.channel.send(
                  `   ⏳ Operation took ${Math.ceil(
                    operationTime / 1000
                  )}s, proceeding immediately...`
                );
              }
            }
          } catch (err) {
            failCount++;
            results.push(`❌ **${spawnInfo.boss}** - Error: ${err.message}`);
            await message.channel.send(`   └─ ❌ **Error!** ${err.message}`);
            console.error(`❌ Mass close error for ${spawnInfo.boss}:`, err);
          }
        }

        const summaryEmbed = new EmbedBuilder()
          .setColor(successCount === openSpawns.length ? 0x00ff00 : 0xffa500)
          .setTitle("🎉 Mass Close Complete!")
          .setDescription(
            `**Summary:**\n` +
              `✅ Success: ${successCount}\n` +
              `❌ Failed: ${failCount}\n` +
              `📊 Total: ${openSpawns.length}`
          )
          .addFields(
            {
              name: "📋 Detailed Results",
              value: results.join("\n"),
              inline: false,
            },
            {
              name: "🧹 Cleanup Statistics",
              value: `✅ Reactions removed: ${totalReactionsRemoved}\n❌ Failed cleanups: ${totalReactionsFailed}`,
              inline: false,
            }
          )
          .setFooter({ text: `Executed by ${member.user.username}` })
          .setTimestamp();

        await message.reply({ embeds: [summaryEmbed] });

        console.log(
          `🔧 Mass close complete: ${successCount}/${openSpawns.length} successful by ${member.user.username}`
        );
      },
      async (confirmMsg) => {
        await message.reply("❌ Mass close canceled.");
      }
    );
  },

  forcesubmit: async (message, member) => {
    const spawnInfo = activeSpawns[message.channel.id];
    if (!spawnInfo) {
      await message.reply(
        "⚠️ This thread is not in bot memory. Use !debugthread to check state."
      );
      return;
    }

    await awaitConfirmation(
      message,
      member,
      `📊 **Force submit attendance?**\n\n` +
        `**Boss:** ${spawnInfo.boss}\n` +
        `**Timestamp:** ${spawnInfo.timestamp}\n` +
        `**Members:** ${spawnInfo.members.length}\n\n` +
        `This will submit to Google Sheets WITHOUT closing the thread.\n\n` +
        `React ✅ to confirm or ❌ to cancel.`,
      async (confirmMsg) => {
        await message.channel.send(
          `📊 Submitting ${spawnInfo.members.length} members to Google Sheets...`
        );

        const payload = {
          action: "submitAttendance",
          boss: spawnInfo.boss,
          date: spawnInfo.date,
          time: spawnInfo.time,
          timestamp: spawnInfo.timestamp,
          members: spawnInfo.members,
        };

        const resp = await attendance.postToSheet(payload);

        if (resp.ok) {
          await message.channel.send(
            `✅ **Attendance submitted successfully!**\n\n` +
              `${spawnInfo.members.length} members recorded.\n` +
              `Thread remains open for additional verifications if needed.`
          );

          console.log(
            `🔧 Force submit: ${spawnInfo.boss} by ${member.user.username} (${spawnInfo.members.length} members)`
          );
        } else {
          await message.channel.send(
            `⚠️ **Failed to submit attendance!**\n\n` +
              `Error: ${resp.text || resp.err}\n\n` +
              `**Members list (for manual entry):**\n${spawnInfo.members.join(
                ", "
              )}`
          );
        }
      },
      async (confirmMsg) => {
        await message.reply("❌ Force submit canceled.");
      }
    );
  },

  debugthread: async (message, member) => {
    const threadId = message.channel.id;
    const spawnInfo = activeSpawns[threadId];

    if (!spawnInfo) {
      await message.reply(
        `⚠️ **Thread not in bot memory!**\n\n` +
          `This thread is not being tracked by the bot.\n` +
          `It may have been:\n` +
          `• Created before bot started\n` +
          `• Manually created without bot\n` +
          `• Cleared from memory\n\n` +
          `Try using \`!clearstate\` and restarting, or use \`!forceclose\` to close it.`
      );
      return;
    }

    const pendingInThread = Object.values(pendingVerifications).filter(
      (p) => p.threadId === threadId
    );

    const embed = new EmbedBuilder()
      .setColor(0x4a90e2)
      .setTitle("🔍 Thread Debug Info")
      .addFields(
        { name: "🎯 Boss", value: spawnInfo.boss, inline: true },
        { name: "🕐 Timestamp", value: spawnInfo.timestamp, inline: true },
        {
          name: "🔒 Closed",
          value: spawnInfo.closed ? "Yes" : "No",
          inline: true,
        },
        {
          name: "✅ Verified Members",
          value: `${spawnInfo.members.length}`,
          inline: false,
        },
        {
          name: "👥 Member List",
          value: spawnInfo.members.join(", ") || "None",
          inline: false,
        },
        {
          name: "⏳ Pending Verifications",
          value: `${pendingInThread.length}`,
          inline: false,
        },
        {
          name: "🔗 Confirmation Thread",
          value: spawnInfo.confirmThreadId
            ? `<#${spawnInfo.confirmThreadId}>`
            : "None",
          inline: false,
        },
        { name: "💾 In Memory", value: "✅ Yes", inline: false }
      )
      .setFooter({ text: `Requested by ${member.user.username}` })
      .setTimestamp();

    await message.reply({ embeds: [embed] });
  },

  resetpending: async (message, member) => {
    const threadId = message.channel.id;
    const pendingInThread = Object.keys(pendingVerifications).filter(
      (msgId) => pendingVerifications[msgId].threadId === threadId
    );

    if (pendingInThread.length === 0) {
      await message.reply("✅ No pending verifications in this thread.");
      return;
    }

    await awaitConfirmation(
      message,
      member,
      `⚠️ **Clear ${pendingInThread.length} pending verification(s)?**\n\n` +
        `This will remove all pending verifications for this thread.\n` +
        `Members will NOT be added to verified list.\n\n` +
        `React ✅ to confirm or ❌ to cancel.`,
      async (confirmMsg) => {
        pendingInThread.forEach((msgId) => delete pendingVerifications[msgId]);

        await message.reply(
          `✅ **Cleared ${pendingInThread.length} pending verification(s).**\n\n` +
            `You can now close the thread.`
        );

        console.log(
          `🔧 Reset pending: ${threadId} by ${member.user.username} (${pendingInThread.length} cleared)`
        );
      },
      async (confirmMsg) => {
        await message.reply("❌ Reset pending canceled.");
      }
    );
  },

  // =========================================================================
  // STARTAUCTION COMMAND - Initiates auction session with queue
  // =========================================================================
  startauction: async (message, member) => {
    // Prevent auction start during recovery to avoid data conflicts
    if (isRecovering) {
      return await message.reply(
        `⚠️ Bot is recovering from crash, please wait...`
      );
    }

    // Check if auction is already running
    const auctState = auctioneering.getAuctionState();
    if (auctState.active) {
      return await message.reply(`❌ Auction session already running`);
    }

    // Enforce 10-minute cooldown after auction ends
    // This prevents rapid auction restarts and gives admins time to review results
    const now = Date.now();
    const timeSinceLast = now - lastAuctionEndTime;
    const cooldownRemaining = AUCTION_COOLDOWN - timeSinceLast;

    if (timeSinceLast < AUCTION_COOLDOWN) {
      const mins = Math.ceil(cooldownRemaining / 60000);
      return await message.reply(
        `⏱️ Cooldown active. Wait ${mins} more minute(s). Or use \`!startauctionnow\` to override.`
      );
    }

    await auctioneering.startAuctioneering(client, config, message.channel);
    lastAuctionEndTime = Date.now();
  },

  startauctionnow: async (message, member) => {
    if (isRecovering) {
      return await message.reply(
        `⚠️ Bot is recovering from crash, please wait...`
      );
    }

    const auctState = auctioneering.getAuctionState();
    if (auctState.active) {
      return await message.reply(`❌ Auction session already running`);
    }

    await auctioneering.startAuctioneering(client, config, message.channel);
    lastAuctionEndTime = Date.now();
    await message.reply(
      `✅ Auction started immediately. Cooldown reset to 10 minutes.`
    );
  },

  pause: async (message, member) => {
    const auctState = auctioneering.getAuctionState();
    if (!auctState.active) {
      return await message.reply(`❌ No active auction to pause`);
    }
    const success = auctioneering.pauseSession();
    if (success) {
      await message.reply(`⸸ Auction paused. Use \`!resume\` to continue.`);
    }
  },

  resume: async (message, member) => {
    const auctState = auctioneering.getAuctionState();
    if (!auctState.active || !auctState.paused) {
      return await message.reply(`❌ No paused auction to resume`);
    }
    const success = auctioneering.resumeSession(
      client,
      config,
      message.channel
    );
    if (success) {
      await message.reply(`▶️ Auction resumed.`);
    }
  },

  stop: async (message, member) => {
    const auctState = auctioneering.getAuctionState();
    if (!auctState.active || !auctState.currentItem) {
      return await message.reply(`❌ No active auction to stop`);
    }
    auctioneering.stopCurrentItem(client, config, message.channel);
    await message.reply(`⏹️ Current item auction ended immediately.`);
  },

  extend: async (message, member, args) => {
    if (args.length === 0) {
      return await message.reply(`❌ Usage: \`!extend <minutes>\``);
    }
    let value = parseInt(args[0]);
    if (isNaN(value) || value <= 0) {
      return await message.reply(`❌ Must be positive number`);
    }

    // Check if unit is specified (from NLP: "30 seconds" vs "30 minutes")
    const unit = args[1] ? args[1].toLowerCase() : '';
    let mins = value;

    // Convert seconds to minutes if needed
    if (unit && (unit.startsWith('sec') || unit === 's')) {
      mins = Math.ceil(value / 60); // Convert seconds to minutes, round up
    }
    // If unit is minutes or empty, treat as minutes (default)

    if (mins <= 0) {
      mins = 1; // Minimum 1 minute
    }
    const auctState = auctioneering.getAuctionState();
    if (!auctState.active || !auctState.currentItem) {
      return await message.reply(`❌ No active auction to extend`);
    }
    const success = auctioneering.extendCurrentItem(mins);
    if (success) {
      await message.reply(`⏱️ Extended by ${mins} minute(s).`);
    }
  },

  // Replace the !endauction handler in your commandHandlers object (around line 450 in index2.js)

  // REPLACE the entire !endauction handler in index2.js commandHandlers object (Line ~450)
  // This version fixes the race condition with double execution

  endauction: async (message, member) => {
    const auctState = auctioneering.getAuctionState();
    if (!auctState.active) {
      return await message.reply(`❌ No active auction to end`);
    }

    // Create confirmation embed
    const confirmEmbed = new EmbedBuilder()
      .setColor(0xffa500)
      .setTitle(`⚠️ End Auction Session?`)
      .setDescription(
        `This will immediately end the current auction session and submit all completed items.\n\n` +
          `**Current Item:** ${auctState.currentItem?.item || "None"}\n` +
          `**Completed Items:** ${
            auctState.sessionItems?.filter((s) => s.winner).length || 0
          }\n\n` +
          `React with ✅ to confirm or ❌ to cancel.`
      )
      .setFooter({ text: `30 seconds to respond` })
      .setTimestamp();

    const confirmMsg = await message.reply({ embeds: [confirmEmbed] });

    // OPTIMIZATION v6.8: Parallel reactions
    try {
      await Promise.all([
        confirmMsg.react("✅"),
        confirmMsg.react("❌")
      ]);
    } catch (err) {
      console.error("Failed to add reactions:", err);
      return await message.reply("❌ Failed to create confirmation prompt");
    }

    // Create reaction collector with proper filter
    const filter = (reaction, user) => {
      return (
        ["✅", "❌"].includes(reaction.emoji.name) &&
        user.id === message.author.id &&
        !user.bot
      );
    };

    // Flag to prevent double execution
    let executed = false;

    try {
      const collected = await confirmMsg.awaitReactions({
        filter,
        max: 1,
        time: 30000,
        errors: ["time"],
      });

      // Prevent double execution
      if (executed) return;
      executed = true;

      const reaction = collected.first();

      if (reaction.emoji.name === "✅") {
        // User confirmed - end the auction
        await errorHandler.safeRemoveReactions(confirmMsg, 'reaction removal');

        await message.reply(`🛑 Ending auction session immediately...`);

        // Get bidding channel for finalization (always use parent channel, not thread)
        const biddingChannel = await discordCache.getChannel('bidding_channel_id');

        // Don't call stopCurrentItem() here - endAuctionSession handles it
        // stopCurrentItem() would call itemEnd() which moves to next item,
        // but we want to END the entire session, not move to next item

        // CRITICAL: Always use the parent bidding channel (type 0 or 5), never a thread (type 11)
        // endAuctionSession will handle stopping the current item and finalizing
        await auctioneering.endAuctionSession(client, config, biddingChannel);

        await message.reply(`✅ Auction session ended and results submitted.`);
      } else {
        // Prevent double execution
        if (executed) return;
        executed = true;

        // User cancelled
        await errorHandler.safeRemoveReactions(confirmMsg, 'reaction removal');
        await message.reply(`❌ End auction canceled`);
      }
    } catch (error) {
      // Prevent double execution
      if (executed) return;
      executed = true;

      // Timeout or other error
      await errorHandler.safeRemoveReactions(confirmMsg, 'reaction removal');
      await message.reply(`⏱️ Confirmation timeout - auction continues`);
    }
  },

  queuelist: async (message, member) => {
    await auctioneering.handleQueueList(message, bidding.getBiddingState());
  },

  mypoints: async (message, member) => {
    await auctioneering.handleMyPoints(message, bidding, config);
  },

  bidstatus: async (message, member) => {
    await auctioneering.handleBidStatus(message, config);
  },

  cancelitem: async (message, member) => {
    await auctioneering.handleCancelItem(message);
  },

  skipitem: async (message, member) => {
    await auctioneering.handleSkipItem(message);
  },

  forcesubmitresults: async (message, member) => {
    await auctioneering.handleForceSubmitResults(message, config, bidding);
  },

  maintenance: async (message, member) => {
    // Define all maintenance bosses that spawn during maintenance
    const maintenanceBosses = [
      "Venatus",
      "Viorent",
      "Ego",
      "Livera",
      "Araneo",
      "Undomiel",
      "Lady Dalia",
      "General Aquleus",
      "Amentis",
      "Baron Braudmore",
      "Wannitas",
      "Metus",
      "Duplican",
      "Shuliar",
      "Gareth",
      "Titore",
      "Larba",
      "Catena",
      "Secreta",
      "Ordo",
      "Asta",
      "Supore",
    ];

    // Show confirmation message
    await awaitConfirmation(
      message,
      member,
      `⚠️ **Spawn Maintenance Threads?**\n\n` +
        `This will create spawn threads for **${maintenanceBosses.length} bosses** that spawn during maintenance:\n\n` +
        `${maintenanceBosses.map((b, i) => `${i + 1}. ${b}`).join("\n")}\n\n` +
        `**Spawn time:** 5 minutes from now\n\n` +
        `React ✅ to confirm or ❌ to cancel.`,
      async (confirmMsg) => {
        // Get current time + 5 minutes
        const spawnDate = new Date(Date.now() + 5 * 60 * 1000);
        const year = spawnDate.getFullYear();
        const month = String(spawnDate.getMonth() + 1).padStart(2, "0");
        const day = String(spawnDate.getDate()).padStart(2, "0");
        const hours = String(spawnDate.getHours()).padStart(2, "0");
        const minutes = String(spawnDate.getMinutes()).padStart(2, "0");
        const formattedTimestamp = `${year}-${month}-${day} ${hours}:${minutes}`;

        await message.reply(
          `🔄 **Creating maintenance spawn threads...**\n\n` +
            `Spawning ${maintenanceBosses.length} boss threads...\n` +
            `Please wait...`
        );

        let successCount = 0;
        let failCount = 0;
        const results = [];

        for (const bossName of maintenanceBosses) {
          try {
            // Create the thread using attendance module
            const result = await attendance.createSpawnThreads(
              client,
              bossName,
              `${month}/${day}/${year.toString().slice(-2)}`,
              `${hours}:${minutes}`,
              formattedTimestamp,
              "manual"
            );

            if (result && result.success) {
              successCount++;
              results.push(`✅ ${bossName}`);
            } else {
              // Try direct thread creation if attendance module fails
              const attChannel = await discordCache.getChannel('attendance_channel_id');
              const spawnMessage = `⚠️ ${bossName} will spawn in 5 minutes! (${formattedTimestamp}) @everyone`;

              const thread = await attChannel.threads.create({
                name: `[${month}/${day}/${year
                  .toString()
                  .slice(-2)} ${hours}:${minutes}] ${bossName}`,
                autoArchiveDuration: config.auto_archive_minutes || 60,
                message: {
                  content: spawnMessage,
                },
                reason: `Maintenance spawn by ${member.user.username}`,
              });

              if (thread) {
                successCount++;
                results.push(`✅ ${bossName}`);
              } else {
                failCount++;
                results.push(`❌ ${bossName} - Failed to create thread`);
              }
            }

            // Small delay to avoid rate limits
            await new Promise((resolve) => setTimeout(resolve, 500));
          } catch (err) {
            failCount++;
            results.push(`❌ ${bossName} - ${err.message}`);
          }
        }

        // Send summary
        const summary = new EmbedBuilder()
          .setColor(successCount > 0 ? 0x00ff00 : 0xff0000)
          .setTitle(`✅ Maintenance Threads Created`)
          .setDescription(
            `**Success:** ${successCount}/${maintenanceBosses.length}\n` +
              `**Failed:** ${failCount}/${maintenanceBosses.length}`
          )
          .addFields({
            name: "📋 Results",
            value: results.join("\n"),
            inline: false,
          })
          .setFooter({ text: `Executed by ${member.user.username}` })
          .setTimestamp();

        await message.reply({ embeds: [summary] });

        console.log(
          `🔧 Maintenance threads created: ${successCount}/${maintenanceBosses.length} successful by ${member.user.username}`
        );
      },
      async (confirmMsg) => {
        await message.reply("❌ Maintenance spawn canceled.");
      }
    );
  },

  // ==========================================
  // MEMBER MANAGEMENT COMMANDS
  // ==========================================

  /**
   * Remove a member from the BiddingPoints sheet
   * Used when members are kicked or banned from the guild
   *
   * Usage: !removemember <member_name>
   * Aliases: !removemem, !rmmember, !delmember
   */
  removemember: async (message, member) => {
    const args = message.content.trim().split(/\s+/).slice(1);

    if (args.length === 0) {
      await message.reply(
        `❌ **Usage:** \`!removemember <member_name>\`\n\n` +
          `**Example:** \`!removemember PlayerName\`\n\n` +
          `**Aliases:** \`!removemem\`, \`!rmmember\`, \`!delmember\`\n\n` +
          `This command removes a member from:\n` +
          `• BiddingPoints sheet\n` +
          `• All attendance week sheets\n\n` +
          `**Exemption:** ForDistribution sheet (historical log) is NOT touched.\n\n` +
          `Use this when a member is kicked or banned from the guild.`
      );
      return;
    }

    const memberName = args.join(" ").trim();

    await awaitConfirmation(
      message,
      member,
      `⚠️ **Remove member from ALL sheets?**\n\n` +
        `**Member:** ${memberName}\n\n` +
        `This will:\n` +
        `• Remove the member from BiddingPoints sheet\n` +
        `• Remove the member from ALL attendance week sheets\n` +
        `• Delete all their point and attendance history\n` +
        `• ForDistribution sheet will NOT be touched (historical log)\n` +
        `• This action cannot be undone\n\n` +
        `React ✅ to confirm or ❌ to cancel.`,
      async (confirmMsg) => {
        try {
          // Call Google Sheets to remove the member
          const result = await sheetAPI.call('removeMember', {
            memberName: memberName,
          });

          if (result.status === "ok" && result.removed) {
            const actualName = result.memberName;
            const pointsLost = result.pointsLeft || 0;
            const biddingRemoved = result.biddingSheetRemoved || false;
            const attendanceRemoved = result.attendanceSheetsRemoved || 0;
            const totalAttendanceRemoved = result.totalAttendanceRemoved || false;
            const totalSheets = result.totalSheetsAffected || 0;
            const totalAttendance = result.totalAttendancePoints || 0;
            const attendanceDetails = result.attendanceSheetsDetails || [];

            // Build detailed description
            let description = `**Member:** ${actualName}\n\n`;

            if (biddingRemoved) {
              description += `**BiddingPoints Sheet:**\n`;
              description += `• Removed (had ${pointsLost} points)\n\n`;
            }

            if (attendanceRemoved > 0) {
              description += `**Attendance Sheets:**\n`;
              description += `• Removed from ${attendanceRemoved} week sheet(s)\n`;
              description += `• Total attendance points: ${totalAttendance}\n\n`;

              if (attendanceDetails.length > 0 && attendanceDetails.length <= 5) {
                description += `**Details:**\n`;
                attendanceDetails.forEach(detail => {
                  description += `• ${detail.sheet}: ${detail.attendancePoints} pts\n`;
                });
              } else if (attendanceDetails.length > 5) {
                description += `**Recent sheets:**\n`;
                attendanceDetails.slice(0, 5).forEach(detail => {
                  description += `• ${detail.sheet}: ${detail.attendancePoints} pts\n`;
                });
                description += `• ... and ${attendanceDetails.length - 5} more\n`;
              }
            }

            if (totalAttendanceRemoved) {
              description += `**TOTAL ATTENDANCE Sheet:**\n`;
              description += `• Removed from aggregated attendance sheet\n\n`;
            }

            description += `\n**Total sheets affected:** ${totalSheets}`;

            const embed = new EmbedBuilder()
              .setColor(0x00ff00)
              .setTitle(`✅ Member Removed Successfully`)
              .setDescription(description)
              .setFooter({ text: `Removed by ${member.user.username}` })
              .setTimestamp();

            await message.reply({ embeds: [embed] });

            // Log to admin-logs channel
            const adminLogsChannel = await discordCache.getChannel('admin_logs_channel_id');

            if (adminLogsChannel) {
              const logEmbed = new EmbedBuilder()
                .setColor(0xff9900)
                .setTitle(`🗑️ Member Removed from All Sheets`)
                .setDescription(
                  `**Removed Member:** ${actualName}\n` +
                    `**Bidding Points Lost:** ${pointsLost}\n` +
                    `**Attendance Points Lost:** ${totalAttendance}\n` +
                    `**Attendance Sheets:** ${attendanceRemoved}\n` +
                    `**Total Sheets:** ${totalSheets}\n` +
                    `**Removed By:** ${member.user.username}`
                )
                .setTimestamp();

              await adminLogsChannel.send({ embeds: [logEmbed] });
            }

            console.log(
              `🗑️ Removed member: ${actualName} from ${totalSheets} sheet(s) (${pointsLost} bidding pts, ${totalAttendance} attendance pts) by ${member.user.username}`
            );
          } else {
            throw new Error(
              result.message || "Member not found"
            );
          }
        } catch (err) {
          console.error("❌ Remove member error:", err);
          await message.reply(
            `❌ **Failed to remove member!**\n\n` +
              `Error: ${err.message}\n\n` +
              `The member might not exist in the sheet, or there was a connection error.`
          );
        }
      },
      async (confirmMsg) => {
        await message.reply("❌ Member removal canceled.");
      }
    );
  },

  // ==========================================
  // LEADERBOARD COMMANDS
  // ==========================================

  leaderboardattendance: async (message, member) => {
    // Permission check is done in routing logic
    console.log(`📊 ${member.user.username} requested attendance leaderboard`);
    await leaderboardSystem.displayAttendanceLeaderboard(message);
  },

  leaderboardbidding: async (message, member) => {
    // Permission check is done in routing logic
    console.log(`📊 ${member.user.username} requested bidding leaderboard`);
    await leaderboardSystem.displayBiddingLeaderboard(message);
  },

  leaderboards: async (message, member) => {
    // Permission check is done in routing logic
    console.log(`📊 ${member.user.username} requested combined leaderboards`);
    await leaderboardSystem.displayCombinedLeaderboards(message);
  },

  weeklyreport: async (message, member) => {
    // Permission check is done in routing logic
    console.log(`📅 ${member.user.username} manually triggered weekly report`);
    await message.reply({ content: "📊 Generating weekly report...", failIfNotExists: false });
    await leaderboardSystem.sendWeeklyReport();
  },

  // =========================================================================
  // INTELLIGENCE ENGINE COMMANDS - AI/ML Powered Features
  // =========================================================================

  /**
   * Predict optimal starting bid for an item based on historical data
   * Usage: !predictprice <item name>
   */
  predictprice: async (message, member) => {
    const args = message.content.trim().split(/\s+/).slice(1);

    if (args.length === 0) {
      await message.reply(
        `❌ **Usage:** \`!predictprice <item name>\`\n\n` +
        `**Example:** \`!predictprice Crimson Pendant\`\n\n` +
        `I'll analyze historical auction data to suggest an optimal starting bid!`
      );
      return;
    }

    const itemName = args.join(' ');
    await message.reply(`🤖 Analyzing historical data for **${itemName}**...`);

    try {
      const prediction = await intelligenceEngine.predictItemValue(itemName);

      if (!prediction.success) {
        const embed = new EmbedBuilder()
          .setColor(0xff9900)
          .setTitle(`📊 Price Prediction: ${itemName}`)
          .setDescription(`⚠️ ${prediction.reason}`)
          .setFooter({ text: `Requested by ${member.user.username}` })
          .setTimestamp();

        if (prediction.suggestion) {
          embed.addFields({
            name: '💡 Alternative Suggestion',
            value: `Based on similar items: **${prediction.suggestion.suggestion} points**\n${prediction.suggestion.reason}`,
            inline: false,
          });

          if (prediction.suggestion.similarItems && prediction.suggestion.similarItems.length > 0) {
            const similarList = prediction.suggestion.similarItems
              .map(s => `• ${s.name} - ${s.price}pts (${s.similarity} match)`)
              .join('\n');
            embed.addFields({
              name: '🔍 Similar Items Found',
              value: similarList,
              inline: false,
            });
          }
        }

        await message.reply({ embeds: [embed] });
        return;
      }

      // Success - display full prediction
      const { suggestedStartingBid, confidence, statistics, trend, reasoning } = prediction;

      const embed = new EmbedBuilder()
        .setColor(confidence >= 70 ? 0x00ff00 : confidence >= 50 ? 0xffff00 : 0xff9900)
        .setTitle(`📊 AI Price Prediction: ${itemName}`)
        .setDescription(`🎯 **Suggested Starting Bid: ${suggestedStartingBid} points**`)
        .addFields(
          {
            name: '📈 Confidence',
            value: `${confidence}%` + (confidence >= 70 ? ' ✅' : confidence >= 50 ? ' ⚠️' : ' 🔴'),
            inline: true,
          },
          {
            name: '📊 Historical Auctions',
            value: `${statistics.historicalAuctions} auctions`,
            inline: true,
          },
          {
            name: '📉 Trend',
            value: `${trend.direction === 'increasing' ? '📈' : trend.direction === 'decreasing' ? '📉' : '➡️'} ${trend.direction.toUpperCase()}\n(${trend.percentage > 0 ? '+' : ''}${trend.percentage}%)`,
            inline: true,
          },
          {
            name: '💰 Price Statistics',
            value:
              `Average: **${statistics.averagePrice}pts**\n` +
              `Median: **${statistics.medianPrice}pts**\n` +
              `Range: ${statistics.priceRange.min}-${statistics.priceRange.max}pts\n` +
              `Std Dev: ±${statistics.standardDeviation}pts`,
            inline: true,
          },
          {
            name: '🎯 95% Confidence Interval',
            value: `${statistics.confidenceInterval.lower}-${statistics.confidenceInterval.upper} points`,
            inline: true,
          },
          {
            name: '🧠 AI Reasoning',
            value: reasoning,
            inline: false,
          }
        )
        .setFooter({ text: `Requested by ${member.user.username} • Powered by ML` })
        .setTimestamp();

      if (statistics.outliers > 0) {
        embed.addFields({
          name: '🔍 Data Quality',
          value: `Removed ${statistics.outliers} outlier(s) for accuracy`,
          inline: false,
        });
      }

      await message.reply({ embeds: [embed] });
      console.log(`🤖 [INTELLIGENCE] Price prediction for ${itemName}: ${suggestedStartingBid}pts (${confidence}% confidence)`);
    } catch (error) {
      console.error('[INTELLIGENCE] Error predicting price:', error);
      await message.reply(`❌ Error analyzing item data: ${error.message}`);
    }
  },

  /**
   * Analyze member engagement and predict attendance likelihood
   * Usage: !engagement <username>
   */
  engagement: async (message, member) => {
    const args = message.content.trim().split(/\s+/).slice(1);

    if (args.length === 0) {
      await message.reply(
        `❌ **Usage:** \`!engagement <username>\`\n\n` +
        `**Example:** \`!engagement PlayerName\`\n\n` +
        `I'll analyze engagement patterns, predict attendance likelihood, and provide personalized recommendations!`
      );
      return;
    }

    const username = args.join(' ');
    await message.reply(`🤖 Analyzing engagement for **${username}**...`);

    try {
      const analysis = await intelligenceEngine.analyzeMemberEngagement(username);

      if (analysis.error) {
        await message.reply(`❌ Error analyzing member: ${analysis.error}`);
        return;
      }

      const { engagementScore, level, emoji, components, prediction, recommendations, profile } = analysis;

      const embed = new EmbedBuilder()
        .setColor(engagementScore >= 80 ? 0x00ff00 : engagementScore >= 60 ? 0xffff00 : engagementScore >= 40 ? 0xff9900 : 0xff0000)
        .setTitle(`${emoji} Engagement Analysis: ${username}`)
        .setDescription(`**Engagement Score: ${engagementScore}/100** (${level})`)
        .addFields(
          {
            name: '📊 Score Breakdown',
            value:
              `Attendance: ${components.attendance.toFixed(0)}/100\n` +
              `Bidding Activity: ${components.bidding.toFixed(0)}/100\n` +
              `Consistency: ${components.consistency.toFixed(0)}/100\n` +
              `Recent Activity: ${components.recentActivity.toFixed(0)}/100`,
            inline: true,
          },
          {
            name: '🎯 Next Event Prediction',
            value:
              `Likelihood: **${prediction.nextAttendanceLikelihood}**\n` +
              `Confidence: ${prediction.confidence}`,
            inline: true,
          },
          {
            name: '📈 Member Profile',
            value:
              `Total Attendance: ${profile.attendance.total}pts\n` +
              `Spawns Attended: ${profile.attendance.spawns}\n` +
              `Avg per Spawn: ${profile.attendance.averagePerSpawn.toFixed(1)}pts`,
            inline: false,
          },
          {
            name: '💰 Bidding Stats',
            value:
              `Points Remaining: ${profile.bidding.pointsRemaining}pts\n` +
              `Points Used: ${profile.bidding.pointsConsumed}pts\n` +
              `Auctions Won: ${profile.bidding.auctionsWon}`,
            inline: false,
          },
          {
            name: '💡 Recommendations',
            value: recommendations.join('\n'),
            inline: false,
          }
        )
        .setFooter({ text: `Requested by ${member.user.username} • Powered by ML` })
        .setTimestamp();

      await message.reply({ embeds: [embed] });
      console.log(`🤖 [INTELLIGENCE] Engagement analysis for ${username}: ${engagementScore}/100`);
    } catch (error) {
      console.error('[INTELLIGENCE] Error analyzing engagement:', error);
      await message.reply(`❌ Error analyzing engagement: ${error.message}`);
    }
  },

  /**
   * Analyze engagement for all members
   * Usage: !analyzeengagement
   */
  analyzeengagement: async (message, member) => {
    await message.reply(`🤖 Analyzing engagement for all members... This may take a moment.`);

    try {
      const analysis = await intelligenceEngine.analyzeAllMembersEngagement();

      if (analysis.error) {
        await message.reply(`❌ Error: ${analysis.error}`);
        return;
      }

      const { total, active, atRisk, topPerformers, needsAttention, averageEngagement } = analysis;

      // Top performers embed
      const topPerformersText = topPerformers
        .map((m, i) => `${i + 1}. **${m.username}** - ${m.engagementScore}/100 ${m.emoji}`)
        .join('\n');

      // At-risk members
      const atRiskText = needsAttention.length > 0
        ? needsAttention
            .map((m) => `• ${m.username} (${m.engagementScore}/100) - ${m.recommendations[0]}`)
            .slice(0, 5)
            .join('\n')
        : 'None';

      const embed = new EmbedBuilder()
        .setColor(0x00aaff)
        .setTitle(`📊 Guild Engagement Analysis`)
        .setDescription(`Average Engagement: **${averageEngagement}/100**`)
        .addFields(
          {
            name: '📈 Overview',
            value:
              `Total Members: **${total}**\n` +
              `Active: **${active}** (${((active/total)*100).toFixed(0)}%)\n` +
              `At Risk: **${atRisk}** (${((atRisk/total)*100).toFixed(0)}%)`,
            inline: false,
          },
          {
            name: '🏆 Top Performers',
            value: topPerformersText,
            inline: false,
          },
          {
            name: '⚠️ Needs Attention',
            value: atRiskText,
            inline: false,
          }
        )
        .setFooter({ text: `Requested by ${member.user.username} • Powered by ML` })
        .setTimestamp();

      await message.reply({ embeds: [embed] });
      console.log(`🤖 [INTELLIGENCE] Guild engagement analysis: ${averageEngagement}/100 avg, ${atRisk}/${total} at risk`);
    } catch (error) {
      console.error('[INTELLIGENCE] Error analyzing all members:', error);
      await message.reply(`❌ Error analyzing members: ${error.message}`);
    }
  },

  /**
   * Detect anomalies and suspicious patterns
   * Usage: !detectanomalies
   */
  detectanomalies: async (message, member) => {
    await message.reply(`🔍 Scanning for anomalies and suspicious patterns...`);

    try {
      const [biddingAnomalies, attendanceAnomalies] = await Promise.all([
        intelligenceEngine.detectBiddingAnomalies(),
        intelligenceEngine.detectAttendanceAnomalies(),
      ]);

      if (biddingAnomalies.error || attendanceAnomalies.error) {
        await message.reply(`❌ Error detecting anomalies`);
        return;
      }

      const totalAnomalies = biddingAnomalies.anomaliesDetected + attendanceAnomalies.anomaliesDetected;

      const embed = new EmbedBuilder()
        .setColor(totalAnomalies > 0 ? 0xff0000 : 0x00ff00)
        .setTitle(`🔍 Anomaly Detection Report`)
        .setDescription(
          totalAnomalies === 0
            ? '✅ **No anomalies detected!** All patterns appear normal.'
            : `⚠️ **${totalAnomalies} anomalies detected** - Review recommended.`
        )
        .addFields({
          name: '💰 Bidding Analysis',
          value:
            `Analyzed: ${biddingAnomalies.analyzed} auctions\n` +
            `Anomalies: ${biddingAnomalies.anomaliesDetected}`,
          inline: true,
        })
        .addFields({
          name: '📊 Attendance Analysis',
          value:
            `Analyzed: ${attendanceAnomalies.analyzed} members\n` +
            `Anomalies: ${attendanceAnomalies.anomaliesDetected}`,
          inline: true,
        })
        .setFooter({ text: `Requested by ${member.user.username} • Powered by ML` })
        .setTimestamp();

      // Add bidding anomalies
      if (biddingAnomalies.anomaliesDetected > 0) {
        const biddingDetails = biddingAnomalies.anomalies
          .slice(0, 5)
          .map((a) => `• **${a.type}** (${a.severity})\n  ${a.recommendation}`)
          .join('\n');

        embed.addFields({
          name: '⚠️ Bidding Anomalies',
          value: biddingDetails,
          inline: false,
        });
      }

      // Add attendance anomalies
      if (attendanceAnomalies.anomaliesDetected > 0) {
        const attendanceDetails = attendanceAnomalies.anomalies
          .slice(0, 5)
          .map((a) => `• **${a.username}** (${a.deviation})\n  ${a.recommendation}`)
          .join('\n');

        embed.addFields({
          name: '⚠️ Attendance Anomalies',
          value: attendanceDetails,
          inline: false,
        });
      }

      await message.reply({ embeds: [embed] });
      console.log(`🤖 [INTELLIGENCE] Anomaly detection: ${totalAnomalies} anomalies found`);
    } catch (error) {
      console.error('[INTELLIGENCE] Error detecting anomalies:', error);
      await message.reply(`❌ Error detecting anomalies: ${error.message}`);
    }
  },

  /**
   * Get smart recommendations for auction timing and member engagement
   * Usage: !recommendations
   */
  recommendations: async (message, member) => {
    await message.reply(`🤖 Generating smart recommendations...`);

    try {
      const [auctionTiming, reminders] = await Promise.all([
        intelligenceEngine.recommendAuctionTiming(),
        intelligenceEngine.generateAttendanceReminders(),
      ]);

      if (auctionTiming.error) {
        await message.reply(`❌ Error generating recommendations: ${auctionTiming.error}`);
        return;
      }

      const embed = new EmbedBuilder()
        .setColor(0x9b59b6)
        .setTitle(`💡 Smart Recommendations`)
        .setDescription(`AI-powered insights for optimal guild management`)
        .addFields({
          name: '⏰ Optimal Auction Timing',
          value:
            `Best Window: **${auctionTiming.optimalWindow}**\n` +
            `Expected Participation: **${auctionTiming.participationForecast}**`,
          inline: false,
        })
        .setFooter({ text: `Requested by ${member.user.username} • Powered by ML` })
        .setTimestamp();

      // Timing recommendations
      const timingDetails = auctionTiming.recommendations
        .map((r) => `• **${r.type}**: ${r.recommendation} (${r.confidence} confidence)`)
        .join('\n');

      embed.addFields({
        name: '📅 Timing Analysis',
        value: timingDetails,
        inline: false,
      });

      // Member reminders
      if (reminders.length > 0) {
        const reminderSummary = reminders
          .slice(0, 5)
          .map((r) => `• **${r.username}** (${r.engagementScore}/100) - ${r.priority} priority`)
          .join('\n');

        embed.addFields({
          name: `📢 Suggested Reminders (${reminders.length} members)`,
          value: reminderSummary,
          inline: false,
        });
      }

      await message.reply({ embeds: [embed] });
      console.log(`🤖 [INTELLIGENCE] Generated recommendations: ${reminders.length} reminders suggested`);
    } catch (error) {
      console.error('[INTELLIGENCE] Error generating recommendations:', error);
      await message.reply(`❌ Error generating recommendations: ${error.message}`);
    }
  },

  /**
   * Display performance metrics and system health
   * Usage: !performance
   */
  performance: async (message, member) => {
    try {
      const [metrics, report] = await Promise.all([
        intelligenceEngine.monitorPerformance(),
        intelligenceEngine.generatePerformanceReport(),
      ]);

      const embed = new EmbedBuilder()
        .setColor(metrics.memoryPercent > 85 ? 0xff0000 : 0x00ff00)
        .setTitle(`⚙️ System Performance Report`)
        .setDescription(`Current system health and optimization status`)
        .addFields(
          {
            name: '💾 Memory Usage',
            value:
              `Used: **${report.memory.used}** / 512MB\n` +
              `Percentage: **${report.memory.percent}**\n` +
              `Status: ${report.memory.status}`,
            inline: true,
          },
          {
            name: '⏱️ Uptime',
            value: report.uptime,
            inline: true,
          },
          {
            name: '🗄️ Intelligence Caches',
            value:
              `Auction History: ${report.caches.auctionHistory}\n` +
              `Attendance History: ${report.caches.attendanceHistory}\n` +
              `Member Profiles: ${report.caches.memberProfiles}`,
            inline: false,
          },
          {
            name: '💡 Recommendations',
            value: report.recommendations.join('\n'),
            inline: false,
          }
        )
        .setFooter({ text: `Requested by ${member.user.username}` })
        .setTimestamp();

      await message.reply({ embeds: [embed] });
      console.log(`🤖 [INTELLIGENCE] Performance report generated - ${report.memory.percent} memory`);
    } catch (error) {
      console.error('[INTELLIGENCE] Error generating performance report:', error);
      await message.reply(`❌ Error generating report: ${error.message}`);
    }
  },

  /**
   * Analyze auction queue and suggest prices for all items
   * Usage: !suggestauction or !analyzequeue
   */
  analyzequeue: async (message, member) => {
    await message.reply(`🤖 Analyzing auction queue... This may take a moment.`);

    try {
      // Get items from queue
      const queueResponse = await sheetAPI.call('getBiddingItems', {});
      const queueItems = queueResponse && queueResponse.items ? queueResponse.items : [];

      if (!queueItems || queueItems.length === 0) {
        await message.reply(`⚠️ No items in auction queue. Use Google Sheets to add items to BiddingItems.`);
        return;
      }

      console.log(`🤖 [INTELLIGENCE] Analyzing ${queueItems.length} items in queue...`);

      // Analyze each item
      const analyses = [];
      for (const item of queueItems.slice(0, 20)) { // Limit to 20 items to avoid timeout
        const itemName = item.item || 'Unknown';
        const currentPrice = parseInt(item.startPrice) || 0;

        const prediction = await intelligenceEngine.predictItemValue(itemName);

        analyses.push({
          itemName,
          currentPrice,
          prediction,
        });
      }

      // Create summary embed
      const embed = new EmbedBuilder()
        .setColor(0x9b59b6)
        .setTitle(`💰 Auction Queue Analysis`)
        .setDescription(
          `AI price suggestions for **${analyses.length}** items in queue\n\n` +
          `**How to use:** Manually adjust prices in Google Sheets > BiddingItems before starting auction`
        )
        .setFooter({ text: `Requested by ${member.user.username} • Powered by ML` })
        .setTimestamp();

      // Add items with suggestions
      const itemsList = analyses.map((item, i) => {
        if (!item.prediction.success) {
          return `${i + 1}. **${item.itemName}**\n   Current: ${item.currentPrice}pts\n   ⚠️ ${item.prediction.reason}`;
        }

        const { suggestedStartingBid, confidence } = item.prediction;
        const diff = suggestedStartingBid - item.currentPrice;
        const diffText = diff > 0 ? `+${diff}` : diff < 0 ? `${diff}` : '±0';
        const emoji = confidence >= 70 ? '✅' : confidence >= 50 ? '⚠️' : '🔴';

        return `${i + 1}. **${item.itemName}** ${emoji}\n   Current: ${item.currentPrice}pts → AI: ${suggestedStartingBid}pts (${diffText})\n   Confidence: ${confidence}%`;
      }).join('\n\n');

      // Split into multiple fields if too long
      if (itemsList.length < 1024) {
        embed.addFields({
          name: '📊 Price Suggestions',
          value: itemsList,
          inline: false,
        });
      } else {
        // Split into chunks
        const chunks = itemsList.match(/[\s\S]{1,1000}(?:\n|$)/g) || [itemsList];
        chunks.forEach((chunk, i) => {
          embed.addFields({
            name: i === 0 ? '📊 Price Suggestions' : `📊 Price Suggestions (cont.)`,
            value: chunk.trim(),
            inline: false,
          });
        });
      }

      // Add summary statistics
      const withPredictions = analyses.filter(a => a.prediction.success);
      const avgConfidence = withPredictions.length > 0
        ? Math.round(withPredictions.reduce((sum, a) => sum + a.prediction.confidence, 0) / withPredictions.length)
        : 0;

      embed.addFields({
        name: '📈 Analysis Summary',
        value:
          `Total Items: ${analyses.length}\n` +
          `With Predictions: ${withPredictions.length}\n` +
          `Avg Confidence: ${avgConfidence}%`,
        inline: false,
      });

      embed.addFields({
        name: '💡 Next Steps',
        value:
          `1. Review AI suggestions above\n` +
          `2. Open Google Sheets > BiddingItems\n` +
          `3. Manually adjust "Starting Bid" column\n` +
          `4. Start auction with \`!startauction\``,
        inline: false,
      });

      await message.reply({ embeds: [embed] });
      console.log(`✅ [INTELLIGENCE] Queue analysis complete: ${analyses.length} items analyzed`);

    } catch (error) {
      console.error('[INTELLIGENCE] Error analyzing queue:', error);
      await message.reply(`❌ Error analyzing queue: ${error.message}`);
    }
  },

  /**
   * Bootstrap learning system from ALL historical data
   * Usage: !bootstraplearning (admin only)
   *
   * This analyzes every auction in ForDistribution and creates completed predictions.
   * The bot starts "smart" instead of learning from scratch!
   */
  bootstraplearning: async (message, member) => {
    if (!isAdmin(message.member)) {
      return message.reply(`${EMOJI.ERROR} Only admins can trigger bootstrap learning.`);
    }

    await message.reply(`🚀 Bootstrapping learning system from ALL historical data... This may take 30-60 seconds.`);

    try {
      console.log(`🚀 [BOOTSTRAP] Manual bootstrap requested by ${member.user.username}`);

      const bootstrapResult = await sheetAPI.call('bootstrapLearning', {});

      if (bootstrapResult.status === 'ok') {
        const { predictionsCreated, uniqueItems, averageAccuracy, predictionsSkipped, totalAuctions } = bootstrapResult;

        const embed = new EmbedBuilder()
          .setColor(0x00ff00)
          .setTitle('✅ Learning System Bootstrapped!')
          .setDescription(
            '**The bot has learned from ALL historical auction data!**\n\n' +
            `Analyzed ${totalAuctions} historical auctions and created ${predictionsCreated} predictions.`
          )
          .addFields(
            {
              name: '📊 Results',
              value:
                `Total Auctions: **${totalAuctions}**\n` +
                `Predictions Created: **${predictionsCreated}**\n` +
                `Skipped (no prior data): **${predictionsSkipped}**\n` +
                `Unique Items: **${uniqueItems}**\n` +
                `Starting Accuracy: **${averageAccuracy}%**`,
              inline: false,
            },
            {
              name: '🎯 What This Means',
              value:
                '✅ Bot learned patterns from your entire history\n' +
                '✅ Price predictions are now accurate immediately\n' +
                '✅ Confidence adjusts based on historical accuracy\n' +
                '✅ Bot will continue learning from new auctions',
              inline: false,
            },
            {
              name: '💡 Try It Out',
              value:
                '`!predictprice <item>` - Get AI price prediction\n' +
                '`!learningmetrics` - View learning statistics\n' +
                '`!suggestauction` - Analyze entire queue',
              inline: false,
            }
          )
          .setFooter({ text: `Bootstrapped by ${member.user.username} • ELYSIUM Learning System` })
          .setTimestamp();

        await message.reply({ embeds: [embed] });
        console.log(`✅ [BOOTSTRAP] Successfully created ${predictionsCreated} predictions (${averageAccuracy}% accuracy)`);
      } else {
        await message.reply(`❌ Bootstrap failed: ${bootstrapResult.message}`);
        console.error(`❌ [BOOTSTRAP] Failed: ${bootstrapResult.message}`);
      }
    } catch (error) {
      console.error('[BOOTSTRAP] Error during bootstrap:', error);
      await message.reply(`❌ Error during bootstrap: ${error.message}`);
    }
  },

  /**
   * Predict member attendance likelihood for next event
   * Usage: !predictattendance <username>
   */
  predictattendance: async (message, member) => {
    const args = message.content.trim().split(/\s+/).slice(1);

    if (args.length === 0) {
      await message.reply(
        `❌ **Usage:** \`!predictattendance <username>\`\n\n` +
        `**Example:** \`!predictattendance JohnDoe\`\n\n` +
        `I'll analyze historical data to predict attendance likelihood!`
      );
      return;
    }

    const username = args.join(' ');
    await message.reply(`🤖 Analyzing attendance patterns for **${username}**...`);

    try {
      const profile = await intelligenceEngine.getMemberProfile(username);

      if (!profile || profile.attendance.spawns === 0) {
        await message.reply(`❌ No attendance data found for **${username}**.`);
        return;
      }

      const prediction = await intelligenceEngine.predictAttendanceLikelihood(profile, true);

      const likelihoodPercent = Math.round(prediction.likelihood * 100);
      const confidence = prediction.confidence;

      const embed = new EmbedBuilder()
        .setColor(likelihoodPercent >= 70 ? 0x00ff00 : likelihoodPercent >= 40 ? 0xffff00 : 0xff0000)
        .setTitle(`📊 Attendance Prediction: ${username}`)
        .setDescription(`🎯 **Likelihood of Attendance: ${likelihoodPercent}%**`)
        .addFields(
          {
            name: '📈 Confidence',
            value: `${confidence.toFixed(1)}%` + (confidence >= 70 ? ' ✅' : confidence >= 50 ? ' ⚠️' : ' 🔴'),
            inline: true,
          },
          {
            name: '📊 Historical Data',
            value: `${profile.attendance.spawns} spawns attended`,
            inline: true,
          },
          {
            name: '🎯 Prediction',
            value: likelihoodPercent >= 70 ? '✅ Highly Likely' : likelihoodPercent >= 40 ? '⚠️ Moderate' : '🔴 Unlikely',
            inline: true,
          },
          {
            name: '📈 Attendance Stats',
            value:
              `Total Points: **${profile.attendance.total}pts**\n` +
              `Spawns Attended: **${profile.attendance.spawns}**\n` +
              `Avg Points/Spawn: **${profile.attendance.averagePerSpawn.toFixed(1)}pts**`,
            inline: true,
          },
          {
            name: '💰 Bidding Stats',
            value:
              `Points Remaining: **${profile.bidding.pointsRemaining}pts**\n` +
              `Points Spent: **${profile.bidding.pointsConsumed}pts**\n` +
              `Auctions Won: **${profile.bidding.auctionsWon}**`,
            inline: true,
          },
          {
            name: '🧠 AI Insight',
            value:
              `The bot predicts a **${likelihoodPercent}% chance** that ${username} will attend the next boss spawn ` +
              `based on their historical attendance patterns and recent activity.`,
            inline: false,
          }
        )
        .setFooter({ text: `Requested by ${member.user.username} • Powered by ML` })
        .setTimestamp();

      await message.reply({ embeds: [embed] });
      console.log(`🤖 [INTELLIGENCE] Attendance prediction for ${username}: ${likelihoodPercent}% (${confidence.toFixed(1)}% confidence)`);
    } catch (error) {
      console.error('[INTELLIGENCE] Error predicting attendance:', error);
      await message.reply(`❌ Error analyzing attendance data: ${error.message}`);
    }
  },

  /**
   * Predict next boss spawn time based on historical patterns
   * Usage: !predictspawn [boss name]
   */
  predictspawn: async (message, member) => {
    const args = message.content.trim().split(/\s+/).slice(1);
    const bossName = args.length > 0 ? args.join(' ') : null;

    await message.reply(
      bossName
        ? `🤖 Analyzing spawn patterns for **${bossName}**...`
        : `🤖 Analyzing general boss spawn patterns...`
    );

    try {
      const prediction = await intelligenceEngine.predictNextSpawnTime(bossName);

      if (prediction.error) {
        await message.reply(`⚠️ ${prediction.error}`);
        return;
      }

      const confidence = prediction.confidence;
      const now = new Date();
      const timeUntilSpawn = prediction.predictedTime - now;
      const hoursUntil = timeUntilSpawn / (1000 * 60 * 60);
      const daysUntil = Math.floor(hoursUntil / 24);
      const remainingHours = Math.floor(hoursUntil % 24);

      const embed = new EmbedBuilder()
        .setColor(confidence >= 70 ? 0x00ff00 : confidence >= 50 ? 0xffff00 : 0xff9900)
        .setTitle(`🔮 Boss Spawn Prediction${bossName ? `: ${bossName}` : ''}`)
        .setDescription(
          `🎯 **Predicted Next Spawn:** <t:${Math.floor(prediction.predictedTime.getTime() / 1000)}:F>\n` +
          `⏰ **Time Until Spawn:** ${daysUntil > 0 ? `${daysUntil}d ` : ''}${remainingHours}h`
        )
        .addFields(
          {
            name: '📈 Confidence',
            value: `${confidence.toFixed(1)}%` + (confidence >= 70 ? ' ✅' : confidence >= 50 ? ' ⚠️' : ' 🔴'),
            inline: true,
          },
          {
            name: '📊 Based On',
            value: `${prediction.basedOnSpawns} historical spawns`,
            inline: true,
          },
          {
            name: '⏱️ Avg Interval',
            value: `${prediction.avgIntervalHours.toFixed(1)} hours`,
            inline: true,
          },
          {
            name: '🕐 Earliest Possible',
            value: `<t:${Math.floor(prediction.earliestTime.getTime() / 1000)}:F>`,
            inline: true,
          },
          {
            name: '🕐 Latest Possible',
            value: `<t:${Math.floor(prediction.latestTime.getTime() / 1000)}:F>`,
            inline: true,
          },
          {
            name: '🕐 Last Spawn',
            value: `<t:${Math.floor(prediction.lastSpawnTime.getTime() / 1000)}:R>`,
            inline: true,
          },
          {
            name: '🧠 AI Insight',
            value:
              `Based on ${prediction.basedOnSpawns} historical spawns, the bot predicts the next ` +
              `${prediction.bossName} will spawn in approximately **${daysUntil > 0 ? `${daysUntil} days and ` : ''}${remainingHours} hours**.`,
            inline: false,
          }
        )
        .setFooter({ text: `Requested by ${member.user.username} • Powered by ML` })
        .setTimestamp();

      await message.reply({ embeds: [embed] });
      console.log(
        `🤖 [INTELLIGENCE] Spawn prediction for ${bossName || 'any boss'}: ` +
        `${prediction.predictedTime.toISOString()} (${confidence.toFixed(1)}% confidence)`
      );
    } catch (error) {
      console.error('[INTELLIGENCE] Error predicting spawn:', error);
      await message.reply(`❌ Error analyzing spawn data: ${error.message}`);
    }
  },
};

/**
 * =========================================================================
 * CLIENT READY EVENT HANDLER
 * =========================================================================
 *
 * Triggered once when the bot successfully connects to Discord.
 * Performs critical initialization sequence:
 *
 * 1. Configuration:
 *    - Attaches config to client for module access
 *    - Logs bot identity and version information
 *
 * 2. Module Initialization:
 *    - Auction cache (ensures 100% uptime for point data)
 *    - Attendance module (spawn tracking, verification system)
 *    - Bidding module (point management, queue system)
 *    - Auctioneering module (live auction state management)
 *    - Leaderboard module (statistics and rankings)
 *    - Emergency commands (backup and override tools)
 *
 * 3. Recovery Operations:
 *    - Checks for crashed auction state
 *    - Recovers unfinished items
 *    - Restores point locks
 *
 * 4. Scheduled Tasks:
 *    - Starts bidding channel cleanup (every 12 hours)
 *    - Initializes garbage collection monitoring (every 10 minutes)
 *
 * Order is critical - modules depend on each other and must
 * initialize in sequence to ensure proper dependency resolution.
 *
 * @event ClientReady
 */
client.once(Events.ClientReady, async () => {
  console.log(`✅ Bot logged in as ${client.user.tag}`);
  console.log(`📊 Tracking ${Object.keys(bossPoints).length} bosses`);
  console.log(`🟢 Main Guild: ${config.main_guild_id}`);
  console.log(`⏰ Timer Server: ${config.timer_server_id}`);
  console.log(`🤖 Version: ${BOT_VERSION}`);

  // Attach config to client for module access
  client.config = config;

  // INITIALIZE DISCORD CHANNEL CACHE (60-80% API call reduction)
  discordCache = new DiscordCache(client, config);
  console.log('✅ Discord channel cache initialized');

  // INITIALIZE AUCTION CACHE (100% uptime guarantee)
  const auctionCache = require('./utils/auction-cache');
  await auctionCache.init();

  // INITIALIZE INTELLIGENCE ENGINE FIRST (needed by other modules)
  intelligenceEngine = new IntelligenceEngine(client, config, sheetAPI);
  console.log('🤖 Intelligence Engine initialized (AI/ML powered features enabled)');

  // 🚀 AUTO-BOOTSTRAP LEARNING FROM HISTORY (First Deployment)
  console.log('🔍 Checking if learning system needs bootstrap...');
  try {
    const needsCheck = await sheetAPI.call('needsBootstrap', {});
    if (needsCheck.status === 'ok' && needsCheck.needsBootstrap) {
      console.log('🚀 [FIRST DEPLOYMENT] Bootstrapping learning from historical data...');
      console.log('   This will analyze ALL auction history and create predictions.');
      console.log('   The bot will start SMART instead of learning from scratch!');

      const bootstrapResult = await sheetAPI.call('bootstrapLearning', {});

      if (bootstrapResult.status === 'ok') {
        const { predictionsCreated, uniqueItems, averageAccuracy } = bootstrapResult;
        console.log(`✅ [BOOTSTRAP SUCCESS]`);
        console.log(`   📊 Predictions Created: ${predictionsCreated}`);
        console.log(`   🎯 Unique Items Learned: ${uniqueItems}`);
        console.log(`   🎓 Starting Accuracy: ${averageAccuracy}%`);
        console.log(`   🧠 Bot is now SMART and ready to make accurate predictions!`);

        // Send notification to admin logs
        const adminLogsChannel = await discordCache.getChannel('admin_logs_channel_id');
        if (adminLogsChannel) {
          const embed = new EmbedBuilder()
            .setColor(0x00ff00)
            .setTitle('🚀 Learning System Bootstrapped!')
            .setDescription(
              '**The bot has learned from ALL historical auction data!**\n\n' +
              `The learning system analyzed your entire auction history and created ` +
              `${predictionsCreated} completed predictions across ${uniqueItems} unique items.`
            )
            .addFields(
              {
                name: '📊 Bootstrap Results',
                value:
                  `Predictions Created: **${predictionsCreated}**\n` +
                  `Unique Items: **${uniqueItems}**\n` +
                  `Starting Accuracy: **${averageAccuracy}%**`,
                inline: false,
              },
              {
                name: '🎯 What This Means',
                value:
                  '✅ Bot starts SMART (not from zero)\n' +
                  '✅ Accurate price predictions immediately\n' +
                  '✅ Learned patterns from your history\n' +
                  '✅ Confidence adapts over time',
                inline: false,
              },
              {
                name: '💡 Next Steps',
                value:
                  'Use `!predictprice <item>` to see predictions!\n' +
                  'Use `!learningmetrics` to view learning stats.\n' +
                  'Bot will continue learning from new auctions automatically.',
                inline: false,
              }
            )
            .setFooter({ text: 'First Deployment • Learning System Active' })
            .setTimestamp();

          await adminLogsChannel.send({ embeds: [embed] });
        }
      } else {
        console.log(`⚠️ [BOOTSTRAP FAILED] ${bootstrapResult.message}`);
      }
    } else {
      console.log('✅ Learning system already bootstrapped (skipping)');
    }
  } catch (bootstrapError) {
    console.error('❌ Error during bootstrap check:', bootstrapError);
    console.log('   Bot will continue without bootstrap (learning from future auctions)');
  }

  // INITIALIZE ALL MODULES IN CORRECT ORDER
  attendance.initialize(config, bossPoints, isAdmin, discordCache, intelligenceEngine); // Pass intelligenceEngine for learning system
  helpSystem.initialize(config, isAdmin, BOT_VERSION);
  auctioneering.initialize(config, isAdmin, bidding, discordCache, intelligenceEngine); // Pass intelligenceEngine
  bidding.initializeBidding(config, isAdmin, auctioneering, discordCache);
  auctioneering.setPostToSheet(attendance.postToSheet); // Use attendance module's postToSheet
  lootSystem.initialize(config, bossPoints, isAdmin);
  emergencyCommands.initialize(
    config,
    attendance,
    bidding,
    auctioneering,
    isAdmin,
    discordCache
  );
  leaderboardSystem.init(client, config, discordCache); // Initialize leaderboard system

  // INITIALIZE PROACTIVE INTELLIGENCE (Auto-notifications & monitoring)
  proactiveIntelligence = new ProactiveIntelligence(client, config, intelligenceEngine);
  await proactiveIntelligence.initialize();
  console.log('🔔 Proactive Intelligence initialized (5 scheduled monitoring tasks active)');

  // INITIALIZE NLP HANDLER (Natural language processing)
  nlpHandler = new NLPHandler(config);
  console.log('💬 NLP Handler initialized (admin logs + auction threads)');

  console.log("\n╔═══════════════════════════════════════════════════════╗");
  console.log("║         🔄 BOT STATE RECOVERY (3-SWEEP SYSTEM)   ║");
  console.log("╚═══════════════════════════════════════════════════════╝\n");

  isRecovering = true;

  // Recover bidding state first
  await recoverBotStateOnStartup(client, config);

  // ═══════════════════════════════════════════════════════
  // SWEEP 1: Enhanced Thread Recovery (PRIORITY)
  // ═══════════════════════════════════════════════════════
  const sweep1 = await attendance.recoverStateFromThreads(client);

  // ═══════════════════════════════════════════════════════
  // SWEEP 2: Google Sheets Fallback (Fill Gaps)
  // ═══════════════════════════════════════════════════════
  console.log("\n═══════════════════════════════════════════════════════");
  console.log("💾 SWEEP 2: GOOGLE SHEETS STATE RECOVERY");
  console.log("═══════════════════════════════════════════════════════");

  let sweep2LoadedState = false;
  if (!sweep1.success || sweep1.recovered === 0) {
    console.log("⚠️ Sweep 1 found no threads, attempting Sheets recovery...");
    sweep2LoadedState = await attendance.loadAttendanceStateFromSheet();

    if (sweep2LoadedState) {
      console.log("✅ SWEEP 2: State loaded from Google Sheets");
    } else {
      console.log("⚠️ SWEEP 2: No saved state found in Sheets");
    }
  } else {
    console.log("✅ SWEEP 2: Skipped (Sweep 1 found active threads)");
  }

  // ═══════════════════════════════════════════════════════
  // SWEEP 3: Cross-Reference Validation
  // ═══════════════════════════════════════════════════════
  const sweep3 = await attendance.validateStateConsistency(client);

  isRecovering = false;

  // ═══════════════════════════════════════════════════════
  // RECOVERY SUMMARY (CONSOLE ONLY - Discord logging disabled to prevent spam)
  // ═══════════════════════════════════════════════════════
  // Recovery summary is now only logged to console to prevent Discord spam
  // If you need to re-enable Discord notifications, uncomment the code below

  /* DISABLED: Recovery summary Discord notification
  const adminLogs = await discordCache.getChannel('admin_logs_channel_id').catch(() => null);

  if (adminLogs) {
    const embed = new EmbedBuilder()
      .setColor(sweep1.success ? 0x00ff00 : 0xffa500)
      .setTitle("🔄 Bot State Recovery Complete")
      .setDescription("3-Sweep recovery system executed")
      .addFields(
        {
          name: "📋 Sweep 1: Thread Recovery",
          value: sweep1.success
            ? `✅ **Success**\n` +
              `├─ Spawns: ${sweep1.recovered}\n` +
              `├─ Pending verifications: ${sweep1.pending}\n` +
              `├─ Pending closures: ${sweep1.confirmations}\n` +
              `└─ Reactions re-added: ${sweep1.reactionsAdded || 0}`
            : `❌ **Failed:** ${sweep1.error || "Unknown error"}`,
          inline: false,
        },
        {
          name: "💾 Sweep 2: Sheets Recovery",
          value: sweep2LoadedState
            ? "✅ Loaded from Google Sheets"
            : sweep1.success
            ? "⏭️ Skipped (threads found)"
            : "⚠️ No saved state",
          inline: false,
        },
        {
          name: "🔍 Sweep 3: Validation",
          value: sweep3
            ? `${
                sweep3.threadsWithoutColumns.length +
                  sweep3.columnsWithoutThreads.length +
                  sweep3.duplicateColumns.length ===
                0
                  ? "✅"
                  : "⚠️"
              } **Discrepancies Found:**\n` +
              `├─ Threads without columns: ${sweep3.threadsWithoutColumns.length}\n` +
              `├─ Columns without threads: ${sweep3.columnsWithoutThreads.length}\n` +
              `└─ Duplicate columns: ${sweep3.duplicateColumns.length}`
            : "❌ Validation failed",
          inline: false,
        }
      )
      .setFooter({ text: "Bot is now ready for operations" })
      .setTimestamp();

    // Add discrepancy details if found
    if (sweep3) {
      if (sweep3.threadsWithoutColumns.length > 0) {
        const list = sweep3.threadsWithoutColumns
          .slice(0, 5)
          .map(
            (t) =>
              `• **${t.boss}** (${t.timestamp}) - ${t.members} members - <#${t.threadId}>`
          )
          .join("\n");
        embed.addFields({
          name: "⚠️ Threads Without Columns",
          value:
            list +
            (sweep3.threadsWithoutColumns.length > 5
              ? `\n*+${sweep3.threadsWithoutColumns.length - 5} more...*`
              : ""),
          inline: false,
        });
      }

      if (sweep3.columnsWithoutThreads.length > 0) {
        const list = sweep3.columnsWithoutThreads
          .slice(0, 5)
          .map((c) => `• **${c.boss}** (${c.timestamp}) - Column ${c.column}`)
          .join("\n");
        embed.addFields({
          name: "⚠️ Columns Without Threads",
          value:
            list +
            (sweep3.columnsWithoutThreads.length > 5
              ? `\n*+${sweep3.columnsWithoutThreads.length - 5} more...*`
              : "") +
            "\n\n*These may be closed threads. Manually verify if needed.*",
          inline: false,
        });
      }

      if (sweep3.duplicateColumns.length > 0) {
        const list = sweep3.duplicateColumns
          .slice(0, 3)
          .map(
            (d) =>
              `• **${d.boss}** (${d.timestamp}) - Columns: ${d.columns.join(
                ", "
              )}`
          )
          .join("\n");
        embed.addFields({
          name: "⚠️ Duplicate Columns Detected",
          value:
            list +
            (sweep3.duplicateColumns.length > 3
              ? `\n*+${sweep3.duplicateColumns.length - 3} more...*`
              : "") +
            "\n\n*Manually delete duplicate columns from Google Sheets.*",
          inline: false,
        });
      }
    }

    await adminLogs.send({ embeds: [embed] });
  }
  */

  console.log("\n╔═══════════════════════════════════════════════════════╗");
  console.log("║              ✅ RECOVERY COMPLETE                ║");
  console.log("╚═══════════════════════════════════════════════════════╝\n");

  // If thread recovery didn't find much, try Google Sheets
  if (
    !sweep1.success ||
    Object.keys(attendance.getActiveSpawns()).length === 0
  ) {
    console.log("📊 Attempting to load attendance state from Google Sheets...");
    await attendance.loadAttendanceStateFromSheet();
  }

  await bidding.recoverBiddingState(client, config);

  // Start periodic state syncing to Google Sheets (memory optimization for Koyeb)
  console.log("🔄 Starting periodic state sync to Google Sheets...");
  attendance.schedulePeriodicStateSync();

  // START AUTO-CLOSE SCHEDULER (20-minute thread timeout to prevent cheating)
  console.log("⏰ Starting auto-close scheduler (20-minute attendance window)...");
  attendance.startAutoCloseScheduler(client);

  // Sync state references
  activeSpawns = attendance.getActiveSpawns();
  activeColumns = attendance.getActiveColumns();
  pendingVerifications = attendance.getPendingVerifications();
  pendingClosures = attendance.getPendingClosures();
  confirmationMessages = attendance.getConfirmationMessages();

  // START BIDDING CHANNEL CLEANUP SCHEDULE
  startBiddingChannelCleanupSchedule();

  // START WEEKLY REPORT SCHEDULER (3am Monday GMT+8)
  console.log("📅 Starting weekly report scheduler...");
  leaderboardSystem.scheduleWeeklyReport();

  // START WEEKLY SATURDAY AUCTION SCHEDULER (12:00 PM GMT+8)
  console.log("🔨 Starting weekly Saturday auction scheduler...");
  auctioneering.scheduleWeeklySaturdayAuction(client, config);

  // START PERIODIC GARBAGE COLLECTION (Memory Optimization)
  if (global.gc) {
    console.log("🧹 Starting periodic garbage collection (every 10 minutes)");
    setInterval(() => {
      global.gc();
      const memUsage = process.memoryUsage();
      console.log(
        `🧹 GC: Heap used: ${Math.round(
          memUsage.heapUsed / 1024 / 1024
        )}MB / ${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`
      );
    }, 10 * 60 * 1000); // Every 10 minutes
  }
});

// =====================================================================
// SECTION 9: EVENT HANDLERS
// =====================================================================

/**
 * =========================================================================
 * MESSAGE CREATE EVENT HANDLER
 * =========================================================================
 *
 * Main message processing pipeline. Handles:
 *
 * 1. Bidding Channel Protection:
 *    - Deletes non-admin messages (except valid member commands)
 *    - Preserves bot and admin messages
 *    - Keeps channel clean for auction announcements
 *
 * 2. Command Routing:
 *    - Resolves aliases (!b -> !bid, !st -> !status)
 *    - Checks permissions (admin vs member commands)
 *    - Routes to appropriate handler in commandHandlers
 *    - Delegates to specialized modules (attendance, bidding, auctioneering)
 *
 * 3. Spawn Thread Management:
 *    - Handles member check-ins in attendance threads
 *    - Processes admin verification commands (!verify, !verifyall)
 *    - Manages thread closure (close, !forceclose)
 *
 * 4. Auction Thread Handling:
 *    - Processes !bid commands in auction threads
 *    - Validates bid amounts and user points
 *    - Creates confirmation dialogs
 *
 * Flow:
 * Message -> Channel Check -> Permission Check -> Command Routing -> Handler Execution
 *
 * @event MessageCreate
 * @param {Message} message - The Discord message object
 */
client.on(Events.MessageCreate, async (message) => {
  try {
    // 🧹 BIDDING CHANNEL PROTECTION: Delete non-admin messages immediately
    // EXCEPT for member commands (!mypoints, !bidstatus, etc.)
    if (
      message.guild &&
      message.channel.id === config.bidding_channel_id &&
      !message.author.bot
    ) {
      const member = await message.guild.members
        .fetch(message.author.id)
        .catch(() => null);

      // If not an admin, check if it's a valid member command
      if (member && !isAdmin(member)) {
        const content = message.content.trim().toLowerCase();
        const memberCommands = [
          '!mypoints', '!mp', '!pts', '!mypts',
          '!bidstatus', '!bs', '!bstatus'
        ];

        // Allow member commands through, delete everything else
        const isMemberCommand = memberCommands.some(cmd => content.startsWith(cmd));

        if (!isMemberCommand) {
          try {
            await errorHandler.safeDelete(message, 'message deletion');
            console.log(
              `🧹 Deleted non-admin message from ${message.author.username} in bidding channel`
            );
          } catch (e) {
            console.warn(
              `⚠️ Could not delete message from ${message.author.username}: ${e.message}`
            );
          }
          return; // Stop processing
        }
        // If it IS a member command, continue processing below
      }
    }
    // Debug for !bid detection
    if (
      message.content.startsWith("!bid") ||
      message.content.startsWith("!b")
    ) {
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("🔔 BID COMMAND DETECTED");
      console.log(
        `👤 Author: ${message.author.username} (${message.author.id})`
      );
      console.log(`📝 Content: ${message.content}`);
      console.log(
        `📍 Channel: ${message.channel.name} (${message.channel.id})`
      );
      console.log(`🤖 Is Bot: ${message.author.bot}`);
      console.log(`🏰 Guild: ${message.guild?.name}`);
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    }
    //Timer server spawn detection
    if (message.guild && message.guild.id === config.timer_server_id) {
      if (
        config.timer_channel_id &&
        message.channel.id === config.timer_channel_id
      ) {
        if (/will spawn in.*minutes?!/i.test(message.content)) {
          let detectedBoss = null;
          let timestamp = null;

          const timestampMatch = message.content.match(
            /\((\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})\)/
          );
          if (timestampMatch) timestamp = timestampMatch[1];

          const matchBold = message.content.match(
            /[⚠️🔔⏰]*\s*\*\*(.*?)\*\*\s*will spawn/i
          );
          if (matchBold) {
            detectedBoss = matchBold[1].trim();
          } else {
            const matchEmoji = message.content.match(
              /[⚠️🔔⏰]+\s*([A-Za-z\s]+?)\s*will spawn/i
            );
            if (matchEmoji) {
              detectedBoss = matchEmoji[1].trim();
            } else {
              const matchPlain = message.content.match(
                /^([A-Za-z\s]+?)\s*will spawn/i
              );
              if (matchPlain) detectedBoss = matchPlain[1].trim();
            }
          }

          if (!detectedBoss) {
            console.log(
              `⚠️ Could not extract boss name from: ${message.content}`
            );
            return;
          }

          const bossName = attendance.findBossMatch(detectedBoss);
          if (!bossName) {
            console.log(`⚠️ Unknown boss: ${detectedBoss}`);
            return;
          }

          console.log(
            `🎯 Boss spawn detected: ${bossName} (from ${message.author.username})`
          );

          let dateStr, timeStr, fullTimestamp;

          if (timestamp) {
            const [datePart, timePart] = timestamp.split(" ");
            const [year, month, day] = datePart.split("-");
            dateStr = `${month}/${day}/${year.substring(2)}`;
            timeStr = timePart;
            fullTimestamp = `${dateStr} ${timeStr}`;
            console.log(`⏰ Using timestamp from timer: ${fullTimestamp}`);
          } else {
            const ts = attendance.getCurrentTimestamp();
            dateStr = ts.date;
            timeStr = ts.time;
            fullTimestamp = ts.full;
            console.log(`⏰ Using current timestamp: ${fullTimestamp}`);
          }

          await attendance.createSpawnThreads(
            client,
            bossName,
            dateStr,
            timeStr,
            fullTimestamp,
            "timer"
          );
        }
        return;
      }
    }

    if (message.author.bot) return;

    const guild = message.guild;
    if (!guild) return;

    const member = await guild.members
      .fetch(message.author.id)
      .catch(() => null);
    if (!member) return;

    const userIsAdmin = isAdmin(member);
    const inAdminLogs =
      message.channel.id === config.admin_logs_channel_id ||
      (message.channel.isThread() &&
        message.channel.parentId === config.admin_logs_channel_id);
    const inBiddingChannel =
      message.channel.id === config.bidding_channel_id ||
      (message.channel.isThread() &&
        message.channel.parentId === config.bidding_channel_id);
    const inElysiumCommandsChannel =
      message.channel.id === config.elysium_commands_channel_id ||
      (message.channel.isThread() &&
        message.channel.parentId === config.elysium_commands_channel_id);

    // ═════════════════════════════════════════════════════════════════════
    // NLP PROCESSING (Natural Language → Commands)
    // ═════════════════════════════════════════════════════════════════════
    // Intercepts natural language and converts to command format
    // Only works in admin logs and auction threads (NOT guild chat)
    // Does NOT interfere with existing ! commands

    let nlpInterpretation = null;
    if (nlpHandler && !message.content.trim().startsWith('!')) {
      nlpInterpretation = nlpHandler.interpretMessage(message);

      if (nlpInterpretation) {
        console.log(`💬 [NLP] Interpreted: "${message.content}" → ${nlpInterpretation.command}`);

        // Convert natural language to command format
        // This allows the rest of the system to process it normally
        const params = nlpInterpretation.params.join(' ');
        message.content = `${nlpInterpretation.command}${params ? ' ' + params : ''}`;

        // Optional: Send brief feedback for non-bid commands
        const contextMessage = nlpHandler.getContextMessage(nlpInterpretation.command, message);
        if (contextMessage) {
          await message.reply(contextMessage).catch(() => {});
        }
      }
    }

    // ✅ HANDLE !BID AND ALIASES IMMEDIATELY
    const rawCmd = message.content.trim().toLowerCase().split(/\s+/)[0];
    const resolvedCmd = resolveCommandAlias(rawCmd);

    if (resolvedCmd === "!bid") {
      // RACE CONDITION PROTECTION
      if (isBidProcessing) {
        console.log(`⚠️ Bid already processing, queueing this one...`);
        await message.reply(
          `⏳ Processing previous bid, please wait 1 second...`
        );
        return;
      }

      console.log(`🔍 !bid or alias detected - Checking channel validity...`);
      console.log(`   Raw command: ${rawCmd} -> Resolved: ${resolvedCmd}`);
      console.log(
        `   Channel: ${message.channel.name} (${message.channel.id})`
      );
      console.log(`   Is Thread: ${message.channel.isThread()}`);
      console.log(`   Parent ID: ${message.channel.parentId}`);
      console.log(`   Expected Parent: ${config.bidding_channel_id}`);
      console.log(`   inBiddingChannel: ${inBiddingChannel}`);

      // Bid commands must be in threads only, not main bidding channel
      if (
        !message.channel.isThread() ||
        message.channel.parentId !== config.bidding_channel_id
      ) {
        console.log(`❌ !bid blocked - not in auction thread`);
        await message.reply(
          `❌ You can only use \`${rawCmd}\` in auction threads (inside <#${config.bidding_channel_id}>)!`
        );
        return;
      }

      const args = message.content.trim().split(/\s+/).slice(1);

      console.log(
        `🎯 Bid command detected in ${
          message.channel.isThread() ? "thread" : "channel"
        }: ${message.channel.name}`
      );

      isBidProcessing = true;
      try {
        await bidding.handleCommand(resolvedCmd, message, args, client, config);
      } finally {
        isBidProcessing = false;
      }
      return;
    }

    // ✅ HANDLE !MYPOINTS AND ALIASES - BIDDING CHANNEL OR ELYSIUM COMMANDS CHANNEL (NOT DURING AUCTION)
    if (
      resolvedCmd === "!mypoints" &&
      (inBiddingChannel || inElysiumCommandsChannel) &&
      !message.channel.isThread()
    ) {
      const args = message.content.trim().split(/\s+/).slice(1);
      console.log(`🎯 My points command (${rawCmd}): ${resolvedCmd}`);
      await commandHandlers.mypoints(message, member);
      return;
    }

    // ✅ HANDLE !BIDSTATUS AND ALIASES
    if (resolvedCmd === "!bidstatus" && inBiddingChannel) {
      const args = message.content.trim().split(/\s+/).slice(1);
      console.log(`🎯 Bidding status command (${rawCmd}): ${resolvedCmd}`);
      await commandHandlers.bidstatus(message, member);
      return;
    }

    // ✅ HANDLE AUCTION THREAD-ONLY COMMANDS (!pause, !resume, !stop, !extend)
    // These commands must be used in auction threads (bidding channel threads) only
    if (
      ["!pause", "!resume", "!stop", "!extend"].includes(resolvedCmd) &&
      message.channel.isThread() &&
      message.channel.parentId === config.bidding_channel_id
    ) {
      if (!userIsAdmin) {
        await message.reply(`❌ Admin only`);
        return;
      }

      const args = message.content.trim().split(/\s+/).slice(1);
      const handlerName = resolvedCmd.slice(1); // Remove the "!"
      console.log(`🎯 Thread auction command (${rawCmd}): ${resolvedCmd}`);

      if (commandHandlers[handlerName]) {
        await commandHandlers[handlerName](message, member, args);
      }
      return;
    }

    // Block !pause, !resume, !stop, !extend if not in auction thread
    if (["!pause", "!resume", "!stop", "!extend"].includes(resolvedCmd)) {
      await message.reply(
        `❌ This command can only be used in auction threads (in <#${config.bidding_channel_id}>)`
      );
      return;
    }

    // Help command (anywhere except spawn threads)
    if (resolvedCmd === "!help") {
      if (
        message.channel.isThread() &&
        message.channel.parentId === config.attendance_channel_id
      ) {
        await message.reply(
          "⚠️ Please use `!help` in admin logs channel to avoid cluttering spawn threads."
        );
        return;
      }
      await commandHandlers.help(message, member);
      return;
    }

    // Leaderboard commands (admin only OR ELYSIUM role in ELYSIUM commands channel, anywhere except spawn threads)
    if (
      resolvedCmd === "!leaderboardattendance" ||
      resolvedCmd === "!leaderboardbidding" ||
      resolvedCmd === "!leaderboards" ||
      resolvedCmd === "!weeklyreport"
    ) {
      // Check permissions: either admin OR ELYSIUM role in ELYSIUM commands channel
      const hasPermission = userIsAdmin || (hasElysiumRole(member) && inElysiumCommandsChannel);

      if (!hasPermission) {
        await message.reply("❌ Only admins or ELYSIUM members (in guild chat) can use leaderboard commands.");
        return;
      }

      if (
        message.channel.isThread() &&
        message.channel.parentId === config.attendance_channel_id
      ) {
        await message.reply(
          "⚠️ Please use leaderboard commands in admin logs channel to avoid cluttering spawn threads."
        );
        return;
      }

      if (resolvedCmd === "!leaderboardattendance") {
        await commandHandlers.leaderboardattendance(message, member);
      } else if (resolvedCmd === "!leaderboardbidding") {
        await commandHandlers.leaderboardbidding(message, member);
      } else if (resolvedCmd === "!leaderboards") {
        await commandHandlers.leaderboards(message, member);
      } else if (resolvedCmd === "!weeklyreport") {
        await commandHandlers.weeklyreport(message, member);
      }
      return;
    }

    // =========================================================================
    // INTELLIGENCE ENGINE COMMANDS (Admin only)
    // =========================================================================
    if (
      resolvedCmd === "!predictprice" ||
      resolvedCmd === "!engagement" ||
      resolvedCmd === "!analyzeengagement" ||
      resolvedCmd === "!detectanomalies" ||
      resolvedCmd === "!recommendations" ||
      resolvedCmd === "!performance" ||
      resolvedCmd === "!analyzequeue" ||
      resolvedCmd === "!bootstraplearning" ||
      resolvedCmd === "!predictattendance" ||
      resolvedCmd === "!predictspawn"
    ) {
      if (!userIsAdmin) {
        await message.reply("❌ Intelligence commands are admin-only.");
        return;
      }

      if (
        message.channel.isThread() &&
        message.channel.parentId === config.attendance_channel_id
      ) {
        await message.reply(
          "⚠️ Please use intelligence commands in admin logs channel to avoid cluttering spawn threads."
        );
        return;
      }

      // Route to appropriate command handler
      const handlerName = resolvedCmd.substring(1); // Remove ! prefix

      if (resolvedCmd === "!predictprice") {
        await commandHandlers.predictprice(message, member);
      } else if (resolvedCmd === "!engagement") {
        await commandHandlers.engagement(message, member);
      } else if (resolvedCmd === "!analyzeengagement") {
        await commandHandlers.analyzeengagement(message, member);
      } else if (resolvedCmd === "!detectanomalies") {
        await commandHandlers.detectanomalies(message, member);
      } else if (resolvedCmd === "!recommendations") {
        await commandHandlers.recommendations(message, member);
      } else if (resolvedCmd === "!performance") {
        await commandHandlers.performance(message, member);
      } else if (resolvedCmd === "!analyzequeue") {
        await commandHandlers.analyzequeue(message, member);
      } else if (resolvedCmd === "!bootstraplearning") {
        await commandHandlers.bootstraplearning(message, member);
      } else if (resolvedCmd === "!predictattendance") {
        await commandHandlers.predictattendance(message, member);
      } else if (resolvedCmd === "!predictspawn") {
        await commandHandlers.predictspawn(message, member);
      }
      return;
    }

    // =========================================================================
    // SPAWN THREAD CHECK-IN SYSTEM
    // =========================================================================
    // Handles member attendance in spawn threads
    // Keywords: "present", "here", "join", "checkin", "check-in"
    if (
      message.channel.isThread() &&
      message.channel.parentId === config.attendance_channel_id
    ) {
      // Sync state from attendance module to get latest data
      activeSpawns = attendance.getActiveSpawns();
      pendingVerifications = attendance.getPendingVerifications();

      const content = message.content.trim().toLowerCase();
      const keyword = content.split(/\s+/)[0];

      // Check if message is a check-in keyword
      if (
        ["present", "here", "join", "checkin", "check-in"].includes(keyword)
      ) {
        const spawnInfo = activeSpawns[message.channel.id];

        // Validate spawn is still open
        if (!spawnInfo || spawnInfo.closed) {
          await message.reply(
            "⚠️ This spawn is closed. No more check-ins accepted."
          );
          return;
        }

        // Non-admin members MUST attach screenshot as proof
        // Admins can fast-track without screenshot
        if (
          !userIsAdmin &&
          (!message.attachments || message.attachments.size === 0)
        ) {
          await message.reply(
            "⚠️ **Screenshot required!** Attach a screenshot showing boss and timestamp."
          );
          return;
        }

        // Check for duplicate check-in (normalized username comparison)
        const username = member.nickname || message.author.username;
        const isDuplicate = spawnInfo.members.some(
          (m) => normalizeUsername(m) === normalizeUsername(username)
        );

        if (isDuplicate) {
          await message.reply(`⚠️ You already checked in for this spawn.`);
          return;
        }

        // Add reaction buttons for admin to approve/deny
        await Promise.all([message.react("✅"), message.react("❌")]);

        // Track pending verification in state
        pendingVerifications[message.id] = {
          author: username,
          authorId: message.author.id,
          threadId: message.channel.id,
          timestamp: Date.now(),
        };
        attendance.setPendingVerifications(pendingVerifications);

        const statusText = userIsAdmin
          ? `⏩ **${username}** (Admin) registered for **${spawnInfo.boss}**\n\nFast-track verification (no screenshot required)...`
          : `⏳ **${username}** registered for **${spawnInfo.boss}**\n\nWaiting for admin verification...`;

        const embed = new EmbedBuilder()
          .setColor(userIsAdmin ? 0x00ff00 : 0xffa500)
          .setDescription(statusText)
          .setFooter({ text: "Admins: React ✅ to verify, ❌ to deny" });

        await message.reply({ embeds: [embed] });

        if (spawnInfo.confirmThreadId) {
          const confirmThread = await guild.channels
            .fetch(spawnInfo.confirmThreadId)
            .catch(() => null);
          if (confirmThread) {
            const notifText = userIsAdmin
              ? `⏩ **${username}** (Admin) - Fast-track check-in (no screenshot)`
              : `⏳ **${username}** - Pending verification`;
            await confirmThread.send(notifText);
          }
        }

        console.log(
          `🔍 Pending: ${username} for ${spawnInfo.boss}${
            userIsAdmin ? " (admin fast-track)" : ""
          }`
        );
        return;
      }

      // Admin commands in spawn threads
      if (!userIsAdmin) return;

      // ADD THIS LINE:
      const spawnCmd = resolveCommandAlias(content.split(/\s+/)[0]);

      // !verifyall
      if (spawnCmd === "!verifyall") {
        const spawnInfo = activeSpawns[message.channel.id];
        if (!spawnInfo || spawnInfo.closed) {
          await message.reply("⚠️ This spawn is closed or not found.");
          return;
        }

        const pendingInThread = Object.entries(pendingVerifications).filter(
          ([msgId, p]) => p.threadId === message.channel.id
        );

        if (pendingInThread.length === 0) {
          await message.reply("ℹ️ No pending verifications in this thread.");
          return;
        }

        await awaitConfirmation(
          message,
          member,
          `⚠️ **Verify ALL ${pendingInThread.length} pending member(s)?**\n\n` +
            `This will automatically verify:\n` +
            pendingInThread
              .map(([msgId, p]) => `• **${p.author}**`)
              .join("\n") +
            `\n\nReact ✅ to confirm or ❌ to cancel.`,
          async (confirmMsg) => {
            let verifiedCount = 0,
              duplicateCount = 0;
            const verifiedMembers = [];

            for (const [msgId, pending] of pendingInThread) {
              const isDuplicate = spawnInfo.members.some(
                (m) => normalizeUsername(m) === normalizeUsername(pending.author)
              );

              if (!isDuplicate) {
                spawnInfo.members.push(pending.author);
                verifiedMembers.push(pending.author);
                verifiedCount++;
              } else {
                duplicateCount++;
              }

              const originalMsg = await message.channel.messages
                .fetch(msgId)
                .catch(() => null);
              if (originalMsg)
                await attendance.removeAllReactionsWithRetry(originalMsg);

              delete pendingVerifications[msgId];
            }

            await message.reply(
              `✅ **Verify All Complete!**\n\n` +
                `✅ Verified: ${verifiedCount}\n` +
                `⚠️ Duplicates skipped: ${duplicateCount}\n` +
                `📊 Total processed: ${pendingInThread.length}\n\n` +
                `**Verified members:**\n${
                  verifiedMembers.join(", ") || "None (all were duplicates)"
                }`
            );

            if (spawnInfo.confirmThreadId && verifiedCount > 0) {
              const confirmThread = await guild.channels
                .fetch(spawnInfo.confirmThreadId)
                .catch(() => null);
              if (confirmThread) {
                await confirmThread.send(
                  `✅ **Bulk Verification by ${message.author.username}**\n` +
                    `Verified ${verifiedCount} member(s): ${verifiedMembers.join(
                      ", "
                    )}`
                );
              }
            }

            console.log(
              `✅ Verify all: ${verifiedCount} verified, ${duplicateCount} duplicates for ${spawnInfo.boss} by ${message.author.username}`
            );
          },
          async (confirmMsg) => {
            await message.reply("❌ Verify all canceled.");
          }
        );

        return;
      }

      // !verify @member
      if (spawnCmd === "!verify") {
        const mentioned = message.mentions.users.first();
        if (!mentioned) {
          await message.reply("⚠️ Usage: `!verify @member`");
          return;
        }

        const spawnInfo = activeSpawns[message.channel.id];
        if (!spawnInfo || spawnInfo.closed) {
          await message.reply("⚠️ This spawn is closed or not found.");
          return;
        }

        const mentionedMember = await guild.members
          .fetch(mentioned.id)
          .catch(() => null);
        const username = mentionedMember
          ? mentionedMember.nickname || mentioned.username
          : mentioned.username;

        const isDuplicate = spawnInfo.members.some(
          (m) => normalizeUsername(m) === normalizeUsername(username)
        );

        if (isDuplicate) {
          await message.reply(
            `⚠️ **${username}** is already verified for this spawn.`
          );
          return;
        }

        spawnInfo.members.push(username);

        await message.reply(
          `✅ **${username}** manually verified by ${message.author.username}`
        );

        if (spawnInfo.confirmThreadId) {
          const confirmThread = await guild.channels
            .fetch(spawnInfo.confirmThreadId)
            .catch(() => null);
          if (confirmThread) {
            await confirmThread.send(
              `✅ **${username}** verified by ${message.author.username} (manual override)`
            );
          }
        }

        console.log(
          `✅ Manual verify: ${username} for ${spawnInfo.boss} by ${message.author.username}`
        );
        return;
      }

      // close command
      if (content === "close") {
        const spawnInfo = activeSpawns[message.channel.id];
        if (!spawnInfo || spawnInfo.closed) {
          await message.reply("⚠️ This spawn is already closed or not found.");
          return;
        }

        const pendingInThread = Object.entries(pendingVerifications).filter(
          ([msgId, p]) => p.threadId === message.channel.id
        );

        if (pendingInThread.length > 0) {
          const pendingList = pendingInThread
            .map(([msgId, p]) => {
              const messageLink = `https://discord.com/channels/${guild.id}/${message.channel.id}/${msgId}`;
              return `• **${p.author}** - [View Message](${messageLink})`;
            })
            .join("\n");

          await message.reply(
            `⚠️ **Cannot close spawn!**\n\n` +
              `There are **${pendingInThread.length} pending verification(s)**:\n\n` +
              `${pendingList}\n\n` +
              `Please verify (✅) or deny (❌) all check-ins first, then type \`close\` again.\n\n` +
              `💡 Or use \`!resetpending\` to clear them.`
          );
          return;
        }

        const confirmMsg = await message.reply(
          `🔒 Close spawn **${spawnInfo.boss}** (${spawnInfo.timestamp})?\n\n` +
            `**${spawnInfo.members.length} members** will be submitted to Google Sheets.\n\n` +
            `React ✅ to confirm or ❌ to cancel.`
        );

        await confirmMsg.react("✅");
        await confirmMsg.react("❌");

        pendingClosures[confirmMsg.id] = {
          threadId: message.channel.id,
          adminId: message.author.id,
          type: "close",
          timestamp: Date.now(), // For stale entry cleanup
        };

        if (!confirmationMessages[message.channel.id])
          confirmationMessages[message.channel.id] = [];
        confirmationMessages[message.channel.id].push(confirmMsg.id);

        return;
      }

      // !forceclose
      if (spawnCmd === "!forceclose") {
        const spawnInfo = activeSpawns[message.channel.id];
        if (!spawnInfo || spawnInfo.closed) {
          await message.reply("⚠️ This spawn is already closed or not found.");
          return;
        }

        const pendingInThread = Object.keys(pendingVerifications).filter(
          (msgId) => pendingVerifications[msgId].threadId === message.channel.id
        );
        pendingInThread.forEach((msgId) => delete pendingVerifications[msgId]);

        await message.reply(
          `⚠️ **FORCE CLOSING** spawn **${spawnInfo.boss}**...\n` +
            `Submitting ${spawnInfo.members.length} members (ignoring ${pendingInThread.length} pending verifications)`
        );

        spawnInfo.closed = true;

        const payload = {
          action: "submitAttendance",
          boss: spawnInfo.boss,
          date: spawnInfo.date,
          time: spawnInfo.time,
          timestamp: spawnInfo.timestamp,
          members: spawnInfo.members,
        };

        const resp = await attendance.postToSheet(payload);

        if (resp.ok) {
          await message.channel.send(
            `✅ Attendance submitted successfully! (${spawnInfo.members.length} members)`
          );

          if (spawnInfo.confirmThreadId) {
            const confirmThread = await guild.channels
              .fetch(spawnInfo.confirmThreadId)
              .catch(() => null);
            if (confirmThread) {
              await confirmThread.delete().catch(console.error);
              console.log(
                `🗑️ Deleted confirmation thread for ${spawnInfo.boss}`
              );
            }
          }

          await message.channel
            .setArchived(true, `Force closed by ${message.author.username}`)
            .catch(console.error);

          delete activeSpawns[message.channel.id];
          delete activeColumns[`${spawnInfo.boss}|${spawnInfo.timestamp}`];

          console.log(
            `🔒 FORCE CLOSE: ${spawnInfo.boss} at ${spawnInfo.timestamp} by ${message.author.username} (${spawnInfo.members.length} members)`
          );
        } else {
          await message.channel.send(
            `⚠️ **Failed to submit attendance!**\n\n` +
              `Error: ${resp.text || resp.err}\n\n` +
              `**Members list (for manual entry):**\n${spawnInfo.members.join(
                ", "
              )}\n\n` +
              `Please manually update the Google Sheet.`
          );
        }

        return;
      }

      // Thread-specific override commands
      if (
        ["!forcesubmit", "!debugthread", "!resetpending"].includes(spawnCmd)
      ) {
        const now = Date.now();
        if (now - lastOverrideTime < TIMING.OVERRIDE_COOLDOWN) {
          const remaining = Math.ceil(
            (TIMING.OVERRIDE_COOLDOWN - (now - lastOverrideTime)) / 1000
          );
          await message.reply(
            `⚠️ Please wait ${remaining} seconds between override commands.`
          );
          return;
        }

        lastOverrideTime = now;
        console.log(
          `🔧 Override (${rawCmd} -> ${spawnCmd}): used by ${member.user.username} in thread ${message.channel.id}`
        );

        if (spawnCmd === "!forcesubmit")
          await commandHandlers.forcesubmit(message, member);
        else if (spawnCmd === "!debugthread")
          await commandHandlers.debugthread(message, member);
        else if (spawnCmd === "!resetpending")
          await commandHandlers.resetpending(message, member);
        return;
      }

      return;
    }

    // Admin-only commands in admin logs
    if (!userIsAdmin) return;

    if (inAdminLogs) {
      const adminCmd = resolveCommandAlias(rawCmd);
      const args = message.content.trim().split(/\s+/).slice(1);

      // LOOT COMMAND - Admin logs threads only
      const lootCmd = resolveCommandAlias(rawCmd);
      if (lootCmd === "!loot") {
        console.log(`🎯 Loot command detected`);
        await lootSystem.handleLootCommand(
          message,
          message.content.trim().split(/\s+/).slice(1),
          client
        );
        return;
      }

      // Admin logs override commands
      if (
        [
          "!clearstate",
          "!status",
          "!closeallthread",
          "!emergency",
          "!maintenance",
          "!removemember",
        ].includes(adminCmd)
      ) {
        const now = Date.now();
        if (now - lastOverrideTime < TIMING.OVERRIDE_COOLDOWN) {
          const remaining = Math.ceil(
            (TIMING.OVERRIDE_COOLDOWN - (now - lastOverrideTime)) / 1000
          );
          await message.reply(
            `⚠️ Please wait ${remaining} seconds between override commands.`
          );
          return;
        }

        lastOverrideTime = now;
        console.log(
          `🔧 Override (${rawCmd} -> ${adminCmd}): used by ${member.user.username}`
        );

        if (adminCmd === "!clearstate")
          await commandHandlers.clearstate(message, member);
        else if (adminCmd === "!status")
          await commandHandlers.status(message, member);
        else if (adminCmd === "!closeallthread")
          await commandHandlers.closeallthread(message, member);
        else if (adminCmd === "!emergency")
          await emergencyCommands.handleEmergencyCommand(message, args);
        else if (adminCmd === "!maintenance")
          await commandHandlers.maintenance(message, member);
        else if (adminCmd === "!removemember")
          await commandHandlers.removemember(message, member);
        return;
      }

      // BIDDING & AUCTIONEERING COMMANDS - Admin logs only
      // NOTE: !pause, !resume, !stop, !extend are thread-only commands now
      if (
        [
          "!queuelist",
          "!startauction",
          "!startauctionnow",
          "!resetbids",
          "!forcesubmitresults",
          "!endauction",
          "!movetodistribution",
        ].includes(adminCmd)
      ) {
        console.log(`🎯 Processing auction command (${rawCmd} -> ${adminCmd})`);

        // Route to appropriate handler
        // These are handled by commandHandlers
        if (
          ["!startauction", "!startauctionnow", "!endauction"].includes(
            adminCmd
          )
        ) {
          const handlerName = adminCmd.slice(1); // Remove the "!"
          if (commandHandlers[handlerName]) {
            await commandHandlers[handlerName](message, member, args);
          }
        }
        // These are handled by auctioneering module
        else if (
          [
            "!queuelist",
            "!forcesubmitresults",
            "!cancelitem",
            "!skipitem",
            "!movetodistribution",
          ].includes(adminCmd)
        ) {
          const handler = adminCmd.slice(1); // Remove the "!"

          if (handler === "queuelist") {
            await auctioneering.handleQueueList(
              message,
              bidding.getBiddingState()
            );
          } else if (handler === "forcesubmitresults") {
            await auctioneering.handleForceSubmitResults(
              message,
              config,
              bidding
            );
          } else if (handler === "cancelitem") {
            await auctioneering.handleCancelItem(message);
          } else if (handler === "skipitem") {
            await auctioneering.handleSkipItem(message);
          } else if (handler === "movetodistribution") {
            await auctioneering.handleMoveToDistribution(message, config, client);
          }
        }
        // Everything else (!resetbids, etc.) goes to bidding.handleCommand
        else {
          await bidding.handleCommand(adminCmd, message, args, client, config);
        }
        return;
      }

      // !addthread - Admin only command for manual spawn thread creation
      if (adminCmd === "!addthread") {
        // Explicit admin check (redundant with line 3526, but provides clear error message)
        if (!isAdmin(member, config)) {
          await message.reply("❌ **Admin only command**\n\nOnly admins can create spawn threads manually.");
          return;
        }

        const fullText = message.content.substring("!addthread".length).trim();

        const timestampMatch = fullText.match(
          /\((\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})\)/
        );
        if (!timestampMatch) {
          await message.reply(
            "⚠️ **Invalid format!**\n\n" +
              "**Usage:** `!addthread [BossName] will spawn in X minutes! (YYYY-MM-DD HH:MM)`\n\n" +
              "**Example:** `!addthread Clemantis will spawn in 5 minutes! (2025-10-22 11:30)`"
          );
          return;
        }

        const timestampStr = timestampMatch[1];

        const bossMatch = fullText.match(/^(.+?)\s+will spawn/i);
        if (!bossMatch) {
          await message.reply(
            "⚠️ **Cannot detect boss name!**\n\nFormat: `!addthread [BossName] will spawn in X minutes! (YYYY-MM-DD HH:MM)`"
          );
          return;
        }

        const detectedBoss = bossMatch[1].trim();
        const bossName = attendance.findBossMatch(detectedBoss);

        if (!bossName) {
          await message.reply(
            `⚠️ **Unknown boss:** "${detectedBoss}"\n\n**Available bosses:** ${Object.keys(
              bossPoints
            ).join(", ")}`
          );
          return;
        }

        const [datePart, timePart] = timestampStr.split(" ");
        const [year, month, day] = datePart.split("-");

        const dateStr = `${month}/${day}/${year.substring(2)}`;
        const timeStr = timePart;
        const fullTimestamp = `${dateStr} ${timeStr}`;

        console.log(
          `🔧 Manual spawn creation: ${bossName} at ${fullTimestamp} by ${message.author.username}`
        );

        await attendance.createSpawnThreads(
          client,
          bossName,
          dateStr,
          timeStr,
          fullTimestamp,
          "timer"
        );

        await message.reply(
          `✅ **Spawn thread created successfully!**\n\n` +
            `**Boss:** ${bossName}\n` +
            `**Time:** ${fullTimestamp}\n\n` +
            `Members can now check in!`
        );

        return;
      }
    }

    // Other bidding commands (admin only)
    if (inBiddingChannel) {
      const biddingCmd = resolveCommandAlias(rawCmd);
      const args = message.content.trim().split(/\s+/).slice(1);

      // !bidstatus - also available to members
      if (biddingCmd === "!bidstatus") {
        console.log(`🎯 Bidding status command (${rawCmd} -> ${biddingCmd})`);
        await bidding.handleCommand(biddingCmd, message, args, client, config);
        return;
      }
    }
  } catch (err) {
    console.error("❌ Message handler error:", err);
  }
});

/**
 * =========================================================================
 * MESSAGE REACTION ADD EVENT HANDLER
 * =========================================================================
 *
 * Handles reaction-based interactions throughout the bot. Primary uses:
 *
 * 1. Attendance Verification:
 *    - Admin reacts ✅ to approve member check-in
 *    - Admin reacts ❌ to deny check-in
 *    - Updates spawn member list and notifies user
 *
 * 2. Spawn Closure Confirmations:
 *    - Admin confirms spawn closure with ✅
 *    - Submits attendance to Google Sheets
 *    - Archives thread and cleans up state
 *
 * 3. Bid Confirmations:
 *    - User confirms bid placement with ✅
 *    - User cancels bid with ❌
 *    - Handles both regular bidding and auctioneering modes
 *    - Manages point locking/unlocking
 *    - Handles outbid notifications
 *
 * 4. State Management:
 *    - Tracks pending operations in pendingVerifications
 *    - Manages bid state in bidding module
 *    - Cleans up confirmation messages after response
 *
 * Safety features:
 * - Ignores bot reactions
 * - Fetches partial data (uncached entities)
 * - Validates user permissions
 * - Error handling with detailed logging
 *
 * Flow:
 * Reaction -> Partial Fetch -> State Lookup -> Permission Check -> Action Execution
 *
 * @event MessageReactionAdd
 * @param {MessageReaction} reaction - The reaction object
 * @param {User} user - User who added the reaction
 */
client.on(Events.MessageReactionAdd, async (reaction, user) => {
  try {
    if (user.bot) return;

    if (reaction.partial) await reaction.fetch();
    if (reaction.message.partial) await reaction.message.fetch();

    const msg = reaction.message;
    const guild = msg.guild;

    // Sync state from attendance module
    activeSpawns = attendance.getActiveSpawns();
    pendingVerifications = attendance.getPendingVerifications();
    pendingClosures = attendance.getPendingClosures();

    // Guard against closed threads
    if (
      msg.channel.isThread() &&
      msg.channel.parentId === config.attendance_channel_id
    ) {
      const spawnInfo = activeSpawns[msg.channel.id];

      if (!spawnInfo || spawnInfo.closed) {
        try {
          await reaction.users.remove(user.id);
          await msg.channel
            .send(`⚠️ <@${user.id}>, this spawn is closed. Reaction removed.`)
            .then((m) => setTimeout(() => m.delete().catch(() => {}), 5000));
        } catch (err) {
          console.error(
            `❌ Failed to send/delete closed spawn message:`,
            err.message
          );
        }
        return;
      }
    }

    // Bidding confirmations (allow non-admin users who made the bid)
    const biddingState = bidding.getBiddingState();

    if (biddingState.pc[msg.id]) {
      if (reaction.emoji.name === "✅") {
        await bidding.confirmBid(reaction, user, config);
      } else if (reaction.emoji.name === "❌") {
        await bidding.cancelBid(reaction, user, config);
      }
      return;
    }

    // Attendance verification
    const pending = pendingVerifications[msg.id];
    const closePending = pendingClosures[msg.id];

    // Admin check ONLY for attendance-related reactions
    if (pending || closePending) {
      const adminMember = await guild.members.fetch(user.id).catch(() => null);
      if (!adminMember || !isAdmin(adminMember)) {
        try {
          await reaction.users.remove(user.id);
        } catch (e) {
          console.error(
            `❌ Failed to remove non-admin reaction from ${user.tag}:`,
            e.message
          );
        }
        return;
      }
    } else {
      // Not an attendance-related message, ignore this reaction
      return;
    }

    if (pending) {
      const spawnInfo = activeSpawns[pending.threadId];

      if (!spawnInfo || spawnInfo.closed) {
        await msg.reply("⚠️ This spawn is closed.");
        delete pendingVerifications[msg.id];
        attendance.setPendingVerifications(pendingVerifications); // Sync
        return;
      }

      if (reaction.emoji.name === "✅") {
        const isDuplicate = spawnInfo.members.some(
          (m) => normalizeUsername(m) === normalizeUsername(pending.author)
        );

        if (isDuplicate) {
          await msg.reply(`⚠️ **${pending.author}** already verified.`);
          await attendance.removeAllReactionsWithRetry(msg); // CHANGED
          delete pendingVerifications[msg.id];
          attendance.setPendingVerifications(pendingVerifications); // Sync
          return;
        }

        spawnInfo.members.push(pending.author);
        attendance.setActiveSpawns(activeSpawns); // Sync

        await attendance.removeAllReactionsWithRetry(msg); // CHANGED
        await msg.reply(
          `✅ **${pending.author}** verified by ${user.username}!`
        );

        if (spawnInfo.confirmThreadId) {
          const confirmThread = await guild.channels
            .fetch(spawnInfo.confirmThreadId)
            .catch(() => null);
          if (confirmThread) {
            const embed = new EmbedBuilder()
              .setColor(0x00ff00)
              .setTitle("✅ Attendance Verified")
              .setDescription(
                `**${pending.author}** verified for **${spawnInfo.boss}**`
              )
              .addFields(
                { name: "Verified By", value: user.username, inline: true },
                {
                  name: "Points",
                  value: `+${bossPoints[spawnInfo.boss].points}`,
                  inline: true,
                },
                {
                  name: "Total Verified",
                  value: `${spawnInfo.members.length}`,
                  inline: true,
                }
              )
              .setTimestamp();

            await confirmThread.send({ embeds: [embed] });
          }
        }

        delete pendingVerifications[msg.id];
        attendance.setPendingVerifications(pendingVerifications); // Sync
      } else if (reaction.emoji.name === "❌") {
        await errorHandler.safeDelete(msg, 'message deletion');
        await msg.channel.send(
          `<@${pending.authorId}>, your attendance was **denied** by ${user.username}. ` +
            `Please repost with a proper screenshot.`
        );

        delete pendingVerifications[msg.id];
        attendance.setPendingVerifications(pendingVerifications); // Sync
      }
    }

    // Close confirmation
    if (closePending) {
      const spawnInfo = activeSpawns[closePending.threadId];

      if (reaction.emoji.name === "✅") {
        if (!spawnInfo || spawnInfo.closed) {
          await msg.channel.send("⚠️ Spawn already closed.");
          delete pendingClosures[msg.id];
          attendance.setPendingClosures(pendingClosures); // Sync
          await attendance.removeAllReactionsWithRetry(msg); // CHANGED
          return;
        }

        spawnInfo.closed = true;
        attendance.setActiveSpawns(activeSpawns); // Sync

        await msg.channel.send(
          `🔒 Closing spawn **${spawnInfo.boss}**... Submitting ${spawnInfo.members.length} members...`
        );

        const payload = {
          action: "submitAttendance",
          boss: spawnInfo.boss,
          date: spawnInfo.date,
          time: spawnInfo.time,
          timestamp: spawnInfo.timestamp,
          members: spawnInfo.members,
        };

        const resp = await attendance.postToSheet(payload); // CHANGED

        if (resp.ok) {
          await msg.channel.send(`✅ Attendance submitted! Archiving...`);

          await attendance.removeAllReactionsWithRetry(msg); // CHANGED

          if (spawnInfo.confirmThreadId) {
            const confirmThread = await guild.channels
              .fetch(spawnInfo.confirmThreadId)
              .catch(() => null);
            if (confirmThread) {
              await confirmThread.send(
                `✅ Spawn closed: **${spawnInfo.boss}** (${spawnInfo.timestamp}) - ${spawnInfo.members.length} members`
              );
              await errorHandler.safeDelete(confirmThread, 'message deletion');
            }
          }

          await msg.channel
            .setArchived(true, `Closed by ${user.username}`)
            .catch(() => {});

          delete activeSpawns[closePending.threadId];
          delete activeColumns[`${spawnInfo.boss}|${spawnInfo.timestamp}`];
          delete pendingClosures[msg.id];
          delete confirmationMessages[closePending.threadId];

          // Sync all changes
          attendance.setActiveSpawns(activeSpawns);
          attendance.setActiveColumns(activeColumns);
          attendance.setPendingClosures(pendingClosures);
          attendance.setConfirmationMessages(confirmationMessages);
        } else {
          await msg.channel.send(
            `⚠️ **Failed!**\n\nError: ${resp.text || resp.err}\n\n` +
              `**Members:** ${spawnInfo.members.join(", ")}`
          );
          await attendance.removeAllReactionsWithRetry(msg); // CHANGED
        }
      } else if (reaction.emoji.name === "❌") {
        await msg.channel.send("❌ Close canceled.");
        await attendance.removeAllReactionsWithRetry(msg); // CHANGED
        delete pendingClosures[msg.id];
        attendance.setPendingClosures(pendingClosures); // Sync
      }

      return;
    }
  } catch (err) {
    console.error("❌ Reaction handler error:", err);
  }
});

// ==========================================
// ERROR HANDLING
// ==========================================

client.on(Events.Error, (error) =>
  console.error("❌ Discord client error:", error)
);

process.on("unhandledRejection", (error) =>
  console.error("❌ Unhandled promise rejection:", error)
);

process.on("SIGTERM", () => {
  console.log("🛑 SIGTERM received, shutting down gracefully...");
  stopBiddingChannelCleanupSchedule(); // ← ADD THIS
  server.close(() => {
    console.log("🌐 HTTP server closed");
    client.destroy();
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  console.log("🛑 SIGINT received, shutting down gracefully...");
  stopBiddingChannelCleanupSchedule(); // ← ADD THIS
  server.close(() => {
    console.log("🌐 HTTP server closed");
    client.destroy();
    process.exit(0);
  });
});

// =====================================================================
// SECTION 10: MODULE EXPORTS & BOT INITIALIZATION
// =====================================================================

/**
 * Global function exports for cross-module access.
 * Enables auctioneering module to submit data to Google Sheets.
 */
global.postToSheet = attendance.postToSheet;

/**
 * =========================================================================
 * BOT LOGIN & STARTUP
 * =========================================================================
 *
 * Final step: Authenticates bot with Discord using token.
 *
 * The DISCORD_TOKEN must be set as an environment variable.
 * Without it, the bot cannot connect to Discord and will exit.
 *
 * After successful login, the ClientReady event fires and
 * triggers the full initialization sequence.
 */
if (!process.env.DISCORD_TOKEN) {
  console.error("❌ DISCORD_TOKEN environment variable not set!");
  process.exit(1);
}

client.login(process.env.DISCORD_TOKEN);
