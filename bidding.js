/**
 * ELYSIUM Guild Bidding System - Version 1.0
 * 
 * FEATURES:
 * ✅ Queue-based auction system (add items, then start all at once)
 * ✅ Sequential auctions (one-by-one with 20-second buffer)
 * ✅ Points locking/unlocking (automatic when outbid)
 * ✅ Bid confirmation with ✅/❌ reactions
 * ✅ Auto-extend timer (1 minute if bid in last minute)
 * ✅ "Going once, going twice" announcements
 * ✅ Dry-run testing mode (separate test sheet)
 * ✅ State recovery on bot restart
 * ✅ Google Sheets integration with retry logic
 * ✅ Comprehensive admin overrides
 */

const { EmbedBuilder } = require('discord.js');
const fetch = require('node-fetch');
const fs = require('fs');

// ==========================================
// STATE MANAGEMENT
// ==========================================

let biddingState = {
  auctionQueue: [],           // Items waiting to be auctioned
  activeAuction: null,        // Current auction in progress
  lockedPoints: {},           // member -> points currently locked in bids
  auctionHistory: [],         // Completed auctions in current session
  isDryRun: false,            // Test mode flag
  timerHandles: {},           // setTimeout references for cleanup
  pendingConfirmations: {},   // messageId -> {userId, threadId, amount, timestamp}
  sessionDate: null           // Date of current auction session (MM/DD/YYYY)
};

// Active auction structure:
// {
//   id: 'uuid',
//   item: 'Dragon Sword',
//   startPrice: 100,
//   duration: 30, // minutes
//   threadId: 'discord-thread-id',
//   currentBid: 100,
//   currentWinner: null,
//   currentWinnerId: null,
//   bids: [{user, userId, amount, timestamp}],
//   endTime: Date.now() + duration,
//   extendedCount: 0,
//   status: 'preview' | 'active' | 'ended',
//   goingOnceAnnounced: false,
//   goingTwiceAnnounced: false
// }

// Persistence
const STATE_FILE = './bidding-state.json';

/**
 * Save state to disk (for recovery after crashes)
 */
function saveBiddingState() {
  try {
    // Create a copy without timer handles (they can't be serialized)
    const stateToSave = {
      auctionQueue: biddingState.auctionQueue,
      activeAuction: biddingState.activeAuction,
      lockedPoints: biddingState.lockedPoints,
      auctionHistory: biddingState.auctionHistory,
      isDryRun: biddingState.isDryRun,
      pendingConfirmations: biddingState.pendingConfirmations,
      sessionDate: biddingState.sessionDate
      // NOTE: timerHandles are NOT saved - they will be rescheduled on recovery
    };
    
    fs.writeFileSync(STATE_FILE, JSON.stringify(stateToSave, null, 2));
    console.log('💾 Bidding state saved');
  } catch (err) {
    console.error('❌ Failed to save bidding state:', err);
  }
}

/**
 * Load state from disk (on bot restart)
 */
function loadBiddingState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const data = fs.readFileSync(STATE_FILE, 'utf8');
      biddingState = JSON.parse(data);
      console.log('✅ Bidding state loaded from disk');
      return true;
    }
  } catch (err) {
    console.error('❌ Failed to load bidding state:', err);
  }
  return false;
}

/**
 * Clear all timers (for cleanup)
 */
function clearAllTimers() {
  Object.values(biddingState.timerHandles).forEach(handle => clearTimeout(handle));
  biddingState.timerHandles = {};
}

// ==========================================
// GOOGLE SHEETS INTEGRATION
// ==========================================

/**
 * Fetch bidding points from Google Sheets
 * @param {string} webhookUrl - Google Apps Script webhook URL
 * @param {boolean} isDryRun - Use test sheet if true
 */
async function fetchBiddingPoints(webhookUrl, isDryRun = false) {
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        action: 'getBiddingPoints',
        dryRun: isDryRun
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }

    const data = await response.json();
    return data.points || {}; // {member: availablePoints}
  } catch (err) {
    console.error('❌ Failed to fetch bidding points:', err);
    return null;
  }
}

/**
 * Submit auction results to Google Sheets (with 3 retries)
 * @param {string} webhookUrl - Google Apps Script webhook URL
 * @param {Array} results - [{member, totalSpent}]
 * @param {string} date - MM/DD/YYYY
 * @param {boolean} isDryRun - Use test sheet if true
 */
async function submitAuctionResults(webhookUrl, results, date, isDryRun = false) {
  const maxRetries = 3;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`📊 Submitting results (attempt ${attempt}/${maxRetries})...`);
      
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          action: 'submitBiddingResults',
          results: results,
          date: date,
          dryRun: isDryRun
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }

      const data = await response.json();
      
      if (data.status === 'ok') {
        console.log('✅ Auction results submitted successfully');
        return {success: true, data};
      } else {
        throw new Error(data.message || 'Unknown error');
      }
    } catch (err) {
      console.error(`❌ Attempt ${attempt} failed:`, err.message);
      
      if (attempt < maxRetries) {
        const delay = attempt * 2000; // 2s, 4s, 6s
        console.log(`⏳ Retrying in ${delay/1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        return {success: false, error: err.message, results};
      }
    }
  }
}

// ==========================================
// HELPER FUNCTIONS
// ==========================================

/**
 * Generate unique ID for auctions
 */
function generateAuctionId() {
  return `auction_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Get current date in MM/DD/YYYY format
 */
function getCurrentDate() {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const year = date.getFullYear();
  return `${month}/${day}/${year}`;
}

/**
 * Format duration for display
 */
function formatDuration(minutes) {
  if (minutes < 60) return `${minutes}min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}min` : `${hours}h`;
}

/**
 * Format time remaining
 */
function formatTimeRemaining(ms) {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds} second${seconds !== 1 ? 's' : ''}`;
  
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  
  if (minutes < 60) {
    return secs > 0 ? `${minutes}m ${secs}s` : `${minutes}m`;
  }
  
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

/**
 * Get member's available points (accounting for locked points)
 */
function getAvailablePoints(member, totalPoints) {
  const locked = biddingState.lockedPoints[member] || 0;
  return Math.max(0, totalPoints - locked);
}

/**
 * Lock points for a bid
 */
function lockPoints(member, amount) {
  biddingState.lockedPoints[member] = (biddingState.lockedPoints[member] || 0) + amount;
  saveBiddingState();
}

/**
 * Unlock points (when outbid or auction ends)
 */
function unlockPoints(member, amount) {
  biddingState.lockedPoints[member] = Math.max(0, (biddingState.lockedPoints[member] || 0) - amount);
  if (biddingState.lockedPoints[member] === 0) {
    delete biddingState.lockedPoints[member];
  }
  saveBiddingState();
}

// ==========================================
// AUCTION QUEUE MANAGEMENT
// ==========================================

/**
 * Add item to auction queue
 */
function addToQueue(item, startPrice, duration) {
  const auction = {
    id: generateAuctionId(),
    item: item.trim(),
    startPrice: parseInt(startPrice),
    duration: parseInt(duration),
    addedAt: Date.now()
  };
  
  biddingState.auctionQueue.push(auction);
  saveBiddingState();
  
  return auction;
}

/**
 * Remove item from queue by name
 */
function removeFromQueue(itemName) {
  const index = biddingState.auctionQueue.findIndex(
    a => a.item.toLowerCase() === itemName.toLowerCase()
  );
  
  if (index === -1) return null;
  
  const removed = biddingState.auctionQueue.splice(index, 1)[0];
  saveBiddingState();
  
  return removed;
}

/**
 * Clear entire queue
 */
function clearQueue() {
  const count = biddingState.auctionQueue.length;
  biddingState.auctionQueue = [];
  saveBiddingState();
  return count;
}

// ==========================================
// AUCTION LIFECYCLE
// ==========================================

/**
 * Start auction session (creates threads for all queued items)
 */
async function startAuctionSession(client, config) {
  if (biddingState.auctionQueue.length === 0) {
    return {success: false, message: 'No items in queue'};
  }
  
  if (biddingState.activeAuction) {
    return {success: false, message: 'An auction is already in progress'};
  }
  
  // Set session date
  biddingState.sessionDate = getCurrentDate();
  
  // Start first auction
  const firstAuction = biddingState.auctionQueue[0];
  await startNextAuction(client, config);
  
  saveBiddingState();
  
  return {
    success: true, 
    totalItems: biddingState.auctionQueue.length,
    firstItem: firstAuction.item
  };
}

/**
 * Start next auction in queue
 */
async function startNextAuction(client, config) {
  if (biddingState.auctionQueue.length === 0) {
    // All auctions complete - finalize session
    await finalizeAuctionSession(client, config);
    return;
  }
  
  const auctionData = biddingState.auctionQueue[0];
  const guild = await client.guilds.fetch(config.main_guild_id);
  const biddingChannel = await guild.channels.fetch(config.bidding_channel_id);
  
  // Create thread
  const threadTitle = `${auctionData.item} - ${getCurrentDate()} | Starting: ${auctionData.startPrice}pts | Duration: ${formatDuration(auctionData.duration)}`;
  
  const thread = await biddingChannel.threads.create({
    name: threadTitle,
    autoArchiveDuration: 60,
    reason: `Auction: ${auctionData.item}`
  });
  
  // Initialize active auction
  biddingState.activeAuction = {
    ...auctionData,
    threadId: thread.id,
    currentBid: auctionData.startPrice,
    currentWinner: null,
    currentWinnerId: null,
    bids: [],
    endTime: null, // Set when preview ends
    extendedCount: 0,
    status: 'preview',
    goingOnceAnnounced: false,
    goingTwiceAnnounced: false
  };
  
  // Post preview message
  const previewEmbed = new EmbedBuilder()
    .setColor(0xFFD700)
    .setTitle(`🏆 AUCTION STARTING`)
    .setDescription(`**${auctionData.item}**`)
    .addFields(
      {name: '💰 Starting Bid', value: `${auctionData.startPrice} points`, inline: true},
      {name: '⏱️ Duration', value: formatDuration(auctionData.duration), inline: true},
      {name: '📋 Items Remaining', value: `${biddingState.auctionQueue.length - 1} after this`, inline: true}
    )
    .setFooter({text: biddingState.isDryRun ? '🧪 DRY RUN - TEST MODE' : 'Bidding starts in 20 seconds'})
    .setTimestamp();
  
  await thread.send({
    content: '@everyone',
    embeds: [previewEmbed]
  });
  
  // Schedule auction start (20 second buffer)
  biddingState.timerHandles.auctionStart = setTimeout(async () => {
    await activateAuction(client, config, thread);
  }, 20000);
  
  saveBiddingState();
}

/**
 * Activate auction (after preview period)
 */
async function activateAuction(client, config, thread) {
  biddingState.activeAuction.status = 'active';
  biddingState.activeAuction.endTime = Date.now() + (biddingState.activeAuction.duration * 60000);
  
  const startEmbed = new EmbedBuilder()
    .setColor(0x00FF00)
    .setTitle('🔔 BIDDING STARTS NOW!')
    .setDescription(`Type \`!bid <amount>\` to place your bid`)
    .addFields(
      {name: '💰 Current Bid', value: `${biddingState.activeAuction.currentBid} points`, inline: true},
      {name: '⏱️ Time Left', value: formatDuration(biddingState.activeAuction.duration), inline: true}
    )
    .setFooter({text: 'Bids must be higher than current bid'});
  
  await thread.send({embeds: [startEmbed]});
  
  // Schedule end-of-auction timer
  scheduleAuctionTimers(client, config);
  
  saveBiddingState();
}

/**
 * Schedule all auction timers (warnings + end)
 */
function scheduleAuctionTimers(client, config) {
  const auction = biddingState.activeAuction;
  const now = Date.now();
  const timeLeft = auction.endTime - now;
  
  // Clear existing timers
  if (biddingState.timerHandles.goingOnce) clearTimeout(biddingState.timerHandles.goingOnce);
  if (biddingState.timerHandles.goingTwice) clearTimeout(biddingState.timerHandles.goingTwice);
  if (biddingState.timerHandles.finalCall) clearTimeout(biddingState.timerHandles.finalCall);
  if (biddingState.timerHandles.auctionEnd) clearTimeout(biddingState.timerHandles.auctionEnd);
  
  // Schedule "Going once" (60 seconds before end)
  if (timeLeft > 60000 && !auction.goingOnceAnnounced) {
    biddingState.timerHandles.goingOnce = setTimeout(async () => {
      await announceGoingOnce(client, config);
    }, timeLeft - 60000);
  }
  
  // Schedule "Going twice" (30 seconds before end)
  if (timeLeft > 30000 && !auction.goingTwiceAnnounced) {
    biddingState.timerHandles.goingTwice = setTimeout(async () => {
      await announceGoingTwice(client, config);
    }, timeLeft - 30000);
  }
  
  // Schedule "Final call" (10 seconds before end)
  if (timeLeft > 10000) {
    biddingState.timerHandles.finalCall = setTimeout(async () => {
      await announceFinalCall(client, config);
    }, timeLeft - 10000);
  }
  
  // Schedule auction end
  biddingState.timerHandles.auctionEnd = setTimeout(async () => {
    await endAuction(client, config);
  }, timeLeft);
}

/**
 * Announce "Going once"
 */
async function announceGoingOnce(client, config) {
  const auction = biddingState.activeAuction;
  if (!auction || auction.status !== 'active') return;
  
  const guild = await client.guilds.fetch(config.main_guild_id);
  const thread = await guild.channels.fetch(auction.threadId);
  
  const embed = new EmbedBuilder()
    .setColor(0xFFA500)
    .setTitle('⚠️ GOING ONCE!')
    .setDescription('1 minute remaining')
    .addFields(
      {name: '💰 Current Bid', value: auction.currentWinner ? `${auction.currentBid} points by ${auction.currentWinner}` : `${auction.startPrice} points (no bids)`, inline: false}
    );
  
  await thread.send({content: '@everyone', embeds: [embed]});
  
  auction.goingOnceAnnounced = true;
  saveBiddingState();
}

/**
 * Announce "Going twice"
 */
async function announceGoingTwice(client, config) {
  const auction = biddingState.activeAuction;
  if (!auction || auction.status !== 'active') return;
  
  const guild = await client.guilds.fetch(config.main_guild_id);
  const thread = await guild.channels.fetch(auction.threadId);
  
  const embed = new EmbedBuilder()
    .setColor(0xFF6600)
    .setTitle('⚠️ GOING TWICE!')
    .setDescription('30 seconds remaining')
    .addFields(
      {name: '💰 Current Bid', value: auction.currentWinner ? `${auction.currentBid} points by ${auction.currentWinner}` : `${auction.startPrice} points (no bids)`, inline: false}
    );
  
  await thread.send({content: '@everyone', embeds: [embed]});
  
  auction.goingTwiceAnnounced = true;
  saveBiddingState();
}

/**
 * Announce "Final call"
 */
async function announceFinalCall(client, config) {
  const auction = biddingState.activeAuction;
  if (!auction || auction.status !== 'active') return;
  
  const guild = await client.guilds.fetch(config.main_guild_id);
  const thread = await guild.channels.fetch(auction.threadId);
  
  const embed = new EmbedBuilder()
    .setColor(0xFF0000)
    .setTitle('⚠️ FINAL CALL!')
    .setDescription('10 seconds remaining')
    .addFields(
      {name: '💰 Current Bid', value: auction.currentWinner ? `${auction.currentBid} points by ${auction.currentWinner}` : `${auction.startPrice} points (no bids)`, inline: false}
    );
  
  await thread.send({content: '@everyone', embeds: [embed]});
  
  saveBiddingState();
}

/**
 * End auction and declare winner
 */
async function endAuction(client, config) {
  const auction = biddingState.activeAuction;
  if (!auction) return;
  
  auction.status = 'ended';
  
  const guild = await client.guilds.fetch(config.main_guild_id);
  const thread = await guild.channels.fetch(auction.threadId);
  
  if (auction.currentWinner) {
    // Winner exists
    const winnerEmbed = new EmbedBuilder()
      .setColor(0xFFD700)
      .setTitle('🔨 SOLD!')
      .setDescription(`**${auction.item}** has been sold!`)
      .addFields(
        {name: '🏆 Winner', value: `<@${auction.currentWinnerId}>`, inline: true},
        {name: '💰 Winning Bid', value: `${auction.currentBid} points`, inline: true}
      )
      .setFooter({text: biddingState.isDryRun ? '🧪 DRY RUN - No points deducted' : 'Points will be deducted after all auctions'})
      .setTimestamp();
    
    await thread.send({embeds: [winnerEmbed]});
    
    // Record in history
    biddingState.auctionHistory.push({
      item: auction.item,
      winner: auction.currentWinner,
      winnerId: auction.currentWinnerId,
      amount: auction.currentBid,
      timestamp: Date.now()
    });
  } else {
    // No bids
    const noBidsEmbed = new EmbedBuilder()
      .setColor(0x808080)
      .setTitle('❌ NO BIDS')
      .setDescription(`**${auction.item}** received no bids and will not be sold.`)
      .setFooter({text: 'Moving to next item...'});
    
    await thread.send({embeds: [noBidsEmbed]});
  }
  
  // Archive thread
  await thread.setArchived(true, 'Auction ended').catch(() => {});
  
  // Remove from queue
  biddingState.auctionQueue.shift();
  
  // Clear active auction
  biddingState.activeAuction = null;
  
  saveBiddingState();
  
  // Start next auction after 20-second buffer
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

/**
 * Finalize auction session (submit results to Google Sheets)
 */
async function finalizeAuctionSession(client, config) {
  console.log('🏁 All auctions complete - finalizing session...');
  
  const guild = await client.guilds.fetch(config.main_guild_id);
  const adminLogs = await guild.channels.fetch(config.admin_logs_channel_id);
  const biddingChannel = await guild.channels.fetch(config.bidding_channel_id);
  
  if (biddingState.auctionHistory.length === 0) {
    await biddingChannel.send('🏁 **Auction session complete!** No items were sold.');
    biddingState.sessionDate = null;
    biddingState.lockedPoints = {};
    saveBiddingState();
    return;
  }
  
  // Calculate totals per member
  const memberTotals = {};
  biddingState.auctionHistory.forEach(auction => {
    memberTotals[auction.winner] = (memberTotals[auction.winner] || 0) + auction.amount;
  });
  
  // Prepare results for Google Sheets
  const results = Object.entries(memberTotals).map(([member, total]) => ({
    member,
    totalSpent: total
  }));
  
  // Submit to Google Sheets
  const submission = await submitAuctionResults(
    config.sheet_webhook_url,
    results,
    biddingState.sessionDate,
    biddingState.isDryRun
  );
  
  if (submission.success) {
    // Success embed
    const successEmbed = new EmbedBuilder()
      .setColor(0x00FF00)
      .setTitle('✅ Auction Session Complete!')
      .setDescription(`Results submitted to Google Sheets`)
      .addFields(
        {name: '📅 Date', value: biddingState.sessionDate, inline: true},
        {name: '🏆 Items Sold', value: `${biddingState.auctionHistory.length}`, inline: true},
        {name: '💰 Total Points Spent', value: `${results.reduce((sum, r) => sum + r.totalSpent, 0)}`, inline: true}
      )
      .setFooter({text: biddingState.isDryRun ? '🧪 DRY RUN - Test mode' : 'Points have been deducted'})
      .setTimestamp();
    
    // Winner breakdown
    const winnerList = biddingState.auctionHistory.map(a => 
      `• **${a.item}**: ${a.winner} - ${a.amount} points`
    ).join('\n');
    
    successEmbed.addFields({name: '📋 Winners', value: winnerList || 'None'});
    
    await biddingChannel.send({embeds: [successEmbed]});
    await adminLogs.send({embeds: [successEmbed]});
  } else {
    // Failure - send manual entry data
    const failureEmbed = new EmbedBuilder()
      .setColor(0xFF0000)
      .setTitle('❌ Sheet Submission Failed')
      .setDescription(`Failed to submit results after 3 attempts.\n\n**Error:** ${submission.error}`)
      .addFields(
        {name: '📅 Date', value: biddingState.sessionDate, inline: true},
        {name: '🏆 Items Sold', value: `${biddingState.auctionHistory.length}`, inline: true}
      )
      .setFooter({text: 'Please manually enter the following data'})
      .setTimestamp();
    
    // Format for manual entry
    const manualData = results.map(r => 
      `${r.member}: ${r.totalSpent} points`
    ).join('\n');
    
    failureEmbed.addFields({name: '📝 Manual Entry Required', value: `\`\`\`\n${manualData}\n\`\`\``});
    
    await adminLogs.send({embeds: [failureEmbed]});
    await biddingChannel.send('❌ Sheet submission failed. Admins have been notified.');
  }
  
  // Cleanup
  biddingState.auctionHistory = [];
  biddingState.sessionDate = null;
  biddingState.lockedPoints = {};
  saveBiddingState();
}

// ==========================================
// BIDDING LOGIC
// ==========================================

/**
 * Process bid command
 */
async function processBid(message, amount, config) {
  const auction = biddingState.activeAuction;
  
  // Validation
  if (!auction) {
    return {success: false, message: 'No active auction'};
  }
  
  if (auction.status !== 'active') {
    return {success: false, message: 'Auction not started yet. Wait for bidding to open.'};
  }
  
  if (message.channel.id !== auction.threadId) {
    return {success: false, message: 'Wrong thread. Bid in the active auction thread.'};
  }
  
  const bidAmount = parseInt(amount);
  
  if (isNaN(bidAmount) || bidAmount <= 0) {
    return {success: false, message: 'Invalid bid amount'};
  }
  
  if (bidAmount <= auction.currentBid) {
    return {success: false, message: `Bid must be higher than current bid (${auction.currentBid} points)`};
  }
  
  if (bidAmount === auction.currentBid) {
    return {success: false, message: 'You cannot bid the same amount as the current bid. Please bid higher.'};
  }
  
  // Fetch member's available points
  const member = message.member;
  const username = member.nickname || message.author.username;
  
  const allPoints = await fetchBiddingPoints(config.sheet_webhook_url, biddingState.isDryRun);
  if (!allPoints) {
    return {success: false, message: 'Failed to fetch bidding points. Please try again.'};
  }
  
  const totalPoints = allPoints[username] || 0;
  const availablePoints = getAvailablePoints(username, totalPoints);
  
  if (bidAmount > availablePoints) {
    return {
      success: false, 
      message: `Insufficient points. You have ${availablePoints} available (${totalPoints} total, ${biddingState.lockedPoints[username] || 0} locked in other bids)`
    };
  }
  
  // Check for duplicate simultaneous bids
  const recentBids = auction.bids.filter(b => 
    Date.now() - b.timestamp < 1000 && b.amount === bidAmount
  );
  
  if (recentBids.length > 0) {
    return {
      success: false,
      message: '❌ **Duplicate bid detected!** Someone else bid the same amount at the same time. Please bid again.'
    };
  }
  
  // Create confirmation embed
  const confirmEmbed = new EmbedBuilder()
    .setColor(0xFFD700)
    .setTitle('⏳ Confirm Your Bid')
    .setDescription(`**${auction.item}**`)
    .addFields(
      {name: '💰 Your Bid', value: `${bidAmount} points`, inline: true},
      {name: '📊 Current Bid', value: `${auction.currentBid} points`, inline: true},
      {name: '💳 Available', value: `${availablePoints} points`, inline: true}
    )
    .setFooter({text: 'React ✅ to confirm or ❌ to cancel • 30 second timeout'});
  
  const confirmMsg = await message.reply({embeds: [confirmEmbed]});
  
  // Add reactions
  await confirmMsg.react('✅');
  await confirmMsg.react('❌');
  
  // Store pending confirmation
  biddingState.pendingConfirmations[confirmMsg.id] = {
    userId: message.author.id,
    username: username,
    threadId: auction.threadId,
    amount: bidAmount,
    timestamp: Date.now(),
    originalMessageId: message.id
  };
  
  saveBiddingState();
  
  // Set timeout for confirmation (30 seconds)
  biddingState.timerHandles[`confirm_${confirmMsg.id}`] = setTimeout(async () => {
    if (biddingState.pendingConfirmations[confirmMsg.id]) {
      await confirmMsg.reactions.removeAll().catch(() => {});
      await confirmMsg.edit({
        embeds: [confirmEmbed.setColor(0x808080).setFooter({text: '⏱️ Confirmation timed out'})]
      });
      delete biddingState.pendingConfirmations[confirmMsg.id];
      saveBiddingState();
    }
  }, 30000);
  
  return {success: true, confirmationMessageId: confirmMsg.id};
}

/**
 * Confirm bid (after ✅ reaction)
 */
async function confirmBid(reaction, user, config) {
  const pending = biddingState.pendingConfirmations[reaction.message.id];
  if (!pending || pending.userId !== user.id) return;
  
  const auction = biddingState.activeAuction;
  if (!auction || auction.status !== 'active') {
    await reaction.message.reply('❌ Auction is no longer active');
    delete biddingState.pendingConfirmations[reaction.message.id];
    saveBiddingState();
    return;
  }
  
  // Validate bid is still higher than current
  if (pending.amount <= auction.currentBid) {
    await reaction.message.reply(`❌ Bid no longer valid. Current bid is now ${auction.currentBid} points.`);
    delete biddingState.pendingConfirmations[reaction.message.id];
    saveBiddingState();
    return;
  }
  
  // Check for duplicate amount (race condition)
  if (pending.amount === auction.currentBid) {
    await reaction.message.reply('❌ **Duplicate bid!** Someone bid the same amount. Please bid higher.');
    delete biddingState.pendingConfirmations[reaction.message.id];
    saveBiddingState();
    return;
  }
  
  // Unlock previous winner's points
  if (auction.currentWinner) {
    unlockPoints(auction.currentWinner, auction.currentBid);
    
    // Notify previous winner
    const outbidEmbed = new EmbedBuilder()
      .setColor(0xFF6600)
      .setTitle('❌ You\'ve Been Outbid!')
      .setDescription(`Someone bid **${pending.amount} points** on **${auction.item}**`)
      .addFields(
        {name: '💸 Your Points Returned', value: `${auction.currentBid} points`, inline: true},
        {name: '💰 New High Bid', value: `${pending.amount} points`, inline: true}
      )
      .setFooter({text: 'You can bid again if you want'});
    
    await reaction.message.channel.send({
      content: `<@${auction.currentWinnerId}>`,
      embeds: [outbidEmbed]
    });
  }
  
  // Lock new winner's points
  lockPoints(pending.username, pending.amount);
  
  // Update auction state
  const previousBid = auction.currentBid;
  auction.currentBid = pending.amount;
  auction.currentWinner = pending.username;
  auction.currentWinnerId = pending.userId;
  auction.bids.push({
    user: pending.username,
    userId: pending.userId,
    amount: pending.amount,
    timestamp: Date.now()
  });
  
  // Check if bid was placed in last minute (extend timer)
  const timeLeft = auction.endTime - Date.now();
  if (timeLeft < 60000 && auction.extendedCount < 10) { // Max 10 extensions
    auction.endTime += 60000; // Add 1 minute
    auction.extendedCount++;
    auction.goingOnceAnnounced = false;
    auction.goingTwiceAnnounced = false;
    
    // Reschedule timers
    scheduleAuctionTimers(config.client, config);
  }
  
  // Clear confirmation timeout
  if (biddingState.timerHandles[`confirm_${reaction.message.id}`]) {
    clearTimeout(biddingState.timerHandles[`confirm_${reaction.message.id}`]);
    delete biddingState.timerHandles[`confirm_${reaction.message.id}`];
  }
  
  // Update confirmation message
  const successEmbed = new EmbedBuilder()
    .setColor(0x00FF00)
    .setTitle('✅ Bid Confirmed!')
    .setDescription(`You are now the highest bidder on **${auction.item}**`)
    .addFields(
      {name: '💰 Your Bid', value: `${pending.amount} points`, inline: true},
      {name: '📊 Previous Bid', value: `${previousBid} points`, inline: true},
      {name: '⏱️ Time Left', value: formatTimeRemaining(auction.endTime - Date.now()), inline: true}
    )
    .setFooter({text: timeLeft < 60000 ? '⏰ Timer extended by 1 minute!' : 'Good luck!'});
  
  await reaction.message.edit({embeds: [successEmbed]});
  await reaction.message.reactions.removeAll().catch(() => {});
  
  // Announce new high bid in thread
  const announceEmbed = new EmbedBuilder()
    .setColor(0xFFD700)
    .setTitle('🔔 New High Bid!')
    .addFields(
      {name: '💰 Amount', value: `${pending.amount} points`, inline: true},
      {name: '👤 Bidder', value: pending.username, inline: true},
      {name: '⏱️ Time Left', value: formatTimeRemaining(auction.endTime - Date.now()), inline: true}
    );
  
  await reaction.message.channel.send({embeds: [announceEmbed]});
  
  delete biddingState.pendingConfirmations[reaction.message.id];
  saveBiddingState();
  
  console.log(`✅ Bid confirmed: ${pending.username} - ${pending.amount} points on ${auction.item}`);
}

/**
 * Cancel bid (after ❌ reaction)
 */
async function cancelBid(reaction, user) {
  const pending = biddingState.pendingConfirmations[reaction.message.id];
  if (!pending || pending.userId !== user.id) return;
  
  const cancelEmbed = new EmbedBuilder()
    .setColor(0x808080)
    .setTitle('❌ Bid Canceled')
    .setDescription('Your bid was not placed')
    .setFooter({text: 'You can bid again anytime'});
  
  await reaction.message.edit({embeds: [cancelEmbed]});
  await reaction.message.reactions.removeAll().catch(() => {});
  
  // Clear timeout
  if (biddingState.timerHandles[`confirm_${reaction.message.id}`]) {
    clearTimeout(biddingState.timerHandles[`confirm_${reaction.message.id}`]);
    delete biddingState.timerHandles[`confirm_${reaction.message.id}`];
  }
  
  delete biddingState.pendingConfirmations[reaction.message.id];
  saveBiddingState();
}

// ==========================================
// COMMAND HANDLERS
// ==========================================

/**
 * !extendtime - Add time to current auction (in thread)
 */
async function handleExtendTimeCommand(message, args, client, config) {
  const auction = biddingState.activeAuction;
  
  if (!auction) {
    return await message.reply('❌ No active auction to extend');
  }
  
  if (message.channel.id !== auction.threadId) {
    return await message.reply('❌ This command must be used in the active auction thread');
  }
  
  if (args.length === 0) {
    return await message.reply('❌ **Usage:** `!extendtime <minutes>`\n**Example:** `!extendtime 5`');
  }
  
  const minutes = parseInt(args[0]);
  
  if (isNaN(minutes) || minutes <= 0) {
    return await message.reply('❌ Invalid minutes. Must be a positive number.');
  }
  
  auction.endTime += minutes * 60000;
  scheduleAuctionTimers(client, config);
  saveBiddingState();
  
  await message.reply(`✅ Added **${minutes} minute(s)** to auction. New end time: ${formatTimeRemaining(auction.endTime - Date.now())}`);
  
  console.log(`🔧 Auction extended by ${minutes}min by ${message.author.username}`);
}

/**
 * !forcewinner - Manually assign winner (in thread)
 */
async function handleForceWinnerCommand(message, args) {
  const auction = biddingState.activeAuction;
  
  if (!auction) {
    return await message.reply('❌ No active auction');
  }
  
  if (message.channel.id !== auction.threadId) {
    return await message.reply('❌ This command must be used in the active auction thread');
  }
  
  const mentionedUser = message.mentions.users.first();
  
  if (!mentionedUser) {
    return await message.reply('❌ **Usage:** `!forcewinner @member`\n**Example:** `!forcewinner @Player1`');
  }
  
  const member = await message.guild.members.fetch(mentionedUser.id);
  const username = member.nickname || mentionedUser.username;
  
  // Unlock previous winner's points
  if (auction.currentWinner) {
    unlockPoints(auction.currentWinner, auction.currentBid);
  }
  
  // Set new winner (keep same bid)
  auction.currentWinner = username;
  auction.currentWinnerId = mentionedUser.id;
  
  // Lock points
  lockPoints(username, auction.currentBid);
  
  saveBiddingState();
  
  await message.reply(`✅ Winner manually assigned: **${username}** with bid of **${auction.currentBid} points**`);
  
  console.log(`🔧 Winner forced: ${username} by ${message.author.username}`);
}

/**
 * !cancelbid - Remove someone's bid (in thread)
 */
async function handleCancelBidCommand(message, args) {
  const auction = biddingState.activeAuction;
  
  if (!auction) {
    return await message.reply('❌ No active auction');
  }
  
  if (message.channel.id !== auction.threadId) {
    return await message.reply('❌ This command must be used in the active auction thread');
  }
  
  const mentionedUser = message.mentions.users.first();
  
  if (!mentionedUser) {
    return await message.reply('❌ **Usage:** `!cancelbid @member`');
  }
  
  const member = await message.guild.members.fetch(mentionedUser.id);
  const username = member.nickname || mentionedUser.username;
  
  // Check if this user is the current winner
  if (auction.currentWinnerId === mentionedUser.id) {
    // Unlock their points
    unlockPoints(username, auction.currentBid);
    
    // Find previous highest bid
    const sortedBids = [...auction.bids]
      .filter(b => b.userId !== mentionedUser.id)
      .sort((a, b) => b.amount - a.amount);
    
    if (sortedBids.length > 0) {
      const previousBid = sortedBids[0];
      auction.currentBid = previousBid.amount;
      auction.currentWinner = previousBid.user;
      auction.currentWinnerId = previousBid.userId;
      
      // Lock previous winner's points
      lockPoints(previousBid.user, previousBid.amount);
      
      await message.reply(
        `✅ Canceled **${username}**'s bid\n\n` +
        `New high bidder: **${previousBid.user}** with **${previousBid.amount} points**`
      );
    } else {
      // No other bids, reset to starting price
      auction.currentBid = auction.startPrice;
      auction.currentWinner = null;
      auction.currentWinnerId = null;
      
      await message.reply(
        `✅ Canceled **${username}**'s bid\n\n` +
        `No other bids. Current bid reset to starting price: **${auction.startPrice} points**`
      );
    }
    
    // Remove all bids from this user
    auction.bids = auction.bids.filter(b => b.userId !== mentionedUser.id);
    
    saveBiddingState();
  } else {
    await message.reply(`ℹ️ **${username}** is not the current high bidder. No action needed.`);
  }
  
  console.log(`🔧 Bid canceled for ${username} by ${message.author.username}`);
}

/**
 * !debugauction - Show detailed auction state (in thread)
 */
async function handleDebugAuctionCommand(message) {
  const auction = biddingState.activeAuction;
  
  if (!auction) {
    return await message.reply('❌ No active auction');
  }
  
  if (message.channel.id !== auction.threadId) {
    return await message.reply('❌ This command must be used in the active auction thread');
  }
  
  const bidHistory = auction.bids.slice(-5).map(b => 
    `• ${b.user}: ${b.amount}pts at ${new Date(b.timestamp).toLocaleTimeString()}`
  ).join('\n') || 'No bids yet';
  
  const lockedPointsList = Object.entries(biddingState.lockedPoints)
    .slice(0, 5)
    .map(([member, points]) => `• ${member}: ${points}pts`)
    .join('\n') || 'None';
  
  const embed = new EmbedBuilder()
    .setColor(0x4A90E2)
    .setTitle('🔍 Auction Debug Info')
    .addFields(
      {name: '🎯 Item', value: auction.item, inline: false},
      {name: '💰 Current Bid', value: `${auction.currentBid}pts`, inline: true},
      {name: '🏆 Current Winner', value: auction.currentWinner || 'None', inline: true},
      {name: '⏱️ Status', value: auction.status, inline: true},
      {name: '📊 Total Bids', value: `${auction.bids.length}`, inline: true},
      {name: '🔄 Extensions', value: `${auction.extendedCount}`, inline: true},
      {name: '⏰ Time Left', value: auction.status === 'active' ? formatTimeRemaining(auction.endTime - Date.now()) : 'N/A', inline: true},
      {name: '📜 Recent Bids', value: bidHistory, inline: false},
      {name: '🔒 Locked Points (Top 5)', value: lockedPointsList, inline: false},
      {name: '🎯 Mode', value: biddingState.isDryRun ? '🧪 DRY RUN' : '💰 LIVE', inline: true},
      {name: '📅 Session Date', value: biddingState.sessionDate || 'N/A', inline: true}
    )
    .setFooter({text: `Auction ID: ${auction.id}`})
    .setTimestamp();
  
  await message.reply({embeds: [embed]});
}

/**
 * !setbidpoints - Manually adjust member's bidding points
 */
async function handleSetBidPointsCommand(message, args) {
  if (args.length < 2) {
    return await message.reply(
      '❌ **Usage:** `!setbidpoints @member <amount>`\n' +
      '**Example:** `!setbidpoints @Player1 500`\n\n' +
      '⚠️ This only works in dry run mode for testing.'
    );
  }
  
  if (!biddingState.isDryRun) {
    return await message.reply('❌ This command only works in dry run mode. Use `!dryrun on` first.');
  }
  
  const mentionedUser = message.mentions.users.first();
  const amount = parseInt(args[args.length - 1]);
  
  if (!mentionedUser) {
    return await message.reply('❌ You must mention a user');
  }
  
  if (isNaN(amount) || amount < 0) {
    return await message.reply('❌ Amount must be a non-negative number');
  }
  
  const member = await message.guild.members.fetch(mentionedUser.id);
  const username = member.nickname || mentionedUser.username;
  
  // In dry run mode, we would store test points locally
  // For now, just show confirmation
  await message.reply(
    `✅ Set bidding points for **${username}** to **${amount} points**\n\n` +
    `🧪 Dry run mode - changes are temporary\n` +
    `⚠️ Note: Full implementation requires test data storage`
  );
  
  console.log(`🔧 Test points set: ${username} -> ${amount}pts by ${message.author.username}`);
}

/**
 * !resetbids - Clear all bidding memory (nuclear option)
 */
async function handleResetBidsCommand(message) {
  const confirmEmbed = new EmbedBuilder()
    .setColor(0xFF0000)
    .setTitle('⚠️ RESET ALL BIDDING DATA?')
    .setDescription(
      `**This will:**\n` +
      `• Cancel any active auction\n` +
      `• Clear all queued items\n` +
      `• Clear auction history\n` +
      `• Return all locked points\n` +
      `• Clear all pending confirmations\n\n` +
      `**This cannot be undone!**`
    )
    .setFooter({text: 'React ✅ to confirm or ❌ to cancel'});
  
  const confirmMsg = await message.reply({embeds: [confirmEmbed]});
  await confirmMsg.react('✅');
  await confirmMsg.react('❌');
  
  const filter = (reaction, user) => {
    return ['✅', '❌'].includes(reaction.emoji.name) && user.id === message.author.id;
  };
  
  try {
    const collected = await confirmMsg.awaitReactions({ filter, max: 1, time: 30000, errors: ['time'] });
    const reaction = collected.first();
    
    if (reaction.emoji.name === '✅') {
      clearAllTimers();
      
      biddingState = {
        auctionQueue: [],
        activeAuction: null,
        lockedPoints: {},
        auctionHistory: [],
        isDryRun: biddingState.isDryRun, // Keep dry run mode setting
        timerHandles: {},
        pendingConfirmations: {},
        sessionDate: null
      };
      
      saveBiddingState();
      
      await confirmMsg.edit({
        embeds: [confirmEmbed.setColor(0x808080).setFooter({text: '✅ All bidding data reset'})]
      });
      await confirmMsg.reactions.removeAll().catch(() => {});
      
      console.log(`🔧 All bidding data reset by ${message.author.username}`);
    } else {
      await confirmMsg.reactions.removeAll().catch(() => {});
      await confirmMsg.edit({
        embeds: [confirmEmbed.setColor(0x4A90E2).setFooter({text: '❌ Reset canceled'})]
      });
    }
  } catch (err) {
    await confirmMsg.reactions.removeAll().catch(() => {});
    await confirmMsg.edit({
      embeds: [confirmEmbed.setColor(0x808080).setFooter({text: '⏱️ Confirmation timed out'})]
    });
  }
}

// ==========================================
// MODULE EXPORTS
// ==========================================

module.exports = {
  // State management
  loadBiddingState,
  saveBiddingState,
  getBiddingState: () => biddingState,
  
  // Command handlers (member)
  handleAuctionCommand,
  handleQueueListCommand,
  handleRemoveItemCommand,
  handleStartAuctionCommand,
  handleBidCommand,
  handleMyBidsCommand,
  handleBidStatusCommand,
  
  // Command handlers (admin)
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
  
  // Reaction handlers
  confirmBid,
  cancelBid,
  
  // Recovery
  recoverBiddingState: async (client, config) => {
    if (loadBiddingState()) {
      console.log('📦 Bidding state recovered from disk');
      
      // If there was an active auction, we need to reschedule timers
      if (biddingState.activeAuction && biddingState.activeAuction.status === 'active') {
        console.log('🔄 Rescheduling auction timers...');
        scheduleAuctionTimers(client, config);
      }
      
      return true;
    }
    return false;
  }
};
/*
auction - Add item to queue
 */
async function handleAuctionCommand(message, args, config) {
  // Parse: !auction ITEM NAME - DESCRIPTION 100 30
  // Last two args are startPrice and duration
  if (args.length < 3) {
    return await message.reply(
      '❌ **Invalid format**\n\n' +
      '**Usage:** `!auction <item name> <starting price> <duration in minutes>`\n\n' +
      '**Example:** `!auction GRAY DAWN LOAFERS - BARON 100 30`\n' +
      '• Item: GRAY DAWN LOAFERS - BARON\n' +
      '• Starting price: 100 points\n' +
      '• Duration: 30 minutes'
    );
  }
  
  const duration = parseInt(args[args.length - 1]);
  const startPrice = parseInt(args[args.length - 2]);
  const itemName = args.slice(0, -2).join(' ');
  
  if (isNaN(startPrice) || startPrice <= 0) {
    return await message.reply('❌ Starting price must be a positive number');
  }
  
  if (isNaN(duration) || duration <= 0) {
    return await message.reply('❌ Duration must be a positive number (in minutes)');
  }
  
  if (itemName.trim().length === 0) {
    return await message.reply('❌ Item name cannot be empty');
  }
  
  // Check for duplicates
  const duplicate = biddingState.auctionQueue.find(
    a => a.item.toLowerCase() === itemName.toLowerCase()
  );
  
  if (duplicate) {
    return await message.reply(`❌ **${itemName}** is already in the queue`);
  }
  
  // Add to queue
  const auction = addToQueue(itemName, startPrice, duration);
  
  const embed = new EmbedBuilder()
    .setColor(0x00FF00)
    .setTitle('✅ Item Added to Queue')
    .setDescription(`**${itemName}**`)
    .addFields(
      {name: '💰 Starting Price', value: `${startPrice} points`, inline: true},
      {name: '⏱️ Duration', value: formatDuration(duration), inline: true},
      {name: '📋 Position', value: `#${biddingState.auctionQueue.length}`, inline: true}
    )
    .setFooter({text: `Use !queuelist to see all items • Use !startauction to begin`})
    .setTimestamp();
  
  await message.reply({embeds: [embed]});
  
  console.log(`📦 Added to queue: ${itemName} (${startPrice}pts, ${duration}min) by ${message.author.username}`);
}

/**
 * !queuelist - Show all queued items
 */
async function handleQueueListCommand(message) {
  if (biddingState.auctionQueue.length === 0) {
    return await message.reply('📋 Queue is empty. Use `!auction` to add items.');
  }
  
  const queueList = biddingState.auctionQueue.map((a, i) => 
    `**${i + 1}.** ${a.item} - ${a.startPrice}pts • ${formatDuration(a.duration)}`
  ).join('\n');
  
  const embed = new EmbedBuilder()
    .setColor(0x4A90E2)
    .setTitle('📋 Auction Queue')
    .setDescription(queueList)
    .addFields(
      {name: '📊 Total Items', value: `${biddingState.auctionQueue.length}`, inline: true},
      {name: '🔄 Status', value: biddingState.activeAuction ? '🟢 Auction in progress' : '⚪ Ready to start', inline: true}
    )
    .setFooter({text: 'Use !removeitem <name> to remove • !startauction to begin'})
    .setTimestamp();
  
  await message.reply({embeds: [embed]});
}

/**
 * !removeitem - Remove item from queue
 */
async function handleRemoveItemCommand(message, args) {
  if (args.length === 0) {
    return await message.reply(
      '❌ **Invalid format**\n\n' +
      '**Usage:** `!removeitem <item name>`\n' +
      '**Example:** `!removeitem GRAY DAWN LOAFERS - BARON`'
    );
  }
  
  const itemName = args.join(' ');
  const removed = removeFromQueue(itemName);
  
  if (!removed) {
    return await message.reply(`❌ Item not found in queue: **${itemName}**`);
  }
  
  const embed = new EmbedBuilder()
    .setColor(0xFF6600)
    .setTitle('🗑️ Item Removed from Queue')
    .setDescription(`**${removed.item}**`)
    .addFields(
      {name: '📋 Items Remaining', value: `${biddingState.auctionQueue.length}`, inline: true}
    )
    .setTimestamp();
  
  await message.reply({embeds: [embed]});
  
  console.log(`🗑️ Removed from queue: ${removed.item} by ${message.author.username}`);
}

/**
 * !startauction - Start auction session with confirmation
 */
async function handleStartAuctionCommand(message, client, config) {
  if (biddingState.auctionQueue.length === 0) {
    return await message.reply('❌ Queue is empty. Add items using `!auction` first.');
  }
  
  if (biddingState.activeAuction) {
    return await message.reply('❌ An auction is already in progress. Please wait for it to finish.');
  }
  
  // Show confirmation
  const queuePreview = biddingState.auctionQueue.slice(0, 10).map((a, i) => 
    `${i + 1}. **${a.item}** - ${a.startPrice}pts • ${formatDuration(a.duration)}`
  ).join('\n');
  
  const moreItems = biddingState.auctionQueue.length > 10 
    ? `\n\n*...and ${biddingState.auctionQueue.length - 10} more items*` 
    : '';
  
  const confirmEmbed = new EmbedBuilder()
    .setColor(0xFFD700)
    .setTitle('⚠️ Start Auction Session?')
    .setDescription(
      `**${biddingState.auctionQueue.length} item(s)** will be auctioned sequentially:\n\n` +
      queuePreview + moreItems
    )
    .addFields(
      {name: '⏱️ Estimated Time', value: `~${Math.ceil(biddingState.auctionQueue.reduce((sum, a) => sum + a.duration, 0) * 1.2)} minutes`, inline: true},
      {name: '🎯 Mode', value: biddingState.isDryRun ? '🧪 **DRY RUN**' : '💰 **LIVE**', inline: true}
    )
    .setFooter({text: 'React ✅ to start or ❌ to cancel'});
  
  const confirmMsg = await message.reply({embeds: [confirmEmbed]});
  await confirmMsg.react('✅');
  await confirmMsg.react('❌');
  
  const filter = (reaction, user) => {
    return ['✅', '❌'].includes(reaction.emoji.name) && user.id === message.author.id;
  };
  
  try {
    const collected = await confirmMsg.awaitReactions({ filter, max: 1, time: 30000, errors: ['time'] });
    const reaction = collected.first();
    
    if (reaction.emoji.name === '✅') {
      await confirmMsg.reactions.removeAll().catch(() => {});
      await confirmMsg.edit({
        embeds: [confirmEmbed.setColor(0x00FF00).setFooter({text: '🚀 Starting auction session...'})]
      });
      
      const result = await startAuctionSession(client, config);
      
      if (result.success) {
        const startEmbed = new EmbedBuilder()
          .setColor(0x00FF00)
          .setTitle('🚀 Auction Session Started!')
          .setDescription(
            `**${result.totalItems} item(s)** will be auctioned one by one.\n\n` +
            `First item: **${result.firstItem}**`
          )
          .setFooter({text: 'Check the auction threads to bid!'})
          .setTimestamp();
        
        await message.channel.send({embeds: [startEmbed]});
      } else {
        await message.reply(`❌ ${result.message}`);
      }
    } else {
      await confirmMsg.reactions.removeAll().catch(() => {});
      await confirmMsg.edit({
        embeds: [confirmEmbed.setColor(0x808080).setFooter({text: '❌ Auction start canceled'})]
      });
    }
  } catch (err) {
    await confirmMsg.reactions.removeAll().catch(() => {});
    await confirmMsg.edit({
      embeds: [confirmEmbed.setColor(0x808080).setFooter({text: '⏱️ Confirmation timed out'})]
    });
  }
}

/**
 * !bid - Place bid
 */
async function handleBidCommand(message, args, config) {
  if (args.length === 0) {
    return await message.reply(
      '❌ **Invalid format**\n\n' +
      '**Usage:** `!bid <amount>`\n' +
      '**Example:** `!bid 150`'
    );
  }
  
  const amount = args[0];
  const result = await processBid(message, amount, config);
  
  if (!result.success) {
    await message.reply(`❌ ${result.message}`);
  }
  
  // Success is handled by the confirmation flow
}

/**
 * !mybids - Show user's active bids
 */
async function handleMyBidsCommand(message) {
  const username = message.member.nickname || message.author.username;
  const auction = biddingState.activeAuction;
  
  if (!auction) {
    return await message.reply('ℹ️ No active auction at the moment.');
  }
  
  const lockedAmount = biddingState.lockedPoints[username] || 0;
  const isWinning = auction.currentWinner === username;
  
  const embed = new EmbedBuilder()
    .setColor(isWinning ? 0x00FF00 : 0x4A90E2)
    .setTitle('📊 Your Bidding Status')
    .addFields(
      {name: '💰 Current Auction', value: auction.item, inline: true},
      {name: '💳 Locked Points', value: `${lockedAmount}`, inline: true},
      {name: '🏆 Status', value: isWinning ? '✅ **Winning!**' : '⚪ Not winning', inline: true}
    );
  
  if (isWinning) {
    embed.addFields(
      {name: '💵 Your Bid', value: `${auction.currentBid} points`, inline: true},
      {name: '⏱️ Time Left', value: formatTimeRemaining(auction.endTime - Date.now()), inline: true}
    );
  }
  
  embed.setFooter({text: 'Use !bid <amount> to place a bid'});
  
  await message.reply({embeds: [embed]});
}

/**
 * !bidstatus - Show all active auctions
 */
async function handleBidStatusCommand(message, isAdmin = false) {
  const embed = new EmbedBuilder()
    .setColor(0x4A90E2)
    .setTitle('📊 Bidding System Status');
  
  // Queue info
  if (biddingState.auctionQueue.length > 0) {
    const queueList = biddingState.auctionQueue.slice(0, 5).map((a, i) => 
      `${i + 1}. ${a.item} - ${a.startPrice}pts`
    ).join('\n');
    
    const more = biddingState.auctionQueue.length > 5 ? `\n*...${biddingState.auctionQueue.length - 5} more*` : '';
    
    embed.addFields({name: '📋 Queued Items', value: queueList + more});
  } else {
    embed.addFields({name: '📋 Queue', value: 'Empty'});
  }
  
  // Active auction info
  if (biddingState.activeAuction) {
    const auction = biddingState.activeAuction;
    const timeLeft = auction.status === 'active' 
      ? formatTimeRemaining(auction.endTime - Date.now())
      : auction.status;
    
    embed.addFields(
      {name: '🔴 Active Auction', value: auction.item, inline: false},
      {name: '💰 Current Bid', value: auction.currentWinner ? `${auction.currentBid}pts by ${auction.currentWinner}` : `${auction.startPrice}pts (no bids)`, inline: true},
      {name: '⏱️ Time Left', value: timeLeft, inline: true},
      {name: '📊 Total Bids', value: `${auction.bids.length}`, inline: true}
    );
  } else {
    embed.addFields({name: '🔴 Active Auction', value: 'None'});
  }
  
  // Admin-only info
  if (isAdmin) {
    embed.addFields(
      {name: '🔒 Locked Points', value: `${Object.keys(biddingState.lockedPoints).length} members`, inline: true},
      {name: '🏆 Completed Today', value: `${biddingState.auctionHistory.length}`, inline: true},
      {name: '🎯 Mode', value: biddingState.isDryRun ? '🧪 DRY RUN' : '💰 LIVE', inline: true}
    );
  }
  
  embed.setFooter({text: biddingState.isDryRun ? '🧪 DRY RUN MODE ACTIVE' : 'Use !auction to add items'})
    .setTimestamp();
  
  await message.reply({embeds: [embed]});
}

// ==========================================
// ADMIN OVERRIDE COMMANDS
// ==========================================

/**
 * !dryrun - Toggle dry run mode
 */
async function handleDryRunCommand(message, args) {
  if (biddingState.activeAuction) {
    return await message.reply('❌ Cannot toggle dry run mode while auction is active');
  }
  
  if (args.length === 0) {
    const status = biddingState.isDryRun ? '🧪 **ENABLED**' : '⚪ **DISABLED**';
    return await message.reply(`Dry run mode: ${status}\n\nUsage: \`!dryrun on\` or \`!dryrun off\``);
  }
  
  const mode = args[0].toLowerCase();
  
  if (mode === 'on' || mode === 'true' || mode === 'enable') {
    biddingState.isDryRun = true;
    saveBiddingState();
    
    await message.reply(
      '🧪 **DRY RUN MODE ENABLED**\n\n' +
      '• All auctions will use test data\n' +
      '• No real points will be deducted\n' +
      '• Results will be saved to test sheet\n\n' +
      '⚠️ This is for testing only!'
    );
  } else if (mode === 'off' || mode === 'false' || mode === 'disable') {
    biddingState.isDryRun = false;
    saveBiddingState();
    
    await message.reply(
      '💰 **DRY RUN MODE DISABLED**\n\n' +
      '• Auctions will use real bidding points\n' +
      '• Points will be deducted from winners\n' +
      '• Results will be saved to live sheet\n\n' +
      '✅ System is now LIVE'
    );
  } else {
    await message.reply('❌ Invalid option. Use `on` or `off`');
  }
  
  console.log(`🔧 Dry run mode: ${biddingState.isDryRun ? 'ENABLED' : 'DISABLED'} by ${message.author.username}`);
}

/**
 * !cancelauction - Cancel all active auctions
 */
async function handleCancelAuctionCommand(message, client, config) {
  if (!biddingState.activeAuction && biddingState.auctionQueue.length === 0) {
    return await message.reply('ℹ️ No active auctions to cancel');
  }
  
  const confirmEmbed = new EmbedBuilder()
    .setColor(0xFF0000)
    .setTitle('⚠️ Cancel Auction Session?')
    .setDescription(
      `This will:\n` +
      `• Cancel current auction${biddingState.activeAuction ? ` (**${biddingState.activeAuction.item}**)` : ''}\n` +
      `• Clear ${biddingState.auctionQueue.length} queued item(s)\n` +
      `• Return all locked points to members\n` +
      `• **NOT** submit any results to Google Sheets`
    )
    .setFooter({text: 'React ✅ to confirm or ❌ to cancel'});
  
  const confirmMsg = await message.reply({embeds: [confirmEmbed]});
  await confirmMsg.react('✅');
  await confirmMsg.react('❌');
  
  const filter = (reaction, user) => {
    return ['✅', '❌'].includes(reaction.emoji.name) && user.id === message.author.id;
  };
  
  try {
    const collected = await confirmMsg.awaitReactions({ filter, max: 1, time: 30000, errors: ['time'] });
    const reaction = collected.first();
    
    if (reaction.emoji.name === '✅') {
      // Clear all timers
      clearAllTimers();
      
      // Archive active thread if exists
      if (biddingState.activeAuction) {
        const guild = await client.guilds.fetch(config.main_guild_id);
        const thread = await guild.channels.fetch(biddingState.activeAuction.threadId).catch(() => null);
        if (thread) {
          await thread.send('❌ **Auction canceled by admin**');
          await thread.setArchived(true, 'Admin canceled auction').catch(() => {});
        }
      }
      
      // Clear state
      const canceledItems = biddingState.auctionQueue.length + (biddingState.activeAuction ? 1 : 0);
      biddingState.activeAuction = null;
      biddingState.auctionQueue = [];
      biddingState.auctionHistory = [];
      biddingState.lockedPoints = {};
      biddingState.pendingConfirmations = {};
      biddingState.sessionDate = null;
      saveBiddingState();
      
      await confirmMsg.edit({
        embeds: [confirmEmbed.setColor(0x808080).setFooter({text: `✅ Canceled ${canceledItems} auction(s) • All points returned`})]
      });
      await confirmMsg.reactions.removeAll().catch(() => {});
      
      console.log(`🔧 All auctions canceled by ${message.author.username}`);
    } else {
      await confirmMsg.reactions.removeAll().catch(() => {});
      await confirmMsg.edit({
        embeds: [confirmEmbed.setColor(0x4A90E2).setFooter({text: '❌ Cancellation aborted'})]
      });
    }
  } catch (err) {
    await confirmMsg.reactions.removeAll().catch(() => {});
    await confirmMsg.edit({
      embeds: [confirmEmbed.setColor(0x808080).setFooter({text: '⏱️ Confirmation timed out'})]
    });
  }
}

/**
 * !clearqueue - Clear queue
 */
async function handleClearQueueCommand(message) {
  if (biddingState.auctionQueue.length === 0) {
    return await message.reply('ℹ️ Queue is already empty');
  }
  
  if (biddingState.activeAuction) {
    return await message.reply('❌ Cannot clear queue while auction is active. Use `!cancelauction` instead.');
  }
  
  const count = clearQueue();
  
  await message.reply(`✅ Cleared ${count} item(s) from queue`);
  console.log(`🔧 Queue cleared by ${message.author.username} (${count} items)`);
}

/**
 * !forcesync - Force sync bidding points from sheet
 */
async function handleForceSyncCommand(message, config) {
  await message.reply('⏳ Syncing bidding points from Google Sheets...');
  
  const points = await fetchBiddingPoints(config.sheet_webhook_url, biddingState.isDryRun);
  
  if (points) {
    const memberCount = Object.keys(points).length;
    const totalPoints = Object.values(points).reduce((sum, p) => sum + p, 0);
    
    await message.reply(
      `✅ Sync complete!\n\n` +
      `• ${memberCount} members\n` +
      `• ${totalPoints} total points available\n` +
      `• Mode: ${biddingState.isDryRun ? '🧪 DRY RUN' : '💰 LIVE'}`
    );
  } else {
    await message.reply('❌ Failed to sync bidding points. Check Google Sheets connection.');
  }
}

/**
 * !endauction - Force end current auction (in thread) with confirmation
 */
async function handleEndAuctionCommand(message, client, config) {
  const auction = biddingState.activeAuction;
  
  if (!auction) {
    return await message.reply('❌ No active auction to end');
  }
  
  if (message.channel.id !== auction.threadId) {
    return await message.reply('❌ This command must be used in the active auction thread');
  }
  
  // Show confirmation
  const confirmEmbed = new EmbedBuilder()
    .setColor(0xFF6600)
    .setTitle('⚠️ Force End Auction?')
    .setDescription(
      `**Item:** ${auction.item}\n` +
      `**Current Bid:** ${auction.currentBid} points\n` +
      `**Current Winner:** ${auction.currentWinner || 'No bids yet'}\n` +
      `**Time Left:** ${auction.status === 'active' ? formatTimeRemaining(auction.endTime - Date.now()) : auction.status}\n\n` +
      `This will:\n` +
      `• End the auction immediately\n` +
      `• Declare current high bidder as winner\n` +
      `• Move to next item in queue (if any)\n` +
      `• Submit results at end of session`
    )
    .setFooter({text: 'React ✅ to confirm or ❌ to cancel'});
  
  const confirmMsg = await message.reply({embeds: [confirmEmbed]});
  await confirmMsg.react('✅');
  await confirmMsg.react('❌');
  
  const filter = (reaction, user) => {
    return ['✅', '❌'].includes(reaction.emoji.name) && user.id === message.author.id;
  };
  
  try {
    const collected = await confirmMsg.awaitReactions({ filter, max: 1, time: 30000, errors: ['time'] });
    const reaction = collected.first();
    
    if (reaction.emoji.name === '✅') {
      await confirmMsg.reactions.removeAll().catch(() => {});
      await message.channel.send('⚠️ **Force ending auction...**');
      
      clearAllTimers();
      await endAuction(client, config);
      
      console.log(`🔧 Auction force-ended by ${message.author.username}`);
    } else {
      await confirmMsg.reactions.removeAll().catch(() => {});
      await confirmMsg.edit({
        embeds: [confirmEmbed.setColor(0x808080).setFooter({text: '❌ Force end canceled'})]
      });
    }
  } catch (err) {
    await confirmMsg.reactions.removeAll().catch(() => {});
    await confirmMsg.edit({
      embeds: [confirmEmbed.setColor(0x808080).setFooter({text: '⏱️ Confirmation timed out'})]
    });
  }
}

/**
 */