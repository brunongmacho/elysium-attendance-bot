/**
 * ELYSIUM Guild Bidding System - Version 6.0 (FULLY ENHANCED)
 * NEW FEATURES:
 * - Cache auto-refresh every 30 minutes during active auctions
 * - Extended preview time (30 seconds)
 * - Concurrent auction protection (mutex)
 * - Better confirmation messages with countdown timers
 * - Emoji consistency throughout
 * - Color-coded embeds (standardized)
 * - Dry run visual distinction (yellow borders)
 * - Command aliases (!b, !ql, etc.)
 * - Batch auctions (multiple identical items)
 * - Admin action confirmation for destructive commands
 */

const { EmbedBuilder } = require("discord.js");
const fetch = require("node-fetch");
const fs = require("fs");

let auctioneering = null;
let cfg = null;

// CONSTANTS
const SF = "./bidding-state.json";
const CT = 10000; // confirm timeout (10s)
const RL = 3000; // rate limit (3s)
const ME = 15; // max extensions
const CACHE_REFRESH_INTERVAL = 30 * 60 * 1000; // 30 minutes
const PREVIEW_TIME = 30000; // 30 seconds

// Color scheme (consistent throughout)
const COLORS = {
  SUCCESS: 0x00ff00,
  WARNING: 0xffa500,
  ERROR: 0xff0000,
  INFO: 0x4a90e2,
  AUCTION: 0xffd700,
  DRY_RUN: 0xffff00, // Bright yellow for dry run
};

// Emoji constants (consistent throughout)
const EMOJI = {
  SUCCESS: '✅',
  ERROR: '❌',
  WARNING: '⚠️',
  INFO: 'ℹ️',
  AUCTION: '🔨',
  BID: '💰',
  TIME: '⏱️',
  TROPHY: '🏆',
  FIRE: '🔥',
  LOCK: '🔒',
  CHART: '📊',
  PAUSE: '⏸️',
  PLAY: '▶️',
  CLOCK: '🕐',
  LIST: '📋',
};

// Command aliases
const COMMAND_ALIASES = {
  '!b': '!bid',
  '!ql': '!queuelist',
  '!queue': '!queuelist',
  '!rm': '!removeitem',
  '!start': '!startauction',
  '!bstatus': '!bidstatus',
  '!pts': '!mypoints',
  '!mypts': '!mypoints',
  '!mp': '!mypoints',
};

// STATE
let st = {
  q: [], // queue
  a: null, // active auction
  lp: {}, // locked points
  h: [], // history
  dry: false, // dry run
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
  const manilaTime = new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Manila' }));
  
  return `${String(manilaTime.getMonth() + 1).padStart(2, "0")}/${String(
    manilaTime.getDate()
  ).padStart(2, "0")}/${manilaTime.getFullYear()} ${String(manilaTime.getHours()).padStart(
    2,
    "0"
  )}:${String(manilaTime.getMinutes()).padStart(2, "0")}`;
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

// Get color based on dry run mode
const getColor = (baseColor) => {
  return st.dry ? COLORS.DRY_RUN : baseColor;
};

// STATE PERSISTENCE
function save() {
  try {
    const { th, pauseTimer, cacheRefreshTimer, ...s } = st;
    fs.writeFileSync(SF, JSON.stringify(s, null, 2));
  } catch (e) {
    console.error("❌ Save:", e);
  }
}

function load() {
  try {
    if (fs.existsSync(SF)) {
      const d = JSON.parse(fs.readFileSync(SF, "utf8"));
      st = { ...st, ...d, th: {}, lb: {}, pause: false, pauseTimer: null, auctionLock: false, cacheRefreshTimer: null };
      return true;
    }
  } catch (e) {
    console.error("❌ Load:", e);
  }
  return false;
}

function initializeBidding(config, isAdminFunc, auctioneeringRef) {
  isAdmFunc = isAdminFunc;
  cfg = config;
  auctioneering = auctioneeringRef;
}

// SHEETS API
async function fetchPts(url, dry = false) {
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "getBiddingPoints", dryRun: dry }),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return (await r.json()).points || {};
  } catch (e) {
    console.error("❌ Fetch pts:", e);
    return null;
  }
}

async function submitRes(url, res, time, dry = false) {
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
          dryRun: dry,
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
async function loadCache(url, dry = false) {
  console.log("⚡ Loading cache...");
  const t0 = Date.now();
  const p = await fetchPts(url, dry);
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
    startCacheAutoRefresh(url, dry);
  }
  
  return true;
}

function startCacheAutoRefresh(url, dry) {
  // Clear existing timer
  if (st.cacheRefreshTimer) {
    clearInterval(st.cacheRefreshTimer);
  }
  
  // Set up auto-refresh every 30 minutes
  st.cacheRefreshTimer = setInterval(async () => {
    if (st.a && st.a.status === "active") {
      console.log("🔄 Auto-refreshing cache...");
      await loadCache(url, dry);
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

// QUEUE
const addQ = (itm, pr, dur, qty = 1) => {
  const a = {
    id: `a_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    item: itm.trim(),
    startPrice: parseInt(pr),
    duration: parseInt(dur),
    quantity: parseInt(qty), // Batch auction support
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
    return { ok: false, msg: `${EMOJI.WARNING} Auction start already in progress, please wait...` };
  }
  
  st.auctionLock = true;
  
  try {
    if (!(await loadCache(cfg.sheet_webhook_url, st.dry))) {
      st.auctionLock = false;
      return { ok: false, msg: `${EMOJI.ERROR} Cache load failed` };
    }

    st.sd = ts();
    const f = st.q[0];
    await startNext(cli, cfg);
    save();
    
    st.auctionLock = false;
    
    return {
      ok: true,
      tot: st.q.length,
      first: f.item,
      cached: Object.keys(st.cp).length,
    };
  } catch (err) {
    st.auctionLock = false;
    throw err;
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
    ? `${d.item} x${d.quantity} - ${ts()} | ${d.startPrice}pts | ${fmtDur(d.duration)}`
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
    .setDescription(`**${d.item}**${isBatch ? ` x${d.quantity}` : ''}`)
    .addFields(
      {
        name: `${EMOJI.BID} Starting Bid`,
        value: `${d.startPrice} points`,
        inline: true,
      },
      { name: `${EMOJI.TIME} Duration`, value: fmtDur(d.duration), inline: true },
      { name: `${EMOJI.LIST} Items Left`, value: `${st.q.length - 1}`, inline: true }
    )
    .setFooter({ text: st.dry ? `${EMOJI.WARNING} DRY RUN MODE - Starts in 30s` : "Starts in 30 seconds" })
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

  st.th.aStart = setTimeout(async () => await activate(cli, cfg, th), PREVIEW_TIME);
  save();
}

async function activate(cli, cfg, th) {
  st.a.status = "active";
  st.a.endTime = Date.now() + st.a.duration * 60000;
  
  const isBatch = st.a.quantity > 1;
  
  const activeEmbed = new EmbedBuilder()
    .setColor(getColor(COLORS.SUCCESS))
    .setTitle(`${EMOJI.FIRE} BIDDING NOW!`)
    .setDescription(`Type \`!bid <amount>\` to bid${isBatch ? `\n\n**${st.a.quantity} items available** - Top ${st.a.quantity} bidders win!` : ''}`)
    .addFields(
      { name: `${EMOJI.BID} Current`, value: `${st.a.curBid} pts`, inline: true },
      { name: `${EMOJI.TIME} Time`, value: fmtDur(st.a.duration), inline: true }
    )
    .setFooter({ text: `${EMOJI.CLOCK} 10s confirm • ${EMOJI.LOCK} 3s rate limit` });

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
  if (t > 60000 && !a.go1)
    st.th.goingOnce = setTimeout(async () => await ann1(cli, cfg), t - 60000);
  if (t > 30000 && !a.go2)
    st.th.goingTwice = setTimeout(async () => await ann2(cli, cfg), t - 30000);
  if (t > 10000)
    st.th.finalCall = setTimeout(async () => await ann3(cli, cfg), t - 10000);
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
        .setColor(getColor(COLORS.WARNING))
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
    
    a.winners = sortedBids.map(b => ({
      username: b.user,
      userId: b.userId,
      amount: b.amount,
    }));

    const winnersList = a.winners
      .map((w, i) => `${i + 1}. <@${w.userId}> - ${w.amount}pts`)
      .join('\n');

    await th.send({
      embeds: [
        new EmbedBuilder()
          .setColor(getColor(COLORS.AUCTION))
          .setTitle(`${EMOJI.AUCTION} SOLD!`)
          .setDescription(`**${a.item}** x${a.quantity} sold!`)
          .addFields(
            { name: `${EMOJI.TROPHY} Winners`, value: winnersList, inline: false },
          )
          .setFooter({ text: st.dry ? `${EMOJI.WARNING} DRY RUN` : "Deducted after session" })
          .setTimestamp(),
      ],
    });

    // Add to history
    a.winners.forEach(w => {
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
            { name: `${EMOJI.TROPHY} Winner`, value: `<@${a.curWinId}>`, inline: true },
            { name: `${EMOJI.BID} Price`, value: `${a.curBid}pts`, inline: true }
          )
          .setFooter({ text: st.dry ? `${EMOJI.WARNING} DRY RUN` : "Deducted after session" })
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
          .setColor(getColor(COLORS.INFO))
          .setTitle(`${EMOJI.ERROR} NO BIDS`)
          .setDescription(`**${a.item}** - no bids`)
          .setFooter({ text: "Next item..." }),
      ],
    });
  }

  await th.setArchived(true, "Ended").catch(() => {});
  st.q.shift();
  st.a = null;
  save();

  if (st.q.length > 0) {
    const n = st.q[0];
    await th.parent.send(
      `${EMOJI.CLOCK} Next in 20s...\n${EMOJI.LIST} **${n.item}** - ${n.startPrice}pts`
    );
    st.th.next = setTimeout(async () => await startNext(cli, cfg), 20000);
  } else {
    setTimeout(async () => await finalize(cli, cfg), 2000);
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
    const normalizedWinner = item.winner.toLowerCase().trim();
    winners[normalizedWinner] = (winners[normalizedWinner] || 0) + item.amount;
  });

  const res = allMembers.map((m) => {
    const normalizedMember = m.toLowerCase().trim();
    return {
      member: m,
      totalSpent: winners[normalizedMember] || 0,
    };
  });

  const sub = await submitRes(config.sheet_webhook_url, res, st.sd, false);

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
    const normalizedWinner = a.winner.toLowerCase().trim();
    winners[normalizedWinner] = (winners[normalizedWinner] || 0) + a.amount;
  });

  const res = allMembers.map((m) => {
    const normalizedMember = m.toLowerCase().trim();
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

  const sub = await submitRes(cfg.sheet_webhook_url, res, st.sd, st.dry);

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
          name: '👥 Members Updated',
          value: `${res.length} (auto-populated 0 for non-winners)`,
          inline: false,
        }
      )
      .setFooter({ text: st.dry ? `${EMOJI.WARNING} DRY RUN` : "Points deducted" })
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
          .addFields({ name: `${EMOJI.LIST} Manual Entry`, value: `\`\`\`\n${d}\n\`\`\`` })
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

async function procBidAuctioneering(msg, amt, currentItem) {
  const m = msg.member,
    u = m.nickname || msg.author.username,
    uid = msg.author.id;
  
  if (!hasRole(m) && !isAdm(m, cfg)) {
    await msg.reply(`${EMOJI.ERROR} Need ELYSIUM role`);
    return { ok: false, msg: "No role" };
  }

  const now = Date.now();
  if (st.lb[uid] && now - st.lb[uid] < 3000) {
    const wait = Math.ceil((3000 - (now - st.lb[uid])) / 1000);
    await msg.reply(`${EMOJI.CLOCK} Wait ${wait}s (rate limit)`);
    return { ok: false, msg: "Rate limited" };
  }

  const bid = parseInt(amt);
  if (isNaN(bid) || bid <= 0 || !Number.isInteger(bid)) {
    await msg.reply(`${EMOJI.ERROR} Invalid bid (integers only)`);
    return { ok: false, msg: "Invalid" };
  }

  if (bid <= currentItem.curBid) {
    await msg.reply(`${EMOJI.ERROR} Must be > ${currentItem.curBid}pts`);
    return { ok: false, msg: "Too low" };
  }

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

  const isSelf = currentItem.curWin && currentItem.curWin.toLowerCase() === u.toLowerCase();
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
    .setTitle(`${EMOJI.CLOCK} Confirm Bid`)
    .setDescription(`**${currentItem.item}**`)
    .addFields(
      { name: `${EMOJI.BID} Your Bid`, value: `${bid}pts`, inline: true },
      { name: `${EMOJI.CHART} Current`, value: `${currentItem.curBid}pts`, inline: true },
      { name: '💳 After', value: `${av - needed}pts`, inline: true }
    )
    .setFooter({ text: `${EMOJI.SUCCESS} confirm / ${EMOJI.ERROR} cancel • 10s timeout` });

  if (isSelf) {
    confEmbed.addFields({
      name: '🔄 Self-Overbid',
      value: `Current: ${currentItem.curBid}pts → New: ${bid}pts\n**+${needed}pts needed**`,
      inline: false,
    });
  }

  const conf = await msg.reply({ embeds: [confEmbed] });
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
  };
  save();

  st.lb[uid] = now;

  let countdown = 10;
  const countdownInterval = setInterval(async () => {
    countdown--;
    if (countdown > 0 && countdown <= 10 && st.pc[conf.id]) {
      const updatedEmbed = EmbedBuilder.from(confEmbed)
        .setFooter({ text: `${EMOJI.SUCCESS} confirm / ${EMOJI.ERROR} cancel • ${countdown}s remaining` });
      await conf.edit({ embeds: [updatedEmbed] }).catch(() => {});
    }
  }, 1000);

  st.th[`c_${conf.id}`] = setTimeout(async () => {
    clearInterval(countdownInterval);
    if (st.pc[conf.id]) {
      await conf.reactions.removeAll().catch(() => {});
      const timeoutEmbed = EmbedBuilder.from(confEmbed)
        .setColor(COLORS.INFO)
        .setFooter({ text: `${EMOJI.CLOCK} Timed out` });
      await conf.edit({ embeds: [timeoutEmbed] });
      setTimeout(async () => await conf.delete().catch(() => {}), 3000);
      delete st.pc[conf.id];
      save();
    }
  }, 10000);

  return { ok: true, confId: conf.id };
}

// BIDDING (OPTIMIZED)
async function procBid(msg, amt, cfg) {
  // CRITICAL FIX: Check if auctioneering is active first
  if (auctioneering) {
    const auctState = auctioneering.getAuctionState();
    if (auctState && auctState.active && auctState.currentItem) {
      return await procBidAuctioneering(msg, amt, auctState.currentItem);
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

  if (bid <= a.curBid) {
    await msg.reply(`${EMOJI.ERROR} Must be > ${a.curBid}pts`);
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
    .setColor(getColor(COLORS.AUCTION))
    .setTitle(`${EMOJI.CLOCK} Confirm Bid`)
    .setDescription(`**${a.item}**${a.quantity > 1 ? ` (${a.quantity} available)` : ''}`)
    .addFields(
      { name: `${EMOJI.BID} Your Bid`, value: `${bid}pts`, inline: true },
      { name: `${EMOJI.CHART} Current`, value: `${a.curBid}pts`, inline: true },
      { name: '💳 After', value: `${av - needed}pts`, inline: true }
    );

  if (isSelf) {
    confEmbed.addFields({
      name: '🔄 Self-Overbid',
      value: `Current: ${a.curBid}pts → New: ${bid}pts\n**+${needed}pts needed**`,
      inline: false,
    });
  }

  confEmbed.setFooter({ text: `${EMOJI.SUCCESS} confirm / ${EMOJI.ERROR} cancel • 10s timeout` });

  const conf = await msg.reply({ embeds: [confEmbed] });
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
      const updatedEmbed = EmbedBuilder.from(confEmbed)
        .setFooter({ text: `${EMOJI.SUCCESS} confirm / ${EMOJI.ERROR} cancel • ${countdown}s remaining` });
      await conf.edit({ embeds: [updatedEmbed] }).catch(() => {});
    }
  }, 1000);

  // Check if bid in last 10 seconds - PAUSE
  const timeLeft = a.endTime - Date.now();
  if (timeLeft <= 10000 && timeLeft > 0) {
    pauseAuction();
    await msg.channel.send(
      `${EMOJI.PAUSE} **PAUSED** - Bid in last 10s! Timer paused for confirmation...`
    );
  }

  st.th[`c_${conf.id}`] = setTimeout(async () => {
    clearInterval(countdownInterval);
    if (st.pc[conf.id]) {
      await conf.reactions.removeAll().catch(() => {});
      const timeoutEmbed = EmbedBuilder.from(confEmbed)
        .setColor(getColor(COLORS.INFO))
        .setFooter({ text: `${EMOJI.CLOCK} Timed out` });
      await conf.edit({ embeds: [timeoutEmbed] });
      setTimeout(async () => await conf.delete().catch(() => {}), 3000);
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
      if (args.length < 3)
        return await msg.reply(
          `${EMOJI.ERROR} Usage: \`!auction <item> <price> <duration> [quantity]\`\n\nExample: \`!auction Dragon Sword 500 30 3\` (for 3 items)`
        );
      
      // Check if last arg is quantity (for batch auctions)
      let qty = 1;
      let lastArg = parseInt(args[args.length - 1]);
      let secondLastArg = parseInt(args[args.length - 2]);
      
      // If last two args are both numbers, second-to-last is duration, last is quantity
      if (!isNaN(lastArg) && !isNaN(secondLastArg) && args.length >= 4) {
        qty = lastArg;
        const dur = secondLastArg;
        const pr = parseInt(args[args.length - 3]);
        const itm = args.slice(0, -3).join(" ");
        
        if (isNaN(pr) || pr <= 0 || isNaN(dur) || dur <= 0 || !itm.trim() || isNaN(qty) || qty <= 0) {
          return await msg.reply(`${EMOJI.ERROR} Invalid params`);
        }
        
        if (qty > 10) {
          return await msg.reply(`${EMOJI.ERROR} Max quantity is 10 items per auction`);
        }
        
        if (st.q.find((a) => a.item.toLowerCase() === itm.toLowerCase())) {
          return await msg.reply(`${EMOJI.ERROR} **${itm}** already queued`);
        }
        
        addQ(itm, pr, dur, qty);
        await msg.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(getColor(COLORS.SUCCESS))
              .setTitle(`${EMOJI.SUCCESS} Queued (Batch Auction)`)
              .setDescription(`**${itm}** x${qty}`)
              .addFields(
                { name: `${EMOJI.BID} Starting Price`, value: `${pr}pts`, inline: true },
                { name: `${EMOJI.TIME} Duration`, value: fmtDur(dur), inline: true },
                { name: `${EMOJI.LIST} Position`, value: `#${st.q.length}`, inline: true },
                { name: `${EMOJI.FIRE} Batch Auction`, value: `Top ${qty} bidders will win!`, inline: false }
              )
              .setFooter({ text: "!startauction to begin" })
              .setTimestamp(),
          ],
        });
      } else {
        // Regular single-item auction
        const dur = parseInt(args[args.length - 1]),
          pr = parseInt(args[args.length - 2]),
          itm = args.slice(0, -2).join(" ");
        
        if (isNaN(pr) || pr <= 0 || isNaN(dur) || dur <= 0 || !itm.trim()) {
          return await msg.reply(`${EMOJI.ERROR} Invalid params`);
        }
        
        if (st.q.find((a) => a.item.toLowerCase() === itm.toLowerCase())) {
          return await msg.reply(`${EMOJI.ERROR} **${itm}** already queued`);
        }
        
        addQ(itm, pr, dur, 1);
        await msg.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(getColor(COLORS.SUCCESS))
              .setTitle(`${EMOJI.SUCCESS} Queued`)
              .setDescription(`**${itm}**`)
              .addFields(
                { name: `${EMOJI.BID} Price`, value: `${pr}pts`, inline: true },
                { name: `${EMOJI.TIME} Duration`, value: fmtDur(dur), inline: true },
                { name: `${EMOJI.LIST} Position`, value: `#${st.q.length}`, inline: true }
              )
              .setFooter({ text: "!startauction to begin" })
              .setTimestamp(),
          ],
        });
      }
      break;

    case "!queuelist":
      if (st.q.length === 0) return await msg.reply(`${EMOJI.LIST} Empty`);
      await msg.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(getColor(COLORS.INFO))
            .setTitle(`${EMOJI.LIST} Queue`)
            .setDescription(
              st.q
                .map(
                  (a, i) =>
                    `**${i + 1}.** ${a.item}${a.quantity > 1 ? ` x${a.quantity}` : ''} - ${a.startPrice}pts • ${fmtDur(
                      a.duration
                    )}`
                )
                .join("\n")
            )
            .addFields({
              name: `${EMOJI.CHART} Total`,
              value: `${st.q.length}`,
              inline: true,
            })
            .setTimestamp(),
        ],
      });
      break;

    case "!removeitem":
      if (args.length === 0)
        return await msg.reply(`${EMOJI.ERROR} Usage: \`!removeitem <name>\``);
      const rm = rmQ(args.join(" "));
      if (!rm) return await msg.reply(`${EMOJI.ERROR} Not found`);
      await msg.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(getColor(COLORS.WARNING))
            .setTitle(`${EMOJI.SUCCESS} Removed`)
            .setDescription(`**${rm.item}**${rm.quantity > 1 ? ` x${rm.quantity}` : ''}`)
            .addFields({
              name: `${EMOJI.LIST} Left`,
              value: `${st.q.length}`,
              inline: true,
            }),
        ],
      });
      break;

    case "!startauction":
      if (st.q.length === 0) return await msg.reply(`${EMOJI.ERROR} Empty queue`);
      if (st.a) return await msg.reply(`${EMOJI.ERROR} Already active`);
      
      const prev = st.q
        .slice(0, 10)
        .map((a, i) => `${i + 1}. **${a.item}**${a.quantity > 1 ? ` x${a.quantity}` : ''} - ${a.startPrice}pts`)
        .join("\n");
      
      const cMsg = await msg.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(getColor(COLORS.AUCTION))
            .setTitle(`${EMOJI.WARNING} Start?`)
            .setDescription(
              `**${st.q.length} item(s)**:\n\n${prev}${
                st.q.length > 10 ? `\n*...+${st.q.length - 10} more*` : ""
              }`
            )
            .addFields({
              name: `${EMOJI.INFO} Mode`,
              value: st.dry ? `${EMOJI.WARNING} DRY RUN` : `${EMOJI.BID} LIVE`,
              inline: true,
            })
            .setFooter({ text: `${EMOJI.SUCCESS} start / ${EMOJI.ERROR} cancel • 30s timeout` }),
        ],
      });
      
      await cMsg.react(EMOJI.SUCCESS);
      await cMsg.react(EMOJI.ERROR);
      
      // Countdown timer for confirmation
      let confirmCountdown = 30;
      const confirmInterval = setInterval(async () => {
        confirmCountdown -= 5;
        if (confirmCountdown > 0 && confirmCountdown <= 30) {
          const updatedEmbed = new EmbedBuilder()
            .setColor(getColor(COLORS.AUCTION))
            .setTitle(`${EMOJI.WARNING} Start?`)
            .setDescription(
              `**${st.q.length} item(s)**:\n\n${prev}${
                st.q.length > 10 ? `\n*...+${st.q.length - 10} more*` : ""
              }`
            )
            .addFields({
              name: `${EMOJI.INFO} Mode`,
              value: st.dry ? `${EMOJI.WARNING} DRY RUN` : `${EMOJI.BID} LIVE`,
              inline: true,
            })
            .setFooter({ text: `${EMOJI.SUCCESS} start / ${EMOJI.ERROR} cancel • ${confirmCountdown}s remaining` });
          await cMsg.edit({ embeds: [updatedEmbed] }).catch(() => {});
        }
      }, 5000);
      
      try {
        const col = await cMsg.awaitReactions({
          filter: (r, u) =>
            [EMOJI.SUCCESS, EMOJI.ERROR].includes(r.emoji.name) && u.id === msg.author.id,
          max: 1,
          time: 30000,
          errors: ["time"],
        });
        
        clearInterval(confirmInterval);
        
        if (col.first().emoji.name === EMOJI.SUCCESS) {
          await cMsg.reactions.removeAll().catch(() => {});
          const load = await msg.channel.send(`${EMOJI.CLOCK} Loading cache...`);
          const r = await startSess(cli, cfg);
          await load.delete().catch(() => {});
          if (r.ok) {
            await msg.channel.send({
              embeds: [
                new EmbedBuilder()
                  .setColor(getColor(COLORS.SUCCESS))
                  .setTitle(`${EMOJI.FIRE} Started!`)
                  .setDescription(
                    `**${r.tot} item(s)** • First: **${r.first}**`
                  )
                  .addFields(
                    {
                      name: `${EMOJI.CHART} Cached`,
                      value: `${r.cached} members`,
                      inline: true,
                    },
                    {
                      name: `${EMOJI.INFO} Mode`,
                      value: st.dry ? `${EMOJI.WARNING} DRY RUN` : `${EMOJI.BID} LIVE`,
                      inline: true,
                    }
                  )
                  .setFooter({ text: `${EMOJI.FIRE} Instant bidding!` })
                  .setTimestamp(),
              ],
            });
          } else await msg.channel.send(`${EMOJI.ERROR} Failed: ${r.msg}`);
        } else {
          clearInterval(confirmInterval);
          await cMsg.reactions.removeAll().catch(() => {});
        }
      } catch (e) {
        clearInterval(confirmInterval);
        await cMsg.reactions.removeAll().catch(() => {});
      }
      break;

    case "!bid":
      if (args.length === 0)
        return await msg.reply(`${EMOJI.ERROR} Usage: \`!bid <amount>\``);
      const res = await procBid(msg, args[0], cfg);
      if (!res.ok) await msg.reply(`${EMOJI.ERROR} ${res.msg}`);
      break;

    case "!bidstatus":
      const statEmbed = new EmbedBuilder()
        .setColor(getColor(COLORS.INFO))
        .setTitle(`${EMOJI.CHART} Status`);
      if (st.cp) {
        const age = Math.floor((Date.now() - st.ct) / 60000);
        const autoRefreshStatus = st.cacheRefreshTimer ? `${EMOJI.SUCCESS} Auto-refresh ON` : `${EMOJI.WARNING} Auto-refresh OFF`;
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
              .map((a, i) => `${i + 1}. ${a.item}${a.quantity > 1 ? ` x${a.quantity}` : ''}`)
              .join("\n") +
            (st.q.length > 5 ? `\n*...+${st.q.length - 5} more*` : ""),
        });
      if (st.a) {
        const tLeft = st.pause
          ? `${EMOJI.PAUSE} PAUSED (${fmtTime(st.a.remainingTime)})`
          : fmtTime(st.a.endTime - Date.now());
        statEmbed.addFields(
          { name: `${EMOJI.FIRE} Active`, value: `${st.a.item}${st.a.quantity > 1 ? ` x${st.a.quantity}` : ''}`, inline: true },
          { name: `${EMOJI.BID} Bid`, value: `${st.a.curBid}pts`, inline: true },
          { name: `${EMOJI.TIME} Time`, value: tLeft, inline: true }
        );
      }
      statEmbed
        .setFooter({ text: st.dry ? `${EMOJI.WARNING} DRY RUN MODE` : "Use !auction to add" })
        .setTimestamp();
      await msg.reply({ embeds: [statEmbed] });
      break;

    case "!clearqueue":
      if (st.q.length === 0) return await msg.reply(`${EMOJI.LIST} Empty`);
      if (st.a) return await msg.reply(`${EMOJI.ERROR} Can't clear during auction`);
      
      // Admin confirmation required
      const clearMsg = await msg.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(getColor(COLORS.WARNING))
            .setTitle(`${EMOJI.WARNING} Clear Queue?`)
            .setDescription(`This will remove **${st.q.length} item(s)** from the queue.`)
            .setFooter({ text: `${EMOJI.SUCCESS} confirm / ${EMOJI.ERROR} cancel` }),
        ],
      });
      
      await clearMsg.react(EMOJI.SUCCESS);
      await clearMsg.react(EMOJI.ERROR);
      
      try {
        const clearCol = await clearMsg.awaitReactions({
          filter: (r, u) =>
            [EMOJI.SUCCESS, EMOJI.ERROR].includes(r.emoji.name) && u.id === msg.author.id,
          max: 1,
          time: 30000,
          errors: ["time"],
        });
        
        if (clearCol.first().emoji.name === EMOJI.SUCCESS) {
          const cnt = clrQ();
          await clearMsg.reactions.removeAll().catch(() => {});
          await msg.reply(`${EMOJI.SUCCESS} Cleared ${cnt} item(s)`);
        } else {
          await clearMsg.reactions.removeAll().catch(() => {});
          await msg.reply(`${EMOJI.ERROR} Clear canceled`);
        }
      } catch (e) {
        await clearMsg.reactions.removeAll().catch(() => {});
      }
      break;

    case "!resetbids":
      const rstMsg = await msg.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(getColor(COLORS.ERROR))
            .setTitle(`${EMOJI.WARNING} RESET ALL?`)
            .setDescription(
              `Clears:\n` +
              `• Queue (${st.q.length} items)\n` +
              `• Active auction\n` +
              `• Locked points (${Object.keys(st.lp).length} members)\n` +
              `• History (${st.h.length} records)\n` +
              `• Cache`
            )
            .setFooter({ text: `${EMOJI.SUCCESS} confirm / ${EMOJI.ERROR} cancel` }),
        ],
      });
      await rstMsg.react(EMOJI.SUCCESS);
      await rstMsg.react(EMOJI.ERROR);
      try {
        const col = await rstMsg.awaitReactions({
          filter: (r, u) =>
            [EMOJI.SUCCESS, EMOJI.ERROR].includes(r.emoji.name) && u.id === msg.author.id,
          max: 1,
          time: 30000,
          errors: ["time"],
        });
        if (col.first().emoji.name === EMOJI.SUCCESS) {
          Object.values(st.th).forEach((h) => clearTimeout(h));
          stopCacheAutoRefresh();
          st = {
            q: [],
            a: null,
            lp: {},
            h: [],
            dry: st.dry,
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
      if (!st.sd || st.h.length === 0) return await msg.reply(`${EMOJI.ERROR} No history`);
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
            .setFooter({ text: `${EMOJI.SUCCESS} submit / ${EMOJI.ERROR} cancel` }),
        ],
      });
      await fsMsg.react(EMOJI.SUCCESS);
      await fsMsg.react(EMOJI.ERROR);
      try {
        const fsCol = await fsMsg.awaitReactions({
          filter: (r, u) =>
            [EMOJI.SUCCESS, EMOJI.ERROR].includes(r.emoji.name) && u.id === msg.author.id,
          max: 1,
          time: 30000,
          errors: ["time"],
        });
        if (fsCol.first().emoji.name === EMOJI.SUCCESS) {
          if (!st.sd) st.sd = ts();

          const winners = {};
          st.h.forEach((a) => {
            const normalizedWinner = a.winner.toLowerCase().trim();
            winners[normalizedWinner] =
              (winners[normalizedWinner] || 0) + a.amount;
          });

          const allMembers = Object.keys(st.cp || {});
          const res = allMembers.map((m) => {
            const normalizedMember = m.toLowerCase().trim();
            return {
              member: m,
              totalSpent: winners[normalizedMember] || 0,
            };
          });
          const sub = await submitRes(
            cfg.sheet_webhook_url,
            res,
            st.sd,
            st.dry
          );
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
                    { name: `${EMOJI.TROPHY} Items`, value: `${st.h.length}`, inline: true },
                    {
                      name: `${EMOJI.BID} Total`,
                      value: `${res.reduce((s, r) => s + r.totalSpent, 0)}`,
                      inline: true,
                    },
                    { name: `${EMOJI.LIST} Winners`, value: wList },
                    {
                      name: '👥 Updated',
                      value: `${res.length} (0 auto-populated)`,
                      inline: false,
                    }
                  )
                  .setFooter({
                    text: st.dry ? `${EMOJI.WARNING} DRY RUN` : "Deducted • Cache cleared",
                  })
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
            .setDescription(`**${st.a.item}**${st.a.quantity > 1 ? ` x${st.a.quantity}` : ''}\n\nRefund all locked points?`)
            .setFooter({ text: `${EMOJI.SUCCESS} yes / ${EMOJI.ERROR} no` }),
        ],
      });
      await canMsg.react(EMOJI.SUCCESS);
      await canMsg.react(EMOJI.ERROR);
      try {
        const canCol = await canMsg.awaitReactions({
          filter: (r, u) =>
            [EMOJI.SUCCESS, EMOJI.ERROR].includes(r.emoji.name) && u.id === msg.author.id,
          max: 1,
          time: 30000,
          errors: ["time"],
        });
        if (canCol.first().emoji.name === EMOJI.SUCCESS) {
          Object.values(st.th).forEach((h) => clearTimeout(h));
          if (st.a.curWin) unlock(st.a.curWin, st.a.curBid);
          await msg.channel.send(
            `${EMOJI.ERROR} **${st.a.item}** canceled. Points refunded.`
          );
          await msg.channel.setArchived(true, "Canceled").catch(() => {});
          st.q.shift();
          st.a = null;
          save();
          if (st.q.length > 0)
            setTimeout(async () => await startNext(cli, cfg), 5000);
          else await finalize(cli, cfg);
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
              `**${st.a.item}**${st.a.quantity > 1 ? ` x${st.a.quantity}` : ''}\n\nMark as no sale, move to next?`
            )
            .setFooter({ text: `${EMOJI.SUCCESS} yes / ${EMOJI.ERROR} no` }),
        ],
      });
      await skpMsg.react(EMOJI.SUCCESS);
      await skpMsg.react(EMOJI.ERROR);
      try {
        const skpCol = await skpMsg.awaitReactions({
          filter: (r, u) =>
            [EMOJI.SUCCESS, EMOJI.ERROR].includes(r.emoji.name) && u.id === msg.author.id,
          max: 1,
          time: 30000,
          errors: ["time"],
        });
        if (skpCol.first().emoji.name === EMOJI.SUCCESS) {
          Object.values(st.th).forEach((h) => clearTimeout(h));
          if (st.a.curWin) unlock(st.a.curWin, st.a.curBid);
          await msg.channel.send(`⏭️ **${st.a.item}** skipped (no sale).`);
          await msg.channel.setArchived(true, "Skipped").catch(() => {});
          st.q.shift();
          st.a = null;
          save();
          if (st.q.length > 0)
            setTimeout(async () => await startNext(cli, cfg), 5000);
          else await finalize(cli, cfg);
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
      const freshPts = await fetchPts(cfg.sheet_webhook_url, st.dry);
      if (!freshPts) {
        return await msg.reply(`${EMOJI.ERROR} Failed to fetch points from sheets.`);
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
              .setFooter({
                text: st.dry ? `${EMOJI.WARNING} DRY RUN MODE` : "Auto-deletes in 30s",
              })
              .setTimestamp(),
          ],
        });
      }

      // Delete after 30s
      setTimeout(async () => {
        await ptsMsg.delete().catch(() => {});
        await msg.delete().catch(() => {});
      }, 30000);
      break;
  }
}

// MODULE EXPORTS
module.exports = {
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

  confirmBid: async function (reaction, user, config) {
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

    // CRITICAL FIX: Handle auctioneering bids
    if (p.isAuctioneering) {
      const auctState = auctioneering.getAuctionState();
      const a = auctState.currentItem;
      
      if (!auctState.active || !a) {
        await reaction.message.channel.send(
          `${EMOJI.ERROR} <@${user.id}> Auction no longer active`
        );
        await reaction.message.reactions.removeAll().catch(() => {});
        await reaction.message.delete().catch(() => {});
        delete st.pc[reaction.message.id];
        save();
        return;
      }

      if (p.amount <= a.curBid) {
        await reaction.message.channel.send(
          `${EMOJI.ERROR} <@${user.id}> Bid invalid. Current: ${a.curBid}pts`
        );
        await reaction.message.reactions.removeAll().catch(() => {});
        await reaction.message.delete().catch(() => {});
        delete st.pc[reaction.message.id];
        save();
        return;
      }

      if (a.curWin && !p.isSelf) {
        unlock(a.curWin, a.curBid);
        await reaction.message.channel.send({
          content: `<@${a.curWinId}>`,
          embeds: [
            new EmbedBuilder()
              .setColor(COLORS.WARNING)
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

      const timeLeft = a.endTime - Date.now();
      if (timeLeft < 60000 && a.extCnt < 15) {
        a.endTime += 60000;
        a.extCnt++;
        a.go1 = false;
        a.go2 = false;
      }

      if (st.th[`c_${reaction.message.id}`]) {
        clearTimeout(st.th[`c_${reaction.message.id}`]);
        delete st.th[`c_${reaction.message.id}`];
      }

      await reaction.message.edit({
        embeds: [
          new EmbedBuilder()
            .setColor(COLORS.SUCCESS)
            .setTitle(`${EMOJI.SUCCESS} Bid Confirmed!`)
            .setDescription(`Highest bidder on **${a.item}**`)
            .addFields(
              { name: `${EMOJI.BID} Your Bid`, value: `${p.amount}pts`, inline: true },
              { name: `${EMOJI.CHART} Previous`, value: `${prevBid}pts`, inline: true },
              { name: `${EMOJI.TIME} Time Left`, value: fmtTime(timeLeft), inline: true }
            )
            .setFooter({
              text: p.isSelf
                ? `Self-overbid (+${p.needed}pts)`
                : timeLeft < 60000 && a.extCnt < 15
                ? `${EMOJI.CLOCK} Extended!`
                : "Good luck!",
            }),
        ],
      });
      await reaction.message.reactions.removeAll().catch(() => {});

      await reaction.message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(COLORS.AUCTION)
            .setTitle(`${EMOJI.FIRE} New High Bid!`)
            .addFields(
              { name: `${EMOJI.BID} Amount`, value: `${p.amount}pts`, inline: true },
              { name: '🤔 Bidder', value: p.username, inline: true }
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
        `${EMOJI.SUCCESS} Bid: ${p.username} - ${p.amount}pts${
          p.isSelf ? ` (self +${p.needed}pts)` : ""
        }`
      );
      return;
    }

    // Original bidding.js confirmBid logic continues
    const a = st.a;
    if (!a || a.status !== "active") {
      await reaction.message.channel.send(
        `${EMOJI.ERROR} <@${user.id}> Auction no longer active`
      );
      await reaction.message.reactions.removeAll().catch(() => {});
      await reaction.message.delete().catch(() => {});
      delete st.pc[reaction.message.id];
      save();

      // Resume if paused
      if (st.pause) {
        resumeAuction(reaction.client, config);
        await reaction.message.channel.send(
          `${EMOJI.PLAY} **RESUMED** - Auction continues...`
        );
      }
      return;
    }

    if (p.amount <= a.curBid) {
      await reaction.message.channel.send(
        `${EMOJI.ERROR} <@${user.id}> Bid invalid. Current: ${a.curBid}pts`
      );
      await reaction.message.reactions.removeAll().catch(() => {});
      await reaction.message.delete().catch(() => {});
      delete st.pc[reaction.message.id];
      save();

      // Resume if paused
      if (st.pause) {
        resumeAuction(reaction.client, config);
        await reaction.message.channel.send(
          `${EMOJI.PLAY} **RESUMED** - Auction continues...`
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

    // Lock points (incremental if self-overbid)
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

    // Extension logic - max 15 extensions
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
            { name: `${EMOJI.BID} Your Bid`, value: `${p.amount}pts`, inline: true },
            { name: `${EMOJI.CHART} Previous`, value: `${prevBid}pts`, inline: true },
            { name: `${EMOJI.TIME} Time Left`, value: fmtTime(timeLeft), inline: true }
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
            { name: `${EMOJI.BID} Amount`, value: `${p.amount}pts`, inline: true },
            { name: '👤 Bidder', value: p.username, inline: true }
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

    // Resume if paused
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

    // Resume if paused
    if (st.pause) {
      resumeAuction(reaction.client, config);
      await reaction.message.channel.send(
        `${EMOJI.PLAY} **RESUMED** - Bid canceled, auction continues...`
      );
    }
  },

  recoverBiddingState: async (client, config) => {
    if (load()) {
      console.log(`${EMOJI.SUCCESS} State recovered`);
      if (st.cp) {
        const age = Math.floor((Date.now() - st.ct) / 60000);
        console.log(
          `${EMOJI.CHART} Cache: ${Object.keys(st.cp).length} members (${age}m old)`
        );
        if (age > 60) {
          console.log(`${EMOJI.WARNING} Cache old, clearing...`);
          clearCache();
        }
      } else console.log(`${EMOJI.WARNING} No cache`);

      if (st.a && st.a.status === "active") {
        console.log(`${EMOJI.FIRE} Rescheduling timers...`);
        schedTimers(client, config);
        if (!st.cp) console.warn(`${EMOJI.WARNING} Active auction but no cache!`);
      }
      return true;
    }
    return false;
  },
};