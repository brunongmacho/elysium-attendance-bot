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
// levenshtein removed - fuzzy matching now in utils/common.js via utils/cache-manager.js
const fs = require("fs");
const http = require("http");
const bidding = require("./bidding.js");
const helpSystem = require("./help-system.js");
const auctioneering = require("./auctioneering.js");
const attendance = require("./attendance.js");
const lootSystem = require("./loot-system.js");
const emergencyCommands = require("./emergency-commands.js");
const leaderboardSystem = require("./leaderboard-system.js");
const errorHandler = require('./utils/error-handler');

const COMMAND_ALIASES = {
  // Help commands
  "!?": "!help",
  "!commands": "!help",
  "!cmds": "!help",

  // Leaderboard commands
  "!leadatt": "!leaderboardattendance",
  "!leadbid": "!leaderboardbidding",
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
  "!auc": "!auction",
  "!ql": "!queuelist",
  "!queue": "!queuelist",
  "!rm": "!removeitem",
  "!start": "!startauction",
  "!clearq": "!clearqueue",
  "!resetb": "!resetbids",
  "!forcesubmit": "!forcesubmitresults",

  // Emergency commands (admin)
  "!emerg": "!emergency",

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

// Initialize Discord client with memory optimization
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
  // Memory optimization: Sweep caches regularly to manage 256MB RAM limit
  sweepers: {
    messages: {
      interval: 300, // Every 5 minutes
      lifetime: 600, // Remove messages older than 10 minutes
    },
    users: {
      interval: 600, // Every 10 minutes
      filter: () => (user) => user.bot && user.id !== client.user?.id, // Keep only non-bot users and self
    },
    guildMembers: {
      interval: 900, // Every 15 minutes
      filter: () => (member) => member.id !== client.user?.id, // Keep only self
    },
  },
  // Use default caching - rely on sweepers for memory management
});

// ==========================================
// CONSTANTS & STATE
// ==========================================

const BOT_VERSION = "8.1";
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

    const auctState = auctioneering.getAuctionState();
    if (auctState.active && auctState.currentItem) {
      const biddingState = bidding.getBiddingState();
      const pendingBid = biddingState.pc[msg.id];

      if (pendingBid && pendingBid.isAuctioneering) {
        if (reaction.emoji.name === "✅") {
          // Handle auctioneering bid confirmation
          const currentItem = auctState.currentItem;

          if (!currentItem || currentItem.status === "ended") {
            await msg.channel.send(
              `❌ <@${user.id}> Auction item no longer active`
            );
            await errorHandler.safeRemoveReactions(msg, 'reaction removal');
            await errorHandler.safeDelete(msg, 'message deletion');
            delete biddingState.pc[msg.id];
            bidding.saveBiddingState();
            return;
          }

          if (pendingBid.amount <= currentItem.curBid) {
            await msg.channel.send(
              `❌ <@${user.id}> Bid invalid. Current: ${currentItem.curBid}pts`
            );
            await errorHandler.safeRemoveReactions(msg, 'reaction removal');
            await errorHandler.safeDelete(msg, 'message deletion');
            delete biddingState.pc[msg.id];
            bidding.saveBiddingState();
            return;
          }

          // Handle previous winner
          if (currentItem.curWin && !pendingBid.isSelf) {
            const prevWinner = currentItem.curWin;
            const prevAmount = currentItem.curBid;

            // Unlock previous winner's points
            const biddingStateMod = bidding.getBiddingState();
            biddingStateMod.lp[prevWinner] = Math.max(
              0,
              (biddingStateMod.lp[prevWinner] || 0) - prevAmount
            );
            bidding.saveBiddingState();

            await msg.channel.send({
              content: `<@${currentItem.curWinId}>`,
              embeds: [
                new EmbedBuilder()
                  .setColor(0xffa500)
                  .setTitle(`⚠️ Outbid!`)
                  .setDescription(
                    `Someone bid **${pendingBid.amount}pts** on **${currentItem.item}**`
                  ),
              ],
            });
          }

          // Lock new bidder's points
          const biddingStateMod = bidding.getBiddingState();
          biddingStateMod.lp[pendingBid.username] =
            (biddingStateMod.lp[pendingBid.username] || 0) + pendingBid.needed;
          bidding.saveBiddingState();

          const prevBid = currentItem.curBid;
          const updatedBids = [
            ...currentItem.bids,
            {
              user: pendingBid.username,
              userId: pendingBid.userId,
              amount: pendingBid.amount,
              timestamp: Date.now(),
            },
          ];

          const timeLeft = currentItem.endTime - Date.now();
          let newEndTime = currentItem.endTime;
          let newExtCnt = currentItem.extCnt;

          if (timeLeft < 60000 && currentItem.extCnt < 60) {
            newEndTime = currentItem.endTime + 60000;
            newExtCnt = currentItem.extCnt + 1;
          }

          // Update auctioneering state
          auctioneering.updateCurrentItemState({
            curBid: pendingBid.amount,
            curWin: pendingBid.username,
            curWinId: pendingBid.userId,
            bids: updatedBids,
            endTime: newEndTime,
            extCnt: newExtCnt,
            go1:
              timeLeft < 60000 && currentItem.extCnt < 60
                ? false
                : currentItem.go1,
            go2:
              timeLeft < 60000 && currentItem.extCnt < 60
                ? false
                : currentItem.go2,
          });

          if (biddingState.th[`c_${msg.id}`]) {
            clearTimeout(biddingState.th[`c_${msg.id}`]);
            delete biddingState.th[`c_${msg.id}`];
          }

          await msg.edit({
            embeds: [
              new EmbedBuilder()
                .setColor(0x00ff00)
                .setTitle(`✅ Bid Confirmed!`)
                .setDescription(`Highest bidder on **${currentItem.item}**`)
                .addFields(
                  {
                    name: `💰 Your Bid`,
                    value: `${pendingBid.amount}pts`,
                    inline: true,
                  },
                  {
                    name: `📊 Previous`,
                    value: `${prevBid}pts`,
                    inline: true,
                  },
                  {
                    name: `⏱️ Time Left`,
                    value: `${Math.floor(timeLeft / 60000)}m ${Math.floor(
                      (timeLeft % 60000) / 1000
                    )}s`,
                    inline: true,
                  }
                )
                .setFooter({
                  text: pendingBid.isSelf
                    ? `Self-overbid (+${pendingBid.needed}pts)`
                    : timeLeft < 60000 && currentItem.extCnt < 60
                    ? `🕐 Extended!`
                    : "Good luck!",
                }),
            ],
          });
          await errorHandler.safeRemoveReactions(msg, 'reaction removal');

          await msg.channel.send({
            embeds: [
              new EmbedBuilder()
                .setColor(0xffd700)
                .setTitle(`🔥 New High Bid!`)
                .addFields(
                  {
                    name: `💰 Amount`,
                    value: `${pendingBid.amount}pts`,
                    inline: true,
                  },
                  {
                    name: "👤 Bidder",
                    value: pendingBid.username,
                    inline: true,
                  }
                ),
            ],
          });

          setTimeout(async () => await errorHandler.safeDelete(msg, 'message deletion'), 5000);
          if (pendingBid.origMsgId) {
            const orig = await msg.channel.messages
              .fetch(pendingBid.origMsgId)
              .catch(() => null);
            if (orig) await errorHandler.safeDelete(orig, 'message deletion');
          }

          delete biddingState.pc[msg.id];
          bidding.saveBiddingState();

          console.log(
            `✅ Auctioneering bid: ${pendingBid.username} - ${
              pendingBid.amount
            }pts${pendingBid.isSelf ? ` (self +${pendingBid.needed}pts)` : ""}`
          );
          return;
        } else if (reaction.emoji.name === "❌") {
          // Cancel auctioneering bid
          await msg.edit({
            embeds: [
              new EmbedBuilder()
                .setColor(0x4a90e2)
                .setTitle(`❌ Bid Canceled`)
                .setDescription("Not placed"),
            ],
          });
          await errorHandler.safeRemoveReactions(msg, 'reaction removal');
          setTimeout(async () => await errorHandler.safeDelete(msg, 'message deletion'), 3000);

          if (pendingBid.origMsgId) {
            const orig = await msg.channel.messages
              .fetch(pendingBid.origMsgId)
              .catch(() => null);
            if (orig) await errorHandler.safeDelete(orig, 'message deletion');
          }

          if (biddingState.th[`c_${msg.id}`]) {
            clearTimeout(biddingState.th[`c_${msg.id}`]);
            delete biddingState.th[`c_${msg.id}`];
          }

          delete biddingState.pc[msg.id];
          bidding.saveBiddingState();
          return;
        }
      }
    }

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

    // Add reactions
    try {
      await confirmMsg.react("✅");
      await confirmMsg.react("❌");
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
        const guild = await client.guilds.fetch(config.main_guild_id);
        const biddingChannel = await guild.channels.fetch(
          config.bidding_channel_id
        );

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

  removeitem: async (message, member, args) => {
    await auctioneering.handleRemoveItem(message, args, bidding);
  },

  clearqueue: async (message, member) => {
    // Manual queue deprecated - just show deprecation message
    await auctioneering.handleClearQueue(message);
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
              const guild = await client.guilds.fetch(config.main_guild_id);
              const attChannel = await guild.channels.fetch(
                config.attendance_channel_id
              );
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
  // LEADERBOARD COMMANDS
  // ==========================================

  leaderboardattendance: async (message, member) => {
    if (!isAdmin(member)) {
      await message.reply("❌ Only admins can view leaderboards.");
      return;
    }

    console.log(`📊 ${member.user.username} requested attendance leaderboard`);
    await leaderboardSystem.displayAttendanceLeaderboard(message);
  },

  leaderboardbidding: async (message, member) => {
    if (!isAdmin(member)) {
      await message.reply("❌ Only admins can view leaderboards.");
      return;
    }

    console.log(`📊 ${member.user.username} requested bidding leaderboard`);
    await leaderboardSystem.displayBiddingLeaderboard(message);
  },

  weeklyreport: async (message, member) => {
    if (!isAdmin(member)) {
      await message.reply("❌ Only admins can trigger weekly reports.");
      return;
    }

    console.log(`📅 ${member.user.username} manually triggered weekly report`);
    await message.reply("📊 Generating weekly report...");
    await leaderboardSystem.sendWeeklyReport();
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

  // INITIALIZE AUCTION CACHE (100% uptime guarantee)
  const auctionCache = require('./utils/auction-cache');
  await auctionCache.init();

  // INITIALIZE ALL MODULES IN CORRECT ORDER
  attendance.initialize(config, bossPoints, isAdmin); // NEW
  helpSystem.initialize(config, isAdmin, BOT_VERSION);
  auctioneering.initialize(config, isAdmin, bidding);
  bidding.initializeBidding(config, isAdmin, auctioneering);
  auctioneering.setPostToSheet(attendance.postToSheet); // Use attendance module's postToSheet
  lootSystem.initialize(config, bossPoints, isAdmin);
  emergencyCommands.initialize(
    config,
    attendance,
    bidding,
    auctioneering,
    isAdmin
  );
  leaderboardSystem.init(client, config); // Initialize leaderboard system

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

  // START DAILY AUCTION SCHEDULER (8:30 PM GMT+8)
  console.log("🔨 Starting daily auction scheduler...");
  auctioneering.scheduleDailyAuction(client, config);

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

// ==========================================
// MESSAGE HANDLER
// ==========================================

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

    // Leaderboard commands (admin only, anywhere except spawn threads)
    if (
      resolvedCmd === "!leaderboardattendance" ||
      resolvedCmd === "!leaderboardbidding" ||
      resolvedCmd === "!weeklyreport"
    ) {
      if (!userIsAdmin) {
        await message.reply("❌ Only admins can use leaderboard commands.");
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
      } else if (resolvedCmd === "!weeklyreport") {
        await commandHandlers.weeklyreport(message, member);
      }
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
        client.config = config; // Store config for loot system
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
        return;
      }

      // BIDDING & AUCTIONEERING COMMANDS - Admin logs only
      // NOTE: !pause, !resume, !stop, !extend are thread-only commands now
      if (
        [
          "!auction",
          "!queuelist",
          "!removeitem",
          "!clearqueue",
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
            "!removeitem",
            "!clearqueue",
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
          } else if (handler === "removeitem") {
            await auctioneering.handleRemoveItem(message, args, bidding);
          } else if (handler === "clearqueue") {
            // Manual queue deprecated - just show deprecation message
            await auctioneering.handleClearQueue(message);
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
