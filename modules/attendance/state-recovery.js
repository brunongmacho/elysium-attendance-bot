/**
 * State recovery mechanisms - multi-sweep approach to rebuild bot state after crashes.
 */

const { parseThreadName, normalizeTimestamp, getSundayOfWeek } = require('../../utils/common');
const { findBossMatch } = require('./initialization');
const state = require('./state');

// ═══════════════════════════════════════════════════════════════════════════════
// STATE RECOVERY MECHANISMS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * SWEEP 1 HELPER: Scans a single thread for pending verifications and closures.
 *
 * @param {ThreadChannel} thread - Discord thread to scan
 * @param {Client} client - Discord.js client instance
 * @param {string} bossName - Boss name for this spawn
 * @param {Object} parsed - Parsed thread name data
 * @returns {Promise<Object>} Scan results
 */
async function scanThreadForPendingReactions(thread, client, bossName, parsed) {
  // Fetch ALL messages in thread to capture all verifications (not just recent 50)
  let allMessages = new Map();
  let lastMessageId = null;
  let fetchCount = 0;
  const MAX_FETCHES = 5; // Max 500 messages (5 * 100) to prevent infinite loops

  // Paginate through messages until we've fetched all or hit the limit
  while (fetchCount < MAX_FETCHES) {
    const options = { limit: 100 };
    if (lastMessageId) {
      options.before = lastMessageId;
    }

    const batch = await thread.messages.fetch(options).catch(() => null);
    if (!batch || batch.size === 0) break;

    // Merge batch into allMessages
    batch.forEach((msg, id) => allMessages.set(id, msg));

    // If we got less than 100, we've reached the end
    if (batch.size < 100) break;

    // Get the oldest message ID from this batch for next iteration
    lastMessageId = Array.from(batch.keys()).pop();
    fetchCount++;
  }

  console.log(`📨 Fetched ${allMessages.size} messages from thread (${fetchCount + 1} API calls)`);

  const members = [];
  const pending = [];
  const confirmations = [];

  for (const [msgId, msg] of allMessages) {
    // Process bot messages for verification history and closure prompts
    if (msg.author.id === client.user.id) {
      // Extract already-verified members from bot confirmation messages
      if (msg.content.includes("verified by")) {
        const match = msg.content.match(/\*\*(.+?)\*\* verified by/);
        if (match) members.push(match[1]);
      }

      // Detect pending closure confirmations (both old reaction-based and new button-based)
      const isCloseConfirmation =
        (msg.content.includes("React ✅ to confirm") && msg.content.includes("Close spawn")) || // Old format
        (msg.embeds[0]?.title?.includes("Close Spawn Confirmation")); // New format

      if (isCloseConfirmation) {
        // Check for either reactions (old) or buttons (new)
        const hasReactions = msg.reactions.cache.has("✅") && msg.reactions.cache.has("❌");
        const hasButtons = msg.components && msg.components.length > 0;

        if (hasReactions || hasButtons) {
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

    // Fuzzy match: compress repeated characters for typo tolerance
    const fuzzyKeyword = keyword.replace(/(.)\1+/g, '$1');

    // Check if message is a valid check-in keyword (original or fuzzy)
    const checkInKeywords = ["present", "here", "join", "checkin", "check-in"];
    if (checkInKeywords.includes(keyword) || checkInKeywords.includes(fuzzyKeyword)) {
      // Get member display name (nickname or username)
      const author = await thread.guild.members.fetch(msg.author.id).catch(() => null);
      const username = author ? (author.nickname || author.displayName || msg.author.displayName || msg.author.username) : msg.author.displayName || msg.author.username;

      // Look for bot reply with buttons (new system) or verification confirmation
      const hasBotReply = Array.from(allMessages.values()).some(
        (m) =>
          m.reference?.messageId === msgId &&
          m.author.id === client.user.id &&
          (m.components?.length > 0 || m.content.includes("verified"))
      );

      // Look for verification confirmation message
      const hasVerificationReply = Array.from(allMessages.values()).some(
        (m) =>
          m.reference?.messageId === msgId &&
          m.author.id === client.user.id &&
          m.content.includes("verified")
      );

      // If has bot reply but not verified, add to pending queue
      if (hasBotReply && !hasVerificationReply) {
        pending.push({
          messageId: msgId,
          author: username,
          authorId: msg.author.id,
          timestamp: msg.createdTimestamp
        });
      }
      // Legacy support: Check for old reaction-based system
      else if (!hasBotReply) {
        const hasCheckmark = msg.reactions.cache.has("✅");
        const hasX = msg.reactions.cache.has("❌");

        // Only process if it has reactions (legacy messages)
        if (hasCheckmark && hasX && !hasVerificationReply) {
          pending.push({
            messageId: msgId,
            author: username,
            authorId: msg.author.id,
            timestamp: msg.createdTimestamp
          });
        }
      }
    }
  }

  return { members, pending, confirmations };
}

/**
 * SWEEP 1: Recovers bot state by scanning all active Discord threads.
 *
 * @param {Client} client - Discord.js client instance
 * @returns {Promise<Object>} Recovery statistics
 */
async function recoverStateFromThreads(client) {
  console.log("═══════════════════════════════════════════════════════");
  console.log("🔄 SWEEP 1: ENHANCED THREAD RECOVERY");
  console.log("═══════════════════════════════════════════════════════");

  try {
    const [attChannel, adminLogs] = await Promise.all([
      state.discordCache.getChannel('attendance_channel_id').catch(() => null),
      state.discordCache.getChannel('admin_logs_channel_id').catch(() => null)
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
        state.stateManager.activeSpawns[threadId] = {
          boss: bossName,
          date: parsed.date,
          time: parsed.time,
          timestamp: parsed.timestamp,
          members: scanResult.members,
          confirmThreadId: confirmThreadId,
          closed: false,
          createdAt: thread.createdTimestamp || Date.now(),
        };

        // Use normalized key for O(1) lookup consistency
        const normalizedRecoveryKey = `${bossName.toUpperCase()}|${normalizeTimestamp(parsed.timestamp)}`;
        state.stateManager.activeColumns[normalizedRecoveryKey] = threadId;

        // Store pending verifications
        scanResult.pending.forEach(p => {
          state.stateManager.pendingVerifications[p.messageId] = {
            author: p.author,
            authorId: p.authorId,
            threadId: thread.id,
            timestamp: p.timestamp,
          };
          pendingCount++;
        });

        // Store pending closures
        scanResult.confirmations.forEach(c => {
          state.stateManager.pendingClosures[c.messageId] = {
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
 * @param {Client} client - Discord.js client instance
 * @returns {Promise<Object|null>} Discrepancy report or null on error
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
    const sheetName = `WEEK_${weekSheet}`;

    console.log(`📊 Checking consistency with sheet: ${sheetName}`);

    // Fetch sheet columns
    let sheetColumns = [];
    try {
      const data = await state.sheetAPI.call('getAllSpawnColumns', {
        weekSheet: sheetName
      });
      sheetColumns = data.columns || [];
    } catch (e) {
      console.log("⚠️ Could not fetch sheet columns:", e.message);
    }

    console.log(`📋 Found ${sheetColumns.length} columns in sheet`);
    console.log(`📋 Found ${Object.keys(state.stateManager.activeSpawns).length} active spawns in memory`);

    // Check 1: Threads without sheet columns
    for (const [threadId, spawn] of Object.entries(state.stateManager.activeSpawns)) {
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

      // Check if any stateManager.activeColumns entry matches (by comparing normalized timestamps)
      const hasThread = Object.keys(state.stateManager.activeColumns).some(key => {
        const [boss, timestamp] = key.split('|');
        const normalizedActiveTimestamp = normalizeTimestamp(timestamp);
        return boss.toUpperCase() === col.boss.toUpperCase() &&
               normalizedActiveTimestamp === normalizedColTimestamp;
      });

      if (!hasThread) {
        // Only report as discrepancy if the spawn is recent (within 3 hours)
        try {
          const match = col.timestamp.match(/(\d{2})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2})/);
          if (match) {
            const [_, month, day, year, hour, minute] = match;
            const fullYear = 2000 + parseInt(year);

            // Parse Manila timezone timestamp correctly
            const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;
            const colTime = Date.UTC(fullYear, parseInt(month) - 1, parseInt(day), parseInt(hour), parseInt(minute)) - MANILA_OFFSET_MS;

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

module.exports = { scanThreadForPendingReactions, recoverStateFromThreads, validateStateConsistency };
