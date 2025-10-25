/**
 * ELYSIUM Guild Bidding System - Version 4.3 (OPTIMIZED WITH POINTS CACHE)
 * PERFORMANCE: 30-50x faster bidding with instant validation
 */

const { EmbedBuilder } = require("discord.js");
const fetch = require("node-fetch");
const fs = require("fs");

// STATE
let biddingState = {
  auctionQueue: [],
  activeAuction: null,
  lockedPoints: {},
  auctionHistory: [],
  isDryRun: false,
  timerHandles: {},
  pendingConfirmations: {},
  sessionDate: null,
  cachedPoints: null,
  cacheTimestamp: null, // ✅ CACHE
};

const STATE_FILE = "./bidding-state.json";

// HELPERS
const hasElysiumRole = (member) =>
  member.roles.cache.some((r) => r.name === "ELYSIUM");
const isAdmin = (member, config) =>
  member.roles.cache.some((r) => config.admin_roles.includes(r.name));
const getCurrentTimestamp = () => {
  const d = new Date();
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(
    d.getDate()
  ).padStart(2, "0")}/${d.getFullYear()} ${String(d.getHours()).padStart(
    2,
    "0"
  )}:${String(d.getMinutes()).padStart(2, "0")}`;
};
const formatDuration = (m) =>
  m < 60
    ? `${m}min`
    : m % 60 > 0
    ? `${Math.floor(m / 60)}h ${m % 60}min`
    : `${Math.floor(m / 60)}h`;
const formatTimeRemaining = (ms) => {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60),
    secs = s % 60;
  if (m < 60) return secs > 0 ? `${m}m ${secs}s` : `${m}m`;
  const h = Math.floor(m / 60);
  return m % 60 > 0 ? `${h}h ${m % 60}m` : `${h}h`;
};
const getAvailablePoints = (member, total) =>
  Math.max(0, total - (biddingState.lockedPoints[member] || 0));
const lockPoints = (member, amount) => {
  biddingState.lockedPoints[member] =
    (biddingState.lockedPoints[member] || 0) + amount;
  saveBiddingState();
};
const unlockPoints = (member, amount) => {
  biddingState.lockedPoints[member] = Math.max(
    0,
    (biddingState.lockedPoints[member] || 0) - amount
  );
  if (biddingState.lockedPoints[member] === 0)
    delete biddingState.lockedPoints[member];
  saveBiddingState();
};

// STATE PERSISTENCE
function saveBiddingState() {
  try {
    // Create a copy without timerHandles (they can't be serialized)
    const { timerHandles, ...serializableState } = biddingState;
    fs.writeFileSync(STATE_FILE, JSON.stringify(serializableState, null, 2));
  } catch (e) {
    console.error("❌ Save failed:", e);
  }
}
function loadBiddingState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const loaded = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
      biddingState = { ...biddingState, ...loaded, timerHandles: {} };
      return true;
    }
  } catch (e) {
    console.error("❌ Load failed:", e);
  }
  return false;
}

// SHEETS API
async function fetchBiddingPoints(webhookUrl, isDryRun = false) {
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "getBiddingPoints", dryRun: isDryRun }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()).points || {};
  } catch (e) {
    console.error("❌ Fetch points failed:", e);
    return null;
  }
}

async function submitAuctionResults(
  webhookUrl,
  results,
  timestamp,
  isDryRun = false
) {
  if (!timestamp || !results || results.length === 0)
    return { success: false, error: "Missing data" };
  for (let i = 1; i <= 3; i++) {
    try {
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "submitBiddingResults",
          results,
          timestamp,
          dryRun: isDryRun,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.status === "ok") {
        console.log("✅ Results submitted");
        return { success: true, data };
      }
      throw new Error(data.message || "Unknown error");
    } catch (e) {
      console.error(`❌ Submit attempt ${i} failed:`, e.message);
      if (i < 3) await new Promise((r) => setTimeout(r, i * 2000));
      else return { success: false, error: e.message, results };
    }
  }
}

// ✅ CACHE MANAGEMENT (KEY OPTIMIZATION)
async function loadPointsCache(webhookUrl, isDryRun = false) {
  console.log("⚡ Loading points cache...");
  const start = Date.now();
  const points = await fetchBiddingPoints(webhookUrl, isDryRun);
  if (!points) {
    console.error("❌ Cache load failed");
    return false;
  }
  biddingState.cachedPoints = points;
  biddingState.cacheTimestamp = Date.now();
  saveBiddingState();
  console.log(
    `✅ Cache loaded in ${Date.now() - start}ms - ${
      Object.keys(points).length
    } members`
  );
  return true;
}

function getCachedPoints(username) {
  if (!biddingState.cachedPoints) return null;
  let pts = biddingState.cachedPoints[username];
  if (pts === undefined) {
    const match = Object.keys(biddingState.cachedPoints).find(
      (n) => n.toLowerCase() === username.toLowerCase()
    );
    pts = match ? biddingState.cachedPoints[match] : 0;
  }
  return pts || 0;
}

function clearPointsCache() {
  console.log("🧹 Clearing cache");
  biddingState.cachedPoints = null;
  biddingState.cacheTimestamp = null;
  saveBiddingState();
}

// QUEUE MANAGEMENT
const addToQueue = (item, startPrice, duration) => {
  const auction = {
    id: `auction_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    item: item.trim(),
    startPrice: parseInt(startPrice),
    duration: parseInt(duration),
    addedAt: Date.now(),
  };
  biddingState.auctionQueue.push(auction);
  saveBiddingState();
  return auction;
};
const removeFromQueue = (itemName) => {
  const idx = biddingState.auctionQueue.findIndex(
    (a) => a.item.toLowerCase() === itemName.toLowerCase()
  );
  if (idx === -1) return null;
  const removed = biddingState.auctionQueue.splice(idx, 1)[0];
  saveBiddingState();
  return removed;
};
const clearQueue = () => {
  const cnt = biddingState.auctionQueue.length;
  biddingState.auctionQueue = [];
  saveBiddingState();
  return cnt;
};

// AUCTION LIFECYCLE
async function startAuctionSession(client, config) {
  if (biddingState.auctionQueue.length === 0)
    return { success: false, message: "No items in queue" };
  if (biddingState.activeAuction)
    return { success: false, message: "Auction already in progress" };

  // ✅ LOAD CACHE FIRST
  if (!(await loadPointsCache(config.sheet_webhook_url, biddingState.isDryRun)))
    return { success: false, message: "❌ Failed to load points from Sheets" };

  biddingState.sessionDate = getCurrentTimestamp();
  const first = biddingState.auctionQueue[0];
  await startNextAuction(client, config);
  saveBiddingState();
  return {
    success: true,
    totalItems: biddingState.auctionQueue.length,
    firstItem: first.item,
    cachedMembers: Object.keys(biddingState.cachedPoints).length,
  };
}

async function startNextAuction(client, config) {
  if (biddingState.auctionQueue.length === 0) {
    await finalizeAuctionSession(client, config);
    return;
  }

  const data = biddingState.auctionQueue[0];
  const guild = await client.guilds.fetch(config.main_guild_id);
  const channel = await guild.channels.fetch(config.bidding_channel_id);
  const thread = await channel.threads.create({
    name: `${data.item} - ${getCurrentTimestamp()} | ${
      data.startPrice
    }pts | ${formatDuration(data.duration)}`,
    autoArchiveDuration: 60,
    reason: `Auction: ${data.item}`,
  });

  biddingState.activeAuction = {
    ...data,
    threadId: thread.id,
    currentBid: data.startPrice,
    currentWinner: null,
    currentWinnerId: null,
    bids: [],
    endTime: null,
    extendedCount: 0,
    status: "preview",
    goingOnceAnnounced: false,
    goingTwiceAnnounced: false,
  };

  await thread.send({
    content: "@everyone",
    embeds: [
      new EmbedBuilder()
        .setColor(0xffd700)
        .setTitle("🏆 AUCTION STARTING")
        .setDescription(`**${data.item}**`)
        .addFields(
          {
            name: "💰 Starting Bid",
            value: `${data.startPrice} points`,
            inline: true,
          },
          {
            name: "⏱️ Duration",
            value: formatDuration(data.duration),
            inline: true,
          },
          {
            name: "📋 Items Remaining",
            value: `${biddingState.auctionQueue.length - 1} after this`,
            inline: true,
          }
        )
        .setFooter({
          text: biddingState.isDryRun ? "🧪 DRY RUN" : "Bidding starts in 20s",
        })
        .setTimestamp(),
    ],
  });

  biddingState.timerHandles.auctionStart = setTimeout(
    async () => await activateAuction(client, config, thread),
    20000
  );
  saveBiddingState();
}

async function activateAuction(client, config, thread) {
  biddingState.activeAuction.status = "active";
  biddingState.activeAuction.endTime =
    Date.now() + biddingState.activeAuction.duration * 60000;
  await thread.send({
    embeds: [
      new EmbedBuilder()
        .setColor(0x00ff00)
        .setTitle("🔔 BIDDING STARTS NOW!")
        .setDescription("Type `!bid <amount>` to place your bid")
        .addFields(
          {
            name: "💰 Current Bid",
            value: `${biddingState.activeAuction.currentBid} points`,
            inline: true,
          },
          {
            name: "⏱️ Time Left",
            value: formatDuration(biddingState.activeAuction.duration),
            inline: true,
          }
        )
        .setFooter({ text: "⚡ INSTANT validation!" }),
    ],
  });
  scheduleAuctionTimers(client, config);
  saveBiddingState();
}

function scheduleAuctionTimers(client, config) {
  const a = biddingState.activeAuction,
    t = a.endTime - Date.now();
  ["goingOnce", "goingTwice", "finalCall", "auctionEnd"].forEach((k) => {
    if (biddingState.timerHandles[k])
      clearTimeout(biddingState.timerHandles[k]);
  });
  if (t > 60000 && !a.goingOnceAnnounced)
    biddingState.timerHandles.goingOnce = setTimeout(
      async () => await announceGoingOnce(client, config),
      t - 60000
    );
  if (t > 30000 && !a.goingTwiceAnnounced)
    biddingState.timerHandles.goingTwice = setTimeout(
      async () => await announceGoingTwice(client, config),
      t - 30000
    );
  if (t > 10000)
    biddingState.timerHandles.finalCall = setTimeout(
      async () => await announceFinalCall(client, config),
      t - 10000
    );
  biddingState.timerHandles.auctionEnd = setTimeout(
    async () => await endAuction(client, config),
    t
  );
}

async function announceGoingOnce(client, config) {
  const a = biddingState.activeAuction;
  if (!a || a.status !== "active") return;
  const guild = await client.guilds.fetch(config.main_guild_id),
    thread = await guild.channels.fetch(a.threadId);
  await thread.send({
    content: "@everyone",
    embeds: [
      new EmbedBuilder()
        .setColor(0xffa500)
        .setTitle("⚠️ GOING ONCE!")
        .setDescription("1 minute remaining")
        .addFields({
          name: "💰 Current Bid",
          value: a.currentWinner
            ? `${a.currentBid} points by ${a.currentWinner}`
            : `${a.startPrice} points (no bids)`,
          inline: false,
        }),
    ],
  });
  a.goingOnceAnnounced = true;
  saveBiddingState();
}

async function announceGoingTwice(client, config) {
  const a = biddingState.activeAuction;
  if (!a || a.status !== "active") return;
  const guild = await client.guilds.fetch(config.main_guild_id),
    thread = await guild.channels.fetch(a.threadId);
  await thread.send({
    content: "@everyone",
    embeds: [
      new EmbedBuilder()
        .setColor(0xff6600)
        .setTitle("⚠️ GOING TWICE!")
        .setDescription("30 seconds remaining")
        .addFields({
          name: "💰 Current Bid",
          value: a.currentWinner
            ? `${a.currentBid} points by ${a.currentWinner}`
            : `${a.startPrice} points (no bids)`,
          inline: false,
        }),
    ],
  });
  a.goingTwiceAnnounced = true;
  saveBiddingState();
}

async function announceFinalCall(client, config) {
  const a = biddingState.activeAuction;
  if (!a || a.status !== "active") return;
  const guild = await client.guilds.fetch(config.main_guild_id),
    thread = await guild.channels.fetch(a.threadId);
  await thread.send({
    content: "@everyone",
    embeds: [
      new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle("⚠️ FINAL CALL!")
        .setDescription("10 seconds remaining")
        .addFields({
          name: "💰 Current Bid",
          value: a.currentWinner
            ? `${a.currentBid} points by ${a.currentWinner}`
            : `${a.startPrice} points (no bids)`,
          inline: false,
        }),
    ],
  });
  saveBiddingState();
}

async function endAuction(client, config) {
  const a = biddingState.activeAuction;
  if (!a) return;
  a.status = "ended";
  const guild = await client.guilds.fetch(config.main_guild_id),
    thread = await guild.channels.fetch(a.threadId);

  if (a.currentWinner) {
    await thread.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0xffd700)
          .setTitle("🔨 SOLD!")
          .setDescription(`**${a.item}** has been sold!`)
          .addFields(
            {
              name: "🏆 Winner",
              value: `<@${a.currentWinnerId}>`,
              inline: true,
            },
            {
              name: "💰 Winning Bid",
              value: `${a.currentBid} points`,
              inline: true,
            }
          )
          .setFooter({
            text: biddingState.isDryRun
              ? "🧪 DRY RUN"
              : "Points deducted after all auctions",
          })
          .setTimestamp(),
      ],
    });
    biddingState.auctionHistory.push({
      item: a.item,
      winner: a.currentWinner,
      winnerId: a.currentWinnerId,
      amount: a.currentBid,
      timestamp: Date.now(),
    });
  } else {
    await thread.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0x808080)
          .setTitle("❌ NO BIDS")
          .setDescription(`**${a.item}** received no bids`)
          .setFooter({ text: "Moving to next item..." }),
      ],
    });
  }

  await thread.setArchived(true, "Auction ended").catch(() => {});
  biddingState.auctionQueue.shift();
  biddingState.activeAuction = null;
  saveBiddingState();

  if (biddingState.auctionQueue.length > 0) {
    const next = biddingState.auctionQueue[0];
    await thread.parent.send(
      `⏳ Next auction in 20s...\n📦 **${next.item}** - ${next.startPrice} points`
    );
    biddingState.timerHandles.nextAuction = setTimeout(
      async () => await startNextAuction(client, config),
      20000
    );
  } else
    setTimeout(async () => await finalizeAuctionSession(client, config), 2000);
}

async function finalizeAuctionSession(client, config) {
  const guild = await client.guilds.fetch(config.main_guild_id);
  const adminLogs = await guild.channels.fetch(config.admin_logs_channel_id);
  const biddingChannel = await guild.channels.fetch(config.bidding_channel_id);

  if (biddingState.auctionHistory.length === 0) {
    await biddingChannel.send(
      "🎊 **Auction session complete!** No items sold."
    );
    clearPointsCache();
    biddingState.sessionDate = null;
    biddingState.lockedPoints = {};
    saveBiddingState();
    return;
  }

  if (!biddingState.sessionDate)
    biddingState.sessionDate = getCurrentTimestamp();
  const totals = {};
  biddingState.auctionHistory.forEach(
    (a) => (totals[a.winner] = (totals[a.winner] || 0) + a.amount)
  );
  const results = Object.entries(totals).map(([member, total]) => ({
    member,
    totalSpent: total,
  }));
  const submission = await submitAuctionResults(
    config.sheet_webhook_url,
    results,
    biddingState.sessionDate,
    biddingState.isDryRun
  );

  if (submission.success) {
    const winnerList = biddingState.auctionHistory
      .map((a) => `• **${a.item}**: ${a.winner} - ${a.amount}pts`)
      .join("\n");
    const embed = new EmbedBuilder()
      .setColor(0x00ff00)
      .setTitle("✅ Auction Session Complete!")
      .setDescription("Results submitted to Sheets")
      .addFields(
        { name: "🕐 Timestamp", value: biddingState.sessionDate, inline: true },
        {
          name: "🏆 Items Sold",
          value: `${biddingState.auctionHistory.length}`,
          inline: true,
        },
        {
          name: "💰 Total",
          value: `${results.reduce((s, r) => s + r.totalSpent, 0)}`,
          inline: true,
        },
        { name: "📋 Winners", value: winnerList || "None" }
      )
      .setFooter({
        text: biddingState.isDryRun ? "🧪 DRY RUN" : "Points deducted",
      })
      .setTimestamp();
    await biddingChannel.send({ embeds: [embed] });
    await adminLogs.send({ embeds: [embed] });
  } else {
    const data = results
      .map((r) => `${r.member}: ${r.totalSpent}pts`)
      .join("\n");
    await adminLogs.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0xff0000)
          .setTitle("❌ Sheet Submission Failed")
          .setDescription(
            `**Error:** ${submission.error}\n**Timestamp:** ${biddingState.sessionDate}`
          )
          .addFields({
            name: "📝 Manual Entry Required",
            value: `\`\`\`\n${data}\n\`\`\``,
          })
          .setTimestamp(),
      ],
    });
    await biddingChannel.send("❌ Sheet submission failed. Admins notified.");
  }

  biddingState.auctionHistory = [];
  biddingState.sessionDate = null;
  biddingState.lockedPoints = {};
  clearPointsCache();
  saveBiddingState();
}

// ✅ OPTIMIZED BIDDING (USES CACHE - NO SHEETS CALLS!)
async function processBid(message, amount, config) {
  const a = biddingState.activeAuction;
  if (!a) return { success: false, message: "No active auction" };
  if (a.status !== "active")
    return { success: false, message: "Auction not started yet" };
  if (message.channel.id !== a.threadId)
    return { success: false, message: "Wrong thread" };

  const member = message.member,
    username = member.nickname || message.author.username;
  if (!hasElysiumRole(member) && !isAdmin(member, config)) {
    await message.reply("❌ **Access Denied** - Need ELYSIUM role");
    return { success: false, message: "No ELYSIUM role" };
  }

  const bidAmount = parseInt(amount);
  if (isNaN(bidAmount) || bidAmount <= 0)
    return { success: false, message: "Invalid bid" };
  if (bidAmount <= a.currentBid) {
    await message.reply(`❌ Bid must be > ${a.currentBid} points`);
    return { success: false, message: "Bid too low" };
  }

  // ✅ USE CACHE (INSTANT!)
  if (!biddingState.cachedPoints) {
    await message.reply("❌ **Cache not loaded!** Contact admin.");
    return { success: false, message: "No cache" };
  }
  const totalPoints = getCachedPoints(username),
    availablePoints = getAvailablePoints(username, totalPoints);

  if (totalPoints === 0) {
    await message.reply("❌ No bidding points available");
    return { success: false, message: "No points" };
  }
  if (bidAmount > availablePoints) {
    await message.reply(
      `❌ **Insufficient points!**\n💰 Total: ${totalPoints}\n💳 Locked: ${
        biddingState.lockedPoints[username] || 0
      }\n📊 Available: ${availablePoints}\nNeed: ${bidAmount}`
    );
    return { success: false, message: "Insufficient points" };
  }

  const confirmEmbed = new EmbedBuilder()
    .setColor(0xffd700)
    .setTitle("⏳ Confirm Your Bid")
    .setDescription(`**${a.item}**`)
    .addFields(
      { name: "💰 Your Bid", value: `${bidAmount} points`, inline: true },
      { name: "📊 Current", value: `${a.currentBid} points`, inline: true },
      {
        name: "💳 After",
        value: `${availablePoints - bidAmount} points`,
        inline: true,
      }
    )
    .setFooter({
      text: "React ✅ confirm / ❌ cancel • 30s timeout • ⚡ Instant!",
    });

  const confirmMsg = await message.reply({ embeds: [confirmEmbed] });
  await confirmMsg.react("✅");
  await confirmMsg.react("❌");

  biddingState.pendingConfirmations[confirmMsg.id] = {
    userId: message.author.id,
    username,
    threadId: a.threadId,
    amount: bidAmount,
    timestamp: Date.now(),
    originalMessageId: message.id,
  };
  saveBiddingState();

  biddingState.timerHandles[`confirm_${confirmMsg.id}`] = setTimeout(
    async () => {
      if (biddingState.pendingConfirmations[confirmMsg.id]) {
        await confirmMsg.reactions.removeAll().catch(() => {});
        await confirmMsg.edit({
          embeds: [
            confirmEmbed.setColor(0x808080).setFooter({ text: "⏰ Timed out" }),
          ],
        });
        setTimeout(async () => await confirmMsg.delete().catch(() => {}), 3000);
        delete biddingState.pendingConfirmations[confirmMsg.id];
        saveBiddingState();
      }
    },
    30000
  );

  return { success: true, confirmationMessageId: confirmMsg.id };
}

// COMMAND HANDLERS
async function handleCommand(cmd, message, args, client, config) {
  switch (cmd) {
    case "!auction":
      if (args.length < 3)
        return await message.reply(
          "❌ Usage: `!auction <item> <price> <duration>`"
        );
      const dur = parseInt(args[args.length - 1]),
        price = parseInt(args[args.length - 2]),
        item = args.slice(0, -2).join(" ");
      if (isNaN(price) || price <= 0 || isNaN(dur) || dur <= 0 || !item.trim())
        return await message.reply("❌ Invalid parameters");
      if (
        biddingState.auctionQueue.find(
          (a) => a.item.toLowerCase() === item.toLowerCase()
        )
      )
        return await message.reply(`❌ **${item}** already in queue`);
      addToQueue(item, price, dur);
      await message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x00ff00)
            .setTitle("✅ Added to Queue")
            .setDescription(`**${item}**`)
            .addFields(
              { name: "💰 Price", value: `${price}pts`, inline: true },
              { name: "⏱️ Duration", value: formatDuration(dur), inline: true },
              {
                name: "📋 Position",
                value: `#${biddingState.auctionQueue.length}`,
                inline: true,
              }
            )
            .setFooter({ text: "Use !startauction to begin" })
            .setTimestamp(),
        ],
      });
      break;

    case "!queuelist":
      if (biddingState.auctionQueue.length === 0)
        return await message.reply("📋 Queue empty");
      await message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x4a90e2)
            .setTitle("📋 Auction Queue")
            .setDescription(
              biddingState.auctionQueue
                .map(
                  (a, i) =>
                    `**${i + 1}.** ${a.item} - ${
                      a.startPrice
                    }pts • ${formatDuration(a.duration)}`
                )
                .join("\n")
            )
            .addFields({
              name: "📊 Total",
              value: `${biddingState.auctionQueue.length}`,
              inline: true,
            })
            .setTimestamp(),
        ],
      });
      break;

    case "!removeitem":
      if (args.length === 0)
        return await message.reply("❌ Usage: `!removeitem <name>`");
      const removed = removeFromQueue(args.join(" "));
      if (!removed) return await message.reply("❌ Not found");
      await message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xff6600)
            .setTitle("🗑️ Removed")
            .setDescription(`**${removed.item}**`)
            .addFields({
              name: "📋 Remaining",
              value: `${biddingState.auctionQueue.length}`,
              inline: true,
            }),
        ],
      });
      break;

    case "!startauction":
      if (biddingState.auctionQueue.length === 0)
        return await message.reply("❌ Queue empty. Use !auction first");
      if (biddingState.activeAuction)
        return await message.reply("❌ Auction already in progress");
      const preview = biddingState.auctionQueue
        .slice(0, 10)
        .map((a, i) => `${i + 1}. **${a.item}** - ${a.startPrice}pts`)
        .join("\n");
      const confirmMsg = await message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xffd700)
            .setTitle("⚠️ Start Auction?")
            .setDescription(
              `**${biddingState.auctionQueue.length} item(s)**:\n\n${preview}${
                biddingState.auctionQueue.length > 10
                  ? `\n*...+${biddingState.auctionQueue.length - 10} more*`
                  : ""
              }`
            )
            .addFields({
              name: "🎯 Mode",
              value: biddingState.isDryRun ? "🧪 DRY RUN" : "💰 LIVE",
              inline: true,
            })
            .setFooter({
              text: "React ✅ start / ❌ cancel • Points cached for INSTANT bidding!",
            }),
        ],
      });
      await confirmMsg.react("✅");
      await confirmMsg.react("❌");
      try {
        const collected = await confirmMsg.awaitReactions({
          filter: (r, u) =>
            ["✅", "❌"].includes(r.emoji.name) && u.id === message.author.id,
          max: 1,
          time: 30000,
          errors: ["time"],
        });
        if (collected.first().emoji.name === "✅") {
          await confirmMsg.reactions.removeAll().catch(() => {});
          const loading = await message.channel.send(
            "⚡ Loading points cache..."
          );
          const result = await startAuctionSession(client, config);
          await loading.delete().catch(() => {});
          if (result.success) {
            await message.channel.send({
              embeds: [
                new EmbedBuilder()
                  .setColor(0x00ff00)
                  .setTitle("🚀 Started!")
                  .setDescription(
                    `**${result.totalItems} item(s)** • First: **${result.firstItem}**`
                  )
                  .addFields(
                    {
                      name: "⚡ Cached",
                      value: `${result.cachedMembers} members`,
                      inline: true,
                    },
                    {
                      name: "🎯 Mode",
                      value: biddingState.isDryRun ? "🧪 DRY RUN" : "💰 LIVE",
                      inline: true,
                    }
                  )
                  .setFooter({ text: "⚡ INSTANT bidding!" })
                  .setTimestamp(),
              ],
            });
          } else await message.channel.send(`❌ Failed: ${result.message}`);
        } else await confirmMsg.reactions.removeAll().catch(() => {});
      } catch (e) {
        await confirmMsg.reactions.removeAll().catch(() => {});
      }
      break;

    case "!bid":
      if (args.length === 0)
        return await message.reply("❌ Usage: `!bid <amount>`");
      const res = await processBid(message, args[0], config);
      if (!res.success) await message.reply(`❌ ${res.message}`);
      break;

    case "!dryrun":
      if (biddingState.activeAuction)
        return await message.reply("❌ Cannot toggle during auction");
      if (args.length === 0)
        return await message.reply(
          `Dry run: ${biddingState.isDryRun ? "🧪 ENABLED" : "⚪ DISABLED"}`
        );
      const mode = args[0].toLowerCase();
      if (["on", "true", "enable"].includes(mode)) {
        biddingState.isDryRun = true;
        await message.reply("🧪 DRY RUN ENABLED");
      } else if (["off", "false", "disable"].includes(mode)) {
        biddingState.isDryRun = false;
        await message.reply("💰 DRY RUN DISABLED");
      } else return await message.reply("❌ Use on/off");
      saveBiddingState();
      break;

    case "!bidstatus":
      const st = new EmbedBuilder().setColor(0x4a90e2).setTitle("📊 Status");
      if (biddingState.cachedPoints) {
        const age = Math.floor(
          (Date.now() - biddingState.cacheTimestamp) / 60000
        );
        st.addFields({
          name: "⚡ Cache",
          value: `✅ Loaded (${
            Object.keys(biddingState.cachedPoints).length
          } members)\n⏱️ Age: ${age}m`,
          inline: false,
        });
      } else
        st.addFields({
          name: "⚡ Cache",
          value: "⚪ Not loaded (loads on !startauction)",
          inline: false,
        });
      if (biddingState.auctionQueue.length > 0)
        st.addFields({
          name: "📋 Queue",
          value:
            biddingState.auctionQueue
              .slice(0, 5)
              .map((a, i) => `${i + 1}. ${a.item}`)
              .join("\n") +
            (biddingState.auctionQueue.length > 5
              ? `\n*...+${biddingState.auctionQueue.length - 5} more*`
              : ""),
        });
      if (biddingState.activeAuction)
        st.addFields(
          {
            name: "🔴 Active",
            value: biddingState.activeAuction.item,
            inline: true,
          },
          {
            name: "💰 Bid",
            value: `${biddingState.activeAuction.currentBid}pts`,
            inline: true,
          }
        );
      st.setFooter({
        text: biddingState.isDryRun ? "🧪 DRY RUN" : "Use !auction to add",
      }).setTimestamp();
      await message.reply({ embeds: [st] });
      break;

    case "!clearqueue":
      if (biddingState.auctionQueue.length === 0)
        return await message.reply("📋 Already empty");
      if (biddingState.activeAuction)
        return await message.reply("❌ Cannot clear during auction");
      const cnt = clearQueue();
      await message.reply(`✅ Cleared ${cnt} item(s)`);
      break;

    case "!resetbids":
      const resetMsg = await message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xff0000)
            .setTitle("⚠️ RESET ALL?")
            .setDescription(
              "Clears:\n• Queue\n• Active auction\n• Locked points\n• History\n• **Points cache**"
            )
            .setFooter({ text: "React ✅ confirm / ❌ cancel" }),
        ],
      });
      await resetMsg.react("✅");
      await resetMsg.react("❌");
      try {
        const col = await resetMsg.awaitReactions({
          filter: (r, u) =>
            ["✅", "❌"].includes(r.emoji.name) && u.id === message.author.id,
          max: 1,
          time: 30000,
          errors: ["time"],
        });
        if (col.first().emoji.name === "✅") {
          Object.values(biddingState.timerHandles).forEach((h) =>
            clearTimeout(h)
          );
          biddingState = {
            auctionQueue: [],
            activeAuction: null,
            lockedPoints: {},
            auctionHistory: [],
            isDryRun: biddingState.isDryRun,
            timerHandles: {},
            pendingConfirmations: {},
            sessionDate: null,
            cachedPoints: null,
            cacheTimestamp: null,
          };
          saveBiddingState();
          await message.reply("✅ All data reset (including cache)");
        }
      } catch (e) {}
      break;

    case "!forcesubmitresults":
      if (!biddingState.sessionDate || biddingState.auctionHistory.length === 0)
        return await message.reply("❌ No auction history");
      const fsMsg = await message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xff6600)
            .setTitle("⚠️ Force Submit?")
            .setDescription(
              `**Timestamp:** ${biddingState.sessionDate}\n**Items:** ${biddingState.auctionHistory.length}`
            )
            .addFields({
              name: "📋 Results",
              value: biddingState.auctionHistory
                .map((a) => `• **${a.item}**: ${a.winner} - ${a.amount}pts`)
                .join("\n"),
              inline: false,
            })
            .setFooter({ text: "React ✅ submit / ❌ cancel" }),
        ],
      });
      await fsMsg.react("✅");
      await fsMsg.react("❌");
      try {
        const fsCol = await fsMsg.awaitReactions({
          filter: (r, u) =>
            ["✅", "❌"].includes(r.emoji.name) && u.id === message.author.id,
          max: 1,
          time: 30000,
          errors: ["time"],
        });
        if (fsCol.first().emoji.name === "✅") {
          if (!biddingState.sessionDate)
            biddingState.sessionDate = getCurrentTimestamp();
          const totals = {};
          biddingState.auctionHistory.forEach(
            (a) => (totals[a.winner] = (totals[a.winner] || 0) + a.amount)
          );
          const results = Object.entries(totals).map(([m, t]) => ({
            member: m,
            totalSpent: t,
          }));
          const sub = await submitAuctionResults(
            config.sheet_webhook_url,
            results,
            biddingState.sessionDate,
            biddingState.isDryRun
          );
          if (sub.success) {
            const winners = biddingState.auctionHistory
              .map((a) => `• **${a.item}**: ${a.winner} - ${a.amount}pts`)
              .join("\n");
            await message.channel.send({
              embeds: [
                new EmbedBuilder()
                  .setColor(0x00ff00)
                  .setTitle("✅ Force Submit Success!")
                  .setDescription("Results submitted")
                  .addFields(
                    {
                      name: "🕐 Timestamp",
                      value: biddingState.sessionDate,
                      inline: true,
                    },
                    {
                      name: "🏆 Items",
                      value: `${biddingState.auctionHistory.length}`,
                      inline: true,
                    },
                    {
                      name: "💰 Total",
                      value: `${results.reduce((s, r) => s + r.totalSpent, 0)}`,
                      inline: true,
                    },
                    { name: "📋 Winners", value: winners }
                  )
                  .setFooter({
                    text: biddingState.isDryRun
                      ? "🧪 DRY RUN"
                      : "Points deducted • Cache cleared",
                  })
                  .setTimestamp(),
              ],
            });
            biddingState.auctionHistory = [];
            biddingState.sessionDate = null;
            biddingState.lockedPoints = {};
            clearPointsCache();
            saveBiddingState();
          } else {
            await message.channel.send({
              embeds: [
                new EmbedBuilder()
                  .setColor(0xff0000)
                  .setTitle("❌ Submit Failed")
                  .setDescription(`**Error:** ${sub.error}`)
                  .addFields({
                    name: "📝 Data",
                    value: `\`\`\`\n${results
                      .map((r) => `${r.member}: ${r.totalSpent}pts`)
                      .join("\n")}\n\`\`\``,
                  }),
              ],
            });
          }
        }
      } catch (e) {}
      break;
  }
}

// MODULE EXPORTS
module.exports = {
  loadBiddingState,
  saveBiddingState,
  getBiddingState: () => biddingState,
  hasElysiumRole,
  isAdmin,
  getCachedPoints,
  loadPointsCache,
  clearPointsCache,
  handleCommand,

  confirmBid: async function (reaction, user, config) {
    const p = biddingState.pendingConfirmations[reaction.message.id];
    if (!p) return;

    const guild = reaction.message.guild,
      member = await guild.members.fetch(user.id).catch(() => null);
    if (!member) return;

    const isOwner = p.userId === user.id,
      isAdm = isAdmin(member, config);
    if (!isOwner && !isAdm) {
      await reaction.users.remove(user.id).catch(() => {});
      return;
    }

    const a = biddingState.activeAuction;
    if (!a || a.status !== "active") {
      await reaction.message.channel.send(
        `❌ <@${user.id}> Auction no longer active`
      );
      await reaction.message.reactions.removeAll().catch(() => {});
      await reaction.message.delete().catch(() => {});
      delete biddingState.pendingConfirmations[reaction.message.id];
      saveBiddingState();
      return;
    }

    if (p.amount <= a.currentBid) {
      await reaction.message.channel.send(
        `❌ <@${user.id}> Bid no longer valid. Current: ${a.currentBid}pts`
      );
      await reaction.message.reactions.removeAll().catch(() => {});
      await reaction.message.delete().catch(() => {});
      delete biddingState.pendingConfirmations[reaction.message.id];
      saveBiddingState();
      return;
    }

    if (a.currentWinner) {
      unlockPoints(a.currentWinner, a.currentBid);
      await reaction.message.channel.send({
        content: `<@${a.currentWinnerId}>`,
        embeds: [
          new EmbedBuilder()
            .setColor(0xff6600)
            .setTitle("❌ Outbid!")
            .setDescription(`Someone bid **${p.amount}pts** on **${a.item}**`),
        ],
      });
    }

    lockPoints(p.username, p.amount);
    const prevBid = a.currentBid;
    a.currentBid = p.amount;
    a.currentWinner = p.username;
    a.currentWinnerId = p.userId;
    a.bids.push({
      user: p.username,
      userId: p.userId,
      amount: p.amount,
      timestamp: Date.now(),
    });

    const timeLeft = a.endTime - Date.now();
    if (timeLeft < 60000 && a.extendedCount < 10) {
      a.endTime += 60000;
      a.extendedCount++;
      a.goingOnceAnnounced = false;
      a.goingTwiceAnnounced = false;
    }

    if (biddingState.timerHandles[`confirm_${reaction.message.id}`]) {
      clearTimeout(biddingState.timerHandles[`confirm_${reaction.message.id}`]);
      delete biddingState.timerHandles[`confirm_${reaction.message.id}`];
    }

    await reaction.message.edit({
      embeds: [
        new EmbedBuilder()
          .setColor(0x00ff00)
          .setTitle("✅ Bid Confirmed!")
          .setDescription(`Highest bidder on **${a.item}**`)
          .addFields(
            { name: "💰 Your Bid", value: `${p.amount}pts`, inline: true },
            { name: "📊 Previous", value: `${prevBid}pts`, inline: true },
            {
              name: "⏱️ Time Left",
              value: formatTimeRemaining(a.endTime - Date.now()),
              inline: true,
            }
          )
          .setFooter({
            text: timeLeft < 60000 ? "⏰ Timer extended!" : "Good luck!",
          }),
      ],
    });
    await reaction.message.reactions.removeAll().catch(() => {});

    await reaction.message.channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0xffd700)
          .setTitle("🔔 New High Bid!")
          .addFields(
            { name: "💰 Amount", value: `${p.amount}pts`, inline: true },
            { name: "👤 Bidder", value: p.username, inline: true }
          ),
      ],
    });

    setTimeout(
      async () => await reaction.message.delete().catch(() => {}),
      5000
    );
    if (p.originalMessageId) {
      const orig = await reaction.message.channel.messages
        .fetch(p.originalMessageId)
        .catch(() => null);
      if (orig) await orig.delete().catch(() => {});
    }

    delete biddingState.pendingConfirmations[reaction.message.id];
    saveBiddingState();

    if (timeLeft < 60000) scheduleAuctionTimers(reaction.client, config);
    console.log(
      `✅ Bid confirmed: ${p.username} - ${p.amount}pts (⚡ instant validation!)`
    );
  },

  cancelBid: async function (reaction, user, config) {
    const p = biddingState.pendingConfirmations[reaction.message.id];
    if (!p) return;

    const guild = reaction.message.guild,
      member = await guild.members.fetch(user.id).catch(() => null);
    if (!member) return;

    const isOwner = p.userId === user.id,
      isAdm = isAdmin(member, config);
    if (!isOwner && !isAdm) {
      await reaction.users.remove(user.id).catch(() => {});
      return;
    }

    await reaction.message.edit({
      embeds: [
        new EmbedBuilder()
          .setColor(0x808080)
          .setTitle("❌ Bid Canceled")
          .setDescription("Bid not placed"),
      ],
    });
    await reaction.message.reactions.removeAll().catch(() => {});
    setTimeout(
      async () => await reaction.message.delete().catch(() => {}),
      3000
    );

    if (p.originalMessageId) {
      const orig = await reaction.message.channel.messages
        .fetch(p.originalMessageId)
        .catch(() => null);
      if (orig) await orig.delete().catch(() => {});
    }

    if (biddingState.timerHandles[`confirm_${reaction.message.id}`]) {
      clearTimeout(biddingState.timerHandles[`confirm_${reaction.message.id}`]);
      delete biddingState.timerHandles[`confirm_${reaction.message.id}`];
    }

    delete biddingState.pendingConfirmations[reaction.message.id];
    saveBiddingState();
  },

  recoverBiddingState: async (client, config) => {
    if (loadBiddingState()) {
      console.log("📦 State recovered");
      if (biddingState.cachedPoints) {
        const age = Math.floor(
          (Date.now() - biddingState.cacheTimestamp) / 60000
        );
        console.log(
          `⚡ Cache recovered: ${
            Object.keys(biddingState.cachedPoints).length
          } members (${age}m old)`
        );
        if (age > 60) {
          console.log("⚠️ Cache too old, clearing...");
          clearPointsCache();
        }
      } else console.log("⚪ No cache (loads on !startauction)");

      if (
        biddingState.activeAuction &&
        biddingState.activeAuction.status === "active"
      ) {
        console.log("🔄 Rescheduling timers...");
        scheduleAuctionTimers(client, config);
        if (!biddingState.cachedPoints)
          console.warn(
            "⚠️ WARNING: Active auction but no cache! Bidding will fail."
          );
      }
      return true;
    }
    return false;
  },
};
