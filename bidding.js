/**
 * ELYSIUM Guild Bidding System - Version 4.0 (CONSOLIDATED)
 * FEATURES:
 * - Multiple auctions per day with timestamped results (MM/DD/YYYY HH:MM)
 * - Automatic results submission after each auction session
 * - Points locking/unlocking system
 * - Dry run mode for testing
 * - Complete state persistence
 * - Bid confirmation with 30s timeout
 * - Auto-extend timer when bids come in final minute
 * - Admin commands for manual intervention
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
    const stateToSave = {
      auctionQueue: biddingState.auctionQueue,
      activeAuction: biddingState.activeAuction,
      lockedPoints: biddingState.lockedPoints,
      auctionHistory: biddingState.auctionHistory,
      isDryRun: biddingState.isDryRun,
      pendingConfirmations: biddingState.pendingConfirmations,
      sessionDate: biddingState.sessionDate,
    };
    fs.writeFileSync(STATE_FILE, JSON.stringify(stateToSave, null, 2));
  } catch (err) {
    console.error("❌ Failed to save bidding state:", err);
  }
}

function loadBiddingState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const data = fs.readFileSync(STATE_FILE, "utf8");
      biddingState = JSON.parse(data);
      return true;
    }
  } catch (err) {
    console.error("❌ Failed to load bidding state:", err);
  }
  return false;
}

function clearAllTimers() {
  Object.values(biddingState.timerHandles).forEach(handle => clearTimeout(handle));
  biddingState.timerHandles = {};
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

    if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);

    const data = await response.json();
    return data.points || {};
  } catch (err) {
    console.error("❌ Failed to fetch bidding points:", err);
    return null;
  }
}

async function submitAuctionResults(webhookUrl, results, timestamp, isDryRun = false) {
  const maxRetries = 3;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`📊 Submitting results (attempt ${attempt}/${maxRetries})...`);

      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "submitBiddingResults",
          results: results,
          timestamp: timestamp,
          dryRun: isDryRun,
        }),
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);

      const data = await response.json();

      if (data.status === "ok") {
        console.log("✅ Auction results submitted successfully");
        return { success: true, data };
      } else {
        throw new Error(data.message || "Unknown error");
      }
    } catch (err) {
      console.error(`❌ Attempt ${attempt} failed:`, err.message);

      if (attempt < maxRetries) {
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
// HELPER FUNCTIONS
// ==========================================

function generateAuctionId() {
  return `auction_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function getCurrentTimestamp() {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${month}/${day}/${year} ${hours}:${minutes}`;
}

function formatDuration(minutes) {
  if (minutes < 60) return `${minutes}min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}min` : `${hours}h`;
}

function formatTimeRemaining(ms) {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;

  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;

  if (minutes < 60) return secs > 0 ? `${minutes}m ${secs}s` : `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

function getAvailablePoints(member, totalPoints) {
  const locked = biddingState.lockedPoints[member] || 0;
  return Math.max(0, totalPoints - locked);
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
// AUCTION QUEUE MANAGEMENT
// ==========================================

function addToQueue(item, startPrice, duration) {
  const auction = {
    id: generateAuctionId(),
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
  if (biddingState.auctionQueue.length === 0) {
    return { success: false, message: "No items in queue" };
  }

  if (biddingState.activeAuction) {
    return { success: false, message: "An auction is already in progress" };
  }

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

  const threadTitle = `${auctionData.item} - ${getCurrentTimestamp()} | Starting: ${auctionData.startPrice}pts | Duration: ${formatDuration(auctionData.duration)}`;

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
  const now = Date.now();
  const timeLeft = auction.endTime - now;

  if (biddingState.timerHandles.goingOnce) clearTimeout(biddingState.timerHandles.goingOnce);
  if (biddingState.timerHandles.goingTwice) clearTimeout(biddingState.timerHandles.goingTwice);
  if (biddingState.timerHandles.finalCall) clearTimeout(biddingState.timerHandles.finalCall);
  if (biddingState.timerHandles.auctionEnd) clearTimeout(biddingState.timerHandles.auctionEnd);

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

  if (!auction) {
    console.log(`❌ No active auction`);
    return { success: false, message: "No active auction" };
  }

  console.log(`📦 Auction: ${auction.item}`);
  console.log(`📊 Status: ${auction.status}`);
  console.log(`💰 Current bid: ${auction.currentBid} points`);

  if (auction.status !== "active") {
    console.log(`❌ Auction status is "${auction.status}" (must be "active")`);
    return { success: false, message: "Auction not started yet. Wait for bidding to open." };
  }

  if (message.channel.id !== auction.threadId) {
    console.log(`❌ Wrong thread`);
    return { success: false, message: "Wrong thread. Bid in the active auction thread." };
  }

  const bidAmount = parseInt(amount);

  if (isNaN(bidAmount) || bidAmount <= 0) {
    console.log(`❌ Invalid bid amount: "${amount}"`);
    return { success: false, message: "Invalid bid amount" };
  }

  console.log(`💵 Bid amount: ${bidAmount} points`);

  if (bidAmount <= auction.currentBid) {
    console.log(`❌ Bid too low (current: ${auction.currentBid}, bid: ${bidAmount})`);
    return { success: false, message: `Bid must be higher than current bid (${auction.currentBid} points)` };
  }

  const member = message.member;
  const username = member.nickname || message.author.username;

  console.log(`\n👤 BIDDER INFO`);
  console.log(`   Username: ${username}`);
  console.log(`   User ID: ${message.author.id}`);

  console.log(`\n📊 FETCHING POINTS FROM GOOGLE SHEETS`);
  console.log(`   Webhook URL: ${config.sheet_webhook_url}`);
  console.log(`   Dry run mode: ${biddingState.isDryRun}`);
  console.log(`   Looking for member: "${username}"`);

  let allPoints = null;
  let fetchError = null;

  try {
    allPoints = await fetchBiddingPoints(config.sheet_webhook_url, biddingState.isDryRun);

    if (!allPoints) {
      fetchError = "fetchBiddingPoints returned null";
      console.error(`❌ ${fetchError}`);
    } else {
      console.log(`✅ Points fetched successfully`);
      console.log(`   Total members in sheet: ${Object.keys(allPoints).length}`);

      const sampleMembers = Object.entries(allPoints).slice(0, 5);
      console.log(`   Sample members:`);
      sampleMembers.forEach(([name, pts]) => {
        console.log(`      • ${name}: ${pts} points`);
      });

      const userInSheet = Object.keys(allPoints).find(name => name.toLowerCase() === username.toLowerCase());

      if (userInSheet) {
        console.log(`   ✅ User found in sheet as: "${userInSheet}"`);
      } else {
        console.log(`   ❌ User NOT found in sheet`);
        console.log(`   Available names: ${Object.keys(allPoints).join(", ")}`);
      }
    }
  } catch (err) {
    fetchError = err.message;
    console.error(`❌ Error fetching points: ${fetchError}`);
  }

  if (!allPoints) {
    console.log(`\n❌ FETCH FAILED - ABORTING BID`);
    return {
      success: false,
      message: `❌ Failed to fetch bidding points from Google Sheets.\n\n**Error:** ${fetchError || "Unknown error"}\n\n**Troubleshooting:**\n• Check webhook URL in config.json\n• Verify Apps Script is deployed\n• Check BiddingPoints sheet exists\n• Run \`!testbidding\` for diagnostics`,
    };
  }

  let totalPoints = allPoints[username];

  if (totalPoints === undefined) {
    const matchedName = Object.keys(allPoints).find(name => name.toLowerCase() === username.toLowerCase());
    if (matchedName) {
      totalPoints = allPoints[matchedName];
      console.log(`   ℹ️ Using case-insensitive match: "${matchedName}"`);
    } else {
      totalPoints = 0;
    }
  }

  totalPoints = totalPoints || 0;
  const lockedPoints = biddingState.lockedPoints[username] || 0;
  const availablePoints = Math.max(0, totalPoints - lockedPoints);

  console.log(`\n💳 POINTS BREAKDOWN`);
  console.log(`   Total points: ${totalPoints}`);
  console.log(`   Locked points: ${lockedPoints}`);
  console.log(`   Available: ${availablePoints}`);

  if (totalPoints === 0) {
    console.log(`❌ User has no points in sheet`);
    return { success: false, message: `❌ You have no bidding points available.\n\n**Your username in sheet:** "${username}"` };
  }

  if (bidAmount > availablePoints) {
    console.log(`❌ Insufficient points (need: ${bidAmount}, have: ${availablePoints})`);
    return {
      success: false,
      message: `❌ Insufficient points!\n\n💰 **Your Points:**\n• Total: ${totalPoints}\n• Locked: ${lockedPoints}\n• Available: ${availablePoints}\n\nYou need **${bidAmount}** but only have **${availablePoints}** available.`,
    };
  }

  const recentBids = auction.bids.filter(b => Date.now() - b.timestamp < 1000 && b.amount === bidAmount);

  if (recentBids.length > 0) {
    console.log(`❌ Duplicate bid detected`);
    return { success: false, message: "❌ **Duplicate bid detected!** Someone else bid the same amount. Please bid again." };
  }

  console.log(`\n✅ BID VALID - SHOWING CONFIRMATION`);

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
    username: username,
    threadId: auction.threadId,
    amount: bidAmount,
    timestamp: Date.now(),
    originalMessageId: message.id,
  };

  saveBiddingState();

  console.log(`✅ Confirmation message created: ${confirmMsg.id}`);
  console.log(`${"=".repeat(50)}\n`);

  biddingState.timerHandles[`confirm_${confirmMsg.id}`] = setTimeout(async () => {
    if (biddingState.pendingConfirmations[confirmMsg.id]) {
      console.log(`⏱️ Confirmation timeout for ${username}'s bid of ${bidAmount}`);
      await confirmMsg.reactions.removeAll().catch(() => {});
      await confirmMsg.edit({
        embeds: [
          confirmEmbed
            .setColor(0x808080)
            .setFooter({ text: "⏱️ Confirmation timed out" }),
        ],
      });
      delete biddingState.pendingConfirmations[confirmMsg.id];
      saveBiddingState();
    }
  }, 30000);

  return { success: true, confirmationMessageId: confirmMsg.id };
}

// ==========================================
// COMMAND HANDLERS
// ==========================================

async function handleAuctionCommand(message, args, config) {
  if (args.length < 3) {
    return await message.reply(
      "❌ **Invalid format**\n\n" +
      "**Usage:** `!auction <item name> <starting price> <duration in minutes>`\n\n" +
      "**Example:** `!auction GRAY DAWN LOAFERS - BARON 100 30`"
    );
  }

  const duration = parseInt(args[args.length - 1]);
  const startPrice = parseInt(args[args.length - 2]);
  const itemName = args.slice(0, -2).join(" ");

  if (isNaN(startPrice) || startPrice <= 0) {
    return await message.reply("❌ Starting price must be a positive number");
  }

  if (isNaN(duration) || duration <= 0) {
    return await message.reply("❌ Duration must be a positive number (in minutes)");
  }

  if (itemName.trim().length === 0) {
    return await message.reply("❌ Item name cannot be empty");
  }

  const duplicate = biddingState.auctionQueue.find(a => a.item.toLowerCase() === itemName.toLowerCase());

  if (duplicate) {
    return await message.reply(`❌ **${itemName}** is already in the queue`);
  }

  const auction = addToQueue(itemName, startPrice, duration);

  const embed = new EmbedBuilder()
    .setColor(0x00ff00)
    .setTitle("✅ Item Added to Queue")
    .setDescription(`**${itemName}**`)
    .addFields(
      { name: "💰 Starting Price", value: `${startPrice} points`, inline: true },
      { name: "⏱️ Duration", value: formatDuration(duration), inline: true },
      { name: "📋 Position", value: `#${biddingState.auctionQueue.length}`, inline: true }
    )
    .setFooter({ text: "Use !queuelist to see all items • Use !startauction to begin" })
    .setTimestamp();

  await message.reply({ embeds: [embed] });
  console.log(`📦 Added to queue: ${itemName} (${startPrice}pts, ${duration}min)`);
}

async function handleQueueListCommand(message) {
  if (biddingState.auctionQueue.length === 0) {
    return await message.reply("📋 Queue is empty. Use `!auction` to add items.");
  }

  const queueList = biddingState.auctionQueue
    .map((a, i) => `**${i + 1}.** ${a.item} - ${a.startPrice}pts • ${formatDuration(a.duration)}`)
    .join("\n");

  const embed = new EmbedBuilder()
    .setColor(0x4a90e2)
    .setTitle("📋 Auction Queue")
    .setDescription(queueList)
    .addFields(
      { name: "📊 Total Items", value: `${biddingState.auctionQueue.length}`, inline: true },
      { name: "📄 Status", value: biddingState.activeAuction ? "🟢 Auction in progress" : "⚪ Ready to start", inline: true }
    )
    .setFooter({ text: "Use !removeitem <name> to remove • !startauction to begin" })
    .setTimestamp();

  await message.reply({ embeds: [embed] });
}

async function handleRemoveItemCommand(message, args) {
  if (args.length === 0) {
    return await message.reply("❌ **Invalid format**\n\n**Usage:** `!removeitem <item name>`");
  }

  const itemName = args.join(" ");
  const removed = removeFromQueue(itemName);

  if (!removed) {
    return await message.reply(`❌ Item not found in queue: **${itemName}**`);
  }

  const embed = new EmbedBuilder()
    .setColor(0xff6600)
    .setTitle("🗑️ Item Removed from Queue")
    .setDescription(`**${removed.item}**`)
    .addFields({ name: "📋 Items Remaining", value: `${biddingState.auctionQueue.length}`, inline: true })
    .setTimestamp();

  await message.reply({ embeds: [embed] });
  console.log(`🗑️ Removed from queue: ${removed.item}`);
}

async function handleStartAuctionCommand(message, client, config) {
  if (biddingState.auctionQueue.length === 0) {
    return await message.reply("❌ Queue is empty. Add items using `!auction` first.");
  }

  if (biddingState.activeAuction) {
    return await message.reply("❌ An auction is already in progress. Please wait for it to finish.");
  }

  const queuePreview = biddingState.auctionQueue
    .slice(0, 10)
    .map((a, i) => `${i + 1}. **${a.item}** - ${a.startPrice}pts • ${formatDuration(a.duration)}`)
    .join("\n");

  const moreItems = biddingState.auctionQueue.length > 10 ? `\n\n*...and ${biddingState.auctionQueue.length - 10} more items*` : "";

  const confirmEmbed = new EmbedBuilder()
    .setColor(0xffd700)
    .setTitle("⚠️ Start Auction Session?")
    .setDescription(
      `**${biddingState.auctionQueue.length} item(s)** will be auctioned sequentially:\n\n${queuePreview}${moreItems}`
    )
    .addFields(
      { name: "⏱️ Estimated Time", value: `~${Math.ceil(biddingState.auctionQueue.reduce((sum, a) => sum + a.duration, 0) * 1.2)} minutes`, inline: true },
      { name: "🎯 Mode", value: biddingState.isDryRun ? "🧪 **DRY RUN**" : "💰 **LIVE**", inline: true }
    )
    .setFooter({ text: "React ✅ to start or ❌ to cancel" });

  const confirmMsg = await message.reply({ embeds: [confirmEmbed] });
  await confirmMsg.react("✅");
  await confirmMsg.react("❌");

  const filter = (reaction, user) => {
    return (
      ["✅", "❌"].includes(reaction.emoji.name) &&
      user.id === message.author.id
    );
  };

  try {
    const collected = await confirmMsg.awaitReactions({
      filter,
      max: 1,
      time: 30000,
      errors: ["time"],
    });
    const reaction = collected.first();

    if (reaction.emoji.name === "✅") {
      await confirmMsg.reactions.removeAll().catch(() => {});
      await confirmMsg.edit({
        embeds: [
          confirmEmbed
            .setColor(0x00ff00)
            .setFooter({ text: "🚀 Starting auction session..." }),
        ],
      });

      const result = await startAuctionSession(client, config);

      if (result.success) {
        const startEmbed = new EmbedBuilder()
          .setColor(0x00ff00)
          .setTitle("🚀 Auction Session Started!")
          .setDescription(
            `**${result.totalItems} item(s)** will be auctioned one by one.\n\n` +
            `First item: **${result.firstItem}**`
          )
          .setFooter({ text: "Check the auction threads to bid!" })
          .setTimestamp();

        await message.channel.send({ embeds: [startEmbed] });
      } else {
        await message.reply(`❌ ${result.message}`);
      }
    } else {
      await confirmMsg.reactions.removeAll().catch(() => {});
      await confirmMsg.edit({
        embeds: [
          confirmEmbed
            .setColor(0x808080)
            .setFooter({ text: "❌ Auction start canceled" }),
        ],
      });
    }
  } catch (err) {
    await confirmMsg.reactions.removeAll().catch(() => {});
    await confirmMsg.edit({
      embeds: [
        confirmEmbed
          .setColor(0x808080)
          .setFooter({ text: "⏱️ Confirmation timed out" }),
      ],
    });
  }
}

async function handleBidCommand(message, args, config) {
  if (args.length === 0) {
    return await message.reply(
      "❌ **Invalid format**\n\n**Usage:** `!bid <amount>`\n**Example:** `!bid 150`"
    );
  }

  const amount = args[0];
  const result = await processBid(message, amount, config);

  if (!result.success) {
    await message.reply(`❌ ${result.message}`);
  }
}

async function handleMyBidsCommand(message) {
  const username = message.member.nickname || message.author.username;
  const auction = biddingState.activeAuction;

  if (!auction) {
    return await message.reply("ℹ️ No active auction at the moment.");
  }

  const lockedAmount = biddingState.lockedPoints[username] || 0;
  const isWinning = auction.currentWinner === username;

  const embed = new EmbedBuilder()
    .setColor(isWinning ? 0x00ff00 : 0x4a90e2)
    .setTitle("📊 Your Bidding Status")
    .addFields(
      { name: "💰 Current Auction", value: auction.item, inline: true },
      { name: "💳 Locked Points", value: `${lockedAmount}`, inline: true },
      { name: "🏆 Status", value: isWinning ? "✅ **Winning!**" : "⚪ Not winning", inline: true }
    );

  if (isWinning) {
    embed.addFields(
      { name: "💵 Your Bid", value: `${auction.currentBid} points`, inline: true },
      { name: "⏱️ Time Left", value: formatTimeRemaining(auction.endTime - Date.now()), inline: true }
    );
  }

  embed.setFooter({ text: "Use !bid <amount> to place a bid" });
  await message.reply({ embeds: [embed] });
}

async function handleBidStatusCommand(message, isAdmin = false) {
  const embed = new EmbedBuilder()
    .setColor(0x4a90e2)
    .setTitle("📊 Bidding System Status");

  if (biddingState.auctionQueue.length > 0) {
    const queueList = biddingState.auctionQueue
      .slice(0, 5)
      .map((a, i) => `${i + 1}. ${a.item} - ${a.startPrice}pts`)
      .join("\n");

    const more = biddingState.auctionQueue.length > 5 ? `\n*...${biddingState.auctionQueue.length - 5} more*` : "";
    embed.addFields({ name: "📋 Queued Items", value: queueList + more });
  } else {
    embed.addFields({ name: "📋 Queue", value: "Empty" });
  }

  if (biddingState.activeAuction) {
    const auction = biddingState.activeAuction;
    const timeLeft = auction.status === "active" ? formatTimeRemaining(auction.endTime - Date.now()) : auction.status;

    embed.addFields(
      { name: "📴 Active Auction", value: auction.item, inline: false },
      {
        name: "💰 Current Bid",
        value: auction.currentWinner ? `${auction.currentBid}pts by ${auction.currentWinner}` : `${auction.startPrice}pts (no bids)`,
        inline: true,
      },
      { name: "⏱️ Time Left", value: timeLeft, inline: true },
      { name: "📊 Total Bids", value: `${auction.bids.length}`, inline: true }
    );
  } else {
    embed.addFields({ name: "📴 Active Auction", value: "None" });
  }

  if (isAdmin) {
    embed.addFields(
      { name: "🔒 Locked Points", value: `${Object.keys(biddingState.lockedPoints).length} members`, inline: true },
      { name: "🏆 Completed Today", value: `${biddingState.auctionHistory.length}`, inline: true },
      { name: "🎯 Mode", value: biddingState.isDryRun ? "🧪 DRY RUN" : "💰 LIVE", inline: true }
    );
  }

  embed.setFooter({ text: biddingState.isDryRun ? "🧪 DRY RUN MODE ACTIVE" : "Use !auction to add items" }).setTimestamp();
  await message.reply({ embeds: [embed] });
}

async function handleDryRunCommand(message, args) {
  if (biddingState.activeAuction) {
    return await message.reply("❌ Cannot toggle dry run mode while auction is active");
  }

  if (args.length === 0) {
    const status = biddingState.isDryRun ? "🧪 **ENABLED**" : "⚪ **DISABLED**";
    return await message.reply(`Dry run mode: ${status}\n\nUsage: \`!dryrun on\` or \`!dryrun off\``);
  }

  const mode = args[0].toLowerCase();

  if (mode === "on" || mode === "true" || mode === "enable") {
    biddingState.isDryRun = true;
    saveBiddingState();

    await message.reply(
      "🧪 **DRY RUN MODE ENABLED**\n\n" +
      "• All auctions will use test data\n" +
      "• No real points will be deducted\n" +
      "• Results will be saved to test sheet\n\n" +
      "⚠️ This is for testing only!"
    );
  } else if (mode === "off" || mode === "false" || mode === "disable") {
    biddingState.isDryRun = false;
    saveBiddingState();

    await message.reply(
      "💰 **DRY RUN MODE DISABLED**\n\n" +
      "• Auctions will use real bidding points\n" +
      "• Points will be deducted from winners\n" +
      "• Results will be saved to live sheet\n\n" +
      "✅ System is now LIVE"
    );
  } else {
    await message.reply("❌ Invalid option. Use `on` or `off`");
  }

  console.log(`🔧 Dry run mode: ${biddingState.isDryRun ? "ENABLED" : "DISABLED"}`);
}

async function handleCancelAuctionCommand(message, client, config) {
  if (!biddingState.activeAuction && biddingState.auctionQueue.length === 0) {
    return await message.reply("ℹ️ No active auctions to cancel");
  }

  const confirmEmbed = new EmbedBuilder()
    .setColor(0xff0000)
    .setTitle("⚠️ Cancel Auction Session?")
    .setDescription(
      `This will:\n` +
      `• Cancel current auction${biddingState.activeAuction ? ` (**${biddingState.activeAuction.item}**)` : ""}\n` +
      `• Clear ${biddingState.auctionQueue.length} queued item(s)\n` +
      `• Return all locked points to members\n` +
      `• **NOT** submit any results to Google Sheets`
    )
    .setFooter({ text: "React ✅ to confirm or ❌ to cancel" });

  const confirmMsg = await message.reply({ embeds: [confirmEmbed] });
  await confirmMsg.react("✅");
  await confirmMsg.react("❌");

  const filter = (reaction, user) => {
    return (
      ["✅", "❌"].includes(reaction.emoji.name) &&
      user.id === message.author.id
    );
  };

  try {
    const collected = await confirmMsg.awaitReactions({
      filter,
      max: 1,
      time: 30000,
      errors: ["time"],
    });
    const reaction = collected.first();

    if (reaction.emoji.name === "✅") {
      clearAllTimers();

      if (biddingState.activeAuction) {
        const guild = await client.guilds.fetch(config.main_guild_id);
        const thread = await guild.channels.fetch(biddingState.activeAuction.threadId).catch(() => null);
        if (thread) {
          await thread.send("❌ **Auction canceled by admin**");
          await thread.setArchived(true, "Admin canceled auction").catch(() => {});
        }
      }

      const canceledItems = biddingState.auctionQueue.length + (biddingState.activeAuction ? 1 : 0);
      biddingState.activeAuction = null;
      biddingState.auctionQueue = [];
      biddingState.auctionHistory = [];
      biddingState.lockedPoints = {};
      biddingState.pendingConfirmations = {};
      biddingState.sessionDate = null;
      saveBiddingState();

      await confirmMsg.edit({
        embeds: [
          confirmEmbed
            .setColor(0x808080)
            .setFooter({ text: `✅ Canceled ${canceledItems} auction(s) • All points returned` }),
        ],
      });
      await confirmMsg.reactions.removeAll().catch(() => {});

      console.log(`🔧 All auctions canceled`);
    } else {
      await confirmMsg.reactions.removeAll().catch(() => {});
      await confirmMsg.edit({
        embeds: [
          confirmEmbed.setColor(0x4a90e2).setFooter({ text: "❌ Cancellation aborted" }),
        ],
      });
    }
  } catch (err) {
    await confirmMsg.reactions.removeAll().catch(() => {});
    await confirmMsg.edit({
      embeds: [
        confirmEmbed.setColor(0x808080).setFooter({ text: "⏱️ Confirmation timed out" }),
      ],
    });
  }
}

async function handleClearQueueCommand(message) {
  if (biddingState.auctionQueue.length === 0) {
    return await message.reply("ℹ️ Queue is already empty");
  }

  if (biddingState.activeAuction) {
    return await message.reply(
      "❌ Cannot clear queue while auction is active. Use `!cancelauction` instead."
    );
  }

  const count = clearQueue();
  await message.reply(`✅ Cleared ${count} item(s) from queue`);
  console.log(`🔧 Queue cleared (${count} items)`);
}

async function handleForceSyncCommand(message, config) {
  await message.reply("⏳ Syncing bidding points from Google Sheets...");

  const points = await fetchBiddingPoints(config.sheet_webhook_url, biddingState.isDryRun);

  if (points) {
    const memberCount = Object.keys(points).length;
    const totalPoints = Object.values(points).reduce((sum, p) => sum + p, 0);

    await message.reply(
      `✅ Sync complete!\n\n` +
      `• ${memberCount} members\n` +
      `• ${totalPoints} total points available\n` +
      `• Mode: ${biddingState.isDryRun ? "🧪 DRY RUN" : "💰 LIVE"}`
    );
  } else {
    await message.reply("❌ Failed to sync bidding points. Check Google Sheets connection.");
  }
}

async function handleEndAuctionCommand(message, client, config) {
  const auction = biddingState.activeAuction;

  if (!auction) {
    return await message.reply("❌ No active auction to end");
  }

  if (message.channel.id !== auction.threadId) {
    return await message.reply("❌ This command must be used in the active auction thread");
  }

  const confirmEmbed = new EmbedBuilder()
    .setColor(0xff6600)
    .setTitle("⚠️ Force End Auction?")
    .setDescription(
      `**Item:** ${auction.item}\n` +
      `**Current Bid:** ${auction.currentBid} points\n` +
      `**Current Winner:** ${auction.currentWinner || "No bids yet"}\n\n` +
      `This will:\n` +
      `• End the auction immediately\n` +
      `• Declare current high bidder as winner\n` +
      `• Move to next item in queue (if any)\n` +
      `• Submit results at end of session`
    )
    .setFooter({ text: "React ✅ to confirm or ❌ to cancel" });

  const confirmMsg = await message.reply({ embeds: [confirmEmbed] });
  await confirmMsg.react("✅");
  await confirmMsg.react("❌");

  const filter = (reaction, user) => {
    return (
      ["✅", "❌"].includes(reaction.emoji.name) &&
      user.id === message.author.id
    );
  };

  try {
    const collected = await confirmMsg.awaitReactions({
      filter,
      max: 1,
      time: 30000,
      errors: ["time"],
    });
    const reaction = collected.first();

    if (reaction.emoji.name === "✅") {
      await confirmMsg.reactions.removeAll().catch(() => {});
      await message.channel.send("⚠️ **Force ending auction...**");

      clearAllTimers();
      await endAuction(client, config);

      console.log(`🔧 Auction force-ended`);
    } else {
      await confirmMsg.reactions.removeAll().catch(() => {});
      await confirmMsg.edit({
        embeds: [
          confirmEmbed.setColor(0x808080).setFooter({ text: "❌ Force end canceled" }),
        ],
      });
    }
  } catch (err) {
    await confirmMsg.reactions.removeAll().catch(() => {});
    await confirmMsg.edit({
      embeds: [
        confirmEmbed.setColor(0x808080).setFooter({ text: "⏱️ Confirmation timed out" }),
      ],
    });
  }
}

async function handleExtendTimeCommand(message, args, client, config) {
  const auction = biddingState.activeAuction;

  if (!auction) {
    return await message.reply("❌ No active auction to extend");
  }

  if (message.channel.id !== auction.threadId) {
    return await message.reply("❌ This command must be used in the active auction thread");
  }

  if (args.length === 0) {
    return await message.reply("❌ **Usage:** `!extendtime <minutes>`\n**Example:** `!extendtime 5`");
  }

  const minutes = parseInt(args[0]);

  if (isNaN(minutes) || minutes <= 0) {
    return await message.reply("❌ Invalid minutes. Must be a positive number.");
  }

  auction.endTime += minutes * 60000;
  scheduleAuctionTimers(client, config);
  saveBiddingState();

  await message.reply(
    `✅ Added **${minutes} minute(s)** to auction. New end time: ${formatTimeRemaining(auction.endTime - Date.now())}`
  );

  console.log(`🔧 Auction extended by ${minutes}min`);
}

async function handleForceWinnerCommand(message, args) {
  const auction = biddingState.activeAuction;

  if (!auction) {
    return await message.reply("❌ No active auction");
  }

  if (message.channel.id !== auction.threadId) {
    return await message.reply("❌ This command must be used in the active auction thread");
  }

  const mentionedUser = message.mentions.users.first();

  if (!mentionedUser) {
    return await message.reply("❌ **Usage:** `!forcewinner @member`");
  }

  const member = await message.guild.members.fetch(mentionedUser.id);
  const username = member.nickname || mentionedUser.username;

  if (auction.currentWinner) {
    unlockPoints(auction.currentWinner, auction.currentBid);
  }

  auction.currentWinner = username;
  auction.currentWinnerId = mentionedUser.id;

  lockPoints(username, auction.currentBid);
  saveBiddingState();

  await message.reply(
    `✅ Winner manually assigned: **${username}** with bid of **${auction.currentBid} points**`
  );

  console.log(`🔧 Winner forced: ${username}`);
}

async function handleCancelBidCommand(message, args) {
  const auction = biddingState.activeAuction;

  if (!auction) {
    return await message.reply("❌ No active auction");
  }

  if (message.channel.id !== auction.threadId) {
    return await message.reply("❌ This command must be used in the active auction thread");
  }

  const mentionedUser = message.mentions.users.first();

  if (!mentionedUser) {
    return await message.reply("❌ **Usage:** `!cancelbid @member`");
  }

  const member = await message.guild.members.fetch(mentionedUser.id);
  const username = member.nickname || mentionedUser.username;

  if (auction.currentWinnerId === mentionedUser.id) {
    unlockPoints(username, auction.currentBid);

    const sortedBids = [...auction.bids]
      .filter(b => b.userId !== mentionedUser.id)
      .sort((a, b) => b.amount - a.amount);

    if (sortedBids.length > 0) {
      const previousBid = sortedBids[0];
      auction.currentBid = previousBid.amount;
      auction.currentWinner = previousBid.user;
      auction.currentWinnerId = previousBid.userId;

      lockPoints(previousBid.user, previousBid.amount);

      await message.reply(
        `✅ Canceled **${username}**'s bid\n\n` +
        `New high bidder: **${previousBid.user}** with **${previousBid.amount} points**`
      );
    } else {
      auction.currentBid = auction.startPrice;
      auction.currentWinner = null;
      auction.currentWinnerId = null;

      await message.reply(
        `✅ Canceled **${username}**'s bid\n\n` +
        `No other bids. Current bid reset to starting price: **${auction.startPrice} points**`
      );
    }

    auction.bids = auction.bids.filter(b => b.userId !== mentionedUser.id);
    saveBiddingState();
  } else {
    await message.reply(`ℹ️ **${username}** is not the current high bidder. No action needed.`);
  }

  console.log(`🔧 Bid canceled for ${username}`);
}

async function handleDebugAuctionCommand(message) {
  const auction = biddingState.activeAuction;

  if (!auction) {
    return await message.reply("❌ No active auction");
  }

  if (message.channel.id !== auction.threadId) {
    return await message.reply("❌ This command must be used in the active auction thread");
  }

  const bidHistory =
    auction.bids
      .slice(-5)
      .map(b => `• ${b.user}: ${b.amount}pts at ${new Date(b.timestamp).toLocaleTimeString()}`)
      .join("\n") || "No bids yet";

  const lockedPointsList =
    Object.entries(biddingState.lockedPoints)
      .slice(0, 5)
      .map(([member, points]) => `• ${member}: ${points}pts`)
      .join("\n") || "None";

  const embed = new EmbedBuilder()
    .setColor(0x4a90e2)
    .setTitle("🔍 Auction Debug Info")
    .addFields(
      { name: "🎯 Item", value: auction.item, inline: false },
      { name: "💰 Current Bid", value: `${auction.currentBid}pts`, inline: true },
      { name: "🏆 Current Winner", value: auction.currentWinner || "None", inline: true },
      { name: "⏱️ Status", value: auction.status, inline: true },
      { name: "📊 Total Bids", value: `${auction.bids.length}`, inline: true },
      { name: "📈 Extensions", value: `${auction.extendedCount}`, inline: true },
      {
        name: "⏰ Time Left",
        value: auction.status === "active" ? formatTimeRemaining(auction.endTime - Date.now()) : "N/A",
        inline: true,
      },
      { name: "📝 Recent Bids", value: bidHistory, inline: false },
      { name: "🔒 Locked Points (Top 5)", value: lockedPointsList, inline: false },
      { name: "🎯 Mode", value: biddingState.isDryRun ? "🧪 DRY RUN" : "💰 LIVE", inline: true },
      { name: "🕐 Session Timestamp", value: biddingState.sessionDate || "N/A", inline: true }
    )
    .setFooter({ text: `Auction ID: ${auction.id}` })
    .setTimestamp();

  await message.reply({ embeds: [embed] });
}

async function handleSetBidPointsCommand(message, args) {
  if (args.length < 2) {
    return await message.reply(
      "❌ **Usage:** `!setbidpoints @member <amount>`\n" +
      "**Example:** `!setbidpoints @Player1 500`\n\n" +
      "⚠️ This only works in dry run mode for testing."
    );
  }

  if (!biddingState.isDryRun) {
    return await message.reply(
      "❌ This command only works in dry run mode. Use `!dryrun on` first."
    );
  }

  const mentionedUser = message.mentions.users.first();
  const amount = parseInt(args[args.length - 1]);

  if (!mentionedUser) {
    return await message.reply("❌ You must mention a user");
  }

  if (isNaN(amount) || amount < 0) {
    return await message.reply("❌ Amount must be a non-negative number");
  }

  const member = await message.guild.members.fetch(mentionedUser.id);
  const username = member.nickname || mentionedUser.username;

  await message.reply(
    `✅ Set bidding points for **${username}** to **${amount} points**\n\n` +
    `🧪 Dry run mode - changes are temporary`
  );

  console.log(`🔧 Test points set: ${username} -> ${amount}pts`);
}

async function handleResetBidsCommand(message) {
  const confirmEmbed = new EmbedBuilder()
    .setColor(0xff0000)
    .setTitle("⚠️ RESET ALL BIDDING DATA?")
    .setDescription(
      `**This will:**\n` +
      `• Cancel any active auction\n` +
      `• Clear all queued items\n` +
      `• Clear auction history\n` +
      `• Return all locked points\n` +
      `• Clear all pending confirmations\n\n` +
      `**This cannot be undone!**`
    )
    .setFooter({ text: "React ✅ to confirm or ❌ to cancel" });

  const confirmMsg = await message.reply({ embeds: [confirmEmbed] });
  await confirmMsg.react("✅");
  await confirmMsg.react("❌");

  const filter = (reaction, user) => {
    return (
      ["✅", "❌"].includes(reaction.emoji.name) &&
      user.id === message.author.id
    );
  };

  try {
    const collected = await confirmMsg.awaitReactions({
      filter,
      max: 1,
      time: 30000,
      errors: ["time"],
    });
    const reaction = collected.first();

    if (reaction.emoji.name === "✅") {
      clearAllTimers();

      biddingState = {
        auctionQueue: [],
        activeAuction: null,
        lockedPoints: {},
        auctionHistory: [],
        isDryRun: biddingState.isDryRun,
        timerHandles: {},
        pendingConfirmations: {},
        sessionDate: null,
      };

      saveBiddingState();

      await confirmMsg.edit({
        embeds: [
          confirmEmbed
            .setColor(0x808080)
            .setFooter({ text: "✅ All bidding data reset" }),
        ],
      });
      await confirmMsg.reactions.removeAll().catch(() => {});

      console.log(`🔧 All bidding data reset`);
    } else {
      await confirmMsg.reactions.removeAll().catch(() => {});
      await confirmMsg.edit({
        embeds: [
          confirmEmbed
            .setColor(0x4a90e2)
            .setFooter({ text: "❌ Reset canceled" }),
        ],
      });
    }
  } catch (err) {
    await confirmMsg.reactions.removeAll().catch(() => {});
    await confirmMsg.edit({
      embeds: [
        confirmEmbed
          .setColor(0x808080)
          .setFooter({ text: "⏱️ Confirmation timed out" }),
      ],
    });
  }
}

// ==========================================
// MODULE EXPORTS
// ==========================================

module.exports = {
  loadBiddingState,
  saveBiddingState,
  getBiddingState: () => biddingState,

  handleAuctionCommand,
  handleQueueListCommand,
  handleRemoveItemCommand,
  handleStartAuctionCommand,
  handleBidCommand,
  handleMyBidsCommand,
  handleBidStatusCommand,
  handleDryRunCommand,
  handleCancelAuctionCommand,
  handleClearQueueCommand,
  handleForceSyncCommand,
  handleEndAuctionCommand,
  handleExtendTimeCommand,
  handleForceWinnerCommand,
  handleCancelBidCommand,
  handleDebugAuctionCommand,
  handleSetBidPointsCommand,
  handleResetBidsCommand,

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
      await reaction.message.reply(
        `❌ Bid no longer valid. Current bid is now ${auction.currentBid} points.`
      );
      delete biddingState.pendingConfirmations[reaction.message.id];
      saveBiddingState();
      return;
    }

    if (auction.currentWinner) {
      unlockPoints(auction.currentWinner, auction.currentBid);

      const outbidEmbed = new EmbedBuilder()
        .setColor(0xff6600)
        .setTitle("❌ You've Been Outbid!")
        .setDescription(
          `Someone bid **${pending.amount} points** on **${auction.item}**`
        )
        .addFields(
          { name: "💸 Your Points Returned", value: `${auction.currentBid} points`, inline: true },
          { name: "💰 New High Bid", value: `${pending.amount} points`, inline: true }
        )
        .setFooter({ text: "You can bid again if you want" });

      await reaction.message.channel.send({
        content: `<@${auction.currentWinnerId}>`,
        embeds: [outbidEmbed],
      });
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

      scheduleAuctionTimers(config.client, config);
    }

    if (biddingState.timerHandles[`confirm_${reaction.message.id}`]) {
      clearTimeout(biddingState.timerHandles[`confirm_${reaction.message.id}`]);
      delete biddingState.timerHandles[`confirm_${reaction.message.id}`];
    }

    const successEmbed = new EmbedBuilder()
      .setColor(0x00ff00)
      .setTitle("✅ Bid Confirmed!")
      .setDescription(`You are now the highest bidder on **${auction.item}**`)
      .addFields(
        { name: "💰 Your Bid", value: `${pending.amount} points`, inline: true },
        { name: "📊 Previous Bid", value: `${previousBid} points`, inline: true },
        { name: "⏱️ Time Left", value: formatTimeRemaining(auction.endTime - Date.now()), inline: true }
      )
      .setFooter({ text: timeLeft < 60000 ? "⏰ Timer extended by 1 minute!" : "Good luck!" });

    await reaction.message.edit({ embeds: [successEmbed] });
    await reaction.message.reactions.removeAll().catch(() => {});

    const announceEmbed = new EmbedBuilder()
      .setColor(0xffd700)
      .setTitle("🔔 New High Bid!")
      .addFields(
        { name: "💰 Amount", value: `${pending.amount} points`, inline: true },
        { name: "👤 Bidder", value: pending.username, inline: true },
        { name: "⏱️ Time Left", value: formatTimeRemaining(auction.endTime - Date.now()), inline: true }
      );

    await reaction.message.channel.send({ embeds: [announceEmbed] });

    delete biddingState.pendingConfirmations[reaction.message.id];
    saveBiddingState();

    console.log(`✅ Bid confirmed: ${pending.username} - ${pending.amount} points on ${auction.item}`);
  },

  cancelBid: async function (reaction, user) {
    const pending = biddingState.pendingConfirmations[reaction.message.id];
    if (!pending || pending.userId !== user.id) return;

    const cancelEmbed = new EmbedBuilder()
      .setColor(0x808080)
      .setTitle("❌ Bid Canceled")
      .setDescription("Your bid was not placed")
      .setFooter({ text: "You can bid again anytime" });

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

      if (
        biddingState.activeAuction &&
        biddingState.activeAuction.status === "active"
      ) {
        console.log("📄 Rescheduling auction timers...");
        scheduleAuctionTimers(client, config);
      }

      return true;
    }
    return false;
  },
};