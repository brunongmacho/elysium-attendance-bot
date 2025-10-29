/**
 * ELYSIUM Attendance System Module
 * Extracted from index2.js for cleaner code organization
 */

const { EmbedBuilder } = require("discord.js");
const fetch = require("node-fetch");
const levenshtein = require("fast-levenshtein");

// Module state
let config = null;
let bossPoints = null;
let isAdminFunc = null;
let activeSpawns = {};
let activeColumns = {};
let pendingVerifications = {};
let pendingClosures = {};
let confirmationMessages = {};
let lastSheetCall = 0;

const TIMING = {
  MIN_SHEET_DELAY: 2000,
  CONFIRMATION_TIMEOUT: 30000,
  RETRY_DELAY: 5000,
  MASS_CLOSE_DELAY: 3000,
  REACTION_RETRY_ATTEMPTS: 3,
  REACTION_RETRY_DELAY: 1000,
};

// Initialize module
function initialize(cfg, bossPointsData, isAdmin) {
  config = cfg;
  bossPoints = bossPointsData;
  isAdminFunc = isAdmin;
  console.log("✅ Attendance module initialized");
}

// Helper functions
function getCurrentTimestamp() {
  const d = new Date();
  const manilaTime = new Date(
    d.toLocaleString("en-US", { timeZone: "Asia/Manila" })
  );

  const month = String(manilaTime.getMonth() + 1).padStart(2, "0");
  const day = String(manilaTime.getDate()).padStart(2, "0");
  const year = String(manilaTime.getFullYear()).slice(-2);
  const hours = String(manilaTime.getHours()).padStart(2, "0");
  const mins = String(manilaTime.getMinutes()).padStart(2, "0");

  return {
    date: `${month}/${day}/${year}`,
    time: `${hours}:${mins}`,
    full: `${month}/${day}/${year} ${hours}:${mins}`,
  };
}

function getSundayOfWeek() {
  const now = new Date();
  const manilaTime = new Date(
    now.toLocaleString("en-US", { timeZone: "Asia/Manila" })
  );
  const sunday = new Date(manilaTime);
  sunday.setDate(sunday.getDate() - sunday.getDay()); // Get Sunday

  const year = sunday.getFullYear();
  const month = String(sunday.getMonth() + 1).padStart(2, "0");
  const day = String(sunday.getDate()).padStart(2, "0");

  return `${year}${month}${day}`; // Format: YYYYMMDD
}

function formatUptime(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
  if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

function findBossMatch(input) {
  const q = input.toLowerCase().trim();

  // Exact match first
  for (const name of Object.keys(bossPoints)) {
    if (name.toLowerCase() === q) return name;
    const meta = bossPoints[name];
    for (const alias of meta.aliases || []) {
      if (alias.toLowerCase() === q) return name;
    }
  }

  // Partial match (contains)
  for (const name of Object.keys(bossPoints)) {
    if (name.toLowerCase().includes(q) || q.includes(name.toLowerCase())) return name;
    const meta = bossPoints[name];
    for (const alias of meta.aliases || []) {
      if (alias.toLowerCase().includes(q) || q.includes(alias.toLowerCase())) return name;
    }
  }

  // Fuzzy match with adaptive threshold
  let best = { name: null, dist: 999 };
  for (const name of Object.keys(bossPoints)) {
    const dist = levenshtein.get(q, name.toLowerCase());
    if (dist < best.dist) best = { name, dist };
    for (const alias of bossPoints[name].aliases || []) {
      const d2 = levenshtein.get(q, alias.toLowerCase());
      if (d2 < best.dist) best = { name, dist: d2 };
    }
  }

  // Adaptive threshold: allow more errors for longer names
  const maxAllowedDistance = Math.max(2, Math.floor(q.length / 4));
  return best.dist <= maxAllowedDistance ? best.name : null;
}

function parseThreadName(name) {
  const match = name.match(/^\[(.*?)\s+(.*?)\]\s+(.+)$/);
  if (!match) return null;
  return {
    date: match[1],
    time: match[2],
    timestamp: `${match[1]} ${match[2]}`,
    boss: match[3],
  };
}

/**
 * Normalize timestamp to MM/DD/YY HH:MM format for comparison
 * Handles both formats:
 * - Bot format: "10/29/25 09:22"
 * - Google Sheets format: "Tue Oct 28 2025 18:10:00 GMT+0800 (Philippine Standard Time)"
 */
function normalizeTimestamp(timestamp) {
  if (!timestamp) return null;

  const str = timestamp.toString().trim();

  // If already in MM/DD/YY HH:MM format, return as-is
  if (/^\d{1,2}\/\d{1,2}\/\d{2}\s+\d{1,2}:\d{2}$/.test(str)) {
    return str;
  }

  // Try to parse as Date (for Google Sheets format)
  try {
    const date = new Date(str);
    if (isNaN(date.getTime())) return null;

    // Convert to Manila timezone
    const manilaTime = new Date(date.toLocaleString("en-US", { timeZone: "Asia/Manila" }));

    const month = String(manilaTime.getMonth() + 1).padStart(2, "0");
    const day = String(manilaTime.getDate()).padStart(2, "0");
    const year = String(manilaTime.getFullYear()).slice(-2);
    const hours = String(manilaTime.getHours()).padStart(2, "0");
    const mins = String(manilaTime.getMinutes()).padStart(2, "0");

    return `${month}/${day}/${year} ${hours}:${mins}`;
  } catch (e) {
    return null;
  }
}

async function postToSheet(payload, retryCount = 0) {
  const MAX_RETRIES = 3;

  try {
    const now = Date.now();
    const timeSinceLastCall = now - lastSheetCall;
    if (timeSinceLastCall < TIMING.MIN_SHEET_DELAY) {
      const waitTime = TIMING.MIN_SHEET_DELAY - timeSinceLastCall;
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }

    lastSheetCall = Date.now();

    const res = await fetch(config.sheet_webhook_url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const text = await res.text();
    if (res.status === 429) {
      if (retryCount < MAX_RETRIES) {
        console.log(`⚠️ Rate limit hit, retry ${retryCount + 1}/${MAX_RETRIES}`);
        await new Promise((resolve) => setTimeout(resolve, TIMING.RETRY_DELAY));
        return postToSheet(payload, retryCount + 1);
      } else {
        console.error(`❌ Rate limit: Max retries (${MAX_RETRIES}) exceeded`);
        return { ok: false, status: 429, text: "Max retries exceeded" };
      }
    }

    return { ok: res.ok, status: res.status, text };
  } catch (err) {
    console.error("❌ Webhook error:", err);
    return { ok: false, err: err.toString() };
  }
}

async function checkColumnExists(boss, timestamp) {
  const normalizedTimestamp = normalizeTimestamp(timestamp);

  // Check activeColumns with normalized timestamp comparison
  for (const key of Object.keys(activeColumns)) {
    const [keyBoss, keyTimestamp] = key.split('|');
    const normalizedKeyTimestamp = normalizeTimestamp(keyTimestamp);
    if (keyBoss.toUpperCase() === boss.toUpperCase() &&
        normalizedKeyTimestamp === normalizedTimestamp) {
      return true;
    }
  }

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

async function cleanupAllThreadReactions(thread) {
  try {
    const messages = await thread.messages
      .fetch({ limit: 100 })
      .catch(() => null);
    if (!messages) return { success: 0, failed: 0 };

    let successCount = 0,
      failCount = 0;
    for (const [msgId, msg] of messages) {
      if (msg.reactions.cache.size === 0) continue;
      const success = await removeAllReactionsWithRetry(msg);
      success ? successCount++ : failCount++;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    return { success: successCount, failed: failCount };
  } catch (err) {
    return { success: 0, failed: 0 };
  }
}

// Create spawn threads
async function createSpawnThreads(
  client,
  bossName,
  dateStr,
  timeStr,
  fullTimestamp,
  triggerSource
) {
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

  const columnExists = await checkColumnExists(bossName, fullTimestamp);
  if (columnExists) {
    await adminLogs.send(
      `⚠️ **BLOCKED SPAWN:** ${bossName} at ${fullTimestamp}\nColumn already exists.`
    );
    return;
  }

  const threadTitle = `[${dateStr} ${timeStr}] ${bossName}`;

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

  activeSpawns[attThread.id] = {
    boss: bossName,
    date: dateStr,
    time: timeStr,
    timestamp: fullTimestamp,
    members: [],
    confirmThreadId: confirmThread ? confirmThread.id : null,
    closed: false,
  };

  activeColumns[`${bossName}|${fullTimestamp}`] = attThread.id;

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

  await attThread.send({ content: "@everyone", embeds: [embed] });

  if (confirmThread) {
    await confirmThread.send(
      `🟨 **${bossName}** spawn detected (${fullTimestamp}).`
    );
  }
}

// State recovery
// ==========================================
// ENHANCED SWEEP 1: THREAD-BASED RECOVERY
// ==========================================

async function scanThreadForPendingReactions(thread, client, bossName, parsed) {
  const messages = await thread.messages.fetch({ limit: 100 }).catch(() => null);
  if (!messages) return { members: [], pending: [], confirmations: [] };

  const members = [];
  const pending = [];
  const confirmations = [];

  for (const [msgId, msg] of messages) {
    // Skip bot messages except specific ones
    if (msg.author.id === client.user.id) {
      // Check for already-verified members
      if (msg.content.includes("verified by")) {
        const match = msg.content.match(/\*\*(.+?)\*\* verified by/);
        if (match) members.push(match[1]);
      }

      // Check for pending closure confirmations
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

    // Check for member check-ins with missing or existing reactions
    const content = msg.content.trim().toLowerCase();
    const keyword = content.split(/\s+/)[0];

    if (["present", "here", "join", "checkin", "check-in"].includes(keyword)) {
      const hasCheckmark = msg.reactions.cache.has("✅");
      const hasX = msg.reactions.cache.has("❌");

      // Get member info
      const author = await thread.guild.members.fetch(msg.author.id).catch(() => null);
      const username = author ? (author.nickname || msg.author.username) : msg.author.username;

      // If has both reactions, it's pending verification
      if (hasCheckmark && hasX) {
        // Check if already verified (bot reply exists)
        const hasVerificationReply = messages.some(
          (m) =>
            m.reference?.messageId === msgId &&
            m.author.id === client.user.id &&
            m.content.includes("verified")
        );

        if (!hasVerificationReply) {
          pending.push({
            messageId: msgId,
            author: username,
            authorId: msg.author.id,
            timestamp: msg.createdTimestamp
          });
        }
      } 
      // If missing reactions, add them
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

async function recoverStateFromThreads(client) {
  console.log("═══════════════════════════════════════════════════════");
  console.log("🔄 SWEEP 1: ENHANCED THREAD RECOVERY");
  console.log("═══════════════════════════════════════════════════════");

  try {
    const mainGuild = await client.guilds.fetch(config.main_guild_id).catch(() => null);
    if (!mainGuild) {
      console.log("❌ Could not fetch main guild");
      return { success: false, recovered: 0, pending: 0 };
    }

    const attChannel = await mainGuild.channels.fetch(config.attendance_channel_id).catch(() => null);
    const adminLogs = await mainGuild.channels.fetch(config.admin_logs_channel_id).catch(() => null);

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

// ==========================================
// SWEEP 3: CROSS-REFERENCE VALIDATION
// ==========================================

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
    const payload = {
      action: "getAllSpawnColumns",
      weekSheet: sheetName
    };

    const resp = await fetch(config.sheet_webhook_url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    let sheetColumns = [];
    if (resp.ok) {
      try {
        const data = await resp.json();
        sheetColumns = data.columns || [];
      } catch (e) {
        console.log("⚠️ Could not parse sheet columns");
      }
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

    // Check 2: Sheet columns without threads
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
        discrepancies.columnsWithoutThreads.push({
          boss: col.boss,
          timestamp: col.timestamp,
          column: col.column
        });
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

// Load attendance for specific boss from week sheet
async function loadAttendanceForBoss(weekSheet, bossKey) {
  try {
    const payload = {
      action: "getAttendanceForBoss",
      weekSheet: weekSheet,
      bossKey: bossKey,
    };

    const resp = await fetch(config.sheet_webhook_url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!resp.ok) {
      console.error(`❌ Failed to load attendance: HTTP ${resp.status}`);
      return null;
    }

    const data = await resp.json();
    return data.attendees || [];
  } catch (err) {
    console.error(`❌ Load attendance error:`, err);
    return null;
  }
}

// STATE MANAGEMENT FOR KOYEB (Memory optimization)
let lastAttendanceStateSyncTime = 0;
const ATTENDANCE_STATE_SYNC_INTERVAL = 5 * 60 * 1000; // 5 minutes

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

    const response = await fetch(config.sheet_webhook_url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "saveAttendanceState",
        state: stateToSave,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    lastAttendanceStateSyncTime = now;
    return true;
  } catch (err) {
    console.error("❌ Failed to save attendance state:", err.message);
    return false;
  }
}

async function loadAttendanceStateFromSheet() {
  if (!config || !config.sheet_webhook_url) {
    console.warn("⚠️ Config not initialized, cannot load attendance state");
    return false;
  }

  try {
    const response = await fetch(config.sheet_webhook_url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "getAttendanceState" }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    if (!data.state) {
      console.log("ℹ️ No saved attendance state found");
      return false;
    }

    // Restore state
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

// Periodic state sync (call this periodically from main bot)
function schedulePeriodicStateSync() {
  setInterval(async () => {
    await saveAttendanceStateToSheet(false);
  }, ATTENDANCE_STATE_SYNC_INTERVAL);
}

// Export functions and state
module.exports = {
  initialize,
  getCurrentTimestamp,
  getSundayOfWeek,
  formatUptime,
  findBossMatch,
  parseThreadName,
  postToSheet,
  checkColumnExists,
  removeAllReactionsWithRetry,
  cleanupAllThreadReactions,
  createSpawnThreads,
  recoverStateFromThreads,
  validateStateConsistency,
  loadAttendanceForBoss,
  saveAttendanceStateToSheet,
  loadAttendanceStateFromSheet,
  schedulePeriodicStateSync,
  getActiveSpawns: () => activeSpawns,
  getActiveColumns: () => activeColumns,
  getPendingVerifications: () => pendingVerifications,
  getPendingClosures: () => pendingClosures,
  getConfirmationMessages: () => confirmationMessages,
  setActiveSpawns: (val) => (activeSpawns = val),
  setActiveColumns: (val) => (activeColumns = val),
  setPendingVerifications: (val) => (pendingVerifications = val),
  setPendingClosures: (val) => (pendingClosures = val),
  setConfirmationMessages: (val) => (confirmationMessages = val),
};