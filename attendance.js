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

  // Fuzzy match
  let best = { name: null, dist: 999 };
  for (const name of Object.keys(bossPoints)) {
    const dist = levenshtein.get(q, name.toLowerCase());
    if (dist < best.dist) best = { name, dist };
    for (const alias of bossPoints[name].aliases || []) {
      const d2 = levenshtein.get(q, alias.toLowerCase());
      if (d2 < best.dist) best = { name, dist: d2 };
    }
  }

  return best.dist <= 2 ? best.name : null;
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
  const key = `${boss}|${timestamp}`;
  if (activeColumns[key]) return true;

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
async function recoverStateFromThreads(client) {
  try {
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

    let recoveredCount = 0;
    let pendingCount = 0;

    const attThreads = await attChannel.threads.fetchActive().catch(() => null);
    if (!attThreads) return;

    const adminThreads = await adminLogs.threads
      .fetchActive()
      .catch(() => null);

    for (const [threadId, thread] of attThreads.threads) {
      const parsed = parseThreadName(thread.name);
      if (!parsed) continue;

      const bossName = findBossMatch(parsed.boss);
      if (!bossName || thread.archived) continue;

      let confirmThreadId = null;
      if (adminThreads) {
        for (const [id, adminThread] of adminThreads.threads) {
          if (adminThread.name === `✅ ${thread.name}`) {
            confirmThreadId = id;
            break;
          }
        }
      }

      const messages = await thread.messages
        .fetch({ limit: 100 })
        .catch(() => null);
      if (!messages) continue;

      const members = [];

      for (const [msgId, msg] of messages) {
        if (
          msg.author.id === client.user.id &&
          msg.content.includes("verified by")
        ) {
          const match = msg.content.match(/\*\*(.+?)\*\* verified by/);
          if (match) members.push(match[1]);
        }

        if (msg.reactions.cache.has("✅") && msg.reactions.cache.has("❌")) {
          const hasVerificationReply = messages.some(
            (m) =>
              m.reference?.messageId === msgId &&
              m.author.id === client.user.id &&
              m.content.includes("verified")
          );

          if (!hasVerificationReply) {
            const author = await mainGuild.members
              .fetch(msg.author.id)
              .catch(() => null);
            const username = author
              ? author.nickname || msg.author.username
              : msg.author.username;

            pendingVerifications[msgId] = {
              author: username,
              authorId: msg.author.id,
              threadId: thread.id,
              timestamp: msg.createdTimestamp,
            };
            pendingCount++;
          }
        }
      }

      activeSpawns[thread.id] = {
        boss: bossName,
        date: parsed.date,
        time: parsed.time,
        timestamp: parsed.timestamp,
        members: members,
        confirmThreadId: confirmThreadId,
        closed: false,
      };

      activeColumns[`${bossName}|${parsed.timestamp}`] = thread.id;
      recoveredCount++;
    }

    if (recoveredCount > 0 && adminLogs) {
      const embed = new EmbedBuilder()
        .setColor(0x00ff00)
        .setTitle("🔄 Bot State Recovered")
        .setDescription(`Recovered ${recoveredCount} spawn(s)`)
        .addFields(
          {
            name: "Spawns Recovered",
            value: `${recoveredCount}`,
            inline: true,
          },
          {
            name: "Pending Verifications",
            value: `${pendingCount}`,
            inline: true,
          }
        )
        .setTimestamp();

      await adminLogs.send({ embeds: [embed] });
    }
  } catch (err) {
    console.error("❌ State recovery error:", err);
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
    if (forceSync) {
      console.log("📊 Forced attendance state sync to Google Sheets");
    } else {
      console.log("✅ Attendance state synced to Google Sheets");
    }
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