/**
 * ELYSIUM Guild Bot - Consolidated Version 3.1 (OPTIMIZED)
 * Features: Attendance tracking + Bidding system
 * Fixed: !bid recognition in auction threads, consolidated confirmations
 */

const {
  Client,
  GatewayIntentBits,
  Partials,
  Events,
  EmbedBuilder,
} = require("discord.js");
const fetch = require("node-fetch");
const levenshtein = require("fast-levenshtein");
const fs = require("fs");
const http = require("http");
const bidding = require("./bidding.js");
const helpSystem = require("./help-system.js");
const auctioneering = require("./auctioneering.js");
const attendance = require("./attendance.js");
const lootSystem = require("./loot-system.js");

const COMMAND_ALIASES = {
  // Help commands
  "!?": "!help",
  "!commands": "!help",
  "!cmds": "!help",

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

  // Bidding commands (admin)
  "!auc": "!auction",
  "!ql": "!queuelist",
  "!queue": "!queuelist",
  "!rm": "!removeitem",
  "!start": "!startauction",
  "!clearq": "!clearqueue",
  "!resetb": "!resetbids",
  "!forcesubmit": "!forcesubmitresults",
  "!testbid": "!testbidding",

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

const BOT_VERSION = "3.1";
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

// Import state from attendance module
let activeSpawns = {};
let activeColumns = {};
let pendingVerifications = {};
let pendingClosures = {};
let confirmationMessages = {};
let lastSheetCall = 0;
let lastOverrideTime = 0;
let lastAuctionEndTime = 0;
let isRecovering = false;
let isBidProcessing = false;
let biddingChannelCleanupTimer = null;
const AUCTION_COOLDOWN = 10 * 60 * 1000; // 10 minutes
const BIDDING_CHANNEL_CLEANUP_INTERVAL = 12 * 60 * 60 * 1000; // 12 hours

// ==========================================
// HTTP HEALTH CHECK SERVER
// ==========================================

const server = http.createServer((req, res) => {
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
    res.writeHead(404);
    res.end("Not Found");
  }
});

server.listen(PORT, () =>
  console.log(`🌐 Health check server on port ${PORT}`)
);

// ==========================================
// UTILITY FUNCTIONS
// ==========================================

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

  const adminLogs = await client.guilds
    .fetch(config.main_guild_id)
    .then((g) => g.channels.fetch(config.admin_logs_channel_id))
    .catch(() => null);

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

async function moveQueueItemsToSheet(config, queueItems) {
  try {
    const payload = {
      action: "moveQueueItemsToSheet",
      items: queueItems,
    };

    await fetch(config.sheet_webhook_url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    console.log(`✅ Queue items moved to sheet`);
  } catch (e) {
    console.error(`❌ Move items error:`, e);
  }
}

function resolveCommandAlias(cmd) {
  const lowerCmd = cmd.toLowerCase();
  return COMMAND_ALIASES[lowerCmd] || lowerCmd;
}

function isAdmin(member) {
  return member.roles.cache.some((r) => config.admin_roles.includes(r.name));
}

// ==========================================
// BIDDING CHANNEL CLEANUP
// ==========================================

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
            await message.delete().catch(() => {});
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
      `📊 Fetched: ${messagesFetched} messages | Deleted: ${messagesDeleted} non-admin messages`
    );
  } catch (e) {
    console.error(`❌ Bidding channel cleanup error:`, e);
  }
}

function startBiddingChannelCleanupSchedule() {
  console.log(`⏰ Starting bidding channel cleanup schedule (every 12 hours)`);

  // Run cleanup immediately on startup
  cleanupBiddingChannel().catch(console.error);

  // Then schedule every 12 hours
  biddingChannelCleanupTimer = setInterval(async () => {
    console.log(`⏰ Running scheduled bidding channel cleanup...`);
    await cleanupBiddingChannel().catch(console.error);
  }, BIDDING_CHANNEL_CLEANUP_INTERVAL);
}

function stopBiddingChannelCleanupSchedule() {
  if (biddingChannelCleanupTimer) {
    clearInterval(biddingChannelCleanupTimer);
    biddingChannelCleanupTimer = null;
    console.log(`⏹️ Bidding channel cleanup schedule stopped`);
  }
}

// ==========================================
// CONSOLIDATED CONFIRMATION UTILITY
// ==========================================

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

  await confirmMsg.react("✅");
  await confirmMsg.react("❌");

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

// ==========================================
// COMMAND HANDLERS
// ==========================================

// REPLACE ALL COMMAND HANDLERS in index2.js with this corrected version:

const commandHandlers = {
  // Help command
  loot: async (message, member, args) => {
    await lootSystem.handleLootCommand(message, args, client);
  },
  
  help: async (message, member) => {
    const args = message.content.trim().split(/\s+/).slice(1);
    await helpSystem.handleHelp(message, args, member);
  },

  status: async (message, member) => {
    const guild = message.guild;
    const uptime = attendance.formatUptime(Date.now() - BOT_START_TIME);
    const timeSinceSheet =
      lastSheetCall > 0
        ? `${Math.floor((Date.now() - lastSheetCall) / 1000)} seconds ago`
        : "Never";

        activeSpawns = attendance.getActiveSpawns();
    pendingVerifications = attendance.getPendingVerifications();

    const totalSpawns = Object.keys(activeSpawns).length;

    const activeSpawnEntries = Object.entries(activeSpawns);
    const sortedSpawns = activeSpawnEntries.sort((a, b) => {
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
        activeSpawns = {};
        activeColumns = {};
        pendingVerifications = {};
        pendingClosures = {};
        confirmationMessages = {};

        // Sync state back to attendance module
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
                      (m) => m.toLowerCase() === p.author.toLowerCase()
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
                  await confirmThread.delete().catch(() => {});
                }
              }

              await message.channel.send(
                `   ├─ 🧹 Cleaning up reactions from thread...`
              );
              const cleanupStats = await attendance.cleanupAllThreadReactions(thread);
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
                    await confirmThread.delete().catch(() => {});
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

  testbidding: async (message, member) => {
    await message.reply("🔍 **Testing Bidding System...**\n\nPlease wait...");

    const configCheck = {
      hasWebhook: !!config.sheet_webhook_url,
      webhookUrl: config.sheet_webhook_url
        ? config.sheet_webhook_url.substring(0, 50) + "..."
        : "MISSING",
      hasBiddingChannel: !!config.bidding_channel_id,
      biddingChannel: config.bidding_channel_id || "MISSING",
    };

    let pointsTest = {
      success: false,
      memberCount: 0,
      error: null,
      sampleMembers: [],
    };

    try {
      console.log("🔬 Attempting to fetch bidding points...");
      const biddingState = bidding.getBiddingState();

      const response = await fetch(config.sheet_webhook_url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "getBiddingPoints",
        }),
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
      queueLength: biddingState.q.length,
      hasActiveAuction: !!biddingState.a,
      activeAuctionItem: biddingState.a ? biddingState.a.item : "None",
      lockedPointsCount: Object.keys(biddingState.lp).length,
    };

    let channelTest = {
      canAccessChannel: false,
      channelName: "Unknown",
      isThread: false,
    };

    try {
      const biddingChannel = await client.channels.fetch(
        config.bidding_channel_id
      );
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
          value:
            `✅ Webhook URL: ${
              configCheck.hasWebhook ? "Configured" : "❌ MISSING"
            }\n` +
            `✅ Bidding Channel: ${
              configCheck.hasBiddingChannel ? "Configured" : "❌ MISSING"
            }\n` +
            `🔗 Webhook: \`${configCheck.webhookUrl}\`\n` +
            `🔗 Channel ID: \`${configCheck.biddingChannel}\``,
          inline: false,
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
              `4. Verify sheet has data`,
          inline: false,
        },
        {
          name: "🎯 Bidding State",
          value:
            `📋 Queue: ${stateInfo.queueLength} item(s)\n` +
            `🔴 Active Auction: ${
              stateInfo.hasActiveAuction
                ? `✅ ${stateInfo.activeAuctionItem}`
                : `⚪ None`
            }\n` +
            `🔒 Locked Points: ${stateInfo.lockedPointsCount} member(s)`,
          inline: false,
        },
        {
          name: "📡 Channel Access",
          value: channelTest.canAccessChannel
            ? `✅ **Can access channel**\n` +
              `📌 Name: ${channelTest.channelName}\n` +
              `📝 Type: ${channelTest.isThread ? "Thread" : "Channel"}`
            : `❌ **Cannot access channel**\n` +
              `Error: ${channelTest.error || "Unknown error"}`,
          inline: false,
        }
      )
      .setFooter({
        text: "If any tests failed, check the troubleshooting steps above",
      })
      .setTimestamp();

    await message.reply({ embeds: [embed] });

    console.log("╔════════════════════════════════════════════");
    console.log("🔍 BIDDING SYSTEM DIAGNOSTICS");
    console.log("╚════════════════════════════════════════════");
    console.log("Config:", JSON.stringify(configCheck, null, 2));
    console.log("Points Test:", JSON.stringify(pointsTest, null, 2));
    console.log("State:", JSON.stringify(stateInfo, null, 2));
    console.log("Channel:", JSON.stringify(channelTest, null, 2));
    console.log("╚════════════════════════════════════════════");
  },

  startauction: async (message, member) => {
    if (isRecovering) {
      return await message.reply(
        `⚠️ Bot is recovering from crash, please wait...`
      );
    }

    const auctState = auctioneering.getAuctionState();
    if (auctState.active) {
      return await message.reply(`❌ Auction session already running`);
    }

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
    const mins = parseInt(args[0]);
    if (isNaN(mins) || mins <= 0) {
      return await message.reply(`❌ Must be positive number`);
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

  queuelist: async (message, member) => {
    await auctioneering.handleQueueList(message, bidding.getBiddingState());
  },

  removeitem: async (message, member, args) => {
    await auctioneering.handleRemoveItem(message, args, bidding);
  },

  clearqueue: async (message, member) => {
    // Wrap in confirmation
    const totalItems = auctioneering.getAuctionState().itemQueue.length;
    if (totalItems === 0) {
      return await message.reply(`📋 Queue is already empty`);
    }
    await auctioneering.handleClearQueue(
      message,
      async (confirmMsg) => {
        // On confirm
        auctioneering.getAuctionState().itemQueue = [];
        await confirmMsg.reactions.removeAll().catch(() => {});
        await message.reply(`✅ Cleared ${totalItems} item(s)`);
      },
      async (confirmMsg) => {
        // On cancel
        await confirmMsg.reactions.removeAll().catch(() => {});
      }
    );
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
};

// ==========================================
// BOT READY EVENT
// ==========================================

client.once(Events.ClientReady, async () => {
  console.log(`✅ Bot logged in as ${client.user.tag}`);
  console.log(`📊 Tracking ${Object.keys(bossPoints).length} bosses`);
  console.log(`🟢 Main Guild: ${config.main_guild_id}`);
  console.log(`⏰ Timer Server: ${config.timer_server_id}`);
  console.log(`🤖 Version: ${BOT_VERSION}`);

  // INITIALIZE ALL MODULES IN CORRECT ORDER
  attendance.initialize(config, bossPoints, isAdmin); // NEW
  helpSystem.initialize(config, isAdmin, BOT_VERSION);
  auctioneering.initialize(config, isAdmin, bidding);
  bidding.initializeBidding(config, isAdmin, auctioneering);
  auctioneering.setPostToSheet(attendance.postToSheet); // Use attendance module's postToSheet
  lootSystem.initialize(config, bossPoints, isAdmin);

  console.log("\n╔═══════════════════════════════════════════════════════╗");
  console.log("║         🔄 BOT STATE RECOVERY (3-SWEEP SYSTEM)        ║");
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
  // SEND RECOVERY SUMMARY TO ADMIN LOGS
  // ═══════════════════════════════════════════════════════
  const adminLogs = await client.guilds
    .fetch(config.main_guild_id)
    .then((g) => g.channels.fetch(config.admin_logs_channel_id))
    .catch(() => null);

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
              `• **${d.boss}** (${d.timestamp}) - Columns: ${d.columns.join(", ")}`
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

  console.log("\n╔═══════════════════════════════════════════════════════╗");
  console.log("║              ✅ RECOVERY COMPLETE                      ║");
  console.log("╚═══════════════════════════════════════════════════════╝\n");

  // If thread recovery didn't find much, try Google Sheets
  if (!threadsRecovered || Object.keys(attendance.getActiveSpawns()).length === 0) {
    console.log("📊 Attempting to load attendance state from Google Sheets...");
    await attendance.loadAttendanceStateFromSheet();
  }

  await bidding.recoverBiddingState(client, config);

  // Start periodic state syncing to Google Sheets (memory optimization for Koyeb)
  console.log("🔄 Starting periodic state sync to Google Sheets...");
  attendance.schedulePeriodicStateSync();

  // Sync state references
  activeSpawns = attendance.getActiveSpawns();
  activeColumns = attendance.getActiveColumns();
  pendingVerifications = attendance.getPendingVerifications();
  pendingClosures = attendance.getPendingClosures();
  confirmationMessages = attendance.getConfirmationMessages();

  // START BIDDING CHANNEL CLEANUP SCHEDULE
  startBiddingChannelCleanupSchedule();
});

// ==========================================
// MESSAGE HANDLER
// ==========================================

client.on(Events.MessageCreate, async (message) => {
  try {
    // 🧹 BIDDING CHANNEL PROTECTION: Delete non-admin messages immediately
    if (
      message.guild &&
      message.channel.id === config.bidding_channel_id &&
      !message.author.bot
    ) {
      const member = await message.guild.members
        .fetch(message.author.id)
        .catch(() => null);

      // If not an admin, delete message immediately
      if (member && !isAdmin(member)) {
        try {
          await message.delete().catch(() => {});
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

          await attendance.createSpawnThreads(client, bossName, dateStr, timeStr, fullTimestamp, "timer");
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

      if (!inBiddingChannel) {
        console.log(`❌ !bid blocked - not in bidding channel/thread`);
        await message.reply(
          `❌ You can only use \`${rawCmd}\` in the auction threads!`
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

    // ✅ HANDLE !MYPOINTS AND ALIASES - BIDDING CHANNEL ONLY (NOT DURING AUCTION)
    if (
      resolvedCmd === "!mypoints" &&
      inBiddingChannel &&
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

    // Member check-in (spawn threads only)
    if (
      message.channel.isThread() &&
      message.channel.parentId === config.attendance_channel_id
    ) {
      // Sync state
  activeSpawns = attendance.getActiveSpawns();
  pendingVerifications = attendance.getPendingVerifications();

      const content = message.content.trim().toLowerCase();
      const keyword = content.split(/\s+/)[0];

      if (
        ["present", "here", "join", "checkin", "check-in"].includes(keyword)
      ) {
        const spawnInfo = activeSpawns[message.channel.id];

        if (!spawnInfo || spawnInfo.closed) {
          await message.reply(
            "⚠️ This spawn is closed. No more check-ins accepted."
          );
          return;
        }

        if (
          !userIsAdmin &&
          (!message.attachments || message.attachments.size === 0)
        ) {
          await message.reply(
            "⚠️ **Screenshot required!** Attach a screenshot showing boss and timestamp."
          );
          return;
        }

        const username = member.nickname || message.author.username;
        const isDuplicate = spawnInfo.members.some(
          (m) => m.toLowerCase() === username.toLowerCase()
        );

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
                (m) => m.toLowerCase() === pending.author.toLowerCase()
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
              if (originalMsg) await attendance.removeAllReactionsWithRetry(originalMsg);

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
          (m) => m.toLowerCase() === username.toLowerCase()
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
        client.config = config; // Store config for loot system
        await lootSystem.handleLootCommand(message, message.content.trim().split(/\s+/).slice(1), client);
        return;
      }

      // Admin logs override commands
      if (
        ["!clearstate", "!status", "!closeallthread", "!testbidding"].includes(
          adminCmd
        )
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
        else if (adminCmd === "!testbidding")
          await commandHandlers.testbidding(message, member);
        return;
      }

      // BIDDING & AUCTIONEERING COMMANDS - Admin logs only
      if (
        [
          "!auction",
          "!queuelist",
          "!removeitem",
          "!clearqueue",
          "!startauction",
          "!startauctionnow",
          "!pause",
          "!resume",
          "!stop",
          "!extend",
          "!resetbids",
          "!forcesubmitresults",
        ].includes(adminCmd)
      ) {
        console.log(`🎯 Processing auction command (${rawCmd} -> ${adminCmd})`);

        // Route to appropriate handler
        // These are handled by commandHandlers
        if (
          [
            "!startauction",
            "!startauctionnow",
            "!pause",
            "!resume",
            "!stop",
            "!extend",
          ].includes(adminCmd)
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
            "!removeitem",
            "!clearqueue",
            "!forcesubmitresults",
            "!cancelitem",
            "!skipitem",
          ].includes(adminCmd)
        ) {
          const handler = adminCmd.slice(1); // Remove the "!"

          if (handler === "queuelist") {
            await auctioneering.handleQueueList(
              message,
              bidding.getBiddingState()
            );
          } else if (handler === "removeitem") {
            await auctioneering.handleRemoveItem(message, args, bidding);
          } else if (handler === "clearqueue") {
            const totalItems = auctioneering.getAuctionState().itemQueue.length;
            if (totalItems === 0) {
              return await message.reply(`📋 Queue is already empty`);
            }
            await auctioneering.handleClearQueue(
              message,
              async (confirmMsg) => {
                auctioneering.getAuctionState().itemQueue = [];
                await confirmMsg.reactions.removeAll().catch(() => {});
                await message.reply(`✅ Cleared ${totalItems} item(s)`);
              },
              async (confirmMsg) => {
                await confirmMsg.reactions.removeAll().catch(() => {});
                await message.reply(`❌ Clear canceled`);
              }
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
          }
        }
        // Everything else (!auction, !resetbids) goes to bidding.handleCommand
        else {
          await bidding.handleCommand(adminCmd, message, args, client, config);
        }
        return;
      }

      // !addthread
      if (adminCmd === "!addthread") {
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

        await attendance.createSpawnThreads(client, bossName, dateStr, timeStr, fullTimestamp, "timer");

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
            .send(
              `⚠️ <@${user.id}>, this spawn is closed. Reaction removed.`
            )
            .then((m) => setTimeout(() => m.delete().catch(() => {}), 5000));
        } catch (err) {
          console.error(`❌ Failed to send/delete closed spawn message:`, err.message);
        }
        return;
      }
    }

    const adminMember = await guild.members.fetch(user.id).catch(() => null);
    if (!adminMember || !isAdmin(adminMember)) {
      try {
        await reaction.users.remove(user.id);
      } catch (e) {
        console.error(`❌ Failed to remove non-admin reaction from ${user.tag}:`, e.message);
      }
      return;
    }

    // Attendance verification
    const pending = pendingVerifications[msg.id];

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
          (m) => m.toLowerCase() === pending.author.toLowerCase()
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
        await msg.reply(`✅ **${pending.author}** verified by ${user.username}!`);

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
        await msg.delete().catch(() => {});
        await msg.channel.send(
          `<@${pending.authorId}>, your attendance was **denied** by ${user.username}. ` +
            `Please repost with a proper screenshot.`
        );

        delete pendingVerifications[msg.id];
        attendance.setPendingVerifications(pendingVerifications); // Sync
      }
    }

    // Close confirmation
    const closePending = pendingClosures[msg.id];

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
              await confirmThread.delete().catch(() => {});
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

    // Bidding confirmations (keep as is)
    const biddingState = bidding.getBiddingState();

    if (biddingState.pc[msg.id]) {
      if (reaction.emoji.name === "✅") {
        await bidding.confirmBid(reaction, user, config);
      } else if (reaction.emoji.name === "❌") {
        await bidding.cancelBid(reaction, user, config);
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

// ==========================================
// EXPORT FUNCTIONS TO AUCTIONEERING MODULE
// ==========================================

global.postToSheet = attendance.postToSheet;

// ==========================================
// LOGIN
// ==========================================

if (!process.env.DISCORD_TOKEN) {
  console.error("❌ DISCORD_TOKEN environment variable not set!");
  process.exit(1);
}

client.login(process.env.DISCORD_TOKEN);
