/**
 * ELYSIUM Guild Bidding System - Version 6.0 (FULLY ENHANCED)
 * NEW FEATURES:
 * - Cache auto-refresh every 30 minutes during active auctions
 * - Extended preview time (30 seconds)
 * - Concurrent auction protection (mutex)
 * - Better confirmation messages with countdown timers
 * - Emoji consistency throughout
 * - Color-coded embeds (standardized)
 * - Command aliases (!b, !ql, etc.)
 * - Batch auctions (multiple identical items)
 * - Admin action confirmation for destructive commands
 */

const { EmbedBuilder } = require("discord.js");
const fetch = require("node-fetch");
const fs = require("fs");
const { normalizeUsername } = require("./utils/common");

let auctioneering = null;
let cfg = null;

// CONSTANTS
const SF = "./bidding-state.json";
const CT = 10000; // confirm timeout (10s)
const RL = 3000; // rate limit (3s)
const ME = 60; // max extensions (increased from 15 to prevent sniping)
const CACHE_REFRESH_INTERVAL = 30 * 60 * 1000; // 30 minutes
const PREVIEW_TIME = 30000; // 30 seconds

// Timeout constants
const TIMEOUTS = {
  CONFIRMATION: 30000, // 30 seconds - user confirmation timeout
  STALE_CONFIRMATION: 60000, // 60 seconds - stale confirmation cleanup
  NEXT_ITEM_DELAY: 20000, // 20 seconds - delay before next item
  QUICK_DELAY: 5000, // 5 seconds - quick delay for next item
  MESSAGE_DELETE: 3000, // 3 seconds - delay before deleting messages
  GOING_ONCE: 60000, // 60 seconds - "going once" announcement
  GOING_TWICE: 30000, // 30 seconds - "going twice" announcement
  FINAL_CALL: 10000, // 10 seconds - final call announcement
  FINALIZE_DELAY: 2000, // 2 seconds - delay before finalize
};

// Color scheme (consistent throughout)
const COLORS = {
  SUCCESS: 0x00ff00,
  WARNING: 0xffa500,
  ERROR: 0xff0000,
  INFO: 0x4a90e2,
  AUCTION: 0xffd700,
};

// Emoji constants (consistent throughout)
const EMOJI = {
  SUCCESS: "✅",
  ERROR: "❌",
  WARNING: "⚠️",
  INFO: "ℹ️",
  AUCTION: "🔨",
  BID: "💰",
  TIME: "⏱️",
  TROPHY: "🏆",
  FIRE: "🔥",
  LOCK: "🔒",
  CHART: "📊",
  PAUSE: "⏸️",
  PLAY: "▶️",
  CLOCK: "🕐",
  LIST: "📋",
};

// Error message constants (standardized for consistency)
const ERROR_MESSAGES = {
  NO_ROLE: `${EMOJI.ERROR} You need the ELYSIUM role to participate in auctions`,
  NO_POINTS: `${EMOJI.ERROR} You have no bidding points available`,
  CACHE_NOT_LOADED: `${EMOJI.ERROR} Points cache not loaded. Please try again shortly.`,
  CACHE_LOAD_FAILED: `${EMOJI.ERROR} Failed to load bidding points from server`,
  INVALID_BID: `${EMOJI.ERROR} Invalid bid amount. Please enter positive integers only.`,
  INSUFFICIENT_POINTS: `${EMOJI.ERROR} Insufficient points available`,
  RATE_LIMITED: `${EMOJI.CLOCK} Please wait before bidding again (rate limit: 3s)`,
  NO_ACTIVE_AUCTION: `${EMOJI.ERROR} No active auction`,
  NO_ACTIVE_ITEM: `${EMOJI.ERROR} No active auction item`,
  SESSION_UNAVAILABLE: `${EMOJI.ERROR} Session data unavailable. Please contact admin.`,
  AUCTION_IN_PROGRESS: `${EMOJI.WARNING} Auction start already in progress, please wait...`,
  AUCTION_ALREADY_RUNNING: `${EMOJI.ERROR} An auction is already running`,
  NO_ITEMS_QUEUED: `${EMOJI.ERROR} No items in queue`,
};

// Command aliases
const COMMAND_ALIASES = {
  "!b": "!bid",
  "!ql": "!queuelist",
  "!queue": "!queuelist",
  "!rm": "!removeitem",
  "!start": "!startauction",
  "!bstatus": "!bidstatus",
  "!pts": "!mypoints",
  "!mypts": "!mypoints",
  "!mp": "!mypoints",
};

// STATE (Manual queue 'q' removed - all items now from Google Sheets)
let st = {
  a: null, // active auction
  lp: {}, // locked points
  h: [], // history
  th: {}, // timer handles
  pc: {}, // pending confirmations
  sd: null, // session date
  cp: null, // cached points
  ct: null, // cache timestamp
  lb: {}, // last bid time (rate limit)
  pause: false, // is paused
  pauseTimer: null,
  auctionLock: false, // concurrent auction protection
  cacheRefreshTimer: null, // auto-refresh timer
};
let isAdmFunc = null;

// HELPERS
const hasRole = (m) => m.roles.cache.some((r) => r.name === "ELYSIUM");
const isAdm = (m, c) =>
  m.roles.cache.some((r) => c.admin_roles.includes(r.name));
const ts = () => {
  const d = new Date();
  const manilaTime = new Date(
    d.toLocaleString("en-US", { timeZone: "Asia/Manila" })
  );

  return `${String(manilaTime.getMonth() + 1).padStart(2, "0")}/${String(
    manilaTime.getDate()
  ).padStart(2, "0")}/${manilaTime.getFullYear()} ${String(
    manilaTime.getHours()
  ).padStart(2, "0")}:${String(manilaTime.getMinutes()).padStart(2, "0")}`;
};
const fmtDur = (m) =>
  m < 60
    ? `${m}min`
    : m % 60 > 0
    ? `${Math.floor(m / 60)}h ${m % 60}min`
    : `${Math.floor(m / 60)}h`;
const fmtTime = (ms) => {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60),
    sec = s % 60;
  if (m < 60) return sec > 0 ? `${m}m ${sec}s` : `${m}m`;
  const h = Math.floor(m / 60);
  return m % 60 > 0 ? `${h}h ${m % 60}m` : `${h}h`;
};
const avail = (u, tot) => Math.max(0, tot - (st.lp[u] || 0));
const lock = (u, amt) => {
  st.lp[u] = (st.lp[u] || 0) + amt;
  save();
};
const unlock = (u, amt) => {
  st.lp[u] = Math.max(0, (st.lp[u] || 0) - amt);
  if (st.lp[u] === 0) delete st.lp[u];
  save();
};

// STATE PERSISTENCE
let lastSheetSyncTime = 0;
const SHEET_SYNC_INTERVAL = 5 * 60 * 1000; // 5 minutes

function save(forceSync = false) {
  try {
    const { th, pauseTimer, cacheRefreshTimer, ...s } = st;

    // Clean up circular references from pending confirmations
    const cleanState = {
      ...s,
      pc: Object.fromEntries(
        Object.entries(s.pc).map(([key, val]) => {
          const { auctStateRef, auctRef, ...cleanVal } = val;
          return [key, cleanVal];
        })
      ),
    };

    // Always save to local file for quick access (works even on ephemeral Koyeb FS)
    try {
      fs.writeFileSync(SF, JSON.stringify(cleanState, null, 2));
    } catch (fileErr) {
      // On Koyeb, file system might be read-only or restricted
      console.warn(
        "⚠️ Local file save failed (expected on Koyeb):",
        fileErr.message
      );
    }

    // Sync to Google Sheets for persistence across Koyeb restarts
    const now = Date.now();
    const shouldSync =
      forceSync || now - lastSheetSyncTime > SHEET_SYNC_INTERVAL;

    if (cfg && cfg.sheet_webhook_url && shouldSync) {
      lastSheetSyncTime = now;
      saveBiddingStateToSheet().catch((err) => {
        console.error("❌ Background sheet sync failed:", err.message);
      });
      if (forceSync) {
        console.log("📊 Forced state sync to Google Sheets");
      }
    }
  } catch (e) {
    console.error("❌ Save:", e);
  }
}

async function load() {
  try {
    // Try local file first (fast)
    if (fs.existsSync(SF)) {
      const d = JSON.parse(fs.readFileSync(SF, "utf8"));
      st = {
        ...st,
        ...d,
        th: {},
        lb: {},
        pause: false,
        pauseTimer: null,
        auctionLock: false,
        cacheRefreshTimer: null,
      };
      console.log("✅ Loaded state from local file");
      return true;
    }
  } catch (e) {
    console.warn("⚠️ Local file load failed:", e.message);
  }

  // Fallback to Google Sheets (for Koyeb restarts)
  if (cfg && cfg.sheet_webhook_url) {
    console.log("📊 Local file not found, loading from Google Sheets...");
    try {
      const sheetState = await loadBiddingStateFromSheet(cfg.sheet_webhook_url);
      if (sheetState) {
        st = {
          ...st,
          q: sheetState.queue || [],
          a: sheetState.activeAuction || null,
          lp: sheetState.lockedPoints || {},
          h: sheetState.history || [],
          th: {},
          lb: {},
          pause: false,
          pauseTimer: null,
          auctionLock: false,
          cacheRefreshTimer: null,
        };
        console.log("✅ Loaded state from Google Sheets");
        return true;
      }
    } catch (err) {
      console.error("❌ Sheet load failed:", err.message);
    }
  }

  console.log("ℹ️ Starting with fresh state");
  return false;
}

function initializeBidding(config, isAdminFunc, auctioneeringRef) {
  isAdmFunc = isAdminFunc;
  cfg = config;
  auctioneering = auctioneeringRef;

  // Start cleanup schedule for pending confirmations
  startCleanupSchedule();
}

// Add after COLORS constant definition (around line 30)
function getColor(color) {
  return color;
}

// SHEETS API
async function fetchPts(url) {
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "getBiddingPoints" }),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return (await r.json()).points || {};
  } catch (e) {
    console.error("❌ Fetch pts:", e);
    return null;
  }
}

async function submitRes(url, res, time) {
  if (!time || !res || res.length === 0)
    return { ok: false, err: "Missing data" };
  for (let i = 1; i <= 3; i++) {
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "submitBiddingResults",
          results: res,
          timestamp: time,
        }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      if (d.status === "ok") {
        console.log("✅ Submitted");
        return { ok: true, d };
      }
      throw new Error(d.message || "Unknown");
    } catch (e) {
      console.error(`❌ Submit ${i}:`, e.message);
      if (i < 3) await new Promise((x) => setTimeout(x, i * 2000));
      else return { ok: false, err: e.message, res };
    }
  }
}

// CACHE WITH AUTO-REFRESH
async function loadCache(url) {
  // Validate URL parameter
  if (!url || typeof url !== "string") {
    console.error("❌ Invalid URL provided to loadCache");
    return false;
  }

  console.log("🔄 Loading cache...");
  const t0 = Date.now();
  const p = await fetchPts(url);
  if (!p) {
    console.error("❌ Cache fail");
    return false;
  }
  st.cp = p;
  st.ct = Date.now();
  save();
  console.log(
    `✅ Cache: ${Date.now() - t0}ms - ${Object.keys(p).length} members`
  );

  // Start auto-refresh timer if auction is active
  if (st.a && st.a.status === "active") {
    startCacheAutoRefresh(url);
  }

  return true;
}

function startCacheAutoRefresh(url) {
  // Clear existing timer
  if (st.cacheRefreshTimer) {
    clearInterval(st.cacheRefreshTimer);
  }

  // Set up auto-refresh every 30 minutes
  st.cacheRefreshTimer = setInterval(async () => {
    if (st.a && st.a.status === "active") {
      console.log("🔄 Auto-refreshing cache...");
      await loadCache(url);
    } else {
      // Stop refreshing if no active auction
      stopCacheAutoRefresh();
    }
  }, CACHE_REFRESH_INTERVAL);

  console.log("✅ Cache auto-refresh enabled (every 30 minutes)");
}

function stopCacheAutoRefresh() {
  if (st.cacheRefreshTimer) {
    clearInterval(st.cacheRefreshTimer);
    st.cacheRefreshTimer = null;
    console.log("⏹️ Cache auto-refresh stopped");
  }
}

function getPts(u) {
  if (!st.cp) return null;
  let p = st.cp[u];
  if (p === undefined) {
    const m = Object.keys(st.cp).find(
      (n) => n.toLowerCase() === u.toLowerCase()
    );
    p = m ? st.cp[m] : 0;
  }
  return p || 0;
}

function clearCache() {
  console.log("🧹 Clear cache");
  stopCacheAutoRefresh();
  st.cp = null;
  st.ct = null;
  save();
}

// ❌ DEPRECATED: Manual queue functions removed
// All items now come from Google Sheets BiddingItems tab
// These functions are kept commented for reference only
/*
const addQ = (itm, pr, dur, qty = 1) => {
  const a = {
    id: `a_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    item: itm.trim(),
    startPrice: parseInt(pr),
    duration: parseInt(dur),
    quantity: parseInt(qty),
    addedAt: Date.now(),
  };
  st.q.push(a);
  save();
  return a;
};
const rmQ = (itm) => {
  const i = st.q.findIndex((a) => a.item.toLowerCase() === itm.toLowerCase());
  if (i === -1) return null;
  const rm = st.q.splice(i, 1)[0];
  save();
  return rm;
};
const clrQ = () => {
  const c = st.q.length;
  st.q = [];
  save();
  return c;
};
*/

// PAUSE/RESUME
function pauseAuction() {
  if (st.pause || !st.a || st.a.status !== "active") return false;
  st.pause = true;
  st.a.pausedAt = Date.now();
  st.a.remainingTime = st.a.endTime - Date.now();

  ["goingOnce", "goingTwice", "finalCall", "auctionEnd"].forEach((k) => {
    if (st.th[k]) {
      clearTimeout(st.th[k]);
      delete st.th[k];
    }
  });

  console.log(`${EMOJI.PAUSE} PAUSED: ${st.a.remainingTime}ms remaining`);
  save();
  return true;
}

function resumeAuction(cli, cfg) {
  if (!st.pause || !st.a || st.a.status !== "active") return false;
  st.pause = false;

  const wasUnder60 = st.a.remainingTime < 60000;
  if (wasUnder60) {
    st.a.endTime = Date.now() + 60000;
    st.a.goingOnceAnnounced = false;
    st.a.goingTwiceAnnounced = false;
    console.log(
      `${EMOJI.PLAY} RESUME: Extended to 60s (was ${Math.floor(
        st.a.remainingTime / 1000
      )}s)`
    );
  } else {
    st.a.endTime = Date.now() + st.a.remainingTime;
    console.log(`${EMOJI.PLAY} RESUME: ${st.a.remainingTime}ms remaining`);
  }

  delete st.a.pausedAt;
  delete st.a.remainingTime;

  schedTimers(cli, cfg);
  save();
  return true;
}

// AUCTION LIFECYCLE
async function startSess(cli, cfg) {
  if (st.q.length === 0) return { ok: false, msg: "No items" };
  if (st.a) return { ok: false, msg: "Already active" };

  // Concurrent auction protection
  if (st.auctionLock) {
    return {
      ok: false,
      msg: `${EMOJI.WARNING} Auction start already in progress, please wait...`,
    };
  }

  st.auctionLock = true;

  try {
    if (!(await loadCache(cfg.sheet_webhook_url))) {
      return { ok: false, msg: `${EMOJI.ERROR} Cache load failed` };
    }

    st.sd = ts();
    const f = st.q[0];
    await startNext(cli, cfg);
    save();

    return {
      ok: true,
      tot: st.q.length,
      first: f.item,
      cached: Object.keys(st.cp).length,
    };
  } catch (err) {
    console.error(`❌ Auction start failed:`, err);
    throw err;
  } finally {
    // Always release lock, even on error or early return
    st.auctionLock = false;
  }
}

async function startNext(cli, cfg) {
  if (st.q.length === 0) {
    await finalize(cli, cfg);
    return;
  }

  const d = st.q[0];
  const g = await cli.guilds.fetch(cfg.main_guild_id);
  const ch = await g.channels.fetch(cfg.bidding_channel_id);

  const isBatch = d.quantity > 1;
  const threadName = isBatch
    ? `${d.item} x${d.quantity} - ${ts()} | ${d.startPrice}pts | ${fmtDur(
        d.duration
      )}`
    : `${d.item} - ${ts()} | ${d.startPrice}pts | ${fmtDur(d.duration)}`;

  const th = await ch.threads.create({
    name: threadName,
    autoArchiveDuration: 60,
    reason: `Auction: ${d.item}`,
  });

  st.a = {
    ...d,
    threadId: th.id,
    curBid: d.startPrice,
    curWin: null,
    curWinId: null,
    bids: [],
    winners: [], // For batch auctions
    endTime: null,
    extCnt: 0,
    status: "preview",
    go1: false,
    go2: false,
  };

  const previewEmbed = new EmbedBuilder()
    .setColor(getColor(COLORS.AUCTION))
    .setTitle(`${EMOJI.TROPHY} AUCTION STARTING`)
    .setDescription(`**${d.item}**${isBatch ? ` x${d.quantity}` : ""}`)
    .addFields(
      {
        name: `${EMOJI.BID} Starting Bid`,
        value: `${d.startPrice} points`,
        inline: true,
      },
      {
        name: `${EMOJI.TIME} Duration`,
        value: fmtDur(d.duration),
        inline: true,
      },
      {
        name: `${EMOJI.LIST} Items Left`,
        value: `${st.q.length - 1}`,
        inline: true,
      }
    )
    .setFooter({ text: "Starts in 30 seconds" })
    .setTimestamp();

  if (isBatch) {
    previewEmbed.addFields({
      name: `${EMOJI.FIRE} Batch Auction`,
      value: `Top ${d.quantity} bidders will win!`,
      inline: false,
    });
  }

  await th.send({
    content: "@everyone",
    embeds: [previewEmbed],
  });

  st.th.aStart = setTimeout(
    async () => await activate(cli, cfg, th),
    PREVIEW_TIME
  );
  save();
}

async function activate(cli, cfg, th) {
  st.a.status = "active";
  st.a.endTime = Date.now() + st.a.duration * 60000;

  const isBatch = st.a.quantity > 1;

  const activeEmbed = new EmbedBuilder()
    .setColor(COLORS.SUCCESS)
    .setTitle(`${EMOJI.FIRE} BIDDING NOW!`)
    .setDescription(
      `Type \`!bid <amount>\` to bid${
        isBatch
          ? `\n\n**${st.a.quantity} items available** - Top ${st.a.quantity} bidders win!`
          : ""
      }`
    )
    .addFields(
      {
        name: `${EMOJI.BID} Current`,
        value: `${st.a.curBid} pts`,
        inline: true,
      },
      { name: `${EMOJI.TIME} Time`, value: fmtDur(st.a.duration), inline: true }
    )
    .setFooter({
      text: `${EMOJI.CLOCK} 10s confirm • ${EMOJI.LOCK} 3s rate limit`,
    });

  await th.send({ embeds: [activeEmbed] });
  schedTimers(cli, cfg);
  save();
}

function schedTimers(cli, cfg) {
  const a = st.a,
    t = a.endTime - Date.now();
  ["goingOnce", "goingTwice", "finalCall", "auctionEnd"].forEach((k) => {
    if (st.th[k]) clearTimeout(st.th[k]);
  });
  if (t > TIMEOUTS.GOING_ONCE && !a.go1)
    st.th.goingOnce = setTimeout(
      async () => await ann1(cli, cfg),
      t - TIMEOUTS.GOING_ONCE
    );
  if (t > TIMEOUTS.GOING_TWICE && !a.go2)
    st.th.goingTwice = setTimeout(
      async () => await ann2(cli, cfg),
      t - TIMEOUTS.GOING_TWICE
    );
  if (t > TIMEOUTS.FINAL_CALL)
    st.th.finalCall = setTimeout(
      async () => await ann3(cli, cfg),
      t - TIMEOUTS.FINAL_CALL
    );
  st.th.auctionEnd = setTimeout(async () => await endAuc(cli, cfg), t);
}

async function ann1(cli, cfg) {
  const a = st.a;
  if (!a || a.status !== "active" || st.pause) return;
  const g = await cli.guilds.fetch(cfg.main_guild_id),
    th = await g.channels.fetch(a.threadId);
  await th.send({
    content: "@everyone",
    embeds: [
      new EmbedBuilder()
        .setColor(COLORS.WARNING)
        .setTitle(`${EMOJI.WARNING} GOING ONCE!`)
        .setDescription("1 min left")
        .addFields({
          name: `${EMOJI.BID} Current`,
          value: a.curWin
            ? `${a.curBid}pts by ${a.curWin}`
            : `${a.startPrice}pts (no bids)`,
          inline: false,
        }),
    ],
  });
  a.go1 = true;
  save();
}

async function ann2(cli, cfg) {
  const a = st.a;
  if (!a || a.status !== "active" || st.pause) return;
  const g = await cli.guilds.fetch(cfg.main_guild_id),
    th = await g.channels.fetch(a.threadId);
  await th.send({
    content: "@everyone",
    embeds: [
      new EmbedBuilder()
        .setColor(getColor(COLORS.WARNING))
        .setTitle(`${EMOJI.WARNING} GOING TWICE!`)
        .setDescription("30s left")
        .addFields({
          name: `${EMOJI.BID} Current`,
          value: a.curWin
            ? `${a.curBid}pts by ${a.curWin}`
            : `${a.startPrice}pts (no bids)`,
          inline: false,
        }),
    ],
  });
  a.go2 = true;
  save();
}

async function ann3(cli, cfg) {
  const a = st.a;
  if (!a || a.status !== "active" || st.pause) return;
  const g = await cli.guilds.fetch(cfg.main_guild_id),
    th = await g.channels.fetch(a.threadId);
  await th.send({
    content: "@everyone",
    embeds: [
      new EmbedBuilder()
        .setColor(getColor(COLORS.ERROR))
        .setTitle(`${EMOJI.WARNING} FINAL CALL!`)
        .setDescription("10s left")
        .addFields({
          name: `${EMOJI.BID} Current`,
          value: a.curWin
            ? `${a.curBid}pts by ${a.curWin}`
            : `${a.startPrice}pts (no bids)`,
          inline: false,
        }),
    ],
  });
  save();
}

async function endAuc(cli, cfg) {
  const a = st.a;
  if (!a) return;
  a.status = "ended";
  const g = await cli.guilds.fetch(cfg.main_guild_id),
    th = await g.channels.fetch(a.threadId);

  const isBatch = a.quantity > 1;

  if (isBatch && a.bids.length > 0) {
    // Batch auction - determine winners
    const sortedBids = a.bids
      .sort((x, y) => y.amount - x.amount)
      .slice(0, a.quantity);

    a.winners = sortedBids.map((b) => ({
      username: b.user,
      userId: b.userId,
      amount: b.amount,
    }));

    const winnersList = a.winners
      .map((w, i) => `${i + 1}. <@${w.userId}> - ${w.amount}pts`)
      .join("\n");

    await th.send({
      embeds: [
        new EmbedBuilder()
          .setColor(getColor(COLORS.AUCTION))
          .setTitle(`${EMOJI.AUCTION} SOLD!`)
          .setDescription(`**${a.item}** x${a.quantity} sold!`)
          .addFields({
            name: `${EMOJI.TROPHY} Winners`,
            value: winnersList,
            inline: false,
          })
          .setFooter({ text: "Deducted after session" })
          .setTimestamp(),
      ],
    });

    // Add to history
    a.winners.forEach((w) => {
      st.h.push({
        item: a.item,
        winner: w.username,
        winnerId: w.userId,
        amount: w.amount,
        timestamp: Date.now(),
      });
    });
  } else if (a.curWin) {
    // Single item auction
    await th.send({
      embeds: [
        new EmbedBuilder()
          .setColor(getColor(COLORS.AUCTION))
          .setTitle(`${EMOJI.AUCTION} SOLD!`)
          .setDescription(`**${a.item}** sold!`)
          .addFields(
            {
              name: `${EMOJI.TROPHY} Winner`,
              value: `<@${a.curWinId}>`,
              inline: true,
            },
            {
              name: `${EMOJI.BID} Price`,
              value: `${a.curBid}pts`,
              inline: true,
            }
          )
          .setFooter({ text: "Deducted after session" })
          .setTimestamp(),
      ],
    });
    st.h.push({
      item: a.item,
      winner: a.curWin,
      winnerId: a.curWinId,
      amount: a.curBid,
      timestamp: Date.now(),
    });
  } else {
    // No bids
    await th.send({
      embeds: [
        new EmbedBuilder()
          .setColor(COLORS.INFO)
          .setTitle(`${EMOJI.ERROR} NO BIDS`)
          .setDescription(`**${a.item}** - no bids`)
          .setFooter({ text: "Next item..." }),
      ],
    });
  }

  await th
    .setArchived(true, "Ended")
    .catch((err) =>
      console.warn(`⚠️ Failed to archive thread ${th.id}:`, err.message)
    );
  st.q.shift();
  st.a = null;
  save();

  if (st.q.length > 0) {
    const n = st.q[0];
    await th.parent.send(
      `${EMOJI.CLOCK} Next in 20s...\n${EMOJI.LIST} **${n.item}** - ${n.startPrice}pts`
    );
    st.th.next = setTimeout(
      async () => await startNext(cli, cfg),
      TIMEOUTS.NEXT_ITEM_DELAY
    );
  } else {
    setTimeout(async () => await finalize(cli, cfg), TIMEOUTS.FINALIZE_DELAY);
  }
}

async function loadPointsCacheForAuction(url) {
  console.log(`⚡ Loading cache for auction...`);
  const t0 = Date.now();
  const p = await fetchPts(url, false);
  if (!p) {
    console.error(`❌ Cache fail`);
    return false;
  }
  st.cp = p;
  st.ct = Date.now();
  save();
  console.log(
    `✅ Cache: ${Date.now() - t0}ms - ${Object.keys(p).length} members`
  );

  // START AUTO-REFRESH FOR AUCTIONEERING SESSIONS
  startCacheAutoRefresh(url);

  return true;
}

async function submitSessionTally(config, sessionItems) {
  if (!st.cp || sessionItems.length === 0) {
    console.log(`⚠️ No items to tally`);
    return;
  }

  if (!st.sd) st.sd = ts();

  const allMembers = Object.keys(st.cp);
  const winners = {};

  sessionItems.forEach((item) => {
    const normalizedWinner = normalizeUsername(item.winner);
    winners[normalizedWinner] = (winners[normalizedWinner] || 0) + item.amount;
  });

  const res = allMembers.map((m) => {
    const normalizedMember = normalizeUsername(m);
    return {
      member: m,
      totalSpent: winners[normalizedMember] || 0,
    };
  });

  const sub = await submitRes(config.sheet_webhook_url, res, st.sd);

  if (sub.ok) {
    console.log(`✅ Session tally submitted`);
    st.h = [];
    st.sd = null;
    st.lp = {};
    clearCache();
  } else {
    console.error(`❌ Tally submission failed:`, sub.err);
  }
}

async function saveBiddingStateToSheet() {
  try {
    const stateToSave = {
      queue: st.q,
      activeAuction: st.a,
      lockedPoints: st.lp,
      history: st.h,
    };

    await fetch(cfg.sheet_webhook_url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "saveBotState",
        state: stateToSave,
      }),
    });

    console.log(`✅ Bot state saved to sheet`);
  } catch (e) {
    console.error(`❌ Save state:`, e);
  }
}

async function loadBiddingStateFromSheet(url) {
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "getBotState" }),
    });
    if (!r.ok) return null;
    const data = await r.json();
    return data.state || null;
  } catch (e) {
    console.error(`❌ Load state:`, e);
    return null;
  }
}

async function finalize(cli, cfg) {
  const g = await cli.guilds.fetch(cfg.main_guild_id);
  const adm = await g.channels.fetch(cfg.admin_logs_channel_id);
  const bch = await g.channels.fetch(cfg.bidding_channel_id);

  // Stop cache auto-refresh
  stopCacheAutoRefresh();

  if (st.h.length === 0) {
    await bch.send(`${EMOJI.SUCCESS} **Session complete!** No sales.`);
    clearCache();
    st.sd = null;
    st.lp = {};
    save();
    return;
  }

  if (!st.sd) st.sd = ts();

  const allMembers = Object.keys(st.cp || {});

  const winners = {};
  st.h.forEach((a) => {
    const normalizedWinner = normalizeUsername(a.winner);
    winners[normalizedWinner] = (winners[normalizedWinner] || 0) + a.amount;
  });

  const res = allMembers.map((m) => {
    const normalizedMember = normalizeUsername(m);
    return {
      member: m,
      totalSpent: winners[normalizedMember] || 0,
    };
  });

  console.log(`${EMOJI.CHART} FINALIZE DEBUG:`);
  console.log("Winners (normalized):", winners);
  console.log(
    "Non-zero results:",
    res.filter((r) => r.totalSpent > 0)
  );

  const sub = await submitRes(cfg.sheet_webhook_url, res, st.sd);

  if (sub.ok) {
    const wList = st.h
      .map((a) => `• **${a.item}**: ${a.winner} - ${a.amount}pts`)
      .join("\n");
    const e = new EmbedBuilder()
      .setColor(getColor(COLORS.SUCCESS))
      .setTitle(`${EMOJI.SUCCESS} Session Complete!`)
      .setDescription("Results submitted")
      .addFields(
        { name: `${EMOJI.CLOCK} Time`, value: st.sd, inline: true },
        { name: `${EMOJI.TROPHY} Sold`, value: `${st.h.length}`, inline: true },
        {
          name: `${EMOJI.BID} Total`,
          value: `${res.reduce((s, r) => s + r.totalSpent, 0)}`,
          inline: true,
        },
        { name: `${EMOJI.LIST} Winners`, value: wList || "None" },
        {
          name: "👥 Members Updated",
          value: `${res.length} (auto-populated 0 for non-winners)`,
          inline: false,
        }
      )
      .setFooter({ text: "Points deducted" })
      .setTimestamp();
    await bch.send({ embeds: [e] });
    await adm.send({ embeds: [e] });
  } else {
    const d = res
      .filter((r) => r.totalSpent > 0)
      .map((r) => `${r.member}: ${r.totalSpent}pts`)
      .join("\n");
    await adm.send({
      embeds: [
        new EmbedBuilder()
          .setColor(getColor(COLORS.ERROR))
          .setTitle(`${EMOJI.ERROR} Submit Failed`)
          .setDescription(`**Error:** ${sub.err}\n**Time:** ${st.sd}`)
          .addFields({
            name: `${EMOJI.LIST} Manual Entry`,
            value: `\`\`\`\n${d}\n\`\`\``,
          })
          .setTimestamp(),
      ],
    });
    await bch.send(`${EMOJI.ERROR} Submit failed. Admins notified.`);
  }

  st.h = [];
  st.sd = null;
  st.lp = {};
  clearCache();
  save();
}

async function procBidAuctioneering(msg, amt, auctState, auctRef, config) {
  const currentItem = auctState.currentItem;

  // Safety check: Ensure currentItem and currentSession exist
  if (!currentItem) {
    await msg.reply(ERROR_MESSAGES.NO_ACTIVE_ITEM);
    return { ok: false, msg: "No item" };
  }

  const currentSession = currentItem.currentSession;
  if (!currentSession) {
    await msg.reply(ERROR_MESSAGES.SESSION_UNAVAILABLE);
    console.error(`⚠️ Missing currentSession for item: ${currentItem.item}`);
    return { ok: false, msg: "No session" };
  }

  const m = msg.member,
    u = m.nickname || msg.author.username,
    uid = msg.author.id;

  if (!hasRole(m) && !isAdm(m, config)) {
    await msg.reply(ERROR_MESSAGES.NO_ROLE);
    return { ok: false, msg: "No role" };
  }

  // Attendance check removed - all ELYSIUM members can now bid freely
  const now = Date.now();
  if (st.lb[uid] && now - st.lb[uid] < 3000) {
    const wait = Math.ceil((3000 - (now - st.lb[uid])) / 1000);
    await msg.reply(`${EMOJI.CLOCK} Wait ${wait}s (rate limit)`);
    return { ok: false, msg: "Rate limited" };
  }

  const bid = parseInt(amt);
  if (isNaN(bid) || bid <= 0 || !Number.isInteger(bid)) {
    await msg.reply(ERROR_MESSAGES.INVALID_BID);
    return { ok: false, msg: "Invalid" };
  }

  // Boundary check: Prevent unreasonably large bids
  if (bid > 99999999) {
    await msg.reply(
      `${EMOJI.ERROR} Bid amount exceeds maximum allowed (99,999,999pts)`
    );
    return { ok: false, msg: "Too large" };
  }

  if (bid < currentItem.curBid) {
    await msg.reply(`${EMOJI.ERROR} Must be >= ${currentItem.curBid}pts`);
    return { ok: false, msg: "Too low" };
  }

  if (!st.cp) {
    await msg.reply(`${EMOJI.ERROR} Cache not loaded!`);
    return { ok: false, msg: "No cache" };
  }

  const tot = getPts(u);

  if (tot === 0) {
    await msg.reply(`${EMOJI.ERROR} No points`);
    return { ok: false, msg: "No pts" };
  }

  // Calculate locked points ACROSS ALL SYSTEMS (auctioneering uses st.lp from bidding.js)
  const curLocked = st.lp[u] || 0;
  const av = tot - curLocked;

  const isSelf =
    currentItem.curWin && currentItem.curWin.toLowerCase() === u.toLowerCase();
  const needed = isSelf ? Math.max(0, bid - currentItem.curBid) : bid;

  if (needed > av) {
    await msg.reply(
      `${EMOJI.ERROR} **Insufficient!**\n${EMOJI.BID} Total: ${tot}\n${EMOJI.LOCK} Locked: ${curLocked}\n${EMOJI.CHART} Available: ${av}\n${EMOJI.WARNING} Need: ${needed}`
    );
    return { ok: false, msg: "Insufficient" };
  }

  const confEmbed = new EmbedBuilder()
    .setColor(COLORS.AUCTION)
    .setTitle(`${EMOJI.CLOCK} Confirm Your Bid`)
    .setDescription(
      `**Item:** ${currentItem.item}\n` +
        `**Action:** ${
          isSelf ? "Increase your bid" : "Place bid and lock points"
        }\n\n` +
        `⚠️ **By confirming, you agree to:**\n` +
        `• Lock ${needed}pts from your available points\n` +
        `• ${isSelf ? "Increase" : "Place"} your bid to ${bid}pts\n` +
        `• Lose points if you win but didn't attend`
    )
    .addFields(
      { name: `${EMOJI.BID} Your Bid`, value: `${bid}pts`, inline: true },
      {
        name: `${EMOJI.CHART} Current High`,
        value: `${currentItem.curBid}pts`,
        inline: true,
      },
      { name: `💳 Points After`, value: `${av - needed}pts left`, inline: true }
    );

  if (isSelf) {
    confEmbed.addFields({
      name: `${EMOJI.FIRE} Self-Overbid Details`,
      value: `Your current bid: ${currentItem.curBid}pts\nNew bid: ${bid}pts\n**Additional points needed: +${needed}pts**`,
      inline: false,
    });
  }

  confEmbed.setFooter({
    text: `${EMOJI.SUCCESS} YES, PLACE BID / ${EMOJI.ERROR} NO, CANCEL • ${
      isSelf ? "Overbidding yourself" : "Outbidding current leader"
    } • 10s timeout`,
  });

  const conf = await msg.reply({
    content: `<@${uid}> **CONFIRM YOUR BID - React below within 10 seconds**`,
    embeds: [confEmbed],
  });
  await conf.react(EMOJI.SUCCESS);
  await conf.react(EMOJI.ERROR);

  st.pc[conf.id] = {
    userId: uid,
    username: u,
    threadId: null,
    amount: bid,
    timestamp: now,
    origMsgId: msg.id,
    isSelf,
    needed,
    isAuctioneering: true,
    auctStateRef: auctState,
    auctRef: auctRef,
  };
  save();

  st.lb[uid] = now;

  let countdown = 10;
  const countdownInterval = setInterval(async () => {
    countdown--;
    if (countdown > 0 && countdown <= 10 && st.pc[conf.id]) {
      const updatedEmbed = EmbedBuilder.from(confEmbed).setFooter({
        text: `${EMOJI.SUCCESS} confirm / ${EMOJI.ERROR} cancel • ${countdown}s remaining`,
      });
      await conf.edit({ embeds: [updatedEmbed] }).catch(() => {});
    }
  }, 1000);

  // Store countdown interval for cleanup
  st.th[`countdown_${conf.id}`] = countdownInterval;

  st.th[`c_${conf.id}`] = setTimeout(async () => {
    clearInterval(st.th[`countdown_${conf.id}`]);
    delete st.th[`countdown_${conf.id}`];
    if (st.pc[conf.id]) {
      await conf.reactions.removeAll().catch(() => {});
      const timeoutEmbed = EmbedBuilder.from(confEmbed)
        .setColor(COLORS.INFO)
        .setFooter({ text: `${EMOJI.CLOCK} Timed out` });
      await conf.edit({ embeds: [timeoutEmbed] });
      setTimeout(
        async () => await conf.delete().catch(() => {}),
        TIMEOUTS.MESSAGE_DELETE
      );
      delete st.pc[conf.id];
      save();
    }
  }, 10000);

  return { ok: true, confId: conf.id };
}

// BIDDING (OPTIMIZED)
async function procBid(msg, amt, cfg) {
  // CRITICAL FIX: Check if auctioneering is active first
  if (auctioneering && typeof auctioneering.getAuctionState === "function") {
    const auctState = auctioneering.getAuctionState();
    if (auctState && auctState.active && auctState.currentItem) {
      return await procBidAuctioneering(
        msg,
        amt,
        auctState,
        auctioneering,
        cfg
      );
    }
  }

  const a = st.a;
  if (!a) return { ok: false, msg: "No auction" };
  if (a.status !== "active") return { ok: false, msg: "Not started" };
  if (msg.channel.id !== a.threadId) return { ok: false, msg: "Wrong thread" };

  const m = msg.member,
    u = m.nickname || msg.author.username,
    uid = msg.author.id;
  if (!hasRole(m) && !isAdm(m, cfg)) {
    await msg.reply(`${EMOJI.ERROR} Need ELYSIUM role`);
    return { ok: false, msg: "No role" };
  }

  // Rate limit
  const now = Date.now();
  if (st.lb[uid] && now - st.lb[uid] < RL) {
    const wait = Math.ceil((RL - (now - st.lb[uid])) / 1000);
    await msg.reply(`${EMOJI.CLOCK} Wait ${wait}s (rate limit)`);
    return { ok: false, msg: "Rate limited" };
  }

  const bid = parseInt(amt);
  if (isNaN(bid) || bid <= 0 || !Number.isInteger(bid)) {
    await msg.reply(`${EMOJI.ERROR} Invalid bid (integers only)`);
    return { ok: false, msg: "Invalid" };
  }

  if (bid < a.curBid) {
    await msg.reply(`${EMOJI.ERROR} Must be >= ${a.curBid}pts`);
    return { ok: false, msg: "Too low" };
  }

  // Cache check
  if (!st.cp) {
    await msg.reply(`${EMOJI.ERROR} Cache not loaded!`);
    return { ok: false, msg: "No cache" };
  }

  const tot = getPts(u),
    av = avail(u, tot);

  if (tot === 0) {
    await msg.reply(`${EMOJI.ERROR} No points`);
    return { ok: false, msg: "No pts" };
  }

  // Check if self-overbidding
  const isSelf = a.curWin && a.curWin.toLowerCase() === u.toLowerCase();
  const curLocked = st.lp[u] || 0;
  const needed = isSelf ? Math.max(0, bid - curLocked) : bid;

  if (needed > av) {
    await msg.reply(
      `${EMOJI.ERROR} **Insufficient!**\n${EMOJI.BID} Total: ${tot}\n${EMOJI.LOCK} Locked: ${curLocked}\n${EMOJI.CHART} Available: ${av}\n${EMOJI.WARNING} Need: ${needed}`
    );
    return { ok: false, msg: "Insufficient" };
  }

  const confEmbed = new EmbedBuilder()
    .setColor(COLORS.AUCTION)
    .setTitle(`${EMOJI.CLOCK} Confirm Your Bid`)
    .setDescription(
      `**Item:** ${a.item}${
        a.quantity > 1 ? ` (${a.quantity} available)` : ""
      }\n` +
        `**Action:** ${
          isSelf ? "Increase your bid" : "Place bid and lock points"
        }\n\n` +
        `⚠️ **By confirming, you agree to:**\n` +
        `• Lock ${needed}pts from your available points\n` +
        `• ${isSelf ? "Increase" : "Place"} your bid to ${bid}pts\n` +
        `• Lose points if you win but didn't attend`
    )
    .addFields(
      { name: `${EMOJI.BID} Your Bid`, value: `${bid}pts`, inline: true },
      {
        name: `${EMOJI.CHART} Current High`,
        value: `${a.curBid}pts`,
        inline: true,
      },
      { name: "💳 Points After", value: `${av - needed}pts left`, inline: true }
    );

  if (isSelf) {
    confEmbed.addFields({
      name: "🔄 Self-Overbid Details",
      value: `Your current bid: ${a.curBid}pts\nNew bid: ${bid}pts\n**Additional points needed: +${needed}pts**`,
      inline: false,
    });
  }

  confEmbed.setFooter({
    text: `${EMOJI.SUCCESS} YES, PLACE BID / ${EMOJI.ERROR} NO, CANCEL • ${
      isSelf ? "Overbidding yourself" : "Outbidding current leader"
    } • 10s timeout`,
  });

  const conf = await msg.reply({
    content: `<@${uid}> **CONFIRM YOUR BID - React below within 10 seconds**`,
    embeds: [confEmbed],
  });
  await conf.react(EMOJI.SUCCESS);
  await conf.react(EMOJI.ERROR);

  st.pc[conf.id] = {
    userId: uid,
    username: u,
    threadId: a.threadId,
    amount: bid,
    timestamp: now,
    origMsgId: msg.id,
    isSelf,
    needed,
  };
  save();

  st.lb[uid] = now; // Rate limit stamp

  // Countdown timer
  let countdown = 10;
  const countdownInterval = setInterval(async () => {
    countdown--;
    if (countdown > 0 && countdown <= 10 && st.pc[conf.id]) {
      const updatedEmbed = EmbedBuilder.from(confEmbed).setFooter({
        text: `${EMOJI.SUCCESS} confirm / ${EMOJI.ERROR} cancel • ${countdown}s remaining`,
      });
      await conf.edit({ embeds: [updatedEmbed] }).catch(() => {});
    }
  }, 1000);

  // Store countdown interval for cleanup
  st.th[`countdown_${conf.id}`] = countdownInterval;

  // Check if bid in last 10 seconds - PAUSE
  const timeLeft = a.endTime - Date.now();
  if (timeLeft <= 10000 && timeLeft > 0) {
    pauseAuction();
    await msg.channel.send(
      `${EMOJI.PAUSE} **PAUSED** - Bid in last 10s! Timer paused for confirmation...`
    );
  }

  st.th[`c_${conf.id}`] = setTimeout(async () => {
    clearInterval(st.th[`countdown_${conf.id}`]);
    delete st.th[`countdown_${conf.id}`];
    if (st.pc[conf.id]) {
      await conf.reactions.removeAll().catch(() => {});
      const timeoutEmbed = EmbedBuilder.from(confEmbed)
        .setColor(getColor(COLORS.INFO))
        .setFooter({ text: `${EMOJI.CLOCK} Timed out` });
      await conf.edit({ embeds: [timeoutEmbed] });
      setTimeout(
        async () => await conf.delete().catch(() => {}),
        TIMEOUTS.MESSAGE_DELETE
      );
      delete st.pc[conf.id];
      save();

      // Resume if paused
      if (st.pause) {
        resumeAuction(conf.client, cfg);
        await msg.channel.send(
          `${EMOJI.PLAY} **RESUMED** - Bid timeout, auction continues...`
        );
      }
    }
  }, CT);

  return { ok: true, confId: conf.id };
}

// COMMAND HANDLERS
async function handleCmd(cmd, msg, args, cli, cfg) {
  // Handle command aliases
  const actualCmd = COMMAND_ALIASES[cmd] || cmd;

  switch (actualCmd) {
    case "!auction":
      // ❌ MANUAL QUEUE REMOVED - All items must come from Google Sheets
      return await msg.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(getColor(COLORS.ERROR))
            .setTitle(`${EMOJI.ERROR} Manual Queue Removed`)
            .setDescription(
              `The \`!auction\` command has been **removed**.\n\n` +
              `**All auction items must now be added to the Google Sheets "BiddingItems" tab.**\n\n` +
              `This ensures:\n` +
              `✅ Better item tracking\n` +
              `✅ Automated boss association\n` +
              `✅ Consistent data management\n` +
              `✅ No manual queue conflicts`
            )
            .addFields({
              name: "📋 How to Add Items",
              value:
                `1. Open the Google Sheet\n` +
                `2. Go to **BiddingItems** tab\n` +
                `3. Add: Item Name | Boss | Start Price | Duration | Quantity\n` +
                `4. Run \`!startauction\` to begin`,
              inline: false,
            })
            .setFooter({ text: "Contact admin if you need help" })
            .setTimestamp(),
        ],
      });

    case "!queuelist":
      // Show Google Sheets preview instead of manual queue
      return await msg.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(COLORS.INFO)
            .setTitle(`${EMOJI.INFO} Queue Preview`)
            .setDescription(
              `Manual queue has been removed.\n\n` +
              `Use \`!queuelist\` from **auctioneering module** to preview Google Sheets items.`
            ),
        ],
      });

    case "!removeitem":
      // ❌ MANUAL QUEUE REMOVED
      return await msg.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(getColor(COLORS.ERROR))
            .setTitle(`${EMOJI.ERROR} Command Removed`)
            .setDescription(
              `The \`!removeitem\` command has been **removed**.\n\n` +
              `To manage items:\n` +
              `1. Edit the **BiddingItems** tab in Google Sheets\n` +
              `2. Delete rows or clear the Winner column to re-auction items`
            )
            .setFooter({ text: "Manual queue is no longer supported" })
            .setTimestamp(),
        ],
      });

    case "!startauction":
      // ❌ MANUAL QUEUE REMOVED - This command now only works through auctioneering module
      return await msg.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(getColor(COLORS.ERROR))
            .setTitle(`${EMOJI.ERROR} Wrong Module`)
            .setDescription(
              `This command is handled by the **auctioneering module**.\n\n` +
              `Manual queue has been removed - all auctions now run from Google Sheets.`
            )
            .setFooter({ text: "Admins: Use !startauction in bidding channel" })
            .setTimestamp(),
        ],
      });
      break;

    case "!bid":
      if (args.length === 0) {
        try {
          return await msg.reply(`${EMOJI.ERROR} Usage: \`!bid <amount>\``);
        } catch (err) {
          // If reply fails (message deleted), send regular message
          return await msg.channel.send(
            `${EMOJI.ERROR} Usage: \`!bid <amount>\``
          );
        }
      }
      const res = await procBid(msg, args[0], cfg);
      if (!res.ok) {
        try {
          await msg.reply(`${EMOJI.ERROR} ${res.msg}`);
        } catch (err) {
          // If reply fails (message deleted), send regular message
          await msg.channel.send(
            `${EMOJI.ERROR} <@${msg.author.id}> ${res.msg}`
          );
        }
      }
      break;

    case "!bidstatus":
      const statEmbed = new EmbedBuilder()
        .setColor(getColor(COLORS.INFO))
        .setTitle(`${EMOJI.CHART} Status`);
      if (st.cp) {
        const age = Math.floor((Date.now() - st.ct) / 60000);
        const autoRefreshStatus = st.cacheRefreshTimer
          ? `${EMOJI.SUCCESS} Auto-refresh ON`
          : `${EMOJI.WARNING} Auto-refresh OFF`;
        statEmbed.addFields({
          name: `${EMOJI.CHART} Cache`,
          value: `${EMOJI.SUCCESS} Loaded (${
            Object.keys(st.cp).length
          } members)\n${EMOJI.TIME} Age: ${age}m\n${autoRefreshStatus}`,
          inline: false,
        });
      } else
        statEmbed.addFields({
          name: `${EMOJI.CHART} Cache`,
          value: `${EMOJI.WARNING} Not loaded`,
          inline: false,
        });
      if (st.q.length > 0)
        statEmbed.addFields({
          name: `${EMOJI.LIST} Queue`,
          value:
            st.q
              .slice(0, 5)
              .map(
                (a, i) =>
                  `${i + 1}. ${a.item}${
                    a.quantity > 1 ? ` x${a.quantity}` : ""
                  }`
              )
              .join("\n") +
            (st.q.length > 5 ? `\n*...+${st.q.length - 5} more*` : ""),
        });
      if (st.a) {
        const tLeft = st.pause
          ? `${EMOJI.PAUSE} PAUSED (${fmtTime(st.a.remainingTime)})`
          : fmtTime(st.a.endTime - Date.now());
        statEmbed.addFields(
          {
            name: `${EMOJI.FIRE} Active`,
            value: `${st.a.item}${
              st.a.quantity > 1 ? ` x${st.a.quantity}` : ""
            }`,
            inline: true,
          },
          {
            name: `${EMOJI.BID} Bid`,
            value: `${st.a.curBid}pts`,
            inline: true,
          },
          { name: `${EMOJI.TIME} Time`, value: tLeft, inline: true }
        );
      }
      statEmbed.setFooter({ text: "Use !auction to add" }).setTimestamp();
      await msg.reply({ embeds: [statEmbed] });
      break;

    case "!clearqueue":
      // ❌ MANUAL QUEUE REMOVED
      return await msg.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(getColor(COLORS.ERROR))
            .setTitle(`${EMOJI.ERROR} Command Removed`)
            .setDescription(
              `The \`!clearqueue\` command has been **removed**.\n\n` +
              `Manual queue is no longer supported. All items come from Google Sheets.`
            )
            .setFooter({ text: "Use !resetauction to reset all auction state" })
            .setTimestamp(),
        ],
      });

    case "!resetbids":
      const rstMsg = await msg.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(COLORS.ERROR)
            .setTitle(`${EMOJI.WARNING} RESET ALL?`)
            .setDescription(
              `Clears:\n` +
                `• Active auction\n` +
                `• Locked points (${Object.keys(st.lp).length} members)\n` +
                `• History (${st.h.length} records)\n` +
                `• Cache\n\n` +
                `⚠️ **NOTE:** Use \`!resetauction\` for full auction reset including saved state.`
            )
            .setFooter({
              text: `${EMOJI.SUCCESS} confirm / ${EMOJI.ERROR} cancel`,
            }),
        ],
      });
      await rstMsg.react(EMOJI.SUCCESS);
      await rstMsg.react(EMOJI.ERROR);
      try {
        const col = await rstMsg.awaitReactions({
          filter: (r, u) =>
            [EMOJI.SUCCESS, EMOJI.ERROR].includes(r.emoji.name) &&
            u.id === msg.author.id,
          max: 1,
          time: TIMEOUTS.CONFIRMATION,
          errors: ["time"],
        });
        if (col.first().emoji.name === EMOJI.SUCCESS) {
          Object.values(st.th).forEach((h) => clearTimeout(h));
          stopCacheAutoRefresh();
          st = {
            a: null,
            lp: {},
            h: [],
            th: {},
            pc: {},
            sd: null,
            cp: null,
            ct: null,
            lb: {},
            pause: false,
            pauseTimer: null,
            auctionLock: false,
            cacheRefreshTimer: null,
          };
          save();
          await msg.reply(`${EMOJI.SUCCESS} Reset (cache cleared)`);
        } else {
          await rstMsg.reactions.removeAll().catch(() => {});
        }
      } catch (e) {
        await rstMsg.reactions.removeAll().catch(() => {});
      }
      break;

    case "!forcesubmitresults":
      if (!st.sd || st.h.length === 0)
        return await msg.reply(`${EMOJI.ERROR} No history`);
      const fsMsg = await msg.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(getColor(COLORS.WARNING))
            .setTitle(`${EMOJI.WARNING} Force Submit?`)
            .setDescription(`**Time:** ${st.sd}\n**Items:** ${st.h.length}`)
            .addFields({
              name: `${EMOJI.LIST} Results`,
              value: st.h
                .map((a) => `• **${a.item}**: ${a.winner} - ${a.amount}pts`)
                .join("\n"),
              inline: false,
            })
            .setFooter({
              text: `${EMOJI.SUCCESS} submit / ${EMOJI.ERROR} cancel`,
            }),
        ],
      });
      await fsMsg.react(EMOJI.SUCCESS);
      await fsMsg.react(EMOJI.ERROR);
      try {
        const fsCol = await fsMsg.awaitReactions({
          filter: (r, u) =>
            [EMOJI.SUCCESS, EMOJI.ERROR].includes(r.emoji.name) &&
            u.id === msg.author.id,
          max: 1,
          time: TIMEOUTS.CONFIRMATION,
          errors: ["time"],
        });
        if (fsCol.first().emoji.name === EMOJI.SUCCESS) {
          if (!st.sd) st.sd = ts();

          const winners = {};
          st.h.forEach((a) => {
            const normalizedWinner = normalizeUsername(a.winner);
            winners[normalizedWinner] =
              (winners[normalizedWinner] || 0) + a.amount;
          });

          const allMembers = Object.keys(st.cp || {});
          const res = allMembers.map((m) => {
            const normalizedMember = normalizeUsername(m);
            return {
              member: m,
              totalSpent: winners[normalizedMember] || 0,
            };
          });
          const sub = await submitRes(cfg.sheet_webhook_url, res, st.sd);
          if (sub.ok) {
            const wList = st.h
              .map((a) => `• **${a.item}**: ${a.winner} - ${a.amount}pts`)
              .join("\n");
            await msg.channel.send({
              embeds: [
                new EmbedBuilder()
                  .setColor(getColor(COLORS.SUCCESS))
                  .setTitle(`${EMOJI.SUCCESS} Force Submit OK!`)
                  .setDescription("Submitted")
                  .addFields(
                    { name: `${EMOJI.CLOCK} Time`, value: st.sd, inline: true },
                    {
                      name: `${EMOJI.TROPHY} Items`,
                      value: `${st.h.length}`,
                      inline: true,
                    },
                    {
                      name: `${EMOJI.BID} Total`,
                      value: `${res.reduce((s, r) => s + r.totalSpent, 0)}`,
                      inline: true,
                    },
                    { name: `${EMOJI.LIST} Winners`, value: wList },
                    {
                      name: "👥 Updated",
                      value: `${res.length} (0 auto-populated)`,
                      inline: false,
                    }
                  )
                  .setFooter({ text: "Deducted after session" })
                  .setTimestamp(),
              ],
            });
            st.h = [];
            st.sd = null;
            st.lp = {};
            clearCache();
            save();
          } else {
            await msg.channel.send({
              embeds: [
                new EmbedBuilder()
                  .setColor(getColor(COLORS.ERROR))
                  .setTitle(`${EMOJI.ERROR} Failed`)
                  .setDescription(`**Error:** ${sub.err}`)
                  .addFields({
                    name: `${EMOJI.LIST} Data`,
                    value: `\`\`\`\n${res
                      .filter((r) => r.totalSpent > 0)
                      .map((r) => `${r.member}: ${r.totalSpent}pts`)
                      .join("\n")}\n\`\`\``,
                  }),
              ],
            });
          }
        } else {
          await fsMsg.reactions.removeAll().catch(() => {});
        }
      } catch (e) {
        await fsMsg.reactions.removeAll().catch(() => {});
      }
      break;

    case "!cancelitem":
      if (!st.a) return await msg.reply(`${EMOJI.ERROR} No active auction`);
      if (msg.channel.id !== st.a.threadId)
        return await msg.reply(`${EMOJI.ERROR} Use in auction thread`);
      const canMsg = await msg.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(getColor(COLORS.WARNING))
            .setTitle(`${EMOJI.WARNING} Cancel Item?`)
            .setDescription(
              `**${st.a.item}**${
                st.a.quantity > 1 ? ` x${st.a.quantity}` : ""
              }\n\nRefund all locked points?`
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
            u.id === msg.author.id,
          max: 1,
          time: TIMEOUTS.CONFIRMATION,
          errors: ["time"],
        });
        if (canCol.first().emoji.name === EMOJI.SUCCESS) {
          Object.values(st.th).forEach((h) => clearTimeout(h));
          if (st.a.curWin) unlock(st.a.curWin, st.a.curBid);
          await msg.channel.send(
            `${EMOJI.ERROR} **${st.a.item}** canceled. Points refunded.`
          );
          await msg.channel.setArchived(true, "Canceled").catch(() => {});
          st.a = null;
          save();
          // Manual queue removed - cancel just ends current item
          await msg.channel.send(
            `${EMOJI.INFO} Item cancelled. Use !endauction to end the entire session.`
          );
        } else {
          await canMsg.reactions.removeAll().catch(() => {});
        }
      } catch (e) {
        await canMsg.reactions.removeAll().catch(() => {});
      }
      break;

    case "!skipitem":
      if (!st.a) return await msg.reply(`${EMOJI.ERROR} No active auction`);
      if (msg.channel.id !== st.a.threadId)
        return await msg.reply(`${EMOJI.ERROR} Use in auction thread`);
      const skpMsg = await msg.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(getColor(COLORS.WARNING))
            .setTitle(`${EMOJI.WARNING} Skip Item?`)
            .setDescription(
              `**${st.a.item}**${
                st.a.quantity > 1 ? ` x${st.a.quantity}` : ""
              }\n\nMark as no sale, move to next?`
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
            u.id === msg.author.id,
          max: 1,
          time: TIMEOUTS.CONFIRMATION,
          errors: ["time"],
        });
        if (skpCol.first().emoji.name === EMOJI.SUCCESS) {
          Object.values(st.th).forEach((h) => clearTimeout(h));
          if (st.a.curWin) unlock(st.a.curWin, st.a.curBid);
          await msg.channel.send(`⏭️ **${st.a.item}** skipped (no sale).`);
          await msg.channel.setArchived(true, "Skipped").catch(() => {});
          st.a = null;
          save();
          // Manual queue removed - skip just ends current item
          await msg.channel.send(
            `${EMOJI.INFO} Item skipped. Use !endauction to end the entire session.`
          );
        } else {
          await skpMsg.reactions.removeAll().catch(() => {});
        }
      } catch (e) {
        await skpMsg.reactions.removeAll().catch(() => {});
      }
      break;

    case "!mypoints":
      // Only in bidding channel (not thread)
      if (msg.channel.isThread() || msg.channel.id !== cfg.bidding_channel_id) {
        return await msg.reply(
          `${EMOJI.ERROR} Use \`!mypoints\` in bidding channel only (not threads)`
        );
      }

      // Don't allow during active auction
      if (st.a) {
        return await msg.reply(
          `${EMOJI.WARNING} Can't check points during auction. Wait for session to end.`
        );
      }

      const u = msg.member.nickname || msg.author.username;

      // Fetch fresh from sheets
      const freshPts = await fetchPts(cfg.sheet_webhook_url);
      if (!freshPts) {
        return await msg.reply(
          `${EMOJI.ERROR} Failed to fetch points from sheets.`
        );
      }

      let userPts = freshPts[u];
      if (userPts === undefined) {
        const match = Object.keys(freshPts).find(
          (n) => n.toLowerCase() === u.toLowerCase()
        );
        userPts = match ? freshPts[match] : null;
      }

      let ptsMsg;
      if (userPts === null || userPts === undefined) {
        ptsMsg = await msg.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(getColor(COLORS.ERROR))
              .setTitle(`${EMOJI.ERROR} Not Found`)
              .setDescription(
                `**${u}**\n\nYou are not in the bidding system or not a current ELYSIUM member.`
              )
              .setFooter({ text: "Contact admin if this is wrong" })
              .setTimestamp(),
          ],
        });
      } else {
        ptsMsg = await msg.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(getColor(COLORS.SUCCESS))
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

      // DELETE USER MESSAGE IMMEDIATELY + DELETE REPLY AFTER 30s
      try {
        await msg.delete().catch(() => {});
      } catch (e) {
        console.warn(
          `${EMOJI.WARNING} Could not delete user message: ${e.message}`
        );
      }

      // Delete reply embed after 30s
      setTimeout(async () => {
        await ptsMsg.delete().catch(() => {});
      }, 30000);
      break;

    case "!fixlockedpoints":
      // 🔧 AUDIT AND FIX STUCK LOCKED POINTS
      const lockedMembers = Object.keys(st.lp).filter(
        (member) => st.lp[member] > 0
      );

      if (lockedMembers.length === 0) {
        return await msg.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(getColor(COLORS.SUCCESS))
              .setTitle(`${EMOJI.SUCCESS} All Clear!`)
              .setDescription(`No locked points found. System is clean.`)
              .setTimestamp(),
          ],
        });
      }

      // Build audit report
      const auditReport = lockedMembers
        .map((member) => `• **${member}**: ${st.lp[member]}pts locked`)
        .join("\n");

      const fixMsg = await msg.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(getColor(COLORS.WARNING))
            .setTitle(`${EMOJI.WARNING} Locked Points Found`)
            .setDescription(
              `Found **${lockedMembers.length} members** with locked points:\n\n${auditReport}\n\n` +
                `**Action:** Clear all locked points?\n` +
                `⚠️ Only do this if no auction is running or if points are stuck.`
            )
            .setFooter({
              text: `${EMOJI.SUCCESS} clear all / ${EMOJI.ERROR} cancel`,
            }),
        ],
      });

      await fixMsg.react(EMOJI.SUCCESS);
      await fixMsg.react(EMOJI.ERROR);

      try {
        const fixCol = await fixMsg.awaitReactions({
          filter: (r, u) =>
            [EMOJI.SUCCESS, EMOJI.ERROR].includes(r.emoji.name) &&
            u.id === msg.author.id,
          max: 1,
          time: TIMEOUTS.CONFIRMATION,
          errors: ["time"],
        });

        if (fixCol.first().emoji.name === EMOJI.SUCCESS) {
          const clearedCount = lockedMembers.length;
          const totalLocked = Object.values(st.lp).reduce(
            (sum, pts) => sum + pts,
            0
          );
          st.lp = {};
          save();
          await fixMsg.reactions.removeAll().catch(() => {});
          await msg.reply({
            embeds: [
              new EmbedBuilder()
                .setColor(getColor(COLORS.SUCCESS))
                .setTitle(`${EMOJI.SUCCESS} Locked Points Cleared`)
                .setDescription(
                  `Freed **${totalLocked}pts** from **${clearedCount} members**`
                )
                .setFooter({
                  text: "Points are now available for bidding",
                })
                .setTimestamp(),
            ],
          });
        } else {
          await fixMsg.reactions.removeAll().catch(() => {});
        }
      } catch (e) {
        await fixMsg.reactions.removeAll().catch(() => {});
      }
      break;

    case "!auctionaudit":
      // 📊 SHOW DETAILED AUCTION STATE
      const auditEmbed = new EmbedBuilder()
        .setColor(COLORS.INFO)
        .setTitle(`${EMOJI.CHART} Auction System Audit`)
        .setTimestamp();

      // Bidding module state
      auditEmbed.addFields({
        name: "🔹 Bidding Module",
        value:
          `**Active Auction:** ${st.a ? st.a.item : "None"}\n` +
          `**Locked Points:** ${Object.keys(st.lp).length} members (${Object.values(
            st.lp
          ).reduce((sum, pts) => sum + pts, 0)}pts total)\n` +
          `**Pending Confirmations:** ${Object.keys(st.pc).length}\n` +
          `**History:** ${st.h.length} items\n` +
          `**Cache:** ${st.cp ? Object.keys(st.cp).length : 0} members\n` +
          `**Paused:** ${st.pause ? "Yes" : "No"}`,
        inline: false,
      });

      // Auctioneering module state
      const auctioneering = require("./auctioneering.js");
      const auctState = auctioneering.getAuctionState();

      auditEmbed.addFields({
        name: "🔹 Auctioneering Module",
        value:
          `**Active:** ${auctState.active ? "Yes" : "No"}\n` +
          `**Current Item:** ${
            auctState.currentItem ? auctState.currentItem.item : "None"
          }\n` +
          `**Session Items:** ${auctState.sessionItems.length}\n` +
          `**Current Index:** ${auctState.currentItemIndex}\n` +
          `**Paused:** ${auctState.paused ? "Yes" : "No"}`,
        inline: false,
      });

      // Active timers
      const activeTimers = Object.keys(st.th).length;
      const auctTimers = Object.keys(auctState.timers || {}).length;

      auditEmbed.addFields({
        name: "⏱️ Active Timers",
        value:
          `**Bidding Module:** ${activeTimers} timer(s)\n` +
          `**Auctioneering Module:** ${auctTimers} timer(s)`,
        inline: false,
      });

      // Health check
      const issues = [];
      if (st.a && !auctState.active) {
        issues.push("⚠️ Bidding has active auction but auctioneering doesn't");
      }
      if (!st.a && auctState.active) {
        issues.push("⚠️ Auctioneering active but bidding has no auction");
      }
      if (Object.keys(st.lp).length > 0 && !st.a && !auctState.active) {
        issues.push("⚠️ Locked points exist but no auction is running");
      }
      if (Object.keys(st.pc).length > 10) {
        issues.push("⚠️ High number of pending confirmations (possible memory leak)");
      }

      if (issues.length > 0) {
        auditEmbed.addFields({
          name: "⚠️ Issues Detected",
          value: issues.join("\n"),
          inline: false,
        });
        auditEmbed.setColor(getColor(COLORS.WARNING));
      } else {
        auditEmbed.addFields({
          name: "✅ Health Status",
          value: "All systems operational",
          inline: false,
        });
      }

      auditEmbed.setFooter({
        text: "Use !fixlockedpoints to clear stuck points | !resetauction for full reset",
      });

      await msg.reply({ embeds: [auditEmbed] });
      break;

    case "!resetauction":
      // 🔄 COMPLETE AUCTION RESET (NUCLEAR OPTION)
      const resetAuditEmbed = new EmbedBuilder()
        .setColor(COLORS.ERROR)
        .setTitle(`${EMOJI.WARNING} COMPLETE AUCTION RESET`)
        .setDescription(
          `⚠️ **THIS IS A NUCLEAR OPTION** ⚠️\n\n` +
            `This will completely reset the entire auction system:\n\n` +
            `**Bidding Module:**\n` +
            `• Active auction: ${st.a ? st.a.item : "None"}\n` +
            `• Locked points: ${Object.keys(st.lp).length} members\n` +
            `• History: ${st.h.length} items\n` +
            `• Cache: ${st.cp ? Object.keys(st.cp).length : 0} members\n\n` +
            `**Auctioneering Module:**\n` +
            `• Session items: ${require("./auctioneering.js").getAuctionState().sessionItems.length}\n\n` +
            `**State Files:**\n` +
            `• bidding-state.json will be cleared\n` +
            `• All timers will be stopped\n` +
            `• All caches will be cleared\n\n` +
            `✅ **Safe to use when:**\n` +
            `• Auction is stuck/crashed\n` +
            `• Starting fresh session\n` +
            `• Points are glitched\n\n` +
            `❌ **DO NOT use during active auction!**`
        )
        .setFooter({
          text: `${EMOJI.SUCCESS} RESET EVERYTHING / ${EMOJI.ERROR} cancel`,
        });

      const resetConfirmMsg = await msg.reply({ embeds: [resetAuditEmbed] });
      await resetConfirmMsg.react(EMOJI.SUCCESS);
      await resetConfirmMsg.react(EMOJI.ERROR);

      try {
        const resetCol = await resetConfirmMsg.awaitReactions({
          filter: (r, u) =>
            [EMOJI.SUCCESS, EMOJI.ERROR].includes(r.emoji.name) &&
            u.id === msg.author.id,
          max: 1,
          time: 30000, // 30 second timeout for such a critical action
          errors: ["time"],
        });

        if (resetCol.first().emoji.name === EMOJI.SUCCESS) {
          await resetConfirmMsg.reactions.removeAll().catch(() => {});

          // Stop all timers
          Object.values(st.th).forEach((h) => clearTimeout(h));
          stopCacheAutoRefresh();

          // Reset auctioneering module
          const auctioneering = require("./auctioneering.js");
          const auctState = auctioneering.getAuctionState();

          // Clear auctioneering timers
          if (auctState.timers) {
            Object.values(auctState.timers).forEach((t) => {
              clearTimeout(t);
              clearInterval(t);
            });
          }

          // Reset auctioneering state
          auctState.active = false;
          auctState.currentItem = null;
          auctState.sessionItems = [];
          auctState.currentItemIndex = 0;
          auctState.timers = {};
          auctState.paused = false;
          auctState.pausedTime = null;

          // Reset bidding state
          st = {
            a: null,
            lp: {},
            h: [],
            th: {},
            pc: {},
            sd: null,
            cp: null,
            ct: null,
            lb: {},
            pause: false,
            pauseTimer: null,
            auctionLock: false,
            cacheRefreshTimer: null,
          };

          save();

          // Also try to save auctioneering state if available
          if (cfg && cfg.sheet_webhook_url) {
            try {
              await fetch(cfg.sheet_webhook_url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  action: "saveBotState",
                  state: { auctionState: auctState, timestamp: new Date().toISOString() },
                }),
              });
            } catch (err) {
              console.warn("⚠️ Failed to save auctioneering state:", err.message);
            }
          }

          await msg.reply({
            embeds: [
              new EmbedBuilder()
                .setColor(getColor(COLORS.SUCCESS))
                .setTitle(`${EMOJI.SUCCESS} Complete Reset Successful`)
                .setDescription(
                  `**All auction systems have been reset:**\n\n` +
                    `✅ All timers stopped\n` +
                    `✅ All locked points cleared\n` +
                    `✅ All caches cleared\n` +
                    `✅ All state files reset\n` +
                    `✅ Both modules reset\n\n` +
                    `The system is now ready for a fresh start.`
                )
                .setFooter({
                  text: "You can now run !startauction to begin a new session",
                })
                .setTimestamp(),
            ],
          });
        } else {
          await resetConfirmMsg.reactions.removeAll().catch(() => {});
          await msg.reply(`${EMOJI.INFO} Reset cancelled`);
        }
      } catch (e) {
        await resetConfirmMsg.reactions.removeAll().catch(() => {});
        await msg.reply(`${EMOJI.INFO} Reset timed out (cancelled)`);
      }
      break;

    case "!recoverauction":
      // 🔧 RECOVER FROM CRASHED AUCTION
      const auctioneering2 = require("./auctioneering.js");
      const auctState2 = auctioneering2.getAuctionState();

      const recoveryEmbed = new EmbedBuilder()
        .setColor(COLORS.WARNING)
        .setTitle(`${EMOJI.WARNING} Auction Recovery`)
        .setDescription(
          `Use this command to recover from a crashed or stuck auction.\n\n` +
            `**Current State:**\n` +
            `• Auctioneering active: ${auctState2.active ? "Yes" : "No"}\n` +
            `• Current item: ${
              auctState2.currentItem ? auctState2.currentItem.item : "None"
            }\n` +
            `• Bidding auction: ${st.a ? st.a.item : "None"}\n` +
            `• Locked points: ${Object.keys(st.lp).length} members\n\n` +
            `**Recovery Options:**\n\n` +
            `1️⃣ **Clear stuck state** - Unlock points, clear timers\n` +
            `2️⃣ **Force finalize** - End current session, submit results\n` +
            `3️⃣ **Full reset** - Use \`!resetauction\` instead\n\n` +
            `What would you like to do?`
        )
        .setFooter({ text: "React: 1️⃣ Clear | 2️⃣ Finalize | ❌ Cancel" });

      const recoveryMsg = await msg.reply({ embeds: [recoveryEmbed] });
      await recoveryMsg.react("1️⃣");
      await recoveryMsg.react("2️⃣");
      await recoveryMsg.react(EMOJI.ERROR);

      try {
        const recoveryCol = await recoveryMsg.awaitReactions({
          filter: (r, u) =>
            ["1️⃣", "2️⃣", EMOJI.ERROR].includes(r.emoji.name) &&
            u.id === msg.author.id,
          max: 1,
          time: 30000,
          errors: ["time"],
        });

        const choice = recoveryCol.first().emoji.name;
        await recoveryMsg.reactions.removeAll().catch(() => {});

        if (choice === "1️⃣") {
          // Clear stuck state
          Object.values(st.th).forEach((h) => clearTimeout(h));
          st.lp = {};
          st.pc = {};
          st.th = {};
          st.pause = false;
          save();

          await msg.reply({
            embeds: [
              new EmbedBuilder()
                .setColor(getColor(COLORS.SUCCESS))
                .setTitle(`${EMOJI.SUCCESS} Stuck State Cleared`)
                .setDescription(
                  `**Cleared:**\n` +
                    `✅ All timers stopped\n` +
                    `✅ Locked points freed\n` +
                    `✅ Pending confirmations cleared\n\n` +
                    `Active auctions are still running. Use \`!endauction\` if needed.`
                )
                .setTimestamp(),
            ],
          });
        } else if (choice === "2️⃣") {
          // Force finalize
          if (!auctState2.active) {
            return await msg.reply(
              `${EMOJI.ERROR} No active auctioneering session to finalize`
            );
          }

          try {
            // Get the channel
            const guild = await cli.guilds.fetch(cfg.main_guild_id);
            const channel = await guild.channels.fetch(cfg.bidding_channel_id);

            // Call finalize from auctioneering module (need to check if this exists)
            await msg.reply(
              `${EMOJI.CLOCK} Forcing session finalization...`
            );

            // This requires the auctioneering module to have the client and config
            // We'll need to make sure this works
            const auctioneering3 = require("./auctioneering.js");
            if (
              typeof auctioneering3.endAuctionSession === "function"
            ) {
              await auctioneering3.endAuctionSession(cli, cfg, channel);
              await msg.reply(
                `${EMOJI.SUCCESS} Session force-finalized successfully`
              );
            } else {
              await msg.reply(
                `${EMOJI.ERROR} Force finalize function not available. Use !resetauction instead.`
              );
            }
          } catch (err) {
            console.error("Recovery finalize error:", err);
            await msg.reply(
              `${EMOJI.ERROR} Failed to finalize: ${err.message}`
            );
          }
        } else {
          await msg.reply(`${EMOJI.INFO} Recovery cancelled`);
        }
      } catch (e) {
        await recoveryMsg.reactions.removeAll().catch(() => {});
        await msg.reply(`${EMOJI.INFO} Recovery timed out (cancelled)`);
      }
      break;
  }
}

async function startItemAuction(client, config, thread, item, session) {
  const { EmbedBuilder } = require("discord.js");
  const auctioneering = require("./auctioneering.js");

  console.log(`🔨 Starting item auction: ${item.item}`);

  // Initialize the auction item state
  item.curBid = item.startPrice || 0;
  item.curWin = null;
  item.curWinId = null;
  item.bids = [];
  item.status = "active";
  item.extCnt = 0; // Extension counter for time extensions

  const duration = (item.duration || 2) * 60 * 1000;
  item.endTime = Date.now() + duration;

  // Announce the start of the auction
  await thread.send({
    content: `@everyone`,
    embeds: [
      new EmbedBuilder()
        .setColor(0xffd700)
        .setTitle(`🔨 Auction Started: ${item.item}`)
        .setDescription(
          `**Boss:** ${session.bossName || "OPEN"}\n` +
            `**Starting Price:** ${item.startPrice || 0} pts\n` +
            `**Duration:** ${item.duration || 2} min\n\n` +
            `Use \`!bid <amount>\` to place your bids.`
        )
        .setFooter({ text: "Auction open — place your bids now!" })
        .setTimestamp(),
    ],
  });

  // Schedule end timer
  item.timers = {};

  item.timers.go1 = setTimeout(async () => {
    if (item.status !== "active") return;
    await thread.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0xffa500)
          .setTitle("⚠️ Going Once!")
          .setDescription("1 minute remaining."),
      ],
    });
  }, duration - 60000);

  item.timers.go2 = setTimeout(async () => {
    if (item.status !== "active") return;
    await thread.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0xffa500)
          .setTitle("⚠️ Going Twice!")
          .setDescription("30 seconds remaining."),
      ],
    });
  }, duration - 30000);

  item.timers.final = setTimeout(async () => {
    if (item.status !== "active") return;
    await thread.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0xff0000)
          .setTitle("🚨 Final Call!")
          .setDescription("10 seconds left to bid!"),
      ],
    });
  }, duration - 10000);

  // End auction
  item.timers.end = setTimeout(async () => {
    if (item.status !== "active") return;

    item.status = "ended";
    await thread.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0x00ff00)
          .setTitle(`🏁 Auction Ended: ${item.item}`)
          .setDescription(
            item.curWin
              ? `**Winner:** <@${item.curWinId}> (${item.curBid} pts)`
              : `No bids were placed.`
          ),
      ],
    });

    // Notify auctioneering to finalize and move to the next item
    await auctioneering.itemEnd(client, config, thread);
  }, duration);
}

// CLEANUP FUNCTION FOR PENDING CONFIRMATIONS
function cleanupPendingConfirmations() {
  const now = Date.now();

  let cleaned = 0;
  Object.keys(st.pc).forEach((msgId) => {
    const pending = st.pc[msgId];

    // Check if confirmation is older than timeout
    if (
      pending.timestamp &&
      now - pending.timestamp > TIMEOUTS.STALE_CONFIRMATION
    ) {
      // Clear associated timer if exists
      if (st.th[`c_${msgId}`]) {
        clearTimeout(st.th[`c_${msgId}`]);
        delete st.th[`c_${msgId}`];
      }

      // Clear countdown interval if exists
      if (st.th[`countdown_${msgId}`]) {
        clearInterval(st.th[`countdown_${msgId}`]);
        delete st.th[`countdown_${msgId}`];
      }

      // Remove pending confirmation
      delete st.pc[msgId];
      cleaned++;
    }
  });

  if (cleaned > 0) {
    console.log(`🧹 Cleaned up ${cleaned} stale pending confirmation(s)`);
    save();
  }
}

// Start periodic cleanup (every 2 minutes)
let cleanupInterval = null;
function startCleanupSchedule() {
  if (!cleanupInterval) {
    cleanupInterval = setInterval(cleanupPendingConfirmations, 120000); // 2 minutes
    console.log("🧹 Started pending confirmations cleanup schedule");
  }
}

function stopCleanupSchedule() {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
    console.log("⏹️ Stopped pending confirmations cleanup schedule");
  }
}

// MODULE EXPORTS
module.exports = {
  startItemAuction,
  initializeBidding,
  loadBiddingState: load,
  saveBiddingState: save,
  getBiddingState: () => st,
  hasElysiumRole: hasRole,
  isAdmin: isAdm,
  getCachedPoints: getPts,
  loadPointsCache: loadCache,
  clearPointsCache: clearCache,
  handleCommand: handleCmd,
  loadPointsCacheForAuction: loadPointsCacheForAuction,
  submitSessionTally: submitSessionTally,
  loadBiddingStateFromSheet: loadBiddingStateFromSheet,
  saveBiddingStateToSheet: saveBiddingStateToSheet,
  cleanupPendingConfirmations,
  startCleanupSchedule,
  stopCleanupSchedule,
  stopCacheAutoRefresh,

  confirmBid: async function (reaction, user, config) {
    const p = st.pc[reaction.message.id];
    if (!p) return;

    const guild = reaction.message.guild,
      member = await guild.members.fetch(user.id).catch(() => null);
    if (!member) return;

    if (p.userId !== user.id) {
      await reaction.users.remove(user.id).catch(() => {});
      return;
    }

    // CRITICAL: Check if this is an auctioneering bid
    if (p.isAuctioneering) {
      console.log(`🎯 Processing auctioneering bid confirmation`);

      const auctState = p.auctStateRef;
      const currentItem = auctState.currentItem;

      if (!currentItem || currentItem.status !== "active") {
        await reaction.message.channel.send(
          `❌ <@${user.id}> Auction no longer active`
        );
        await reaction.message.reactions.removeAll().catch(() => {});
        await reaction.message.delete().catch(() => {});
        delete st.pc[reaction.message.id];
        save();
        return;
      }

      if (p.amount < currentItem.curBid) {
        await reaction.message.channel.send(
          `❌ <@${user.id}> Bid invalid. Current: ${currentItem.curBid}pts`
        );
        await reaction.message.reactions.removeAll().catch(() => {});
        await reaction.message.delete().catch(() => {});
        delete st.pc[reaction.message.id];
        save();
        return;
      }

      // Check for higher pending bids from other users
      const higherPendingBids = Object.entries(st.pc)
        .filter(([msgId, pending]) => {
          return (
            msgId !== reaction.message.id && // Not this confirmation
            pending.isAuctioneering && // Is auctioneering bid
            pending.amount > p.amount && // Higher amount
            pending.userId !== p.userId
          ); // Different user
        })
        .sort((a, b) => b[1].amount - a[1].amount); // Sort by amount desc

      if (higherPendingBids.length > 0) {
        const highestPending = higherPendingBids[0][1];
        await reaction.message.channel.send({
          content: `<@${user.id}>`,
          embeds: [
            new EmbedBuilder()
              .setColor(0xffa500)
              .setTitle(`⚠️ Higher Bid Pending!`)
              .setDescription(
                `Your bid: **${p.amount}pts**\n` +
                  `Higher pending bid: **${highestPending.amount}pts** (waiting for confirmation)\n\n` +
                  `Someone else has a higher bid pending. If they confirm first, your bid will be rejected.\n` +
                  `**Your confirmation has been CANCELLED.**`
              ),
          ],
        });
        await reaction.message.reactions.removeAll().catch(() => {});
        await reaction.message.delete().catch(() => {});
        delete st.pc[reaction.message.id];
        save();
        return;
      }

      // Handle previous winner
      if (currentItem.curWin && !p.isSelf) {
        unlock(currentItem.curWin, currentItem.curBid);
        await reaction.message.channel.send({
          content: `<@${currentItem.curWinId}>`,
          embeds: [
            new EmbedBuilder()
              .setColor(getColor(COLORS.WARNING))
              .setTitle(`${EMOJI.WARNING} Outbid!`)
              .setDescription(
                `Someone bid **${p.amount}pts** on **${currentItem.item}**`
              ),
          ],
        });
      }

      // Lock the new bid
      lock(p.username, p.needed);

      // Update current item
      const prevBid = currentItem.curBid;
      currentItem.curBid = p.amount;
      currentItem.curWin = p.username;
      currentItem.curWinId = p.userId;

      if (!currentItem.bids) currentItem.bids = [];
      currentItem.bids.push({
        user: p.username,
        userId: p.userId,
        amount: p.amount,
        timestamp: Date.now(),
      });

      // Check if bid is in last minute - extend time by 1 minute
      const timeLeft = currentItem.endTime - Date.now();
      if (!currentItem.extCnt) currentItem.extCnt = 0; // Initialize if not exists
      if (timeLeft < 60000 && timeLeft > 0 && currentItem.extCnt < ME) {
        const extensionTime = 60000; // 1 minute
        currentItem.endTime += extensionTime;
        currentItem.extCnt++;

        await reaction.message.channel.send({
          embeds: [
            new EmbedBuilder()
              .setColor(0xffa500)
              .setTitle(`⏰ Time Extended!`)
              .setDescription(
                `Bid placed in final minute - adding 1 more minute to the auction!`
              )
              .addFields({
                name: "⏱️ New Time Remaining",
                value: `${Math.ceil(
                  (currentItem.endTime - Date.now()) / 1000
                )}s`,
                inline: true,
              }),
          ],
        });

        console.log(
          `⏰ Time extended for ${currentItem.item} by 1 minute (bid in final minute, ext #${currentItem.extCnt})`
        );
      }

      // Update via auctioneering module
      if (p.auctRef && typeof p.auctRef.updateCurrentItemState === "function") {
        p.auctRef.updateCurrentItemState({
          curBid: p.amount,
          curWin: p.username,
          curWinId: p.userId,
          bids: currentItem.bids,
        });
      }

      // Clear timeout
      if (st.th[`c_${reaction.message.id}`]) {
        clearTimeout(st.th[`c_${reaction.message.id}`]);
        delete st.th[`c_${reaction.message.id}`];
      }

      // Send confirmation
      await reaction.message.edit({
        embeds: [
          new EmbedBuilder()
            .setColor(getColor(COLORS.SUCCESS))
            .setTitle(`${EMOJI.SUCCESS} Bid Confirmed!`)
            .setDescription(`Highest bidder on **${currentItem.item}**`)
            .addFields(
              {
                name: `${EMOJI.BID} Your Bid`,
                value: `${p.amount}pts`,
                inline: true,
              },
              {
                name: `${EMOJI.CHART} Previous`,
                value: `${prevBid}pts`,
                inline: true,
              }
            )
            .setFooter({
              text: p.isSelf ? `Self-overbid (+${p.needed}pts)` : "Good luck!",
            }),
        ],
      });
      await reaction.message.reactions.removeAll().catch(() => {});

      await reaction.message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(getColor(COLORS.AUCTION))
            .setTitle(`${EMOJI.FIRE} New High Bid!`)
            .addFields(
              {
                name: `${EMOJI.BID} Amount`,
                value: `${p.amount}pts`,
                inline: true,
              },
              { name: "👤 Bidder", value: p.username, inline: true }
            ),
        ],
      });

      setTimeout(
        async () => await reaction.message.delete().catch(() => {}),
        5000
      );
      if (p.origMsgId) {
        const orig = await reaction.message.channel.messages
          .fetch(p.origMsgId)
          .catch(() => null);
        if (orig) await orig.delete().catch(() => {});
      }

      delete st.pc[reaction.message.id];
      save();

      console.log(
        `${EMOJI.SUCCESS} Auctioneering bid: ${p.username} - ${p.amount}pts${
          p.isSelf ? ` (self +${p.needed}pts)` : ""
        }`
      );
      return;
    }

    // Original bidding.js auction logic (not auctioneering)
    const a = st.a;
    if (!a || a.status !== "active") {
      await reaction.message.channel.send(
        `❌ <@${user.id}> Auction no longer active`
      );
      await reaction.message.reactions.removeAll().catch(() => {});
      await reaction.message.delete().catch(() => {});
      delete st.pc[reaction.message.id];
      save();

      if (st.pause) {
        resumeAuction(reaction.client, config);
        await reaction.message.channel.send(
          `▶️ **RESUMED** - Auction continues...`
        );
      }
      return;
    }

    if (p.amount < a.curBid) {
      await reaction.message.channel.send(
        `❌ <@${user.id}> Bid invalid. Current: ${a.curBid}pts`
      );
      await reaction.message.reactions.removeAll().catch(() => {});
      await reaction.message.delete().catch(() => {});
      delete st.pc[reaction.message.id];
      save();

      if (st.pause) {
        resumeAuction(reaction.client, config);
        await reaction.message.channel.send(
          `▶️ **RESUMED** - Auction continues...`
        );
      }
      return;
    }

    // Check for higher pending bids from other users
    const higherPendingBids = Object.entries(st.pc)
      .filter(([msgId, pending]) => {
        return (
          msgId !== reaction.message.id && // Not this confirmation
          !pending.isAuctioneering && // Regular bidding.js auction
          pending.amount > p.amount && // Higher amount
          pending.userId !== p.userId
        ); // Different user
      })
      .sort((a, b) => b[1].amount - a[1].amount); // Sort by amount desc

    if (higherPendingBids.length > 0) {
      const highestPending = higherPendingBids[0][1];
      await reaction.message.channel.send({
        content: `<@${user.id}>`,
        embeds: [
          new EmbedBuilder()
            .setColor(0xffa500)
            .setTitle(`⚠️ Higher Bid Pending!`)
            .setDescription(
              `Your bid: **${p.amount}pts**\n` +
                `Higher pending bid: **${highestPending.amount}pts** (waiting for confirmation)\n\n` +
                `Someone else has a higher bid pending. If they confirm first, your bid will be rejected.\n` +
                `**Your confirmation has been CANCELLED.**`
            ),
        ],
      });
      await reaction.message.reactions.removeAll().catch(() => {});
      await reaction.message.delete().catch(() => {});
      delete st.pc[reaction.message.id];
      save();

      if (st.pause) {
        resumeAuction(reaction.client, config);
        await reaction.message.channel.send(
          `▶️ **RESUMED** - Auction continues...`
        );
      }
      return;
    }

    // Handle previous winner
    if (a.curWin && !p.isSelf) {
      unlock(a.curWin, a.curBid);
      await reaction.message.channel.send({
        content: `<@${a.curWinId}>`,
        embeds: [
          new EmbedBuilder()
            .setColor(getColor(COLORS.WARNING))
            .setTitle(`${EMOJI.WARNING} Outbid!`)
            .setDescription(`Someone bid **${p.amount}pts** on **${a.item}**`),
        ],
      });
    }

    lock(p.username, p.needed);

    const prevBid = a.curBid;
    a.curBid = p.amount;
    a.curWin = p.username;
    a.curWinId = p.userId;
    a.bids.push({
      user: p.username,
      userId: p.userId,
      amount: p.amount,
      timestamp: Date.now(),
    });

    const timeLeft = st.pause ? st.a.remainingTime : a.endTime - Date.now();
    if (timeLeft < 60000 && a.extCnt < ME) {
      if (!st.pause) {
        a.endTime += 60000;
      } else {
        st.a.remainingTime += 60000;
      }
      a.extCnt++;
      a.go1 = false;
      a.go2 = false;

      await reaction.message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(0xffa500)
            .setTitle(`⏰ Time Extended!`)
            .setDescription(
              `Bid placed in final minute - adding 1 more minute to the auction!`
            )
            .addFields({
              name: "⏱️ New Time Remaining",
              value: `${Math.ceil(
                (st.pause ? st.a.remainingTime : a.endTime - Date.now()) / 1000
              )}s`,
              inline: true,
            }),
        ],
      });

      console.log(
        `⏰ Time extended for ${a.item} by 1 minute (bid in final minute)`
      );
    }

    if (st.th[`c_${reaction.message.id}`]) {
      clearTimeout(st.th[`c_${reaction.message.id}`]);
      delete st.th[`c_${reaction.message.id}`];
    }

    await reaction.message.edit({
      embeds: [
        new EmbedBuilder()
          .setColor(getColor(COLORS.SUCCESS))
          .setTitle(`${EMOJI.SUCCESS} Bid Confirmed!`)
          .setDescription(`Highest bidder on **${a.item}**`)
          .addFields(
            {
              name: `${EMOJI.BID} Your Bid`,
              value: `${p.amount}pts`,
              inline: true,
            },
            {
              name: `${EMOJI.CHART} Previous`,
              value: `${prevBid}pts`,
              inline: true,
            },
            {
              name: `${EMOJI.TIME} Time Left`,
              value: fmtTime(timeLeft),
              inline: true,
            }
          )
          .setFooter({
            text: p.isSelf
              ? `Self-overbid (+${p.needed}pts)`
              : timeLeft < 60000 && a.extCnt < ME
              ? `${EMOJI.CLOCK} Extended!`
              : "Good luck!",
          }),
      ],
    });
    await reaction.message.reactions.removeAll().catch(() => {});

    await reaction.message.channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(getColor(COLORS.AUCTION))
          .setTitle(`${EMOJI.FIRE} New High Bid!`)
          .addFields(
            {
              name: `${EMOJI.BID} Amount`,
              value: `${p.amount}pts`,
              inline: true,
            },
            { name: "👤 Bidder", value: p.username, inline: true }
          ),
      ],
    });

    setTimeout(
      async () => await reaction.message.delete().catch(() => {}),
      5000
    );
    if (p.origMsgId) {
      const orig = await reaction.message.channel.messages
        .fetch(p.origMsgId)
        .catch(() => null);
      if (orig) await orig.delete().catch(() => {});
    }

    delete st.pc[reaction.message.id];
    save();

    if (st.pause) {
      resumeAuction(reaction.client, config);
      await reaction.message.channel.send(
        `${EMOJI.PLAY} **RESUMED** - Timer continues with ${fmtTime(
          a.endTime - Date.now()
        )} remaining...`
      );
    } else if (timeLeft < 60000) {
      schedTimers(reaction.client, config);
    }

    console.log(
      `${EMOJI.SUCCESS} Bid: ${p.username} - ${p.amount}pts${
        p.isSelf ? ` (self +${p.needed}pts)` : ""
      }`
    );
  },

  cancelBid: async function (reaction, user, config) {
    const p = st.pc[reaction.message.id];
    if (!p) return;

    const guild = reaction.message.guild,
      member = await guild.members.fetch(user.id).catch(() => null);
    if (!member) return;

    const isOwner = p.userId === user.id,
      isAdm = isAdmFunc(member, config);

    if (!isOwner && !isAdm) {
      await reaction.users.remove(user.id).catch(() => {});
      return;
    }

    await reaction.message.edit({
      embeds: [
        new EmbedBuilder()
          .setColor(getColor(COLORS.INFO))
          .setTitle(`${EMOJI.ERROR} Bid Canceled`)
          .setDescription("Not placed"),
      ],
    });
    await reaction.message.reactions.removeAll().catch(() => {});
    setTimeout(
      async () => await reaction.message.delete().catch(() => {}),
      3000
    );

    if (p.origMsgId) {
      const orig = await reaction.message.channel.messages
        .fetch(p.origMsgId)
        .catch(() => null);
      if (orig) await orig.delete().catch(() => {});
    }

    if (st.th[`c_${reaction.message.id}`]) {
      clearTimeout(st.th[`c_${reaction.message.id}`]);
      delete st.th[`c_${reaction.message.id}`];
    }

    delete st.pc[reaction.message.id];
    save();

    // Resume if paused (only for regular bidding.js auctions, not auctioneering)
    if (!p.isAuctioneering && st.pause) {
      resumeAuction(reaction.client, config);
      await reaction.message.channel.send(
        `${EMOJI.PLAY} **RESUMED** - Bid canceled, auction continues...`
      );
    }
  },

  recoverBiddingState: async (client, config) => {
    if (await load()) {
      console.log(`${EMOJI.SUCCESS} State recovered`);
      if (st.cp) {
        const age = Math.floor((Date.now() - st.ct) / 60000);
        console.log(
          `${EMOJI.CHART} Cache: ${
            Object.keys(st.cp).length
          } members (${age}m old)`
        );
        if (age > 60) {
          console.log(`${EMOJI.WARNING} Cache old, clearing...`);
          clearCache();
        }
      } else console.log(`${EMOJI.WARNING} No cache`);

      if (st.a && st.a.status === "active") {
        console.log(`${EMOJI.FIRE} Rescheduling timers...`);
        schedTimers(client, config);
        if (!st.cp)
          console.warn(`${EMOJI.WARNING} Active auction but no cache!`);
      }
      return true;
    }
    return false;
  },

  // EMERGENCY FUNCTIONS
  forceEndAuction: async (client, config) => {
    if (!st.a) {
      console.log(`${EMOJI.WARNING} No active auction to end`);
      return;
    }

    console.log(`${EMOJI.EMERGENCY} Force ending auction: ${st.a.item}`);

    // Clear all timers
    [
      "goingOnce",
      "goingTwice",
      "finalCall",
      "auctionEnd",
      "next",
      "aStart",
    ].forEach((k) => {
      if (st.th[k]) {
        clearTimeout(st.th[k]);
        delete st.th[k];
      }
    });

    // Force finalize current session
    await finalize(client, config);

    console.log(`${EMOJI.SUCCESS} Auction force-ended`);
  },

  forceSaveState: async () => {
    return await saveBiddingStateToSheet();
  },
};
