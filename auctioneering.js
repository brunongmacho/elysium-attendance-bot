/**
 * ELYSIUM Auctioneering System v2.1 - FIXED
 * Single-session management with state persistence
 * Critical fixes: Auto-save state, bid routing, confirmation handling
 */

const { EmbedBuilder } = require("discord.js");
const fetch = require("node-fetch");

// ==========================================
// POSTTOSHEET INITIALIZATION
// ==========================================
let postToSheetFunc = null;

function setPostToSheet(fn) {
  postToSheetFunc = fn;
  console.log(`${EMOJI.SUCCESS} postToSheet function initialized`);
}

function getPostToSheet() {
  if (!postToSheetFunc) {
    throw new Error('❌ CRITICAL: postToSheet not initialized. Call setPostToSheet() first.');
  }
  return postToSheetFunc;
}

// STATE
let auctionState = {
  active: false,
  currentItem: null,
  itemQueue: [],
  sessionItems: [],
  currentItemIndex: 0,
  timers: {},
  paused: false,
  pausedTime: null,
};

let isAdmFunc = null;
let cfg = null;
let biddingModule = null;
let sessionStartTime = null;
let sessionNumber = 1;
let sessionTimestamp = null;
let sessionStartDateTime = null;
let manualItemsAuctioned = [];

// CONSTANTS
const ITEM_WAIT = 20000;
const COLORS = {
  SUCCESS: 0x00ff00,
  WARNING: 0xffa500,
  ERROR: 0xff0000,
  INFO: 0x4a90e2,
  AUCTION: 0xffd700,
};

const EMOJI = {
  SUCCESS: '✅',
  ERROR: '❌',
  WARNING: '⚠️',
  INFO: 'ℹ️',
  AUCTION: '🔨',
  BID: '💰',
  TIME: '⏱️',
  CLOCK: '🕐',
  LIST: '📋',
  PAUSE: '⏸️',
  PLAY: '▶️',
  FIRE: '🔥',
  STOP: '⏹️',
  TROPHY: '🏆',
  CHART: '📊',
  LOCK: '🔒',
};

function initialize(config, isAdminFunc, biddingModuleRef) {
  cfg = config;
  isAdmFunc = isAdminFunc;
  biddingModule = biddingModuleRef;
  console.log(`${EMOJI.SUCCESS} Auctioneering system initialized`);
}

function getTimestamp() {
  const d = new Date();
  const manilaTime = new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Manila' }));
  return `${String(manilaTime.getMonth() + 1).padStart(2, "0")}/${String(manilaTime.getDate()).padStart(2, "0")}/${manilaTime.getFullYear()} ${String(manilaTime.getHours()).padStart(2, "0")}:${String(manilaTime.getMinutes()).padStart(2, "0")}`;
}

function fmtTime(ms) {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60), sec = s % 60;
  if (m < 60) return sec > 0 ? `${m}m ${sec}s` : `${m}m`;
  const h = Math.floor(m / 60);
  return m % 60 > 0 ? `${h}h ${m % 60}m` : `${h}h`;
}

async function fetchSheetItems(url) {
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "getBiddingItems" }),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    return data.items || [];
  } catch (e) {
    console.error(`${EMOJI.ERROR} Fetch items:`, e);
    return null;
  }
}

async function logAuctionResult(url, itemIndex, winner, winningBid, totalBids, bidCount, itemSource, timestamp) {
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "logAuctionResult",
        itemIndex,
        winner,
        winningBid,
        totalBids,
        bidCount,
        itemSource,
        timestamp,
      }),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    console.log(`${EMOJI.SUCCESS} Result logged: ${winner || 'No winner'} - ${winningBid}pts`);
    return true;
  } catch (e) {
    console.error(`${EMOJI.ERROR} Log result:`, e);
    return false;
  }
}

async function saveAuctionState(url) {
  try {
    const stateToSave = {
      auctionState: {
        active: auctionState.active,
        currentItem: auctionState.currentItem,
        itemQueue: auctionState.itemQueue,
        sessionItems: auctionState.sessionItems,
        currentItemIndex: auctionState.currentItemIndex,
        paused: auctionState.paused,
      },
      timestamp: getTimestamp(),
    };

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "saveBotState",
        state: stateToSave,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    console.log(`${EMOJI.SUCCESS} Auction state saved`);
    return true;
  } catch (e) {
    console.error(`${EMOJI.ERROR} Save auction state:`, e);
    return false;
  }
}

async function startAuctioneering(client, config, channel) {
  if (auctionState.active) {
    await channel.send(`${EMOJI.ERROR} Auction already running`);
    return;
  }

  // LOAD POINTS ONCE AT START
  const pointsFetched = await biddingModule.loadPointsCacheForAuction(config.sheet_webhook_url);
  if (!pointsFetched) {
    await channel.send(`${EMOJI.ERROR} Failed to load points from sheet`);
    return;
  }

  const sheetItems = await fetchSheetItems(config.sheet_webhook_url);
  if (!sheetItems) {
    await channel.send(`${EMOJI.ERROR} Failed to load items from sheet`);
    return;
  }

  const biddingState = biddingModule.getBiddingState();
  const queueItems = biddingState.q || [];

  auctionState.itemQueue = [];
  auctionState.sessionItems = [];
  manualItemsAuctioned = [];

  // GET SESSION INFO
  sessionStartDateTime = getCurrentTimestamp();
  sessionTimestamp = `${sessionStartDateTime.date} ${sessionStartDateTime.time}`;
  sessionStartTime = Date.now();

  // SHEET ITEMS FIRST (only those WITHOUT winners)
  sheetItems.forEach((item, idx) => {
    auctionState.itemQueue.push({
      ...item,
      source: 'GoogleSheet',
      sheetIndex: idx,
      auctionStartTime: sessionTimestamp,
    });
  });

  // THEN MANUAL QUEUE - Handle batch items (qty > 1)
  queueItems.forEach((item) => {
    const qty = item.quantity || 1;
    
    if (qty > 1) {
      // Create separate items for each (like Google Sheet batch items)
      for (let q = 0; q < qty; q++) {
        auctionState.itemQueue.push({
          ...item,
          quantity: 1,
          batchNumber: q + 1,
          batchTotal: qty,
          source: 'QueueList',
          auctionStartTime: sessionTimestamp,
        });
      }
    } else {
      // Single item (qty = 1)
      auctionState.itemQueue.push({
        ...item,
        source: 'QueueList',
        auctionStartTime: sessionTimestamp,
      });
    }
  });

  if (auctionState.itemQueue.length === 0) {
    await channel.send(`${EMOJI.ERROR} No items to auction. Add via \`!auction\` or Google Sheet.\n\n**Usage:**\n\`!auction <item> <price> <duration>\``);
    return;
  }

  auctionState.active = true;
  auctionState.currentItemIndex = 0;
  auctionState.sessionItems = [];

  const sheetCount = sheetItems.length;
  const queueCount = queueItems.length;

  await channel.send({
    embeds: [
      new EmbedBuilder()
        .setColor(COLORS.AUCTION)
        .setTitle(`${EMOJI.FIRE} Auctioneering Session Started!`)
        .setDescription(`**${auctionState.itemQueue.length} item(s)** queued`)
        .addFields(
          { name: `${EMOJI.LIST} From Google Sheet`, value: `${sheetCount}`, inline: true },
          { name: `${EMOJI.LIST} From Queue`, value: `${queueCount}`, inline: true },
          { name: `${EMOJI.CLOCK} Session Time`, value: sessionTimestamp, inline: true }
        )
        .setFooter({ text: `Starting first item in 20 seconds...` })
        .setTimestamp(),
    ],
  });

  auctionState.timers.sessionStart = setTimeout(async () => {
    await auctionNextItem(client, config, channel);
  }, 20000);
}

function getCurrentTimestamp() {
  const d = new Date();
  const manilaTime = new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Manila' }));
  
  const month = String(manilaTime.getMonth() + 1).padStart(2, '0');
  const day = String(manilaTime.getDate()).padStart(2, '0');
  const year = String(manilaTime.getFullYear()).slice(-2);
  const hours = String(manilaTime.getHours()).padStart(2, '0');
  const mins = String(manilaTime.getMinutes()).padStart(2, '0');
  
  return {
    date: `${month}/${day}/${year}`,
    time: `${hours}:${mins}`,
    full: `${month}/${day}/${year} ${hours}:${mins}`
  };
}

async function auctionNextItem(client, config, channel) {
  if (!auctionState.active || auctionState.currentItemIndex >= auctionState.itemQueue.length) {
    await finalizeSession(client, config, channel);
    return;
  }

  const item = auctionState.itemQueue[auctionState.currentItemIndex];
  auctionState.currentItem = {
    ...item,
    bids: [],
    curBid: item.startPrice,
    curWin: null,
    curWinId: null,
    endTime: Date.now() + item.duration * 60000,
    go1: false,
    go2: false,
    extCnt: 0,
    status: 'active',
    auctionEndTime: null,
  };

  const isBatch = item.quantity > 1;
  
  // Format item name for display
  let displayName = item.item;
  if (item.batchNumber && item.batchTotal) {
    displayName += ` [${item.batchNumber}/${item.batchTotal}]`;
  }
  
  const embed = new EmbedBuilder()
    .setColor(COLORS.SUCCESS)
    .setTitle(`${EMOJI.FIRE} BIDDING NOW!`)
    .setDescription(`**${displayName}**${isBatch && !item.batchNumber ? ` x${item.quantity}` : ''}\n\nType \`!bid <amount>\` or \`!b <amount>\` to bid`)
    .addFields(
      { name: `${EMOJI.BID} Starting Bid`, value: `${item.startPrice}pts`, inline: true },
      { name: `${EMOJI.TIME} Duration`, value: `${item.duration}m`, inline: true },
      { name: `${EMOJI.LIST} Item #`, value: `${auctionState.currentItemIndex + 1}/${auctionState.itemQueue.length}`, inline: true },
      { name: `${EMOJI.INFO} Source`, value: item.source === 'GoogleSheet' ? '📊 Google Sheet' : '📝 Manual Queue', inline: true }
    )
    .setFooter({ text: `${EMOJI.CLOCK} 10s confirm • ${EMOJI.BID} Fastest wins` })
    .setTimestamp();

  if (isBatch && !item.batchNumber) {
    embed.addFields({
      name: `${EMOJI.FIRE} Batch Auction`,
      value: `Top ${item.quantity} bidders will win!`,
      inline: false,
    });
  }

  await channel.send({ embeds: [embed] });
  
  // 20 second preview before timer starts
  setTimeout(() => {
    scheduleItemTimers(client, config, channel);
  }, 20000);
}

function scheduleItemTimers(client, config, channel) {
  const item = auctionState.currentItem;
  const t = item.endTime - Date.now();

  if (t > 60000 && !item.go1) {
    auctionState.timers.go1 = setTimeout(async () => await itemGo1(client, config, channel), t - 60000);
  }
  if (t > 30000 && !item.go2) {
    auctionState.timers.go2 = setTimeout(async () => await itemGo2(client, config, channel), t - 30000);
  }
  if (t > 10000) {
    auctionState.timers.go3 = setTimeout(async () => await itemGo3(client, config, channel), t - 10000);
  }
  auctionState.timers.itemEnd = setTimeout(async () => await itemEnd(client, config, channel), t);
}

async function itemGo1(client, config, channel) {
  if (!auctionState.active || !auctionState.currentItem || auctionState.currentItem.go1) return;
  auctionState.currentItem.go1 = true;

  const item = auctionState.currentItem;
  await channel.send({
    embeds: [
      new EmbedBuilder()
        .setColor(COLORS.WARNING)
        .setTitle(`${EMOJI.WARNING} GOING ONCE!`)
        .setDescription("1 minute left")
        .addFields({
          name: `${EMOJI.BID} Current`,
          value: item.curWin ? `${item.curBid}pts by ${item.curWin}` : `${item.startPrice}pts (no bids)`,
        }),
    ],
  });
}

async function itemGo2(client, config, channel) {
  if (!auctionState.active || !auctionState.currentItem || auctionState.currentItem.go2) return;
  auctionState.currentItem.go2 = true;

  const item = auctionState.currentItem;
  await channel.send({
    embeds: [
      new EmbedBuilder()
        .setColor(COLORS.WARNING)
        .setTitle(`${EMOJI.WARNING} GOING TWICE!`)
        .setDescription("30 seconds left")
        .addFields({
          name: `${EMOJI.BID} Current`,
          value: item.curWin ? `${item.curBid}pts by ${item.curWin}` : `${item.startPrice}pts (no bids)`,
        }),
    ],
  });
}

async function itemGo3(client, config, channel) {
  if (!auctionState.active || !auctionState.currentItem) return;

  const item = auctionState.currentItem;
  await channel.send({
    embeds: [
      new EmbedBuilder()
        .setColor(COLORS.ERROR)
        .setTitle(`${EMOJI.WARNING} FINAL CALL!`)
        .setDescription("10 seconds left")
        .addFields({
          name: `${EMOJI.BID} Current`,
          value: item.curWin ? `${item.curBid}pts by ${item.curWin}` : `${item.startPrice}pts (no bids)`,
        }),
    ],
  });
}

async function itemEnd(client, config, channel) {
  if (!auctionState.active || !auctionState.currentItem) return;

  const item = auctionState.currentItem;
  item.status = 'ended';

  const timestamp = getTimestamp();
  const totalBids = item.bids.length;
  const bidCount = item.curWin ? item.bids.filter(b => b.user === item.curWin).length : 0;
  
  // Calculate auction end time
  const auctionEndTime = getCurrentTimestamp();
  const endTimeStr = `${auctionEndTime.date} ${auctionEndTime.time}`;
  item.auctionEndTime = endTimeStr;

  if (item.curWin) {
    // ITEM HAS WINNER
    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(COLORS.AUCTION)
          .setTitle(`${EMOJI.AUCTION} SOLD!`)
          .setDescription(`**${item.item}** sold!`)
          .addFields(
            { name: `${EMOJI.FIRE} Winner`, value: `<@${item.curWinId}>`, inline: true },
            { name: `${EMOJI.BID} Price`, value: `${item.curBid}pts`, inline: true },
            { name: `${EMOJI.INFO} Source`, value: item.source === 'GoogleSheet' ? '📊 Google Sheet' : '📝 Manual Queue', inline: true }
          )
          .setFooter({ text: `${timestamp}` })
          .setTimestamp(),
      ],
    });

    // Log to Google Sheet
    const logPayload = {
      action: 'logAuctionResult',
      itemIndex: item.source === 'GoogleSheet' ? item.sheetIndex + 2 : -1,
      winner: item.curWin,
      winningBid: item.curBid,
      totalBids: totalBids,
      bidCount: bidCount,
      itemSource: item.source,
      itemName: item.item,
      timestamp: timestamp,
      auctionStartTime: item.auctionStartTime,
      auctionEndTime: endTimeStr,
    };

    await getPostToSheet()(logPayload);

    // Add to session items (for final tally)
    auctionState.sessionItems.push({
      item: item.item,
      winner: item.curWin,
      winnerId: item.curWinId,
      amount: item.curBid,
      source: item.source,
      timestamp,
      auctionStartTime: item.auctionStartTime,
      auctionEndTime: endTimeStr,
    });

    // Track manual items for logging to BiddingItems
    if (item.source === 'QueueList') {
      manualItemsAuctioned.push({
        item: item.item,
        startPrice: item.startPrice,
        duration: item.duration,
        winner: item.curWin,
        winningBid: item.curBid,
        auctionStartTime: item.auctionStartTime,
        auctionEndTime: endTimeStr,
      });
    }

  } else {
    // NO WINNER
    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(COLORS.INFO)
          .setTitle(`${EMOJI.ERROR} NO BIDS`)
          .setDescription(`**${item.item}** - no bids\n*Will be re-auctioned next session*`)
          .addFields({
            name: `${EMOJI.INFO} Source`,
            value: item.source === 'GoogleSheet' ? '📊 Google Sheet (stays in queue)' : '📝 Manual Queue (added to Google Sheet)',
            inline: false,
          }),
      ],
    });

    // Track manual items with no winners (to be added to BiddingItems)
    if (item.source === 'QueueList') {
      manualItemsAuctioned.push({
        item: item.item,
        startPrice: item.startPrice,
        duration: item.duration,
        winner: '',  // Empty = no winner
        winningBid: '',
        auctionStartTime: item.auctionStartTime,
        auctionEndTime: endTimeStr,
      });
    }
  }

  auctionState.currentItemIndex++;

  if (auctionState.currentItemIndex < auctionState.itemQueue.length) {
    auctionState.timers.nextItem = setTimeout(async () => {
      await auctionNextItem(client, config, channel);
    }, ITEM_WAIT);
  } else {
    await finalizeSession(client, config, channel);
  }
}

async function finalizeSession(client, config, channel) {
  if (!auctionState.active) return;

  auctionState.active = false;
  clearAllTimers();

  const summary = auctionState.sessionItems.map(
    (s, i) => `${i + 1}. **${s.item}** (${s.source === 'GoogleSheet' ? '📊' : '📝'}): ${s.winner} - ${s.amount}pts`
  ).join("\n");

  const mainEmbed = new EmbedBuilder()
    .setColor(COLORS.SUCCESS)
    .setTitle(`${EMOJI.SUCCESS} Auctioneering Session Complete!`)
    .setDescription(`**${auctionState.sessionItems.length}** item(s) auctioned`)
    .addFields(
      {
        name: `${EMOJI.LIST} Summary`,
        value: summary || "No sales",
        inline: false,
      },
      {
        name: `${EMOJI.INFO} Session Info`,
        value: `📊 Google Sheet Items Auctioned: ${auctionState.itemQueue.filter(i => i.source === 'GoogleSheet').length}\n📝 Manual Items Auctioned: ${manualItemsAuctioned.length}`,
        inline: false,
      }
    )
    .setFooter({ text: "Processing results and submitting to sheets..." })
    .setTimestamp();

  await channel.send({ embeds: [mainEmbed] });

  // STEP 1: Build combined results for tally
  const combinedResults = await buildCombinedResults(config);

  // STEP 2: Submit combined results with manual items
  const submitPayload = {
    action: 'submitBiddingResults',
    results: combinedResults,
    manualItems: manualItemsAuctioned,
  };

  await getPostToSheet()(submitPayload);

  // STEP 3: Send detailed summary to admin logs
  const mainGuild = await client.guilds.fetch(config.main_guild_id);
  const adminLogs = await mainGuild.channels.fetch(config.admin_logs_channel_id).catch(() => null);

  if (adminLogs) {
    const sheetItemsWithWinners = auctionState.sessionItems.filter(s => s.source === 'GoogleSheet').length;
    const manualItemsWithWinners = auctionState.sessionItems.filter(s => s.source === 'QueueList').length;
    const totalRevenue = auctionState.sessionItems.reduce((sum, s) => sum + s.amount, 0);
    
    const adminEmbed = new EmbedBuilder()
      .setColor(COLORS.SUCCESS)
      .setTitle(`${EMOJI.SUCCESS} Session Summary - ${sessionTimestamp}`)
      .setDescription(`Auctioneering session completed successfully`)
      .addFields(
        {
          name: `📊 Google Sheet Items`,
          value: `**Auctioned:** ${auctionState.itemQueue.filter(i => i.source === 'GoogleSheet').length}\n**With Winners:** ${sheetItemsWithWinners}\n**No Bids:** ${auctionState.itemQueue.filter(i => i.source === 'GoogleSheet').length - sheetItemsWithWinners}`,
          inline: true,
        },
        {
          name: `📝 Manual Items`,
          value: `**Auctioned:** ${manualItemsAuctioned.length}\n**With Winners:** ${manualItemsWithWinners}\n**No Bids:** ${manualItemsAuctioned.length - manualItemsWithWinners}`,
          inline: true,
        },
        {
          name: `💰 Revenue`,
          value: `**Total:** ${totalRevenue}pts`,
          inline: true,
        },
        {
          name: `📋 Results`,
          value: summary || "No sales recorded",
          inline: false,
        }
      )
      .setFooter({ text: `Session completed by !startauction` })
      .setTimestamp();
    
    await adminLogs.send({ embeds: [adminEmbed] });
  }

  auctionState.sessionItems = [];
  auctionState.itemQueue = [];
  manualItemsAuctioned = [];
}

async function buildCombinedResults(config) {
  // Fetch fresh points from sheet
  const response = await fetch(config.sheet_webhook_url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "getBiddingPoints" }),
  }).then(r => r.json()).catch(() => ({}));

  const allPoints = response.points || {};
  const allMembers = Object.keys(allPoints);

  // Combine all winners from session
  const winners = {};
  auctionState.sessionItems.forEach(item => {
    const normalizedWinner = item.winner.toLowerCase().trim();
    winners[normalizedWinner] = (winners[normalizedWinner] || 0) + item.amount;
  });

  // Build results for ALL members (including 0s for clean logs)
  const results = allMembers.map(m => {
    const normalizedMember = m.toLowerCase().trim();
    return {
      member: m,
      totalSpent: winners[normalizedMember] || 0,
    };
  });

  return results;
}

function pauseSession() {
  if (!auctionState.active || auctionState.paused) return false;
  auctionState.paused = true;
  auctionState.pausedTime = Date.now();

  Object.values(auctionState.timers).forEach(t => clearTimeout(t));
  console.log(`${EMOJI.PAUSE} Session paused`);
  
  // ADD THIS LINE:
  if (cfg && cfg.sheet_webhook_url) {
    saveAuctionState(cfg.sheet_webhook_url).catch(console.error);
  }
  
  return true;
}

function resumeSession(client, config, channel) {
  if (!auctionState.active || !auctionState.paused) return false;
  auctionState.paused = false;

  const pausedDuration = Date.now() - auctionState.pausedTime;
  auctionState.currentItem.endTime += pausedDuration;

  scheduleItemTimers(client, config, channel);
  console.log(`${EMOJI.PLAY} Session resumed`);
  return true;
}

function stopCurrentItem(client, config, channel) {
  if (!auctionState.active || !auctionState.currentItem) return false;
  // ADD THIS LINE:
  if (cfg && cfg.sheet_webhook_url) {
    saveAuctionState(cfg.sheet_webhook_url).catch(console.error);
  }

  clearTimeout(auctionState.timers.itemEnd);
  clearTimeout(auctionState.timers.go1);
  clearTimeout(auctionState.timers.go2);
  clearTimeout(auctionState.timers.go3);

  itemEnd(client, config, channel);
  return true;
}

function extendCurrentItem(minutes) {
  if (!auctionState.active || !auctionState.currentItem) return false;
    // ADD THIS LINE:
  if (cfg && cfg.sheet_webhook_url) {
    saveAuctionState(cfg.sheet_webhook_url).catch(console.error);
  }
  
  auctionState.currentItem.endTime += minutes * 60000;
  console.log(`${EMOJI.TIME} Extended by ${minutes}m`);
  return true;
}

function clearAllTimers() {
  Object.values(auctionState.timers).forEach(t => clearTimeout(t));
  auctionState.timers = {};
}

function getAuctionState() {
  return auctionState;
}

// ============================================
// QUEUE MANAGEMENT FUNCTIONS
// ============================================

async function handleQueueList(message, biddingState) {
  const auctQueue = auctionState.itemQueue || [];
  const biddingQueue = biddingState.q || [];
  
  // Check if auction is active - if so, show only auctionState.itemQueue
  if (auctionState.active) {
    if (auctQueue.length === 0) {
      return await message.reply(`${EMOJI.LIST} Queue is empty`);
    }

    let queueText = '';
    auctQueue.forEach((item, idx) => {
      const qty = item.quantity > 1 ? ` x${item.quantity}` : '';
      queueText += `**${idx + 1}.** ${item.item}${qty} - ${item.startPrice}pts • ${item.duration}m (${item.source})\n`;
    });

    const embed = new EmbedBuilder()
      .setColor(0x4a90e2)
      .setTitle(`${EMOJI.LIST} Auction Queue (Active Session)`)
      .setDescription(queueText)
      .addFields({
        name: `${EMOJI.CHART} Total`,
        value: `${auctQueue.length}`,
        inline: true,
      })
      .setTimestamp();

    return await message.reply({ embeds: [embed] });
  }

  // NO ACTIVE AUCTION - Fetch from Google Sheet and show preview
  const loadingMsg = await message.reply(`${EMOJI.CLOCK} Loading items from Google Sheet...`);

  // Fetch items from BiddingItems sheet
  const sheetItems = await fetchSheetItems(cfg.sheet_webhook_url);
  
  if (sheetItems === null) {
    await loadingMsg.edit(`${EMOJI.ERROR} Failed to fetch items from Google Sheet. Check webhook configuration.`);
    return;
  }

  await loadingMsg.delete().catch(() => {});

  if (sheetItems.length === 0 && biddingQueue.length === 0) {
    return await message.reply(
      `${EMOJI.LIST} Queue is empty.\n\n` +
      `Add items with:\n` +
      `• \`!auction <item> <price> <duration>\` - Manual queue\n` +
      `• Add to **BiddingItems** sheet in Google Sheets`
    );
  }

  let queueText = '';
  let position = 1;

  // Google Sheet items first
  if (sheetItems.length > 0) {
    queueText += `**📊 FROM GOOGLE SHEET (BiddingItems):**\n`;
    sheetItems.forEach((item, idx) => {
      const qty = item.quantity > 1 ? ` x${item.quantity}` : '';
      queueText += `**${position}.** ${item.item}${qty} - ${item.startPrice}pts • ${item.duration}m\n`;
      position++;
    });
  }

  // Then manual queue items
  if (biddingQueue.length > 0) {
    if (sheetItems.length > 0) queueText += `\n`;
    queueText += `**📋 MANUAL QUEUE (from !auction):**\n`;
    biddingQueue.forEach((item, idx) => {
      const qty = item.quantity > 1 ? ` x${item.quantity}` : '';
      queueText += `**${position}.** ${item.item}${qty} - ${item.startPrice}pts • ${item.duration}m\n`;
      position++;
    });
  }

  queueText += `\n**ℹ️ Note:** This is the order items will auction when you run \`!startauction\``;

  const embed = new EmbedBuilder()
    .setColor(0x4a90e2)
    .setTitle(`${EMOJI.LIST} Auction Queue (Preview)`)
    .setDescription(queueText)
    .addFields(
      { 
        name: `${EMOJI.CHART} Google Sheet`, 
        value: `${sheetItems.length}`, 
        inline: true 
      },
      { 
        name: `${EMOJI.LIST} Manual Queue`, 
        value: `${biddingQueue.length}`, 
        inline: true 
      },
      { 
        name: `${EMOJI.FIRE} Total`, 
        value: `${sheetItems.length + biddingQueue.length}`, 
        inline: true 
      }
    )
    .setFooter({ text: 'Use !startauction to begin • Sheet items auction first' })
    .setTimestamp();

  await message.reply({ embeds: [embed] });
}

async function handleRemoveItem(message, args, biddingModule) {
  if (args.length === 0) {
    return await message.reply(`${EMOJI.ERROR} Usage: \`!removeitem <name>\``);
  }

  const itemName = args.join(" ");
  
  // Try to remove from auctioneering queue
  const auctIdx = auctionState.itemQueue.findIndex(
    (a) => a.item.toLowerCase() === itemName.toLowerCase()
  );
  
  if (auctIdx !== -1) {
    const removed = auctionState.itemQueue.splice(auctIdx, 1)[0];
    return await message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xffa500)
          .setTitle(`${EMOJI.SUCCESS} Removed`)
          .setDescription(`**${removed.item}**${removed.quantity > 1 ? ` x${removed.quantity}` : ''}`)
          .addFields({
            name: `${EMOJI.LIST} Remaining in Queue`,
            value: `${auctionState.itemQueue.length}`,
            inline: true,
          }),
      ],
    });
  }

  // Try to remove from bidding queue
  const biddingState = biddingModule.getBiddingState();
  const bidIdx = biddingState.q.findIndex(
    (a) => a.item.toLowerCase() === itemName.toLowerCase()
  );
  
  if (bidIdx !== -1) {
    const removed = biddingState.q.splice(bidIdx, 1)[0];
    biddingModule.saveBiddingState();
    return await message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xffa500)
          .setTitle(`${EMOJI.SUCCESS} Removed`)
          .setDescription(`**${removed.item}**${removed.quantity > 1 ? ` x${removed.quantity}` : ''}`)
          .addFields({
            name: `${EMOJI.LIST} Remaining in Queue`,
            value: `${biddingState.q.length}`,
            inline: true,
          }),
      ],
    });
  }

  await message.reply(`${EMOJI.ERROR} Item not found in queue`);
}

async function handleClearQueue(message, onConfirm, onCancel) {
  if (auctionState.active) {
    return await message.reply(`${EMOJI.ERROR} Cannot clear during active auction`);
  }

  const totalItems = auctionState.itemQueue.length;
  if (totalItems === 0) {
    return await message.reply(`${EMOJI.LIST} Queue is already empty`);
  }

  const clearMsg = await message.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0xffa500)
        .setTitle(`${EMOJI.WARNING} Clear Queue?`)
        .setDescription(`This will remove **${totalItems} item(s)** from the auction queue.`)
        .setFooter({ text: `${EMOJI.SUCCESS} confirm / ${EMOJI.ERROR} cancel` }),
    ],
  });

  await clearMsg.react(EMOJI.SUCCESS);
  await clearMsg.react(EMOJI.ERROR);

  try {
    const col = await clearMsg.awaitReactions({
      filter: (r, u) =>
        [EMOJI.SUCCESS, EMOJI.ERROR].includes(r.emoji.name) && u.id === message.author.id,
      max: 1,
      time: 30000,
      errors: ["time"],
    });

    if (col.first().emoji.name === EMOJI.SUCCESS) {
      auctionState.itemQueue = [];
      await clearMsg.reactions.removeAll().catch(() => {});
      await message.reply(`${EMOJI.SUCCESS} Cleared ${totalItems} item(s)`);
    } else {
      await clearMsg.reactions.removeAll().catch(() => {});
      await message.reply(`${EMOJI.ERROR} Clear canceled`);
    }
  } catch (e) {
    await clearMsg.reactions.removeAll().catch(() => {});
  }
}

async function handleMyPoints(message, biddingModule, config) {
  // Only in bidding channel, not during active auction
  if (auctionState.active) {
    return await message.reply(
      `${EMOJI.WARNING} Can't check points during active auction. Wait for session to end.`
    );
  }

  const u = message.member.nickname || message.author.username;

  // Fetch fresh from sheets
  const freshPts = await fetch(config.sheet_webhook_url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "getBiddingPoints" }),
  }).then(r => r.json()).then(d => d.points || {});

  let userPts = freshPts[u];
  if (userPts === undefined) {
    const match = Object.keys(freshPts).find(
      (n) => n.toLowerCase() === u.toLowerCase()
    );
    userPts = match ? freshPts[match] : null;
  }

  let ptsMsg;
  if (userPts === null || userPts === undefined) {
    ptsMsg = await message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xff0000)
          .setTitle(`${EMOJI.ERROR} Not Found`)
          .setDescription(
            `**${u}**\n\nYou are not in the bidding system or not a current ELYSIUM member.`
          )
          .setFooter({ text: "Contact admin if this is wrong" })
          .setTimestamp(),
      ],
    });
  } else {
    ptsMsg = await message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x00ff00)
          .setTitle(`${EMOJI.BID} Your Points`)
          .setDescription(`**${u}**`)
          .addFields({
            name: `${EMOJI.CHART} Available Points`,
            value: `${userPts} pts`,
            inline: true,
          })
          .setFooter({ text: "Auto-deletes in 30s" })
          .setTimestamp(),
      ],
    });
  }

  // Delete after 30s
  setTimeout(async () => {
    await ptsMsg.delete().catch(() => {});
    await message.delete().catch(() => {});
  }, 30000);
}

async function handleBidStatus(message, config) {
  const statEmbed = new EmbedBuilder()
    .setColor(0x4a90e2)
    .setTitle(`${EMOJI.CHART} Auction Status`);

  if (auctionState.active && auctionState.currentItem) {
    const timeLeft = auctionState.paused
      ? `${EMOJI.PAUSE} PAUSED (${fmtTime(auctionState.currentItem.endTime - Date.now())})`
      : fmtTime(auctionState.currentItem.endTime - Date.now());

    statEmbed.addFields(
      { name: `${EMOJI.FIRE} Active`, value: `${auctionState.currentItem.item}`, inline: true },
      { name: `${EMOJI.BID} Current Bid`, value: `${auctionState.currentItem.curBid}pts`, inline: true },
      { name: `${EMOJI.TIME} Time Left`, value: timeLeft, inline: true }
    );
  } else {
    statEmbed.addFields({
      name: `${EMOJI.FIRE} Status`,
      value: `${EMOJI.SUCCESS} Ready - No active auction`,
      inline: false,
    });
  }

  if (auctionState.itemQueue.length > 0) {
    statEmbed.addFields({
      name: `${EMOJI.LIST} Queue`,
      value:
        auctionState.itemQueue
          .slice(0, 5)
          .map((a, i) => `${i + 1}. ${a.item}${a.quantity > 1 ? ` x${a.quantity}` : ''}`)
          .join("\n") +
        (auctionState.itemQueue.length > 5 ? `\n*...+${auctionState.itemQueue.length - 5} more*` : ""),
    });
  }

  statEmbed
    .setFooter({ text: "Use !auction to add items" })
    .setTimestamp();

  await message.reply({ embeds: [statEmbed] });
}

async function handleCancelItem(message) {
  if (!auctionState.active || !auctionState.currentItem) {
    return await message.reply(`${EMOJI.ERROR} No active auction`);
  }

  const canMsg = await message.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0xffa500)
        .setTitle(`${EMOJI.WARNING} Cancel Item?`)
        .setDescription(`**${auctionState.currentItem.item}**\n\nRefund all locked points?`)
        .setFooter({ text: `${EMOJI.SUCCESS} yes / ${EMOJI.ERROR} no` }),
    ],
  });

  await canMsg.react(EMOJI.SUCCESS);
  await canMsg.react(EMOJI.ERROR);

  try {
    const canCol = await canMsg.awaitReactions({
      filter: (r, u) =>
        [EMOJI.SUCCESS, EMOJI.ERROR].includes(r.emoji.name) && u.id === message.author.id,
      max: 1,
      time: 30000,
      errors: ["time"],
    });

    if (canCol.first().emoji.name === EMOJI.SUCCESS) {
      await canMsg.reactions.removeAll().catch(() => {});
      // Unlock points for current bidder
      const biddingState = biddingModule.getBiddingState();
      if (auctionState.currentItem.curWin) {
        const amt = biddingState.lp[auctionState.currentItem.curWin] || 0;
        biddingState.lp[auctionState.currentItem.curWin] = 0;
        biddingModule.saveBiddingState();
      }
      
      await message.channel.send(
        `${EMOJI.ERROR} **${auctionState.currentItem.item}** canceled. Points refunded.`
      );
      
      auctionState.currentItemIndex++;
      if (auctionState.currentItemIndex < auctionState.itemQueue.length) {
        auctionState.timers.nextItem = setTimeout(async () => {
          await auctionNextItem(message.client, cfg, message.channel);
        }, 20000);
      } else {
        await finalizeSession(message.client, cfg, message.channel);
      }
    } else {
      await canMsg.reactions.removeAll().catch(() => {});
    }
  } catch (e) {
    await canMsg.reactions.removeAll().catch(() => {});
  }
}

async function handleSkipItem(message) {
  if (!auctionState.active || !auctionState.currentItem) {
    return await message.reply(`${EMOJI.ERROR} No active auction`);
  }

  const skpMsg = await message.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0xffa500)
        .setTitle(`${EMOJI.WARNING} Skip Item?`)
        .setDescription(`**${auctionState.currentItem.item}**\n\nMark as no sale, move to next?`)
        .setFooter({ text: `${EMOJI.SUCCESS} yes / ${EMOJI.ERROR} no` }),
    ],
  });

  await skpMsg.react(EMOJI.SUCCESS);
  await skpMsg.react(EMOJI.ERROR);

  try {
    const skpCol = await skpMsg.awaitReactions({
      filter: (r, u) =>
        [EMOJI.SUCCESS, EMOJI.ERROR].includes(r.emoji.name) && u.id === message.author.id,
      max: 1,
      time: 30000,
      errors: ["time"],
    });

    if (skpCol.first().emoji.name === EMOJI.SUCCESS) {
      await skpMsg.reactions.removeAll().catch(() => {});
      // Unlock points for current bidder
      const biddingState = biddingModule.getBiddingState();
      if (auctionState.currentItem.curWin) {
        const amt = biddingState.lp[auctionState.currentItem.curWin] || 0;
        biddingState.lp[auctionState.currentItem.curWin] = 0;
        biddingModule.saveBiddingState();
      }

      await message.channel.send(`⭐️ **${auctionState.currentItem.item}** skipped (no sale).`);
      
      auctionState.currentItemIndex++;
      if (auctionState.currentItemIndex < auctionState.itemQueue.length) {
        auctionState.timers.nextItem = setTimeout(async () => {
          await auctionNextItem(message.client, cfg, message.channel);
        }, 20000);
      } else {
        await finalizeSession(message.client, cfg, message.channel);
      }
    } else {
      await skpMsg.reactions.removeAll().catch(() => {});
    }
  } catch (e) {
    await skpMsg.reactions.removeAll().catch(() => {});
  }
}

async function handleForceSubmitResults(message, config, biddingModule) {
  if (auctionState.sessionItems.length === 0) {
    return await message.reply(`${EMOJI.ERROR} No results to submit`);
  }

  const fsMsg = await message.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0xffa500)
        .setTitle(`${EMOJI.WARNING} Force Submit?`)
        .setDescription(`**Items:** ${auctionState.sessionItems.length}`)
        .addFields({
          name: `${EMOJI.LIST} Results`,
          value: auctionState.sessionItems
            .map((a) => `• **${a.item}**: ${a.winner} - ${a.amount}pts`)
            .join("\n"),
          inline: false,
        })
        .setFooter({ text: `${EMOJI.SUCCESS} submit / ${EMOJI.ERROR} cancel` }),
    ],
  });

  await fsMsg.react(EMOJI.SUCCESS);
  await fsMsg.react(EMOJI.ERROR);

  try {
    const fsCol = await fsMsg.awaitReactions({
      filter: (r, u) =>
        [EMOJI.SUCCESS, EMOJI.ERROR].includes(r.emoji.name) && u.id === message.author.id,
      max: 1,
      time: 30000,
      errors: ["time"],
    });

    if (fsCol.first().emoji.name === EMOJI.SUCCESS) {
      await fsMsg.reactions.removeAll().catch(() => {});
      await biddingModule.submitSessionTally(config, auctionState.sessionItems);
      await message.reply(`${EMOJI.SUCCESS} Results submitted!`);
      auctionState.sessionItems = [];
    } else {
      await fsMsg.reactions.removeAll().catch(() => {});
    }
  } catch (e) {
    await fsMsg.reactions.removeAll().catch(() => {});
  }
};

function updateCurrentItemState(updates) {
  if (!auctionState.currentItem) return false;
  
  Object.assign(auctionState.currentItem, updates);
  console.log(`${EMOJI.SUCCESS} Item state updated:`, Object.keys(updates));
  return true;
}

module.exports = {
  initialize,
  startAuctioneering,
  pauseSession,
  resumeSession,
  stopCurrentItem,
  extendCurrentItem,
  getAuctionState,
  updateCurrentItemState,
  handleQueueList,
  handleRemoveItem,
  handleClearQueue,
  handleMyPoints,
  handleBidStatus,
  handleCancelItem,
  handleSkipItem,
  handleForceSubmitResults,
  setPostToSheet,
};