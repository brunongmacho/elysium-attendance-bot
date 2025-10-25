/**
 * ELYSIUM Guild Bidding System - Version 5.0 (FULLY OPTIMIZED)
 * NEW: Auto-populate 0pts, incremental bidding, pause on last 10s, rate limiting, !mypoints
 */

const { EmbedBuilder } = require("discord.js");
const fetch = require("node-fetch");
const fs = require("fs");

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
  pauseTimer: null, // pause resume timer
};
let isAdmFunc = null;

const SF = "./bidding-state.json";
const CT = 10000; // confirm timeout (10s)
const RL = 3000; // rate limit (3s)
const ME = 15; // max extensions (15 mins = 900s/60s)

// HELPERS
const hasRole = (m) => m.roles.cache.some((r) => r.name === "ELYSIUM");
const isAdm = (m, c) =>
  m.roles.cache.some((r) => c.admin_roles.includes(r.name));
const ts = () => {
  const d = new Date();
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(
    d.getDate()
  ).padStart(2, "0")}/${d.getFullYear()} ${String(d.getHours()).padStart(
    2,
    "0"
  )}:${String(d.getMinutes()).padStart(2, "0")}`;
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
function save() {
  try {
    const { th, pauseTimer, ...s } = st;
    fs.writeFileSync(SF, JSON.stringify(s, null, 2));
  } catch (e) {
    console.error("❌ Save:", e);
  }
}

function load() {
  try {
    if (fs.existsSync(SF)) {
      const d = JSON.parse(fs.readFileSync(SF, "utf8"));
      st = { ...st, ...d, th: {}, lb: {}, pause: false, pauseTimer: null };
      return true;
    }
  } catch (e) {
    console.error("❌ Load:", e);
  }
  return false;
}

function initializeBidding(config, isAdminFunc) {
  isAdmFunc = isAdminFunc;
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

// CACHE
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
  return true;
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
  st.cp = null;
  st.ct = null;
  save();
}

// QUEUE
const addQ = (itm, pr, dur) => {
  const a = {
    id: `a_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    item: itm.trim(),
    startPrice: parseInt(pr),
    duration: parseInt(dur),
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

  // Clear all timers
  ["goingOnce", "goingTwice", "finalCall", "auctionEnd"].forEach((k) => {
    if (st.th[k]) {
      clearTimeout(st.th[k]);
      delete st.th[k];
    }
  });

  console.log(`⏸️ PAUSED: ${st.a.remainingTime}ms remaining`);
  save();
  return true;
}

function resumeAuction(cli, cfg) {
  if (!st.pause || !st.a || st.a.status !== "active") return false;
  st.pause = false;

  // Check if we need to extend back to 60s
  const wasUnder60 = st.a.remainingTime < 60000;
  if (wasUnder60) {
    st.a.endTime = Date.now() + 60000; // Reset to 60s
    st.a.goingOnceAnnounced = false;
    st.a.goingTwiceAnnounced = false;
    console.log(
      `▶️ RESUME: Extended to 60s (was ${Math.floor(
        st.a.remainingTime / 1000
      )}s)`
    );
  } else {
    st.a.endTime = Date.now() + st.a.remainingTime;
    console.log(`▶️ RESUME: ${st.a.remainingTime}ms remaining`);
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

  if (!(await loadCache(cfg.sheet_webhook_url, st.dry)))
    return { ok: false, msg: "❌ Cache load failed" };

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
}

async function startNext(cli, cfg) {
  if (st.q.length === 0) {
    await finalize(cli, cfg);
    return;
  }

  const d = st.q[0];
  const g = await cli.guilds.fetch(cfg.main_guild_id);
  const ch = await g.channels.fetch(cfg.bidding_channel_id);
  const th = await ch.threads.create({
    name: `${d.item} - ${ts()} | ${d.startPrice}pts | ${fmtDur(d.duration)}`,
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
    endTime: null,
    extCnt: 0,
    status: "preview",
    go1: false,
    go2: false,
  };

  await th.send({
    content: "@everyone",
    embeds: [
      new EmbedBuilder()
        .setColor(0xffd700)
        .setTitle("🏆 AUCTION STARTING")
        .setDescription(`**${d.item}**`)
        .addFields(
          {
            name: "💰 Starting Bid",
            value: `${d.startPrice} points`,
            inline: true,
          },
          { name: "⏱️ Duration", value: fmtDur(d.duration), inline: true },
          { name: "📋 Items Left", value: `${st.q.length - 1}`, inline: true }
        )
        .setFooter({ text: st.dry ? "🧪 DRY RUN" : "Starts in 20s" })
        .setTimestamp(),
    ],
  });

  st.th.aStart = setTimeout(async () => await activate(cli, cfg, th), 20000);
  save();
}

async function activate(cli, cfg, th) {
  st.a.status = "active";
  st.a.endTime = Date.now() + st.a.duration * 60000;
  await th.send({
    embeds: [
      new EmbedBuilder()
        .setColor(0x00ff00)
        .setTitle("🔔 BIDDING NOW!")
        .setDescription("Type `!bid <amount>` to bid")
        .addFields(
          { name: "💰 Current", value: `${st.a.curBid} pts`, inline: true },
          { name: "⏱️ Time", value: fmtDur(st.a.duration), inline: true }
        )
        .setFooter({ text: "⚡ 10s confirm • 3s rate limit" }),
    ],
  });
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
        .setColor(0xffa500)
        .setTitle("⚠️ GOING ONCE!")
        .setDescription("1 min left")
        .addFields({
          name: "💰 Current",
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
        .setColor(0xff6600)
        .setTitle("⚠️ GOING TWICE!")
        .setDescription("30s left")
        .addFields({
          name: "💰 Current",
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
        .setColor(0xff0000)
        .setTitle("⚠️ FINAL CALL!")
        .setDescription("10s left")
        .addFields({
          name: "💰 Current",
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

  if (a.curWin) {
    await th.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0xffd700)
          .setTitle("🔨 SOLD!")
          .setDescription(`**${a.item}** sold!`)
          .addFields(
            { name: "🏆 Winner", value: `<@${a.curWinId}>`, inline: true },
            { name: "💰 Price", value: `${a.curBid}pts`, inline: true }
          )
          .setFooter({ text: st.dry ? "🧪 DRY RUN" : "Deducted after session" })
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
    await th.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0x808080)
          .setTitle("❌ NO BIDS")
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
      `⏳ Next in 20s...\n📦 **${n.item}** - ${n.startPrice}pts`
    );
    st.th.next = setTimeout(async () => await startNext(cli, cfg), 20000);
  } else setTimeout(async () => await finalize(cli, cfg), 2000);
}

async function finalize(cli, cfg) {
  const g = await cli.guilds.fetch(cfg.main_guild_id);
  const adm = await g.channels.fetch(cfg.admin_logs_channel_id);
  const bch = await g.channels.fetch(cfg.bidding_channel_id);

  if (st.h.length === 0) {
    await bch.send("🎊 **Session complete!** No sales.");
    clearCache();
    st.sd = null;
    st.lp = {};
    save();
    return;
  }

  if (!st.sd) st.sd = ts();

  // Get all members from cache for auto-populate
  const allMembers = Object.keys(st.cp || {});
  const winners = {};
  st.h.forEach(
    (a) => (winners[a.winner] = (winners[a.winner] || 0) + a.amount)
  );

  // Auto-populate 0 for non-winners
  const res = allMembers.map((m) => ({
    member: m,
    totalSpent: winners[m] || 0,
  }));

  const sub = await submitRes(cfg.sheet_webhook_url, res, st.sd, st.dry);

  if (sub.ok) {
    const wList = st.h
      .map((a) => `• **${a.item}**: ${a.winner} - ${a.amount}pts`)
      .join("\n");
    const e = new EmbedBuilder()
      .setColor(0x00ff00)
      .setTitle("✅ Session Complete!")
      .setDescription("Results submitted")
      .addFields(
        { name: "🕐 Time", value: st.sd, inline: true },
        { name: "🏆 Sold", value: `${st.h.length}`, inline: true },
        {
          name: "💰 Total",
          value: `${res.reduce((s, r) => s + r.totalSpent, 0)}`,
          inline: true,
        },
        { name: "📋 Winners", value: wList || "None" },
        {
          name: "👥 Members Updated",
          value: `${res.length} (auto-populated 0 for non-winners)`,
          inline: false,
        }
      )
      .setFooter({ text: st.dry ? "🧪 DRY RUN" : "Points deducted" })
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
          .setColor(0xff0000)
          .setTitle("❌ Submit Failed")
          .setDescription(`**Error:** ${sub.err}\n**Time:** ${st.sd}`)
          .addFields({ name: "📝 Manual Entry", value: `\`\`\`\n${d}\n\`\`\`` })
          .setTimestamp(),
      ],
    });
    await bch.send("❌ Submit failed. Admins notified.");
  }

  st.h = [];
  st.sd = null;
  st.lp = {};
  clearCache();
  save();
}

// BIDDING (OPTIMIZED)
async function procBid(msg, amt, cfg) {
  const a = st.a;
  if (!a) return { ok: false, msg: "No auction" };
  if (a.status !== "active") return { ok: false, msg: "Not started" };
  if (msg.channel.id !== a.threadId) return { ok: false, msg: "Wrong thread" };

  const m = msg.member,
    u = m.nickname || msg.author.username,
    uid = msg.author.id;
  if (!hasRole(m) && !isAdm(m, cfg)) {
    await msg.reply("❌ Need ELYSIUM role");
    return { ok: false, msg: "No role" };
  }

  // Rate limit
  const now = Date.now();
  if (st.lb[uid] && now - st.lb[uid] < RL) {
    const wait = Math.ceil((RL - (now - st.lb[uid])) / 1000);
    await msg.reply(`⏳ Wait ${wait}s (rate limit)`);
    return { ok: false, msg: "Rate limited" };
  }

  const bid = parseInt(amt);
  if (isNaN(bid) || bid <= 0 || !Number.isInteger(bid)) {
    await msg.reply("❌ Invalid bid (integers only)");
    return { ok: false, msg: "Invalid" };
  }

  if (bid <= a.curBid) {
    await msg.reply(`❌ Must be > ${a.curBid}pts`);
    return { ok: false, msg: "Too low" };
  }

  // Cache check
  if (!st.cp) {
    await msg.reply("❌ Cache not loaded!");
    return { ok: false, msg: "No cache" };
  }

  const tot = getPts(u),
    av = avail(u, tot);

  if (tot === 0) {
    await msg.reply("❌ No points");
    return { ok: false, msg: "No pts" };
  }

  // Check if self-overbidding
  const isSelf = a.curWin && a.curWin.toLowerCase() === u.toLowerCase();
  const curLocked = st.lp[u] || 0;
  const needed = isSelf ? Math.max(0, bid - curLocked) : bid;

  if (needed > av) {
    await msg.reply(
      `❌ **Insufficient!**\n💰 Total: ${tot}\n🔒 Locked: ${curLocked}\n📊 Available: ${av}\n❗ Need: ${needed}`
    );
    return { ok: false, msg: "Insufficient" };
  }

  const confEmbed = new EmbedBuilder()
    .setColor(0xffd700)
    .setTitle("⏳ Confirm Bid")
    .setDescription(`**${a.item}**`)
    .addFields(
      { name: "💰 Your Bid", value: `${bid}pts`, inline: true },
      { name: "📊 Current", value: `${a.curBid}pts`, inline: true },
      { name: "💳 After", value: `${av - needed}pts`, inline: true }
    );

  if (isSelf) {
    confEmbed.addFields({
      name: "🔄 Self-Overbid",
      value: `Current: ${a.curBid}pts → New: ${bid}pts\n**+${needed}pts needed**`,
      inline: false,
    });
  }

  confEmbed.setFooter({ text: "✅ confirm / ❌ cancel • 10s timeout" });

  const conf = await msg.reply({ embeds: [confEmbed] });
  await conf.react("✅");
  await conf.react("❌");

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

  // Check if bid in last 10 seconds - PAUSE
  const timeLeft = a.endTime - Date.now();
  if (timeLeft <= 10000 && timeLeft > 0) {
    pauseAuction();
    await msg.channel.send(
      `⏸️ **PAUSED** - Bid in last 10s! Timer paused for confirmation...`
    );
  }

  st.th[`c_${conf.id}`] = setTimeout(async () => {
    if (st.pc[conf.id]) {
      await conf.reactions.removeAll().catch(() => {});
      await conf.edit({
        embeds: [
          confEmbed.setColor(0x808080).setFooter({ text: "⏰ Timed out" }),
        ],
      });
      setTimeout(async () => await conf.delete().catch(() => {}), 3000);
      delete st.pc[conf.id];
      save();

      // Resume if paused
      if (st.pause) {
        resumeAuction(conf.client, cfg);
        await msg.channel.send(
          `▶️ **RESUMED** - Bid timeout, auction continues...`
        );
      }
    }
  }, CT);

  return { ok: true, confId: conf.id };
}

// COMMAND HANDLERS
async function handleCmd(cmd, msg, args, cli, cfg) {
  switch (cmd) {
    case "!auction":
      if (args.length < 3)
        return await msg.reply(
          "❌ Usage: `!auction <item> <price> <duration>`"
        );
      const dur = parseInt(args[args.length - 1]),
        pr = parseInt(args[args.length - 2]),
        itm = args.slice(0, -2).join(" ");
      if (isNaN(pr) || pr <= 0 || isNaN(dur) || dur <= 0 || !itm.trim())
        return await msg.reply("❌ Invalid params");
      if (st.q.find((a) => a.item.toLowerCase() === itm.toLowerCase()))
        return await msg.reply(`❌ **${itm}** already queued`);
      addQ(itm, pr, dur);
      await msg.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x00ff00)
            .setTitle("✅ Queued")
            .setDescription(`**${itm}**`)
            .addFields(
              { name: "💰 Price", value: `${pr}pts`, inline: true },
              { name: "⏱️ Duration", value: fmtDur(dur), inline: true },
              { name: "📋 Position", value: `#${st.q.length}`, inline: true }
            )
            .setFooter({ text: "!startauction to begin" })
            .setTimestamp(),
        ],
      });
      break;

    case "!queuelist":
      if (st.q.length === 0) return await msg.reply("📋 Empty");
      await msg.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x4a90e2)
            .setTitle("📋 Queue")
            .setDescription(
              st.q
                .map(
                  (a, i) =>
                    `**${i + 1}.** ${a.item} - ${a.startPrice}pts • ${fmtDur(
                      a.duration
                    )}`
                )
                .join("\n")
            )
            .addFields({
              name: "📊 Total",
              value: `${st.q.length}`,
              inline: true,
            })
            .setTimestamp(),
        ],
      });
      break;

    case "!removeitem":
      if (args.length === 0)
        return await msg.reply("❌ Usage: `!removeitem <name>`");
      const rm = rmQ(args.join(" "));
      if (!rm) return await msg.reply("❌ Not found");
      await msg.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xff6600)
            .setTitle("🗑️ Removed")
            .setDescription(`**${rm.item}**`)
            .addFields({
              name: "📋 Left",
              value: `${st.q.length}`,
              inline: true,
            }),
        ],
      });
      break;

    case "!startauction":
      if (st.q.length === 0) return await msg.reply("❌ Empty queue");
      if (st.a) return await msg.reply("❌ Already active");
      const prev = st.q
        .slice(0, 10)
        .map((a, i) => `${i + 1}. **${a.item}** - ${a.startPrice}pts`)
        .join("\n");
      const cMsg = await msg.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xffd700)
            .setTitle("⚠️ Start?")
            .setDescription(
              `**${st.q.length} item(s)**:\n\n${prev}${
                st.q.length > 10 ? `\n*...+${st.q.length - 10} more*` : ""
              }`
            )
            .addFields({
              name: "🎯 Mode",
              value: st.dry ? "🧪 DRY" : "💰 LIVE",
              inline: true,
            })
            .setFooter({ text: "✅ start / ❌ cancel" }),
        ],
      });
      await cMsg.react("✅");
      await cMsg.react("❌");
      try {
        const col = await cMsg.awaitReactions({
          filter: (r, u) =>
            ["✅", "❌"].includes(r.emoji.name) && u.id === msg.author.id,
          max: 1,
          time: 30000,
          errors: ["time"],
        });
        if (col.first().emoji.name === "✅") {
          await cMsg.reactions.removeAll().catch(() => {});
          const load = await msg.channel.send("⚡ Loading cache...");
          const r = await startSess(cli, cfg);
          await load.delete().catch(() => {});
          if (r.ok) {
            await msg.channel.send({
              embeds: [
                new EmbedBuilder()
                  .setColor(0x00ff00)
                  .setTitle("🚀 Started!")
                  .setDescription(
                    `**${r.tot} item(s)** • First: **${r.first}**`
                  )
                  .addFields(
                    {
                      name: "⚡ Cached",
                      value: `${r.cached} members`,
                      inline: true,
                    },
                    {
                      name: "🎯 Mode",
                      value: st.dry ? "🧪 DRY" : "💰 LIVE",
                      inline: true,
                    }
                  )
                  .setFooter({ text: "⚡ Instant bidding!" })
                  .setTimestamp(),
              ],
            });
          } else await msg.channel.send(`❌ Failed: ${r.msg}`);
        } else await cMsg.reactions.removeAll().catch(() => {});
      } catch (e) {
        await cMsg.reactions.removeAll().catch(() => {});
      }
      break;

    case "!bid":
      if (args.length === 0)
        return await msg.reply("❌ Usage: `!bid <amount>`");
      const res = await procBid(msg, args[0], cfg);
      if (!res.ok) await msg.reply(`❌ ${res.msg}`);
      break;

    case "!dryrun":
      if (st.a) return await msg.reply("❌ Can't toggle during auction");
      if (args.length === 0)
        return await msg.reply(`Dry run: ${st.dry ? "🧪 ON" : "⚪ OFF"}`);
      const mode = args[0].toLowerCase();
      if (["on", "true", "enable"].includes(mode)) {
        st.dry = true;
        await msg.reply("🧪 DRY RUN ON");
      } else if (["off", "false", "disable"].includes(mode)) {
        st.dry = false;
        await msg.reply("💰 DRY RUN OFF");
      } else return await msg.reply("❌ Use on/off");
      save();
      break;

    case "!bidstatus":
      const statEmbed = new EmbedBuilder()
        .setColor(0x4a90e2)
        .setTitle("📊 Status");
      if (st.cp) {
        const age = Math.floor((Date.now() - st.ct) / 60000);
        statEmbed.addFields({
          name: "⚡ Cache",
          value: `✅ Loaded (${
            Object.keys(st.cp).length
          } members)\n⏱️ Age: ${age}m`,
          inline: false,
        });
      } else
        statEmbed.addFields({
          name: "⚡ Cache",
          value: "⚪ Not loaded",
          inline: false,
        });
      if (st.q.length > 0)
        statEmbed.addFields({
          name: "📋 Queue",
          value:
            st.q
              .slice(0, 5)
              .map((a, i) => `${i + 1}. ${a.item}`)
              .join("\n") +
            (st.q.length > 5 ? `\n*...+${st.q.length - 5} more*` : ""),
        });
      if (st.a) {
        const tLeft = st.pause
          ? `⏸️ PAUSED (${fmtTime(st.a.remainingTime)})`
          : fmtTime(st.a.endTime - Date.now());
        statEmbed.addFields(
          { name: "🔴 Active", value: st.a.item, inline: true },
          { name: "💰 Bid", value: `${st.a.curBid}pts`, inline: true },
          { name: "⏱️ Time", value: tLeft, inline: true }
        );
      }
      statEmbed
        .setFooter({ text: st.dry ? "🧪 DRY RUN" : "Use !auction to add" })
        .setTimestamp();
      await msg.reply({ embeds: [statEmbed] });
      break;

    case "!clearqueue":
      if (st.q.length === 0) return await msg.reply("📋 Empty");
      if (st.a) return await msg.reply("❌ Can't clear during auction");
      const cnt = clrQ();
      await msg.reply(`✅ Cleared ${cnt} item(s)`);
      break;

    case "!resetbids":
      const rstMsg = await msg.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xff0000)
            .setTitle("⚠️ RESET ALL?")
            .setDescription(
              "Clears:\n• Queue\n• Active auction\n• Locked points\n• History\n• Cache"
            )
            .setFooter({ text: "✅ confirm / ❌ cancel" }),
        ],
      });
      await rstMsg.react("✅");
      await rstMsg.react("❌");
      try {
        const col = await rstMsg.awaitReactions({
          filter: (r, u) =>
            ["✅", "❌"].includes(r.emoji.name) && u.id === msg.author.id,
          max: 1,
          time: 30000,
          errors: ["time"],
        });
        if (col.first().emoji.name === "✅") {
          Object.values(st.th).forEach((h) => clearTimeout(h));
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
          };
          save();
          await msg.reply("✅ Reset (cache cleared)");
        }
      } catch (e) {}
      break;

    case "!forcesubmitresults":
      if (!st.sd || st.h.length === 0) return await msg.reply("❌ No history");
      const fsMsg = await msg.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xff6600)
            .setTitle("⚠️ Force Submit?")
            .setDescription(`**Time:** ${st.sd}\n**Items:** ${st.h.length}`)
            .addFields({
              name: "📋 Results",
              value: st.h
                .map((a) => `• **${a.item}**: ${a.winner} - ${a.amount}pts`)
                .join("\n"),
              inline: false,
            })
            .setFooter({ text: "✅ submit / ❌ cancel" }),
        ],
      });
      await fsMsg.react("✅");
      await fsMsg.react("❌");
      try {
        const fsCol = await fsMsg.awaitReactions({
          filter: (r, u) =>
            ["✅", "❌"].includes(r.emoji.name) && u.id === msg.author.id,
          max: 1,
          time: 30000,
          errors: ["time"],
        });
        if (fsCol.first().emoji.name === "✅") {
          if (!st.sd) st.sd = ts();
          const winners = {};
          st.h.forEach(
            (a) => (winners[a.winner] = (winners[a.winner] || 0) + a.amount)
          );
          const allMembers = Object.keys(st.cp || {});
          const res = allMembers.map((m) => ({
            member: m,
            totalSpent: winners[m] || 0,
          }));
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
                  .setColor(0x00ff00)
                  .setTitle("✅ Force Submit OK!")
                  .setDescription("Submitted")
                  .addFields(
                    { name: "🕐 Time", value: st.sd, inline: true },
                    { name: "🏆 Items", value: `${st.h.length}`, inline: true },
                    {
                      name: "💰 Total",
                      value: `${res.reduce((s, r) => s + r.totalSpent, 0)}`,
                      inline: true,
                    },
                    { name: "📋 Winners", value: wList },
                    {
                      name: "👥 Updated",
                      value: `${res.length} (0 auto-populated)`,
                      inline: false,
                    }
                  )
                  .setFooter({
                    text: st.dry ? "🧪 DRY" : "Deducted • Cache cleared",
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
                  .setColor(0xff0000)
                  .setTitle("❌ Failed")
                  .setDescription(`**Error:** ${sub.err}`)
                  .addFields({
                    name: "📝 Data",
                    value: `\`\`\`\n${res
                      .filter((r) => r.totalSpent > 0)
                      .map((r) => `${r.member}: ${r.totalSpent}pts`)
                      .join("\n")}\n\`\`\``,
                  }),
              ],
            });
          }
        }
      } catch (e) {}
      break;

    case "!cancelitem":
      if (!st.a) return await msg.reply("❌ No active auction");
      if (msg.channel.id !== st.a.threadId)
        return await msg.reply("❌ Use in auction thread");
      const canMsg = await msg.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xff6600)
            .setTitle("⚠️ Cancel Item?")
            .setDescription(`**${st.a.item}**\n\nRefund all locked points?`)
            .setFooter({ text: "✅ yes / ❌ no" }),
        ],
      });
      await canMsg.react("✅");
      await canMsg.react("❌");
      try {
        const canCol = await canMsg.awaitReactions({
          filter: (r, u) =>
            ["✅", "❌"].includes(r.emoji.name) && u.id === msg.author.id,
          max: 1,
          time: 30000,
          errors: ["time"],
        });
        if (canCol.first().emoji.name === "✅") {
          Object.values(st.th).forEach((h) => clearTimeout(h));
          if (st.a.curWin) unlock(st.a.curWin, st.a.curBid);
          await msg.channel.send(
            `❌ **${st.a.item}** canceled. Points refunded.`
          );
          await msg.channel.setArchived(true, "Canceled").catch(() => {});
          st.q.shift();
          st.a = null;
          save();
          if (st.q.length > 0)
            setTimeout(async () => await startNext(cli, cfg), 5000);
          else await finalize(cli, cfg);
        }
      } catch (e) {}
      break;

    case "!skipitem":
      if (!st.a) return await msg.reply("❌ No active auction");
      if (msg.channel.id !== st.a.threadId)
        return await msg.reply("❌ Use in auction thread");
      const skpMsg = await msg.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xff6600)
            .setTitle("⚠️ Skip Item?")
            .setDescription(
              `**${st.a.item}**\n\nMark as no sale, move to next?`
            )
            .setFooter({ text: "✅ yes / ❌ no" }),
        ],
      });
      await skpMsg.react("✅");
      await skpMsg.react("❌");
      try {
        const skpCol = await skpMsg.awaitReactions({
          filter: (r, u) =>
            ["✅", "❌"].includes(r.emoji.name) && u.id === msg.author.id,
          max: 1,
          time: 30000,
          errors: ["time"],
        });
        if (skpCol.first().emoji.name === "✅") {
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
        }
      } catch (e) {}
      break;

    case "!mypoints":
      // Only in bidding channel (not thread)
      if (msg.channel.isThread() || msg.channel.id !== cfg.bidding_channel_id) {
        return await msg.reply(
          "❌ Use `!mypoints` in bidding channel only (not threads)"
        );
      }

      // Don't allow during active auction
      if (st.a) {
        return await msg.reply(
          "⚠️ Can't check points during auction. Wait for session to end."
        );
      }

      const u = msg.member.nickname || msg.author.username;

      // Fetch fresh from sheets
      const freshPts = await fetchPts(cfg.sheet_webhook_url, st.dry);
      if (!freshPts) {
        return await msg.reply("❌ Failed to fetch points from sheets.");
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
              .setColor(0xff0000)
              .setTitle("❌ Not Found")
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
              .setColor(0x00ff00)
              .setTitle("💰 Your Points")
              .setDescription(`**${u}**`)
              .addFields({
                name: "📊 Available Points",
                value: `${userPts} pts`,
                inline: true,
              })
              .setFooter({
                text: st.dry ? "🧪 DRY RUN MODE" : "Auto-deletes in 30s",
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
  initializeBidding,  // ✅ Export the initialization function
  loadBiddingState: load,
  saveBiddingState: save,
  getBiddingState: () => st,
  hasElysiumRole: hasRole,
  isAdmin: isAdm,
  getCachedPoints: getPts,
  loadPointsCache: loadCache,
  clearPointsCache: clearCache,
  handleCommand: handleCmd,

confirmBid: async function (reaction, user, config) {
  const p = st.pc[reaction.message.id];
  if (!p) return;

  const guild = reaction.message.guild,
    member = await guild.members.fetch(user.id).catch(() => null);
  if (!member) return;

  const isOwner = p.userId === user.id,
    isAdm = isAdmFunc(member, config);  // ✅ CHANGED: isAdmin() → isAdmFunc()
  
  if (!isOwner && !isAdm) {
    await reaction.users.remove(user.id).catch(() => {});
    return;
  }

    const a = st.a;
    if (!a || a.status !== "active") {
      await reaction.message.channel.send(
        `❌ <@${user.id}> Auction no longer active`
      );
      await reaction.message.reactions.removeAll().catch(() => {});
      await reaction.message.delete().catch(() => {});
      delete st.pc[reaction.message.id];
      save();

      // Resume if paused
      if (st.pause) {
        resumeAuction(reaction.client, config);
        await reaction.message.channel.send(
          `▶️ **RESUMED** - Auction continues...`
        );
      }
      return;
    }

    if (p.amount <= a.curBid) {
      await reaction.message.channel.send(
        `❌ <@${user.id}> Bid invalid. Current: ${a.curBid}pts`
      );
      await reaction.message.reactions.removeAll().catch(() => {});
      await reaction.message.delete().catch(() => {});
      delete st.pc[reaction.message.id];
      save();

      // Resume if paused
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
            .setColor(0xff6600)
            .setTitle("❌ Outbid!")
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
          .setColor(0x00ff00)
          .setTitle("✅ Bid Confirmed!")
          .setDescription(`Highest bidder on **${a.item}**`)
          .addFields(
            { name: "💰 Your Bid", value: `${p.amount}pts`, inline: true },
            { name: "📊 Previous", value: `${prevBid}pts`, inline: true },
            { name: "⏱️ Time Left", value: fmtTime(timeLeft), inline: true }
          )
          .setFooter({
            text: p.isSelf
              ? `Self-overbid (+${p.needed}pts)`
              : timeLeft < 60000 && a.extCnt < ME
              ? "⏰ Extended!"
              : "Good luck!",
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
        `▶️ **RESUMED** - Timer continues with ${fmtTime(
          a.endTime - Date.now()
        )} remaining...`
      );
    } else if (timeLeft < 60000) {
      schedTimers(reaction.client, config);
    }

    console.log(
      `✅ Bid: ${p.username} - ${p.amount}pts${
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
    isAdm = isAdmFunc(member, config);  // ✅ CHANGED: isAdmin() → isAdmFunc()
  
  if (!isOwner && !isAdm) {
    await reaction.users.remove(user.id).catch(() => {});
    return;
  }

    await reaction.message.edit({
      embeds: [
        new EmbedBuilder()
          .setColor(0x808080)
          .setTitle("❌ Bid Canceled")
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
        `▶️ **RESUMED** - Bid canceled, auction continues...`
      );
    }
  },

  recoverBiddingState: async (client, config) => {
    if (load()) {
      console.log("📦 State recovered");
      if (st.cp) {
        const age = Math.floor((Date.now() - st.ct) / 60000);
        console.log(
          `⚡ Cache: ${Object.keys(st.cp).length} members (${age}m old)`
        );
        if (age > 60) {
          console.log("⚠️ Cache old, clearing...");
          clearCache();
        }
      } else console.log("⚪ No cache");

      if (st.a && st.a.status === "active") {
        console.log("🔄 Rescheduling timers...");
        schedTimers(client, config);
        if (!st.cp) console.warn("⚠️ Active auction but no cache!");
      }
      return true;
    }
    return false;
  },
};
