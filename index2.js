/**
 * ELYSIUM Guild Bot - Consolidated Version 3.0
 * Features: Attendance tracking + Bidding system
 */

const { Client, GatewayIntentBits, Partials, Events, EmbedBuilder } = require("discord.js");
const fetch = require("node-fetch");
const levenshtein = require("fast-levenshtein");
const fs = require("fs");
const http = require("http");
const bidding = require("./bidding.js");

// Load configuration
const config = JSON.parse(fs.readFileSync("./config.json"));
const bossPoints = JSON.parse(fs.readFileSync("./boss_points.json"));

// Initialize Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel, Partials.Message, Partials.Reaction],
});

// ==========================================
// CONSTANTS & STATE
// ==========================================

const BOT_VERSION = "3.0";
const BOT_START_TIME = Date.now();
const PORT = process.env.PORT || 8000;

const TIMING = {
  MIN_SHEET_DELAY: 2000,
  OVERRIDE_COOLDOWN: 10000,
  CONFIRMATION_TIMEOUT: 30000,
  RETRY_DELAY: 5000,
  MASS_CLOSE_DELAY: 3000,
  REACTION_RETRY_ATTEMPTS: 3,
  REACTION_RETRY_DELAY: 1000,
};

let activeSpawns = {};
let activeColumns = {};
let pendingVerifications = {};
let pendingClosures = {};
let confirmationMessages = {};
let lastSheetCall = 0;
let lastOverrideTime = 0;

// ==========================================
// HTTP HEALTH CHECK SERVER
// ==========================================

const server = http.createServer((req, res) => {
  if (req.url === "/health" || req.url === "/") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      status: "healthy",
      version: BOT_VERSION,
      uptime: process.uptime(),
      bot: client.user ? client.user.tag : "not ready",
      activeSpawns: Object.keys(activeSpawns).length,
      pendingVerifications: Object.keys(pendingVerifications).length,
      timestamp: new Date().toISOString(),
    }));
  } else {
    res.writeHead(404);
    res.end("Not Found");
  }
});

server.listen(PORT, () => console.log(`🌐 Health check server on port ${PORT}`));

// ==========================================
// UTILITY FUNCTIONS
// ==========================================

function getCurrentTimestamp() {
  const date = new Date();
  const dateStr = date.toLocaleDateString("en-US", {
    timeZone: "Asia/Manila",
    year: "2-digit",
    month: "numeric",
    day: "numeric",
  });
  const timeStr = date.toLocaleTimeString("en-US", {
    timeZone: "Asia/Manila",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  });
  return { date: dateStr, time: timeStr, full: `${dateStr} ${timeStr}` };
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

async function removeAllReactionsWithRetry(message, attempts = TIMING.REACTION_RETRY_ATTEMPTS) {
  for (let i = 0; i < attempts; i++) {
    try {
      await message.reactions.removeAll();
      console.log(`✅ Reactions removed from message ${message.id} (attempt ${i + 1})`);
      return true;
    } catch (err) {
      console.warn(`⚠️ Failed to remove reactions from ${message.id} (attempt ${i + 1}/${attempts}): ${err.message}`);
      if (i < attempts - 1) await new Promise(resolve => setTimeout(resolve, TIMING.REACTION_RETRY_DELAY));
    }
  }
  console.error(`❌ Failed to remove reactions from ${message.id} after ${attempts} attempts`);
  return false;
}

async function cleanupAllThreadReactions(thread) {
  try {
    console.log(`🧹 Cleaning up all reactions in thread: ${thread.name}`);
    const messages = await thread.messages.fetch({ limit: 100 }).catch(() => null);
    if (!messages) return { success: 0, failed: 0 };

    let successCount = 0, failCount = 0;
    for (const [msgId, msg] of messages) {
      if (msg.reactions.cache.size === 0) continue;
      const success = await removeAllReactionsWithRetry(msg);
      success ? successCount++ : failCount++;
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    console.log(`✅ Thread cleanup complete: ${successCount} success, ${failCount} failed`);
    return { success: successCount, failed: failCount };
  } catch (err) {
    console.error(`❌ Error cleaning thread reactions: ${err.message}`);
    return { success: 0, failed: 0 };
  }
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

  // Fuzzy match with levenshtein distance
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

function isAdmin(member) {
  return member.roles.cache.some(r => config.admin_roles.includes(r.name));
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

async function postToSheet(payload) {
  try {
    const now = Date.now();
    const timeSinceLastCall = now - lastSheetCall;
    if (timeSinceLastCall < TIMING.MIN_SHEET_DELAY) {
      const waitTime = TIMING.MIN_SHEET_DELAY - timeSinceLastCall;
      console.log(`⏳ Rate limiting: waiting ${waitTime}ms...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    lastSheetCall = Date.now();

    const res = await fetch(config.sheet_webhook_url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const text = await res.text();
    console.log(`📊 Sheet response: ${res.status} - ${text.substring(0, 200)}`);

    if (res.status === 429) {
      console.error("❌ Rate limit hit! Waiting 5 seconds...");
      await new Promise(resolve => setTimeout(resolve, TIMING.RETRY_DELAY));
      return postToSheet(payload);
    }

    return { ok: res.ok, status: res.status, text };
  } catch (err) {
    console.error("❌ Webhook error:", err);
    return { ok: false, err: err.toString() };
  }
}

async function checkColumnExists(boss, timestamp) {
  const key = `${boss}|${timestamp}`;
  if (activeColumns[key]) {
    console.log(`✅ Column exists in memory: ${key}`);
    return true;
  }

  console.log(`🔍 Checking sheet for column: ${key}`);
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

// ==========================================
// SPAWN THREAD CREATION
// ==========================================

async function createSpawnThreads(bossName, dateStr, timeStr, fullTimestamp, triggerSource) {
  const mainGuild = await client.guilds.fetch(config.main_guild_id).catch(() => null);
  if (!mainGuild) return;

  const attChannel = await mainGuild.channels.fetch(config.attendance_channel_id).catch(() => null);
  const adminLogs = await mainGuild.channels.fetch(config.admin_logs_channel_id).catch(() => null);

  if (!attChannel || !adminLogs) {
    console.error("❌ Could not find channels");
    return;
  }

  const columnExists = await checkColumnExists(bossName, fullTimestamp);
  if (columnExists) {
    console.log(`⚠️ Column already exists for ${bossName} at ${fullTimestamp}. Blocking spawn.`);
    await adminLogs.send(`⚠️ **BLOCKED SPAWN:** ${bossName} at ${fullTimestamp}\nA column for this boss at this timestamp already exists. Close the existing thread first.`);
    return;
  }

  const threadTitle = `[${dateStr} ${timeStr}] ${bossName}`;

  const [attThread, confirmThread] = await Promise.all([
    attChannel.threads.create({
      name: threadTitle,
      autoArchiveDuration: config.auto_archive_minutes,
      reason: `Boss spawn: ${bossName}`,
    }).catch(err => {
      console.error("❌ Failed to create attendance thread:", err);
      return null;
    }),
    adminLogs.threads.create({
      name: `✅ ${threadTitle}`,
      autoArchiveDuration: config.auto_archive_minutes,
      reason: `Confirmation thread: ${bossName}`,
    }).catch(err => {
      console.error("❌ Failed to create confirmation thread:", err);
      return null;
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
      { name: "📸 How to Check In", value: "1. Post `present` or `here`\n2. Attach a screenshot (admins exempt)\n3. Wait for admin ✅" },
      { name: "📊 Points", value: `${bossPoints[bossName].points} points`, inline: true },
      { name: "🕐 Time", value: timeStr, inline: true },
      { name: "📅 Date", value: dateStr, inline: true }
    )
    .setFooter({ text: 'Admins: type "close" to finalize and submit attendance' })
    .setTimestamp();

  await attThread.send({ content: "@everyone", embeds: [embed] });

  if (confirmThread) {
    await confirmThread.send(`🟨 **${bossName}** spawn detected (${fullTimestamp}). Verifications will appear here.`);
  }

  console.log(`✅ Created threads for ${bossName} at ${fullTimestamp} (${triggerSource})`);
}

// ==========================================
// STATE RECOVERY ON STARTUP
// ==========================================

async function recoverStateFromThreads() {
  try {
    console.log("🔄 Scanning for existing threads...");

    const mainGuild = await client.guilds.fetch(config.main_guild_id).catch(() => null);
    if (!mainGuild) {
      console.log("❌ Could not fetch main guild for state recovery");
      return;
    }

    const attChannel = await mainGuild.channels.fetch(config.attendance_channel_id).catch(() => null);
    const adminLogs = await mainGuild.channels.fetch(config.admin_logs_channel_id).catch(() => null);

    if (!attChannel || !adminLogs) {
      console.log("❌ Could not fetch channels for state recovery");
      return;
    }

    let recoveredCount = 0;
    let pendingCount = 0;

    const attThreads = await attChannel.threads.fetchActive().catch(() => null);
    if (!attThreads) {
      console.log("🔭 No active threads found to recover");
      return;
    }

    const threadDataPromises = [];

    for (const [threadId, thread] of attThreads.threads) {
      const parsed = parseThreadName(thread.name);
      if (!parsed) continue;

      const bossName = findBossMatch(parsed.boss);
      if (!bossName) continue;

      threadDataPromises.push({
        thread,
        parsed,
        bossName,
        messagesPromise: thread.messages.fetch({ limit: 100 }).catch(() => null),
      });
    }

    const threadDataResults = await Promise.all(
      threadDataPromises.map(async data => ({
        ...data,
        messages: await data.messagesPromise,
      }))
    );

    const adminThreads = await adminLogs.threads.fetchActive().catch(() => null);

    for (const { thread, parsed, bossName, messages } of threadDataResults) {
      if (!messages) continue;

      if (thread.archived) {
        console.log(`⏸️ Skipping archived thread: ${bossName} at ${parsed.timestamp}`);
        continue;
      }

      let confirmThreadId = null;
      if (adminThreads) {
        for (const [id, adminThread] of adminThreads.threads) {
          if (adminThread.name === `✅ ${thread.name}`) {
            confirmThreadId = id;
            break;
          }
        }
      }

      const members = [];

      for (const [msgId, msg] of messages) {
        if (msg.author.id === client.user.id && msg.content.includes("verified by")) {
          const match = msg.content.match(/\*\*(.+?)\*\* verified by/);
          if (match) members.push(match[1]);
        }

        if (msg.reactions.cache.has("✅") && msg.reactions.cache.has("❌")) {
          const isConfirmation = msg.content.includes("Close spawn") ||
            msg.content.includes("close spawn") ||
            msg.content.includes("React ✅ to confirm") ||
            msg.content.includes("Clear all bot memory") ||
            msg.content.includes("Force submit attendance") ||
            msg.content.includes("MASS CLOSE ALL THREADS");

          if (isConfirmation) {
            console.log(`⭐ Skipping confirmation message: ${msgId}`);
            continue;
          }

          const hasVerificationReply = messages.some(m =>
            m.reference?.messageId === msgId &&
            m.author.id === client.user.id &&
            m.content.includes("verified")
          );

          if (!hasVerificationReply) {
            const author = await mainGuild.members.fetch(msg.author.id).catch(() => null);
            const username = author ? author.nickname || msg.author.username : msg.author.username;

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
      console.log(`✅ Recovered: ${bossName} at ${parsed.timestamp} - ${members.length} verified, ${pendingCount} pending`);
    }

    if (recoveredCount > 0) {
      console.log(`🎉 State recovery complete! Recovered ${recoveredCount} spawn(s), ${pendingCount} pending verification(s)`);

      if (adminLogs) {
        const embed = new EmbedBuilder()
          .setColor(0x00ff00)
          .setTitle("🔄 Bot State Recovered")
          .setDescription(`Bot restarted and recovered existing threads`)
          .addFields(
            { name: "Spawns Recovered", value: `${recoveredCount}`, inline: true },
            { name: "Pending Verifications", value: `${pendingCount}`, inline: true }
          )
          .setTimestamp();

        await adminLogs.send({ embeds: [embed] });
      }
    } else {
      console.log("🔭 No active threads found to recover");
    }
  } catch (err) {
    console.error("❌ Error during state recovery:", err);
  }
}

// ==========================================
// COMMAND HANDLERS
// ==========================================

const commandHandlers = {
  // Attendance commands
  status: async (message, member) => {
    const guild = message.guild;
    const uptime = formatUptime(Date.now() - BOT_START_TIME);
    const timeSinceSheet = lastSheetCall > 0 ? `${Math.floor((Date.now() - lastSheetCall) / 1000)} seconds ago` : "Never";
    const totalSpawns = Object.keys(activeSpawns).length;

    const activeSpawnEntries = Object.entries(activeSpawns);
    const sortedSpawns = activeSpawnEntries.sort((a, b) => {
      const parseTimestamp = ts => {
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

      return `${i + 1}. **${info.boss}** (${info.timestamp}) - ${info.members.length} verified - ${ageText} - <#${threadId}>`;
    });

    const spawnListText = spawnList.length > 0 ? spawnList.join("\n") : "None";
    const moreSpawns = totalSpawns > 10 ? `\n\n*+${totalSpawns - 10} more spawns (sorted oldest first - close old ones first!)*` : "";

    const embed = new EmbedBuilder()
      .setColor(0x00ff00)
      .setTitle("📊 Bot Status")
      .setDescription("✅ **Healthy**")
      .addFields(
        { name: "⏱️ Uptime", value: uptime, inline: true },
        { name: "🤖 Version", value: BOT_VERSION, inline: true },
        { name: "🎯 Active Spawns", value: `${totalSpawns}`, inline: true },
        { name: "📋 Recent Spawn Threads (Oldest First)", value: spawnListText + moreSpawns },
        { name: "⏳ Pending Verifications", value: `${Object.keys(pendingVerifications).length}`, inline: true },
        { name: "🔒 Pending Closures", value: `${Object.keys(pendingClosures).length}`, inline: true },
        { name: "📊 Last Sheet Call", value: timeSinceSheet, inline: true },
        { name: "💾 Memory", value: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`, inline: true }
      )
      .setFooter({ text: `Requested by ${member.user.username} • Threads sorted by age (oldest first)` })
      .setTimestamp();

    await message.reply({ embeds: [embed] });
  },

  clearstate: async (message, member) => {
    const confirmMsg = await message.reply(
      `⚠️ **WARNING: Clear all bot memory?**\n\n` +
      `This will clear:\n` +
      `• ${Object.keys(activeSpawns).length} active spawn(s)\n` +
      `• ${Object.keys(pendingVerifications).length} pending verification(s)\n` +
      `• ${Object.keys(activeColumns).length} active column(s)\n\n` +
      `React ✅ to confirm or ❌ to cancel.`
    );

    await confirmMsg.react("✅");
    await confirmMsg.react("❌");

    const filter = (reaction, user) => ["✅", "❌"].includes(reaction.emoji.name) && user.id === member.user.id;

    try {
      const collected = await confirmMsg.awaitReactions({ filter, max: 1, time: TIMING.CONFIRMATION_TIMEOUT, errors: ["time"] });
      const reaction = collected.first();

      if (reaction.emoji.name === "✅") {
        activeSpawns = {};
        activeColumns = {};
        pendingVerifications = {};
        pendingClosures = {};
        confirmationMessages = {};

        await message.reply(`✅ **State cleared successfully!**\n\nAll bot memory has been reset. Fresh start.`);
        console.log(`🔧 State cleared by ${member.user.username}`);
      } else {
        await message.reply("❌ Clear state canceled.");
      }
    } catch (err) {
      await message.reply("⏱️ Confirmation timed out. Clear state canceled.");
    }
  },

  closeallthread: async (message, member) => {
    const guild = message.guild;
    const attChannel = await guild.channels.fetch(config.attendance_channel_id).catch(() => null);
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

    const confirmMsg = await message.reply(
      `⚠️ **MASS CLOSE ALL THREADS?**\n\n` +
      `This will:\n` +
      `• Verify ALL pending members in ALL threads\n` +
      `• Close and submit ${openSpawns.length} spawn thread(s)\n` +
      `• Process one thread at a time (to avoid rate limits)\n\n` +
      `**Threads to close:**\n` +
      openSpawns.map((s, i) => `${i + 1}. **${s.spawnInfo.boss}** (${s.spawnInfo.timestamp}) - ${s.spawnInfo.members.length} verified`).join("\n") +
      `\n\nReact ✅ to confirm or ❌ to cancel.\n\n` +
      `⏱️ This will take approximately ${openSpawns.length * 5} seconds.`
    );

    await confirmMsg.react("✅");
    await confirmMsg.react("❌");

    const filter = (reaction, user) => ["✅", "❌"].includes(reaction.emoji.name) && user.id === member.user.id;

    try {
      const collected = await confirmMsg.awaitReactions({ filter, max: 1, time: TIMING.CONFIRMATION_TIMEOUT, errors: ["time"] });
      const reaction = collected.first();

      if (reaction.emoji.name === "❌") {
        await message.reply("❌ Mass close canceled.");
        return;
      }

      await message.reply(
        `🔄 **Starting mass close...**\n\n` +
        `Processing ${openSpawns.length} thread(s) one by one...\n` +
        `Please wait, this may take a few minutes.`
      );

      let successCount = 0, failCount = 0;
      const results = [];
      let totalReactionsRemoved = 0, totalReactionsFailed = 0;

      for (let i = 0; i < openSpawns.length; i++) {
        const { threadId, thread, spawnInfo } = openSpawns[i];
        const operationStartTime = Date.now();

        try {
          const progress = Math.floor(((i + 1) / openSpawns.length) * 20);
          const progressBar = "█".repeat(progress) + "░".repeat(20 - progress);
          const progressPercent = Math.floor(((i + 1) / openSpawns.length) * 100);

          await message.channel.send(
            `📋 **[${i + 1}/${openSpawns.length}]** ${progressBar} ${progressPercent}%\n` +
            `Processing: **${spawnInfo.boss}** (${spawnInfo.timestamp})...`
          );

          const pendingInThread = Object.entries(pendingVerifications).filter(([msgId, p]) => p.threadId === threadId);

          if (pendingInThread.length > 0) {
            await message.channel.send(`   ├─ Found ${pendingInThread.length} pending verification(s)... Auto-verifying all...`);

            const newMembers = pendingInThread
              .filter(([msgId, p]) => !spawnInfo.members.some(m => m.toLowerCase() === p.author.toLowerCase()))
              .map(([msgId, p]) => p.author);

            spawnInfo.members.push(...newMembers);

            const messageIds = pendingInThread.map(([msgId, p]) => msgId);
            const messagePromises = messageIds.map(msgId => thread.messages.fetch(msgId).catch(() => null));
            const fetchedMessages = await Promise.allSettled(messagePromises);

            const reactionPromises = fetchedMessages.map(result => {
              if (result.status === "fulfilled" && result.value) {
                return result.value.reactions.removeAll().catch(() => {});
              }
              return Promise.resolve();
            });
            await Promise.allSettled(reactionPromises);

            pendingInThread.forEach(([msgId]) => delete pendingVerifications[msgId]);

            await message.channel.send(
              `   ├─ ✅ Auto-verified ${newMembers.length} member(s) (${pendingInThread.length - newMembers.length} were duplicates)`
            );
          }

          await thread.send(
            `🔒 Closing spawn **${spawnInfo.boss}** (${spawnInfo.timestamp})... Submitting ${spawnInfo.members.length} members to Google Sheets...`
          ).catch(err => console.warn(`⚠️ Could not post to spawn thread ${threadId}: ${err.message}`));

          spawnInfo.closed = true;

          await message.channel.send(`   ├─ 📊 Submitting ${spawnInfo.members.length} member(s) to Google Sheets...`);

          const payload = {
            action: "submitAttendance",
            boss: spawnInfo.boss,
            date: spawnInfo.date,
            time: spawnInfo.time,
            timestamp: spawnInfo.timestamp,
            members: spawnInfo.members,
          };

          const resp = await postToSheet(payload);

          if (resp.ok) {
            await thread.send(`✅ Attendance submitted successfully! Archiving thread...`).catch(err => console.warn(`⚠️ Could not post success to spawn thread ${threadId}: ${err.message}`));

            if (spawnInfo.confirmThreadId) {
              const confirmThread = await guild.channels.fetch(spawnInfo.confirmThreadId).catch(() => null);
              if (confirmThread) {
                await confirmThread.send(`✅ Spawn closed: **${spawnInfo.boss}** (${spawnInfo.timestamp}) - ${spawnInfo.members.length} members recorded`).catch(() => {});
                await confirmThread.delete().catch(() => {});
              }
            }

            await message.channel.send(`   ├─ 🧹 Cleaning up reactions from thread...`);
            const cleanupStats = await cleanupAllThreadReactions(thread);
            totalReactionsRemoved += cleanupStats.success;
            totalReactionsFailed += cleanupStats.failed;

            if (cleanupStats.failed > 0) {
              await message.channel.send(`   ├─ ⚠️ Warning: ${cleanupStats.failed} message(s) still have reactions`);
            }

            await thread.setArchived(true, `Mass close by ${member.user.username}`).catch(() => {});

            delete activeSpawns[threadId];
            delete activeColumns[`${spawnInfo.boss}|${spawnInfo.timestamp}`];
            delete confirmationMessages[threadId];

            successCount++;
            results.push(`✅ **${spawnInfo.boss}** - ${spawnInfo.members.length} members submitted`);

            await message.channel.send(`   └─ ✅ **Success!** Thread closed and archived.`);

            console.log(`🔒 Mass close: ${spawnInfo.boss} at ${spawnInfo.timestamp} (${spawnInfo.members.length} members)`);
          } else {
            console.warn(`⚠️ First attempt failed for ${spawnInfo.boss}, retrying in 5s...`);
            await message.channel.send(`   ├─ ⚠️ First attempt failed, retrying in 5 seconds...`);
            await new Promise(resolve => setTimeout(resolve, TIMING.RETRY_DELAY));

            const retryResp = await postToSheet(payload);

            if (retryResp.ok) {
              if (spawnInfo.confirmThreadId) {
                const confirmThread = await guild.channels.fetch(spawnInfo.confirmThreadId).catch(() => null);
                if (confirmThread) await confirmThread.delete().catch(() => {});
              }

              await thread.setArchived(true, `Mass close by ${member.user.username}`).catch(() => {});

              delete activeSpawns[threadId];
              delete activeColumns[`${spawnInfo.boss}|${spawnInfo.timestamp}`];

              successCount++;
              results.push(`✅ **${spawnInfo.boss}** - ${spawnInfo.members.length} members submitted (retry succeeded)`);

              await message.channel.send(`   └─ ✅ **Success on retry!** Thread closed and archived.`);

              console.log(`🔒 Mass close (retry): ${spawnInfo.boss} at ${spawnInfo.timestamp} (${spawnInfo.members.length} members)`);
            } else {
              failCount++;
              results.push(`❌ **${spawnInfo.boss}** - Failed: ${retryResp.text || retryResp.err} (after retry)`);

              await message.channel.send(
                `   └─ ❌ **Failed after retry!** Error: ${retryResp.text || retryResp.err}\n` +
                `   Members: ${spawnInfo.members.join(", ")}`
              );

              console.error(`❌ Mass close failed (after retry) for ${spawnInfo.boss}:`, retryResp.text || retryResp.err);
            }
          }

          const operationTime = Date.now() - operationStartTime;
          const minDelay = TIMING.MASS_CLOSE_DELAY;
          const remainingDelay = Math.max(0, minDelay - operationTime);

          if (i < openSpawns.length - 1) {
            if (remainingDelay > 0) {
              await message.channel.send(`   ⏳ Waiting ${Math.ceil(remainingDelay / 1000)} seconds before next thread...`);
              await new Promise(resolve => setTimeout(resolve, remainingDelay));
            } else {
              await message.channel.send(`   ⏳ Operation took ${Math.ceil(operationTime / 1000)}s, proceeding immediately...`);
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
          { name: "📋 Detailed Results", value: results.join("\n") },
          { name: "🧹 Cleanup Statistics", value: `✅ Reactions removed: ${totalReactionsRemoved}\n❌ Failed cleanups: ${totalReactionsFailed}`, inline: false }
        )
        .setFooter({ text: `Executed by ${member.user.username}` })
        .setTimestamp();

      await message.reply({ embeds: [summaryEmbed] });

      console.log(`🔧 Mass close complete: ${successCount}/${openSpawns.length} successful by ${member.user.username}`);
    } catch (err) {
      if (err.message === "time") {
        await message.reply("⏱️ Confirmation timed out. Mass close canceled.");
      } else {
        await message.reply(`❌ Error during mass close: ${err.message}`);
        console.error("❌ Mass close error:", err);
      }
    }
  },

  forcesubmit: async (message, member) => {
    const spawnInfo = activeSpawns[message.channel.id];
    if (!spawnInfo) {
      await message.reply("⚠️ This thread is not in bot memory. Use !debugthread to check state.");
      return;
    }

    const confirmMsg = await message.reply(
      `📊 **Force submit attendance?**\n\n` +
      `**Boss:** ${spawnInfo.boss}\n` +
      `**Timestamp:** ${spawnInfo.timestamp}\n` +
      `**Members:** ${spawnInfo.members.length}\n\n` +
      `This will submit to Google Sheets WITHOUT closing the thread.\n\n` +
      `React ✅ to confirm or ❌ to cancel.`
    );

    await confirmMsg.react("✅");
    await confirmMsg.react("❌");

    pendingClosures[confirmMsg.id] = { threadId: message.channel.id, adminId: message.author.id, type: "forcesubmit" };

    const filter = (reaction, user) => ["✅", "❌"].includes(reaction.emoji.name) && user.id === member.user.id;

    try {
      const collected = await confirmMsg.awaitReactions({ filter, max: 1, time: TIMING.CONFIRMATION_TIMEOUT, errors: ["time"] });
      const reaction = collected.first();

      if (reaction.emoji.name === "✅") {
        await message.channel.send(`📊 Submitting ${spawnInfo.members.length} members to Google Sheets...`);

        const payload = {
          action: "submitAttendance",
          boss: spawnInfo.boss,
          date: spawnInfo.date,
          time: spawnInfo.time,
          timestamp: spawnInfo.timestamp,
          members: spawnInfo.members,
        };

        const resp = await postToSheet(payload);

        if (resp.ok) {
          await message.channel.send(
            `✅ **Attendance submitted successfully!**\n\n` +
            `${spawnInfo.members.length} members recorded.\n` +
            `Thread remains open for additional verifications if needed.`
          );

          await removeAllReactionsWithRetry(confirmMsg);
          delete pendingClosures[confirmMsg.id];

          console.log(`🔧 Force submit: ${spawnInfo.boss} by ${member.user.username} (${spawnInfo.members.length} members)`);
        } else {
          await message.channel.send(
            `⚠️ **Failed to submit attendance!**\n\n` +
            `Error: ${resp.text || resp.err}\n\n` +
            `**Members list (for manual entry):**\n${spawnInfo.members.join(", ")}`
          );
          await removeAllReactionsWithRetry(confirmMsg);
          delete pendingClosures[confirmMsg.id];
        }
      } else {
        await message.reply("❌ Force submit canceled.");
        await removeAllReactionsWithRetry(confirmMsg);
        delete pendingClosures[confirmMsg.id];
      }
    } catch (err) {
      await message.reply("⏱️ Confirmation timed out. Force submit canceled.");
      await removeAllReactionsWithRetry(confirmMsg);
      delete pendingClosures[confirmMsg.id];
    }
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

    const pendingInThread = Object.values(pendingVerifications).filter(p => p.threadId === threadId);

    const embed = new EmbedBuilder()
      .setColor(0x4a90e2)
      .setTitle("🔍 Thread Debug Info")
      .addFields(
        { name: "🎯 Boss", value: spawnInfo.boss, inline: true },
        { name: "⏰ Timestamp", value: spawnInfo.timestamp, inline: true },
        { name: "🔒 Closed", value: spawnInfo.closed ? "Yes" : "No", inline: true },
        { name: "✅ Verified Members", value: `${spawnInfo.members.length}` },
        { name: "👥 Member List", value: spawnInfo.members.join(", ") || "None" },
        { name: "⏳ Pending Verifications", value: `${pendingInThread.length}` },
        { name: "📋 Confirmation Thread", value: spawnInfo.confirmThreadId ? `<#${spawnInfo.confirmThreadId}>` : "None" },
        { name: "💾 In Memory", value: "✅ Yes" }
      )
      .setFooter({ text: `Requested by ${member.user.username}` })
      .setTimestamp();

    await message.reply({ embeds: [embed] });
  },

  resetpending: async (message, member) => {
    const threadId = message.channel.id;
    const pendingInThread = Object.keys(pendingVerifications).filter(msgId => pendingVerifications[msgId].threadId === threadId);

    if (pendingInThread.length === 0) {
      await message.reply("✅ No pending verifications in this thread.");
      return;
    }

    const confirmMsg = await message.reply(
      `⚠️ **Clear ${pendingInThread.length} pending verification(s)?**\n\n` +
      `This will remove all pending verifications for this thread.\n` +
      `Members will NOT be added to verified list.\n\n` +
      `React ✅ to confirm or ❌ to cancel.`
    );

    await confirmMsg.react("✅");
    await confirmMsg.react("❌");

    const filter = (reaction, user) => ["✅", "❌"].includes(reaction.emoji.name) && user.id === member.user.id;

    try {
      const collected = await confirmMsg.awaitReactions({ filter, max: 1, time: TIMING.CONFIRMATION_TIMEOUT, errors: ["time"] });
      const reaction = collected.first();

      if (reaction.emoji.name === "✅") {
        pendingInThread.forEach(msgId => delete pendingVerifications[msgId]);

        await message.reply(
          `✅ **Cleared ${pendingInThread.length} pending verification(s).**\n\n` +
          `You can now close the thread.`
        );

        console.log(`🔧 Reset pending: ${threadId} by ${member.user.username} (${pendingInThread.length} cleared)`);
      } else {
        await message.reply("❌ Reset pending canceled.");
      }
    } catch (err) {
      await message.reply("⏱️ Confirmation timed out. Reset pending canceled.");
    }
  },

  testbidding: async (message, member) => {
    await message.reply("🔍 **Testing Bidding System...**\n\nPlease wait...");

    const configCheck = {
      hasWebhook: !!config.sheet_webhook_url,
      webhookUrl: config.sheet_webhook_url ? config.sheet_webhook_url.substring(0, 50) + "..." : "MISSING",
      hasBiddingChannel: !!config.bidding_channel_id,
      biddingChannel: config.bidding_channel_id || "MISSING",
    };

    let pointsTest = { success: false, memberCount: 0, error: null, sampleMembers: [] };

    try {
      console.log("🔗 Attempting to fetch bidding points...");
      const biddingState = bidding.getBiddingState();

      const response = await fetch(config.sheet_webhook_url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "getBiddingPoints", dryRun: biddingState.isDryRun }),
      });

      console.log(`📊 Sheet response: ${response.status}`);

      if (response.ok) {
        const text = await response.text();
        const data = JSON.parse(text);

        if (data.points) {
          pointsTest.success = true;
          pointsTest.memberCount = Object.keys(data.points).length;
          pointsTest.sampleMembers = Object.entries(data.points)
            .slice(0, 5)
            .map(([member, points]) => `${member}: ${points}pts`);
        }
      } else {
        pointsTest.error = `HTTP ${response.status}: ${await response.text()}`;
      }
    } catch (err) {
      pointsTest.error = err.message;
    }

    const biddingState = bidding.getBiddingState();
    const stateInfo = {
      isDryRun: biddingState.isDryRun,
      queueLength: biddingState.auctionQueue.length,
      hasActiveAuction: !!biddingState.activeAuction,
      activeAuctionItem: biddingState.activeAuction ? biddingState.activeAuction.item : "None",
      lockedPointsCount: Object.keys(biddingState.lockedPoints).length,
    };

    let channelTest = { canAccessChannel: false, channelName: "Unknown", isThread: false };

    try {
      const biddingChannel = await client.channels.fetch(config.bidding_channel_id);
      if (biddingChannel) {
        channelTest.canAccessChannel = true;
        channelTest.channelName = biddingChannel.name;
        channelTest.isThread = biddingChannel.isThread();
      }
    } catch (err) {
      channelTest.error = err.message;
    }

    const embed = new EmbedBuilder()
      .setColor(pointsTest.success ? 0x00ff00 : 0xff0000)
      .setTitle("🔍 Bidding System Diagnostics")
      .setDescription("Complete system health check")
      .addFields(
        {
          name: "⚙️ Configuration",
          value: `✅ Webhook URL: ${configCheck.hasWebhook ? "Configured" : "❌ MISSING"}\n` +
                 `✅ Bidding Channel: ${configCheck.hasBiddingChannel ? "Configured" : "❌ MISSING"}\n` +
                 `🔗 Webhook: \`${configCheck.webhookUrl}\`\n` +
                 `🔗 Channel ID: \`${configCheck.biddingChannel}\``
        },
        {
          name: "📊 Google Sheets Connection",
          value: pointsTest.success
            ? `✅ **Connected Successfully**\n` +
              `👥 Members: ${pointsTest.memberCount}\n` +
              `📋 Sample:\n${pointsTest.sampleMembers.join("\n")}`
            : `❌ **Connection Failed**\n` +
              `Error: ${pointsTest.error || "Unknown error"}\n\n` +
              `**Troubleshooting:**\n` +
              `1. Check webhook URL in config.json\n` +
              `2. Verify Apps Script is deployed\n` +
              `3. Check BiddingPoints sheet exists\n` +
              `4. Verify sheet has data`
        },
        {
          name: "🎯 Bidding State",
          value: `🧪 Dry Run: ${stateInfo.isDryRun ? "✅ Enabled" : "⚪ Disabled"}\n` +
                 `📋 Queue: ${stateInfo.queueLength} item(s)\n` +
                 `🔴 Active Auction: ${stateInfo.hasActiveAuction ? `✅ ${stateInfo.activeAuctionItem}` : "⚪ None"}\n` +
                 `🔒 Locked Points: ${stateInfo.lockedPointsCount} member(s)`
        },
        {
          name: "📺 Channel Access",
          value: channelTest.canAccessChannel
            ? `✅ **Can access channel**\n` +
              `📌 Name: ${channelTest.channelName}\n` +
              `🔖 Type: ${channelTest.isThread ? "Thread" : "Channel"}`
            : `❌ **Cannot access channel**\n` +
              `Error: ${channelTest.error || "Unknown error"}`
        }
      )
      .setFooter({ text: "If any tests failed, check the troubleshooting steps above" })
      .setTimestamp();

    await message.reply({ embeds: [embed] });

    console.log("═══════════════════════════════════════");
    console.log("🔍 BIDDING SYSTEM DIAGNOSTICS");
    console.log("═══════════════════════════════════════");
    console.log("Config:", JSON.stringify(configCheck, null, 2));
    console.log("Points Test:", JSON.stringify(pointsTest, null, 2));
    console.log("State:", JSON.stringify(stateInfo, null, 2));
    console.log("Channel:", JSON.stringify(channelTest, null, 2));
    console.log("═══════════════════════════════════════");
  },
};

// ==========================================
// BOT READY EVENT
// ==========================================

client.once(Events.ClientReady, () => {
  console.log(`✅ Bot logged in as ${client.user.tag}`);
  console.log(`📊 Tracking ${Object.keys(bossPoints).length} bosses`);
  console.log(`🏠 Main Guild: ${config.main_guild_id}`);
  console.log(`⏰ Timer Server: ${config.timer_server_id}`);
  console.log(`🤖 Version: ${BOT_VERSION}`);
  console.log(`⚙️ Timing: Sheet delay=${TIMING.MIN_SHEET_DELAY}ms, Retry attempts=${TIMING.REACTION_RETRY_ATTEMPTS}`);

  recoverStateFromThreads();
  bidding.recoverBiddingState(client, config);
});

// ==========================================
// MESSAGE HANDLER
// ==========================================

client.on(Events.MessageCreate, async (message) => {
  try {
    // Timer server spawn detection
    if (message.guild && message.guild.id === config.timer_server_id) {
      if (config.timer_channel_id && message.channel.id === config.timer_channel_id) {
        if (/will spawn in.*minutes?!/i.test(message.content)) {
          let detectedBoss = null;
          let timestamp = null;

          const timestampMatch = message.content.match(/\((\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})\)/);
          if (timestampMatch) timestamp = timestampMatch[1];

          const matchBold = message.content.match(/[⚠️🔔⏰]*\s*\*\*(.*?)\*\*\s*will spawn/i);
          if (matchBold) {
            detectedBoss = matchBold[1].trim();
          } else {
            const matchEmoji = message.content.match(/[⚠️🔔⏰]+\s*([A-Za-z\s]+?)\s*will spawn/i);
            if (matchEmoji) {
              detectedBoss = matchEmoji[1].trim();
            } else {
              const matchPlain = message.content.match(/^([A-Za-z\s]+?)\s*will spawn/i);
              if (matchPlain) detectedBoss = matchPlain[1].trim();
            }
          }

          if (!detectedBoss) {
            console.log(`⚠️ Could not extract boss name from: ${message.content}`);
            return;
          }

          const bossName = findBossMatch(detectedBoss);
          if (!bossName) {
            console.log(`⚠️ Unknown boss: ${detectedBoss}`);
            return;
          }

          console.log(`🎯 Boss spawn detected: ${bossName} (from ${message.author.username})`);

          let dateStr, timeStr, fullTimestamp;

          if (timestamp) {
            const [datePart, timePart] = timestamp.split(" ");
            const [year, month, day] = datePart.split("-");
            dateStr = `${month}/${day}/${year.substring(2)}`;
            timeStr = timePart;
            fullTimestamp = `${dateStr} ${timeStr}`;
            console.log(`⏰ Using timestamp from timer: ${fullTimestamp}`);
          } else {
            const ts = getCurrentTimestamp();
            dateStr = ts.date;
            timeStr = ts.time;
            fullTimestamp = ts.full;
            console.log(`⏰ Using current timestamp: ${fullTimestamp}`);
          }

          await createSpawnThreads(bossName, dateStr, timeStr, fullTimestamp, "timer");
        }
        return;
      }
    }

    if (message.author.bot) return;

    const guild = message.guild;
    if (!guild) return;

    const member = await guild.members.fetch(message.author.id).catch(() => null);
    if (!member) return;

    const userIsAdmin = isAdmin(member);
    const inAdminLogs = message.channel.id === config.admin_logs_channel_id || (message.channel.isThread() && message.channel.parentId === config.admin_logs_channel_id);
    const inBiddingChannel = message.channel.id === config.bidding_channel_id || (message.channel.isThread() && message.channel.parentId === config.bidding_channel_id);

    // Help command (anywhere except spawn threads)
    if (message.content.toLowerCase().match(/^(!help|!commands|!\?)/)) {
      if (message.channel.isThread() && message.channel.parentId === config.attendance_channel_id) {
        await message.reply("⚠️ Please use `!help` in admin logs channel to avoid cluttering spawn threads.");
        return;
      }
      // Simplified help - just show basic commands
      const embed = new EmbedBuilder()
        .setColor(userIsAdmin ? 0x4a90e2 : 0xffd700)
        .setTitle(userIsAdmin ? "🛡️ Admin Commands" : "📚 Member Commands")
        .setDescription(userIsAdmin 
          ? "**Spawn:** `!status` `!addthread` `!closeallthread` `!clearstate` `close` `!forceclose` `!forcesubmit` `!verify` `!verifyall` `!debugthread` `!resetpending`\n\n**Bidding:** `!auction` `!queuelist` `!startauction` `!dryrun` `!bid` `!bidstatus` `!endauction` `!testbidding`"
          : "**Spawn:** Type `present` or `here` with screenshot in spawn threads\n\n**Bidding:** `!bid <amount>` `!mybids` `!bidstatus`")
        .setFooter({ text: `Version ${BOT_VERSION}` });
      await message.reply({ embeds: [embed] });
      return;
    }

    // Member check-in (spawn threads only)
    if (message.channel.isThread() && message.channel.parentId === config.attendance_channel_id) {
      const content = message.content.trim().toLowerCase();
      const keyword = content.split(/\s+/)[0];

      if (["present", "here", "join", "checkin", "check-in"].includes(keyword)) {
        const spawnInfo = activeSpawns[message.channel.id];

        if (!spawnInfo || spawnInfo.closed) {
          await message.reply("⚠️ This spawn is closed. No more check-ins accepted.");
          return;
        }

        if (!userIsAdmin && (!message.attachments || message.attachments.size === 0)) {
          await message.reply("⚠️ **Screenshot required!** Attach a screenshot showing boss and timestamp.");
          return;
        }

        const username = member.nickname || message.author.username;
        const isDuplicate = spawnInfo.members.some(m => m.toLowerCase() === username.toLowerCase());

        if (isDuplicate) {
          await message.reply(`⚠️ You already checked in for this spawn.`);
          return;
        }

        await Promise.all([message.react("✅"), message.react("❌")]);

        pendingVerifications[message.id] = {
          author: username,
          authorId: message.author.id,
          threadId: message.channel.id,
          timestamp: Date.now(),
        };

        const statusText = userIsAdmin
          ? `⏩ **${username}** (Admin) registered for **${spawnInfo.boss}**\n\nFast-track verification (no screenshot required)...`
          : `⏳ **${username}** registered for **${spawnInfo.boss}**\n\nWaiting for admin verification...`;

        const embed = new EmbedBuilder()
          .setColor(userIsAdmin ? 0x00ff00 : 0xffa500)
          .setDescription(statusText)
          .setFooter({ text: "Admins: React ✅ to verify, ❌ to deny" });

        await message.reply({ embeds: [embed] });

        if (spawnInfo.confirmThreadId) {
          const confirmThread = await guild.channels.fetch(spawnInfo.confirmThreadId).catch(() => null);
          if (confirmThread) {
            const notifText = userIsAdmin
              ? `⏩ **${username}** (Admin) - Fast-track check-in (no screenshot)`
              : `⏳ **${username}** - Pending verification`;
            await confirmThread.send(notifText);
          }
        }

        console.log(`📝 Pending: ${username} for ${spawnInfo.boss}${userIsAdmin ? " (admin fast-track)" : ""}`);
        return;
      }

      // Admin commands in spawn threads
      if (!userIsAdmin) return;

      const cmd = message.content.trim().toLowerCase().split(/\s+/)[0];

      // !verifyall
      if (cmd === "!verifyall") {
        const spawnInfo = activeSpawns[message.channel.id];
        if (!spawnInfo || spawnInfo.closed) {
          await message.reply("⚠️ This spawn is closed or not found.");
          return;
        }

        const pendingInThread = Object.entries(pendingVerifications).filter(([msgId, p]) => p.threadId === message.channel.id);

        if (pendingInThread.length === 0) {
          await message.reply("ℹ️ No pending verifications in this thread.");
          return;
        }

        const confirmMsg = await message.reply(
          `⚠️ **Verify ALL ${pendingInThread.length} pending member(s)?**\n\n` +
          `This will automatically verify:\n` +
          pendingInThread.map(([msgId, p]) => `• **${p.author}**`).join("\n") +
          `\n\nReact ✅ to confirm or ❌ to cancel.`
        );

        await confirmMsg.react("✅");
        await confirmMsg.react("❌");

        const filter = (reaction, user) => ["✅", "❌"].includes(reaction.emoji.name) && user.id === message.author.id;

        try {
          const collected = await confirmMsg.awaitReactions({ filter, max: 1, time: TIMING.CONFIRMATION_TIMEOUT, errors: ["time"] });
          const reaction = collected.first();

          if (reaction.emoji.name === "✅") {
            let verifiedCount = 0, duplicateCount = 0;
            const verifiedMembers = [];

            for (const [msgId, pending] of pendingInThread) {
              const isDuplicate = spawnInfo.members.some(m => m.toLowerCase() === pending.author.toLowerCase());

              if (!isDuplicate) {
                spawnInfo.members.push(pending.author);
                verifiedMembers.push(pending.author);
                verifiedCount++;
              } else {
                duplicateCount++;
              }

              const originalMsg = await message.channel.messages.fetch(msgId).catch(() => null);
              if (originalMsg) await removeAllReactionsWithRetry(originalMsg);

              delete pendingVerifications[msgId];
            }

            await message.reply(
              `✅ **Verify All Complete!**\n\n` +
              `✅ Verified: ${verifiedCount}\n` +
              `⚠️ Duplicates skipped: ${duplicateCount}\n` +
              `📊 Total processed: ${pendingInThread.length}\n\n` +
              `**Verified members:**\n${verifiedMembers.join(", ") || "None (all were duplicates)"}`
            );

            if (spawnInfo.confirmThreadId && verifiedCount > 0) {
              const confirmThread = await guild.channels.fetch(spawnInfo.confirmThreadId).catch(() => null);
              if (confirmThread) {
                await confirmThread.send(
                  `✅ **Bulk Verification by ${message.author.username}**\n` +
                  `Verified ${verifiedCount} member(s): ${verifiedMembers.join(", ")}`
                );
              }
            }

            console.log(`✅ Verify all: ${verifiedCount} verified, ${duplicateCount} duplicates for ${spawnInfo.boss} by ${message.author.username}`);
          } else {
            await message.reply("❌ Verify all canceled.");
          }

          await removeAllReactionsWithRetry(confirmMsg);
        } catch (err) {
          await message.reply("⏱️ Confirmation timed out. Verify all canceled.");
          await removeAllReactionsWithRetry(confirmMsg);
        }

        return;
      }

      // !verify @member
      if (cmd === "!verify") {
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

        const mentionedMember = await guild.members.fetch(mentioned.id).catch(() => null);
        const username = mentionedMember ? mentionedMember.nickname || mentioned.username : mentioned.username;

        const isDuplicate = spawnInfo.members.some(m => m.toLowerCase() === username.toLowerCase());

        if (isDuplicate) {
          await message.reply(`⚠️ **${username}** is already verified for this spawn.`);
          return;
        }

        spawnInfo.members.push(username);

        await message.reply(`✅ **${username}** manually verified by ${message.author.username}`);

        if (spawnInfo.confirmThreadId) {
          const confirmThread = await guild.channels.fetch(spawnInfo.confirmThreadId).catch(() => null);
          if (confirmThread) {
            await confirmThread.send(`✅ **${username}** verified by ${message.author.username} (manual override)`);
          }
        }

        console.log(`✅ Manual verify: ${username} for ${spawnInfo.boss} by ${message.author.username}`);
        return;
      }

      // close command
      if (content === "close") {
        const spawnInfo = activeSpawns[message.channel.id];
        if (!spawnInfo || spawnInfo.closed) {
          await message.reply("⚠️ This spawn is already closed or not found.");
          return;
        }

        const pendingInThread = Object.entries(pendingVerifications).filter(([msgId, p]) => p.threadId === message.channel.id);

        if (pendingInThread.length > 0) {
          const pendingList = pendingInThread.map(([msgId, p]) => {
            const messageLink = `https://discord.com/channels/${guild.id}/${message.channel.id}/${msgId}`;
            return `• **${p.author}** - [View Message](${messageLink})`;
          }).join("\n");

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

        pendingClosures[confirmMsg.id] = { threadId: message.channel.id, adminId: message.author.id, type: "close" };

        if (!confirmationMessages[message.channel.id]) confirmationMessages[message.channel.id] = [];
        confirmationMessages[message.channel.id].push(confirmMsg.id);

        return;
      }

      // !forceclose
      if (cmd === "!forceclose") {
        const spawnInfo = activeSpawns[message.channel.id];
        if (!spawnInfo || spawnInfo.closed) {
          await message.reply("⚠️ This spawn is already closed or not found.");
          return;
        }

        const pendingInThread = Object.keys(pendingVerifications).filter(msgId => pendingVerifications[msgId].threadId === message.channel.id);
        pendingInThread.forEach(msgId => delete pendingVerifications[msgId]);

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

        const resp = await postToSheet(payload);

        if (resp.ok) {
          await message.channel.send(`✅ Attendance submitted successfully! (${spawnInfo.members.length} members)`);

          if (spawnInfo.confirmThreadId) {
            const confirmThread = await guild.channels.fetch(spawnInfo.confirmThreadId).catch(() => null);
            if (confirmThread) {
              await confirmThread.delete().catch(console.error);
              console.log(`🗑️ Deleted confirmation thread for ${spawnInfo.boss}`);
            }
          }

          await message.channel.setArchived(true, `Force closed by ${message.author.username}`).catch(console.error);

          delete activeSpawns[message.channel.id];
          delete activeColumns[`${spawnInfo.boss}|${spawnInfo.timestamp}`];

          console.log(`🔒 FORCE CLOSE: ${spawnInfo.boss} at ${spawnInfo.timestamp} by ${message.author.username} (${spawnInfo.members.length} members)`);
        } else {
          await message.channel.send(
            `⚠️ **Failed to submit attendance!**\n\n` +
            `Error: ${resp.text || resp.err}\n\n` +
            `**Members list (for manual entry):**\n${spawnInfo.members.join(", ")}\n\n` +
            `Please manually update the Google Sheet.`
          );
        }

        return;
      }

      // Thread-specific override commands
      if (["!forcesubmit", "!debugthread", "!resetpending"].includes(cmd)) {
        const now = Date.now();
        if (now - lastOverrideTime < TIMING.OVERRIDE_COOLDOWN) {
          const remaining = Math.ceil((TIMING.OVERRIDE_COOLDOWN - (now - lastOverrideTime)) / 1000);
          await message.reply(`⚠️ Please wait ${remaining} seconds between override commands.`);
          return;
        }

        lastOverrideTime = now;
        console.log(`🔧 Override: ${cmd} used by ${member.user.username} in thread ${message.channel.id}`);

        if (cmd === "!forcesubmit") await commandHandlers.forcesubmit(message, member);
        else if (cmd === "!debugthread") await commandHandlers.debugthread(message, member);
        else if (cmd === "!resetpending") await commandHandlers.resetpending(message, member);
        return;
      }

      return;
    }

    // Admin-only commands in admin logs
    if (!userIsAdmin) return;

    if (inAdminLogs) {
      const cmd = message.content.trim().toLowerCase().split(/\s+/)[0];
      const args = message.content.trim().split(/\s+/).slice(1);

      // Admin logs override commands
      if (["!clearstate", "!status", "!closeallthread", "!testbidding"].includes(cmd)) {
        const now = Date.now();
        if (now - lastOverrideTime < TIMING.OVERRIDE_COOLDOWN) {
          const remaining = Math.ceil((TIMING.OVERRIDE_COOLDOWN - (now - lastOverrideTime)) / 1000);
          await message.reply(`⚠️ Please wait ${remaining} seconds between override commands.`);
          return;
        }

        lastOverrideTime = now;
        console.log(`🔧 Override: ${cmd} used by ${member.user.username}`);

        if (cmd === "!clearstate") await commandHandlers.clearstate(message, member);
        else if (cmd === "!status") await commandHandlers.status(message, member);
        else if (cmd === "!closeallthread") await commandHandlers.closeallthread(message, member);
        else if (cmd === "!testbidding") await commandHandlers.testbidding(message, member);
        return;
      }

      // Bidding setup commands (admin logs)
      if (["!auction", "!queuelist", "!removeitem", "!startauction", "!dryrun", "!clearqueue", "!forcesync", "!setbidpoints", "!resetbids"].includes(cmd)) {
        console.log(`🎯 Processing bidding command: ${cmd}`);

        if (cmd === "!auction") await bidding.handleAuctionCommand(message, args, config);
        else if (cmd === "!queuelist") await bidding.handleQueueListCommand(message);
        else if (cmd === "!removeitem") await bidding.handleRemoveItemCommand(message, args);
        else if (cmd === "!startauction") await bidding.handleStartAuctionCommand(message, client, config);
        else if (cmd === "!dryrun") await bidding.handleDryRunCommand(message, args);
        else if (cmd === "!clearqueue") await bidding.handleClearQueueCommand(message);
        else if (cmd === "!forcesync") await bidding.handleForceSyncCommand(message, config);
        else if (cmd === "!setbidpoints") await bidding.handleSetBidPointsCommand(message, args);
        else if (cmd === "!resetbids") await bidding.handleResetBidsCommand(message);
        return;
      }

      // !addthread
      if (cmd === "!addthread") {
        const fullText = message.content.substring("!addthread".length).trim();

        const timestampMatch = fullText.match(/\((\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})\)/);
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
          await message.reply("⚠️ **Cannot detect boss name!**\n\nFormat: `!addthread [BossName] will spawn in X minutes! (YYYY-MM-DD HH:MM)`");
          return;
        }

        const detectedBoss = bossMatch[1].trim();
        const bossName = findBossMatch(detectedBoss);

        if (!bossName) {
          await message.reply(`⚠️ **Unknown boss:** "${detectedBoss}"\n\n**Available bosses:** ${Object.keys(bossPoints).join(", ")}`);
          return;
        }

        const [datePart, timePart] = timestampStr.split(" ");
        const [year, month, day] = datePart.split("-");

        const dateStr = `${month}/${day}/${year.substring(2)}`;
        const timeStr = timePart;
        const fullTimestamp = `${dateStr} ${timeStr}`;

        console.log(`🔧 Manual spawn creation: ${bossName} at ${fullTimestamp} by ${message.author.username}`);

        await createSpawnThreads(bossName, dateStr, timeStr, fullTimestamp, "manual");

        await message.reply(
          `✅ **Spawn thread created successfully!**\n\n` +
          `**Boss:** ${bossName}\n` +
          `**Time:** ${fullTimestamp}\n\n` +
          `Members can now check in!`
        );

        return;
      }
    }

    // Bidding commands (member + admin, in bidding channel/threads)
    if (inBiddingChannel) {
      const cmd = message.content.trim().toLowerCase().split(/\s+/)[0];
      const args = message.content.trim().split(/\s+/).slice(1);

      console.log(`🎯 Bidding channel command: ${cmd}`);

      // Member commands
      if (cmd === "!bid") {
        console.log(`💰 Calling handleBidCommand with args: ${args.join(" ")}`);
        await bidding.handleBidCommand(message, args, config);
        return;
      }

      if (cmd === "!bidstatus") {
        console.log(`📊 Calling handleBidStatusCommand`);
        await bidding.handleBidStatusCommand(message, userIsAdmin);
        return;
      }

      if (cmd === "!mybids") {
        console.log(`💳 Calling handleMyBidsCommand`);
        await bidding.handleMyBidsCommand(message);
        return;
      }

      // Admin commands
      if (userIsAdmin) {
        if (cmd === "!endauction") {
          console.log(`⏹️ Calling handleEndAuctionCommand`);
          await bidding.handleEndAuctionCommand(message, client, config);
          return;
        }

        if (cmd === "!extendtime") {
          console.log(`⏱️ Calling handleExtendTimeCommand`);
          await bidding.handleExtendTimeCommand(message, args, client, config);
          return;
        }

        if (cmd === "!forcewinner") {
          console.log(`👑 Calling handleForceWinnerCommand`);
          await bidding.handleForceWinnerCommand(message, args);
          return;
        }

        if (cmd === "!cancelbid") {
          console.log(`❌ Calling handleCancelBidCommand`);
          await bidding.handleCancelBidCommand(message, args);
          return;
        }

        if (cmd === "!debugauction") {
          console.log(`🔍 Calling handleDebugAuctionCommand`);
          await bidding.handleDebugAuctionCommand(message);
          return;
        }

        if (cmd === "!cancelauction") {
          console.log(`🚫 Calling handleCancelAuctionCommand`);
          await bidding.handleCancelAuctionCommand(message, client, config);
          return;
        }
      }
    }
  } catch (err) {
    console.error("❌ Message handler error:", err);
  }
});

// ==========================================
// REACTION HANDLER
// ==========================================

client.on(Events.MessageReactionAdd, async (reaction, user) => {
  try {
    if (user.bot) return;

    if (reaction.partial) await reaction.fetch();
    if (reaction.message.partial) await reaction.message.fetch();

    const msg = reaction.message;
    const guild = msg.guild;

    // Guard against reactions on closed threads
    if (msg.channel.isThread() && msg.channel.parentId === config.attendance_channel_id) {
      const spawnInfo = activeSpawns[msg.channel.id];

      if (!spawnInfo || spawnInfo.closed) {
        try {
          await reaction.users.remove(user.id);
          await msg.channel.send(
            `⚠️ <@${user.id}>, this spawn is closed. Your reaction was removed to prevent confusion.\n` +
            `(Closed threads should not have reactions to avoid restart detection issues)`
          ).then(m => setTimeout(() => m.delete().catch(() => {}), 5000));
        } catch (err) {
          console.warn(`⚠️ Could not remove reaction from closed thread ${msg.channel.id}: ${err.message}`);
        }
        return;
      }
    }

    const adminMember = await guild.members.fetch(user.id).catch(() => null);

    // Only admins can use reactions
    if (!adminMember || !isAdmin(adminMember)) {
      try {
        await reaction.users.remove(user.id);
      } catch (e) {}
      return;
    }

    // Close confirmation
    const closePending = pendingClosures[msg.id];

    if (closePending) {
      const spawnInfo = activeSpawns[closePending.threadId];

      if (reaction.emoji.name === "✅") {
        if (!spawnInfo || spawnInfo.closed) {
          await msg.channel.send("⚠️ Spawn already closed or not found.");
          delete pendingClosures[msg.id];
          await removeAllReactionsWithRetry(msg);
          return;
        }

        spawnInfo.closed = true;

        await msg.channel.send(`🔒 Closing spawn **${spawnInfo.boss}**... Submitting ${spawnInfo.members.length} members to Google Sheets...`);

        const payload = {
          action: "submitAttendance",
          boss: spawnInfo.boss,
          date: spawnInfo.date,
          time: spawnInfo.time,
          timestamp: spawnInfo.timestamp,
          members: spawnInfo.members,
        };

        const resp = await postToSheet(payload);

        if (resp.ok) {
          await msg.channel.send(`✅ Attendance submitted successfully! Archiving thread...`);

          await removeAllReactionsWithRetry(msg);

          if (spawnInfo.confirmThreadId) {
            const confirmThread = await guild.channels.fetch(spawnInfo.confirmThreadId).catch(() => null);
            if (confirmThread) {
              await confirmThread.send(`✅ Spawn closed: **${spawnInfo.boss}** (${spawnInfo.timestamp}) - ${spawnInfo.members.length} members recorded`);
              await confirmThread.delete().catch(console.error);
              console.log(`🗑️ Deleted confirmation thread for ${spawnInfo.boss}`);
            }
          }

          await msg.channel.setArchived(true, `Closed by ${user.username}`).catch(console.error);

          delete activeSpawns[closePending.threadId];
          delete activeColumns[`${spawnInfo.boss}|${spawnInfo.timestamp}`];
          delete pendingClosures[msg.id];
          delete confirmationMessages[closePending.threadId];

          console.log(`🔒 Spawn closed: ${spawnInfo.boss} at ${spawnInfo.timestamp} (${spawnInfo.members.length} members)`);
        } else {
          await msg.channel.send(
            `⚠️ **Failed to submit attendance!**\n\n` +
            `Error: ${resp.text || resp.err}\n\n` +
            `**Members list (for manual entry):**\n${spawnInfo.members.join(", ")}\n\n` +
            `Please manually update the Google Sheet.`
          );
          await removeAllReactionsWithRetry(msg);
        }
      } else if (reaction.emoji.name === "❌") {
        await msg.channel.send("❌ Spawn close canceled.");
        await removeAllReactionsWithRetry(msg);
        delete pendingClosures[msg.id];
      }

      return;
    }

    // Attendance verification
    const pending = pendingVerifications[msg.id];

    if (pending) {
      const spawnInfo = activeSpawns[pending.threadId];

      if (!spawnInfo || spawnInfo.closed) {
        await msg.reply("⚠️ This spawn is already closed.");
        delete pendingVerifications[msg.id];
        return;
      }

      if (reaction.emoji.name === "✅") {
        const isDuplicate = spawnInfo.members.some(m => m.toLowerCase() === pending.author.toLowerCase());

        if (isDuplicate) {
          await msg.reply(`⚠️ **${pending.author}** is already verified. Ignoring duplicate.`);
          await removeAllReactionsWithRetry(msg);
          delete pendingVerifications[msg.id];
          return;
        }

        spawnInfo.members.push(pending.author);

        const cleanupSuccess = await removeAllReactionsWithRetry(msg);
        if (!cleanupSuccess) {
          console.warn(`⚠️ Could not clean reactions for ${msg.id}, but continuing...`);
        }

        await msg.reply(`✅ **${pending.author}** verified by ${user.username}!`);

        if (spawnInfo.confirmThreadId) {
          const confirmThread = await guild.channels.fetch(spawnInfo.confirmThreadId).catch(() => null);
          if (confirmThread) {
            const embed = new EmbedBuilder()
              .setColor(0x00ff00)
              .setTitle("✅ Attendance Verified")
              .setDescription(`**${pending.author}** verified for **${spawnInfo.boss}**`)
              .addFields(
                { name: "Verified By", value: user.username, inline: true },
                { name: "Points", value: `+${bossPoints[spawnInfo.boss].points}`, inline: true },
                { name: "Total Verified", value: `${spawnInfo.members.length}`, inline: true }
              )
              .setTimestamp();

            await confirmThread.send({ embeds: [embed] });
          }
        }

        delete pendingVerifications[msg.id];
        console.log(`✅ Verified: ${pending.author} for ${spawnInfo.boss} by ${user.username}`);
      } else if (reaction.emoji.name === "❌") {
        await msg.delete().catch(() => {});
        await msg.channel.send(
          `<@${pending.authorId}>, your attendance was **denied** by ${user.username}. ` +
          `Please repost with a proper screenshot.`
        );

        delete pendingVerifications[msg.id];
        console.log(`❌ Denied: ${pending.author} for ${spawnInfo.boss} by ${user.username}`);
      }
    }

    // Bidding bid confirmations
    const biddingState = bidding.getBiddingState();

    if (biddingState.pendingConfirmations[msg.id]) {
      console.log(`🎯 Bidding confirmation reaction detected: ${reaction.emoji.name} by ${user.username}`);

      if (reaction.emoji.name === "✅") {
        console.log(`✅ Confirming bid...`);
        await bidding.confirmBid(reaction, user, config);
      } else if (reaction.emoji.name === "❌") {
        console.log(`❌ Canceling bid...`);
        await bidding.cancelBid(reaction, user);
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

client.on(Events.Error, error => console.error("❌ Discord client error:", error));

process.on("unhandledRejection", error => console.error("❌ Unhandled promise rejection:", error));

process.on("SIGTERM", () => {
  console.log("🛑 SIGTERM received, shutting down gracefully...");
  server.close(() => {
    console.log("🌐 HTTP server closed");
    client.destroy();
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  console.log("🛑 SIGINT received, shutting down gracefully...");
  server.close(() => {
    console.log("🌐 HTTP server closed");
    client.destroy();
    process.exit(0);
  });
});

// ==========================================
// LOGIN
// ==========================================

if (!process.env.DISCORD_TOKEN) {
  console.error("❌ DISCORD_TOKEN environment variable not set!");
  process.exit(1);
}

client.login(process.env.DISCORD_TOKEN);