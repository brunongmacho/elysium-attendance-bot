/**
 * ELYSIUM Guild Bidding System - Version 4.1 (CONSOLIDATED & OPTIMIZED)
 * FEATURES:
 * - Multiple auctions per day with timestamped results (MM/DD/YYYY HH:MM)
 * - Automatic results submission after each auction session
 * - Points locking/unlocking system
 * - Dry run mode for testing
 * - Complete state persistence
 * - Bid confirmation with 30s timeout
 * - Auto-extend timer when bids come in final minute
 * - Admin commands for manual intervention
 * - Force submit for manual tally submission
 */

const { EmbedBuilder } = require("discord.js");
const fetch = require("node-fetch");
const fs = require("fs");

// ==========================================
// STATE MANAGEMENT
// ==========================================

let biddingState = {
  auctionQueue: [],
  activeAuction: null,
  lockedPoints: {},
  auctionHistory: [],
  isDryRun: false,
  timerHandles: {},
  pendingConfirmations: {},
  sessionDate: null,
};

const STATE_FILE = "./bidding-state.json";

function saveBiddingState() {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify({
      auctionQueue: biddingState.auctionQueue,
      activeAuction: biddingState.activeAuction,
      lockedPoints: biddingState.lockedPoints,
      auctionHistory: biddingState.auctionHistory,
      isDryRun: biddingState.isDryRun,
      pendingConfirmations: biddingState.pendingConfirmations,
      sessionDate: biddingState.sessionDate,
    }, null, 2));
  } catch (err) {
    console.error("❌ Failed to save bidding state:", err);
  }
}

function loadBiddingState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      biddingState = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
      return true;
    }
  } catch (err) {
    console.error("❌ Failed to load bidding state:", err);
  }
  return false;
}

// ==========================================
// UTILITY FUNCTIONS
// ==========================================

function getCurrentTimestamp() {
  const d = new Date();
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function formatDuration(mins) {
  if (mins < 60) return `${mins}min`;
  const h = Math.floor(mins / 60);
  return mins % 60 > 0 ? `${h}h ${mins % 60}min` : `${h}h`;
}

function formatTimeRemaining(ms) {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const secs = s % 60;
  if (m < 60) return secs > 0 ? `${m}m ${secs}s` : `${m}m`;
  const h = Math.floor(m / 60);
  return (m % 60) > 0 ? `${h}h ${m % 60}m` : `${h}h`;
}

function getAvailablePoints(member, total) {
  return Math.max(0, total - (biddingState.lockedPoints[member] || 0));
}

function lockPoints(member, amount) {
  biddingState.lockedPoints[member] = (biddingState.lockedPoints[member] || 0) + amount;
  saveBiddingState();
}

function unlockPoints(member, amount) {
  biddingState.lockedPoints[member] = Math.max(0, (biddingState.lockedPoints[member] || 0) - amount);
  if (biddingState.lockedPoints[member] === 0) delete biddingState.lockedPoints[member];
  saveBiddingState();
}

// ==========================================
// GOOGLE SHEETS INTEGRATION
// ==========================================

async function fetchBiddingPoints(webhookUrl, isDryRun = false) {
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "getBiddingPoints", dryRun: isDryRun }),
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    return data.points || {};
  } catch (err) {
    console.error("❌ Failed to fetch bidding points:", err);
    return null;
  }
}

async function submitAuctionResults(webhookUrl, results, timestamp, isDryRun = false) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      console.log(`📊 Submitting results (attempt ${attempt}/3)...`);

      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "submitBiddingResults",
          results,
          timestamp,
          dryRun: isDryRun,
        }),
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();

      if (data.status === "ok") {
        console.log("✅ Auction results submitted successfully");
        return { success: true, data };
      } else {
        throw new Error(data.message || "Unknown error");
      }
    } catch (err) {
      console.error(`❌ Attempt ${attempt} failed: ${err.message}`);
      if (attempt < 3) {
        const delay = attempt * 2000;
        console.log(`⏳ Retrying in ${delay / 1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        return { success: false, error: err.message, results };
      }
    }
  }
}

// ==========================================
// AUCTION QUEUE MANAGEMENT
// ==========================================

function addToQueue(item, startPrice, duration) {
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
}

function removeFromQueue(itemName) {
  const index = biddingState.auctionQueue.findIndex(a => a.item.toLowerCase() === itemName.toLowerCase());
  if (index === -1) return null;
  const removed = biddingState.auctionQueue.splice(index, 1)[0];
  saveBiddingState();
  return removed;
}

function clearQueue() {
  const count = biddingState.auctionQueue.length;
  biddingState.auctionQueue = [];
  saveBiddingState();
  return count;
}

// ==========================================
// AUCTION LIFECYCLE
// ==========================================

async function startAuctionSession(client, config) {
  if (biddingState.auctionQueue.length === 0) return { success: false, message: "No items in queue" };
  if (biddingState.activeAuction) return { success: false, message: "An auction is already in progress" };

  biddingState.sessionDate = getCurrentTimestamp();
  const firstAuction = biddingState.auctionQueue[0];
  await startNextAuction(client, config);
  saveBiddingState();

  return { success: true, totalItems: biddingState.auctionQueue.length, firstItem: firstAuction.item };
}

async function startNextAuction(client, config) {
  if (biddingState.auctionQueue.length === 0) {
    await finalizeAuctionSession(client, config);
    return;
  }

  const auctionData = biddingState.auctionQueue[0];
  const guild = await client.guilds.fetch(config.main_guild_id);
  const biddingChannel = await guild.channels.fetch(config.bidding_channel_id);

  const threadTitle = `${auctionData.item} - ${getCurrentTimestamp()} | ${auctionData.startPrice}pts | ${formatDuration(auctionData.duration)}`;

  const thread = await biddingChannel.threads.create({
    name: threadTitle,
    autoArchiveDuration: 60,
    reason: `Auction: ${auctionData.item}`,
  });

  biddingState.activeAuction = {
    ...auctionData,
    threadId: thread.id,
    currentBid: auctionData.startPrice,
    currentWinner: null,
    currentWinnerId: null,
    bids: [],
    endTime: null,
    extendedCount: 0,
    status: "preview",
    goingOnceAnnounced: false,
    goingTwiceAnnounced: false,
  };

  const previewEmbed = new EmbedBuilder()
    .setColor(0xffd700)
    .setTitle(`🏆 AUCTION STARTING`)
    .setDescription(`**${auctionData.item}**`)
    .addFields(
      { name: "💰 Starting Bid", value: `${auctionData.startPrice} points`, inline: true },
      { name: "⏱️ Duration", value: formatDuration(auctionData.duration), inline: true },
      { name: "📋 Items Remaining", value: `${biddingState.auctionQueue.length - 1} after this`, inline: true }
    )
    .setFooter({ text: biddingState.isDryRun ? "🧪 DRY RUN - TEST MODE" : "Bidding starts in 20 seconds" })
    .setTimestamp();

  await thread.send({ content: "@everyone", embeds: [previewEmbed] });

  biddingState.timerHandles.auctionStart = setTimeout(async () => {
    await activateAuction(client, config, thread);
  }, 20000);

  saveBiddingState();
}

async function activateAuction(client, config, thread) {
  biddingState.activeAuction.status = "active";
  biddingState.activeAuction.endTime = Date.now() + biddingState.activeAuction.duration * 60000;

  const startEmbed = new EmbedBuilder()
    .setColor(0x00ff00)
    .setTitle("🔔 BIDDING STARTS NOW!")
    .setDescription(`Type \`!bid <amount>\` to place your bid`)
    .addFields(
      { name: "💰 Current Bid", value: `${biddingState.activeAuction.currentBid} points`, inline: true },
      { name: "⏱️ Time Left", value: formatDuration(biddingState.activeAuction.duration), inline: true }
    )
    .setFooter({ text: "Bids must be higher than current bid" });

  await thread.send({ embeds: [startEmbed] });
  scheduleAuctionTimers(client, config);
  saveBiddingState();
}

function scheduleAuctionTimers(client, config) {
  const auction = biddingState.activeAuction;
  const timeLeft = auction.endTime - Date.now();

  Object.keys(biddingState.timerHandles).forEach(key => {
    if (['goingOnce', 'goingTwice', 'finalCall', 'auctionEnd'].includes(key)) {
      clearTimeout(biddingState.timerHandles[key]);
    }
  });

  if (timeLeft > 60000 && !auction.goingOnceAnnounced) {
    biddingState.timerHandles.goingOnce = setTimeout(async () => {
      await announceGoingOnce(client, config);
    }, timeLeft - 60000);
  }

  if (timeLeft > 30000 && !auction.goingTwiceAnnounced) {
    biddingState.timerHandles.goingTwice = setTimeout(async () => {
      await announceGoingTwice(client, config);
    }, timeLeft - 30000);
  }

  if (timeLeft > 10000) {
    biddingState.timerHandles.finalCall = setTimeout(async () => {
      await announceFinalCall(client, config);
    }, timeLeft - 10000);
  }

  biddingState.timerHandles.auctionEnd = setTimeout(async () => {
    await endAuction(client, config);
  }, timeLeft);
}

async function announceGoingOnce(client, config) {
  const auction = biddingState.activeAuction;
  if (!auction || auction.status !== "active") return;

  const guild = await client.guilds.fetch(config.main_guild_id);
  const thread = await guild.channels.fetch(auction.threadId);

  const embed = new EmbedBuilder()
    .setColor(0xffa500)
    .setTitle("⚠️ GOING ONCE!")
    .setDescription("1 minute remaining")
    .addFields({
      name: "💰 Current Bid",
      value: auction.currentWinner ? `${auction.currentBid} points by ${auction.currentWinner}` : `${auction.startPrice} points (no bids)`,
      inline: false,
    });

  await thread.send({ content: "@everyone", embeds: [embed] });
  auction.goingOnceAnnounced = true;
  saveBiddingState();
}

async function announceGoingTwice(client, config) {
  const auction = biddingState.activeAuction;
  if (!auction || auction.status !== "active") return;

  const guild = await client.guilds.fetch(config.main_guild_id);
  const thread = await guild.channels.fetch(auction.threadId);

  const embed = new EmbedBuilder()
    .setColor(0xff6600)
    .setTitle("⚠️ GOING TWICE!")
    .setDescription("30 seconds remaining")
    .addFields({
      name: "💰 Current Bid",
      value: auction.currentWinner ? `${auction.currentBid} points by ${auction.currentWinner}` : `${auction.startPrice} points (no bids)`,
      inline: false,
    });

  await thread.send({ content: "@everyone", embeds: [embed] });
  auction.goingTwiceAnnounced = true;
  saveBiddingState();
}

async function announceFinalCall(client, config) {
  const auction = biddingState.activeAuction;
  if (!auction || auction.status !== "active") return;

  const guild = await client.guilds.fetch(config.main_guild_id);
  const thread = await guild.channels.fetch(auction.threadId);

  const embed = new EmbedBuilder()
    .setColor(0xff0000)
    .setTitle("⚠️ FINAL CALL!")
    .setDescription("10 seconds remaining")
    .addFields({
      name: "💰 Current Bid",
      value: auction.currentWinner ? `${auction.currentBid} points by ${auction.currentWinner}` : `${auction.startPrice} points (no bids)`,
      inline: false,
    });

  await thread.send({ content: "@everyone", embeds: [embed] });
  saveBiddingState();
}

async function endAuction(client, config) {
  const auction = biddingState.activeAuction;
  if (!auction) return;

  auction.status = "ended";

  const guild = await client.guilds.fetch(config.main_guild_id);
  const thread = await guild.channels.fetch(auction.threadId);

  if (auction.currentWinner) {
    const winnerEmbed = new EmbedBuilder()
      .setColor(0xffd700)
      .setTitle("🔨 SOLD!")
      .setDescription(`**${auction.item}** has been sold!`)
      .addFields(
        { name: "🏆 Winner", value: `<@${auction.currentWinnerId}>`, inline: true },
        { name: "💰 Winning Bid", value: `${auction.currentBid} points`, inline: true }
      )
      .setFooter({ text: biddingState.isDryRun ? "🧪 DRY RUN - No points deducted" : "Points will be deducted after all auctions" })
      .setTimestamp();

    await thread.send({ embeds: [winnerEmbed] });

    biddingState.auctionHistory.push({
      item: auction.item,
      winner: auction.currentWinner,
      winnerId: auction.currentWinnerId,
      amount: auction.currentBid,
      timestamp: Date.now(),
    });
  } else {
    const noBidsEmbed = new EmbedBuilder()
      .setColor(0x808080)
      .setTitle("❌ NO BIDS")
      .setDescription(`**${auction.item}** received no bids and will not be sold.`)
      .setFooter({ text: "Moving to next item..." });

    await thread.send({ embeds: [noBidsEmbed] });
  }

  await thread.setArchived(true, "Auction ended").catch(() => {});
  biddingState.auctionQueue.shift();
  biddingState.activeAuction = null;
  saveBiddingState();

  if (biddingState.auctionQueue.length > 0) {
    await thread.parent.send(
      `⏳ Next auction starting in 20 seconds...\n` +
      `📦 **${biddingState.auctionQueue[0].item}** - Starting bid: ${biddingState.auctionQueue[0].startPrice} points`
    );

    biddingState.timerHandles.nextAuction = setTimeout(async () => {
      await startNextAuction(client, config);
    }, 20000);
  }
}

async function finalizeAuctionSession(client, config) {
  console.log("🎉 All auctions complete - finalizing session...");

  const guild = await client.guilds.fetch(config.main_guild_id);
  const adminLogs = await guild.channels.fetch(config.admin_logs_channel_id);
  const biddingChannel = await guild.channels.fetch(config.bidding_channel_id);

  if (biddingState.auctionHistory.length === 0) {
    await biddingChannel.send("🎊 **Auction session complete!** No items were sold.");
    biddingState.sessionDate = null;
    biddingState.lockedPoints = {};
    saveBiddingState();
    return;
  }

  const memberTotals = {};
  biddingState.auctionHistory.forEach(auction => {
    memberTotals[auction.winner] = (memberTotals[auction.winner] || 0) + auction.amount;
  });

  const results = Object.entries(memberTotals).map(([member, total]) => ({ member, totalSpent: total }));
  const submission = await submitAuctionResults(config.sheet_webhook_url, results, biddingState.sessionDate, biddingState.isDryRun);

  if (submission.success) {
    const successEmbed = new EmbedBuilder()
      .setColor(0x00ff00)
      .setTitle("✅ Auction Session Complete!")
      .setDescription(`Results submitted to Google Sheets`)
      .addFields(
        { name: "🕐 Timestamp", value: biddingState.sessionDate, inline: true },
        { name: "🏆 Items Sold", value: `${biddingState.auctionHistory.length}`, inline: true },
        { name: "💰 Total Points Spent", value: `${results.reduce((sum, r) => sum + r.totalSpent, 0)}`, inline: true }
      )
      .setFooter({ text: biddingState.isDryRun ? "🧪 DRY RUN - Test mode" : "Points have been deducted" })
      .setTimestamp();

    const winnerList = biddingState.auctionHistory.map(a => `• **${a.item}**: ${a.winner} - ${a.amount} points`).join("\n");
    successEmbed.addFields({ name: "📋 Winners", value: winnerList || "None" });

    await biddingChannel.send({ embeds: [successEmbed] });
    await adminLogs.send({ embeds: [successEmbed] });
  } else {
    const failureEmbed = new EmbedBuilder()
      .setColor(0xff0000)
      .setTitle("❌ Sheet Submission Failed")
      .setDescription(`Failed to submit results after 3 attempts.\n\n**Error:** ${submission.error}`)
      .addFields(
        { name: "🕐 Timestamp", value: biddingState.sessionDate, inline: true },
        { name: "🏆 Items Sold", value: `${biddingState.auctionHistory.length}`, inline: true }
      )
      .setFooter({ text: "Please manually enter the following data" })
      .setTimestamp();

    const manualData = results.map(r => `${r.member}: ${r.totalSpent} points`).join("\n");
    failureEmbed.addFields({ name: "📝 Manual Entry Required", value: `\`\`\`\n${manualData}\n\`\`\`` });

    await adminLogs.send({ embeds: [failureEmbed] });
    await biddingChannel.send("❌ Sheet submission failed. Admins have been notified.");
  }

  biddingState.auctionHistory = [];
  biddingState.sessionDate = null;
  biddingState.lockedPoints = {};
  saveBiddingState();
}

// ==========================================
// BIDDING LOGIC
// ==========================================

async function processBid(message, amount, config) {
  const auction = biddingState.activeAuction;

  console.log(`\n${"=".repeat(50)}`);
  console.log(`🎯 PROCESSING BID`);
  console.log(`${"=".repeat(50)}`);

  if (!auction) return { success: false, message: "No active auction" };
  if (auction.status !== "active") return { success: false, message: "Auction not started yet. Wait for bidding to open." };
  if (message.channel.id !== auction.threadId) return { success: false, message: "Wrong thread. Bid in the active auction thread." };

  const bidAmount = parseInt(amount);
  if (isNaN(bidAmount) || bidAmount <= 0) return { success: false, message: "Invalid bid amount" };

  console.log(`📦 Auction: ${auction.item}, 💰 Current: ${auction.currentBid}, 💵 Bid: ${bidAmount}`);

  if (bidAmount <= auction.currentBid) return { success: false, message: `Bid must be higher than current bid (${auction.currentBid} points)` };

  const member = message.member;
  const username = member.nickname || message.author.username;

  console.log(`👤 ${username} (${message.author.id})`);

  let allPoints = await fetchBiddingPoints(config.sheet_webhook_url, biddingState.isDryRun);

  if (!allPoints) {
    return { success: false, message: `❌ Failed to fetch bidding points from Google Sheets.\n\n**Troubleshooting:**\n• Check webhook URL in config.json\n• Verify Apps Script is deployed\n• Check BiddingPoints sheet exists` };
  }

  let totalPoints = allPoints[username];
  if (totalPoints === undefined) {
    const matchedName = Object.keys(allPoints).find(name => name.toLowerCase() === username.toLowerCase());
    totalPoints = matchedName ? allPoints[matchedName] : 0;
  }

  totalPoints = totalPoints || 0;
  const availablePoints = getAvailablePoints(username, totalPoints);

  console.log(`💳 Total: ${totalPoints}, Locked: ${biddingState.lockedPoints[username] || 0}, Available: ${availablePoints}`);

  if (totalPoints === 0) return { success: false, message: `❌ You have no bidding points available.` };
  if (bidAmount > availablePoints) {
    return { success: false, message: `❌ Insufficient points!\n\n💰 Total: ${totalPoints}\n💳 Locked: ${biddingState.lockedPoints[username] || 0}\n📊 Available: ${availablePoints}\n\nYou need **${bidAmount}** but only have **${availablePoints}** available.` };
  }

  console.log(`✅ BID VALID - SHOWING CONFIRMATION`);

  const confirmEmbed = new EmbedBuilder()
    .setColor(0xffd700)
    .setTitle("⏳ Confirm Your Bid")
    .setDescription(`**${auction.item}**`)
    .addFields(
      { name: "💰 Your Bid", value: `${bidAmount} points`, inline: true },
      { name: "📊 Current Bid", value: `${auction.currentBid} points`, inline: true },
      { name: "💳 Available After", value: `${availablePoints - bidAmount} points`, inline: true }
    )
    .setFooter({ text: "React ✅ to confirm or ❌ to cancel • 30 second timeout" });

  const confirmMsg = await message.reply({ embeds: [confirmEmbed] });

  await confirmMsg.react("✅");
  await confirmMsg.react("❌");

  biddingState.pendingConfirmations[confirmMsg.id] = {
    userId: message.author.id,
    username,
    threadId: auction.threadId,
    amount: bidAmount,
    timestamp: Date.now(),
  };

  saveBiddingState();

  console.log(`✅ Confirmation message created: ${confirmMsg.id}\n${"=".repeat(50)}\n`);

  biddingState.timerHandles[`confirm_${confirmMsg.id}`] = setTimeout(async () => {
    if (biddingState.pendingConfirmations[confirmMsg.id]) {
      console.log(`⏱️ Confirmation timeout for ${username}'s bid of ${bidAmount}`);
      await confirmMsg.reactions.removeAll().catch(() => {});
      await confirmMsg.edit({ embeds: [confirmEmbed.setColor(0x808080).setFooter({ text: "⏱️ Confirmation timed out" })] });
      delete biddingState.pendingConfirmations[confirmMsg.id];
      saveBiddingState();
    }
  }, 30000);

  return { success: true, confirmationMessageId: confirmMsg.id };
}

// ==========================================
// COMMAND HANDLERS (CONSOLIDATED)
// ==========================================

async function handleCommand(cmd, message, args, client, config) {
  switch(cmd) {
    case "!auction":
      if (args.length < 3) return await message.reply("❌ **Usage:** `!auction <item> <price> <duration>`");
      const duration = parseInt(args[args.length - 1]);
      const startPrice = parseInt(args[args.length - 2]);
      const itemName = args.slice(0, -2).join(" ");
      if (isNaN(startPrice) || startPrice <= 0 || isNaN(duration) || duration <= 0 || !itemName.trim()) {
        return await message.reply("❌ Invalid parameters. Price and duration must be positive numbers.");
      }
      if (biddingState.auctionQueue.find(a => a.item.toLowerCase() === itemName.toLowerCase())) {
        return await message.reply(`❌ **${itemName}** is already in the queue`);
      }
      const auction = addToQueue(itemName, startPrice, duration);
      const embed = new EmbedBuilder().setColor(0x00ff00).setTitle("✅ Item Added to Queue").setDescription(`**${itemName}**`)
        .addFields(
          { name: "💰 Starting Price", value: `${startPrice} points`, inline: true },
          { name: "⏱️ Duration", value: formatDuration(duration), inline: true },
          { name: "📋 Position", value: `#${biddingState.auctionQueue.length}`, inline: true }
        ).setFooter({ text: "Use !queuelist to see all items • Use !startauction to begin" }).setTimestamp();
      await message.reply({ embeds: [embed] });
      console.log(`📦 Added: ${itemName} (${startPrice}pts, ${duration}min)`);
      break;

    case "!queuelist":
      if (biddingState.auctionQueue.length === 0) return await message.reply("📋 Queue is empty.");
      const queueList = biddingState.auctionQueue.map((a, i) => `**${i + 1}.** ${a.item} - ${a.startPrice}pts • ${formatDuration(a.duration)}`).join("\n");
      const qEmbed = new EmbedBuilder().setColor(0x4a90e2).setTitle("📋 Auction Queue").setDescription(queueList)
        .addFields({ name: "📊 Total", value: `${biddingState.auctionQueue.length}`, inline: true })
        .setFooter({ text: "Use !removeitem <name> to remove • !startauction to begin" }).setTimestamp();
      await message.reply({ embeds: [qEmbed] });
      break;

    case "!removeitem":
      if (args.length === 0) return await message.reply("❌ **Usage:** `!removeitem <item name>`");
      const removed = removeFromQueue(args.join(" "));
      if (!removed) return await message.reply(`❌ Item not found`);
      const rEmbed = new EmbedBuilder().setColor(0xff6600).setTitle("🗑️ Item Removed").setDescription(`**${removed.item}**`)
        .addFields({ name: "📋 Remaining", value: `${biddingState.auctionQueue.length}`, inline: true }).setTimestamp();
      await message.reply({ embeds: [rEmbed] });
      console.log(`🗑️ Removed: ${removed.item}`);
      break;

    case "!startauction":
      if (biddingState.auctionQueue.length === 0) return await message.reply("❌ Queue is empty. Add items using `!auction` first.");
      if (biddingState.activeAuction) return await message.reply("❌ An auction is already in progress.");
      const qPreview = biddingState.auctionQueue.slice(0, 10).map((a, i) => `${i + 1}. **${a.item}** - ${a.startPrice}pts`).join("\n");
      const sEmbed = new EmbedBuilder().setColor(0xffd700).setTitle("⚠️ Start Auction Session?")
        .setDescription(`**${biddingState.auctionQueue.length} item(s)** will be auctioned:\n\n${qPreview}${biddingState.auctionQueue.length > 10 ? `\n\n*...and ${biddingState.auctionQueue.length - 10} more items*` : ""}`)
        .addFields({ name: "🎯 Mode", value: biddingState.isDryRun ? "🧪 **DRY RUN**" : "💰 **LIVE**", inline: true })
        .setFooter({ text: "React ✅ to start or ❌ to cancel" });
      const confirmMsg = await message.reply({ embeds: [sEmbed] });
      await confirmMsg.react("✅");
      await confirmMsg.react("❌");
      const filter = (reaction, user) => ["✅", "❌"].includes(reaction.emoji.name) && user.id === message.author.id;
      try {
        const collected = await confirmMsg.awaitReactions({ filter, max: 1, time: 30000, errors: ["time"] });
        const reaction = collected.first();
        if (reaction.emoji.name === "✅") {
          await confirmMsg.reactions.removeAll().catch(() => {});
          const result = await startAuctionSession(client, config);
          if (result.success) {
            const startEmbed = new EmbedBuilder().setColor(0x00ff00).setTitle("🚀 Auction Session Started!")
              .setDescription(`**${result.totalItems} item(s)** will be auctioned.\n\nFirst item: **${result.firstItem}**`)
              .setFooter({ text: "Check the auction threads to bid!" }).setTimestamp();
            await message.channel.send({ embeds: [startEmbed] });
          }
        } else {
          await confirmMsg.reactions.removeAll().catch(() => {});
        }
      } catch (err) {
        await confirmMsg.reactions.removeAll().catch(() => {});
      }
      break;

    case "!bid":
      if (args.length === 0) return await message.reply("❌ **Usage:** `!bid <amount>`");
      const result = await processBid(message, args[0], config);
      if (!result.success) await message.reply(`❌ ${result.message}`);
      break;

    case "!dryrun":
      if (biddingState.activeAuction) return await message.reply("❌ Cannot toggle while auction is active");
      if (args.length === 0) return await message.reply(`Dry run: ${biddingState.isDryRun ? "🧪 **ENABLED**" : "⚪ **DISABLED**"}`);
      const mode = args[0].toLowerCase();
      if (["on", "true", "enable"].includes(mode)) {
        biddingState.isDryRun = true;
        await message.reply("🧪 **DRY RUN MODE ENABLED** - Test mode activated");
      } else if (["off", "false", "disable"].includes(mode)) {
        biddingState.isDryRun = false;
        await message.reply("💰 **DRY RUN MODE DISABLED** - System is now LIVE");
      } else {
        return await message.reply("❌ Use `on` or `off`");
      }
      saveBiddingState();
      console.log(`🔧 Dry run: ${biddingState.isDryRun ? "ENABLED" : "DISABLED"}`);
      break;

    case "!bidstatus":
      const statusEmbed = new EmbedBuilder().setColor(0x4a90e2).setTitle("📊 Bidding System Status");
      if (biddingState.auctionQueue.length > 0) {
        const list = biddingState.auctionQueue.slice(0, 5).map((a, i) => `${i + 1}. ${a.item}`).join("\n");
        statusEmbed.addFields({ name: "📋 Queued", value: list + (biddingState.auctionQueue.length > 5 ? `\n*...${biddingState.auctionQueue.length - 5} more*` : "") });
      }
      if (biddingState.activeAuction) {
        statusEmbed.addFields(
          { name: "📴 Active", value: biddingState.activeAuction.item, inline: true },
          { name: "💰 Bid", value: `${biddingState.activeAuction.currentBid}pts`, inline: true }
        );
      }
      statusEmbed.setFooter({ text: biddingState.isDryRun ? "🧪 DRY RUN MODE" : "Use !auction to add items" }).setTimestamp();
      await message.reply({ embeds: [statusEmbed] });
      break;

    case "!clearqueue":
      if (biddingState.auctionQueue.length === 0) return await message.reply("📋 Queue is already empty");
      if (biddingState.activeAuction) return await message.reply("❌ Cannot clear while auction is active");
      const count = clearQueue();
      await message.reply(`✅ Cleared ${count} item(s)`);
      break;

    case "!resetbids":
      const resetEmbed = new EmbedBuilder().setColor(0xff0000).setTitle("⚠️ RESET ALL BIDDING DATA?");
      const resetMsg = await message.reply({ embeds: [resetEmbed] });
      await resetMsg.react("✅");
      await resetMsg.react("❌");
      const resetFilter = (reaction, user) => ["✅", "❌"].includes(reaction.emoji.name) && user.id === message.author.id;
      try {
        const resetCol = await resetMsg.awaitReactions({ filter: resetFilter, max: 1, time: 30000, errors: ["time"] });
        if (resetCol.first().emoji.name === "✅") {
          Object.values(biddingState.timerHandles).forEach(handle => clearTimeout(handle));
          biddingState = { auctionQueue: [], activeAuction: null, lockedPoints: {}, auctionHistory: [], isDryRun: biddingState.isDryRun, timerHandles: {}, pendingConfirmations: {}, sessionDate: null };
          saveBiddingState();
          await message.reply("✅ All bidding data reset");
        }
      } catch (err) {}
      break;

    case "!forcesubmitresults":
      if (!biddingState.sessionDate || biddingState.auctionHistory.length === 0) {
        return await message.reply("❌ No auction history. Run an auction first.");
      }
      const fsEmbed = new EmbedBuilder().setColor(0xff6600).setTitle("⚠️ Force Submit Results?")
        .setDescription(`**Timestamp:** ${biddingState.sessionDate}\n**Items:** ${biddingState.auctionHistory.length}`)
        .addFields({
          name: "📋 Results",
          value: biddingState.auctionHistory.map(a => `• **${a.item}**: ${a.winner} - ${a.amount}pts`).join("\n"),
          inline: false,
        })
        .setFooter({ text: "React ✅ to submit or ❌ to cancel" });
      const fsMsg = await message.reply({ embeds: [fsEmbed] });
      await fsMsg.react("✅");
      await fsMsg.react("❌");
      const fsFilter = (reaction, user) => ["✅", "❌"].includes(reaction.emoji.name) && user.id === message.author.id;
      try {
        const fsCol = await fsMsg.awaitReactions({ filter: fsFilter, max: 1, time: 30000, errors: ["time"] });
        if (fsCol.first().emoji.name === "✅") {
          console.log("📊 Force submitting results...");
          const memberTotals = {};
          biddingState.auctionHistory.forEach(auction => {
            memberTotals[auction.winner] = (memberTotals[auction.winner] || 0) + auction.amount;
          });
          const results = Object.entries(memberTotals).map(([member, total]) => ({ member, totalSpent: total }));
          const submission = await submitAuctionResults(config.sheet_webhook_url, results, biddingState.sessionDate, biddingState.isDryRun);
          
          if (submission.success) {
            const successEmbed = new EmbedBuilder().setColor(0x00ff00).setTitle("✅ Force Submit Successful!")
              .setDescription("Results submitted to Google Sheets")
              .addFields(
                { name: "🕐 Timestamp", value: biddingState.sessionDate, inline: true },
                { name: "🏆 Items", value: `${biddingState.auctionHistory.length}`, inline: true },
                { name: "💰 Total", value: `${results.reduce((sum, r) => sum + r.totalSpent, 0)}`, inline: true }
              )
              .setFooter({ text: biddingState.isDryRun ? "🧪 DRY RUN" : "Points deducted" }).setTimestamp();
            const winnerList = biddingState.auctionHistory.map(a => `• **${a.item}**: ${a.winner} - ${a.amount}pts`).join("\n");
            successEmbed.addFields({ name: "📋 Winners", value: winnerList });
            await message.channel.send({ embeds: [successEmbed] });
          } else {
            const failEmbed = new EmbedBuilder().setColor(0xff0000).setTitle("❌ Force Submit Failed")
              .setDescription(`**Error:** ${submission.error}`)
              .addFields({ name: "📝 Data", value: `\`\`\`\n${results.map(r => `${r.member}: ${r.totalSpent}pts`).join("\n")}\n\`\`\`` });
            await message.channel.send({ embeds: [failEmbed] });
          }
        }
      } catch (err) {}
      break;

    case "!testbidding":
      await message.reply("🔍 Testing Bidding System...");
      const testPoints = await fetchBiddingPoints(config.sheet_webhook_url, biddingState.isDryRun);
      if (testPoints) {
        const memberCount = Object.keys(testPoints).length;
        const testEmbed = new EmbedBuilder().setColor(0x00ff00).setTitle("✅ Bidding System Tests")
          .addFields(
            { name: "📊 Points Connection", value: "✅ Connected", inline: true },
            { name: "👥 Members", value: `${memberCount}`, inline: true },
            { name: "🎯 Mode", value: biddingState.isDryRun ? "🧪 DRY RUN" : "💰 LIVE", inline: true }
          ).setTimestamp();
        await message.reply({ embeds: [testEmbed] });
      } else {
        await message.reply("❌ Failed to connect to Google Sheets. Check webhook URL.");
      }
      break;
  }
}

// ==========================================
// MODULE EXPORTS
// ==========================================

module.exports = {
  loadBiddingState,
  saveBiddingState,
  getBiddingState: () => biddingState,

  handleCommand,

  confirmBid: async function (reaction, user, config) {
    const pending = biddingState.pendingConfirmations[reaction.message.id];
    if (!pending || pending.userId !== user.id) return;

    const auction = biddingState.activeAuction;
    if (!auction || auction.status !== "active") {
      await reaction.message.reply("❌ Auction is no longer active");
      delete biddingState.pendingConfirmations[reaction.message.id];
      saveBiddingState();
      return;
    }

    if (pending.amount <= auction.currentBid) {
      await reaction.message.reply(`❌ Bid no longer valid. Current bid is now ${auction.currentBid} points.`);
      delete biddingState.pendingConfirmations[reaction.message.id];
      saveBiddingState();
      return;
    }

    if (auction.currentWinner) {
      unlockPoints(auction.currentWinner, auction.currentBid);
      const outbidEmbed = new EmbedBuilder().setColor(0xff6600).setTitle("❌ You've Been Outbid!")
        .setDescription(`Someone bid **${pending.amount} points** on **${auction.item}**`);
      await reaction.message.channel.send({ content: `<@${auction.currentWinnerId}>`, embeds: [outbidEmbed] });
    }

    lockPoints(pending.username, pending.amount);

    const previousBid = auction.currentBid;
    auction.currentBid = pending.amount;
    auction.currentWinner = pending.username;
    auction.currentWinnerId = pending.userId;
    auction.bids.push({
      user: pending.username,
      userId: pending.userId,
      amount: pending.amount,
      timestamp: Date.now(),
    });

    const timeLeft = auction.endTime - Date.now();
    if (timeLeft < 60000 && auction.extendedCount < 10) {
      auction.endTime += 60000;
      auction.extendedCount++;
      auction.goingOnceAnnounced = false;
      auction.goingTwiceAnnounced = false;
    }

    if (biddingState.timerHandles[`confirm_${reaction.message.id}`]) {
      clearTimeout(biddingState.timerHandles[`confirm_${reaction.message.id}`]);
      delete biddingState.timerHandles[`confirm_${reaction.message.id}`];
    }

    const successEmbed = new EmbedBuilder().setColor(0x00ff00).setTitle("✅ Bid Confirmed!")
      .setDescription(`You are now the highest bidder on **${auction.item}**`)
      .addFields(
        { name: "💰 Your Bid", value: `${pending.amount} points`, inline: true },
        { name: "📊 Previous", value: `${previousBid} points`, inline: true },
        { name: "⏱️ Time Left", value: formatTimeRemaining(auction.endTime - Date.now()), inline: true }
      )
      .setFooter({ text: timeLeft < 60000 ? "⏰ Timer extended!" : "Good luck!" });

    await reaction.message.edit({ embeds: [successEmbed] });
    await reaction.message.reactions.removeAll().catch(() => {});

    const announceEmbed = new EmbedBuilder().setColor(0xffd700).setTitle("🔔 New High Bid!")
      .addFields(
        { name: "💰 Amount", value: `${pending.amount} points`, inline: true },
        { name: "👤 Bidder", value: pending.username, inline: true }
      );

    await reaction.message.channel.send({ embeds: [announceEmbed] });

    delete biddingState.pendingConfirmations[reaction.message.id];
    saveBiddingState();

    console.log(`✅ Bid confirmed: ${pending.username} - ${pending.amount}pts on ${auction.item}`);
  },

  cancelBid: async function (reaction, user) {
    const pending = biddingState.pendingConfirmations[reaction.message.id];
    if (!pending || pending.userId !== user.id) return;

    const cancelEmbed = new EmbedBuilder().setColor(0x808080).setTitle("❌ Bid Canceled")
      .setDescription("Your bid was not placed");

    await reaction.message.edit({ embeds: [cancelEmbed] });
    await reaction.message.reactions.removeAll().catch(() => {});

    if (biddingState.timerHandles[`confirm_${reaction.message.id}`]) {
      clearTimeout(biddingState.timerHandles[`confirm_${reaction.message.id}`]);
      delete biddingState.timerHandles[`confirm_${reaction.message.id}`];
    }

    delete biddingState.pendingConfirmations[reaction.message.id];
    saveBiddingState();
  },

  recoverBiddingState: async (client, config) => {
    if (loadBiddingState()) {
      console.log("📦 Bidding state recovered from disk");
      if (biddingState.activeAuction && biddingState.activeAuction.status === "active") {
        console.log("📄 Rescheduling auction timers...");
        scheduleAuctionTimers(client, config);
      }
      return true;
    }
    return false;
  },
};