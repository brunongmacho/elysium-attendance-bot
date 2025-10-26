/**
 * ELYSIUM Auctioneering System v2.1 - FIXED
 * Single-session management with state persistence
 * Critical fixes: Auto-save state, bid routing, confirmation handling
 */

const { EmbedBuilder } = require("discord.js");
const fetch = require("node-fetch");

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
  PAUSE: '⸸',
  PLAY: '▶️',
  FIRE: '🔥',
  STOP: '⏹️',
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

    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "saveBotState",
        state: stateToSave,
      }),
    });

    console.log(`${EMOJI.SUCCESS} Auction state saved`);
  } catch (e) {
    console.error(`${EMOJI.ERROR} Save auction state:`, e);
  }
}

async function startAuctioneering(client, config, channel) {
  if (auctionState.active) {
    await channel.send(`${EMOJI.ERROR} Auction already running`);
    return;
  }

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

  sheetItems.forEach((item, idx) => {
    auctionState.itemQueue.push({
      ...item,
      source: 'GoogleSheet',
      sheetIndex: idx,
    });
  });

  queueItems.forEach((item) => {
    auctionState.itemQueue.push({
      ...item,
      source: 'QueueList',
    });
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
          { name: `${EMOJI.LIST} From Queue`, value: `${queueCount}`, inline: true }
        )
        .setFooter({ text: `Starting first item in 10 seconds...` })
        .setTimestamp(),
    ],
  });

  auctionState.timers.sessionStart = setTimeout(async () => {
    await auctionNextItem(client, config, channel);
  }, 10000);
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
  };

  const isBatch = item.quantity > 1;
  const embed = new EmbedBuilder()
    .setColor(COLORS.SUCCESS)
    .setTitle(`${EMOJI.FIRE} BIDDING NOW!`)
    .setDescription(`**${item.item}**${isBatch ? ` x${item.quantity}` : ''}\n\nType \`!bid <amount>\` or \`!b <amount>\` to bid`)
    .addFields(
      { name: `${EMOJI.BID} Starting Bid`, value: `${item.startPrice}pts`, inline: true },
      { name: `${EMOJI.TIME} Duration`, value: `${item.duration}m`, inline: true },
      { name: `${EMOJI.LIST} Item #`, value: `${auctionState.currentItemIndex + 1}/${auctionState.itemQueue.length}`, inline: true }
    )
    .setFooter({ text: `${EMOJI.CLOCK} 10s confirm • ${EMOJI.BID} Fastest wins` })
    .setTimestamp();

  if (isBatch) {
    embed.addFields({
      name: `${EMOJI.FIRE} Batch Auction`,
      value: `Top ${item.quantity} bidders will win!`,
      inline: false,
    });
  }

  await channel.send({ embeds: [embed] });
  scheduleItemTimers(client, config, channel);
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

  if (item.curWin) {
    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(COLORS.AUCTION)
          .setTitle(`${EMOJI.AUCTION} SOLD!`)
          .setDescription(`**${item.item}** sold!`)
          .addFields(
            { name: `${EMOJI.FIRE} Winner`, value: `<@${item.curWinId}>`, inline: true },
            { name: `${EMOJI.BID} Price`, value: `${item.curBid}pts`, inline: true }
          )
          .setFooter({ text: `${timestamp}` })
          .setTimestamp(),
      ],
    });

    auctionState.sessionItems.push({
      item: item.item,
      winner: item.curWin,
      winnerId: item.curWinId,
      amount: item.curBid,
      source: item.source,
      timestamp,
    });

    await logAuctionResult(
      config.sheet_webhook_url,
      item.source === 'GoogleSheet' ? item.sheetIndex + 2 : -1,
      item.curWin,
      item.curBid,
      totalBids,
      bidCount,
      item.source,
      timestamp
    );
  } else {
    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(COLORS.INFO)
          .setTitle(`${EMOJI.ERROR} NO BIDS`)
          .setDescription(`**${item.item}** - no bids`),
      ],
    });
  }

  // CRITICAL FIX #1: Save state after each item
  await saveAuctionState(config.sheet_webhook_url);

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
    (s, i) => `${i + 1}. **${s.item}**: ${s.winner} - ${s.amount}pts`
  ).join("\n");

  await channel.send({
    embeds: [
      new EmbedBuilder()
        .setColor(COLORS.SUCCESS)
        .setTitle(`${EMOJI.SUCCESS} Auctioneering Session Complete!`)
        .setDescription(`**${auctionState.sessionItems.length}** item(s) auctioned`)
        .addFields({
          name: `${EMOJI.LIST} Summary`,
          value: summary || "No sales",
        })
        .setFooter({ text: "Submitting tally to BiddingPoints sheet..." })
        .setTimestamp(),
    ],
  });

  // Submit tally to bidding points
  await biddingModule.submitSessionTally(config, auctionState.sessionItems);

  auctionState.sessionItems = [];
  auctionState.itemQueue = [];
}

function pauseSession() {
  if (!auctionState.active || auctionState.paused) return false;
  auctionState.paused = true;
  auctionState.pausedTime = Date.now();

  Object.values(auctionState.timers).forEach(t => clearTimeout(t));
  console.log(`${EMOJI.PAUSE} Session paused`);
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

  clearTimeout(auctionState.timers.itemEnd);
  clearTimeout(auctionState.timers.go1);
  clearTimeout(auctionState.timers.go2);
  clearTimeout(auctionState.timers.go3);

  itemEnd(client, config, channel);
  return true;
}

function extendCurrentItem(minutes) {
  if (!auctionState.active || !auctionState.currentItem) return false;
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

module.exports = {
  initialize,
  startAuctioneering,
  pauseSession,
  resumeSession,
  stopCurrentItem,
  extendCurrentItem,
  getAuctionState,
};