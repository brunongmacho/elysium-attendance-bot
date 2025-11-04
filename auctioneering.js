/**
 * ELYSIUM Auctioneering System v2.1 - FIXED
 * Single-session management with state persistence
 * Critical fixes: Auto-save state, bid routing, confirmation handling
 */

const { EmbedBuilder } = require("discord.js");
const fetch = require("node-fetch");
const { Timeout } = require("timers");
const errorHandler = require('./utils/error-handler');
const {
  getCurrentTimestamp,
  getSundayOfWeek,
  sleep,
  normalizeUsername,
} = require("./utils/common");
const attendance = require("./attendance");

// ==========================================
// POSTTOSHEET INITIALIZATION
// ==========================================
let postToSheetFunc = null;
let attendanceCache = {}; // { "BOSS DATE TIME": ["member1", "member2"] }
let currentSessionBoss = null;

function setPostToSheet(fn) {
  postToSheetFunc = fn;
  console.log(`${EMOJI.SUCCESS} postToSheet function initialized`);
}

function getPostToSheet() {
  if (!postToSheetFunc) {
    throw new Error(
      "❌ CRITICAL: postToSheet not initialized. Call setPostToSheet() first."
    );
  }
  return postToSheetFunc;
}

// STATE
let auctionState = {
  active: false,
  currentItem: null,
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
  SUCCESS: "✅",
  ERROR: "❌",
  WARNING: "⚠️",
  INFO: "ℹ️",
  AUCTION: "🔨",
  BID: "💰",
  TIME: "⏱️",
  CLOCK: "🕐",
  LIST: "📋",
  PAUSE: "⏸️",
  PLAY: "▶️",
  FIRE: "🔥",
  STOP: "⏹️",
  TROPHY: "🏆",
  CHART: "📊",
  LOCK: "🔒",
};

// Timeout constants
const TIMEOUTS = {
  FETCH_TIMEOUT: 10000, // 10 seconds - API fetch timeout
  CONFIRMATION: 30000, // 30 seconds - user confirmation timeout
  PREVIEW_DELAY: 30000, // 30 seconds - item preview delay
};

function initialize(config, isAdminFunc, biddingModuleRef) {
  cfg = config;
  isAdmFunc = isAdminFunc;
  biddingModule = biddingModuleRef;
  console.log(`${EMOJI.SUCCESS} Auctioneering system initialized`);
}

function getTimestamp() {
  const d = new Date();
  const manilaTime = new Date(
    d.toLocaleString("en-US", { timeZone: "Asia/Manila" })
  );
  return `${String(manilaTime.getMonth() + 1).padStart(2, "0")}/${String(
    manilaTime.getDate()
  ).padStart(2, "0")}/${manilaTime.getFullYear()} ${String(
    manilaTime.getHours()
  ).padStart(2, "0")}:${String(manilaTime.getMinutes()).padStart(2, "0")}`;
}

function fmtTime(ms) {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60),
    sec = s % 60;
  if (m < 60) return sec > 0 ? `${m}m ${sec}s` : `${m}m`;
  const h = Math.floor(m / 60);
  return m % 60 > 0 ? `${h}h ${m % 60}m` : `${h}h`;
}

async function fetchSheetItems(url, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "getBiddingItems" }),
        timeout: TIMEOUTS.FETCH_TIMEOUT,
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      console.log(
        `${EMOJI.SUCCESS} Fetched ${(data.items || []).length} items from sheet`
      );
      return data.items || [];
    } catch (e) {
      console.error(
        `${EMOJI.ERROR} Fetch items attempt ${attempt}/${retries}:`,
        e.message
      );
      if (attempt < retries) {
        const backoff = 2000 * attempt; // Exponential backoff: 2s, 4s, 6s
        console.log(`${EMOJI.WARNING} Retrying in ${backoff / 1000}s...`);
        await new Promise((resolve) => setTimeout(resolve, backoff));
      }
    }
  }
  console.error(
    `${EMOJI.ERROR} Failed to fetch items after ${retries} attempts`
  );
  return null;
}

async function logAuctionResult(
  url,
  itemIndex,
  winner,
  winningBid,
  totalBids,
  bidCount,
  itemSource,
  timestamp
) {
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
    console.log(
      `${EMOJI.SUCCESS} Result logged: ${
        winner || "No winner"
      } - ${winningBid}pts`
    );
    return true;
  } catch (e) {
    console.error(`${EMOJI.ERROR} Log result:`, e);
    return false;
  }
}

async function saveAuctionState(url) {
  try {
    // 🔒 Prevent circular reference errors
    const safeStringify = (obj) => {
      const seen = new WeakSet();
      return JSON.stringify(obj, (key, value) => {
        // Skip timers and circular references
        if (key === "timers" || key === "currentSession") return undefined;
        if (typeof value === "object" && value !== null) {
          if (seen.has(value)) return undefined;
          seen.add(value);
        }
        return value;
      });
    };

    // 🧩 Clean item (avoid timers and circular data)
    const cleanItem =
      auctionState.currentItem && typeof auctionState.currentItem === "object"
        ? {
            item: auctionState.currentItem.item,
            startPrice: auctionState.currentItem.startPrice,
            duration: auctionState.currentItem.duration,
            curBid: auctionState.currentItem.curBid,
            curWin: auctionState.currentItem.curWin,
            curWinId: auctionState.currentItem.curWinId,
            status: auctionState.currentItem.status,
            source: auctionState.currentItem.source,
            sheetIndex: auctionState.currentItem.sheetIndex,
            bossName: auctionState.currentItem.bossName,
          }
        : null;

    const stateToSave = {
      auctionState: {
        active: auctionState.active,
        currentItem: cleanItem,
        sessionItems: auctionState.sessionItems,
        currentItemIndex: auctionState.currentItemIndex,
        paused: auctionState.paused,
      },
      timestamp: getTimestamp(),
    };

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: safeStringify({
        action: "saveBotState",
        state: stateToSave,
      }),
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    console.log(`${EMOJI.SUCCESS} Auction state saved`);
    return true;
  } catch (e) {
    console.error(`${EMOJI.ERROR} Save auction state:`, e);
    return false;
  }
}

// REPLACE the entire startAuctioneering function (Line ~230 in auctioneering.js)
// This version removes boss grouping and attendance requirements

async function startAuctioneering(client, config, channel) {
  // Validate parameters
  if (!client || !config || !channel) {
    console.error(`${EMOJI.ERROR} Invalid parameters to startAuctioneering`);
    return;
  }

  if (auctionState.active) {
    await channel.send(`❌ Auction already running`);
    return;
  }

  if (![0, 5].includes(channel.type)) {
    console.error(
      `❌ Invalid channel type (${channel.type}) – must be text or announcement channel.`
    );
    const guild = await client.guilds.fetch(config.main_guild_id);
    channel = await guild.channels.fetch(config.bidding_channel_id);
    console.log(
      `✅ Recovered correct bidding channel: ${channel.name} (${channel.id})`
    );
  }

  // Load points
  const pointsFetched = await biddingModule.loadPointsCacheForAuction(
    config.sheet_webhook_url
  );
  if (!pointsFetched) {
    await channel.send(`❌ Failed to load points`);
    return;
  }

  // Fetch sheet items
  const sheetItems = await fetchSheetItems(config.sheet_webhook_url);
  if (!sheetItems) {
    await channel.send(`❌ Failed to load items`);
    return;
  }

  // 🔧 FIX: Filter out items that already have winners (past auctions)
  const availableItems = sheetItems.filter((item) => {
    const winner = item.winner;
    const hasWinner =
      winner !== null &&
      winner !== undefined &&
      winner !== "" &&
      winner.toString().trim() !== "";

    if (hasWinner) {
      console.log(`⏭️ Skipping "${item.item}" - already has winner: ${winner}`);
    }
    return !hasWinner;
  });

  if (availableItems.length === 0) {
    await channel.send(
      `❌ No available items to auction.\n\n` +
        `All items in BiddingItems sheet already have winners.\n` +
        `Please add new items or clear the Winner column (Column D) for items you want to re-auction.`
    );
    return;
  }

  console.log(
    `✅ Filtered items: ${availableItems.length}/${
      sheetItems.length
    } available (${
      sheetItems.length - availableItems.length
    } already have winners)`
  );

  // 🎯 SIMPLIFIED: Treat all items as ONE session (no boss grouping)
  const allItems = [];

  availableItems.forEach((item) => {
    const qty = parseInt(item.quantity) || 1;
    for (let q = 0; q < qty; q++) {
      allItems.push({
        ...item,
        quantity: 1,
        batchNumber: qty > 1 ? q + 1 : null,
        batchTotal: qty > 1 ? qty : null,
        source: "GoogleSheet",
        bossName: (item.boss || "").split(" ")[0] || "Unknown", // Extract just boss name
      });
    }
  });

  if (allItems.length === 0) {
    await channel.send(`❌ No items to auction`);
    return;
  }

  // Initialize auction state
  auctionState.active = true;
  auctionState.sessionItems = allItems;
  auctionState.currentItemIndex = 0;

  // Show preview
  const previewList = allItems
    .slice(0, 10)
    .map((item, i) => {
      return `${i + 1}. **${item.item}** - ${item.startPrice}pts • ${
        item.duration
      }m${item.bossName !== "Unknown" ? ` (${item.bossName})` : ""}`;
    })
    .join("\n");

  const moreItems =
    allItems.length > 10 ? `\n\n*...+${allItems.length - 10} more items*` : "";

  const countdownEmbed = new EmbedBuilder()
    .setColor(COLORS.AUCTION)
    .setTitle(`${EMOJI.FIRE} Auctioneering Started!`)
    .setDescription(
      `**${allItems.length} item(s)** queued for auction\n\n${previewList}${moreItems}\n\n` +
        `✅ **No attendance required** - All ELYSIUM members can bid!`
    )
    .setFooter({ text: "Starting first item in 30s..." })
    .setTimestamp();

  const feedbackMsg = await channel.send({
    content: "@everyone",
    embeds: [countdownEmbed],
  });

  // Countdown feedback every 5 seconds
  let countdown = 30;
  const countdownInterval = setInterval(async () => {
    countdown -= 5;
    if (countdown > 0) {
      countdownEmbed.setFooter({
        text: `Starting first item in ${countdown}s...`,
      });
      await feedbackMsg
        .edit({ embeds: [countdownEmbed] })
        .catch((err) =>
          console.warn(`⚠️ Failed to update countdown:`, err.message)
        );
    }
  }, 5000);

  // Store countdown interval for cleanup
  auctionState.timers.sessionStartCountdown = countdownInterval;

  auctionState.timers.sessionStart = setTimeout(async () => {
    clearInterval(auctionState.timers.sessionStartCountdown);
    delete auctionState.timers.sessionStartCountdown;
    try {
      // Always use the configured bidding channel
      const guild = await client.guilds.fetch(config.main_guild_id);
      const biddingChannel = await guild.channels.fetch(
        config.bidding_channel_id
      );

      console.log(
        `✅ Using bidding channel: ${biddingChannel.name} (${biddingChannel.id})`
      );
      await auctionNextItem(client, config, biddingChannel);
    } catch (err) {
      console.error("❌ Failed to fetch bidding channel:", err);

      // Cleanup on error
      auctionState.active = false;
      clearAllTimers();
      if (
        biddingModule &&
        typeof biddingModule.stopCacheAutoRefresh === "function"
      ) {
        biddingModule.stopCacheAutoRefresh();
      }

      await channel
        .send(
          `❌ Failed to start auction. Please try again or contact an admin.`
        )
        .catch(() => {});
    }
  }, 30000); // 30 seconds preview
}

function canUserBid(username, currentSession) {
  // No attendance required - all ELYSIUM members can bid
  return true;
}

// REPLACE the entire auctionNextItem function (Line ~400 in auctioneering.js)
// This version removes session/boss logic - just processes items linearly

async function auctionNextItem(client, config, channel) {
  // ✅ Ensure we're using a proper guild text channel
  if (![0, 5].includes(channel.type)) {
    console.warn(
      `⚠️ Channel type ${channel.type} invalid – refetching bidding channel...`
    );
    try {
      const guild = await client.guilds.fetch(config.main_guild_id);
      channel = await guild.channels.fetch(config.bidding_channel_id);
      console.log(
        `✅ Corrected to bidding channel: ${channel.name} (${channel.id})`
      );
    } catch (err) {
      console.error("❌ Could not refetch bidding channel:", err);
      return;
    }
  }

  // ✅ Ensure channel reference is valid
  if (!channel) {
    console.warn("⚠️ Channel is undefined, attempting to refetch...");
    try {
      const guild = await client.guilds.fetch(config.main_guild_id);
      channel = await guild.channels.fetch(config.bidding_channel_id);
      if (!channel) {
        console.error("❌ Failed to refetch bidding channel.");
        return;
      }
    } catch (err) {
      console.error("❌ Error refetching bidding channel:", err);
      return;
    }
  }

  // ✅ Check if all items are done
  if (
    !auctionState.sessionItems ||
    auctionState.currentItemIndex >= auctionState.sessionItems.length
  ) {
    await channel.send(`✅ All items completed`);
    auctionState.active = false;
    await finalizeSession(client, config, channel);
    return;
  }

  const item = auctionState.sessionItems[auctionState.currentItemIndex];
  if (!item) {
    console.error("❌ No item at current index, finalizing...");
    await finalizeSession(client, config, channel);
    return;
  }

  // ==========================================
  // 30-SECOND PREVIEW BEFORE ITEM STARTS
  // ==========================================
  const remainingItems =
    auctionState.sessionItems.length - auctionState.currentItemIndex;
  const previewEmbed = new EmbedBuilder()
    .setColor(COLORS.AUCTION)
    .setTitle(`${EMOJI.CLOCK} NEXT ITEM COMING UP`)
    .setDescription(`**${item.item}**`)
    .addFields(
      {
        name: `${EMOJI.BID} Starting Bid`,
        value: `${item.startPrice || 0} points`,
        inline: true,
      },
      {
        name: `${EMOJI.TIME} Duration`,
        value: `${item.duration || 2} minutes`,
        inline: true,
      },
      {
        name: `${EMOJI.LIST} Items Left`,
        value: `${remainingItems} remaining`,
        inline: true,
      }
    );

  // Add boss info if available
  if (item.bossName && item.bossName !== "Unknown") {
    previewEmbed.addFields({
      name: `${EMOJI.TROPHY} Boss`,
      value: `${item.bossName}`,
      inline: true,
    });
  }

  previewEmbed
    .setFooter({ text: "Auction starts in 30 seconds" })
    .setTimestamp();

  await channel.send({
    content: "@everyone",
    embeds: [previewEmbed],
  });

  console.log(`${EMOJI.CLOCK} 30-second preview for: ${item.item}`);

  // Wait 30 seconds before starting
  await new Promise((resolve) => setTimeout(resolve, TIMEOUTS.PREVIEW_DELAY));

  // ==========================================
  // START THE ACTUAL AUCTION
  // ==========================================
  auctionState.currentItem = item;
  auctionState.currentItem.status = "active";
  auctionState.currentItem.bids = [];

  const threadName = `${item.item} | ${item.startPrice || 0}pts${
    item.bossName !== "Unknown" ? ` | ${item.bossName}` : ""
  }`;

  let auctionThread = null;

  try {
    // ✅ Try normal thread creation first
    if (channel.threads && typeof channel.threads.create === "function") {
      auctionThread = await channel.threads.create({
        name: threadName,
        autoArchiveDuration: config.auto_archive_minutes || 60,
        reason: `Auction for ${item.item}`,
      });
    } else {
      // ✅ Fallback: send starter message and create thread from it
      console.warn(
        "⚠️ channel.threads.create not available – using message.startThread() fallback"
      );
      const starterMsg = await channel.send({
        content: `@everyone`,
        embeds: [
          new EmbedBuilder()
            .setColor(COLORS.AUCTION)
            .setTitle(`${EMOJI.AUCTION} New Auction Started`)
            .setDescription(
              `**Item:** ${item.item}\n**Start Price:** ${
                item.startPrice || 0
              } pts\n**Duration:** ${item.duration || 2} min`
            )
            .setFooter({
              text: `Thread created per item • ${getTimestamp()}`,
            }),
        ],
      });

      if (starterMsg && typeof starterMsg.startThread === "function") {
        auctionThread = await starterMsg.startThread({
          name: threadName,
          autoArchiveDuration: config.auto_archive_minutes || 60,
          reason: `Auction for ${item.item}`,
        });
      } else {
        throw new Error(
          "Neither channel.threads.create nor message.startThread are available."
        );
      }
    }

    if (!auctionThread) {
      throw new Error("Failed to create auction thread (unknown reason).");
    }

    // ✅ Send embed inside the thread (only if we used threads.create)
    if (channel.threads && typeof channel.threads.create === "function") {
      await auctionThread.send({
        content: `@everyone`,
        embeds: [
          new EmbedBuilder()
            .setColor(COLORS.AUCTION)
            .setTitle(`${EMOJI.AUCTION} New Auction Started`)
            .setDescription(
              `**Item:** ${item.item}\n**Start Price:** ${
                item.startPrice || 0
              } pts\n**Duration:** ${
                item.duration || 2
              } min\n\n✅ **All ELYSIUM members can bid!**`
            )
            .setFooter({
              text: `Thread created per item • ${getTimestamp()}`,
            }),
        ],
      });
    }
  } catch (err) {
    console.error("❌ Failed to create auction thread:", err);
    console.error(
      "→ Check: Bot needs 'Create Public Threads' & 'Send Messages in Threads' in the bidding channel."
    );

    // Clean up partial state to prevent auction from being stuck
    auctionState.currentItem = null;
    auctionState.active = false;
    saveState();

    try {
      await channel.send(
        `❌ Unable to create thread for **${item.item}**. Thread creation failed. Auction cancelled.`
      );
    } catch (e) {
      console.error("❌ Also failed to send fallback message:", e);
    }
    return;
  }

  // ✅ Set currentItem properly BEFORE starting the auction
  auctionState.currentItem = item;
  item.status = "active";
  item.auctionStartTime = getTimestamp();

  // ✅ Start bidding in this thread
  try {
    // Pass a dummy session for compatibility (no attendance check needed)
    const dummySession = {
      bossName: item.bossName || "Open",
      bossKey: "open",
      attendees: [], // Empty - not used anymore
    };

    await biddingModule.startItemAuction(
      client,
      config,
      auctionThread,
      item,
      dummySession
    );
  } catch (err) {
    console.error("❌ Error starting item auction:", err);
    await channel.send(`❌ Failed to start auction for ${item.item}`);
    return;
  }

  console.log(
    `🕐 Auction started for: ${item.item}. Waiting for bids to finish...`
  );
}

function scheduleItemTimers(client, config, channel) {
  // Validate parameters
  if (!client || !config || !channel || !auctionState.currentItem) {
    console.error(`${EMOJI.ERROR} Invalid parameters to scheduleItemTimers`);
    return;
  }

  const item = auctionState.currentItem;
  const t = item.endTime - Date.now();

  if (t > 60000 && !item.go1) {
    auctionState.timers.go1 = setTimeout(
      async () => await itemGo1(client, config, channel),
      t - 60000
    );
  }
  if (t > 30000 && !item.go2) {
    auctionState.timers.go2 = setTimeout(
      async () => await itemGo2(client, config, channel),
      t - 30000
    );
  }
  if (t > 10000) {
    auctionState.timers.go3 = setTimeout(
      async () => await itemGo3(client, config, channel),
      t - 10000
    );
  }
  auctionState.timers.itemEnd = setTimeout(
    async () => await itemEnd(client, config, channel),
    t
  );
}

async function itemGo1(client, config, channel) {
  if (
    !auctionState.active ||
    !auctionState.currentItem ||
    auctionState.currentItem.go1
  )
    return;
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
          value: item.curWin
            ? `${item.curBid}pts by ${item.curWin}`
            : `${item.startPrice}pts (no bids)`,
        }),
    ],
  });
}

async function itemGo2(client, config, channel) {
  if (
    !auctionState.active ||
    !auctionState.currentItem ||
    auctionState.currentItem.go2
  )
    return;
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
          value: item.curWin
            ? `${item.curBid}pts by ${item.curWin}`
            : `${item.startPrice}pts (no bids)`,
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
          value: item.curWin
            ? `${item.curBid}pts by ${item.curWin}`
            : `${item.startPrice}pts (no bids)`,
        }),
    ],
  });
}

// =======================================================
// SAFE TIMER CLEANUP HELPER
// =======================================================
function safelyCleanupTimers(...timerKeys) {
  timerKeys.forEach((key) => {
    if (auctionState.timers[key]) {
      clearTimeout(auctionState.timers[key]);
      delete auctionState.timers[key];
    }
  });
}

// REPLACE the entire itemEnd function (Line ~600 in auctioneering.js)
// This version removes session iteration - just moves to next item linearly

async function itemEnd(client, config, channel) {
  if (!client || !config || !channel) {
    console.error(`${EMOJI.ERROR} Invalid parameters to itemEnd`);
    return;
  }

  if (!auctionState.active || !auctionState.currentItem) return;

  const item = auctionState.currentItem;
  item.status = "ended";

  // 🧹 Clear timers to avoid duplicates - safe cleanup
  safelyCleanupTimers("itemEnd", "go1", "go2", "go3");

  const timestamp = getTimestamp();
  const totalBids = item.bids ? item.bids.length : 0;
  const bidCount = item.curWin
    ? item.bids.filter((b) => b.user === item.curWin).length
    : 0;

  // 🕐 Record end time
  const auctionEndTime = getCurrentTimestamp();
  const endTimeStr = `${auctionEndTime.date} ${auctionEndTime.time}`;
  item.auctionEndTime = endTimeStr;

  if (item.curWin) {
    // ✅ ITEM SOLD
    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(COLORS.AUCTION)
          .setTitle(`${EMOJI.AUCTION} SOLD!`)
          .setDescription(`**${item.item}** sold!`)
          .addFields(
            {
              name: `${EMOJI.FIRE} Winner`,
              value: `<@${item.curWinId}>`,
              inline: true,
            },
            {
              name: `${EMOJI.BID} Price`,
              value: `${item.curBid} pts`,
              inline: true,
            },
            {
              name: `${EMOJI.INFO} Source`,
              value: "📊 Google Sheet",
              inline: true,
            }
          )
          .setFooter({ text: `${timestamp}` })
          .setTimestamp(),
      ],
    });

    // 🧾 Log result to sheet
    try {
      if (!postToSheetFunc) {
        console.error(`${EMOJI.ERROR} postToSheet not initialized.`);
      } else {
        await getPostToSheet()({
          action: "logAuctionResult",
          itemIndex: item.source === "GoogleSheet" ? item.sheetIndex : -1,
          winner: item.curWin,
          winningBid: item.curBid,
          totalBids,
          bidCount,
          itemSource: item.source,
          itemName: item.item,
          timestamp,
          auctionStartTime: item.auctionStartTime,
          auctionEndTime: endTimeStr,
        });
      }
    } catch (err) {
      console.error(`${EMOJI.ERROR} Failed to log auction result:`, err);
    }

    // 🧩 Add to session history
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
  } else {
    // ⚠️ NO WINNER
    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(COLORS.INFO)
          .setTitle(`${EMOJI.ERROR} NO BIDS`)
          .setDescription(
            `**${item.item}** had no bids (will not be recorded).`
          )
          .addFields({
            name: `${EMOJI.INFO} Note`,
            value: "Item remains in BiddingItems sheet for future auctions.",
            inline: false,
          }),
      ],
    });
  }

  // 🔒 Lock and archive the thread after the auction ends
  try {
    // Check if channel is a thread (type 11 or 12 = public/private thread)
    if (channel && (channel.type === 11 || channel.type === 12)) {
      // Refetch thread to ensure it still exists
      const refreshedThread = await channel.fetch().catch(() => null);
      if (!refreshedThread) {
        console.warn(
          `⚠️ Thread ${channel.id} no longer exists, skipping lock/archive`
        );
      } else {
        // Lock the thread first to prevent new messages
        if (typeof refreshedThread.setLocked === "function") {
          await refreshedThread
            .setLocked(true, "Auction ended")
            .catch((err) => {
              console.warn(
                `⚠️ Failed to lock thread ${refreshedThread.id}:`,
                err.message
              );
            });
          console.log(`🔒 Locked thread for ${item.item}`);
        }

        // Small delay to avoid race conditions with Discord API
        await new Promise((resolve) => setTimeout(resolve, 500));

        // Then archive it to hide from active list
        if (typeof refreshedThread.setArchived === "function") {
          await refreshedThread
            .setArchived(true, "Auction ended")
            .catch((err) => {
              console.warn(
                `⚠️ Failed to archive thread ${refreshedThread.id}:`,
                err.message
              );
            });
          console.log(`📦 Archived thread for ${item.item}`);
        }
      }
    }
  } catch (err) {
    console.warn(`⚠️ Error locking/archiving thread:`, err.message);
  }

  // ✅ Move to next item
  auctionState.currentItemIndex++;
  auctionState.currentItem = null;

  // Get the parent bidding channel for next auction (not the thread)
  let biddingChannel = channel;
  if (
    channel &&
    (channel.type === 11 || channel.type === 12) &&
    channel.parent
  ) {
    // If current channel is a thread, use its parent
    biddingChannel = channel.parent;
  }

  // 🎯 SIMPLIFIED: Just check if there are more items
  if (auctionState.currentItemIndex < auctionState.sessionItems.length) {
    // ➡️ Next item
    console.log(`⏭️ Moving to next item...`);
    await auctionNextItem(client, config, biddingChannel);
  } else {
    // ✅ ALL DONE
    console.log(`🎉 All items completed. Finalizing session.`);
    await finalizeSession(client, config, biddingChannel);
  }
}

// REPLACE the entire finalizeSession function (Line ~750 in auctioneering.js)
// This version already handles tally correctly - just minor cleanup

async function finalizeSession(client, config, channel) {
  // Validate parameters
  if (!client || !config || !channel) {
    console.error(`${EMOJI.ERROR} Invalid parameters to finalizeSession`);
    return;
  }

  if (!auctionState.active) return;

  auctionState.active = false;
  clearAllTimers();

  // Stop cache auto-refresh timer from bidding module
  if (
    biddingModule &&
    typeof biddingModule.stopCacheAutoRefresh === "function"
  ) {
    biddingModule.stopCacheAutoRefresh();
  }

  // Get only items that were sold (have winners)
  const soldItems = auctionState.sessionItems.filter((s) => s.winner);

  const summary = soldItems
    .map((s, i) => `${i + 1}. **${s.item}** 📊: ${s.winner} - ${s.amount}pts`)
    .join("\n");

  const mainEmbed = new EmbedBuilder()
    .setColor(COLORS.SUCCESS)
    .setTitle(`${EMOJI.SUCCESS} Auctioneering Session Complete!`)
    .setDescription(`**${soldItems.length}** item(s) sold`)
    .addFields({
      name: `${EMOJI.LIST} Summary`,
      value: summary || "No sales",
      inline: false,
    })
    .setFooter({ text: "Processing results and submitting to sheets..." })
    .setTimestamp();

  await channel.send({ embeds: [mainEmbed] });

  // STEP 1: Build combined results for tally
  const combinedResults = await buildCombinedResults(config);

  // STEP 2: Submit combined results
  const submitPayload = {
    action: "submitBiddingResults",
    results: combinedResults,
  };

  try {
    if (!postToSheetFunc) {
      console.error(
        `${EMOJI.ERROR} postToSheet not initialized - cannot submit session results`
      );
      console.log(
        `${EMOJI.WARNING} Session results (for manual recovery):`,
        JSON.stringify(submitPayload, null, 2)
      );
    } else {
      const response = await fetch(config.sheet_webhook_url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(submitPayload),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      if (data.status !== "ok") {
        throw new Error(data.message || "Unknown error from sheets");
      }

      console.log(`${EMOJI.SUCCESS} Session results submitted successfully`);

      // Display tally summary in bidding channel
      const winnersWithSpending = combinedResults.filter(
        (r) => r.totalSpent > 0
      );
      if (winnersWithSpending.length > 0) {
        const tallyEmbed = new EmbedBuilder()
          .setColor(COLORS.SUCCESS)
          .setTitle(`${EMOJI.CHART} Bidding Points Tally`)
          .setDescription(
            `**Points spent this session:**\n\n${winnersWithSpending
              .sort((a, b) => b.totalSpent - a.totalSpent)
              .map((r, i) => `${i + 1}. **${r.member}** - ${r.totalSpent} pts`)
              .join("\n")}`
          )
          .setFooter({
            text: `Total: ${winnersWithSpending.reduce(
              (sum, r) => sum + r.totalSpent,
              0
            )} pts spent`,
          })
          .setTimestamp();

        await channel.send({ embeds: [tallyEmbed] });
      }
    }
  } catch (err) {
    console.error(`${EMOJI.ERROR} Failed to submit bidding results:`, err);
    console.log(
      `${EMOJI.WARNING} Session results (for manual recovery):`,
      JSON.stringify(submitPayload, null, 2)
    );
  }

  // STEP 3: Move all auctioned items to ForDistribution sheet
  console.log(`📦 Moving completed auction items to ForDistribution...`);

  // Retry logic with exponential backoff
  const maxRetries = 3;
  let moveSuccess = false;
  let moveData = null;
  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`📦 Move attempt ${attempt}/${maxRetries}...`);

      const moveResponse = await fetch(config.sheet_webhook_url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "moveAuctionedItemsToForDistribution" }),
      });

      if (moveResponse.ok) {
        moveData = await moveResponse.json();
        console.log(`✅ Moved ${moveData.moved || 0} items to ForDistribution`);
        moveSuccess = true;

        // Get admin logs channel
        const mainGuild = await client.guilds.fetch(config.main_guild_id);
        const adminLogs = await mainGuild.channels
          .fetch(config.admin_logs_channel_id)
          .catch(() => null);

        if (adminLogs && moveData.moved > 0) {
          await adminLogs.send(
            `📦 **Items Moved to ForDistribution:** ${moveData.moved} completed auction(s)`
          );
        }

        // Success - break retry loop
        break;
      } else {
        lastError = `HTTP ${moveResponse.status}`;
        console.error(`⚠️ Move attempt ${attempt} failed: ${lastError}`);

        // Retry with exponential backoff (2s, 4s, 8s)
        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 1000;
          console.log(`⏳ Retrying in ${delay/1000}s...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    } catch (err) {
      lastError = err.message;
      console.error(`⚠️ Move attempt ${attempt} error:`, err);

      // Retry with exponential backoff (2s, 4s, 8s)
      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000;
        console.log(`⏳ Retrying in ${delay/1000}s...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  // If all retries failed, notify admin
  if (!moveSuccess) {
    console.error(`❌ Failed to move items after ${maxRetries} attempts: ${lastError}`);

    const mainGuild = await client.guilds.fetch(config.main_guild_id);
    const adminLogs = await mainGuild.channels
      .fetch(config.admin_logs_channel_id)
      .catch(() => null);

    if (adminLogs) {
      await adminLogs.send(
        `⚠️ **ForDistribution Move Failed**\n` +
        `Failed to move items after ${maxRetries} attempts.\n` +
        `**Error:** ${lastError}\n\n` +
        `**Manual Fix:**\n` +
        `Use \`!movetodistribution\` command to retry, or\n` +
        `Run \`moveAllItemsWithWinnersToForDistribution()\` in Google Apps Script editor.`
      );
    }
  }

  // STEP 4: Send detailed summary to admin logs
  const mainGuild = await client.guilds.fetch(config.main_guild_id);
  const adminLogs = await mainGuild.channels
    .fetch(config.admin_logs_channel_id)
    .catch(() => null);

  if (adminLogs) {
    const itemsWithWinners = soldItems.length;
    const totalRevenue = soldItems.reduce((sum, s) => sum + s.amount, 0);

    // Ensure summary is properly formatted and within Discord's limits
    let summaryValue = summary || "No sales recorded";
    if (summaryValue.length > 1024) {
      summaryValue = summaryValue.substring(0, 1020) + "...";
    }
    if (!summaryValue || summaryValue.trim().length === 0) {
      summaryValue = "No sales recorded";
    }

    const adminEmbed = new EmbedBuilder()
      .setColor(COLORS.SUCCESS)
      .setTitle(`${EMOJI.SUCCESS} Session Summary`)
      .setDescription(`Auctioneering session completed successfully`);

    // Add fields one by one with validation
    try {
      adminEmbed.addFields(
        {
          name: `📊 Items Sold`,
          value: `**With Winners:** ${itemsWithWinners}`,
          inline: true,
        },
        {
          name: `💰 Revenue`,
          value: `**Total:** ${totalRevenue}pts`,
          inline: true,
        },
        {
          name: `📋 Results`,
          value: summaryValue,
          inline: false,
        }
      );
    } catch (err) {
      console.error(`${EMOJI.ERROR} Error adding fields to embed:`, err);
      // Fallback: try adding fields individually
      adminEmbed.addFields({
        name: `📊 Summary`,
        value: `Items: ${itemsWithWinners} | Revenue: ${totalRevenue}pts`,
        inline: false,
      });
    }

    adminEmbed
      .setFooter({ text: `Session completed by !startauction` })
      .setTimestamp();

    await adminLogs.send({ embeds: [adminEmbed] });
  }

  console.log("🧹 Clearing session data...");
  auctionState.sessionItems = []; // Clear sold items history

  // Clear bidding module cache AND locked points
  const biddingModule = require("./bidding.js");
  biddingModule.clearPointsCache();

  // CRITICAL: Clear all locked points after session
  const biddingState = biddingModule.getBiddingState();
  biddingState.lp = {};
  biddingModule.saveBiddingState();

  console.log("✅ All session data cleared, locked points released");

  // Save state if config is available
  if (cfg && cfg.sheet_webhook_url) {
    await saveAuctionState(cfg.sheet_webhook_url).catch((err) => {
      console.error(`${EMOJI.ERROR} Failed to save state:`, err);
    });
  }
}

async function buildCombinedResults(config) {
  // Fetch fresh points from sheet
  const response = await fetch(config.sheet_webhook_url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "getBiddingPoints" }),
  });

  if (!response.ok) {
    console.error(
      `${EMOJI.ERROR} Failed to fetch bidding points: HTTP ${response.status}`
    );
    return [];
  }

  const data = await response.json();
  const allPoints = data.points || {};
  const allMembers = Object.keys(allPoints);

  // Combine all winners from session
  const winners = {};
  auctionState.sessionItems.forEach((item) => {
    const normalizedWinner = normalizeUsername(item.winner);
    winners[normalizedWinner] = (winners[normalizedWinner] || 0) + item.amount;
  });

  // Build results for ALL members (including 0s for clean logs)
  const results = allMembers.map((m) => {
    const normalizedMember = normalizeUsername(m);
    return {
      member: m,
      totalSpent: winners[normalizedMember] || 0,
    };
  });

  console.log(
    `${EMOJI.CHART} Built results: ${
      results.filter((r) => r.totalSpent > 0).length
    } winners out of ${results.length} members`
  );

  return results;
}

function pauseSession() {
  if (!auctionState.active || auctionState.paused) return false;
  auctionState.paused = true;
  auctionState.pausedTime = Date.now();

  Object.values(auctionState.timers).forEach((t) => clearTimeout(t));
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

async function stopCurrentItem(client, config, channel) {
  if (!auctionState.active || !auctionState.currentItem) {
    console.warn("⚠️ No active item to stop.");
    return false;
  }

  // 🧹 Clear timers safely
  safelyCleanupTimers("itemEnd", "go1", "go2", "go3");

  const item = auctionState.currentItem;

  if (item.status === "ended") {
    console.warn("⚠️ Item already ended — skipping force stop.");
    return false;
  }

  console.log(`🛑 Forced stop for: ${item.item}`);

  // ✅ Announce forced stop in admin logs
  try {
    const guild = await client.guilds.fetch(config.main_guild_id);
    const adminLogs = await guild.channels
      .fetch(config.admin_logs_channel_id)
      .catch(() => null);

    if (adminLogs) {
      await adminLogs.send({
        embeds: [
          new EmbedBuilder()
            .setColor(COLORS.WARNING)
            .setTitle(`${EMOJI.STOP} Auction Force-Stopped`)
            .setDescription(`**${item.item}** manually finalized by admin.`)
            .addFields(
              {
                name: `${EMOJI.BID} Highest Bid`,
                value: item.curBid
                  ? `${item.curBid} pts by ${item.curWin || "No bids"}`
                  : "No bids placed",
                inline: true,
              },
              {
                name: `${EMOJI.TIME} Status`,
                value: "✅ Finalized early (manual override)",
                inline: true,
              }
            )
            .setFooter({ text: "Proceeding to next item automatically..." })
            .setTimestamp(),
        ],
      });
    }
  } catch (err) {
    console.error("❌ Failed to announce force-stop:", err);
  }

  // ✅ Mark as ended and finalize normally
  try {
    item.status = "ended";
    await itemEnd(client, config, channel);
  } catch (err) {
    console.error("❌ Error finalizing forced stop:", err);
  }

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
  Object.values(auctionState.timers).forEach((t) => {
    // Clear both timeouts and intervals
    clearTimeout(t);
    clearInterval(t);
  });
  auctionState.timers = {};
}

function getAuctionState() {
  return auctionState;
}

// ============================================
// QUEUE MANAGEMENT FUNCTIONS
// ============================================

async function handleQueueList(message, biddingState) {
  const auctQueue = auctionState.sessions || [];
  const biddingQueue = biddingState.q || [];

  // Active auction - show sessions
  if (auctionState.active) {
    if (auctQueue.length === 0) {
      return await message.reply(`${EMOJI.LIST} No sessions active`);
    }

    let queueText = "";
    let itemNumber = 1;

    auctQueue.forEach((session, sessionIdx) => {
      const sessionTitle = `🔥 SESSION ${sessionIdx + 1} - ${
        session.bossName
      } (${session.bossKey.split(" ").slice(1).join(" ")})`;

      const attendeeInfo = `👥 Attendees: ${session.attendees.length} members`;

      queueText += `\n**${sessionTitle}**\n`;

      session.items.forEach((item) => {
        const qty = item.quantity > 1 ? ` x${item.quantity}` : "";
        queueText += `${itemNumber}. ${item.item}${qty} - ${item.startPrice}pts • ${item.duration}m\n`;
        itemNumber++;
      });

      queueText += `${attendeeInfo}\n`;
    });

    const totalItems = auctQueue.reduce((sum, s) => sum + s.items.length, 0);

    const embed = new EmbedBuilder()
      .setColor(0x4a90e2)
      .setTitle(`${EMOJI.LIST} Auction Sessions (Active)`)
      .setDescription(queueText)
      .addFields({
        name: `${EMOJI.CHART} Total`,
        value: `${auctQueue.length} session(s), ${totalItems} item(s)`,
        inline: true,
      })
      .setTimestamp();

    return await message.reply({ embeds: [embed] });
  }

  // Preview mode
  const loadingMsg = await message.reply(
    `${EMOJI.CLOCK} Loading items from Google Sheet...`
  );

  const sheetItems = await fetchSheetItems(cfg.sheet_webhook_url);

  if (sheetItems === null) {
    await loadingMsg.edit(
      `${EMOJI.ERROR} Failed to fetch items from Google Sheet.`
    );
    return;
  }

  await errorHandler.safeDelete(loadingMsg, 'message deletion');

  if (sheetItems.length === 0) {
    return await message.reply(
      `${EMOJI.LIST} No items in auction queue.\n\n` +
        `Add items to the **BiddingItems** sheet in Google Sheets with proper boss data.`
    );
  }

  // Group sheet items by boss for preview
  const bossGroups = {};
  const noBossItems = [];

  sheetItems.forEach((item) => {
    const boss = item.boss || "";
    if (!boss) {
      noBossItems.push(item);
      return;
    }

    if (!bossGroups[boss]) {
      bossGroups[boss] = [];
    }
    bossGroups[boss].push(item);
  });

  // 🔧 FIX: Limit items shown to prevent exceeding 4096 character limit
  const MAX_ITEMS_TO_SHOW = 50; // Show first 50 items max
  const MAX_CHARS = 3800; // Leave buffer for headers/footers

  let queueText = "";
  let position = 1;
  let sessionNum = 1;
  let itemsShown = 0;
  let charsUsed = 0;

  // All items must have boss data now
  for (const [boss, items] of Object.entries(bossGroups)) {
    // Check if we've hit limits
    if (itemsShown >= MAX_ITEMS_TO_SHOW || charsUsed >= MAX_CHARS) {
      const remaining = sheetItems.length - itemsShown;
      queueText += `\n*...and ${remaining} more items (use !startauction to see all)*\n`;
      break;
    }

    const sessionHeader = `**🔥 SESSION ${sessionNum} - ${boss}**\n`;
    
    // Estimate chars for this section
    const estimatedChars = sessionHeader.length + 
      items.reduce((sum, item) => {
        const qty = item.quantity > 1 ? ` x${item.quantity}` : "";
        return sum + `${position}. ${item.item}${qty} - ${item.startPrice}pts • ${item.duration}m\n`.length;
      }, 0) + 30; // +30 for attendance line

    // Check if adding this session would exceed limits
    if (charsUsed + estimatedChars > MAX_CHARS && itemsShown > 0) {
      const remaining = sheetItems.length - itemsShown;
      queueText += `\n*...and ${remaining} more items in ${Object.keys(bossGroups).length - sessionNum + 1} more sessions*\n`;
      break;
    }

    queueText += sessionHeader;
    
    for (const item of items) {
      if (itemsShown >= MAX_ITEMS_TO_SHOW) break;
      
      const qty = item.quantity > 1 ? ` x${item.quantity}` : "";
      const itemLine = `${position}. ${item.item}${qty} - ${item.startPrice}pts • ${item.duration}m\n`;
      queueText += itemLine;
      charsUsed += itemLine.length;
      position++;
      itemsShown++;
    }
    
    const attendanceLine = `👥 Attendance required\n\n`;
    queueText += attendanceLine;
    charsUsed += sessionHeader.length + attendanceLine.length;
    sessionNum++;
  }

  // Items without boss
  if (noBossItems.length > 0 && itemsShown < MAX_ITEMS_TO_SHOW) {
    queueText += `**⚠️ ITEMS WITHOUT BOSS (Will be skipped)**\n`;
    noBossItems.slice(0, 5).forEach((item) => {
      queueText += `• ${item.item} - Missing boss data\n`;
    });
    if (noBossItems.length > 5) {
      queueText += `*...and ${noBossItems.length - 5} more*\n`;
    }
  }

  const footerNote = `\n**ℹ️ Note:** Order shown is how items will auction when you run \`!startauction\`\n**⚠️ All items require attendance at the corresponding boss spawn.**`;
  queueText += footerNote;

  const totalSessions = Object.keys(bossGroups).length;
  const totalItems = sheetItems.length;

  const embed = new EmbedBuilder()
    .setColor(0x4a90e2)
    .setTitle(`${EMOJI.LIST} Auction Queue (Preview)`)
    .setDescription(queueText)
    .addFields(
      {
        name: `${EMOJI.FIRE} Sessions`,
        value: `${totalSessions}`,
        inline: true,
      },
      {
        name: `${EMOJI.LIST} Total Items`,
        value: `${totalItems}`,
        inline: true,
      }
    )
    .setFooter({
      text: `Showing ${itemsShown}/${totalItems} items • Use !startauction to begin`,
    })
    .setTimestamp();

  await message.reply({ embeds: [embed] });
}

async function handleRemoveItem(message, args, biddingModule) {
  if (args.length === 0) {
    return await message.reply(`${EMOJI.ERROR} Usage: \`!removeitem <name>\``);
  }

  const itemName = args.join(" ");

  // No manual queue anymore - all items come from sheet
  // This command is now deprecated but kept for compatibility
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
          .setDescription(
            `**${removed.item}**${
              removed.quantity > 1 ? ` x${removed.quantity}` : ""
            }`
          )
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
  // No manual queue anymore - this command is deprecated
  return await message.reply(
    `${EMOJI.ERROR} Manual queue has been removed. All items must be added to the BiddingItems Google Sheet with proper boss data.`
  );
}

async function handleMyPoints(message, biddingModule, config) {
  if (auctionState.active) {
    return await message.channel.send(
      `${EMOJI.WARNING} Can't check points during active auction. Wait for session to end.`
    );
  }

  const u = message.member.nickname || message.author.username;

  const freshPts = await fetch(config.sheet_webhook_url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "getBiddingPoints" }),
  })
    .then((r) => r.json())
    .then((d) => d.points || {});

  let userPts = freshPts[u];
  if (userPts === undefined) {
    const match = Object.keys(freshPts).find(
      (n) => n.toLowerCase() === u.toLowerCase()
    );
    userPts = match ? freshPts[match] : null;
  }

  let ptsMsg;
  if (userPts === null || userPts === undefined) {
    ptsMsg = await message.channel.send({
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
    ptsMsg = await message.channel.send({
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

  try {
    await errorHandler.safeDelete(message, 'message deletion');
  } catch (e) {
    console.warn(
      `${EMOJI.WARNING} Could not delete user message: ${e.message}`
    );
  }

  setTimeout(async () => {
    await errorHandler.safeDelete(ptsMsg, 'message deletion');
  }, 30000);
}

async function handleBidStatus(message, config) {
  const statEmbed = new EmbedBuilder()
    .setColor(0x4a90e2)
    .setTitle(`${EMOJI.CHART} Auction Status`);

  if (auctionState.active && auctionState.currentItem) {
    const timeLeft = auctionState.paused
      ? `${EMOJI.PAUSE} PAUSED (${fmtTime(
          auctionState.currentItem.endTime - Date.now()
        )})`
      : fmtTime(auctionState.currentItem.endTime - Date.now());

    statEmbed.addFields(
      {
        name: `${EMOJI.FIRE} Active`,
        value: `${auctionState.currentItem.item}`,
        inline: true,
      },
      {
        name: `${EMOJI.BID} Current Bid`,
        value: `${auctionState.currentItem.curBid}pts`,
        inline: true,
      },
      { name: `${EMOJI.TIME} Time Left`, value: timeLeft, inline: true }
    );
  } else {
    statEmbed.addFields({
      name: `${EMOJI.FIRE} Status`,
      value: `${EMOJI.SUCCESS} Ready - No active auction`,
      inline: false,
    });
  }

  // Show remaining items in active sessions
  if (
    auctionState.active &&
    auctionState.sessions &&
    auctionState.sessions.length > 0
  ) {
    const remainingItems = [];
    for (
      let i = auctionState.currentSessionIndex;
      i < auctionState.sessions.length;
      i++
    ) {
      const session = auctionState.sessions[i];
      const startIdx =
        i === auctionState.currentSessionIndex
          ? auctionState.currentItemIndex + 1
          : 0;
      for (
        let j = startIdx;
        j < session.items.length && remainingItems.length < 5;
        j++
      ) {
        const item = session.items[j];
        remainingItems.push(
          `${remainingItems.length + 1}. ${item.item}${
            item.quantity > 1 ? ` x${item.quantity}` : ""
          }`
        );
      }
      if (remainingItems.length >= 5) break;
    }

    if (remainingItems.length > 0) {
      const totalRemaining = auctionState.sessions
        .slice(auctionState.currentSessionIndex)
        .reduce((sum, s, idx) => {
          const startIdx = idx === 0 ? auctionState.currentItemIndex + 1 : 0;
          return sum + (s.items.length - startIdx);
        }, 0);

      statEmbed.addFields({
        name: `${EMOJI.LIST} Remaining Items`,
        value:
          remainingItems.join("\n") +
          (totalRemaining > 5 ? `\n*...+${totalRemaining - 5} more*` : ""),
      });
    }
  }

  statEmbed.setFooter({ text: "Use !auction to add items" }).setTimestamp();

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
        .setDescription(
          `**${auctionState.currentItem.item}**\n\nRefund all locked points?`
        )
        .setFooter({ text: `${EMOJI.SUCCESS} yes / ${EMOJI.ERROR} no` }),
    ],
  });

  await canMsg.react(EMOJI.SUCCESS);
  await canMsg.react(EMOJI.ERROR);

  try {
    const canCol = await canMsg.awaitReactions({
      filter: (r, u) =>
        [EMOJI.SUCCESS, EMOJI.ERROR].includes(r.emoji.name) &&
        u.id === message.author.id,
      max: 1,
      time: TIMEOUTS.CONFIRMATION,
      errors: ["time"],
    });

    if (canCol.first().emoji.name === EMOJI.SUCCESS) {
      await errorHandler.safeRemoveReactions(canMsg, 'reaction removal');
      // Unlock points for current bidder
      const biddingState = biddingModule.getBiddingState();
      if (auctionState.currentItem && auctionState.currentItem.curWin) {
        const amt = biddingState.lp[auctionState.currentItem.curWin] || 0;
        biddingState.lp[auctionState.currentItem.curWin] = 0;
        biddingModule.saveBiddingState();
      }

      const itemName = auctionState.currentItem
        ? auctionState.currentItem.item
        : "Unknown Item";
      await message.channel.send(
        `${EMOJI.ERROR} **${itemName}** canceled. Points refunded.`
      );

      // Lock and archive the cancelled item's thread
      const thread = message.channel;
      if (thread && (thread.type === 11 || thread.type === 12)) {
        try {
          // Refetch thread to ensure it still exists
          const refreshedThread = await thread.fetch().catch(() => null);
          if (!refreshedThread) {
            console.warn(
              `⚠️ Thread ${thread.id} no longer exists, skipping lock/archive`
            );
          } else {
            if (typeof refreshedThread.setLocked === "function") {
              await refreshedThread
                .setLocked(true, "Item cancelled")
                .catch((err) => {
                  console.warn(
                    `⚠️ Failed to lock cancelled thread:`,
                    err.message
                  );
                });
              console.log(`🔒 Locked cancelled thread`);
            }

            // Small delay to avoid race conditions with Discord API
            await new Promise((resolve) => setTimeout(resolve, 500));

            if (typeof refreshedThread.setArchived === "function") {
              await refreshedThread
                .setArchived(true, "Item cancelled")
                .catch((err) => {
                  console.warn(
                    `⚠️ Failed to archive cancelled thread:`,
                    err.message
                  );
                });
              console.log(`📦 Archived cancelled thread`);
            }
          }
        } catch (err) {
          console.warn(`⚠️ Error closing cancelled thread:`, err.message);
        }
      }

      // Move to next item in sessions (use parent channel for next item)
      const parentChannel = thread.parent || message.channel;
      auctionState.currentItem = null;
      auctionState.currentItemIndex++;
      auctionState.timers.nextItem = setTimeout(async () => {
        await auctionNextItem(message.client, cfg, parentChannel);
      }, 20000);
    } else {
      await errorHandler.safeRemoveReactions(canMsg, 'reaction removal');
    }
  } catch (e) {
    await errorHandler.safeRemoveReactions(canMsg, 'reaction removal');
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
        .setDescription(
          `**${auctionState.currentItem.item}**\n\nMark as no sale, move to next?`
        )
        .setFooter({ text: `${EMOJI.SUCCESS} yes / ${EMOJI.ERROR} no` }),
    ],
  });

  await skpMsg.react(EMOJI.SUCCESS);
  await skpMsg.react(EMOJI.ERROR);

  try {
    const skpCol = await skpMsg.awaitReactions({
      filter: (r, u) =>
        [EMOJI.SUCCESS, EMOJI.ERROR].includes(r.emoji.name) &&
        u.id === message.author.id,
      max: 1,
      time: TIMEOUTS.CONFIRMATION,
      errors: ["time"],
    });

    if (skpCol.first().emoji.name === EMOJI.SUCCESS) {
      await errorHandler.safeRemoveReactions(skpMsg, 'reaction removal');
      // Unlock points for current bidder
      const biddingState = biddingModule.getBiddingState();
      if (auctionState.currentItem && auctionState.currentItem.curWin) {
        const amt = biddingState.lp[auctionState.currentItem.curWin] || 0;
        biddingState.lp[auctionState.currentItem.curWin] = 0;
        biddingModule.saveBiddingState();
      }

      const itemName = auctionState.currentItem
        ? auctionState.currentItem.item
        : "Unknown Item";
      await message.channel.send(`⭐️ **${itemName}** skipped (no sale).`);

      // Lock and archive the skipped item's thread
      const thread = message.channel;
      if (thread && (thread.type === 11 || thread.type === 12)) {
        try {
          // Refetch thread to ensure it still exists
          const refreshedThread = await thread.fetch().catch(() => null);
          if (!refreshedThread) {
            console.warn(
              `⚠️ Thread ${thread.id} no longer exists, skipping lock/archive`
            );
          } else {
            if (typeof refreshedThread.setLocked === "function") {
              await refreshedThread
                .setLocked(true, "Item skipped")
                .catch((err) => {
                  console.warn(
                    `⚠️ Failed to lock skipped thread:`,
                    err.message
                  );
                });
              console.log(`🔒 Locked skipped thread`);
            }

            // Small delay to avoid race conditions with Discord API
            await new Promise((resolve) => setTimeout(resolve, 500));

            if (typeof refreshedThread.setArchived === "function") {
              await refreshedThread
                .setArchived(true, "Item skipped")
                .catch((err) => {
                  console.warn(
                    `⚠️ Failed to archive skipped thread:`,
                    err.message
                  );
                });
              console.log(`📦 Archived skipped thread`);
            }
          }
        } catch (err) {
          console.warn(`⚠️ Error closing skipped thread:`, err.message);
        }
      }

      // Move to next item in sessions (use parent channel for next item)
      const parentChannel = thread.parent || message.channel;
      auctionState.currentItem = null;
      auctionState.currentItemIndex++;
      auctionState.timers.nextItem = setTimeout(async () => {
        await auctionNextItem(message.client, cfg, parentChannel);
      }, 20000);
    } else {
      await errorHandler.safeRemoveReactions(skpMsg, 'reaction removal');
    }
  } catch (e) {
    await errorHandler.safeRemoveReactions(skpMsg, 'reaction removal');
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
        [EMOJI.SUCCESS, EMOJI.ERROR].includes(r.emoji.name) &&
        u.id === message.author.id,
      max: 1,
      time: TIMEOUTS.CONFIRMATION,
      errors: ["time"],
    });

    if (fsCol.first().emoji.name === EMOJI.SUCCESS) {
      await errorHandler.safeRemoveReactions(fsMsg, 'reaction removal');
      await biddingModule.submitSessionTally(config, auctionState.sessionItems);
      await message.reply(`${EMOJI.SUCCESS} Results submitted!`);
      auctionState.sessionItems = [];
    } else {
      await errorHandler.safeRemoveReactions(fsMsg, 'reaction removal');
    }
  } catch (e) {
    await errorHandler.safeRemoveReactions(fsMsg, 'reaction removal');
  }
}

function updateCurrentItemState(updates) {
  if (!auctionState.currentItem) return false;

  Object.assign(auctionState.currentItem, updates);
  console.log(`${EMOJI.SUCCESS} Item state updated:`, Object.keys(updates));
  return true;
}

// ADD this function to auctioneering.js (around line 1100, before module.exports)
// This is called by !endauction to force-end the entire session

async function endAuctionSession(client, config, channel) {
  console.log(`🛑 Ending auction session (forced by admin)...`);

  if (!auctionState.active) {
    console.log(`${EMOJI.WARNING} No active auction to end`);
    return;
  }

  // Clear all timers
  clearAllTimers();

  // If there's a current item, mark it as cancelled
  if (
    auctionState.currentItem &&
    auctionState.currentItem.status === "active"
  ) {
    auctionState.currentItem.status = "cancelled";

    // Try to notify in the current item thread if possible
    try {
      const currentThread = auctionState.currentItem.thread;
      if (currentThread && typeof currentThread.send === "function") {
        await currentThread.send({
          embeds: [
            new EmbedBuilder()
              .setColor(COLORS.ERROR)
              .setTitle(`${EMOJI.ERROR} Auction Cancelled`)
              .setDescription(`This auction was ended by an administrator.`),
          ],
        });

        // Archive the thread
        if (typeof currentThread.setArchived === "function") {
          await currentThread
            .setArchived(true, "Session ended by admin")
            .catch(() => {});
        }
      }
    } catch (err) {
      console.warn(`⚠️ Could not notify current item thread:`, err.message);
    }
  }

  // Finalize the session (submit completed items, clear state)
  await finalizeSession(client, config, channel);

  console.log(`✅ Auction session ended successfully`);
}

async function handleMoveToDistribution(message, config, client) {
  console.log(`📦 Admin triggered manual ForDistribution move...`);

  try {
    // Send processing message
    const statusMsg = await message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(COLORS.INFO)
          .setTitle(`${EMOJI.CLOCK} Moving Items to ForDistribution`)
          .setDescription(
            `Scanning BiddingItems sheet for completed auctions...\n\n` +
            `This may take a few seconds.`
          ),
      ],
    });

    // Call the Google Sheets function with retry logic
    const maxRetries = 3;
    let moveSuccess = false;
    let moveData = null;
    let lastError = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`📦 Move attempt ${attempt}/${maxRetries}...`);

        const moveResponse = await fetch(config.sheet_webhook_url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "moveAuctionedItemsToForDistribution" }),
        });

        if (moveResponse.ok) {
          moveData = await moveResponse.json();
          console.log(`✅ Moved ${moveData.moved || 0} items to ForDistribution`);
          moveSuccess = true;
          break; // Success - exit retry loop
        } else {
          lastError = `HTTP ${moveResponse.status}`;
          console.error(`⚠️ Move attempt ${attempt} failed: ${lastError}`);

          // Retry with exponential backoff (2s, 4s, 8s)
          if (attempt < maxRetries) {
            const delay = Math.pow(2, attempt) * 1000;
            console.log(`⏳ Retrying in ${delay/1000}s...`);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      } catch (err) {
        lastError = err.message;
        console.error(`⚠️ Move attempt ${attempt} error:`, err);

        // Retry with exponential backoff (2s, 4s, 8s)
        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 1000;
          console.log(`⏳ Retrying in ${delay/1000}s...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    // Update status message with result
    if (moveSuccess) {
      await statusMsg.edit({
        embeds: [
          new EmbedBuilder()
            .setColor(COLORS.SUCCESS)
            .setTitle(`${EMOJI.SUCCESS} Items Moved Successfully`)
            .setDescription(
              `**${moveData.moved || 0} item(s)** moved from BiddingItems to ForDistribution\n\n` +
              `**${moveData.skipped || 0} item(s)** skipped (no winner)\n` +
              `**${moveData.total || 0} total items** processed`
            )
            .addFields({
              name: `${EMOJI.INFO} Details`,
              value:
                `Items with winners have been:\n` +
                `✅ Copied to ForDistribution sheet\n` +
                `✅ Removed from BiddingItems sheet\n\n` +
                `Items without winners remain in BiddingItems for future auctions.`,
              inline: false,
            })
            .setFooter({
              text: `Check the ForDistribution sheet in Google Sheets`,
            })
            .setTimestamp(),
        ],
      });

      // Log to admin logs
      const mainGuild = await client.guilds.fetch(config.main_guild_id);
      const adminLogs = await mainGuild.channels
        .fetch(config.admin_logs_channel_id)
        .catch(() => null);

      if (adminLogs && moveData.moved > 0) {
        await adminLogs.send(
          `📦 **Manual ForDistribution Move**\n` +
          `Triggered by <@${message.author.id}>\n` +
          `**Moved:** ${moveData.moved} items | **Skipped:** ${moveData.skipped} items`
        );
      }
    } else {
      // Failed after all retries
      await statusMsg.edit({
        embeds: [
          new EmbedBuilder()
            .setColor(COLORS.ERROR)
            .setTitle(`${EMOJI.ERROR} Move Failed`)
            .setDescription(
              `Failed to move items after ${maxRetries} attempts.\n\n` +
              `**Error:** ${lastError}`
            )
            .addFields({
              name: `${EMOJI.WARNING} Possible Causes`,
              value:
                `• Google Sheets API timeout\n` +
                `• Network connectivity issues\n` +
                `• Sheet permissions problem\n` +
                `• Webhook URL misconfigured`,
              inline: false,
            }, {
              name: `${EMOJI.INFO} Manual Fix`,
              value:
                `Open Google Sheets and run:\n` +
                `\`\`\`\nmoveAllItemsWithWinnersToForDistribution()\n\`\`\`\n` +
                `from the Apps Script editor (Extensions → Apps Script)`,
              inline: false,
            })
            .setFooter({
              text: `Contact support if issue persists`,
            })
            .setTimestamp(),
        ],
      });
    }
  } catch (err) {
    console.error(`❌ handleMoveToDistribution error:`, err);
    await message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(COLORS.ERROR)
          .setTitle(`${EMOJI.ERROR} Command Error`)
          .setDescription(
            `An unexpected error occurred:\n\`\`\`${err.message}\`\`\``
          ),
      ],
    });
  }
}

module.exports = {
  initialize,
  itemEnd,
  startAuctioneering,
  auctionNextItem,
  endAuctionSession,
  getAuctionState: () => auctionState,
  canUserBid,
  setPostToSheet,
  getPostToSheet,
  pauseSession,
  resumeSession,
  stopCurrentItem,
  extendCurrentItem,
  updateCurrentItemState,
  handleQueueList,
  handleRemoveItem,
  handleClearQueue,
  handleMyPoints,
  handleBidStatus,
  handleCancelItem,
  handleSkipItem,
  handleForceSubmitResults,
  handleMoveToDistribution,
  getCurrentSessionBoss: () => currentSessionBoss,
};
