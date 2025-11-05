/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * ELYSIUM ATTENDANCE SYSTEM MODULE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * This module manages the complete attendance tracking system for boss spawns in
 * the ELYSIUM Discord server. It handles thread creation, member verification,
 * points calculation, and synchronization with Google Sheets for persistence.
 *
 * CORE FUNCTIONALITY:
 * -------------------
 * 1. Thread Creation: Creates attendance and confirmation threads for boss spawns
 * 2. Verification Workflow: Manages member check-ins with screenshot verification
 * 3. Points Calculation: Tracks and awards points based on boss difficulty
 * 4. State Persistence: Syncs attendance data to Google Sheets for crash recovery
 * 5. Google Sheets Integration: Bi-directional sync with spreadsheet backend
 * 6. Recovery Mechanisms: Multi-sweep state recovery from threads and sheets
 *
 * STATE VARIABLES:
 * ----------------
 * @var {Object} config - Bot configuration (guild IDs, channel IDs, webhooks)
 * @var {Object} bossPoints - Boss name to points mapping
 * @var {Function} isAdminFunc - Function to check if user has admin privileges
 * @var {Object} activeSpawns - Map of threadId -> spawn data (boss, members, etc.)
 * @var {Object} activeColumns - Map of "boss|timestamp" -> threadId for deduplication
 * @var {Object} pendingVerifications - Map of messageId -> verification data
 * @var {Object} pendingClosures - Map of messageId -> closure confirmation data
 * @var {Object} confirmationMessages - Map of threadId -> confirmation message IDs
 * @var {Number} lastSheetCall - Timestamp of last Google Sheets API call (rate limiting)
 *
 * MAIN EXPORTED FUNCTIONS:
 * ------------------------
 * - initialize() - Initializes module with config and boss points
 * - createSpawnThreads() - Creates attendance threads for new boss spawns
 * - recoverStateFromThreads() - Recovers state from active Discord threads
 * - validateStateConsistency() - Cross-references threads with Google Sheets
 * - saveAttendanceStateToSheet() - Persists current state to Google Sheets
 * - loadAttendanceStateFromSheet() - Loads saved state from Google Sheets
 * - schedulePeriodicStateSync() - Sets up automatic state synchronization
 * - getActiveSpawns() - Returns current active spawn data
 * - cleanupAllThreadReactions() - Removes all reactions from thread messages
 *
 * WORKFLOW:
 * ---------
 * 1. Boss spawn detected -> createSpawnThreads()
 * 2. Member posts "present" + screenshot -> reactions added (✅/❌)
 * 3. Admin reacts with ✅ -> member verified and added to Google Sheets
 * 4. Admin types "close" -> confirmation prompt appears
 * 5. Admin confirms -> thread closed and all reactions removed
 * 6. State periodically synced to Google Sheets for crash recovery
 *
 * @module attendance
 * @author ELYSIUM Development Team
 * @version 2.0.0
 */

const { EmbedBuilder } = require("discord.js");
const { SheetAPI } = require('./utils/sheet-api');
const {
  getCurrentTimestamp,
  getSundayOfWeek,
  formatUptime,
  normalizeTimestamp,
  parseThreadName,
  findBossMatch: findBossMatchUtil,
  timestampsMatch,
  bossNamesMatch,
  sleep,
} = require("./utils/common");

// ═══════════════════════════════════════════════════════════════════════════════
// STATE VARIABLES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Module configuration and state variables
 */
let config = null;              // Bot configuration loaded at initialization
let bossPoints = null;          // Boss name to points value mapping
let isAdminFunc = null;         // Function to check admin privileges
let sheetAPI = null;            // Unified Google Sheets API client
let discordCache = null;        // Discord channel cache
let activeSpawns = {};          // Active spawn threads and their data
let activeColumns = {};         // Boss|timestamp to threadId mapping for deduplication
let pendingVerifications = {};  // Message IDs awaiting admin verification
let pendingClosures = {};       // Message IDs awaiting closure confirmation
let confirmationMessages = {};  // Thread IDs to confirmation message IDs
let lastSheetCall = 0;          // Timestamp of last Google Sheets API call

/**
 * Timing constants for rate limiting and retry logic
 */
const TIMING = {
  MIN_SHEET_DELAY: 2000,              // Minimum delay between Google Sheets API calls (ms)
  CONFIRMATION_TIMEOUT: 30000,        // Timeout for confirmation prompts (ms)
  RETRY_DELAY: 5000,                  // Delay between retry attempts (ms)
  MASS_CLOSE_DELAY: 3000,             // Delay between mass close operations (ms)
  REACTION_RETRY_ATTEMPTS: 3,         // Number of attempts for adding/removing reactions
  REACTION_RETRY_DELAY: 1000,         // Delay between reaction retry attempts (ms)
};

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Initializes the attendance module with required configuration and data.
 * Must be called before any other module functions are used.
 *
 * @param {Object} cfg - Bot configuration object containing guild IDs, channel IDs, and webhook URLs
 * @param {Object} bossPointsData - Mapping of boss names to their point values
 * @param {Function} isAdmin - Function that checks if a user has admin privileges
 * @returns {void}
 *
 * @example
 * initialize(config, { "VALAKAS": { points: 100 } }, (userId) => checkAdmin(userId));
 */
function initialize(cfg, bossPointsData, isAdmin, cache = null) {
  config = cfg;
  bossPoints = bossPointsData;
  isAdminFunc = isAdmin;
  sheetAPI = new SheetAPI(cfg.sheet_webhook_url);
  discordCache = cache;
  console.log("✅ Attendance module initialized");
}

/**
 * Wrapper function for boss name matching using the module's boss points data.
 * Performs fuzzy matching to handle variations in boss name input.
 *
 * @param {string} input - Boss name input to match (case-insensitive, handles variations)
 * @returns {string|null} Normalized boss name if found, null otherwise
 *
 * @example
 * findBossMatch("vala") // Returns "VALAKAS"
 * findBossMatch("ant queen") // Returns "ANT_QUEEN"
 */
function findBossMatch(input) {
  return findBossMatchUtil(input, bossPoints);
}

// ═══════════════════════════════════════════════════════════════════════════════
// GOOGLE SHEETS INTEGRATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Posts data to Google Sheets via webhook with rate limiting and retry logic.
 * Implements automatic rate limiting (MIN_SHEET_DELAY) and handles 429 errors with exponential backoff.
 *
 * @param {Object} payload - Data payload to send to Google Sheets
 * @param {string} payload.action - Action type (e.g., "checkColumn", "addMember", "createColumn")
 * @param {number} [retryCount=0] - Current retry attempt number (internal use for recursion)
 * @returns {Promise<Object>} Response object containing ok, status, and text/error
 * @returns {boolean} return.ok - Whether the request succeeded
 * @returns {number} return.status - HTTP status code
 * @returns {string} return.text - Response text from Google Sheets
 *
 * @example
 * const result = await postToSheet({
 *   action: "addMember",
 *   boss: "VALAKAS",
 *   timestamp: "11/05/25 14:30",
 *   member: "PlayerName"
 * });
 */
async function postToSheet(payload, retryCount = 0) {
  try {
    // Rate limiting: ensure minimum delay between API calls
    const now = Date.now();
    const timeSinceLastCall = now - lastSheetCall;
    if (timeSinceLastCall < TIMING.MIN_SHEET_DELAY) {
      const waitTime = TIMING.MIN_SHEET_DELAY - timeSinceLastCall;
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }

    lastSheetCall = Date.now();

    // Make the API call using SheetAPI (handles retries automatically)
    const { action, ...data } = payload;
    const result = await sheetAPI.call(action, data);

    return { ok: true, status: 200, text: JSON.stringify(result) };
  } catch (err) {
    console.error("❌ Webhook error:", err);
    return { ok: false, err: err.toString() };
  }
}

/**
 * Checks if a column already exists for a specific boss spawn to prevent duplicates.
 * First checks local cache (activeColumns), then queries Google Sheets if not found.
 * Uses normalized timestamps to handle format variations.
 *
 * @param {string} boss - Boss name to check
 * @param {string} timestamp - Spawn timestamp in "MM/DD/YY HH:MM" format
 * @returns {Promise<boolean>} True if column exists, false otherwise
 *
 * @example
 * const exists = await checkColumnExists("VALAKAS", "11/05/25 14:30");
 * if (exists) {
 *   console.log("Spawn already tracked, blocking duplicate");
 * }
 */
async function checkColumnExists(boss, timestamp) {
  const normalizedTimestamp = normalizeTimestamp(timestamp);

  // Check activeColumns cache with normalized timestamp comparison
  for (const key of Object.keys(activeColumns)) {
    const [keyBoss, keyTimestamp] = key.split('|');
    const normalizedKeyTimestamp = normalizeTimestamp(keyTimestamp);
    if (keyBoss.toUpperCase() === boss.toUpperCase() &&
        normalizedKeyTimestamp === normalizedTimestamp) {
      return true;
    }
  }

  // Query Google Sheets if not found in cache
  const resp = await postToSheet({ action: "checkColumn", boss, timestamp });
  if (resp.ok) {
    try {
      const data = JSON.parse(resp.text);
      return data.exists === true;
    } catch (e) {
      return false;
    }
  }
  return false;
}

// ═══════════════════════════════════════════════════════════════════════════════
// REACTION MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Removes all reactions from a message with retry logic for reliability.
 * Discord API can be unreliable, so this implements multiple retry attempts.
 *
 * @param {Message} message - Discord message object to remove reactions from
 * @param {number} [attempts=TIMING.REACTION_RETRY_ATTEMPTS] - Number of retry attempts
 * @returns {Promise<boolean>} True if successful, false if all attempts failed
 *
 * @example
 * const success = await removeAllReactionsWithRetry(message, 3);
 * if (!success) {
 *   console.warn("Failed to remove reactions after 3 attempts");
 * }
 */
async function removeAllReactionsWithRetry(
  message,
  attempts = TIMING.REACTION_RETRY_ATTEMPTS
) {
  for (let i = 0; i < attempts; i++) {
    try {
      await message.reactions.removeAll();
      return true;
    } catch (err) {
      if (i < attempts - 1)
        await new Promise((resolve) =>
          setTimeout(resolve, TIMING.REACTION_RETRY_DELAY)
        );
    }
  }
  return false;
}

/**
 * Removes all reactions from all messages in a thread.
 * Used when closing attendance threads to clean up verification reactions.
 * Processes up to 100 most recent messages with rate limiting between removals.
 *
 * @param {ThreadChannel} thread - Discord thread to clean up
 * @returns {Promise<Object>} Result object with success and failed counts
 * @returns {number} return.success - Number of messages successfully cleaned
 * @returns {number} return.failed - Number of messages that failed to clean
 *
 * @example
 * const result = await cleanupAllThreadReactions(thread);
 * console.log(`Cleaned ${result.success} messages, ${result.failed} failed`);
 */
async function cleanupAllThreadReactions(thread) {
  try {
    // Fetch recent messages (limit 100 for memory optimization)
    const messages = await thread.messages
      .fetch({ limit: 100 })
      .catch(() => null);
    if (!messages) return { success: 0, failed: 0 };

    let successCount = 0,
      failCount = 0;

    // Process each message with reactions
    for (const [msgId, msg] of messages) {
      if (msg.reactions.cache.size === 0) continue;
      const success = await removeAllReactionsWithRetry(msg);
      success ? successCount++ : failCount++;
      // Small delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    return { success: successCount, failed: failCount };
  } catch (err) {
    return { success: 0, failed: 0 };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// THREAD CREATION AND MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Creates attendance and confirmation threads for a new boss spawn.
 *
 * This is the main entry point for the attendance workflow. It performs the following:
 * 1. Validates the spawn doesn't already exist (prevents duplicates)
 * 2. Creates two threads: attendance thread (public) and confirmation thread (admin)
 * 3. Registers spawn in activeSpawns and activeColumns for tracking
 * 4. Posts embedded instructions to attendance thread with @everyone ping
 * 5. Posts notification to admin confirmation thread
 *
 * POINTS CALCULATION:
 * Points are defined in the bossPoints configuration object and vary by boss difficulty.
 * For example: VALAKAS = 100 points, ANT_QUEEN = 50 points, etc.
 *
 * @param {Client} client - Discord.js client instance
 * @param {string} bossName - Normalized boss name (e.g., "VALAKAS", "ANT_QUEEN")
 * @param {string} dateStr - Date string in "MM/DD/YY" format
 * @param {string} timeStr - Time string in "HH:MM" format (24-hour)
 * @param {string} fullTimestamp - Full timestamp in "MM/DD/YY HH:MM" format
 * @param {string} triggerSource - Source that triggered spawn (e.g., "manual", "auto", "bid_auction")
 * @returns {Promise<void>}
 *
 * @example
 * await createSpawnThreads(
 *   client,
 *   "VALAKAS",
 *   "11/05/25",
 *   "14:30",
 *   "11/05/25 14:30",
 *   "manual"
 * );
 */
async function createSpawnThreads(
  client,
  bossName,
  dateStr,
  timeStr,
  fullTimestamp,
  triggerSource
) {
  // Fetch required guild and channels
  const mainGuild = await client.guilds
    .fetch(config.main_guild_id)
    .catch(() => null);
  if (!mainGuild) return;

  const attChannel = await mainGuild.channels
    .fetch(config.attendance_channel_id)
    .catch(() => null);
  const adminLogs = await mainGuild.channels
    .fetch(config.admin_logs_channel_id)
    .catch(() => null);

  if (!attChannel || !adminLogs) return;

  // Prevent duplicate spawns by checking if column already exists
  const columnExists = await checkColumnExists(bossName, fullTimestamp);
  if (columnExists) {
    await adminLogs.send(
      `⚠️ **BLOCKED SPAWN:** ${bossName} at ${fullTimestamp}\nColumn already exists.`
    );
    return;
  }

  const threadTitle = `[${dateStr} ${timeStr}] ${bossName}`;

  // Create both threads in parallel for efficiency
  const [attThread, confirmThread] = await Promise.all([
    attChannel.threads.create({
      name: threadTitle,
      autoArchiveDuration: config.auto_archive_minutes,
      reason: `Boss spawn: ${bossName}`,
    }),
    adminLogs.threads.create({
      name: `✅ ${threadTitle}`,
      autoArchiveDuration: config.auto_archive_minutes,
      reason: `Confirmation: ${bossName}`,
    }),
  ]);

  if (!attThread) return;

  // Register spawn in state tracking
  activeSpawns[attThread.id] = {
    boss: bossName,
    date: dateStr,
    time: timeStr,
    timestamp: fullTimestamp,
    members: [],
    confirmThreadId: confirmThread ? confirmThread.id : null,
    closed: false,
  };

  // Register in activeColumns for duplicate prevention
  activeColumns[`${bossName}|${fullTimestamp}`] = attThread.id;

  // Create and send attendance instructions embed
  const embed = new EmbedBuilder()
    .setColor(0xffd700)
    .setTitle(`🎯 ${bossName}`)
    .setDescription(`Boss detected! Please check in below.`)
    .addFields(
      {
        name: "📸 How to Check In",
        value:
          "1. Post `present` or `here`\n2. Attach screenshot (admins exempt)\n3. Wait for admin ✅",
      },
      {
        name: "📊 Points",
        value: `${bossPoints[bossName].points} points`,
        inline: true,
      },
      { name: "🕐 Time", value: timeStr, inline: true },
      { name: "📅 Date", value: dateStr, inline: true }
    )
    .setFooter({ text: 'Admins: type "close" to finalize' })
    .setTimestamp();

  // Notify all members in attendance channel
  await attThread.send({ content: "@everyone", embeds: [embed] });

  // Notify admins in confirmation thread
  if (confirmThread) {
    await confirmThread.send(
      `🟨 **${bossName}** spawn detected (${fullTimestamp}).`
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// STATE RECOVERY MECHANISMS
// ═══════════════════════════════════════════════════════════════════════════════
//
// The recovery system uses a multi-sweep approach to rebuild bot state after crashes:
// - SWEEP 1: Thread-based recovery - Scans active Discord threads
// - SWEEP 2: (Future) Sheet-based recovery - Validates against Google Sheets
// - SWEEP 3: Cross-reference validation - Identifies discrepancies
//
// This ensures the bot can recover from crashes without losing attendance data.
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * SWEEP 1 HELPER: Scans a single thread for pending verifications and closures.
 *
 * This function is part of the thread-based recovery mechanism. It:
 * 1. Fetches recent messages (limited to 50 for memory optimization)
 * 2. Identifies already-verified members from bot confirmation messages
 * 3. Finds pending member check-ins that need admin verification
 * 4. Detects pending closure confirmations
 * 5. Re-adds missing reactions to check-in messages
 *
 * VERIFICATION WORKFLOW:
 * - Member posts "present" or "here" with screenshot
 * - Bot adds ✅ (verify) and ❌ (reject) reactions
 * - Admin reacts with ✅ to verify
 * - Bot removes reactions and posts confirmation message
 * - Member added to Google Sheets with points
 *
 * @param {ThreadChannel} thread - Discord thread to scan
 * @param {Client} client - Discord.js client instance
 * @param {string} bossName - Boss name for this spawn
 * @param {Object} parsed - Parsed thread name data
 * @returns {Promise<Object>} Scan results
 * @returns {Array<string>} return.members - Already verified member names
 * @returns {Array<Object>} return.pending - Pending verification data
 * @returns {Array<Object>} return.confirmations - Pending closure confirmations
 *
 * @example
 * const result = await scanThreadForPendingReactions(thread, client, "VALAKAS", parsed);
 * console.log(`Found ${result.members.length} verified, ${result.pending.length} pending`);
 */
async function scanThreadForPendingReactions(thread, client, bossName, parsed) {
  // Fetch recent messages (reduced from 100 to 50 for memory optimization)
  const messages = await thread.messages.fetch({ limit: 50 }).catch(() => null);
  if (!messages) return { members: [], pending: [], confirmations: [] };

  const members = [];
  const pending = [];
  const confirmations = [];

  for (const [msgId, msg] of messages) {
    // Process bot messages for verification history and closure prompts
    if (msg.author.id === client.user.id) {
      // Extract already-verified members from bot confirmation messages
      if (msg.content.includes("verified by")) {
        const match = msg.content.match(/\*\*(.+?)\*\* verified by/);
        if (match) members.push(match[1]);
      }

      // Detect pending closure confirmations
      if (msg.content.includes("React ✅ to confirm") && msg.content.includes("Close spawn")) {
        const hasReactions = msg.reactions.cache.has("✅") && msg.reactions.cache.has("❌");
        if (hasReactions) {
          confirmations.push({
            messageId: msgId,
            timestamp: msg.createdTimestamp
          });
        }
      }
      continue;
    }

    // Process member check-in messages
    const content = msg.content.trim().toLowerCase();
    const keyword = content.split(/\s+/)[0];

    // Check if message is a valid check-in keyword
    if (["present", "here", "join", "checkin", "check-in"].includes(keyword)) {
      const hasCheckmark = msg.reactions.cache.has("✅");
      const hasX = msg.reactions.cache.has("❌");

      // Get member display name (nickname or username)
      const author = await thread.guild.members.fetch(msg.author.id).catch(() => null);
      const username = author ? (author.nickname || msg.author.username) : msg.author.username;

      // Case 1: Has both reactions - check if already verified
      if (hasCheckmark && hasX) {
        // Look for verification confirmation message
        const hasVerificationReply = messages.some(
          (m) =>
            m.reference?.messageId === msgId &&
            m.author.id === client.user.id &&
            m.content.includes("verified")
        );

        // If not verified, add to pending queue
        if (!hasVerificationReply) {
          pending.push({
            messageId: msgId,
            author: username,
            authorId: msg.author.id,
            timestamp: msg.createdTimestamp
          });
        }
      }
      // Case 2: Missing reactions - re-add them for recovery
      else if (!hasCheckmark || !hasX) {
        try {
          if (!hasCheckmark) await msg.react("✅");
          if (!hasX) await msg.react("❌");

          pending.push({
            messageId: msgId,
            author: username,
            authorId: msg.author.id,
            timestamp: msg.createdTimestamp
          });

          console.log(`  ├─ ✅ Re-added reactions to ${username}'s check-in`);
        } catch (err) {
          console.warn(`  ├─ ⚠️ Could not add reactions to message ${msgId}: ${err.message}`);
        }
      }
    }
  }

  return { members, pending, confirmations };
}

/**
 * SWEEP 1: Recovers bot state by scanning all active Discord threads.
 *
 * This is the primary recovery mechanism after bot crashes or restarts. It:
 * 1. Fetches all active threads from attendance and admin channels
 * 2. Parses thread names to extract boss and timestamp information
 * 3. Scans each thread for verified members and pending verifications
 * 4. Rebuilds activeSpawns, activeColumns, pendingVerifications, and pendingClosures
 * 5. Processes threads in parallel for performance optimization
 *
 * RECOVERY PROCESS:
 * - Scans thread messages to find check-in messages
 * - Re-adds missing ✅/❌ reactions to check-in messages
 * - Identifies already-verified members from bot confirmation messages
 * - Detects pending closure confirmations
 * - Links attendance threads with their admin confirmation threads
 *
 * @param {Client} client - Discord.js client instance
 * @returns {Promise<Object>} Recovery statistics
 * @returns {boolean} return.success - Whether recovery succeeded
 * @returns {number} return.recovered - Number of spawns recovered
 * @returns {number} return.pending - Number of pending verifications found
 * @returns {number} return.confirmations - Number of pending closures found
 * @returns {number} return.reactionsAdded - Number of reactions re-added
 *
 * @example
 * const result = await recoverStateFromThreads(client);
 * console.log(`Recovered ${result.recovered} spawns with ${result.pending} pending verifications`);
 */
async function recoverStateFromThreads(client) {
  console.log("═══════════════════════════════════════════════════════");
  console.log("🔄 SWEEP 1: ENHANCED THREAD RECOVERY");
  console.log("═══════════════════════════════════════════════════════");

  try {
    const [attChannel, adminLogs] = await Promise.all([
      discordCache.getChannel('attendance_channel_id').catch(() => null),
      discordCache.getChannel('admin_logs_channel_id').catch(() => null)
    ]);

    if (!attChannel || !adminLogs) {
      console.log("❌ Could not fetch required channels");
      return { success: false, recovered: 0, pending: 0 };
    }

    const attThreads = await attChannel.threads.fetchActive().catch(() => null);
    if (!attThreads) {
      console.log("❌ Could not fetch active threads");
      return { success: false, recovered: 0, pending: 0 };
    }

    const adminThreads = await adminLogs.threads.fetchActive().catch(() => null);

    let recoveredCount = 0;
    let pendingCount = 0;
    let reactionsAddedCount = 0;
    let confirmationsCount = 0;

    const threadProcessingPromises = [];

    for (const [threadId, thread] of attThreads.threads) {
      // Process threads in parallel as requested
      const promise = (async () => {
        const parsed = parseThreadName(thread.name);
        if (!parsed) {
          console.log(`⚠️ Could not parse thread name: ${thread.name}`);
          return;
        }

        const bossName = findBossMatch(parsed.boss);
        if (!bossName || thread.archived) {
          console.log(`⚠️ Unknown boss or archived: ${parsed.boss}`);
          return;
        }

        console.log(`\n📋 Processing: ${thread.name} (ID: ${threadId})`);

        // Find corresponding confirmation thread
        let confirmThreadId = null;
        if (adminThreads) {
          for (const [id, adminThread] of adminThreads.threads) {
            if (adminThread.name === `✅ ${thread.name}`) {
              confirmThreadId = id;
              console.log(`  ├─ 🔗 Found confirmation thread: ${id}`);
              break;
            }
          }
        }

        // Deep scan thread for all pending items
        const scanResult = await scanThreadForPendingReactions(thread, client, bossName, parsed);

        console.log(`  ├─ 👥 Verified members: ${scanResult.members.length}`);
        console.log(`  ├─ ⏳ Pending verifications: ${scanResult.pending.length}`);
        console.log(`  ├─ 🔒 Pending closures: ${scanResult.confirmations.length}`);

        // Store spawn info
        activeSpawns[threadId] = {
          boss: bossName,
          date: parsed.date,
          time: parsed.time,
          timestamp: parsed.timestamp,
          members: scanResult.members,
          confirmThreadId: confirmThreadId,
          closed: false,
        };

        activeColumns[`${bossName}|${parsed.timestamp}`] = threadId;

        // Store pending verifications
        scanResult.pending.forEach(p => {
          pendingVerifications[p.messageId] = {
            author: p.author,
            authorId: p.authorId,
            threadId: thread.id,
            timestamp: p.timestamp,
          };
          pendingCount++;
        });

        // Store pending closures
        scanResult.confirmations.forEach(c => {
          pendingClosures[c.messageId] = {
            threadId: thread.id,
            timestamp: c.timestamp,
            type: "close",
          };
          confirmationsCount++;
        });

        recoveredCount++;
      })();

      threadProcessingPromises.push(promise);
    }

    // Wait for all threads to be processed in parallel
    await Promise.all(threadProcessingPromises);

    console.log("\n✅ SWEEP 1 COMPLETE");
    console.log(`   ├─ Spawns recovered: ${recoveredCount}`);
    console.log(`   ├─ Pending verifications: ${pendingCount}`);
    console.log(`   ├─ Pending closures: ${confirmationsCount}`);
    console.log(`   └─ Reactions added: ${reactionsAddedCount}`);

    return {
      success: true,
      recovered: recoveredCount,
      pending: pendingCount,
      confirmations: confirmationsCount,
      reactionsAdded: reactionsAddedCount
    };

  } catch (err) {
    console.error("❌ SWEEP 1 ERROR:", err);
    return { success: false, recovered: 0, pending: 0, error: err.message };
  }
}

/**
 * SWEEP 3: Validates state consistency between Discord threads and Google Sheets.
 *
 * This cross-reference validation detects discrepancies between the bot's local state
 * and the Google Sheets backend. It helps identify:
 * 1. Threads without corresponding columns in Google Sheets
 * 2. Recent columns in Google Sheets without active threads (< 3 hours old)
 * 3. Duplicate columns for the same boss spawn
 *
 * This validation is critical for data integrity and helps detect sync issues,
 * duplicate spawns, or incomplete thread closures.
 *
 * @param {Client} client - Discord.js client instance
 * @returns {Promise<Object|null>} Discrepancy report or null on error
 * @returns {Array<Object>} return.threadsWithoutColumns - Threads missing sheet columns
 * @returns {Array<Object>} return.columnsWithoutThreads - Recent columns without threads
 * @returns {Array<Object>} return.duplicateColumns - Duplicate spawn columns
 *
 * @example
 * const discrepancies = await validateStateConsistency(client);
 * if (discrepancies.threadsWithoutColumns.length > 0) {
 *   console.warn("Found threads without Google Sheets columns!");
 * }
 */
async function validateStateConsistency(client) {
  console.log("\n═══════════════════════════════════════════════════════");
  console.log("🔍 SWEEP 3: CROSS-REFERENCE VALIDATION");
  console.log("═══════════════════════════════════════════════════════");

  try {
    const discrepancies = {
      threadsWithoutColumns: [],
      columnsWithoutThreads: [],
      duplicateColumns: []
    };

    // Get current week sheet
    const weekSheet = getSundayOfWeek();
    const sheetName = `ELYSIUM_WEEK_${weekSheet}`;

    console.log(`📊 Checking consistency with sheet: ${sheetName}`);

    // Fetch sheet columns
    let sheetColumns = [];
    try {
      const data = await sheetAPI.call('getAllSpawnColumns', {
        weekSheet: sheetName
      });
      sheetColumns = data.columns || [];
    } catch (e) {
      console.log("⚠️ Could not fetch sheet columns:", e.message);
    }

    console.log(`📋 Found ${sheetColumns.length} columns in sheet`);
    console.log(`📋 Found ${Object.keys(activeSpawns).length} active spawns in memory`);

    // Check 1: Threads without sheet columns
    for (const [threadId, spawn] of Object.entries(activeSpawns)) {
      const key = `${spawn.boss}|${spawn.timestamp}`;
      const normalizedSpawnTimestamp = normalizeTimestamp(spawn.timestamp);

      const hasColumn = sheetColumns.some(col => {
        const normalizedColTimestamp = normalizeTimestamp(col.timestamp);
        return col.boss.toUpperCase() === spawn.boss.toUpperCase() &&
               normalizedColTimestamp === normalizedSpawnTimestamp;
      });

      if (!hasColumn) {
        discrepancies.threadsWithoutColumns.push({
          threadId,
          boss: spawn.boss,
          timestamp: spawn.timestamp,
          members: spawn.members.length
        });
      }
    }

    // Check 2: Sheet columns without threads (only recent ones - older than 3 hours are expected to be closed)
    const threeHoursAgo = Date.now() - (3 * 60 * 60 * 1000);
    for (const col of sheetColumns) {
      const normalizedColTimestamp = normalizeTimestamp(col.timestamp);

      // Check if any activeColumns entry matches (by comparing normalized timestamps)
      const hasThread = Object.keys(activeColumns).some(key => {
        const [boss, timestamp] = key.split('|');
        const normalizedActiveTimestamp = normalizeTimestamp(timestamp);
        return boss.toUpperCase() === col.boss.toUpperCase() &&
               normalizedActiveTimestamp === normalizedColTimestamp;
      });

      if (!hasThread) {
        // Only report as discrepancy if the spawn is recent (within 3 hours)
        // Old spawns are expected to have closed threads
        try {
          // Parse MM/DD/YY HH:MM format properly
          const match = col.timestamp.match(/(\d{2})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2})/);
          if (match) {
            const [_, month, day, year, hour, minute] = match;
            // Construct full year (assume 20xx for years 00-99)
            const fullYear = 2000 + parseInt(year);
            const colTime = new Date(fullYear, parseInt(month) - 1, parseInt(day), parseInt(hour), parseInt(minute)).getTime();

            if (colTime > threeHoursAgo) {
              discrepancies.columnsWithoutThreads.push({
                boss: col.boss,
                timestamp: col.timestamp,
                column: col.column
              });
            }
          }
        } catch (err) {
          // If we can't parse the timestamp, don't report it
          // This avoids false positives for old or malformed timestamps
        }
      }
    }

    // Check 3: Duplicate columns (same boss+timestamp)
    const columnKeys = {};
    for (const col of sheetColumns) {
      const normalizedTimestamp = normalizeTimestamp(col.timestamp);
      const key = `${col.boss.toUpperCase()}|${normalizedTimestamp}`;
      if (columnKeys[key]) {
        discrepancies.duplicateColumns.push({
          boss: col.boss,
          timestamp: col.timestamp,
          columns: [columnKeys[key], col.column]
        });
      } else {
        columnKeys[key] = col.column;
      }
    }

    // Log results
    console.log("\n📊 VALIDATION RESULTS:");
    console.log(`   ├─ Threads without columns: ${discrepancies.threadsWithoutColumns.length}`);
    console.log(`   ├─ Columns without threads: ${discrepancies.columnsWithoutThreads.length}`);
    console.log(`   └─ Duplicate columns: ${discrepancies.duplicateColumns.length}`);

    if (discrepancies.threadsWithoutColumns.length > 0) {
      console.log("\n⚠️ THREADS WITHOUT COLUMNS:");
      discrepancies.threadsWithoutColumns.forEach(t => {
        console.log(`   ├─ ${t.boss} (${t.timestamp}) - ${t.members} members - Thread: ${t.threadId}`);
      });
    }

    if (discrepancies.columnsWithoutThreads.length > 0) {
      console.log("\n⚠️ COLUMNS WITHOUT THREADS:");
      discrepancies.columnsWithoutThreads.forEach(c => {
        console.log(`   ├─ ${c.boss} (${c.timestamp}) - Column ${c.column}`);
      });
    }

    if (discrepancies.duplicateColumns.length > 0) {
      console.log("\n⚠️ DUPLICATE COLUMNS:");
      discrepancies.duplicateColumns.forEach(d => {
        console.log(`   ├─ ${d.boss} (${d.timestamp}) - Columns: ${d.columns.join(', ')}`);
      });
    }

    return discrepancies;

  } catch (err) {
    console.error("❌ SWEEP 3 ERROR:", err);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// STATE PERSISTENCE (GOOGLE SHEETS)
// ═══════════════════════════════════════════════════════════════════════════════
//
// State persistence is critical for crash recovery on platforms like Koyeb where
// containers can be restarted at any time. The bot periodically syncs its state
// to Google Sheets and restores it on startup.
//
// Memory optimization is implemented through:
// - Reduced sync frequency (10 minutes instead of constant)
// - Automatic cleanup of stale entries (24+ hours old)
// - Bounded data structures (max 100 pending verifications)
// ═══════════════════════════════════════════════════════════════════════════════

let lastAttendanceStateSyncTime = 0;                     // Last sync timestamp
const ATTENDANCE_STATE_SYNC_INTERVAL = 10 * 60 * 1000;   // 10 minutes
const STATE_CLEANUP_INTERVAL = 30 * 60 * 1000;           // 30 minutes
const STALE_ENTRY_AGE = 24 * 60 * 60 * 1000;             // 24 hours
const MAX_PENDING_VERIFICATIONS = 100;                   // Prevent unbounded growth
const MAX_CONFIRMATION_MESSAGES = 50;                    // Limit confirmation message storage

/**
 * Saves the current attendance state to Google Sheets for crash recovery.
 *
 * This function persists all critical bot state to Google Sheets, enabling recovery
 * after crashes or restarts. State includes:
 * - activeSpawns: Current spawn threads and their member lists
 * - activeColumns: Boss|timestamp to threadId mappings
 * - pendingVerifications: Verification messages awaiting admin action
 * - pendingClosures: Thread closure confirmations awaiting admin response
 * - confirmationMessages: Thread to confirmation message ID mappings
 *
 * Automatic rate limiting prevents excessive API calls (min 10 minutes between syncs
 * unless forceSync is true).
 *
 * @param {boolean} [forceSync=false] - If true, bypasses the sync interval check
 * @returns {Promise<boolean>} True if state was saved successfully, false otherwise
 *
 * @example
 * // Periodic sync (respects interval)
 * await saveAttendanceStateToSheet();
 *
 * // Force immediate sync (ignores interval)
 * await saveAttendanceStateToSheet(true);
 */
async function saveAttendanceStateToSheet(forceSync = false) {
  if (!config || !config.sheet_webhook_url) {
    console.warn("⚠️ Config not initialized, skipping attendance state sync");
    return false;
  }

  const now = Date.now();
  const shouldSync = forceSync || (now - lastAttendanceStateSyncTime > ATTENDANCE_STATE_SYNC_INTERVAL);

  if (!shouldSync) {
    return false;
  }

  try {
    const stateToSave = {
      activeSpawns,
      activeColumns,
      pendingVerifications,
      pendingClosures,
      confirmationMessages,
    };

    await sheetAPI.call('saveAttendanceState', {
      state: stateToSave,
    });

    lastAttendanceStateSyncTime = now;
    return true;
  } catch (err) {
    console.error("❌ Failed to save attendance state:", err.message);
    return false;
  }
}

/**
 * Loads previously saved attendance state from Google Sheets on bot startup.
 *
 * This function restores the bot's state after a crash or restart by fetching
 * the last saved state from Google Sheets. It's called during bot initialization
 * to recover from unexpected shutdowns.
 *
 * Restored state includes:
 * - activeSpawns: Spawn threads and member attendance
 * - activeColumns: Deduplication mappings
 * - pendingVerifications: Outstanding verification requests
 * - pendingClosures: Outstanding closure confirmations
 * - confirmationMessages: Message tracking data
 *
 * @returns {Promise<boolean>} True if state was loaded successfully, false otherwise
 *
 * @example
 * // Called during bot startup
 * const loaded = await loadAttendanceStateFromSheet();
 * if (loaded) {
 *   console.log("State recovered from previous session");
 * }
 */
async function loadAttendanceStateFromSheet() {
  if (!config || !config.sheet_webhook_url) {
    console.warn("⚠️ Config not initialized, cannot load attendance state");
    return false;
  }

  try {
    const data = await sheetAPI.call('getAttendanceState');

    if (!data.state) {
      console.log("ℹ️ No saved attendance state found");
      return false;
    }

    // Restore all state variables
    activeSpawns = data.state.activeSpawns || {};
    activeColumns = data.state.activeColumns || {};
    pendingVerifications = data.state.pendingVerifications || {};
    pendingClosures = data.state.pendingClosures || {};
    confirmationMessages = data.state.confirmationMessages || {};

    console.log("✅ Attendance state loaded from Google Sheets");
    console.log(`   - Active spawns: ${Object.keys(activeSpawns).length}`);
    console.log(`   - Active columns: ${Object.keys(activeColumns).length}`);
    console.log(`   - Pending verifications: ${Object.keys(pendingVerifications).length}`);
    return true;
  } catch (err) {
    console.error("❌ Failed to load attendance state:", err.message);
    return false;
  }
}

/**
 * Cleans up stale entries from state objects to prevent memory leaks.
 *
 * This maintenance function removes old data that's no longer relevant:
 * - Pending verifications older than 24 hours
 * - Pending closures older than 24 hours
 * - Enforces maximum limits on pending verifications (100 max)
 *
 * Called automatically every 30 minutes by schedulePeriodicStateSync().
 *
 * @returns {number} Number of entries cleaned up
 *
 * @example
 * const cleaned = cleanupStaleEntries();
 * console.log(`Removed ${cleaned} stale entries from memory`);
 */
function cleanupStaleEntries() {
  const now = Date.now();
  let cleaned = 0;

  // Clean up old pending verifications (older than 24 hours)
  Object.keys(pendingVerifications).forEach(msgId => {
    const entry = pendingVerifications[msgId];
    if (entry.timestamp && (now - entry.timestamp > STALE_ENTRY_AGE)) {
      delete pendingVerifications[msgId];
      cleaned++;
    }
  });

  // Clean up old confirmation messages
  // Note: confirmationMessages stores arrays of message IDs per thread
  // We can't easily determine age, so we'll rely on the MAX limit only
  // This structure is cleaned up when threads close normally

  // Clean up old pending closures (older than 24 hours)
  // Note: Some entries may not have timestamps, keep those for now
  Object.keys(pendingClosures).forEach(msgId => {
    const entry = pendingClosures[msgId];
    if (entry.timestamp && (now - entry.timestamp > STALE_ENTRY_AGE)) {
      delete pendingClosures[msgId];
      cleaned++;
    }
  });

  // Enforce max limits to prevent unbounded growth
  const pendingVerifKeys = Object.keys(pendingVerifications);
  if (pendingVerifKeys.length > MAX_PENDING_VERIFICATIONS) {
    // Remove oldest entries
    const sortedKeys = pendingVerifKeys.sort((a, b) => {
      const aTime = pendingVerifications[a].timestamp || 0;
      const bTime = pendingVerifications[b].timestamp || 0;
      return aTime - bTime;
    });
    const toRemove = sortedKeys.slice(0, sortedKeys.length - MAX_PENDING_VERIFICATIONS);
    toRemove.forEach(key => delete pendingVerifications[key]);
    cleaned += toRemove.length;
  }

  // confirmationMessages is an array-based structure, cleaned when threads close
  // No age-based cleanup needed here

  if (cleaned > 0) {
    console.log(`🧹 Cleaned up ${cleaned} stale attendance entries`);
    console.log(`   - Pending verifications: ${Object.keys(pendingVerifications).length}`);
    console.log(`   - Confirmation messages: ${Object.keys(confirmationMessages).length}`);
  }

  return cleaned;
}

/**
 * Schedules automatic periodic state synchronization and cleanup.
 *
 * Sets up two recurring tasks:
 * 1. State sync to Google Sheets every 10 minutes (for crash recovery)
 * 2. Stale entry cleanup every 30 minutes (for memory optimization)
 *
 * This function should be called once during bot initialization to establish
 * the maintenance schedule. It ensures the bot can recover from crashes and
 * doesn't accumulate stale data over time.
 *
 * @returns {void}
 *
 * @example
 * // Called once during bot startup
 * schedulePeriodicStateSync();
 * console.log("Automatic state sync and cleanup enabled");
 */
function schedulePeriodicStateSync() {
  // Sync state to sheets every 10 minutes for crash recovery
  setInterval(async () => {
    await saveAttendanceStateToSheet(false);
  }, ATTENDANCE_STATE_SYNC_INTERVAL);

  // Clean up stale entries every 30 minutes to prevent memory bloat
  setInterval(() => {
    cleanupStaleEntries();
  }, STATE_CLEANUP_INTERVAL);

  console.log("✅ Scheduled periodic state sync (10min) and cleanup (30min)");
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Exported functions and state accessors for the attendance system.
 *
 * CORE FUNCTIONS:
 * - initialize: Set up module with configuration
 * - createSpawnThreads: Create threads for new boss spawns
 * - recoverStateFromThreads: Recover state from Discord threads
 * - validateStateConsistency: Validate state against Google Sheets
 *
 * STATE PERSISTENCE:
 * - saveAttendanceStateToSheet: Save state to Google Sheets
 * - loadAttendanceStateFromSheet: Load state from Google Sheets
 * - schedulePeriodicStateSync: Enable automatic state sync
 *
 * UTILITY FUNCTIONS:
 * - findBossMatch: Match boss names with fuzzy logic
 * - postToSheet: Send data to Google Sheets API
 * - cleanupAllThreadReactions: Remove reactions from threads
 *
 * STATE ACCESSORS:
 * - getActiveSpawns: Get current spawn data
 * - getActiveColumns: Get column mappings
 * - getPendingVerifications: Get pending verifications
 * - getPendingClosures: Get pending closures
 * - getConfirmationMessages: Get confirmation message IDs
 *
 * STATE MUTATORS (Use with caution):
 * - setActiveSpawns: Replace active spawns object
 * - setActiveColumns: Replace active columns object
 * - setPendingVerifications: Replace pending verifications object
 * - setPendingClosures: Replace pending closures object
 * - setConfirmationMessages: Replace confirmation messages object
 */
module.exports = {
  // Core initialization
  initialize,

  // Utility functions from common module (re-exported for convenience)
  getCurrentTimestamp,
  getSundayOfWeek,
  formatUptime,
  findBossMatch,
  parseThreadName,

  // Google Sheets integration
  postToSheet,
  checkColumnExists,

  // Reaction management
  removeAllReactionsWithRetry,
  cleanupAllThreadReactions,

  // Thread creation and management
  createSpawnThreads,

  // State recovery
  recoverStateFromThreads,
  validateStateConsistency,

  // State persistence
  saveAttendanceStateToSheet,
  loadAttendanceStateFromSheet,
  schedulePeriodicStateSync,
  cleanupStaleEntries,

  // State getters (read-only access)
  getActiveSpawns: () => activeSpawns,
  getActiveColumns: () => activeColumns,
  getPendingVerifications: () => pendingVerifications,
  getPendingClosures: () => pendingClosures,
  getConfirmationMessages: () => confirmationMessages,

  // State setters (use with caution - primarily for recovery)
  setActiveSpawns: (val) => (activeSpawns = val),
  setActiveColumns: (val) => (activeColumns = val),
  setPendingVerifications: (val) => (pendingVerifications = val),
  setPendingClosures: (val) => (pendingClosures = val),
  setConfirmationMessages: (val) => (confirmationMessages = val),
};