/**
 * ELYSIUM Auctioneering System v2.1 - FIXED
 * Single-session management with state persistence
 * Critical fixes: Auto-save state, bid routing, confirmation handling
 */

const { EmbedBuilder } = require("discord.js");
const fetch = require("node-fetch");
const { Timeout } = require("timers");

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
        timeout: 10000, // 10 second timeout
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
        if (key === 'timers' || key === 'currentSession') return undefined;
        if (typeof value === "object" && value !== null) {
          if (seen.has(value)) return undefined;
          seen.add(value);
        }
        return value;
      });
    };

    // 🧩 Clean item (avoid timers and circular data)
    const cleanItem = auctionState.currentItem && typeof auctionState.currentItem === "object"
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
        itemQueue: [],
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
      `❌ Invalid channel type (${channel.type}) — must be text or announcement channel.`
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

  const biddingState = biddingModule.getBiddingState();
  const queueItems = biddingState.q || [];

  // Calculate week sheet name
  const attendance = require("./attendance.js");
  const sundayDate = attendance.getSundayOfWeek();
  const weekSheetName = `ELYSIUM_WEEK_${sundayDate}`;

  // Group items by boss
  const sessions = [];
  const bossGroups = {};
  const manualItems = [];

  // Manual queue items first (open to all)
  queueItems.forEach((item) => {
    const qty = item.quantity || 1;
    for (let q = 0; q < qty; q++) {
      manualItems.push({
        ...item,
        quantity: 1,
        batchNumber: qty > 1 ? q + 1 : null,
        batchTotal: qty > 1 ? qty : null,
        source: "QueueList",
        skipAttendance: true,
      });
    }
  });

  if (manualItems.length > 0) {
    sessions.push({
      bossName: "OPEN",
      bossKey: null,
      items: manualItems,
      attendees: [],
    });
  }

  // Group sheet items by boss
  sheetItems.forEach((item, idx) => {
    const bossData = (item.boss || "").trim();
    if (!bossData) {
      console.warn(`⚠️ Item ${item.item} has no boss data, skipping`);
      return;
    }

    // Parse boss: "EGO 10/27/2025 5:57:00"
    const match = bossData.match(
      /^(.+?)\s+(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})$/
    );
    if (!match) {
      console.warn(`⚠️ Invalid boss format: ${bossData}`);
      return;
    }

    const boss = match[1].trim().toUpperCase();
    const month = match[2].padStart(2, "0");
    const day = match[3].padStart(2, "0");
    const year = match[4].slice(-2);
    const hour = match[5].padStart(2, "0");
    const minute = match[6].padStart(2, "0");

    const bossKey = `${boss} ${month}/${day}/${year} ${hour}:${minute}`;

    if (!bossGroups[bossKey]) {
      bossGroups[bossKey] = [];
    }

    const qty = parseInt(item.quantity) || 1;
    for (let q = 0; q < qty; q++) {
      bossGroups[bossKey].push({
        ...item,
        quantity: 1,
        batchNumber: qty > 1 ? q + 1 : null,
        batchTotal: qty > 1 ? qty : null,
        source: "GoogleSheet",
        sheetIndex: idx,
        bossName: boss,
        bossKey: bossKey,
        skipAttendance: true,
      });
    }
  });

  // Convert boss groups to sessions
  for (const [bossKey, items] of Object.entries(bossGroups)) {
    sessions.push({
      bossName: items[0].bossName,
      bossKey: bossKey,
      items: items,
      attendees: [],
    });
  }

  if (sessions.length === 0) {
    await channel.send(`❌ No items to auction`);
    return;
  }

  // Load attendance for each boss session
  for (const session of sessions) {
    session.attendees = []; // Open session, anyone can bid
  }
  console.log(
    "⚙️ Attendance check disabled — all sessions open to all members."
  );

  auctionState.active = true;
  auctionState.sessions = sessions;
  auctionState.currentSessionIndex = 0;
  auctionState.currentItemIndex = 0;
  auctionState.sessionItems = [];

  // Show preview
  const preview = sessions
    .map((s, i) => {
      const sessionType = s.bossKey ? `${s.bossName}` : "OPEN (No Boss)";
      const attendeeInfo = s.bossKey
        ? ` - ${s.attendees.length} attendees`
        : " - Open to all";
      return `${i + 1}. **${sessionType}**: ${
        s.items.length
      } item(s)${attendeeInfo}`;
    })
    .join("\n");

  await channel.send({
    embeds: [
      new EmbedBuilder()
        .setColor(COLORS.AUCTION)
        .setTitle(`${EMOJI.FIRE} Auctioneering Started!`)
        .setDescription(
          `**${sessions.length} session(s)** queued\n\n${preview}`
        )
        .setFooter({ text: "Starting first session in 20s..." })
        .setTimestamp(),
    ],
  });

  auctionState.timers.sessionStart = setTimeout(async () => {
    try {
      // Always use the configured bidding channel, not the command channel
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
    }
  }, 20000);
}

function canUserBid(username, currentSession) {
  return true;
}

function getCurrentTimestamp() {
  const d = new Date();
  const manilaTime = new Date(
    d.toLocaleString("en-US", { timeZone: "Asia/Manila" })
  );

  const month = String(manilaTime.getMonth() + 1).padStart(2, "0");
  const day = String(manilaTime.getDate()).padStart(2, "0");
  const year = String(manilaTime.getFullYear()).slice(-2);
  const hours = String(manilaTime.getHours()).padStart(2, "0");
  const mins = String(manilaTime.getMinutes()).padStart(2, "0");

  return {
    date: `${month}/${day}/${year}`,
    time: `${hours}:${mins}`,
    full: `${month}/${day}/${year} ${hours}:${mins}`,
  };
}

// =======================================================
// AUCTION NEXT ITEM (thread per item) — FIXED VERSION
// Prevents overlap, ensures currentItem is set before bids
// =======================================================
async function auctionNextItem(client, config, channel) {
  // ✅ Ensure we’re using a proper guild text channel
  if (![0, 5].includes(channel.type)) {
    console.warn(
      `⚠️ Channel type ${channel.type} invalid — refetching bidding channel...`
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

  // ✅ Log what channel we’re using for clarity
  console.log("🔍 auctionNextItem channel info:", {
    id: channel?.id,
    name: channel?.name,
    type: channel?.type,
    threadsAvailable: !!(
      channel &&
      channel.threads &&
      typeof channel.threads.create === "function"
    ),
  });

  // ✅ Pull current sessions from state
  const sessions = auctionState.sessions;
  if (!sessions || sessions.length === 0) {
    await channel.send(`✅ All sessions completed`);
    auctionState.active = false;
    await finalizeSession(client, config, channel);
    return;
  }

  const session = sessions[auctionState.currentSessionIndex];
  if (!session || session.items.length === 0) {
    auctionState.currentSessionIndex++;
    return auctionNextItem(client, config, channel);
  }

  const item = session.items[auctionState.currentItemIndex];
  if (!item) {
    auctionState.currentSessionIndex++;
    auctionState.currentItemIndex = 0;
    return auctionNextItem(client, config, channel);
  }

  auctionState.currentItem = item;
  auctionState.currentItem.status = "active";
  auctionState.currentItem.bids = [];

  const threadName = `${item.item} | ${item.startPrice || 0}pts | ${
    session.bossName || "OPEN"
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
        "⚠️ channel.threads.create not available — using message.startThread() fallback"
      );
      const starterMsg = await channel.send({
        content: `@everyone`,
        embeds: [
          new EmbedBuilder()
            .setColor(COLORS.AUCTION)
            .setTitle(`${EMOJI.AUCTION} New Auction Started`)
            .setDescription(
              `**Item:** ${item.item}\n**Boss:** ${
                session.bossName || "OPEN"
              }\n**Start Price:** ${item.startPrice || 0} pts\n**Duration:** ${
                item.duration || 2
              } min`
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
              `**Item:** ${item.item}\n**Boss:** ${
                session.bossName || "OPEN"
              }\n**Start Price:** ${item.startPrice || 0} pts\n**Duration:** ${
                item.duration || 2
              } min`
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
    console.error(
      "→ Also confirm config.bidding_channel_id points to a normal text channel."
    );

    try {
      await channel.send(
        `❌ Unable to create thread for **${item.item}**. See logs for details.`
      );
    } catch (e) {
      console.error("❌ Also failed to send fallback message:", e);
    }
    return; // stop here for this item
  }

  // ✅ Set currentItem properly BEFORE starting the auction
  auctionState.currentItem = item;
  item.status = "active";
  item.auctionStartTime = getTimestamp();

  // ✅ Start bidding in this thread
  try {
    await biddingModule.startItemAuction(
      client,
      config,
      auctionThread,
      item,
      session
    );
  } catch (err) {
    console.error("❌ Error starting item auction:", err);
    await channel.send(`❌ Failed to start auction for ${item.item}`);
    return;
  }

  // ✅ DO NOT auto-queue next item immediately
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
// ITEM END — FIXED VERSION
// Ensures next item only starts after completion
// =======================================================
async function itemEnd(client, config, channel) {
  if (!client || !config || !channel) {
    console.error(`${EMOJI.ERROR} Invalid parameters to itemEnd`);
    return;
  }

  if (!auctionState.active || !auctionState.currentItem) return;

  const item = auctionState.currentItem;
  item.status = "ended";

  // 🧹 Clear timers to avoid duplicates
  clearTimeout(auctionState.timers.itemEnd);
  clearTimeout(auctionState.timers.go1);
  clearTimeout(auctionState.timers.go2);
  clearTimeout(auctionState.timers.go3);

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
              value:
                item.source === "GoogleSheet"
                  ? "📊 Google Sheet"
                  : "📝 Manual Queue",
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
          itemIndex: item.source === "GoogleSheet" ? item.sheetIndex + 2 : -1,
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

    // 🧩 Add to session log
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
          .setDescription(`**${item.item}** had no bids and will be requeued.`)
          .addFields({
            name: `${EMOJI.INFO} Source`,
            value:
              item.source === "GoogleSheet"
                ? "📊 Google Sheet (stays in queue)"
                : "📝 Manual Queue (added to sheet)",
            inline: false,
          }),
      ],
    });
  }

  // ✅ Move to next item or session
  const session = auctionState.sessions[auctionState.currentSessionIndex];
  auctionState.currentItemIndex++;

  if (session && auctionState.currentItemIndex < session.items.length) {
    // ➡️ Next item in same session
    auctionState.currentItem = null;
    console.log(`⏭️ Moving to next item in current session...`);
    await auctionNextItem(client, config, channel);
  } else {
    // ✅ End of session
    auctionState.currentSessionIndex++;
    auctionState.currentItemIndex = 0;
    auctionState.currentItem = null;

    if (auctionState.currentSessionIndex < auctionState.sessions.length) {
      console.log(`🔥 Moving to next boss session...`);
      await auctionNextItem(client, config, channel);
    } else {
      // ✅ ALL DONE
      console.log(`🏁 All items completed. Finalizing session.`);
      await finalizeSession(client, config, channel);
    }
  }
  
}

async function finalizeSession(client, config, channel) {
  // Validate parameters
  if (!client || !config || !channel) {
    console.error(`${EMOJI.ERROR} Invalid parameters to finalizeSession`);
    return;
  }

  if (!auctionState.active) return;

  auctionState.active = false;
  clearAllTimers();

  const summary = auctionState.sessionItems
    .map(
      (s, i) =>
        `${i + 1}. **${s.item}** (${
          s.source === "GoogleSheet" ? "📊" : "📝"
        }): ${s.winner} - ${s.amount}pts`
    )
    .join("\n");

  const mainEmbed = new EmbedBuilder()
    .setColor(COLORS.SUCCESS)
    .setTitle(`${EMOJI.SUCCESS} Auctioneering Session Complete!`)
    .setDescription(`**${auctionState.sessionItems.length}** item(s) auctioned`)
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

  // STEP 2: Submit combined results with manual items
  const submitPayload = {
    action: "submitBiddingResults",
    results: combinedResults,
    manualItems: manualItemsAuctioned,
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
    }
  } catch (err) {
    console.error(`${EMOJI.ERROR} Failed to submit bidding results:`, err);
    console.log(
      `${EMOJI.WARNING} Session results (for manual recovery):`,
      JSON.stringify(submitPayload, null, 2)
    );
  }

  // STEP 3: Send detailed summary to admin logs
  const mainGuild = await client.guilds.fetch(config.main_guild_id);
  const adminLogs = await mainGuild.channels
    .fetch(config.admin_logs_channel_id)
    .catch(() => null);

  if (adminLogs) {
    const sheetItemsWithWinners = auctionState.sessionItems.filter(
      (s) => s.source === "GoogleSheet"
    ).length;
    const manualItemsWithWinners = auctionState.sessionItems.filter(
      (s) => s.source === "QueueList"
    ).length;
    const totalRevenue = auctionState.sessionItems.reduce(
      (sum, s) => sum + s.amount,
      0
    );

    const adminEmbed = new EmbedBuilder()
      .setColor(COLORS.SUCCESS)
      .setTitle(`${EMOJI.SUCCESS} Session Summary`)
      .setDescription(`Auctioneering session completed successfully`)
      .addFields(
        {
          name: `📊 Google Sheet Items`,
          value: `**With Winners:** ${sheetItemsWithWinners}`,
          inline: true,
        },
        {
          name: `📝 Manual Items`,
          value: `**Auctioned:** ${manualItemsAuctioned.length}\n**With Winners:** ${manualItemsWithWinners}`,
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

  console.log("🧹 Clearing session caches...");
  attendanceCache = {}; // Clear all attendance data
  currentSessionBoss = null;
  auctionState.sessions = [];
  auctionState.sessionItems = [];
  auctionState.itemQueue = [];
  manualItemsAuctioned = [];

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
    const normalizedWinner = item.winner.toLowerCase().trim();
    winners[normalizedWinner] = (winners[normalizedWinner] || 0) + item.amount;
  });

  // Build results for ALL members (including 0s for clean logs)
  const results = allMembers.map((m) => {
    const normalizedMember = m.toLowerCase().trim();
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
  clearTimeout(auctionState.timers.itemEnd);
  clearTimeout(auctionState.timers.go1);
  clearTimeout(auctionState.timers.go2);
  clearTimeout(auctionState.timers.go3);

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
  Object.values(auctionState.timers).forEach((t) => clearTimeout(t));
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
      const sessionTitle = session.bossKey
        ? `🔥 SESSION ${sessionIdx + 1} - ${session.bossName} (${session.bossKey
            .split(" ")
            .slice(1)
            .join(" ")})`
        : `📋 SESSION ${sessionIdx + 1} - OPEN (No Boss)`;

      const attendeeInfo = session.bossKey
        ? `👥 Attendees: ${session.attendees.length} members`
        : `👥 Open to all`;

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

  await loadingMsg.delete().catch(() => {});

  if (sheetItems.length === 0 && biddingQueue.length === 0) {
    return await message.reply(
      `${EMOJI.LIST} Queue is empty.\n\n` +
        `Add items with:\n` +
        `• \`!auction <item> <price> <duration>\` - Manual queue\n` +
        `• Add to **BiddingItems** sheet in Google Sheets`
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

  let queueText = "";
  let position = 1;
  let sessionNum = 1;

  // Manual queue first
  if (biddingQueue.length > 0) {
    queueText += `**📋 SESSION ${sessionNum} - OPEN (No Boss)**\n`;
    biddingQueue.forEach((item) => {
      const qty = item.quantity > 1 ? ` x${item.quantity}` : "";
      queueText += `${position}. ${item.item}${qty} - ${item.startPrice}pts • ${item.duration}m\n`;
      position++;
    });
    queueText += `👥 Open to all\n\n`;
    sessionNum++;
  }

  // Boss sessions
  for (const [boss, items] of Object.entries(bossGroups)) {
    queueText += `**🔥 SESSION ${sessionNum} - ${boss}**\n`;
    items.forEach((item) => {
      const qty = item.quantity > 1 ? ` x${item.quantity}` : "";
      queueText += `${position}. ${item.item}${qty} - ${item.startPrice}pts • ${item.duration}m\n`;
      position++;
    });
    queueText += `👥 Attendance required\n\n`;
    sessionNum++;
  }

  // Items without boss
  if (noBossItems.length > 0) {
    queueText += `**⚠️ ITEMS WITHOUT BOSS (Will be skipped)**\n`;
    noBossItems.forEach((item) => {
      queueText += `• ${item.item} - Missing boss data\n`;
    });
  }

  queueText += `\n**ℹ️ Note:** Order shown is how items will auction when you run \`!startauction\``;

  const totalSessions =
    Object.keys(bossGroups).length + (biddingQueue.length > 0 ? 1 : 0);
  const totalItems = sheetItems.length + biddingQueue.length;

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
      text: "Use !startauction to begin • Manual items first, then by boss",
    })
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
          .setDescription(
            `**${removed.item}**${
              removed.quantity > 1 ? ` x${removed.quantity}` : ""
            }`
          )
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
  if (auctionState.active) {
    return await message.reply(
      `${EMOJI.ERROR} Cannot clear during active auction`
    );
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
        .setDescription(
          `This will remove **${totalItems} item(s)** from the auction queue.`
        )
        .setFooter({
          text: `${EMOJI.SUCCESS} confirm / ${EMOJI.ERROR} cancel`,
        }),
    ],
  });

  await clearMsg.react(EMOJI.SUCCESS);
  await clearMsg.react(EMOJI.ERROR);

  try {
    const col = await clearMsg.awaitReactions({
      filter: (r, u) =>
        [EMOJI.SUCCESS, EMOJI.ERROR].includes(r.emoji.name) &&
        u.id === message.author.id,
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
    await message.delete().catch(() => {});
  } catch (e) {
    console.warn(
      `${EMOJI.WARNING} Could not delete user message: ${e.message}`
    );
  }

  setTimeout(async () => {
    await ptsMsg.delete().catch(() => {});
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

      await message.channel.send(
        `⭐️ **${auctionState.currentItem.item}** skipped (no sale).`
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
        [EMOJI.SUCCESS, EMOJI.ERROR].includes(r.emoji.name) &&
        u.id === message.author.id,
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
}

function updateCurrentItemState(updates) {
  if (!auctionState.currentItem) return false;

  Object.assign(auctionState.currentItem, updates);
  console.log(`${EMOJI.SUCCESS} Item state updated:`, Object.keys(updates));
  return true;
}

module.exports = {
  initialize,
  startAuctioneering,
  auctionNextItem, // ✅ add this
  getAuctionState: () => auctionState,
  canUserBid,
  setPostToSheet,
  getPostToSheet,
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
  canUserBid,
  getCurrentSessionBoss: () => currentSessionBoss,
};
