require('dotenv').config();
/**
 * =====================================================================
 * GUILD BOT - Main Application Entry Point
 * =====================================================================
 *
 * @file index2.js
 * @version 9.0.0
 * @description Comprehensive Discord bot for guild management,
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
 * Core Systems:
 *  - Attendance Module (./attendance.js)
 *  - Bidding Module (./bidding.js)
 *  - Auctioneering Module (./auctioneering.js)
 *  - Help System (./help-system.js)
 *  - Leaderboard System (./leaderboard-system.js)
 *  - Emergency Commands (./emergency-commands.js)
 *  - Error Handler (./utils/error-handler.js)
 *
 * @author Guild Development Team
 * @license MIT
 */

// =====================================================================
// SECTION 1: IMPORTS & DEPENDENCIES
// =====================================================================

// ═══════════════════════════════════════════════════════════════════════════
// STRUCTURED LOGGING
// ═══════════════════════════════════════════════════════════════════════════
const { createLogger } = require('./utils/logger');
const mainLogger = createLogger('main');

// ═══════════════════════════════════════════════════════════════════════════
// GRACEFUL DEGRADATION
// ═══════════════════════════════════════════════════════════════════════════
const { OperationQueue } = require('./utils/operation-queue');
const operationQueue = new OperationQueue();

// Discord.js - Official Discord API wrapper
const {
  Client,
  GatewayIntentBits,
  Partials,
  Events,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  Options,
} = require("discord.js");

// External dependencies
const fs = require("fs");
const http = require("http");
const path = require("path");
const { spawn } = require("child_process");
const v8 = require("v8");
const levenshtein = require("fast-levenshtein");

// Internal modules - Core systems
const bidding = require("./bidding.js");
const helpSystemV2 = require("./help-system-v2.js");
const auctioneering = require("./auctioneering.js");
const attendance = require("./attendance.js");
const bossTimer = require("./boss-timer.js");
const bossTimerCommands = require("./boss-timer-commands.js");
const emergencyCommands = require("./emergency-commands.js");
const leaderboardSystem = require("./leaderboard-system.js");
const errorHandler = require('./utils/error-handler');
const { SheetAPI, clientCache } = require('./utils/sheet-api');
const { DiscordCache } = require('./utils/discord-cache');
const { createCommandHandlers } = require('./bot/command-handlers');
const { normalizeUsername, findBossMatch, normalizeTimestamp } = require('./utils/common');
const { getBossImageAttachment, getBossImageAttachmentURL } = require('./utils/boss-images');
const { addGuildFooter, addGuildThumbnail } = require('./utils/embed-branding');
const scheduler = require('./utils/maintenance-scheduler');
const timerRegistry = require('./utils/timer-registry');
const eventReminders = require('./services/event-reminders');
const bossRotation = require('./boss-rotation.js');
const activityHeatmap = require('./activity-heatmap.js');
const crashRecovery = require('./utils/crash-recovery.js');
const dbAPI = require('./utils/database-api');
const mongoHelpers = require('./utils/mongodb-helpers');
const memberLore = JSON.parse(fs.readFileSync("./member-lore.json"));
const { COMMAND_ALIASES, resolveCommandAlias } = require('./config/command-aliases');
const bossSpawnConfig = JSON.parse(fs.readFileSync("./boss_spawn_config.json"));
const reports = require('./services/reports');

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 1 CRITICAL FIXES - Graceful Shutdown & Resource Management
// ═══════════════════════════════════════════════════════════════════════════
const shutdownManager = require('./utils/shutdown-manager');

// PHASE 3.3 - Internal Discord Monitoring
const discordMonitoring = require('./utils/discord-monitoring');

// ═══════════════════════════════════════════════════════════════════════════
// SLASH COMMANDS - Phase 1 Implementation
// ═══════════════════════════════════════════════════════════════════════════
const { registerCommands } = require('./commands/register-commands');
const { handleSlashCommand } = require('./commands/handlers');
const { handleAutocomplete } = require('./commands/autocomplete');
const alterFrierenConfig = require('./config/alterfrieren-dm.json');

// ═══════════════════════════════════════════════════════════════════════════
// EXTRACTED MODULES - All modular extractions from index2.js
// ═══════════════════════════════════════════════════════════════════════════
const stateManager = require('./utils/state-manager');
const {
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
  USE_MONGODB_ATTENDANCE,
} = require('./bot/config');
const client = require('./bot/client');
const { createHealthServer } = require('./bot/health-server');
const {
  isAdmin,
  hasTenchuRole,
  recoverBotStateOnStartup,
  moveQueueItemsToSheet,
} = require('./bot/member-utils');
const { createDisabledRow, awaitConfirmation } = require('./bot/confirm-utils');
const { createMessageHandler } = require('./bot/message-handler');
const { createInteractionHandler } = require('./bot/interaction-handler');
const { createReactionHandler } = require('./bot/reaction-handler');
const { createVoiceStateHandler } = require('./bot/events/voice-state');
const { createThreadUpdateHandler } = require('./bot/events/thread-update');
const { registerErrorHandlers } = require('./bot/events/error-handlers');
const { registerShutdownHandlers } = require('./bot/shutdown');
const { onClientReady } = require('./bot/init');

// =====================================================================
// CONFIGURATION LOADING
// =====================================================================

// ═══════════════════════════════════════════════════════════════════════════
// SPECIAL USER IDS & DM CONFIG (remaining local state)
// ═══════════════════════════════════════════════════════════════════════════
// Note: ALTERFRIEREN_ID and ROHYPnol_ID are imported from bot/config.js
// lastAlterFrierenDM, ALTERFRIEREN_DM_COOLDOWN, and recentPlayfulDMs
// are now internal to bot/events/voice-state.js

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION VALIDATION
// ═══════════════════════════════════════════════════════════════════════════
// validateConfig() is called from within bot/config.js at require time.
// If validation fails, process.exit(1) is called immediately.

// ═══════════════════════════════════════════════════════════════════════════
// GOOGLE SHEETS API
// ═══════════════════════════════════════════════════════════════════════════
const sheetAPI = new SheetAPI(config.sheet_webhook_url);

// ═══════════════════════════════════════════════════════════════════════════
// DISCORD CHANNEL CACHE
// ═══════════════════════════════════════════════════════════════════════════
let discordCache = null;

// ═══════════════════════════════════════════════════════════════════════════
// REMAINING STATE VARIABLES (not in stateManager)
// ═══════════════════════════════════════════════════════════════════════════
let lastSheetCall = 0;
let lastOverrideTime = 0;
let lastAuctionEndTime = 0;
let isRecovering = false;
let isBidProcessing = false;
let biddingChannelCleanupTimer = null;
const statsCache = new Map();
const STATS_CACHE_DURATION = 5 * 60 * 1000;
const PORT = config.port;

/**
 * Cleanup expired entries from statsCache
 * Prevents memory leaks by removing old cached data
 */
function cleanupStatsCache() {
  const now = Date.now();
  let removed = 0;

  for (const [key, value] of statsCache.entries()) {
    if (now - value.timestamp > STATS_CACHE_DURATION) {
      statsCache.delete(key);
      removed++;
    }
  }

  if (removed > 0) {
    console.log(`🧹 Cleaned up ${removed} expired stats cache entries (${statsCache.size} remaining)`);
  }
}

// Run cleanup every 10 minutes
const statsCleanupTimer = setInterval(cleanupStatsCache, 10 * 60 * 1000);
shutdownManager.registerInterval('stats-cache-cleanup', statsCleanupTimer, { frequency: '10 minutes' });

// =====================================================================
// HTTP HEALTH CHECK SERVER
// =====================================================================

const server = createHealthServer(client, config, {
  botVersion: BOT_VERSION,
  botStartTime: BOT_START_TIME,
  stateManager,
  dbAPI,
  reportsGetCacheStats: () => reports.getCacheStats(),
  attendanceGetCacheStats: () => attendance.getCacheStats(),
});

// =====================================================================
// UTILITY FUNCTIONS (kept inline - used by command-handlers)
// =====================================================================

// isAdmin, hasTenchuRole, recoverBotStateOnStartup, moveQueueItemsToSheet,


// createDisabledRow, awaitConfirmation imported from bot/confirm-utils.js

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
    let confidence;
    if (matchType === 'contains') {
      confidence = 75;
    } else if (matchType === 'fuzzy') {
      confidence = Math.max(0, Math.min(100, 100 - (bestScore * 10)));

      const minConfidence = 85;
      const maxRelativeDistance = 0.3;
      const relativeDistance = bestScore / normalizedSearch.length;

      if (confidence < minConfidence || relativeDistance > maxRelativeDistance) {
        console.log(`❌ Rejecting fuzzy match: "${normalizedSearch}" → "${bestMatch.displayName}" (${confidence}% confidence, ${(relativeDistance * 100).toFixed(0)}% character difference)`);
        return null;
      }
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
function buildStatsEmbed(stats, member) {
  const { memberName, attendance, bidding, rank, totalMembers } = stats;

  const validRank = rank && rank > 0 ? rank : totalMembers;
  const percentile = totalMembers > 0 ? Math.round((1 - (validRank / totalMembers)) * 100) : 0;

  const color = getColorByRank(validRank);

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`📊 Member Stats - ${memberName}`)
    .setTimestamp();

  if (member && member.user) {
    embed.setThumbnail(member.user.displayAvatarURL());
  }

  const rankNumber = rank && rank > 0 ? `#${rank}` : `Unranked`;
  const rankTitle = getRankTitle(rank, attendance);
  const rankDisplay = rank && rank > 0 ? `**${rankNumber}**\n${rankTitle}` : rankTitle;

  const streakText = attendance.streak === 1 ? '1 day' : `${attendance.streak} days`;
  const streakDisplay = attendance.streak > 0 ? `**${streakText}** 🔥` : `**${streakText}**`;

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

  if (attendance.recentBosses && attendance.recentBosses.length > 0) {
    const recent = attendance.recentBosses
      .slice(0, 5)
      .map(b => `${b.boss} (${b.points}pt${b.points !== 1 ? 's' : ''})`)
      .join(' • ');

    embed.addFields({
      name: '📅 Recent Activity',
      value: recent,
      inline: false
    });
  }

  const loreKey = Object.keys(memberLore).find(
    key => key.toLowerCase() === memberName.toLowerCase() && !key.startsWith('_')
  );

  const lore = loreKey ? memberLore[loreKey] : memberLore['_FUTURE_MEMBER_TEMPLATE'];
  const isTemplateLore = !loreKey && memberLore['_FUTURE_MEMBER_TEMPLATE'];

  if (lore) {
    const skillsList = lore.skills ? lore.skills.join(', ') : 'None';
    const displayTitle = isTemplateLore ? `${memberName}'s Destiny Awaits` : lore.title;

    const loreValue = `${lore.lore}\n\n**Specialty:** ${lore.specialty}\n**Reputation:** ${lore.reputation}\n**Stats:** ${lore.stats}\n**Skills:** ${skillsList}`;

    embed.addFields({
      name: `✨ ${displayTitle}`,
      value: loreValue,
      inline: false
    });

    if (lore.recent_developments) {
      embed.addFields({
        name: `📜 Recent Developments`,
        value: lore.recent_developments,
        inline: false
      });
    }
  }

  const percentileText = percentile > 0 ? `Top ${percentile}%` : 'New Member';
  const statsTip = '\n💡 Tip: !stats `IGN` shows anyone\'s story';

  if (attendance.favoriteBoss) {
    embed.setFooter({
      text: `Most attended: ${attendance.favoriteBoss.name} (${attendance.favoriteBoss.count}x) \u2022 ${percentileText}${statsTip}`
    });
  } else {
    embed.setFooter({
      text: `${percentileText}${statsTip}`
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
  if (rank === 1) return 0xFFD700;
  if (rank === 2) return 0xC0C0C0;
  if (rank === 3) return 0xCD7F32;
  if (rank <= 10) return 0x00D9FF;
  return 0x5865F2;
}

/**
 * Get savage/rewarding rank title based on position
 * @param {number} rank - Member's rank
 * @param {Object} attendance - Attendance data
 * @returns {string} Title text
 */
function getRankTitle(rank, attendance) {
  if (!attendance || attendance.total === 0) {
    return "👻 Ghost Member (Do You Even Exist?)";
  }

  if (!rank || rank <= 0) {
    return "🌱 Fresh Meat (Newbie)";
  }

  if (rank === 1) return `👑 GOD OF ${guildName} 👑`;
  if (rank === 2) return "🥈 ATTENDANCE DEMON 🥈";
  if (rank === 3) return "🥉 GUILD BACKBONE 🥉";
  if (rank === 4) return "⚡ ULTIMATE TRYHARD ⚡";
  if (rank === 5) return "💎 DIAMOND GRINDER 💎";
  if (rank === 6) return "🔱 NO SLEEP WARRIOR 🔱";
  if (rank === 7) return "🔥 ATTENDANCE DEMON 🔥";
  if (rank === 8) return "💪 GIGACHAD MEMBER 💪";
  if (rank === 9) return "⭐ SWEATLORD SUPREME ⭐";
  if (rank === 10) return "🎯 TOP 10 BEAST 🎯";
  if (rank >= 11 && rank <= 12) return "⚔️ Elite Sweeper";
  if (rank >= 13 && rank <= 15) return "🌟 Hardcore Regular";
  if (rank >= 16 && rank <= 17) return "🎖️ Professional Grinder";
  if (rank >= 18 && rank <= 20) return "📈 Rising Star";
  if (rank >= 21 && rank <= 23) return "💼 Solid Contributor";
  if (rank >= 24 && rank <= 25) return "🎮 Active Member";
  if (rank >= 26 && rank <= 28) return "😎 Chill Gamer";
  if (rank >= 29 && rank <= 30) return "🌊 Wave Rider";
  if (rank >= 31 && rank <= 33) return "🌿 Grass Toucher (Has a Life)";
  if (rank >= 34 && rank <= 35) return "☕ Coffee Break Enjoyer";
  if (rank >= 36 && rank <= 38) return "📱 Part-Time Player";
  if (rank >= 39 && rank <= 40) return "🍃 Breeze Cruiser";
  if (rank >= 41 && rank <= 43) return "💀 Bench Warmer";
  if (rank >= 44 && rank <= 45) return "🎪 Guild Mascot";
  if (rank === 46) return "👻 Professional AFK";
  if (rank === 47) return "🦥 Sloth Mode Activated";
  if (rank === 48) return "🪦 Barely Alive";
  if (rank === 49) return "🤡 Second to Dead Last";
  if (rank === 50) return "🗿 THE ANCHOR (Congrats on Last Place!)";
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
 */
async function startCountdownDeletion(message, botMessage, stats, member, updateFunction, duration = 300) {
  let remainingTime = duration;

  try {
    await errorHandler.safeDelete(message, 'message deletion');
  } catch (e) {
    console.warn(`⚠️ Could not delete user message: ${e.message}`);
  }

  const updateInterval = 5;
  const countdownTimer = setInterval(async () => {
    remainingTime -= updateInterval;

    if (remainingTime <= 0) {
      clearInterval(countdownTimer);
      try {
        await errorHandler.safeDelete(botMessage, 'message deletion');
      } catch (e) {
        console.warn(`⚠️ Could not delete bot message: ${e.message}`);
      }
      return;
    }

    try {
      const updatedEmbed = updateFunction(stats, member, remainingTime);
      await botMessage.edit({ embeds: [updatedEmbed] });
    } catch (e) {
      console.warn(`⚠️ Could not update countdown: ${e.message}`);
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
 */
async function cleanupStaleStatsMessages() {
  try {
    console.log('🧹 Cleaning up stale stats/mypoints messages...');

    const commandsChannel = await discordCache.getChannel('bot_manual_channel_id');
    if (!commandsChannel) {
      console.warn('⚠️ Could not find tenchu-commands channel for cleanup');
      return;
    }

    const messages = await commandsChannel.messages.fetch({ limit: 100 });
    let deletedCount = 0;

    for (const [, message] of messages) {
      let shouldDelete = false;

      if (message.author.id === client.user.id) {
        if (message.embeds && message.embeds.length > 0) {
          const embed = message.embeds[0];
          const title = embed.title || '';
          if (title.includes('Member Stats') || title.includes('Your Points')) {
            shouldDelete = true;
          }
        }
        if (message.content && message.content.includes('⏳ Fetching stats for')) {
          shouldDelete = true;
        }
      }

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
// BIDDING CHANNEL CLEANUP
// =====================================================================

/**
 * Performs comprehensive cleanup of the bidding channel.
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

    // Cleanup old threads (Lock & Archive)
    console.log(`🧵 Checking for old auction threads...`);

    const auctionState = auctioneering.getAuctionState();
    const hasActiveAuction = auctionState && auctionState.active;

    let threadsLocked = 0;
    let threadsArchived = 0;
    let threadsSkipped = 0;

    if (hasActiveAuction) {
      console.log(`⚠️ Active auction detected - skipping thread cleanup to avoid interfering`);
    } else {
      try {
        const activeThreads = await biddingChannel.threads
          .fetchActive()
          .catch(() => null);

        if (activeThreads && activeThreads.threads.size > 0) {
          console.log(`📋 Found ${activeThreads.threads.size} active thread(s) in bidding channel`);

          for (const [threadId, thread] of activeThreads.threads) {
            try {
              if (config.protected_thread_ids && config.protected_thread_ids.includes(threadId)) {
                threadsSkipped++;
                console.log(`⏭️ Skipping protected thread: ${thread.name}`);
                continue;
              }

              if (thread.type !== 11 && thread.type !== 12) {
                threadsSkipped++;
                continue;
              }

              if (!thread.locked && typeof thread.setLocked === "function") {
                await thread.setLocked(true, "Bidding channel cleanup").catch((err) => {
                  console.warn(`⚠️ Failed to lock thread ${thread.name}:`, err.message);
                });
                threadsLocked++;
                console.log(`🔒 Locked: ${thread.name}`);
                await new Promise((resolve) => setTimeout(resolve, 300));
              }

              if (!thread.archived && typeof thread.setArchived === "function") {
                await thread.setArchived(true, "Bidding channel cleanup").catch((err) => {
                  console.warn(`⚠️ Failed to archive thread ${thread.name}:`, err.message);
                });
                threadsArchived++;
                console.log(`📦 Archived: ${thread.name}`);
              }

              await new Promise((resolve) => setTimeout(resolve, 500));
            } catch (err) {
              console.warn(`⚠️ Error processing thread ${thread.name}:`, err.message);
              threadsSkipped++;
            }
          }

          console.log(`✅ Thread cleanup: ${threadsLocked} locked, ${threadsArchived} archived, ${threadsSkipped} skipped`);
        } else {
          console.log(`📋 No active threads found in bidding channel`);
        }

        const archivedThreads = await biddingChannel.threads
          .fetchArchived({ limit: 50 })
          .catch(() => null);

        if (archivedThreads && archivedThreads.threads.size > 0) {
          console.log(`📋 Found ${archivedThreads.threads.size} archived thread(s) to check`);

          for (const [threadId, thread] of archivedThreads.threads) {
            try {
              if (config.protected_thread_ids && config.protected_thread_ids.includes(threadId)) {
                console.log(`⏭️ Skipping protected archived thread: ${thread.name}`);
                continue;
              }

              if (!thread.locked && typeof thread.setLocked === "function") {
                await thread.setArchived(false, "Temporary unarchive for locking")
                  .catch(err => errorHandler.silentError(err, 'thread unarchive for locking'));

                await new Promise((resolve) => setTimeout(resolve, 300));

                await thread.setLocked(true, "Bidding channel cleanup").catch((err) => {
                  console.warn(`⚠️ Failed to lock archived thread ${thread.name}:`, err.message);
                });

                await new Promise((resolve) => setTimeout(resolve, 300));

                await thread.setArchived(true, "Bidding channel cleanup")
                  .catch(err => errorHandler.silentError(err, 'thread re-archive after locking'));
                threadsLocked++;
                console.log(`🔒 Locked archived: ${thread.name}`);

                await new Promise((resolve) => setTimeout(resolve, 500));
              }
            } catch (err) {
              console.warn(`⚠️ Error processing archived thread ${thread.name}:`, err.message);
            }
          }

          console.log(`✅ Archived thread cleanup: ${threadsLocked} additional locked`);
        }
      } catch (err) {
        console.error(`❌ Error during thread cleanup:`, err.message);
      }
    }

    // Cleanup old messages
    console.log(`📊 Fetching bidding channel history...`);
    let messagesDeleted = 0;
    let messagesFetched = 0;
    let batchSize = 0;

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
          if (message.author.bot) continue;

          if (message.guild) {
            const msgAuthor = await message.guild.members
              .fetch(message.author.id)
              .catch(() => null);
            if (msgAuthor && isAdmin(msgAuthor)) continue;
          }

          try {
            await errorHandler.safeDelete(message, 'message deletion');
            messagesDeleted++;
            await new Promise((resolve) => setTimeout(resolve, 500));
          } catch (e) {
            console.warn(`⚠️ Could not delete message ${msgId}: ${e.message}`);
          }
        }

        if (messages.size > 0) {
          const lastMsg = messages.last();
          lastMessageId = lastMsg.id;
        }

        if (batchSize >= 50) {
          console.log(`⚠️ Safety limit reached (50 batches, 5000 messages). Stopping cleanup.`);
          shouldContinue = false;
        }
      } catch (e) {
        console.error(`❌ Error in cleanup batch ${batchSize}: ${e.message}`);
        shouldContinue = false;
      }
    }

    console.log(`✅ Bidding channel cleanup complete!`);
    console.log(`📊 Messages: ${messagesFetched} fetched | ${messagesDeleted} deleted`);
    console.log(`🧵 Threads: ${threadsLocked} locked | ${threadsArchived} archived | ${threadsSkipped} skipped`);
  } catch (e) {
    console.error(`❌ Bidding channel cleanup error:`, e);
  }
}

/**
 * Starts the automated bidding channel cleanup schedule.
 */
function startBiddingChannelCleanupSchedule() {
  console.log(`⏰ Starting bidding channel cleanup schedule (every 12 hours)`);

  cleanupBiddingChannel().catch(console.error);

  biddingChannelCleanupTimer = setInterval(async () => {
    try {
      console.log(`⏰ Running scheduled bidding channel cleanup...`);
      await cleanupBiddingChannel();
    } catch (error) {
      console.error("❌ Error in bidding channel cleanup:", error.message);
    }
  }, BIDDING_CHANNEL_CLEANUP_INTERVAL);

  shutdownManager.registerInterval('bidding-channel-cleanup', biddingChannelCleanupTimer, { frequency: '12 hours' });
}

/**
 * Stops the automated bidding channel cleanup schedule.
 */
function stopBiddingChannelCleanupSchedule() {
  if (biddingChannelCleanupTimer) {
    clearInterval(biddingChannelCleanupTimer);
    biddingChannelCleanupTimer = null;
    console.log(`⏹️ Bidding channel cleanup schedule stopped`);
  }
}

// =====================================================================
// COMMAND HANDLERS
// =====================================================================

const commandHandlers = createCommandHandlers({
  config,
  client,
  activeSpawns: stateManager.activeSpawns,
  pendingVerifications: stateManager.pendingVerifications,
  activeColumns: stateManager.activeColumns,
  pendingClosures: stateManager.pendingClosures,
  confirmationMessages: stateManager.confirmationMessages,
  discordCache,
  sheetAPI,
  bidding,
  auctioneering,
  attendance,
  bossTimer,
  bossTimerCommands,
  emergencyCommands,
  leaderboardSystem,
  helpSystemV2,
  eventReminders,
  bossRotation,
  activityHeatmap,
  crashRecovery,
  scheduler,
  reports,
  mongoHelpers,
  dbAPI,
  memberLore,
  bossPoints,
  bossSpawnConfig,
  alterFrierenConfig,
  isAdmin,
  BOT_VERSION,
  BOT_START_TIME,
  TIMING,
  AUCTION_COOLDOWN,
  BIDDING_CHANNEL_CLEANUP_INTERVAL,
  ALTERFRIEREN_ID,
  ROHYPnol_ID,
  USE_MONGODB_ATTENDANCE,
  lastAuctionEndTime,
  isRecovering,
  statsCache,
  lastSheetCall,
  guildName,
  STATS_CACHE_DURATION,
  findBestMemberMatch,
  buildStatsEmbed,
});

// =====================================================================
// BOT INITIALIZATION (ClientReady)
// =====================================================================

client.once(Events.ClientReady, async () => {
  // Initialize Discord channel cache before anything else
  discordCache = new DiscordCache(client, config);

  await onClientReady(client, config, {
    mainLogger,
    bossPoints,
    BOT_VERSION,
    PORT,
    operationQueue,
    dbAPI,
    shutdownManager,
    discordMonitoring,
    discordCache,
    attendance,
    bossTimer,
    helpSystemV2,
    auctioneering,
    bidding,
    emergencyCommands,
    leaderboardSystem,
    activityHeatmap,
    bossRotation,
    isAdmin,
    recoverBotStateOnStartup,
    moveQueueItemsToSheet,
    stateManager,
    sheetAPI,
    cleanupStaleStatsMessages,
    startBiddingChannelCleanupSchedule,
    eventReminders,
    crashRecovery,
    scheduler,
    registerCommands,
    isRecovering,
    lastAuctionEndTime,
  });
});

// =====================================================================
// EVENT HANDLERS
// =====================================================================

// ── Message Create Handler ─────────────────────────────────────────
const messageHandler = createMessageHandler(client, config, {
  stateManager,
  attendance,
  bidding,
  auctioneering,
  bossTimerCommands,
  emergencyCommands,
  commandHandlers,
  bossRotation,
  bossPoints,
  activityHeatmap,
  shutdownManager,
  dbAPI,
  TIMING,
  isAdmin,
  hasTenchuRole,
  addGuildFooter,
  createDisabledRow,
  awaitConfirmation,
  ALTERFRIEREN_ID,
  ROHYPnol_ID,
  errorHandler,
  lastOverrideTime,
  isBidProcessing,
  bossTimer,
  findBossMatch: (input) => attendance.findBossMatch(input),
  lazyAttendance: {
    createSpawnThreads: (bossName, dateStr, timeStr, fullTimestamp, _message, _client, _config) => {
      return attendance.createSpawnThreads(_client, bossName, dateStr, timeStr, fullTimestamp, 'timer');
    },
  },
});

client.on(Events.MessageCreate, messageHandler);

// ── Interaction Create Handler ─────────────────────────────────────
const interactionHandler = createInteractionHandler(client, config, {
  stateManager,
  attendance,
  bossPoints,
  bossRotation,
  errorHandler,
  normalizeUsername,
  normalizeTimestamp,
  isAdmin,
  handleSlashCommand,
  handleAutocomplete,
  createDisabledRow,
  bossTimer,
  bossTimerCommands,
  bidding,
  auctioneering,
});

client.on(Events.InteractionCreate, interactionHandler);

// ── Reaction Add Handler (Legacy backward compatibility) ──────────
const reactionHandler = createReactionHandler(client, config, {
  stateManager,
  attendance,
  errorHandler,
  bossRotation,
  bossPoints,
  normalizeUsername,
  normalizeTimestamp,
  ALTERFRIEREN_ID,
  ROHYPnol_ID,
  isAdmin,
});

client.on(Events.MessageReactionAdd, reactionHandler);

// ── Voice State Update Handler ─────────────────────────────────────
const voiceStateHandler = createVoiceStateHandler(client, config, {
  discordCache,
  ALTERFRIEREN_ID,
  ROHYPnol_ID,
  memberLore,
  alterFrierenConfig,
});

client.on(Events.VoiceStateUpdate, voiceStateHandler);

// ── Thread Update Handler ──────────────────────────────────────────
const threadUpdateHandler = createThreadUpdateHandler(client, config, {
  stateManager,
  bossRotation,
  attendance,
  normalizeTimestamp,
});

client.on(Events.ThreadUpdate, threadUpdateHandler);

// ── Error Handlers ─────────────────────────────────────────────────
registerErrorHandlers(client);

// ── Graceful Shutdown Handlers ─────────────────────────────────────
registerShutdownHandlers(client, config, {
  server,
  stopBiddingChannelCleanupSchedule,
  scheduler,
  timerRegistry,
  crashRecovery,
  dbAPI,
});

// =====================================================================
// MODULE EXPORTS & BOT LOGIN
// =====================================================================

/**
 * Global function exports for cross-module access.
 * Enables auctioneering module to submit data to Google Sheets.
 */
global.postToSheet = attendance.postToSheet;

// Export commandHandlers for slash command reuse
module.exports = { commandHandlers };

if (!config.token) {
  console.error("❌ Discord token not found! Set DISCORD_TOKEN environment variable or add token to config.json");
  process.exit(1);
}

client.login(config.token);
