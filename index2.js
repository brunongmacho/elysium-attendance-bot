/**
 * =====================================================================
 * ELYSIUM GUILD BOT - Main Application Entry Point
 * =====================================================================
 *
 * @file index2.js
 * @version 9.0.0
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
  ActionRowBuilder, // Action row for buttons
  ButtonBuilder,    // Button constructor
  ButtonStyle,      // Button style constants
  ComponentType,    // Component type constants
} = require("discord.js");

// External dependencies
const fs = require("fs");             // File system operations
const http = require("http");         // HTTP server for health checks
const levenshtein = require("fast-levenshtein"); // Fuzzy string matching

// Internal modules - Core systems
const bidding = require("./bidding.js");                    // Auction bidding logic
const helpSystem = require("./help-system.js");             // Command help system
const auctioneering = require("./auctioneering.js");        // Auction management
const attendance = require("./attendance.js");              // Attendance tracking
// const lootSystem = require("./loot-system.js");          // Loot distribution (DISABLED: manual loot entry)
const emergencyCommands = require("./emergency-commands.js"); // Emergency overrides
const leaderboardSystem = require("./leaderboard-system.js"); // Leaderboards
const errorHandler = require('./utils/error-handler');      // Centralized error handling
const { SheetAPI } = require('./utils/sheet-api');          // Unified Google Sheets API
const { DiscordCache } = require('./utils/discord-cache');  // Channel caching system
const { normalizeUsername, findBossMatch } = require('./utils/common');    // Username normalization and boss matching
const { getBossImageAttachment, getBossImageAttachmentURL } = require('./utils/boss-images'); // Boss images utility
const scheduler = require('./utils/maintenance-scheduler'); // Unified maintenance scheduler
const { IntelligenceEngine } = require('./intelligence-engine.js'); // AI/ML Intelligence Engine
const { ProactiveIntelligence } = require('./proactive-intelligence.js'); // Proactive Monitoring
const { NLPHandler } = require('./nlp-handler.js'); // Natural Language Processing
const { NLPLearningSystem } = require('./nlp-learning.js'); // NLP Learning System (self-improving)
const eventReminders = require('./event-reminders.js'); // Game Event Reminder System
const bossRotation = require('./boss-rotation.js'); // Boss Rotation System (5-guild tracking)
const activityHeatmap = require('./activity-heatmap.js'); // Activity Heatmap System
const crashRecovery = require('./utils/crash-recovery.js'); // Crash Recovery System (state persistence)
const { MLIntegration } = require('./ml-integration.js'); // ML Integration (spawn prediction + NLP enhancement)
const memberLore = JSON.parse(fs.readFileSync("./member-lore.json")); // Member lore data

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
  "!nm": "!newmember",

  // Fun commands
  "!8ball": "!eightball",
  "!8b": "!eightball",
  "!magic": "!eightball",
  "!sampal": "!slap",
  "!hampas": "!slap",

  // Member info commands
  "!profile": "!stats",
  "!stat": "!stats",
  "!info": "!stats",
  "!mystats": "!stats",

  // Leaderboard commands
  "!leadatt": "!leaderboardattendance",
  "!leadbid": "!leaderboardbidding",
  "!lbattendance": "!leaderboardattendance",
  "!lba": "!leaderboardattendance",
  "!lbbidding": "!leaderboardbidding",
  "!lbb": "!leaderboardbidding",
  "!leaderboard": "!leaderboards",  // FIX: Map singular to plural for NLP compatibility
  "!lb": "!leaderboards",
  "!week": "!weeklyreport",
  "!weekly": "!weeklyreport",
  "!month": "!monthlyreport",
  "!monthly": "!monthlyreport",

  // Activity heatmap commands
  "!heatmap": "!activity",
  "!activityheatmap": "!activity",
  "!guildactivity": "!activity",

  // Attendance commands (admin)
  "!st": "!status",
  "!attendancestatus": "!status",  // NLP: Map attendance status queries to general status
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

  // Bidding commands (admin)
  "!ql": "!queuelist",
  "!queue": "!queuelist",
  "!start": "!startauction",
  "!auction": "!startauction",  // FIX: Add !auction alias
  "!startauc": "!startauction",
  "!resetb": "!resetbids",
  "!forcesubmit": "!forcesubmitresults",
  "!fixlocked": "!fixlockedpoints",
  "!audit": "!auctionaudit",
  "!resetauc": "!resetauction",
  "!recover": "!recoverauction",

  // Emergency commands (admin) - Standalone commands
  "!emerg": "!emergency",
  "!forceclosethread": "!forceclosethread",
  "!fct": "!forceclosethread",
  "!forcecloseallthreads": "!forcecloseallthreads",
  "!fcat": "!forcecloseallthreads",
  "!forceendauction": "!forceendauction",
  "!fea": "!forceendauction",
  "!unlockallpoints": "!unlockallpoints",
  "!unlock": "!unlockallpoints",
  "!clearallbids": "!clearallbids",
  "!clearbids": "!clearallbids",
  "!diagnostics": "!diagnostics",
  "!diag": "!diagnostics",
  "!forcesync": "!forcesync",
  "!fsync": "!forcesync",
  "!testmilestones": "!testmilestones",
  "!tm": "!testmilestones",

  // Intelligence engine commands (admin)
  "!predict": "!predictprice",
  "!suggestprice": "!predictprice",
  "!suggestauction": "!analyzequeue",
  "!aq": "!analyzequeue",
  "!auctionqueue": "!analyzequeue",
  "!bootstrap": "!bootstraplearning",
  "!learnhistory": "!bootstraplearning",
  "!engage": "!engagement",
  "!analyze": "!engagement",  // FIX: Change from !analyzeengagement to !engagement (single member)
  "!analyzeall": "!analyzeengagement",  // NEW: For all members analysis
  "!guildanalyze": "!analyzeengagement",
  "!anomaly": "!detectanomalies",
  "!fraud": "!detectanomalies",
  "!recommend": "!recommendations",
  "!suggest": "!recommendations",
  "!perf": "!performance",
  "!nextspawn": "!predictspawn",
  "!whennext": "!predictspawn",
  "!spawntimer": "!predictspawn",
  "!predatt": "!predictattendance",  // NEW: Short alias for predictattendance

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
  "!pauseauction": "!pause",  // FIX: Add !pauseauction alias
  "!hold": "!pause",
  "!auc-resume": "!resume",
  "!resumeauction": "!resume",  // FIX: Add !resumeauction alias
  "!continue": "!resume",
  "!auc-stop": "!stop",
  "!end-item": "!stop",
  "!auc-extend": "!extend",
  "!ext": "!extend",
  "!auc-now": "!startauctionnow",

  // Auction control commands
  "!cancel": "!cancelitem",
  "!cancelitem": "!cancelitem",
  "!skip": "!skipitem",
  "!skipitem": "!skipitem",
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

/**
 * Slap command responses loaded from slap-responses.json
 * Contains arrays of funny objects and actions for the !slap command
 * @type {Object.<string, Array<string>>}
 */
const slapResponses = JSON.parse(fs.readFileSync("./slap-responses.json"));

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

  // WebSocket options - increase timeouts to handle network instability
  ws: {
    handshakeTimeout: 60000, // 60 seconds (default is 30s)
  },

  // REST options - increase timeout for API requests
  rest: {
    timeout: 60000, // 60 seconds timeout for REST API requests
    retries: 5,     // Retry failed requests up to 5 times
  },

  // Memory optimization: Sweep caches regularly to manage 512MB RAM limit
  // Optimized for fast message cleanup while maintaining reaction functionality
  sweepers: {
    messages: {
      interval: 180, // Run every 3 minutes (optimized from 5)
      lifetime: 300, // Remove messages older than 5 minutes (optimized from 10)
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
 * Cache for member stats to reduce Google Sheets API calls
 * @type {Map<string, {data: Object, timestamp: number}>}
 * Format: { memberName: { data: statsObject, timestamp: Date.now() } }
 * Cache duration: 5 minutes (300000ms)
 */
const statsCache = new Map();
const STATS_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

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
 * NLP Learning System for self-improving natural language understanding
 * Learns patterns from user confirmations and adapts to multilingual usage
 * Mention-based activation (responds only when @mentioned)
 * Passive learning mode (learns from all messages)
 * @type {NLPLearningSystem}
 */
let nlpLearningSystem = null;

/**
 * ML Integration for enhanced spawn predictions and NLP conversation
 * Provides ML-powered spawn time predictions with confidence intervals
 * Enhances NLP with context awareness and sentiment analysis
 * @type {MLIntegration}
 */
let mlIntegration = null;

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
// STATS HELPER FUNCTIONS
// =====================================================================

/**
 * Find best matching member using fuzzy search
 * @param {string} searchName - Name to search for
 * @param {Guild} guild - Discord guild
 * @returns {Object|null} { member, matchedName, confidence } or null
 */
function findBestMemberMatch(searchName, guild) {
  if (!searchName || !guild) return null;

  const normalizedSearch = searchName.toLowerCase().trim();
  const members = Array.from(guild.members.cache.values());

  let bestMatch = null;
  let bestScore = Infinity;
  let matchType = null;

  for (const member of members) {
    const displayName = member.displayName.toLowerCase();
    const username = member.user.username.toLowerCase();

    // Exact match (case insensitive) - highest priority
    if (displayName === normalizedSearch || username === normalizedSearch) {
      return {
        member: member,
        matchedName: member.displayName,
        confidence: 100,
        matchType: 'exact'
      };
    }

    // Starts with match - second priority
    if (displayName.startsWith(normalizedSearch) || username.startsWith(normalizedSearch)) {
      const matchedName = displayName.startsWith(normalizedSearch) ? member.displayName : member.user.username;
      return {
        member: member,
        matchedName: matchedName,
        confidence: 90,
        matchType: 'prefix'
      };
    }

    // Contains match - third priority
    if (displayName.includes(normalizedSearch) || username.includes(normalizedSearch)) {
      if (!bestMatch || matchType !== 'contains') {
        bestMatch = member;
        bestScore = 0;
        matchType = 'contains';
      }
    }

    // Fuzzy match using Levenshtein distance - last resort
    if (!bestMatch || matchType === 'fuzzy') {
      const displayDistance = levenshtein.get(normalizedSearch, displayName);
      const usernameDistance = levenshtein.get(normalizedSearch, username);
      const minDistance = Math.min(displayDistance, usernameDistance);

      if (minDistance < bestScore) {
        bestScore = minDistance;
        bestMatch = member;
        matchType = 'fuzzy';
      }
    }
  }

  // Return best match if found
  if (bestMatch) {
    // Calculate confidence based on distance (lower distance = higher confidence)
    let confidence;
    if (matchType === 'contains') {
      confidence = 75;
    } else if (matchType === 'fuzzy') {
      // Confidence inversely proportional to distance
      // Distance of 0 = 100%, distance of 10+ = ~0%
      confidence = Math.max(0, Math.min(100, 100 - (bestScore * 10)));
    }

    return {
      member: bestMatch,
      matchedName: bestMatch.displayName,
      confidence: confidence,
      matchType: matchType
    };
  }

  return null;
}

/**
 * Builds a Discord embed for member stats
 * @param {Object} stats - Stats data from Google Sheets
 * @param {GuildMember} member - Discord guild member
 * @returns {EmbedBuilder} Formatted stats embed
 */
function buildStatsEmbed(stats, member, countdown = 30) {
  const { memberName, attendance, bidding, rank, totalMembers } = stats;

  // Calculate percentile (handle null/0 rank)
  const validRank = rank && rank > 0 ? rank : totalMembers;
  const percentile = totalMembers > 0 ? Math.round((1 - (validRank / totalMembers)) * 100) : 0;

  // Choose embed color based on rank
  const color = getColorByRank(validRank);

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`📊 Member Stats - ${memberName}`)
    .setTimestamp();

  // Set thumbnail if we have a valid member object
  if (member && member.user) {
    embed.setThumbnail(member.user.displayAvatarURL());
  }

  // Format rank display with savage titles
  const rankNumber = rank && rank > 0 ? `#${rank}` : `Unranked`;
  const rankTitle = getRankTitle(rank, attendance);
  const rankDisplay = rank && rank > 0 ? `**${rankNumber}**\n${rankTitle}` : rankTitle;

  // Format streak display (singular vs plural)
  const streakText = attendance.streak === 1 ? '1 day' : `${attendance.streak} days`;
  const streakDisplay = attendance.streak > 0 ? `**${streakText}** 🔥` : `**${streakText}**`;

  // COMPACT FORMAT - Inline fields for key metrics
  embed.addFields(
    {
      name: '🎯 Attendance',
      value: `**${attendance.total}** kills\n**${attendance.points}** pts\n**${attendance.rate}%** rate`,
      inline: true
    },
    {
      name: '💰 Points',
      value: `**${bidding.left}** left\n**${bidding.consumed}** spent\n**${bidding.consumptionRate}%** used`,
      inline: true
    },
    {
      name: '📊 Ranking',
      value: `${rankDisplay}\n${streakDisplay}\n${getActivityLevel(attendance.rate)}`,
      inline: true
    }
  );

  // Recent Activity - only show top 5
  if (attendance.recentBosses && attendance.recentBosses.length > 0) {
    const recent = attendance.recentBosses
      .slice(0, 5)
      .map(b => `${b.boss} (${b.points}pts)`)
      .join(' • ');

    embed.addFields({
      name: '📅 Recent Activity',
      value: recent,
      inline: false
    });
  }

  // 🎭 ADD MEMBER LORE IF AVAILABLE
  // CRITICAL FIX: Case-insensitive lookup for lore
  const loreKey = Object.keys(memberLore).find(
    key => key.toLowerCase() === memberName.toLowerCase()
  );
  const lore = loreKey ? memberLore[loreKey] : null;

  if (lore) {
    embed.addFields({
      name: `⚔️ ${lore.class}`,
      value: `**Weapon:** ${lore.weapon}\n*${lore.lore}*`,
      inline: false
    });
  } else {
    console.log(`ℹ️ No lore found for: ${memberName} (checked ${Object.keys(memberLore).length} entries)`);
  }

  // Footer with favorite boss and percentile
  const percentileText = percentile > 0 ? `Top ${percentile}%` : 'New Member';
  const countdownText = countdown > 0 ? ` • Auto-deletes in ${countdown}s` : '';

  if (attendance.favoriteBoss) {
    embed.setFooter({
      text: `Most attended: ${attendance.favoriteBoss.name} (${attendance.favoriteBoss.count}x) • ${percentileText}${countdownText}`
    });
  } else {
    embed.setFooter({
      text: `${percentileText}${countdownText}`
    });
  }

  return embed;
}

/**
 * Get embed color based on rank
 * @param {number} rank - Member's rank
 * @returns {number} Hex color code
 */
function getColorByRank(rank) {
  if (rank === 1) return 0xFFD700; // Gold
  if (rank === 2) return 0xC0C0C0; // Silver
  if (rank === 3) return 0xCD7F32; // Bronze
  if (rank <= 10) return 0x00D9FF; // Cyan
  return 0x5865F2; // Blurple
}

/**
 * Get savage/rewarding rank title based on position
 * @param {number} rank - Member's rank
 * @param {Object} attendance - Attendance data
 * @returns {string} Title text
 */
function getRankTitle(rank, attendance) {
  // Special case: No attendance
  if (!attendance || attendance.total === 0) {
    return "👻 Ghost Member (Do You Even Exist?)";
  }

  // Special case: Unranked
  if (!rank || rank <= 0) {
    return "🌱 Fresh Meat (Newbie)";
  }

  // RANK #1 - THE ABSOLUTE GOD
  if (rank === 1) return "👑 GOD OF ELYSIUM 👑";

  // TOP 2-3 - LEGENDARY STATUS
  if (rank === 2) return "🥈 ATTENDANCE DEMON 🥈";
  if (rank === 3) return "🥉 GUILD BACKBONE 🥉";

  // ELITE 4-6 - INSANE DEDICATION
  if (rank === 4) return "⚡ ULTIMATE TRYHARD ⚡";
  if (rank === 5) return "💎 DIAMOND GRINDER 💎";
  if (rank === 6) return "🔱 NO SLEEP WARRIOR 🔱";

  // VERY HIGH 7-10 - SUPER ACTIVE
  if (rank === 7) return "🔥 ATTENDANCE DEMON 🔥";
  if (rank === 8) return "💪 GIGACHAD MEMBER 💪";
  if (rank === 9) return "⭐ SWEATLORD SUPREME ⭐";
  if (rank === 10) return "🎯 TOP 10 BEAST 🎯";

  // HIGH 11-15 - VERY CONSISTENT
  if (rank >= 11 && rank <= 12) return "⚔️ Elite Sweeper";
  if (rank >= 13 && rank <= 15) return "🌟 Hardcore Regular";

  // UPPER MID 16-20 - ACTIVE
  if (rank >= 16 && rank <= 17) return "🎖️ Professional Grinder";
  if (rank >= 18 && rank <= 20) return "📈 Rising Star";

  // MID 21-25 - SOLID MEMBER
  if (rank >= 21 && rank <= 23) return "💼 Solid Contributor";
  if (rank >= 24 && rank <= 25) return "🎮 Active Member";

  // LOWER MID 26-30 - DECENT
  if (rank >= 26 && rank <= 28) return "😎 Chill Gamer";
  if (rank >= 29 && rank <= 30) return "🌊 Wave Rider";

  // REGULAR 31-35 - AVERAGE
  if (rank >= 31 && rank <= 33) return "🌿 Grass Toucher (Has a Life)";
  if (rank >= 34 && rank <= 35) return "☕ Coffee Break Enjoyer";

  // CASUAL 36-40 - PART-TIMER
  if (rank >= 36 && rank <= 38) return "📱 Part-Time Player";
  if (rank >= 39 && rank <= 40) return "🍃 Breeze Cruiser";

  // LOW 41-45 - SAVAGE ZONE BEGINS
  if (rank >= 41 && rank <= 43) return "💀 Bench Warmer";
  if (rank >= 44 && rank <= 45) return "🎪 Guild Mascot";

  // VERY LOW 46-48 - BRUTAL HONESTY
  if (rank === 46) return "👻 Professional AFK";
  if (rank === 47) return "🦥 Sloth Mode Activated";
  if (rank === 48) return "🪦 Barely Alive";

  // BOTTOM 2 - ULTIMATE ROAST
  if (rank === 49) return "🤡 Second to Dead Last";
  if (rank === 50) return "🗿 THE ANCHOR (Congrats on Last Place!)";

  // Fallback for ranks beyond 50
  if (rank > 50) return "🗿 Beyond the Abyss";

  return "📊 Member";
}

/**
 * Get rank emoji based on position
 * @param {number} rank - Member's rank
 * @returns {string} Emoji representation
 */
function getRankEmoji(rank) {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  if (rank <= 10) return '⭐';
  return '';
}

/**
 * Get activity level description based on attendance rate
 * @param {number} rate - Attendance rate percentage
 * @returns {string} Activity level description
 */
function getActivityLevel(rate) {
  if (rate >= 90) return 'Very Active ⭐⭐⭐';
  if (rate >= 75) return 'Active ⭐⭐';
  if (rate >= 50) return 'Moderate ⭐';
  if (rate > 0) return 'Casual';
  return 'Inactive';
}

/**
 * Start a live countdown deletion for a message with embed
 * Updates the message every 5 seconds to show remaining time, then deletes
 *
 * @param {Message} message - Original user message to delete
 * @param {Message} botMessage - Bot's reply message to update and delete
 * @param {EmbedBuilder} baseEmbed - Base embed to update (will be cloned)
 * @param {Function} updateEmbedFooter - Function to update embed footer with countdown
 *                                       Should accept (embed, countdown) and return updated embed
 * @param {number} duration - Total duration in seconds (default: 30)
 */
async function startCountdownDeletion(message, botMessage, stats, member, updateFunction, duration = 30) {
  let remainingTime = duration;

  // Delete user's command message immediately
  try {
    await errorHandler.safeDelete(message, 'message deletion');
  } catch (e) {
    console.warn(`⚠️ Could not delete user message: ${e.message}`);
  }

  // Update every 5 seconds: 30s, 25s, 20s, 15s, 10s, 5s
  const updateInterval = 5;
  const countdownTimer = setInterval(async () => {
    remainingTime -= updateInterval;

    if (remainingTime <= 0) {
      // Time's up - delete the message
      clearInterval(countdownTimer);
      try {
        await errorHandler.safeDelete(botMessage, 'message deletion');
      } catch (e) {
        console.warn(`⚠️ Could not delete bot message: ${e.message}`);
      }
      return;
    }

    // Update the embed with new countdown
    try {
      const updatedEmbed = updateFunction(stats, member, remainingTime);
      await botMessage.edit({ embeds: [updatedEmbed] });
    } catch (e) {
      console.warn(`⚠️ Could not update countdown: ${e.message}`);
      // If update fails, just delete the message
      clearInterval(countdownTimer);
      try {
        await errorHandler.safeDelete(botMessage, 'message deletion');
      } catch (deleteErr) {
        console.warn(`⚠️ Could not delete bot message: ${deleteErr.message}`);
      }
    }
  }, updateInterval * 1000);
}

/**
 * Clean up old stats and mypoints messages on bot startup
 * Prevents channel clutter from messages that didn't auto-delete before restart
 */
async function cleanupStaleStatsMessages() {
  try {
    console.log('🧹 Cleaning up stale stats/mypoints messages...');

    const commandsChannel = await discordCache.getChannel('elysium_commands_channel_id');
    if (!commandsChannel) {
      console.warn('⚠️ Could not find elysium-commands channel for cleanup');
      return;
    }

    // Fetch last 100 messages
    const messages = await commandsChannel.messages.fetch({ limit: 100 });
    let deletedCount = 0;

    for (const [, message] of messages) {
      let shouldDelete = false;

      // Check if it's a bot message with stats/mypoints embed
      if (message.author.id === client.user.id) {
        // Check if it's a stats or mypoints message
        if (message.embeds && message.embeds.length > 0) {
          const embed = message.embeds[0];
          const title = embed.title || '';

          // Delete stats and mypoints messages
          if (title.includes('Member Stats') || title.includes('Your Points')) {
            shouldDelete = true;
          }
        }

        // Also delete loading messages like "⏳ Fetching stats for..."
        if (message.content && message.content.includes('⏳ Fetching stats for')) {
          shouldDelete = true;
        }
      }

      // Check if it's a user command message (!stats or !mypoints)
      if (message.content) {
        const content = message.content.trim().toLowerCase();
        const isStatsCommand = content.startsWith('!stats') ||
                               content.startsWith('!profile') ||
                               content.startsWith('!stat') ||
                               content.startsWith('!info') ||
                               content.startsWith('!mystats');
        const isPointsCommand = content.startsWith('!mypoints') ||
                                content.startsWith('!pts') ||
                                content.startsWith('!mypts') ||
                                content.startsWith('!mp');

        if (isStatsCommand || isPointsCommand) {
          shouldDelete = true;
        }
      }

      // Delete the message if it matches any criteria
      if (shouldDelete) {
        try {
          await message.delete();
          deletedCount++;
        } catch (e) {
          console.warn(`⚠️ Could not delete message ${message.id}: ${e.message}`);
        }
      }
    }

    if (deletedCount > 0) {
      console.log(`✅ Cleaned up ${deletedCount} stale stats/mypoints message(s)`);
    } else {
      console.log('✅ No stale stats/mypoints messages to clean up');
    }
  } catch (error) {
    console.error('❌ Error cleaning up stale messages:', error.message);
  }
}

// =====================================================================
// SECTION 7: CONFIRMATION UTILITIES
// =====================================================================
/**
 * Creates a disabled button row from two buttons.
 * Uses fresh ButtonBuilder instances to avoid mutation issues with ButtonBuilder.from().
 *
 * @param {ButtonBuilder} btn1 - First button to disable
 * @param {ButtonBuilder} btn2 - Second button to disable
 * @returns {ActionRowBuilder} Row with both buttons disabled
 */
function createDisabledRow(btn1, btn2) {
  const disabledBtn1 = new ButtonBuilder()
    .setCustomId(btn1.data.custom_id)
    .setLabel(btn1.data.label)
    .setStyle(btn1.data.style)
    .setDisabled(true);

  const disabledBtn2 = new ButtonBuilder()
    .setCustomId(btn2.data.custom_id)
    .setLabel(btn2.data.label)
    .setStyle(btn2.data.style)
    .setDisabled(true);

  return new ActionRowBuilder().addComponents(disabledBtn1, disabledBtn2);
}

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
  try {
    const confirmButton = new ButtonBuilder()
      .setCustomId(`confirm_yes_${member.user.id}_${Date.now()}`)
      .setLabel('✅ Confirm')
      .setStyle(ButtonStyle.Success)
      .setDisabled(false);

    const cancelButton = new ButtonBuilder()
      .setCustomId(`confirm_no_${member.user.id}_${Date.now()}`)
      .setLabel('❌ Cancel')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(false);

    const row = new ActionRowBuilder().addComponents(confirmButton, cancelButton);

    const isEmbed = embedOrText instanceof EmbedBuilder;
    const confirmMsg = isEmbed
      ? await message.reply({ embeds: [embedOrText], components: [row] })
      : await message.reply({ content: embedOrText, components: [row] });

    console.log(`🔘 [BUTTON] Confirmation sent to ${member.user.tag} (${member.user.id})`);

    const collector = confirmMsg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: TIMING.CONFIRMATION_TIMEOUT,
      filter: i => {
        const matches = i.user.id === member.user.id;
        if (!matches) {
          console.log(`🔘 [BUTTON] Ignoring click from ${i.user.tag} (expected ${member.user.tag})`);
        }
        return matches;
      }
    });

    collector.on('collect', async (interaction) => {
      try {
        const isConfirm = interaction.customId.startsWith('confirm_yes_');
        console.log(`🔘 [BUTTON] ${member.user.tag} clicked ${isConfirm ? 'Confirm' : 'Cancel'}`);

        // Create fresh disabled buttons (defensive: avoid any potential mutation of originals)
        const disabledConfirmButton = new ButtonBuilder()
          .setCustomId(confirmButton.data.custom_id)
          .setLabel(confirmButton.data.label)
          .setStyle(confirmButton.data.style)
          .setDisabled(true);

        const disabledCancelButton = new ButtonBuilder()
          .setCustomId(cancelButton.data.custom_id)
          .setLabel(cancelButton.data.label)
          .setStyle(cancelButton.data.style)
          .setDisabled(true);

        const disabledRow = new ActionRowBuilder().addComponents(
          disabledConfirmButton,
          disabledCancelButton
        );

        await interaction.update({ components: [disabledRow] }).catch(err => {
          console.error(`❌ [BUTTON] Failed to disable buttons: ${err.message}`);
        });

        if (isConfirm) {
          await onConfirm(confirmMsg);
        } else {
          await onCancel(confirmMsg);
        }

        collector.stop();
      } catch (err) {
        console.error(`❌ [BUTTON] Error handling button click: ${err.message}`);
        await interaction.reply({ content: `❌ An error occurred: ${err.message}`, ephemeral: true }).catch(() => {});
      }
    });

    collector.on('end', async (collected, reason) => {
      console.log(`🔘 [BUTTON] Collector ended: ${reason} (${collected.size} interactions)`);

      if (reason === 'time' && collected.size === 0) {
        // Create fresh disabled buttons (defensive: avoid any potential mutation of originals)
        const disabledConfirmButton = new ButtonBuilder()
          .setCustomId(confirmButton.data.custom_id)
          .setLabel(confirmButton.data.label)
          .setStyle(confirmButton.data.style)
          .setDisabled(true);

        const disabledCancelButton = new ButtonBuilder()
          .setCustomId(cancelButton.data.custom_id)
          .setLabel(cancelButton.data.label)
          .setStyle(cancelButton.data.style)
          .setDisabled(true);

        const disabledRow = new ActionRowBuilder().addComponents(
          disabledConfirmButton,
          disabledCancelButton
        );

        await confirmMsg.edit({ components: [disabledRow] }).catch(() => {});
        await message.reply("⏱️ Confirmation timed out.").catch(() => {});
      }
    });
  } catch (err) {
    console.error(`❌ [BUTTON] Error in awaitConfirmation: ${err.message}`);
    throw err;
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
  // Loot command (DISABLED: manual entry now used)
  // loot: async (message, member, args) => {
  //   await lootSystem.handleLootCommand(message, args, client);
  // },

  help: async (message, member) => {
    const args = message.content.trim().split(/\s+/).slice(1);
    await helpSystem.handleHelp(message, args, member);
  },

  // =========================================================================
  // NEW MEMBER GUIDE - Comprehensive instructions for new members
  // =========================================================================
  newmember: async (message, member) => {
    // Overview embed
    const overviewEmbed = new EmbedBuilder()
      .setColor('#00ff00')
      .setTitle('📚 Welcome to Elysium! New Member Guide')
      .setDescription(
        '**Welcome to the guild!** This guide will teach you everything you need to know about:\n\n' +
        '1️⃣ **Boss Attendance** - How to get credit for boss kills\n' +
        '2️⃣ **Auctions** - How to bid on boss loot\n\n' +
        'Read both sections carefully to avoid mistakes!'
      )
      .setTimestamp();

    // Boss Attendance Guide
    const attendanceEmbed = new EmbedBuilder()
      .setColor('#3498db')
      .setTitle('1️⃣ Boss Attendance - Step by Step Guide')
      .setDescription(
        '**When a boss spawns, here\'s what you need to do to get attendance credit:**'
      )
      .addFields(
        {
          name: '📋 STEP 1: Find the Boss Thread',
          value:
            '• The bot automatically creates a thread in the attendance channel\n' +
            '• Thread name format: `[MM/DD/YY HH:MM] Boss Name`\n' +
            '• Example: `[11/13/25 14:30] General Aquleus`\n' +
            '• Look for the newest thread with the boss you killed',
          inline: false
        },
        {
          name: '✅ STEP 2: Post Keyword + Screenshot (ONE MESSAGE)',
          value:
            '• In ONE message, type keyword AND attach screenshot:\n' +
            '  • **Keywords:** `present`, `here`, `attending`, `join`, `checkin`\n' +
            '  • Common typos are auto-corrected (prsnt, hre, etc.)\n' +
            '• **CRITICAL:** Keyword and screenshot MUST be in the SAME message!\n' +
            '• After posting, the bot will reply with verification buttons',
          inline: false
        },
        {
          name: '📸 STEP 3: Screenshot Requirements',
          value:
            '**Your screenshot MUST show:**\n' +
            '✓ Your character name visible\n' +
            '✓ Boss name visible on screen\n' +
            '✓ Combat log or damage numbers (preferred)\n' +
            '✓ Game timestamp/time visible\n\n' +
            '**DO NOT:**\n' +
            '❌ Use fake or old screenshots\n' +
            '❌ Use someone else\'s screenshot\n' +
            '❌ Post screenshot in separate message',
          inline: false
        },
        {
          name: '⏳ STEP 4: Wait for Admin Verification',
          value:
            '• Bot will reply with ✅ **Verify** and ❌ **Deny** buttons\n' +
            '• Admin will review your screenshot and click:\n' +
            '  • ✅ **Verify** → You get attendance credit!\n' +
            '  • ❌ **Deny** → Screenshot rejected, you must resubmit\n' +
            '• Check the thread to see if you were verified\n' +
            '• Green embed = ✅ Verified | Red embed = ❌ Denied',
          inline: false
        },
        {
          name: '⏰ Important Time Limits',
          value:
            '• Threads **auto-close after 20 minutes**\n' +
            '• Submit ASAP after killing the boss\n' +
            '• Late submissions will be rejected\n' +
            '• If thread closes before verification, contact admin',
          inline: false
        },
        {
          name: '⚠️ Common Mistakes to Avoid',
          value:
            '❌ Posting "present" first, then screenshot separately\n' +
            '❌ Posting in the wrong boss thread\n' +
            '❌ Posting in main attendance channel (not the thread)\n' +
            '❌ Submitting after thread closes (20 min)\n' +
            '✅ Type keyword + attach screenshot in ONE message\n' +
            '✅ Post in the correct boss thread\n' +
            '✅ Submit within 20 minutes',
          inline: false
        }
      );

    // Auction Guide
    const auctionEmbed = new EmbedBuilder()
      .setColor('#f39c12')
      .setTitle('2️⃣ Auctions - Step by Step Guide')
      .setDescription(
        '**When loot drops from a boss, items are auctioned to guild members:**'
      )
      .addFields(
        {
          name: '🔨 STEP 1: Watch for Auction Threads',
          value:
            '• Admins create auction threads in the bidding channel\n' +
            '• Thread name shows the item being auctioned\n' +
            '• Pay attention to:\n' +
            '  📦 **Item name** (e.g., "Arcana Mace +5")\n' +
            '  💰 **Starting bid** (minimum bid required)\n' +
            '  ⏱️ **Timer** (how long you have to bid)',
          inline: false
        },
        {
          name: '💵 STEP 2: Place Your Bid',
          value:
            '• **MUST be used inside the auction thread!**\n' +
            '• Use command: **`!bid <amount>`**\n' +
            '• Example: `!bid 1000` (bids 1000 points)\n' +
            '• Your bid must be higher than current highest bid\n' +
            '• Bot will confirm if successful or show error',
          inline: false
        },
        {
          name: '📊 STEP 3: Check Your Points',
          value:
            '• Use **`!mypoints`** in bidding channel (main, not thread)\n' +
            '• Shows your total available points\n' +
            '• Also shows: **`!mp`**, **`!pts`**, **`!mypts`** (aliases)\n' +
            '• Make sure you have enough points before bidding!',
          inline: false
        },
        {
          name: '📋 STEP 4: Check Bid Status',
          value:
            '• Use **`!bidstatus`** in bidding channel\n' +
            '• Shows all active auctions\n' +
            '• Displays current highest bidder\n' +
            '• Shows time remaining on each auction',
          inline: false
        },
        {
          name: '🎯 STEP 5: Winning the Auction',
          value:
            '• Highest bidder when timer expires wins!\n' +
            '• Winner announced in the auction thread\n' +
            '• Points automatically deducted from your balance\n' +
            '• Coordinate with admins to receive your item\n' +
            '• Item will be distributed in-game',
          inline: false
        },
        {
          name: '💡 Smart Bidding Tips',
          value:
            '✅ **Check `!mypoints` first** - Don\'t bid more than you have\n' +
            '✅ **Bid in small increments** - Save points\n' +
            '✅ **Watch the timer** - Last-minute bids can win\n' +
            '✅ **Know item values** - Ask experienced members\n' +
            '✅ **Bid only in auction threads** - Main channel won\'t work\n' +
            '❌ **Don\'t bid on items you can\'t use**\n' +
            '❌ **Bids are binding** - Can\'t cancel after placing',
          inline: false
        },
        {
          name: '📋 Available Auction Commands',
          value:
            '**In auction threads:**\n' +
            '• **`!bid <amount>`** - Place a bid (ONLY in threads)\n\n' +
            '**In main bidding channel:**\n' +
            '• **`!mypoints`** / **`!mp`** - Check your points\n' +
            '• **`!bidstatus`** - View active auctions\n\n' +
            '**Aliases that work:**\n' +
            '• `!b <amount>` = `!bid <amount>`\n' +
            '• `!pts`, `!mypts` = `!mypoints`',
          inline: false
        }
      );

    // Additional Tips
    const tipsEmbed = new EmbedBuilder()
      .setColor('#9b59b6')
      .setTitle('💎 Additional Tips for New Members')
      .addFields(
        {
          name: '🎮 How to Earn Points',
          value:
            '• Attend boss kills (submit attendance screenshots)\n' +
            '• Each verified attendance = points added\n' +
            '• More attendance = more points to bid\n' +
            '• Check leaderboards: `!leaderboardattendance`\n' +
            '• Be active and help guild members!',
          inline: false
        },
        {
          name: '📞 Need Help?',
          value:
            '• Type **`!help`** to see all available commands\n' +
            '• Ask admins if you\'re unsure about anything\n' +
            '• Read pinned messages in each channel\n' +
            '• Other members are friendly - don\'t hesitate to ask!',
          inline: false
        },
        {
          name: '⚡ Quick Command Reference',
          value:
            '**Attendance:**\n' +
            '• Type `present` + attach screenshot (ONE message)\n' +
            '• Typos auto-corrected: `prsnt`, `hre`, etc.\n\n' +
            '**Auctions:**\n' +
            '• `!bid <amount>` - Bid in auction thread\n' +
            '• `!mypoints` - Check your points\n' +
            '• `!bidstatus` - View active auctions\n\n' +
            '**Info:**\n' +
            '• `!help` - Full command list\n' +
            '• `!nm` or `!newmember` - This guide\n' +
            '• `!leaderboardattendance` - Attendance rankings',
          inline: false
        }
      )
      .setFooter({ text: 'Good luck and have fun in Elysium! 🎉' })
      .setTimestamp();

    // Send all embeds
    await message.reply({
      embeds: [overviewEmbed, attendanceEmbed, auctionEmbed, tipsEmbed]
    });
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
        // Convert strings to numbers for proper date parsing
        return new Date(
          2000 + parseInt(year),
          parseInt(month) - 1,
          parseInt(day),
          parseInt(hour),
          parseInt(minute)
        ).getTime();
      };
      return parseTimestamp(a[1].timestamp) - parseTimestamp(b[1].timestamp);
    });

    const spawnList = sortedSpawns.slice(0, 10).map(([threadId, info], i) => {
      const spawnTime = (() => {
        const [date, time] = info.timestamp.split(" ");
        const [month, day, year] = date.split("/");
        const [hour, minute] = time.split(":");
        // Convert strings to numbers and create Date object
        // This ensures proper date calculation regardless of server timezone
        return new Date(
          2000 + parseInt(year),
          parseInt(month) - 1,
          parseInt(day),
          parseInt(hour),
          parseInt(minute)
        ).getTime();
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

    // Get ML statistics if available
    let mlStats = null;
    let mlStatusText = '⚠️ Disabled';
    if (mlIntegration) {
      try {
        mlStats = await mlIntegration.getStats();
        if (mlStats && mlStats.enabled) {
          const patternsCount = mlStats.spawn?.patternsLearned || 0;
          mlStatusText = patternsCount > 0
            ? `✅ Active - ${patternsCount} boss patterns learned`
            : `🟡 Learning - No patterns yet`;
        }
      } catch (mlError) {
        mlStatusText = `⚠️ Error: ${mlError.message}`;
      }
    }

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
        { name: "💰 Bidding System", value: biddingStatus, inline: false },
        { name: "🤖 ML Spawn Predictor", value: mlStatusText, inline: false }
      )
      .setFooter({ text: `Requested by ${member.user.username}` })
      .setTimestamp();

    await message.reply({ embeds: [embed] });
  },

  // =========================================================================
  // 8BALL COMMAND - Magic 8-Ball for fun predictions
  // =========================================================================
  eightball: async (message, member, args) => {
    const question = args && args.length > 0 ? args.join(" ") : null;

    if (!question) {
      return await message.reply("🎱 Magtanong ka muna! Usage: `!8ball <tanong mo>`");
    }

    const responses = [
      // Affirmative responses (Positive/Yes)
      "Oo naman! 💯",
      "Sure na sure! ✨",
      "100% yan! 🔥",
      "Tiwala lang! 💪",
      "Go na yan! 🚀",
      "Pwede na yan! 👍",
      "Sige, bakit hindi? 😎",
      "Aba oo! 🎉",
      "Syempre naman! ⭐",
      "Tapos na usapan! ✅",

      // Non-committal responses (Maybe/Uncertain)
      "Baka pwede, baka hindi 🤷",
      "Mamaya na tanong ulit 😅",
      "Di ko alam eh 🤔",
      "Bahala na si Batman 🦇",
      "Sige, isip muna 💭",
      "Antayin mo muna ⏳",
      "Hindi pa sure 😬",
      "Malay ko 🙃",
      "Baka bukas, hindi ngayon 📅",
      "Pakiulit nga tanong 🔄",

      // Negative responses (No/Doubtful)
      "Asa ka pa! 😂",
      "Wag na umasa 💔",
      "Hindi yan! ❌",
      "Dream on! 😴",
      "Malabo yan 🌫️",
      "Imposible! 🚫",
      "Wag kang umasa 🙅",
      "Forget it! 👋",
      "Hindi pwede ⛔",
      "Naku, wala yan 😬"
    ];

    const response = responses[Math.floor(Math.random() * responses.length)];

    await message.reply(`🎱 **${response}**`);
  },

  // =========================================================================
  // SLAP COMMAND - Slap someone with a random object
  // =========================================================================
  slap: async (message, member, args) => {
    const target = args && args.length > 0 ? args.join(" ") : null;

    if (!target) {
      return await message.reply("👋 Sino ba gusto mo sampalin? Usage: `!slap <tao o bagay>`");
    }

    // Load objects and actions from external JSON file for maintainability
    const objects = slapResponses.objects;
    const actions = slapResponses.actions;

    const object = objects[Math.floor(Math.random() * objects.length)];
    const action = actions[Math.floor(Math.random() * actions.length)];

    await message.reply(`👊 **${action} ${target}** gamit ang **${object}**!`);
  },

  // =========================================================================
  // STATS COMMAND - Show member statistics
  // =========================================================================
  // Replace the !stats command handler (around line 1380-1469)
stats: async (message, member, args) => {
  let targetMember = member;
  let targetName = member.displayName; // Use displayName for Google Sheets matching
  let matchInfo = null;

  // Parse target from args
  if (args.length > 0) {
    if (message.mentions.members.size > 0) {
      // @mention provided - highest priority
      targetMember = message.mentions.members.first();
      targetName = targetMember.displayName;
    } else {
      // User provided a name without @mention - use fuzzy matching
      const searchName = args.join(" ");
      const guild = message.guild;

      if (guild) {
        matchInfo = findBestMemberMatch(searchName, guild);

        if (matchInfo) {
          targetMember = matchInfo.member;
          targetName = matchInfo.matchedName;

          // Log match quality for debugging
          console.log(`🔍 Stats fuzzy match: "${searchName}" → "${targetName}" (${matchInfo.matchType}, ${matchInfo.confidence}% confidence)`);
        } else {
          // No match found - use raw search name for Google Sheets lookup
          targetName = searchName;
          targetMember = null;
          console.log(`⚠️ Stats: No Discord match found for "${searchName}", trying Google Sheets...`);
        }
      } else {
        targetName = searchName;
      }
    }
  }
  // If no args provided, show own stats (already set to member above)

  // Check cache first (use normalized name for cache key)
  const cacheKey = targetName.toLowerCase().trim();
  const cached = statsCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp < STATS_CACHE_DURATION)) {
    console.log(`📦 Using cached stats for ${targetName}`);
    
    // CRITICAL FIX: Try to find member by the actual name returned from sheets
    if (!targetMember && message.guild) {
      const actualName = cached.data.memberName;
      const foundMember = message.guild.members.cache.find(
        m => m.displayName.toLowerCase() === actualName.toLowerCase() ||
             m.user.username.toLowerCase() === actualName.toLowerCase()
      );
      if (foundMember) {
        targetMember = foundMember;
      }
    }
    
    const embed = buildStatsEmbed(cached.data, targetMember, 30);
    const statsMsg = await message.reply({ embeds: [embed] });

    // Start countdown deletion
    startCountdownDeletion(message, statsMsg, cached.data, targetMember, buildStatsEmbed, 30);

    return;
  }

  // Show loading message
  const loadingMsg = await message.reply(`⏳ Fetching stats for **${targetName}**...`);

  try {
    // Fetch stats from Google Sheets (with fuzzy matching support)
    const result = await sheetAPI.call('getMemberStats', { memberName: targetName });

    if (result.status !== 'ok') {
      await loadingMsg.edit(`❌ Could not find stats for **${targetName}**`);
      return;
    }

    // CRITICAL FIX: Get the actual member name returned from sheets (for fuzzy match cases)
    const actualMemberName = result.memberName;

    // CRITICAL FIX: Try to find the actual Discord member by the returned name
    if (message.guild) {
      const foundMember = message.guild.members.cache.find(
        m => m.displayName.toLowerCase() === actualMemberName.toLowerCase() ||
             m.user.username.toLowerCase() === actualMemberName.toLowerCase()
      );
      if (foundMember) {
        targetMember = foundMember;
        console.log(`✅ Found Discord member for ${actualMemberName}: ${foundMember.displayName}`);
      } else {
        console.log(`⚠️ Could not find Discord member for ${actualMemberName}, using original member`);
      }
    }

    // Cache the result (use the actual name from sheets for cache key)
    const actualCacheKey = actualMemberName.toLowerCase().trim();
    statsCache.set(actualCacheKey, {
      data: result,
      timestamp: Date.now()
    });

    // Build and send embed (now with proper targetMember for lore lookup)
    const embed = buildStatsEmbed(result, targetMember, 30);
    await loadingMsg.edit({ content: null, embeds: [embed] });

    // Start countdown deletion
    startCountdownDeletion(message, loadingMsg, result, targetMember, buildStatsEmbed, 30);

    console.log(`✅ Stats sent for ${actualMemberName} (searched: ${targetName})`);

  } catch (error) {
    console.error('Stats error:', error);
    await loadingMsg.edit("❌ Error fetching stats. Please try again later.");
  }
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
        `Click ✅ Confirm or ❌ Cancel button below.`,
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
        `\n\nClick ✅ Confirm or ❌ Cancel button below.\n\n` +
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

            // Check if there are any members to submit
            if (spawnInfo.members.length === 0) {
              // No members to submit - just close and archive the thread
              await message.channel.send(
                `   ├─ ⚠️ No members to submit (0 verified). Skipping Google Sheets submission...`
              );

              await thread
                .send(
                  `⚠️ Thread closed with no verified members. No data submitted to Google Sheets.`
                )
                .catch((err) =>
                  console.warn(
                    `⚠️ Could not post to spawn thread ${threadId}: ${err.message}`
                  )
                );

              // Close confirmation thread if it exists
              if (spawnInfo.confirmThreadId) {
                const confirmThread = await guild.channels
                  .fetch(spawnInfo.confirmThreadId)
                  .catch(() => null);
                if (confirmThread) {
                  await confirmThread
                    .send(
                      `⚠️ Spawn closed: **${spawnInfo.boss}** (${spawnInfo.timestamp}) - 0 members (no submission)`
                    )
                    .catch(() => {});
                  await errorHandler.safeDelete(confirmThread, 'message deletion');
                }
              }

              // Clean up reactions
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

              // Archive the thread
              await thread
                .setArchived(true, `Mass close by ${member.user.username}`)
                .catch(() => {});

              // Clean up state
              delete activeSpawns[threadId];
              delete activeColumns[`${spawnInfo.boss}|${spawnInfo.timestamp}`];
              delete confirmationMessages[threadId];

              successCount++;
              results.push(
                `⚠️ **${spawnInfo.boss}** - 0 members (thread closed, no submission)`
              );

              await message.channel.send(
                `   └─ ✅ **Thread closed!** (No submission - 0 members)`
              );

              console.log(
                `📍 Mass close: ${spawnInfo.boss} at ${spawnInfo.timestamp} (0 members - no submission)`
              );
            } else {
              // Members exist - check for duplicates before submitting
              const columnExists = await attendance.checkColumnExists(spawnInfo.boss, spawnInfo.timestamp);

              if (columnExists) {
                console.log(`⚠️ Duplicate prevented: ${spawnInfo.boss} at ${spawnInfo.timestamp} already exists`);

                await message.channel.send(
                  `   ⚠️ **Attendance already submitted!** Closing thread without duplicate submission.`
                );

                // Skip submission, just close and clean up
                if (spawnInfo.confirmThreadId) {
                  const confirmThread = await guild.channels
                    .fetch(spawnInfo.confirmThreadId)
                    .catch(() => null);
                  if (confirmThread) {
                    await confirmThread.send(
                      `⚠️ Duplicate prevented: **${spawnInfo.boss}** (${spawnInfo.timestamp})`
                    );
                    await errorHandler.safeDelete(confirmThread, 'message deletion');
                  }
                }

                await thread
                  .setLocked(true, `Mass locked by ${member.user.username} (duplicate prevented)`)
                  .catch(() => {});
                await thread
                  .setArchived(true, `Mass close by ${member.user.username} (duplicate prevented)`)
                  .catch(() => {});

                delete activeSpawns[threadId];
                delete activeColumns[`${spawnInfo.boss}|${spawnInfo.timestamp}`];
                delete confirmationMessages[threadId];

                successCount++;
                results.push(
                  `⚠️ **${spawnInfo.boss}** - Duplicate prevented (column already exists)`
                );

                console.log(
                  `📍 Mass close: ${spawnInfo.boss} at ${spawnInfo.timestamp} (duplicate prevented)`
                );
              } else {
                // No duplicate - proceed with submission
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
              // Auto-increment boss rotation if it's a rotating boss
              await bossRotation.handleBossKill(spawnInfo.boss);

              // Delete rotation warning message to avoid flooding
              await bossRotation.deleteRotationWarning(spawnInfo.boss);

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
              } // End of duplicate check else block
            } // End of members.length > 0 check

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
        `Click ✅ Confirm or ❌ Cancel button below.`,
      async (confirmMsg) => {
        // Check for duplicate column before submitting
        const columnExists = await attendance.checkColumnExists(spawnInfo.boss, spawnInfo.timestamp);

        if (columnExists) {
          console.log(`⚠️ Duplicate prevented: ${spawnInfo.boss} at ${spawnInfo.timestamp} already exists`);

          await message.channel.send(
            `⚠️ **Attendance already submitted for this spawn!**\n\n` +
              `Column already exists in Google Sheets. Submission cancelled to prevent duplicate.`
          );

          return;
        }

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
          // Auto-increment boss rotation if it's a rotating boss
          await bossRotation.handleBossKill(spawnInfo.boss);

          // Delete rotation warning message to avoid flooding
          await bossRotation.deleteRotationWarning(spawnInfo.boss);

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
        `Click ✅ Confirm or ❌ Cancel button below.`,
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
      // CRITICAL: Reschedule timers to reflect new endTime
      auctioneering.rescheduleItemTimers(client, config, message.channel);
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
          `Click ✅ End Session or ❌ Cancel button below.`
      )
      .setFooter({ text: `30 seconds to respond` })
      .setTimestamp();

    const confirmButton = new ButtonBuilder()
      .setCustomId(`endauction_confirm_${message.author.id}_${Date.now()}`)
      .setLabel('✅ End Session')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(false);

    const cancelButton = new ButtonBuilder()
      .setCustomId(`endauction_cancel_${message.author.id}_${Date.now()}`)
      .setLabel('❌ Cancel')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(false);

    const row = new ActionRowBuilder().addComponents(confirmButton, cancelButton);

    const confirmMsg = await message.reply({ embeds: [confirmEmbed], components: [row] });

    const collector = confirmMsg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 30000,
      filter: i => i.user.id === message.author.id
    });

    // Flag to prevent double execution
    let executed = false;

    collector.on('collect', async (interaction) => {
      // Prevent double execution
      if (executed) return;
      executed = true;

      const isConfirm = interaction.customId.startsWith('endauction_confirm_');

      const disabledRow = createDisabledRow(confirmButton, cancelButton);

      await interaction.update({ components: [disabledRow] });

      if (isConfirm) {
        // User confirmed - end the auction
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
        // User cancelled
        await message.reply(`❌ End auction canceled`);
      }

      collector.stop();
    });

    collector.on('end', async (collected, reason) => {
      if (reason === 'time' && collected.size === 0) {
        // Prevent double execution
        if (executed) return;
        executed = true;

        const disabledRow = createDisabledRow(confirmButton, cancelButton);

        await confirmMsg.edit({ components: [disabledRow] }).catch(() => {});
        await message.reply(`⏱️ Confirmation timeout - auction continues`);
      }
    });
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
    // Load timer-based bosses from configuration (these spawn during maintenance)
    // ENHANCED: Now dynamic and uses the same config as spawn predictions
    let maintenanceBosses = [];

    try {
      const bossSpawnConfig = intelligenceEngine.bossSpawnConfig;
      if (bossSpawnConfig && bossSpawnConfig.timerBasedBosses) {
        maintenanceBosses = Object.keys(bossSpawnConfig.timerBasedBosses);
        console.log(`[MAINTENANCE] Loaded ${maintenanceBosses.length} timer-based bosses from config`);
      } else {
        // Fallback to hardcoded list if config not available
        maintenanceBosses = [
          "Venatus", "Viorent", "Ego", "Livera", "Araneo", "Undomiel",
          "Lady Dalia", "General Aquleus", "Amentis", "Baron Braudmore",
          "Wannitas", "Metus", "Duplican", "Shuliar", "Gareth", "Titore",
          "Larba", "Catena", "Secreta", "Ordo", "Asta", "Supore",
        ];
        console.warn('[MAINTENANCE] Using fallback boss list - config not available');
      }
    } catch (error) {
      console.error('[MAINTENANCE] Error loading boss config:', error);
      // Use fallback list
      maintenanceBosses = [
        "Venatus", "Viorent", "Ego", "Livera", "Araneo", "Undomiel",
        "Lady Dalia", "General Aquleus", "Amentis", "Baron Braudmore",
        "Wannitas", "Metus", "Duplican", "Shuliar", "Gareth", "Titore",
        "Larba", "Catena", "Secreta", "Ordo", "Asta", "Supore",
      ];
    }

    // Show confirmation message
    await awaitConfirmation(
      message,
      member,
      `⚠️ **Spawn Maintenance Threads?**\n\n` +
        `This will create spawn threads for **${maintenanceBosses.length} bosses** that spawn during maintenance:\n\n` +
        `${maintenanceBosses.map((b, i) => `${i + 1}. ${b}`).join("\n")}\n\n` +
        `**Spawn time:** 5 minutes from now\n\n` +
        `Click ✅ Confirm or ❌ Cancel button below.`,
      async (confirmMsg) => {
        // Get current time + 5 minutes in Manila timezone (GMT+8)
        // IMPORTANT: Properly handle GMT+8 timezone conversion
        const futureTime = new Date(Date.now() + 5 * 60 * 1000);

        // Use Intl.DateTimeFormat to get components directly in Manila timezone
        const formatter = new Intl.DateTimeFormat('en-US', {
          timeZone: 'Asia/Manila',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        });

        const parts = formatter.formatToParts(futureTime);
        const year = parts.find(p => p.type === 'year').value;
        const month = parts.find(p => p.type === 'month').value;
        const day = parts.find(p => p.type === 'day').value;
        const hours = parts.find(p => p.type === 'hour').value;
        const minutes = parts.find(p => p.type === 'minute').value;
        const yearShort = year.slice(-2);

        // Format: MM/DD/YY HH:MM (required by createSpawnThreads)
        const formattedTimestamp = `${month}/${day}/${yearShort} ${hours}:${minutes}`;

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
            // Create the thread using attendance module with noAutoClose flag
            const result = await attendance.createSpawnThreads(
              client,
              bossName,
              `${month}/${day}/${yearShort}`,
              `${hours}:${minutes}`,
              formattedTimestamp,
              "manual",
              true  // noAutoClose = true for maintenance threads
            );

            if (result && result.success) {
              successCount++;
              results.push(`✅ ${bossName}`);
            } else {
              failCount++;
              const errorMsg = result && result.error ? result.error : 'Unknown error';
              results.push(`❌ ${bossName} - ${errorMsg}`);
            }

            // Small delay to avoid rate limits
            await new Promise((resolve) => setTimeout(resolve, 500));
          } catch (err) {
            failCount++;
            results.push(`❌ ${bossName} - ${err.message}`);
          }
        }

        // Send summary with truncation handling for Discord embed limits (max 1024 chars per field)
        let resultsText = results.join("\n");
        if (resultsText.length > 1024) {
          // Truncate and add "..." indicator
          resultsText = resultsText.substring(0, 1000) + "\n... (truncated)";
        }

        const summary = new EmbedBuilder()
          .setColor(successCount > 0 ? 0x00ff00 : 0xff0000)
          .setTitle(`✅ Maintenance Threads Created`)
          .setDescription(
            `**Success:** ${successCount}/${maintenanceBosses.length}\n` +
              `**Failed:** ${failCount}/${maintenanceBosses.length}`
          )
          .addFields({
            name: "📋 Results",
            value: resultsText || "No results",
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
        `Click ✅ Confirm or ❌ Cancel button below.`,
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
    console.log(`📅 ${member.user.username} manually triggered weekly report in channel: ${message.channel?.name || message.channel?.id}`);
    await message.reply({ content: "📊 Generating weekly report...", failIfNotExists: false });

    // Validate channel before passing
    if (!message.channel) {
      console.error('❌ message.channel is null/undefined');
      await message.reply({ content: "❌ Error: Unable to determine channel for report", failIfNotExists: false });
      return;
    }

    // Pass the channel where the command was invoked so report is sent only there
    await leaderboardSystem.sendWeeklyReport(message.channel);
  },

  monthlyreport: async (message, member) => {
    try {
      // Permission check is done in routing logic
      console.log(`📅 ${member.user.username} manually triggered monthly report`);

      const statusMsg = await message.reply({ content: "📊 Generating monthly report...", failIfNotExists: false });

      await leaderboardSystem.sendMonthlyReport();

      // Get both channel names for the confirmation message
      const [adminLogsChannel, guildChatChannel] = await Promise.all([
        client.channels.fetch(config.admin_logs_channel_id).catch(() => null),
        client.channels.fetch(config.elysium_commands_channel_id).catch(() => null)
      ]);

      const channels = [];
      if (adminLogsChannel) channels.push(`<#${adminLogsChannel.id}>`);
      if (guildChatChannel) channels.push(`<#${guildChatChannel.id}>`);

      const channelList = channels.length > 0 ? channels.join(' and ') : 'target channels';
      await statusMsg.edit({ content: `✅ Monthly report sent to ${channelList}!` }).catch(() => {});
      console.log(`✅ Monthly report command completed successfully`);
    } catch (error) {
      console.error(`❌ Error in monthlyreport command:`, error);
      await message.reply(`❌ Error generating monthly report: ${error.message}`).catch(() => {});
    }
  },

  // ==========================================
  // ACTIVITY HEATMAP COMMANDS
  // ==========================================

  activity: async (message, member) => {
    try {
      // Permission check is done in routing logic
      const args = message.content.trim().split(/\s+/).slice(1);
      const mode = args[0]?.toLowerCase();

      console.log(`📊 ${member.user.username} requested activity heatmap${mode ? ` (${mode})` : ''}`);
      await activityHeatmap.displayActivityHeatmap(message, mode);
      console.log(`✅ Activity heatmap command completed successfully`);
    } catch (error) {
      console.error(`❌ Error in activity command:`, error);
      await message.reply(`❌ Error generating activity heatmap: ${error.message}`).catch(() => {});
    }
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

    // If no args OR user says "my"/"me", check their own stats
    let username;
    if (args.length === 0 || ['my', 'me', 'myself'].includes(args[0]?.toLowerCase())) {
      // Use guild nickname (same as attendance system) or Discord username as fallback
      username = member.nickname || member.user.username;
      await message.reply(`🤖 Analyzing your engagement **${username}**...`);
    } else {
      username = args.join(' ');
      await message.reply(`🤖 Analyzing engagement for **${username}**...`);
    }

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
      const allAnomalies = [...biddingAnomalies.anomalies, ...attendanceAnomalies.anomalies];

      // Group by severity
      const highSeverity = allAnomalies.filter(a => a.severity === 'HIGH');
      const mediumSeverity = allAnomalies.filter(a => a.severity === 'MEDIUM');
      const lowSeverity = allAnomalies.filter(a => a.severity === 'LOW');

      // Determine embed color based on highest severity
      let embedColor = 0x00ff00; // Green (no issues)
      if (highSeverity.length > 0) embedColor = 0xff0000; // Red
      else if (mediumSeverity.length > 0) embedColor = 0xff9900; // Orange
      else if (lowSeverity.length > 0) embedColor = 0xffff00; // Yellow

      const embed = new EmbedBuilder()
        .setColor(embedColor)
        .setTitle(`🔍 Comprehensive Anomaly Detection Report`)
        .setDescription(
          totalAnomalies === 0
            ? '✅ **No anomalies detected!** All patterns appear normal.'
            : `⚠️ **${totalAnomalies} anomalies detected** - Review recommended.\n\n` +
              `**Severity Breakdown:**\n` +
              `🔴 High: ${highSeverity.length} | 🟠 Medium: ${mediumSeverity.length} | 🟡 Low: ${lowSeverity.length}`
        )
        .addFields({
          name: '💰 Bidding Analysis',
          value:
            `Auctions: ${biddingAnomalies.analyzed}\n` +
            `Members: ${biddingAnomalies.totalMembers || 'N/A'}\n` +
            `Issues: ${biddingAnomalies.anomaliesDetected}`,
          inline: true,
        })
        .addFields({
          name: '📊 Attendance Analysis',
          value:
            `Members: ${attendanceAnomalies.analyzed}\n` +
            `Avg Spawns: ${attendanceAnomalies.statistics.averageSpawns}\n` +
            `Issues: ${attendanceAnomalies.anomaliesDetected}`,
          inline: true,
        })
        .setFooter({ text: `Requested by ${member.user.username} • Powered by ML` })
        .setTimestamp();

      // HIGH SEVERITY ANOMALIES
      if (highSeverity.length > 0) {
        const highDetails = highSeverity
          .slice(0, 5)
          .map((a) => commandHandlers.formatAnomalyDetail(a))
          .join('\n\n');

        embed.addFields({
          name: `🔴 High Severity Issues (${highSeverity.length})`,
          value: highDetails + (highSeverity.length > 5 ? `\n\n*+${highSeverity.length - 5} more*` : ''),
          inline: false,
        });
      }

      // MEDIUM SEVERITY ANOMALIES
      if (mediumSeverity.length > 0) {
        const mediumDetails = mediumSeverity
          .slice(0, 5)
          .map((a) => commandHandlers.formatAnomalyDetail(a))
          .join('\n\n');

        embed.addFields({
          name: `🟠 Medium Severity Issues (${mediumSeverity.length})`,
          value: mediumDetails + (mediumSeverity.length > 5 ? `\n\n*+${mediumSeverity.length - 5} more*` : ''),
          inline: false,
        });
      }

      // LOW SEVERITY ANOMALIES (show fewer to avoid clutter)
      if (lowSeverity.length > 0) {
        const lowDetails = lowSeverity
          .slice(0, 3)
          .map((a) => commandHandlers.formatAnomalyDetail(a))
          .join('\n\n');

        embed.addFields({
          name: `🟡 Low Severity Issues (${lowSeverity.length})`,
          value: lowDetails + (lowSeverity.length > 3 ? `\n\n*+${lowSeverity.length - 3} more*` : ''),
          inline: false,
        });
      }

      // Add actionable recommendations
      if (totalAnomalies > 0) {
        const recommendations = [];
        if (highSeverity.length > 0) {
          recommendations.push('🔴 **Immediate action required for high severity issues**');
        }
        if (mediumSeverity.some(a => a.type === 'ATTENDANCE_BIDDING_MISMATCH')) {
          recommendations.push('📢 Send engagement reminders to inactive bidders');
        }
        if (lowSeverity.some(a => a.type === 'POINT_HOARDING')) {
          recommendations.push('💰 Remind members with unused points about upcoming auctions');
        }
        if (lowSeverity.some(a => a.type === 'SUDDEN_INACTIVITY')) {
          recommendations.push('📬 Check in with suddenly inactive members');
        }

        if (recommendations.length > 0) {
          embed.addFields({
            name: '💡 Recommended Actions',
            value: recommendations.slice(0, 4).join('\n'),
            inline: false,
          });
        }
      }

      await message.reply({ embeds: [embed] });
      console.log(`🤖 [INTELLIGENCE] Anomaly detection: ${totalAnomalies} anomalies found (H:${highSeverity.length} M:${mediumSeverity.length} L:${lowSeverity.length})`);
    } catch (error) {
      console.error('[INTELLIGENCE] Error detecting anomalies:', error);
      await message.reply(`❌ Error detecting anomalies: ${error.message}`);
    }
  },

  /**
   * Format anomaly detail for display
   */
  formatAnomalyDetail(anomaly) {
    const typeLabels = {
      COLLUSION_SUSPECTED: '🚨 Collusion Suspected',
      UNUSUAL_BID_AMOUNTS: '📊 Unusual Bid Amounts',
      FREQUENT_ITEM: '🔁 Frequent Item',
      POINT_HOARDING: '💰 Point Hoarding',
      HIGH_BIDDING_VELOCITY: '⚡ High Spending',
      UNUSUAL_ATTENDANCE: '📊 Unusual Attendance',
      ATTENDANCE_BIDDING_MISMATCH: '⚠️ Attendance-Bidding Mismatch',
      SUSPICIOUS_STREAK: '📅 Suspicious Streak',
      SUDDEN_ACTIVITY_SPIKE: '📈 Sudden Activity Spike',
      SUDDEN_INACTIVITY: '📉 Sudden Inactivity',
    };

    const label = typeLabels[anomaly.type] || anomaly.type;
    let detail = `**${label}**\n`;

    // Add description
    if (anomaly.description) {
      detail += `${anomaly.description}\n`;
    }

    // Add examples for UNUSUAL_BID_AMOUNTS
    if (anomaly.type === 'UNUSUAL_BID_AMOUNTS' && anomaly.examples) {
      const exampleText = anomaly.examples
        .map(ex => `  - ${ex.item}: ${ex.bid}pts (${ex.winner})`)
        .join('\n');
      detail += `Examples:\n${exampleText}\n`;
    }

    // Add recommendation
    if (anomaly.recommendation) {
      detail += `└ *${anomaly.recommendation}*`;
    }

    return detail;
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

      // Get unique items (deduplicate by item name, case-insensitive)
      const uniqueItemsMap = new Map();
      for (const item of queueItems) {
        const itemName = (item.item || 'Unknown').trim();
        const itemNameLower = itemName.toLowerCase();

        // Keep the first occurrence of each unique item name
        if (!uniqueItemsMap.has(itemNameLower)) {
          uniqueItemsMap.set(itemNameLower, {
            itemName,
            currentPrice: parseInt(item.startPrice) || 0
          });
        }
      }

      const uniqueItems = Array.from(uniqueItemsMap.values()).slice(0, 20); // Limit to 20 unique items
      console.log(`🤖 [INTELLIGENCE] Found ${uniqueItems.length} unique items (from ${queueItems.length} total)`);

      // Fetch auction history once for all items (optimization to avoid redundant API calls)
      console.log(`🤖 [INTELLIGENCE] Fetching auction history (1 API call for all items)...`);
      const auctionHistory = await intelligenceEngine.getAllAuctionHistory();

      // Analyze each unique item using cached auction history
      const analyses = [];
      for (const item of uniqueItems) {
        const prediction = await intelligenceEngine.predictItemValue(item.itemName, auctionHistory);

        analyses.push({
          itemName: item.itemName,
          currentPrice: item.currentPrice,
          prediction,
        });
      }

      // Create summary embed
      const totalItemsInQueue = queueItems.length;
      const uniqueItemsCount = uniqueItems.length;
      const duplicatesCount = totalItemsInQueue - uniqueItemsCount;

      const embed = new EmbedBuilder()
        .setColor(0x9b59b6)
        .setTitle(`💰 Auction Queue Analysis`)
        .setDescription(
          `AI price suggestions for **${uniqueItemsCount} unique items** in queue` +
          (duplicatesCount > 0 ? ` (${duplicatesCount} duplicates hidden)` : '') +
          `\n\n**How to use:** Manually adjust prices in Google Sheets > BiddingItems before starting auction`
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
          `Total Items in Queue: ${totalItemsInQueue}\n` +
          `Unique Items Analyzed: ${uniqueItemsCount}\n` +
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
   *
   * ENHANCED NLP: Automatically detects boss names from natural language
   * - "next spawn" or "!predictspawn" → predicts next boss to spawn
   * - "when Venatus spawn" or "!predictspawn Venatus" → predicts Venatus specifically
   */
  predictspawn: async (message, member) => {
    const messageContent = message.content.trim();
    let bossName = null;

    // Try to detect boss name from the message using fuzzy matching
    // This allows natural language like "when venatus spawn" or "kailan lalabas ego"
    const words = messageContent.split(/\s+/);

    for (let i = 0; i < words.length; i++) {
      // Try single words
      const match = findBossMatch(words[i], bossPoints);
      if (match) {
        bossName = match;
        console.log(`[PREDICTSPAWN] Detected boss "${bossName}" from word: "${words[i]}"`);
        break;
      }

      // Try two-word combinations (for bosses like "Lady Dalia", "Baron Braudmore")
      if (i < words.length - 1) {
        const twoWords = `${words[i]} ${words[i + 1]}`;
        const match2 = findBossMatch(twoWords, bossPoints);
        if (match2) {
          bossName = match2;
          console.log(`[PREDICTSPAWN] Detected boss "${bossName}" from phrase: "${twoWords}"`);
          break;
        }
      }

      // Try three-word combinations (for "General Aquleus")
      if (i < words.length - 2) {
        const threeWords = `${words[i]} ${words[i + 1]} ${words[i + 2]}`;
        const match3 = findBossMatch(threeWords, bossPoints);
        if (match3) {
          bossName = match3;
          console.log(`[PREDICTSPAWN] Detected boss "${bossName}" from phrase: "${threeWords}"`);
          break;
        }
      }
    }

    // Send initial analysis message with error handling for deleted messages
    try {
      await message.reply(
        bossName
          ? `🤖 Analyzing spawn patterns for **${bossName}**...`
          : `🤖 Analyzing general boss spawn patterns...`
      );
    } catch (replyError) {
      // If reply fails (message deleted), send to channel instead
      if (replyError.code === 50035 || replyError.code === 10008) {
        await message.channel.send(
          bossName
            ? `🤖 Analyzing spawn patterns for **${bossName}**...`
            : `🤖 Analyzing general boss spawn patterns...`
        );
      }
      // Continue even if initial message fails
    }

    try {
      const prediction = await intelligenceEngine.predictNextSpawnTime(bossName);

      // 🤖 ENHANCE WITH ML - Get tighter confidence windows and accuracy scoring
      // SKIP ML for schedule-based bosses (they use static 99% confidence)
      let mlEnhancement = null;
      if (mlIntegration && prediction && !prediction.error && prediction.spawnType !== 'schedule') {
        try {
          mlEnhancement = await mlIntegration.enhanceSpawnPrediction(
            prediction.bossName,
            prediction.lastSpawnTime,
            prediction.avgIntervalHours || 24
          );
          console.log(`[ML] Enhanced ${prediction.bossName}: ${mlEnhancement ? 'Success' : 'N/A'}`);
        } catch (mlError) {
          console.warn('[ML] Enhancement failed, using standard prediction:', mlError.message);
        }
      } else if (prediction && prediction.spawnType === 'schedule') {
        console.log(`[ML] Skipping ML enhancement for schedule-based boss: ${prediction.bossName} (using static 99% confidence)`);
      }

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
      const remainingMinutes = Math.floor((hoursUntil % 1) * 60);

      // Format time display: show minutes if < 1 hour
      let timeUntilText;
      if (daysUntil > 0) {
        timeUntilText = `${daysUntil}d ${remainingHours}h`;
      } else if (remainingHours > 0) {
        timeUntilText = `${remainingHours}h ${remainingMinutes}m`;
      } else {
        timeUntilText = `${remainingMinutes}m`;
      }

      // Build title based on whether specific boss or "next boss"
      const title = bossName
        ? `🔮 Boss Spawn Prediction: ${bossName}`
        : `🔮 Next Boss Spawn: ${prediction.bossName}`;

      const embed = new EmbedBuilder()
        .setColor(confidence >= 70 ? 0x00ff00 : confidence >= 50 ? 0xffff00 : 0xff9900)
        .setTitle(title)
        .setDescription(
          `🎯 **Predicted Next Spawn:** <t:${Math.floor(prediction.predictedTime.getTime() / 1000)}:F>\n` +
          `⏰ **Time Until Spawn:** ${timeUntilText}`
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
          // 🤖 ML CONFIDENCE WINDOW - Shows tighter time window from ML analysis
          ...(mlEnhancement && mlEnhancement.method === 'ml'
            ? [{
                name: '🤖 ML Window',
                value: `±${Math.round(mlEnhancement.confidenceInterval.windowMinutes / 2)}min (${(mlEnhancement.confidence * 100).toFixed(0)}%)`,
                inline: true,
              }]
            : []
          ),
          {
            name: '⏱️ Spawn Type',
            value: prediction.spawnType === 'schedule'
              ? '📅 Fixed Schedule'
              : prediction.usingConfiguredTimer
              ? '⏰ Timer-Based'
              : '📊 Historical Data',
            inline: true,
          },
          // Only show interval for non-schedule bosses
          ...(prediction.avgIntervalHours
            ? [{
                name: '⏱️ Avg Interval',
                value: `${prediction.avgIntervalHours.toFixed(1)} hours`,
                inline: true,
              }]
            : []
          ),
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
            value: mlEnhancement && mlEnhancement.method === 'ml'
              ? `🤖 **ML-Enhanced Prediction**\n` +
                `Spawn Window: ${new Date(mlEnhancement.confidenceInterval.earliest).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: config.timezone })} - ` +
                `${new Date(mlEnhancement.confidenceInterval.latest).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: config.timezone })}\n` +
                `✅ ML Model trained on ${mlEnhancement.stats?.sampleSize || prediction.basedOnSpawns} spawns\n` +
                `Accuracy: ${(mlEnhancement.confidence * 100).toFixed(0)}% confident based on historical variance`
              : prediction.spawnType === 'schedule'
              ? `**${prediction.bossName}** uses a fixed weekly schedule. ${prediction.scheduleInfo || 'Next spawn calculated from schedule.'}`
              : prediction.usingConfiguredTimer
              ? `**${prediction.bossName}** has a **${prediction.avgIntervalHours.toFixed(1)}-hour** spawn timer. Prediction blends configured timer with ${prediction.basedOnSpawns} historical spawns for accuracy.`
              : `Based on ${prediction.basedOnSpawns} historical spawns, the bot predicts **${prediction.bossName}** will spawn in approximately **${daysUntil > 0 ? `${daysUntil} days and ` : ''}${remainingHours} hours**.`,
            inline: false,
          }
        );

      // Add upcoming bosses info if available (only when no specific boss requested)
      if (!bossName && prediction.upcomingBosses && prediction.upcomingBosses.length > 0) {
        const upcomingText = prediction.upcomingBosses
          .map(boss => {
            const bossTime = new Date(boss.predictedTime);
            const hoursUntilBoss = (bossTime - now) / (1000 * 60 * 60);
            const daysUntilBoss = Math.floor(hoursUntilBoss / 24);
            const remainingHoursBoss = Math.floor(hoursUntilBoss % 24);
            const remainingMinutesBoss = Math.floor((hoursUntilBoss % 1) * 60);

            // Format time: show minutes if < 1 hour
            let timeText;
            if (daysUntilBoss > 0) {
              timeText = `${daysUntilBoss}d ${remainingHoursBoss}h`;
            } else if (remainingHoursBoss > 0) {
              timeText = `${remainingHoursBoss}h ${remainingMinutesBoss}m`;
            } else {
              timeText = `${remainingMinutesBoss}m`;
            }

            return `• **${boss.boss}** - in ~${timeText} (${boss.confidence.toFixed(0)}% confidence)`;
          })
          .join('\n');

        embed.addFields({
          name: '📅 Other Upcoming Bosses',
          value: upcomingText,
          inline: false,
        });
      }

      embed.setFooter({
        text: mlEnhancement && mlEnhancement.method === 'ml'
          ? `Requested by ${member.user.username} • 🤖 ML-Enhanced • ${(mlEnhancement.confidence * 100).toFixed(0)}% Accurate`
          : `Requested by ${member.user.username} • Intelligence Engine`
      }).setTimestamp();

      // Add boss image if available
      const bossImage = getBossImageAttachment(prediction.bossName);
      const bossImageURL = getBossImageAttachmentURL(prediction.bossName);
      if (bossImageURL) {
        embed.setThumbnail(bossImageURL);
      }

      // Prepare message payload with boss image attachment
      const messagePayload = { embeds: [embed] };
      if (bossImage) {
        messagePayload.files = [bossImage];
      }

      // Send prediction embed with error handling for deleted messages
      try {
        await message.reply(messagePayload);
      } catch (replyError) {
        // If reply fails (message deleted), send to channel instead
        if (replyError.code === 50035 || replyError.code === 10008) {
          await message.channel.send(messagePayload);
        } else {
          throw replyError;
        }
      }

      console.log(
        `🤖 [INTELLIGENCE] Spawn prediction for ${bossName || 'any boss'}: ` +
        `${prediction.bossName} at ${prediction.predictedTime.toISOString()} (${confidence.toFixed(1)}% confidence)`
      );
    } catch (error) {
      console.error('[INTELLIGENCE] Error predicting spawn:', error);

      // Send error message with fallback for deleted messages
      try {
        await message.reply(`❌ Error analyzing spawn data: ${error.message}`);
      } catch (replyError) {
        if (replyError.code === 50035 || replyError.code === 10008) {
          await message.channel.send(`❌ Error analyzing spawn data: ${error.message}`);
        }
        // Silently fail if both reply and send fail
      }
    }
  },

  // =========================================================================
  // STANDALONE EMERGENCY COMMAND HANDLERS
  // =========================================================================
  // These wrap the emergency-commands module for easier access

  /**
   * Force close a specific attendance thread
   * Usage: !forceclosethread | !fct
   */
  forceclosethread: async (message, member) => {
    await emergencyCommands.handleEmergencyCommand(message, ['close', message.channel.id]);
  },

  /**
   * Force close ALL attendance threads
   * Usage: !forcecloseallthreads | !fcat
   */
  forcecloseallthreads: async (message, member) => {
    await emergencyCommands.handleEmergencyCommand(message, ['closeall']);
  },

  /**
   * Force end stuck auction
   * Usage: !forceendauction | !fea
   */
  forceendauction: async (message, member) => {
    await emergencyCommands.handleEmergencyCommand(message, ['endauction']);
  },

  /**
   * Unlock all locked bidding points
   * Usage: !unlockallpoints | !unlock
   */
  unlockallpoints: async (message, member) => {
    await emergencyCommands.handleEmergencyCommand(message, ['unlock']);
  },

  /**
   * Clear all pending bid confirmations
   * Usage: !clearallbids | !clearbids
   */
  clearallbids: async (message, member) => {
    await emergencyCommands.handleEmergencyCommand(message, ['clearbids']);
  },

  /**
   * Show comprehensive state diagnostics
   * Usage: !diagnostics | !diag
   */
  diagnostics: async (message, member) => {
    await emergencyCommands.handleEmergencyCommand(message, ['diag']);
  },

  /**
   * Force sync state to Google Sheets
   * Usage: !forcesync | !fsync
   */
  forcesync: async (message, member) => {
    await emergencyCommands.handleEmergencyCommand(message, ['sync']);
  },

  /**
   * Test milestone checking system (manual trigger)
   * Usage: !testmilestones | !tm
   */
  testmilestones: async (message, member) => {
    try {
      await message.reply('🎯 Manually triggering milestone check...');
      await proactiveIntelligence.checkMilestones();
      await message.reply('✅ Milestone check complete! Check logs for details.');
    } catch (error) {
      console.error('[COMMAND] Error testing milestones:', error);
      await message.reply(`❌ Error: ${error.message}`);
    }
  },

  /**
   * Boss rotation management commands
   * Usage: !rotation status | !rotation set <boss> <index> | !rotation increment <boss>
   */
  rotation: async (message, member) => {
    if (!isAdmin(member)) {
      await message.reply('❌ Admin-only command.');
      return;
    }

    const args = message.content.trim().split(/\s+/).slice(1); // Remove "!rotation"
    const subcommand = args[0]?.toLowerCase();

    try {
      // !rotation status - Show all rotation statuses with ML predictions
      if (!subcommand || subcommand === 'status') {
        const rotations = await bossRotation.getAllRotations();
        const rotatingBosses = bossRotation.getRotatingBosses();

        if (Object.keys(rotations).length === 0) {
          await message.reply('⚠️ No rotation data available. BossRotation sheet may not be set up.');
          return;
        }

        const embed = new EmbedBuilder()
          .setColor(0x4a90e8)
          .setTitle('🔄 Boss Rotation Status')
          .setDescription('Current rotation for 5-guild system with ML-enhanced spawn predictions')
          .setTimestamp();

        for (const boss of rotatingBosses) {
          const rotation = rotations[boss];
          if (rotation) {
            const emoji = rotation.isOurTurn ? '🟢' : '🔴';
            const status = rotation.isOurTurn ? 'ELYSIUM\'S TURN' : `${rotation.currentGuild}'s turn`;

            // Get ML-enhanced spawn prediction
            let spawnInfo = '';
            try {
              const prediction = await intelligenceEngine.predictNextSpawnTime(boss);
              if (prediction && !prediction.error) {
                // Try to get ML enhancement (skip for schedule-based bosses)
                let mlEnhancement = null;
                if (mlIntegration && prediction.spawnType !== 'schedule') {
                  mlEnhancement = await mlIntegration.enhanceSpawnPrediction(
                    prediction.bossName,
                    prediction.lastSpawnTime,
                    prediction.avgIntervalHours || 24
                  );
                }

                const spawnTimestamp = Math.floor(prediction.predictedTime.getTime() / 1000);
                const mlWindow = mlEnhancement && mlEnhancement.method === 'ml'
                  ? ` (±${Math.round(mlEnhancement.confidenceInterval.windowMinutes / 2)}min 🤖)`
                  : '';

                spawnInfo = `\n📍 Next Spawn: <t:${spawnTimestamp}:R>${mlWindow}`;
              }
            } catch (predError) {
              // Silently skip prediction if it fails
              console.warn(`[Rotation] Failed to predict ${boss}:`, predError.message);
            }

            const guildCount = rotation.guilds ? rotation.guilds.length : 5;

            embed.addFields({
              name: `${emoji} ${boss}`,
              value: `Guild ${rotation.currentIndex}/${guildCount} - **${status}**\nNext: ${rotation.guilds[rotation.currentIndex % guildCount]}${spawnInfo}`,
              inline: false
            });
          }
        }

        await message.reply({ embeds: [embed] });
      }
      // !rotation set <boss> <index> - Manually set rotation
      else if (subcommand === 'set') {
        // Parse boss name (can be multi-word like "Baron Braudmore")
        // Last arg should be the index, everything else is the boss name
        if (args.length < 3) {
          await message.reply('❌ Usage: `!rotation set <boss> <index>`\nExample: `!rotation set Baron Braudmore 1`');
          return;
        }

        const newIndex = parseInt(args[args.length - 1]); // Last arg is the index
        const rawBossName = args.slice(1, -1).join(' '); // Everything between subcommand and index

        if (!rawBossName || isNaN(newIndex)) {
          await message.reply('❌ Usage: `!rotation set <boss> <index>`\nExample: `!rotation set Baron Braudmore 1`');
          return;
        }

        // Use fuzzy matching to find the correct boss name
        const bossName = findBossMatch(rawBossName, bossPoints);
        if (!bossName) {
          await message.reply(`❌ Unknown boss: "${rawBossName}"\n💡 Try: Amentis, Baron Braudmore, or General Aquleus`);
          return;
        }

        // Get rotation data to check guild count for this specific boss
        const rotations = await bossRotation.getAllRotations();
        const rotation = rotations[bossName];

        if (!rotation) {
          await message.reply(`❌ **${bossName}** is not a rotating boss`);
          return;
        }

        const guildCount = rotation.guilds ? rotation.guilds.length : 5;

        if (newIndex < 1 || newIndex > guildCount) {
          await message.reply(`❌ Index must be between 1 and ${guildCount} for **${bossName}** (${guildCount}-guild rotation)`);
          return;
        }

        await message.reply(`⚙️ Setting **${bossName}** rotation to index ${newIndex}...`);

        const result = await bossRotation.setRotation(bossName, newIndex);

        if (result.success) {
          const emoji = result.data.isOurTurn ? '🟢' : '🔴';
          const status = result.data.isOurTurn ? 'ELYSIUM\'S TURN' : `${result.data.currentGuild}'s turn`;
          await message.reply(
            `✅ **${bossName}** rotation set to index **${newIndex}**\n\n` +
            `${emoji} Status: **${status}**\n` +
            `Guild: ${result.data.currentGuild}`
          );
        } else {
          await message.reply(`❌ ${result.message}`);
        }
      }
      // !rotation increment <boss> - Manually advance rotation
      else if (subcommand === 'increment' || subcommand === 'inc') {
        // Parse boss name (can be multi-word like "Baron Braudmore")
        // Everything after the subcommand is the boss name
        if (args.length < 2) {
          await message.reply('❌ Usage: `!rotation increment <boss>`\nExample: `!rotation increment Baron Braudmore`');
          return;
        }

        const rawBossName = args.slice(1).join(' '); // Join all remaining args

        // Use fuzzy matching to find the correct boss name
        const bossName = findBossMatch(rawBossName, bossPoints);
        if (!bossName) {
          await message.reply(`❌ Unknown boss: "${rawBossName}"\n💡 Try: Amentis, Baron Braudmore, or General Aquleus`);
          return;
        }

        await message.reply(`🔄 Advancing **${bossName}** rotation...`);

        const result = await bossRotation.incrementRotation(bossName);

        if (result.updated !== false) {
          const emoji = result.isNowOurTurn ? '🟢' : '🔴';
          const status = result.isNowOurTurn ? 'ELYSIUM\'S TURN' : `${result.newGuild}'s turn`;
          await message.reply(
            `✅ **${bossName}** rotation advanced\n\n` +
            `${result.oldIndex} (${result.oldGuild}) → ${result.newIndex} (${result.newGuild})\n\n` +
            `${emoji} Status: **${status}**`
          );
        } else {
          await message.reply(`❌ ${bossName} is not a rotating boss or update failed`);
        }
      }
      // !rotation refresh - Force reload rotation data from Google Sheets
      else if (subcommand === 'refresh' || subcommand === 'reload') {
        await message.reply('🔄 Refreshing rotation data from Google Sheets...');

        await bossRotation.refreshRotationCache();

        const rotations = await bossRotation.getAllRotations();
        const rotatingBosses = bossRotation.getRotatingBosses();

        if (Object.keys(rotations).length === 0) {
          await message.reply('⚠️ No rotation data found after refresh. BossRotation sheet may not be set up.');
          return;
        }

        const embed = new EmbedBuilder()
          .setColor(0x00ff00)
          .setTitle('✅ Rotation Data Refreshed')
          .setDescription(`Loaded ${rotatingBosses.length} rotating bosses from Google Sheets`)
          .setTimestamp();

        for (const boss of rotatingBosses) {
          const rotation = rotations[boss];
          if (rotation) {
            const emoji = rotation.isOurTurn ? '🟢' : '🔴';
            const status = rotation.isOurTurn ? 'ELYSIUM\'S TURN' : `${rotation.currentGuild}'s turn`;
            embed.addFields({
              name: `${emoji} ${boss}`,
              value: `Guild ${rotation.currentIndex}/${rotation.guilds ? rotation.guilds.length : 5} - **${status}**`,
              inline: false
            });
          }
        }

        await message.reply({ embeds: [embed] });
      }
      else {
        await message.reply(
          `❌ Unknown subcommand: ${subcommand}\n\n` +
          `**Valid commands:**\n` +
          `• \`!rotation\` or \`!rotation status\` - Show all rotation statuses\n` +
          `• \`!rotation set <boss> <index>\` - Set rotation (1-5)\n` +
          `  Example: \`!rotation set Baron Braudmore 3\`\n` +
          `• \`!rotation increment <boss>\` - Advance rotation\n` +
          `  Example: \`!rotation inc General Aquleus\`\n` +
          `• \`!rotation refresh\` - Reload boss data from Google Sheets\n\n` +
          `💡 **Tip:** Boss names support fuzzy matching! Try "baron", "braud", or "aquleus"`
        );
      }
    } catch (error) {
      console.error('[ROTATION] Command error:', error);
      await message.reply(`❌ Error: ${error.message}`);
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
  console.log(`📊 Tracking ${Object.keys(bossPoints).length} bosses | Guild: ${config.main_guild_id} | Version: ${BOT_VERSION}`);

  // Attach config to client for module access
  client.config = config;

  // INITIALIZE DISCORD CHANNEL CACHE (60-80% API call reduction)
  discordCache = new DiscordCache(client, config);

  // INITIALIZE MULTI-LEVEL CACHE CLEANUP
  const cacheManager = require('./utils/cache-manager');
  cacheManager.startCacheCleanup();

  // INITIALIZE AUCTION CACHE (100% uptime guarantee)
  const auctionCache = require('./utils/auction-cache');
  await auctionCache.init();

  // INITIALIZE INTELLIGENCE ENGINE FIRST (needed by other modules)
  intelligenceEngine = new IntelligenceEngine(client, config, sheetAPI);

  // 🚀 AUTO-BOOTSTRAP LEARNING FROM HISTORY (First Deployment)
  try {
    const needsCheck = await sheetAPI.call('needsBootstrap', {});
    if (needsCheck.status === 'ok' && needsCheck.needsBootstrap) {
      console.log('🚀 [FIRST DEPLOYMENT] Bootstrapping learning system from historical data...');

      const bootstrapResult = await sheetAPI.call('bootstrapLearning', {});

      if (bootstrapResult.status === 'ok') {
        const { predictionsCreated, uniqueItems, averageAccuracy } = bootstrapResult;
        console.log(`✅ Bootstrap complete: ${predictionsCreated} predictions, ${uniqueItems} items, ${averageAccuracy}% accuracy`);

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
    }
  } catch (bootstrapError) {
    console.error('❌ Bootstrap check failed:', bootstrapError.message);
  }

  // INITIALIZE ALL MODULES IN CORRECT ORDER
  attendance.initialize(config, bossPoints, isAdmin, discordCache, intelligenceEngine);
  helpSystem.initialize(config, isAdmin, BOT_VERSION);
  auctioneering.initialize(config, isAdmin, bidding, discordCache, intelligenceEngine);
  bidding.initializeBidding(config, isAdmin, auctioneering, discordCache);
  auctioneering.setPostToSheet(attendance.postToSheet);
  emergencyCommands.initialize(config, attendance, bidding, auctioneering, isAdmin, discordCache);
  leaderboardSystem.init(client, config, discordCache);
  activityHeatmap.init(client, config);
  bossRotation.initialize(config, client, intelligenceEngine);
  proactiveIntelligence = new ProactiveIntelligence(client, config, intelligenceEngine);
  await proactiveIntelligence.initialize();
  nlpHandler = new NLPHandler(config);
  nlpLearningSystem = new NLPLearningSystem();
  await nlpLearningSystem.initialize(client);

  // Initialize ML Integration for enhanced spawn predictions and NLP
  console.log('🤖 Initializing ML Integration...');
  mlIntegration = new MLIntegration(config, sheetAPI);
  console.log('✅ ML Integration initialized - Learning from historical data...');

  console.log("🔄 Running state recovery...");
  isRecovering = true;

  await recoverBotStateOnStartup(client, config);
  const sweep1 = await attendance.recoverStateFromThreads(client);

  let sweep2LoadedState = false;
  if (!sweep1.success || sweep1.recovered === 0) {
    sweep2LoadedState = await attendance.loadAttendanceStateFromSheet();
  }

  const sweep3 = await attendance.validateStateConsistency(client);
  isRecovering = false;

  await cleanupStaleStatsMessages();

  const recoveryStatus = sweep1.recovered || 0;
  const discrepancies = sweep3 ?
    (sweep3.threadsWithoutColumns?.length || 0) +
    (sweep3.columnsWithoutThreads?.length || 0) +
    (sweep3.duplicateColumns?.length || 0) : 0;

  console.log(`✅ Recovery complete: ${recoveryStatus} spawns, ${discrepancies} discrepancies`);

  if (!sweep1.success || Object.keys(attendance.getActiveSpawns()).length === 0) {
    await attendance.loadAttendanceStateFromSheet();
  }

  await bidding.recoverBiddingState(client, config);
  attendance.schedulePeriodicStateSync();
  attendance.startAutoCloseScheduler(client);

  // Sync state references
  activeSpawns = attendance.getActiveSpawns();
  activeColumns = attendance.getActiveColumns();
  pendingVerifications = attendance.getPendingVerifications();
  pendingClosures = attendance.getPendingClosures();
  confirmationMessages = attendance.getConfirmationMessages();

  // START SCHEDULERS
  startBiddingChannelCleanupSchedule();
  leaderboardSystem.scheduleWeeklyReport();
  leaderboardSystem.scheduleMonthlyReport();
  auctioneering.scheduleWeeklySaturdayAuction(client, config);

  // Register GC task (every 5 minutes)
  if (global.gc) {
    let lastMemoryWarning = 0; // Track last memory warning to prevent log spam

    scheduler.registerTask('gc-management', async () => {
      const memUsage = process.memoryUsage();
      const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
      const heapTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
      const rssMB = Math.round(memUsage.rss / 1024 / 1024);
      const memoryPressure = (heapUsedMB / heapTotalMB) * 100;

      // Run garbage collection
      global.gc();

      // Reduced logging spam - only log if memory is critically high
      if (memoryPressure > 90 || rssMB > 400) {
        console.log(
          `🧹 GC: Heap ${heapUsedMB}MB/${heapTotalMB}MB (${Math.round(memoryPressure)}%) | RSS: ${rssMB}MB`
        );
      }

      // Aggressive GC if memory pressure is high (>85%)
      // Only log warning once per hour to reduce spam
      if (memoryPressure > 85) {
        const now = Date.now();
        const oneHour = 60 * 60 * 1000;

        if (now - lastMemoryWarning > oneHour) {
          console.warn(`⚠️ HIGH MEMORY PRESSURE (${Math.round(memoryPressure)}%) - Running aggressive GC`);
          lastMemoryWarning = now;
        }

        global.gc();
        global.gc(); // Second pass for aggressive collection
      }

      // Alert if approaching Koyeb 512MB limit (rate limited to once per hour)
      if (rssMB > 400) {
        const now = Date.now();
        const oneHour = 60 * 60 * 1000;

        if (now - lastMemoryWarning > oneHour) {
          console.error(`🚨 MEMORY ALERT: ${rssMB}MB RSS (Limit: 512MB) - Consider restarting`);
          lastMemoryWarning = now;
        }
      }
    }, 5 * 60 * 1000); // Every 5 minutes
  } else {
    console.warn("⚠️ Garbage collection not available. Run with --expose-gc flag.");
  }

  scheduler.startScheduler();

  await eventReminders.initializeEventReminders(client, config, sheetAPI, attendance);
  await crashRecovery.initialize(client, config);

  leaderboardSystem.init(client, config, discordCache, crashRecovery);
  scheduler.setCrashRecovery(crashRecovery);

  if (await crashRecovery.checkMissedWeeklyReport()) {
    await leaderboardSystem.sendWeeklyReport();
    await crashRecovery.markWeeklyReportCompleted();
  }

  console.log("✅ Bot ready for operations!");
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
    // ⚡ PERFORMANCE: Early returns for irrelevant messages
    // NOTE: Bot message filtering happens AFTER timer server check (line ~3888)
    // This allows timer bot to create spawn threads before being blocked
    if (!message.guild) return; // Skip DMs immediately
    if (message.guild.id !== config.main_guild_id && message.guild.id !== config.timer_server_id) return; // Skip wrong guild (allow timer server)

    // 🧠 NLP LEARNING: Passive learning from all messages (learns without responding)
    // Skip learning from bot messages
    if (nlpLearningSystem && !message.author.bot) {
      try {
        await nlpLearningSystem.learnFromMessage(message);
      } catch (error) {
        console.error(`❌ NLP Learning error: ${error.message}`);
      }
    }

    // 📊 ACTIVITY TRACKING: Track message for activity heatmap
    // Skip bot messages for more accurate member activity data
    if (activityHeatmap && !message.author.bot) {
      try {
        activityHeatmap.trackMessage(message);
      } catch (error) {
        console.error(`❌ Activity tracking error: ${error.message}`);
      }
    }

    // 🧹 BIDDING CHANNEL PROTECTION: Delete non-admin messages immediately
    // EXCEPT for member commands (!mypoints, !bidstatus, etc.)
    // Skip for bot messages (will be handled later)
    if (
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

          const result = await attendance.createSpawnThreads(
            client,
            bossName,
            dateStr,
            timeStr,
            fullTimestamp,
            "timer"
          );

          if (!result || !result.success) {
            const errorMsg = result && result.error ? result.error : 'Unknown error';
            console.error(`❌ Failed to create spawn thread for ${bossName}: ${errorMsg}`);
          } else {
            console.log(`✅ Successfully created spawn thread for ${bossName} (thread ID: ${result.threadId})`);
          }
        }
        return;
      }
    }

    // Second bot check after timer server handling
    // Allow bot messages in attendance threads (for other bots posting check-ins)
    // BUT process them separately and exit early (don't allow NLP/command processing)
    if (message.author.bot) {
      const inAttendanceThread = message.channel.isThread() &&
        message.channel.parentId === config.attendance_channel_id;
      if (inAttendanceThread) {
        // Bot messages in attendance threads are allowed for reading only
        // Don't process them further (no NLP, no commands, no responses)
        // Future: Add logic here to parse attendance data from bot messages
        return;
      }
      // All other bot messages are blocked
      return;
    }

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
    // Two-tier system:
    // 1. Learning system (mention-based activation, learns from all messages)
    // 2. Static handler (admin logs + auction threads)
    // Does NOT interfere with existing ! commands

    let nlpInterpretation = null;
    let usedLearningSystem = false;

    // PRIORITY CHECK: If message contains insults/roasts, skip command interpretation
    // and go straight to conversation handling to avoid misinterpreting roasts as commands
    const botMentioned = message.mentions.users.has(client.user.id);
    const contentLower = message.content.toLowerCase().trim();

    // Check if this is a reply to a bot message
    let isReplyToBot = false;
    if (message.reference && message.reference.messageId) {
      try {
        const repliedMessage = await message.channel.messages.fetch(message.reference.messageId);
        if (repliedMessage && repliedMessage.author.id === client.user.id) {
          isReplyToBot = true;
          console.log(`💬 [NLP] User replying to bot message - treating as conversation`);
        }
      } catch (error) {
        console.error('Error fetching replied message:', error);
      }
    }

    // Comprehensive insult pattern check (Filipino + English profanity and gaming taunts)
    // Covers: Core Filipino profanity, text speak (including "taena"), regional variants, gaming taunts, English insults
    const hasInsult = /(?:putang\s*ina|tang\s*ina|tangina|taena|ta\s*ena|tanginang|kinangina|king\s*ina|kingina|putangina|gago|gagong|gagohan|kagaguhan|ulol|kaulol|bobo|tanga|katangahan|fuck\s+you|fuck\s+off|fuck|hayop|hinayupak|buwisit|bwisit|bwiset|buset|bwesit|bweset|leche|peste|tarantado|puta|pokpok|kupal|pakyu|pakshet|pakingshet|amputa|amfuta|amshet|amshit|ampucha|amputcha|pucha|putcha|yawa|yawaa|yawaon|pisting|ungas|gunggong|ggng|gnggng|engot|shunga|timang|abnoy|hudas|lintik|punyeta|walanghiya|gaga|salot|tite|puke|kantot|supot|bruha|taong\s+grasa|basura|dumi|walang\s+(?:kwenta|silbi|utak|alam|breeding|modo|hiya)|inutil|squammy|skwater|epal|jejemon|jologs|baduy|cheap|mukhang\s+pera|buwakaw|bano|bwesit|hangal|mangmang|ignorante|palpak|sablay|bulok)/i.test(contentLower) ||
      /(?:tng\s*ina|tngnina|taena|t\s*ena|kngn|kngin|pksht|pkyou|fcku|gg0|bb0|tng4|g4g0|ul0l|b0b0|bno|bnong|ngng|nggg)/i.test(contentLower) ||
      /(?:atay|buang|bugo|ambak|giatay|unggoy|baboy|baboyan|pisot|ukinnam|agkakapuy|sakim|takla)/i.test(contentLower) ||
      /(?:shit|damn|ass|bitch|bastard|stupid|idiot|moron|dumb|retard|dumbass|smartass|jackass|asshole|dipshit|piece\s+of\s+shit|useless|trash|garbage|suck|pathetic|loser|clown|joke|waste|failure|disappointment|embarrassment)/i.test(contentLower) ||
      /(?:noob|nub|newb|scrub|weak|rekt|pwned|owned|destroyed|demolished|get\s+(?:rekt|good|gud|wrecked|destroyed|owned|pwned)|mad|salty|tilted|crying|cope|skill\s+issue|ratio|L\s+bozo|hardstuck|boosted|carried|bottom\s+tier|bronze|iron|wood|inting|feeding|griefing|trolling|throwing|cringe|washed|washed\s+up)/i.test(contentLower) ||
      /(?:mahina|duwag|talo|bugbug|bugbog|panalo|malas|walang\s+(?:laban|gana|skill|galing|diskarte)|ang\s+(?:weak|mahina|duwag|talo|bugbog|pangit|bano|bobo|tanga|gago|ulol)\s+mo|bugbog\s+sarado|talo\s+ka|wala\s+kang\s+laban|sablay\s+ka|noob\s+ka|newbie\s+ka|baguhan\s+ka|bobo\s+maglaro|lutang|hina|takot|daya|cheater|feeder|carry\s+mo|dala\s+mo|pasanin|deadweight|pabigat|lag|lagger|mabagal|masakit\s+sa\s+mata|nakakairita|one\s+trick|tryhard|smurf|booster|account\s+buyer)/i.test(contentLower) ||
      /(?:ez\s+lang|easy\s+lang|noob\s+naman|weak\s+naman|bano\s+naman|talo\s+na|bugbog\s+ka|walang\s+laban\s+yan|sablay\s+yarn|git\s+gud|get\s+good|mag\s+(?:practice|training)|balik\s+tutorial|GG\s+ez|gg\s+ka|talo\s+ka\s+na|sayang\s+effort|toxic\s+ka|salty\s+ka|bitter\s+ka|masakit\s+ba|hard\s+carry\s+mo|need\s+carry|pinapabuhat|pasan\s+ka|low\s+elo|trash\s+tier|baba\s+rank)/i.test(contentLower) ||
      /(?:you\s+(?:suck|are\s+(?:bad|trash|garbage|useless|stupid|dumb|weak))|bot\s+(?:sucks|is\s+bad|trash|useless|broken|stupid|bano|tanga|bobo)|your\s+(?:bot|system|code)\s+(?:sucks|trash|broken|pangit|bano)|worst\s+bot|trash\s+bot|useless\s+bot|bano\s+bot|tanga\s+bot|bot\s+mo\s+(?:bano|bobo|tanga|walang\s+kwenta)|buggy|laggy|error|broken|malfunction|crash|shit\s+bot)/i.test(contentLower) ||
      /(?:gago\s+ka|ulol\s+ka|bobo\s+ka|tanga\s+ka|supot\s+ka|bano\s+ka|engot\s+ka|gunggong\s+ka|abnoy\s+ka|timang\s+ka|hangal\s+ka|nakakahiya\s+ka|kahihiyan|basura\s+ka|dumi\s+ka|kingina\s+mo|tangina\s+mo|taena\s+mo|gago\s+ka\s+pala|mas\s+(?:bobo|tanga|bano|mahina|pangit)\s+ka\s+pa|parang\s+(?:bobo|tanga|bano|ungas|gago)\s+ka|mukhang\s+(?:bobo|tanga|gago|ungas|tae))/i.test(contentLower);

    // Check for laughter/reaction (common response to roasts)
    // Matches: HAHAHA, HEHEHEHE, LOL, LMAO, etc. (with 4+ repetitions for long laughs)
    const isLaughter = /^(?:[ha]{4,}|[he]{4,}|[hi]{4,}|[ho]{4,}|lol+|lmao+|rofl+|aha+ha+|ehe+he+|hue+|kek+|jaja+|jeje+|huhu+|wkwk+|😂+|🤣+|💀+|\s|!|\?|\.)*$/i.test(contentLower);

    // Laughter only treated as conversation if replying to bot (common reaction to roasts)
    const isLaughterReply = isLaughter && isReplyToBot;

    if ((hasInsult || isReplyToBot || isLaughterReply) && (botMentioned || isReplyToBot || isLaughterReply) && nlpLearningSystem) {
      // This is likely an insult/roast/laughter or reply to bot - handle as conversation, not command
      const detectionReason = isLaughterReply ? 'laughter reply' : (hasInsult ? 'insult pattern' : 'reply to bot');
      console.log(`🔥 [NLP] Detected ${detectionReason} - skipping command interpretation`);
      const conversationResponse = await nlpLearningSystem.handleConversation(message);

      if (conversationResponse) {
        console.log(`💬 [NLP Conversation] User: "${message.content.substring(0, 50)}..." → Roasting back`);
        await message.reply(conversationResponse).catch((error) => {
          console.error('❌ Error sending conversation response:', error);
        });
        return; // Return early - this was handled as conversation
      }
    }

    // Try learning system first (if bot is mentioned or in auction thread)
    if (nlpLearningSystem && !message.content.trim().startsWith('!')) {
      const shouldRespond = nlpLearningSystem.shouldRespond(message);

      if (shouldRespond) {
        nlpInterpretation = await nlpLearningSystem.interpretMessage(message);
        if (nlpInterpretation) {
          usedLearningSystem = true;
          const fuzzyInfo = nlpInterpretation.fuzzyMatch
            ? ` [fuzzy: "${nlpInterpretation.fuzzyMatch.matched}" ${nlpInterpretation.fuzzyMatch.similarity}]`
            : '';
          console.log(`🧠 [NLP Learning] Interpreted: "${message.content}" → ${nlpInterpretation.command} (confidence: ${nlpInterpretation.confidence.toFixed(2)})${fuzzyInfo}`);
        }
      }
    }

    // Fall back to static handler if learning system didn't interpret
    if (!nlpInterpretation && nlpHandler && !message.content.trim().startsWith('!')) {
      nlpInterpretation = nlpHandler.interpretMessage(message);

      if (nlpInterpretation) {
        console.log(`💬 [NLP Static] Interpreted: "${message.content}" → ${nlpInterpretation.command}`);
      }
    }

    // Apply interpretation if found
    if (nlpInterpretation) {
      // Convert natural language to command format
      // This allows the rest of the system to process it normally
      const params = nlpInterpretation.params.join(' ');
      message.content = `${nlpInterpretation.command}${params ? ' ' + params : ''}`;

      // Optional: Send brief feedback for non-bid commands
      if (!usedLearningSystem && nlpHandler) {
        const contextMessage = nlpHandler.getContextMessage(nlpInterpretation.command, message);
        if (contextMessage) {
          await message.reply(contextMessage).catch(() => {});
        }
      }
    } else {
      // No command found - check if bot was mentioned for conversation
      const botMentioned = message.mentions.users.has(client.user.id);

      if (botMentioned && nlpLearningSystem && !message.content.trim().startsWith('!')) {
        // Bot was tagged but no command recognized - engage in conversation
        const conversationResponse = await nlpLearningSystem.handleConversation(message);

        if (conversationResponse) {
          console.log(`💬 [NLP Conversation] User: "${message.content.substring(0, 50)}..." → Responding`);
          await message.reply(conversationResponse).catch((error) => {
            console.error('❌ Error sending conversation response:', error);
          });

          // Return early - this was a conversation, not a command
          return;
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

    // New member guide (anyone can use, anywhere except spawn threads)
    if (resolvedCmd === "!newmember") {
      if (
        message.channel.isThread() &&
        message.channel.parentId === config.attendance_channel_id
      ) {
        await message.reply(
          "⚠️ Please use `!newmember` in guild chat or admin logs to avoid cluttering spawn threads."
        );
        return;
      }
      await commandHandlers.newmember(message, member);
      return;
    }

    // Leaderboard commands (admin only OR ELYSIUM role in ELYSIUM commands channel, anywhere except spawn threads)
    if (
      resolvedCmd === "!leaderboardattendance" ||
      resolvedCmd === "!leaderboardbidding" ||
      resolvedCmd === "!leaderboards" ||
      resolvedCmd === "!weeklyreport" ||
      resolvedCmd === "!monthlyreport" ||
      resolvedCmd === "!activity"
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
      } else if (resolvedCmd === "!monthlyreport") {
        await commandHandlers.monthlyreport(message, member);
      } else if (resolvedCmd === "!activity") {
        await commandHandlers.activity(message, member);
      }
      return;
    }

    // =========================================================================
    // INTELLIGENCE ENGINE COMMANDS - Member-Accessible (Guild Chat + Admin Logs)
    // =========================================================================
    // Member-friendly prediction & analytics commands
    if (
      resolvedCmd === "!predictprice" ||
      resolvedCmd === "!predictspawn" ||
      resolvedCmd === "!predictattendance" ||
      resolvedCmd === "!engagement" ||
      resolvedCmd === "!analyzeengagement"
    ) {
      // Check permissions: either admin OR ELYSIUM role in allowed channels
      const inAllowedChannel = inElysiumCommandsChannel || inAdminLogs;
      const hasPermission = userIsAdmin || (hasElysiumRole(member) && inAllowedChannel);

      if (!hasPermission) {
        await message.reply(
          "❌ Intelligence commands are available to ELYSIUM members in guild chat or admin logs.\n" +
          "💡 **Tip:** Mention me in guild chat (e.g., `@bot when is next spawn?`)"
        );
        return;
      }

      // Don't clutter spawn threads
      if (
        message.channel.isThread() &&
        message.channel.parentId === config.attendance_channel_id
      ) {
        await message.reply(
          "⚠️ Please use intelligence commands in guild chat or admin logs to avoid cluttering spawn threads."
        );
        return;
      }

      // Route to appropriate command handler
      if (resolvedCmd === "!predictprice") {
        await commandHandlers.predictprice(message, member);
      } else if (resolvedCmd === "!predictspawn") {
        await commandHandlers.predictspawn(message, member);
      } else if (resolvedCmd === "!predictattendance") {
        await commandHandlers.predictattendance(message, member);
      } else if (resolvedCmd === "!engagement") {
        await commandHandlers.engagement(message, member);
      } else if (resolvedCmd === "!analyzeengagement") {
        await commandHandlers.analyzeengagement(message, member);
      }
      return;
    }

    // =========================================================================
    // INTELLIGENCE ENGINE COMMANDS - Admin Only
    // =========================================================================
    // Advanced admin tools (fraud detection, performance, bootstrapping)
    if (
      resolvedCmd === "!detectanomalies" ||
      resolvedCmd === "!recommendations" ||
      resolvedCmd === "!performance" ||
      resolvedCmd === "!analyzequeue" ||
      resolvedCmd === "!bootstraplearning" ||
      resolvedCmd === "!rotation"
    ) {
      if (!userIsAdmin) {
        await message.reply("❌ This intelligence command is admin-only.");
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
      if (resolvedCmd === "!detectanomalies") {
        await commandHandlers.detectanomalies(message, member);
      } else if (resolvedCmd === "!recommendations") {
        await commandHandlers.recommendations(message, member);
      } else if (resolvedCmd === "!performance") {
        await commandHandlers.performance(message, member);
      } else if (resolvedCmd === "!analyzequeue") {
        await commandHandlers.analyzequeue(message, member);
      } else if (resolvedCmd === "!bootstraplearning") {
        await commandHandlers.bootstraplearning(message, member);
      } else if (resolvedCmd === "!rotation") {
        await commandHandlers.rotation(message, member);
      }
      return;
    }

    // =========================================================================
    // NLP LEARNING SYSTEM COMMANDS (Admin only)
    // =========================================================================
    if (
      resolvedCmd === "!nlpstats" ||
      resolvedCmd === "!unrecognized" ||
      resolvedCmd === "!learned" ||
      resolvedCmd === "!teachbot" ||
      resolvedCmd === "!clearlearned" ||
      resolvedCmd === "!nlpunhide" ||
      resolvedCmd === "!myprofile"
    ) {
      if (!userIsAdmin && resolvedCmd !== "!myprofile") {
        await message.reply("❌ NLP admin commands are admin-only. Use `!myprofile` to see your learning profile.");
        return;
      }

      if (
        message.channel.isThread() &&
        message.channel.parentId === config.attendance_channel_id
      ) {
        await message.reply(
          "⚠️ Please use NLP commands in admin logs channel to avoid cluttering spawn threads."
        );
        return;
      }

      if (!nlpLearningSystem) {
        await message.reply("❌ NLP Learning System is not initialized.");
        return;
      }

      // Import and route to NLP admin command handlers
      const nlpAdminCommands = require('./nlp-admin-commands.js');
      const args = message.content.trim().split(/\s+/).slice(1);

      if (resolvedCmd === "!nlpstats") {
        await nlpAdminCommands.showNLPStats(message, nlpLearningSystem);
      } else if (resolvedCmd === "!unrecognized") {
        await nlpAdminCommands.showUnrecognized(message, nlpLearningSystem);
      } else if (resolvedCmd === "!learned") {
        await nlpAdminCommands.showLearned(message, nlpLearningSystem);
      } else if (resolvedCmd === "!teachbot") {
        await nlpAdminCommands.teachBot(message, args, nlpLearningSystem);
      } else if (resolvedCmd === "!clearlearned") {
        await nlpAdminCommands.clearLearned(message, args, nlpLearningSystem);
      } else if (resolvedCmd === "!nlpunhide") {
        await nlpAdminCommands.unhideNLPTabs(message, sheetAPI);
      } else if (resolvedCmd === "!myprofile") {
        await nlpAdminCommands.showMyProfile(message, nlpLearningSystem);
      }
      return;
    }

    // =========================================================================
    // SPAWN THREAD CHECK-IN SYSTEM
    // =========================================================================
    // Handles member attendance in spawn threads
    // Keywords: "present", "here", "join", "checkin", "check-in"
    // Also handles common misspellings with fuzzy matching
    if (
      message.channel.isThread() &&
      message.channel.parentId === config.attendance_channel_id
    ) {
      // Sync state from attendance module to get latest data
      activeSpawns = attendance.getActiveSpawns();
      pendingVerifications = attendance.getPendingVerifications();

      const content = message.content.trim().toLowerCase();
      const keyword = content.split(/\s+/)[0];

      // Helper function: Check if keyword matches attendance keywords (with fuzzy matching)
      const isAttendanceKeyword = (word) => {
        // Exact matches
        const exactKeywords = ["present", "here", "join", "checkin", "check-in", "attending"];
        if (exactKeywords.includes(word)) return true;

        // Common misspellings (comprehensive list)
        const misspellings = {
          // "present" misspellings
          "prsnt": "present", "presnt": "present", "presen": "present",
          "preent": "present", "prsetn": "present", "preasent": "present",
          "prasent": "present", "presemt": "present", "presetn": "present",
          "prresent": "present", "pressent": "present", "prezent": "present",
          "prsnts": "present", "prsntt": "present", "pesent": "present",
          "prsent": "present", "prresent": "present",

          // "here" misspellings
          "hre": "here", "her": "here", "heer": "here", "herre": "here",
          "heere": "here", "hrre": "here", "hhere": "here",

          // "attending" misspellings
          "atending": "attending", "attending": "attending", "attnding": "attending",
          "attendng": "attending", "attening": "attending", "atending": "attending",
          "attednign": "attending", "attneding": "attending",

          // "join" misspellings
          "jon": "join", "jion": "join", "jojn": "join", "joiin": "join",

          // "checkin" misspellings
          "chekin": "checkin", "chckin": "checkin", "checkn": "checkin",
          "checin": "checkin", "chkin": "checkin"
        };

        if (misspellings[word]) {
          console.log(`✏️ Auto-corrected "${word}" → "${misspellings[word]}"`);
          return true;
        }

        // Levenshtein distance check for close matches (1-2 character difference)
        const calculateDistance = (a, b) => {
          const matrix = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(null));

          for (let i = 0; i <= a.length; i++) matrix[0][i] = i;
          for (let j = 0; j <= b.length; j++) matrix[j][0] = j;

          for (let j = 1; j <= b.length; j++) {
            for (let i = 1; i <= a.length; i++) {
              const indicator = a[i - 1] === b[j - 1] ? 0 : 1;
              matrix[j][i] = Math.min(
                matrix[j][i - 1] + 1,
                matrix[j - 1][i] + 1,
                matrix[j - 1][i - 1] + indicator
              );
            }
          }

          return matrix[b.length][a.length];
        };

        // Check distance to each keyword (allow 1-2 character difference)
        for (const validKeyword of exactKeywords) {
          const distance = calculateDistance(word, validKeyword);
          if (distance <= 2 && word.length >= 3) {
            console.log(`✏️ Fuzzy matched "${word}" → "${validKeyword}" (distance: ${distance})`);
            return true;
          }
        }

        return false;
      };

      // Check if message is a check-in keyword (with fuzzy matching)
      if (isAttendanceKeyword(keyword)) {
        // Ignore bot check-ins (bots can't attend spawns)
        // This allows reading bot messages in threads without letting them check in
        if (message.author.bot) return;

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

        const statusText = userIsAdmin
          ? `⏩ **${username}** (Admin) registered for **${spawnInfo.boss}**\n\nFast-track verification (no screenshot required)...`
          : `⏳ **${username}** registered for **${spawnInfo.boss}**\n\nWaiting for admin verification...`;

        const embed = new EmbedBuilder()
          .setColor(userIsAdmin ? 0x00ff00 : 0xffa500)
          .setDescription(statusText)
          .setFooter({ text: "Admins: Click a button to verify or deny" });

        // Create buttons for admin approval
        const approveButton = new ButtonBuilder()
          .setCustomId(`verify_approve_${message.id}_${Date.now()}`)
          .setLabel('✅ Verify')
          .setStyle(ButtonStyle.Success)
          .setDisabled(false);

        const denyButton = new ButtonBuilder()
          .setCustomId(`verify_deny_${message.id}_${Date.now()}`)
          .setLabel('❌ Deny')
          .setStyle(ButtonStyle.Danger)
          .setDisabled(false);

        const row = new ActionRowBuilder().addComponents(approveButton, denyButton);

        const verificationMsg = await message.reply({ embeds: [embed], components: [row] });

        // Track pending verification in state
        pendingVerifications[message.id] = {
          author: username,
          authorId: message.author.id,
          threadId: message.channel.id,
          timestamp: Date.now(),
          verificationMsgId: verificationMsg.id,
        };
        attendance.setPendingVerifications(pendingVerifications);

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
            `\n\nClick ✅ Confirm or ❌ Cancel button below.`,
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

              // Remove/disable verification buttons from the bot's reply message
              if (pending.verificationMsgId) {
                const verificationMsg = await message.channel.messages
                  .fetch(pending.verificationMsgId)
                  .catch(() => null);
                if (verificationMsg && verificationMsg.components.length > 0) {
                  await verificationMsg.edit({ components: [] }).catch(() => {});
                }
              }

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

        // Find and disable verification buttons for this user
        const pendingInThread = Object.entries(pendingVerifications).filter(
          ([msgId, p]) => p.threadId === message.channel.id && normalizeUsername(p.author) === normalizeUsername(username)
        );

        for (const [msgId, pending] of pendingInThread) {
          if (pending.verificationMsgId) {
            const verificationMsg = await message.channel.messages
              .fetch(pending.verificationMsgId)
              .catch(() => null);
            if (verificationMsg && verificationMsg.components.length > 0) {
              await verificationMsg.edit({ components: [] }).catch(() => {});
            }
          }
          delete pendingVerifications[msgId];
        }
        attendance.setPendingVerifications(pendingVerifications);

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
          // Limit to first 10 to avoid exceeding 2000 char Discord message limit
          const maxShow = 10;
          const toShow = pendingInThread.slice(0, maxShow);
          const remaining = pendingInThread.length - maxShow;

          const pendingList = toShow
            .map(([msgId, p]) => {
              const messageLink = `https://discord.com/channels/${guild.id}/${message.channel.id}/${msgId}`;
              return `• **${p.author}** - [View](${messageLink})`;
            })
            .join("\n");

          let warningMessage =
            `⚠️ **Cannot close spawn!**\n\n` +
            `There are **${pendingInThread.length} pending verification(s)**:\n\n` +
            `${pendingList}`;

          if (remaining > 0) {
            warningMessage += `\n\n...and **${remaining} more**.`;
          }

          warningMessage +=
            `\n\nPlease verify (✅) or deny (❌) all check-ins first, then type \`close\` again.\n\n` +
            `💡 Or use \`!resetpending\` to clear them.`;

          await message.reply(warningMessage);
          return;
        }

        const closeEmbed = new EmbedBuilder()
          .setColor(0xffa500)
          .setTitle('🔒 Close Spawn Confirmation')
          .setDescription(
            `Close spawn **${spawnInfo.boss}** (${spawnInfo.timestamp})?\n\n` +
            `**${spawnInfo.members.length} members** will be submitted to Google Sheets.`
          )
          .setFooter({ text: 'Click a button to confirm or cancel' });

        // Create buttons for confirmation
        const confirmButton = new ButtonBuilder()
          .setCustomId(`close_confirm_${message.author.id}_${Date.now()}`)
          .setLabel('✅ Confirm')
          .setStyle(ButtonStyle.Success)
          .setDisabled(false);

        const cancelButton = new ButtonBuilder()
          .setCustomId(`close_cancel_${message.author.id}_${Date.now()}`)
          .setLabel('❌ Cancel')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(false);

        const row = new ActionRowBuilder().addComponents(confirmButton, cancelButton);

        const confirmMsg = await message.reply({ embeds: [closeEmbed], components: [row] });

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

        spawnInfo.closed = true;

        // Check for duplicate column before submitting
        const columnExists = await attendance.checkColumnExists(spawnInfo.boss, spawnInfo.timestamp);

        if (columnExists) {
          console.log(`⚠️ Duplicate prevented: ${spawnInfo.boss} at ${spawnInfo.timestamp} already exists`);

          await message.reply(
            `⚠️ **Attendance already submitted for this spawn!**\n\n` +
              `Column already exists in Google Sheets. Closing thread without duplicate submission.`
          );

          // Skip submission, just close and clean up
          if (spawnInfo.confirmThreadId) {
            const confirmThread = await guild.channels
              .fetch(spawnInfo.confirmThreadId)
              .catch(() => null);
            if (confirmThread) {
              await confirmThread.send(
                `⚠️ Duplicate prevented: **${spawnInfo.boss}** (${spawnInfo.timestamp}) - Column already exists`
              );
              await confirmThread.delete().catch(console.error);
            }
          }

          await message.channel
            .setLocked(true, `Force locked by ${message.author.username} (duplicate prevented)`)
            .catch(console.error);
          await message.channel
            .setArchived(true, `Force closed by ${message.author.username} (duplicate prevented)`)
            .catch(console.error);

          delete activeSpawns[message.channel.id];
          delete activeColumns[`${spawnInfo.boss}|${spawnInfo.timestamp}`];
          delete confirmationMessages[message.channel.id];

          attendance.setActiveSpawns(activeSpawns);
          attendance.setActiveColumns(activeColumns);
          attendance.setConfirmationMessages(confirmationMessages);

          return;
        }

        await message.reply(
          `⚠️ **FORCE CLOSING** spawn **${spawnInfo.boss}**...\n` +
            `Submitting ${spawnInfo.members.length} members (ignoring ${pendingInThread.length} pending verifications)`
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
          // Auto-increment boss rotation if it's a rotating boss
          await bossRotation.handleBossKill(spawnInfo.boss);

          // Delete rotation warning message to avoid flooding
          await bossRotation.deleteRotationWarning(spawnInfo.boss);

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

          // Lock and archive the thread to prevent spam
          await message.channel
            .setLocked(true, `Force locked by ${message.author.username}`)
            .catch(console.error);
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

    // =========================================================================
    // MEMBER COMMANDS IN ELYSIUM COMMANDS CHANNEL (Guild Chat)
    // =========================================================================
    // Fun commands available to all members in guild chat
    if (inElysiumCommandsChannel) {
      const memberCmd = resolveCommandAlias(rawCmd);
      const args = message.content.trim().split(/\s+/).slice(1);

      // !8ball command - Magic 8-Ball predictions
      if (memberCmd === "!eightball") {
        console.log(`🎱 8ball command detected in guild chat by ${member.user.username}`);
        await commandHandlers.eightball(message, member, args);
        return;
      }

      // !slap command - Slap someone with a random object
      if (memberCmd === "!slap") {
        console.log(`👊 Slap command detected in guild chat by ${member.user.username}`);
        await commandHandlers.slap(message, member, args);
        return;
      }

      // !stats command - Show member statistics
      if (memberCmd === "!stats") {
        console.log(`📊 Stats command detected in guild chat by ${member.user.username}`);
        await commandHandlers.stats(message, member, args);
        return;
      }
    }

    // Admin-only commands in admin logs
    if (!userIsAdmin) return;

    if (inAdminLogs) {
      const adminCmd = resolveCommandAlias(rawCmd);
      const args = message.content.trim().split(/\s+/).slice(1);

      // LOOT COMMAND - DISABLED (manual loot entry now used)
      // const lootCmd = resolveCommandAlias(rawCmd);
      // if (lootCmd === "!loot") {
      //   console.log(`🎯 Loot command detected`);
      //   await lootSystem.handleLootCommand(
      //     message,
      //     message.content.trim().split(/\s+/).slice(1),
      //     client
      //   );
      //   return;
      // }

      // Admin logs override commands
      if (
        [
          "!clearstate",
          "!status",
          "!closeallthread",
          "!emergency",
          "!maintenance",
          "!removemember",
          "!forceclosethread",
          "!forcecloseallthreads",
          "!forceendauction",
          "!unlockallpoints",
          "!clearallbids",
          "!diagnostics",
          "!forcesync",
          "!testmilestones",
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
        // Standalone emergency commands
        else if (adminCmd === "!forceclosethread")
          await commandHandlers.forceclosethread(message, member);
        else if (adminCmd === "!forcecloseallthreads")
          await commandHandlers.forcecloseallthreads(message, member);
        else if (adminCmd === "!forceendauction")
          await commandHandlers.forceendauction(message, member);
        else if (adminCmd === "!unlockallpoints")
          await commandHandlers.unlockallpoints(message, member);
        else if (adminCmd === "!clearallbids")
          await commandHandlers.clearallbids(message, member);
        else if (adminCmd === "!diagnostics")
          await commandHandlers.diagnostics(message, member);
        else if (adminCmd === "!forcesync")
          await commandHandlers.forcesync(message, member);
        else if (adminCmd === "!testmilestones")
          await commandHandlers.testmilestones(message, member);
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
          "!fixlockedpoints",
          "!auctionaudit",
          "!resetauction",
          "!recoverauction",
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

        const result = await attendance.createSpawnThreads(
          client,
          bossName,
          dateStr,
          timeStr,
          fullTimestamp,
          "timer"
        );

        if (!result || !result.success) {
          const errorMsg = result && result.error ? result.error : 'Unknown error';
          await message.reply(
            `❌ **Failed to create spawn thread!**\n\n` +
              `**Boss:** ${bossName}\n` +
              `**Time:** ${fullTimestamp}\n` +
              `**Error:** ${errorMsg}\n\n` +
              `Please try again or contact an admin.`
          );
          console.error(`❌ Failed to create manual spawn thread for ${bossName}: ${errorMsg}`);
          return;
        }

        await message.reply(
          `✅ **Spawn thread created successfully!**\n\n` +
            `**Boss:** ${bossName}\n` +
            `**Time:** ${fullTimestamp}\n` +
            `**Thread ID:** ${result.threadId}\n\n` +
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
 * BUTTON INTERACTION EVENT HANDLER
 * =========================================================================
 *
 * Handles button interactions for:
 * - Attendance verification (✅ Verify / ❌ Deny)
 * - Thread closure confirmation (✅ Confirm / ❌ Cancel)
 */
client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (!interaction.isButton()) return;
    if (!interaction.message.guild) return;
    if (interaction.message.guild.id !== config.main_guild_id) return;

    const customId = interaction.customId;
    const user = interaction.user;
    const msg = interaction.message;
    const guild = interaction.guild;

    // Sync state from attendance module
    activeSpawns = attendance.getActiveSpawns();
    pendingVerifications = attendance.getPendingVerifications();
    pendingClosures = attendance.getPendingClosures();

    // Handle attendance verification buttons
    if (customId.startsWith('verify_')) {
      // Check if admin
      const adminMember = await guild.members.fetch(user.id).catch(() => null);
      if (!adminMember || !isAdmin(adminMember)) {
        await interaction.reply({ content: '⚠️ Only admins can verify attendance.', ephemeral: true });
        return;
      }

      // Find the pending verification
      let pendingMsgId = null;
      let pending = null;
      for (const [msgId, verification] of Object.entries(pendingVerifications)) {
        if (verification.verificationMsgId === msg.id) {
          pendingMsgId = msgId;
          pending = verification;
          break;
        }
      }

      if (!pending) {
        await interaction.reply({ content: '⚠️ Verification already processed or expired.', ephemeral: true });
        return;
      }

      const spawnInfo = activeSpawns[pending.threadId];

      if (!spawnInfo || spawnInfo.closed) {
        await interaction.update({ content: "⚠️ This spawn is closed.", components: [] });
        delete pendingVerifications[pendingMsgId];
        attendance.setPendingVerifications(pendingVerifications);
        return;
      }

      const isApprove = customId.startsWith('verify_approve_');

      // Disable buttons
      const btn1 = interaction.message.components[0].components[0];
      const btn2 = interaction.message.components[0].components[1];
      const disabledRow = createDisabledRow(btn1, btn2);

      if (isApprove) {
        const isDuplicate = spawnInfo.members.some(
          (m) => normalizeUsername(m) === normalizeUsername(pending.author)
        );

        if (isDuplicate) {
          await interaction.update({
            embeds: [EmbedBuilder.from(msg.embeds[0]).setColor(0xff0000).setFooter({ text: 'Already verified' })],
            components: [disabledRow]
          });
          await interaction.followUp({ content: `⚠️ **${pending.author}** already verified.`, ephemeral: false });
          delete pendingVerifications[pendingMsgId];
          attendance.setPendingVerifications(pendingVerifications);
          return;
        }

        spawnInfo.members.push(pending.author);
        attendance.setActiveSpawns(activeSpawns);

        await interaction.update({
          embeds: [EmbedBuilder.from(msg.embeds[0]).setColor(0x00ff00).setFooter({ text: `Verified by ${user.username}` })],
          components: [disabledRow]
        });
        await interaction.followUp({ content: `✅ **${pending.author}** verified by ${user.username}!`, ephemeral: false });

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

        delete pendingVerifications[pendingMsgId];
        attendance.setPendingVerifications(pendingVerifications);
      } else {
        // Deny
        await interaction.update({
          embeds: [EmbedBuilder.from(msg.embeds[0]).setColor(0xff0000).setFooter({ text: `Denied by ${user.username}` })],
          components: [disabledRow]
        });

        await interaction.followUp({
          content: `<@${pending.authorId}>, your attendance was **denied** by ${user.username}. ` +
            `Please repost with a proper screenshot.`,
          ephemeral: false
        });

        delete pendingVerifications[pendingMsgId];
        attendance.setPendingVerifications(pendingVerifications);
      }

      return;
    }

    // Handle close confirmation buttons
    if (customId.startsWith('close_')) {
      // Check if admin
      const adminMember = await guild.members.fetch(user.id).catch(() => null);
      if (!adminMember || !isAdmin(adminMember)) {
        await interaction.reply({ content: '⚠️ Only admins can close spawns.', ephemeral: true });
        return;
      }

      const closePending = pendingClosures[msg.id];
      if (!closePending) {
        await interaction.reply({ content: '⚠️ Closure already processed or expired.', ephemeral: true });
        return;
      }

      const spawnInfo = activeSpawns[closePending.threadId];
      const isConfirm = customId.startsWith('close_confirm_');

      // Disable buttons
      const btn1 = interaction.message.components[0].components[0];
      const btn2 = interaction.message.components[0].components[1];
      const disabledRow = createDisabledRow(btn1, btn2);

      if (isConfirm) {
        if (!spawnInfo || spawnInfo.closed) {
          await interaction.update({
            embeds: [EmbedBuilder.from(msg.embeds[0]).setFooter({ text: 'Already closed' })],
            components: [disabledRow]
          });
          await interaction.followUp({ content: "⚠️ Spawn already closed.", ephemeral: false });
          delete pendingClosures[msg.id];
          attendance.setPendingClosures(pendingClosures);
          return;
        }

        spawnInfo.closed = true;
        attendance.setActiveSpawns(activeSpawns);

        await interaction.update({
          embeds: [EmbedBuilder.from(msg.embeds[0]).setColor(0x00ff00).setFooter({ text: `Closed by ${user.username}` })],
          components: [disabledRow]
        });

        // Check for duplicate column before submitting
        const columnExists = await attendance.checkColumnExists(spawnInfo.boss, spawnInfo.timestamp);

        if (columnExists) {
          console.log(`⚠️ Duplicate prevented: ${spawnInfo.boss} at ${spawnInfo.timestamp} already exists`);

          await interaction.followUp({
            content: `⚠️ **Attendance already submitted for this spawn!**\n\nColumn already exists in Google Sheets. Closing thread without duplicate submission.`,
            ephemeral: false
          });

          // Skip submission, just close and clean up
          if (spawnInfo.confirmThreadId) {
            const confirmThread = await guild.channels
              .fetch(spawnInfo.confirmThreadId)
              .catch(() => null);
            if (confirmThread) {
              await confirmThread.send(
                `⚠️ Duplicate prevented: **${spawnInfo.boss}** (${spawnInfo.timestamp}) - Column already exists`
              );
              await errorHandler.safeDelete(confirmThread, 'message deletion');
            }
          }

          // Lock and archive the thread
          await interaction.channel
            .setLocked(true, `Locked by ${user.username} (duplicate prevented)`)
            .catch(() => {});
          await interaction.channel
            .setArchived(true, `Closed by ${user.username} (duplicate prevented)`)
            .catch(() => {});

          delete activeSpawns[closePending.threadId];
          delete activeColumns[`${spawnInfo.boss}|${spawnInfo.timestamp}`];
          delete pendingClosures[msg.id];
          delete confirmationMessages[closePending.threadId];

          attendance.setActiveSpawns(activeSpawns);
          attendance.setActiveColumns(activeColumns);
          attendance.setPendingClosures(pendingClosures);
          attendance.setConfirmationMessages(confirmationMessages);

          return;
        }

        await interaction.followUp({
          content: `🔒 Closing spawn **${spawnInfo.boss}**... Submitting ${spawnInfo.members.length} members...`,
          ephemeral: false
        });

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
          // Auto-increment boss rotation if it's a rotating boss
          await bossRotation.handleBossKill(spawnInfo.boss);

          // Delete rotation warning message to avoid flooding
          await bossRotation.deleteRotationWarning(spawnInfo.boss);

          await interaction.channel.send(`✅ Attendance submitted! Archiving...`);

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

          // Lock and archive the thread
          await interaction.channel
            .setLocked(true, `Locked by ${user.username}`)
            .catch(() => {});
          await interaction.channel
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
          await interaction.channel.send(
            `⚠️ **Failed!**\n\nError: ${resp.text || resp.err}\n\n` +
              `**Members:** ${spawnInfo.members.join(", ")}`
          );
        }
      } else {
        // Cancel
        await interaction.update({
          embeds: [EmbedBuilder.from(msg.embeds[0]).setFooter({ text: `Cancelled by ${user.username}` })],
          components: [disabledRow]
        });
        await interaction.followUp({ content: "❌ Close canceled.", ephemeral: false });
        delete pendingClosures[msg.id];
        attendance.setPendingClosures(pendingClosures);
      }

      return;
    }
  } catch (err) {
    console.error("❌ Button interaction error:", err);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: '⚠️ An error occurred processing your request.', ephemeral: true }).catch(() => {});
    }
  }
});

/**
 * =========================================================================
 * MESSAGE REACTION ADD EVENT HANDLER (LEGACY - FOR BACKWARD COMPATIBILITY)
 * =========================================================================
 *
 * Handles old reaction-based interactions for backward compatibility.
 * Modern system uses buttons (handled in InteractionCreate event).
 * Primary uses:
 *
 * 1. Attendance Verification:
 *    - Admin clicks ✅ Verify button to approve member check-in
 *    - Admin clicks ❌ Deny button to reject check-in
 *    - Updates spawn member list and notifies user
 *
 * 2. Spawn Closure Confirmations:
 *    - Admin clicks ✅ Confirm button to close spawn
 *    - Submits attendance to Google Sheets
 *    - Archives thread and cleans up state
 *
 * 3. Bid Confirmations:
 *    - User clicks ✅ Confirm Bid button to place bid
 *    - User clicks ❌ Cancel button to cancel bid
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
    // ⚡ PERFORMANCE: Early returns for irrelevant reactions
    if (user.bot) return; // Skip bot reactions
    if (!reaction.message.guild) return; // Skip DM reactions
    if (reaction.message.guild.id !== config.main_guild_id) return; // Skip wrong guild

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

    // NOTE: Bidding confirmations removed - all bids are now instant (no reactions/buttons needed)
    // This prevents timeouts and last-minute bidding issues

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

        // Check for duplicate column before submitting
        const columnExists = await attendance.checkColumnExists(spawnInfo.boss, spawnInfo.timestamp);

        if (columnExists) {
          console.log(`⚠️ Duplicate prevented: ${spawnInfo.boss} at ${spawnInfo.timestamp} already exists`);

          await msg.channel.send(
            `⚠️ **Attendance already submitted for this spawn!**\n\n` +
              `Column already exists in Google Sheets. Closing thread without duplicate submission.`
          );

          await attendance.removeAllReactionsWithRetry(msg);

          // Skip submission, just close and clean up
          if (spawnInfo.confirmThreadId) {
            const confirmThread = await guild.channels
              .fetch(spawnInfo.confirmThreadId)
              .catch(() => null);
            if (confirmThread) {
              await confirmThread.send(
                `⚠️ Duplicate prevented: **${spawnInfo.boss}** (${spawnInfo.timestamp}) - Column already exists`
              );
              await errorHandler.safeDelete(confirmThread, 'message deletion');
            }
          }

          await msg.channel
            .setLocked(true, `Locked by ${user.username} (duplicate prevented)`)
            .catch(() => {});
          await msg.channel
            .setArchived(true, `Closed by ${user.username} (duplicate prevented)`)
            .catch(() => {});

          delete activeSpawns[closePending.threadId];
          delete activeColumns[`${spawnInfo.boss}|${spawnInfo.timestamp}`];
          delete pendingClosures[msg.id];
          delete confirmationMessages[closePending.threadId];

          attendance.setActiveSpawns(activeSpawns);
          attendance.setActiveColumns(activeColumns);
          attendance.setPendingClosures(pendingClosures);
          attendance.setConfirmationMessages(confirmationMessages);

          return;
        }

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
          // Auto-increment boss rotation if it's a rotating boss
          await bossRotation.handleBossKill(spawnInfo.boss);

          // Delete rotation warning message to avoid flooding
          await bossRotation.deleteRotationWarning(spawnInfo.boss);

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

          // Lock and archive the thread to prevent spam
          await msg.channel
            .setLocked(true, `Locked by ${user.username}`)
            .catch(() => {});
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

// Handle Discord client errors
client.on(Events.Error, (error) => {
  console.error("❌ Discord client error:", error);
  // Don't crash on client errors - Discord.js will handle reconnection
});

// Handle WebSocket/Shard errors (including timeout errors)
client.on(Events.ShardError, (error, shardId) => {
  console.error(`❌ WebSocket error on shard ${shardId}:`, error.message);
  // Don't crash - Discord.js will automatically attempt to reconnect
  if (error.message.includes('timeout')) {
    console.log(`⏱️ Shard ${shardId} timed out, waiting for automatic reconnection...`);
  }
});

// Handle shard disconnections
client.on(Events.ShardDisconnect, (event, shardId) => {
  console.warn(`⚠️ Shard ${shardId} disconnected (code: ${event.code})`);
});

// Handle shard reconnection attempts
client.on(Events.ShardReconnecting, (shardId) => {
  console.log(`🔄 Shard ${shardId} is reconnecting...`);
});

// Handle shard resume (successful reconnection)
client.on(Events.ShardResume, (shardId, replayedEvents) => {
  console.log(`✅ Shard ${shardId} resumed (replayed ${replayedEvents} events)`);
});

// Handle unhandled promise rejections without crashing
process.on("unhandledRejection", (error) => {
  console.error("❌ Unhandled promise rejection:", error);
  // Log but don't crash - allow the bot to continue operating
  // Koyeb will automatically restart if the process exits
});

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
  console.error("❌ Uncaught exception:", error);
  // For critical errors, we may need to exit and let Koyeb restart
  if (error.message && error.message.includes('FATAL')) {
    console.error("💥 Fatal error detected, exiting for restart...");
    process.exit(1);
  }
  // Otherwise, try to continue
});

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
