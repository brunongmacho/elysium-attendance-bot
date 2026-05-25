/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                    AUCTION LIFECYCLE - Pause, Resume, Finalize           ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Manages the full lifecycle of an auction session including:
 * - Pause/resume for bid confirmations
 * - Starting next item, activating auctions
 * - Timer scheduling and announcements (going once/twice/final)
 * - Ending auctions and finalizing sessions
 * - Submitting results to Google Sheets
 *
 * @module modules/bidding/auction-lifecycle
 */

const { EmbedBuilder } = require("discord.js");
const state = require('./state');
const {
  TIMEOUTS,
  COLORS,
  EMOJI,
  COMMAND_ALIASES,
  FEATURE_FLAGS,
  createPaginatedEmbeds,
} = require('./constants');
const { save, clearAllTimers, fetchPts, submitRes, saveBiddingStateToSheet } = require('./persistence');
const { lock, unlock } = require('./points-locking');
const { normalizeUsername } = require('./utilities');
const errorHandler = require('../../utils/error-handler');

// ═══════════════════════════════════════════════════════════════════════════
// AUCTION PAUSE/RESUME SYSTEM
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Pauses active auction (for bid confirmation in final seconds)
 *
 * PAUSE MECHANISM:
 * - Sets pause flag (st.pause = true)
 * - Records remaining time (endTime - now)
 * - Records pause timestamp
 * - CLEARS all auction timers (going once/twice/final/end)
 *
 * @returns {boolean} True if successfully paused, false otherwise
 */
function pauseAuction() {
  if (state.st.pause || !state.st.a || state.st.a.status !== "active") return false;
  state.st.pause = true;
  state.st.a.pausedAt = Date.now();
  state.st.a.remainingTime = state.st.a.endTime - Date.now();

  ["goingOnce", "goingTwice", "finalCall", "auctionEnd"].forEach((k) => {
    if (state.st.th[k]) {
      clearTimeout(state.st.th[k]);
      delete state.st.th[k];
    }
  });

  state.logger.info(`${EMOJI.PAUSE} PAUSED: ${state.st.a.remainingTime}ms remaining`);
  save();
  return true;
}

/**
 * Resumes paused auction with time extension if needed
 *
 * RESUME MECHANISM:
 * - Clears pause flag (st.pause = false)
 * - Calculates new endTime based on remaining time
 * - EXTENDS to 60 seconds minimum if paused with <60s remaining
 * - Reschedules all auction timers
 *
 * @param {Client} cli - Discord client instance
 * @param {Object} cfg - Bot configuration object
 * @returns {boolean} True if successfully resumed, false otherwise
 */
function resumeAuction(cli, cfg) {
  if (!state.st.pause || !state.st.a || state.st.a.status !== "active") return false;
  state.st.pause = false;

  const wasUnder60 = state.st.a.remainingTime < 60000;
  if (wasUnder60) {
    state.st.a.endTime = Date.now() + 60000;
    state.st.a.goingOnceAnnounced = false;
    state.st.a.goingTwiceAnnounced = false;
    state.logger.info(
      `${EMOJI.PLAY} RESUME: Extended to 60s (was ${Math.floor(
        state.st.a.remainingTime / 1000
      )}s)`
    );
  } else {
    state.st.a.endTime = Date.now() + state.st.a.remainingTime;
    state.logger.info(`${EMOJI.PLAY} RESUME: ${state.st.a.remainingTime}ms remaining`);
  }

  delete state.st.a.pausedAt;
  delete state.st.a.remainingTime;

  schedTimers(cli, cfg);
  save();
  return true;
}

// ═══════════════════════════════════════════════════════════════════════════
// AUCTION ITEM LIFECYCLE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Starts the next item in the auction queue
 *
 * @param {Client} cli - Discord client instance
 * @param {Object} cfg - Bot configuration object
 */
async function startNext(cli, cfg) {
  if (state.st.q.length === 0) {
    await finalize(cli, cfg);
    return;
  }

  const d = state.st.q[0];
  const ch = await state.discordCache.getChannel('bidding_channel_id');

  const isBatch = d.quantity > 1;
  const threadName = isBatch
    ? `${d.item} x${d.quantity} - ${state.ts()} | ${d.startPrice}pts | ${state.fmtDur(d.duration)}`
    : `${d.item} - ${state.ts()} | ${d.startPrice}pts | ${state.fmtDur(d.duration)}`;

  const th = await ch.threads.create({
    name: threadName,
    autoArchiveDuration: 60,
    reason: `Auction: ${d.item}`,
  });

  state.st.a = {
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
    .setColor(state.getColor(COLORS.AUCTION))
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
        value: state.fmtDur(d.duration),
        inline: true,
      },
      {
        name: `${EMOJI.LIST} Items Left`,
        value: `${state.st.q.length - 1}`,
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

  state.st.th.aStart = setTimeout(
    async () => await activate(cli, cfg, th),
    30000
  );
  save();
}

/**
 * Activates an auction (moves from preview to active status)
 *
 * @param {Client} cli - Discord client instance
 * @param {Object} cfg - Bot configuration object
 * @param {Object} th - Discord thread object
 */
async function activate(cli, cfg, th) {
  state.st.a.status = "active";
  state.st.a.endTime = Date.now() + state.st.a.duration * 60000;

  const isBatch = state.st.a.quantity > 1;

  const activeEmbed = new EmbedBuilder()
    .setColor(COLORS.SUCCESS)
    .setTitle(`${EMOJI.FIRE} BIDDING NOW!`)
    .setDescription(
      `Type \`!bid <amount>\` to bid${
        isBatch
          ? `\n\n**${state.st.a.quantity} items available** - Top ${state.st.a.quantity} bidders win!`
          : ""
      }`
    )
    .addFields(
      {
        name: `${EMOJI.BID} Current`,
        value: `${state.st.a.curBid} pts`,
        inline: true,
      },
      { name: `${EMOJI.TIME} Time`, value: state.fmtDur(state.st.a.duration), inline: true }
    )
    .setFooter({
      text: `${EMOJI.CLOCK} 10s confirm • ${EMOJI.LOCK} 3s rate limit`,
    });

  await th.send({ embeds: [activeEmbed] });
  schedTimers(cli, cfg);
  save();
}

// ═══════════════════════════════════════════════════════════════════════════
// TIMER MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Schedules auction timers (going once/twice/final/end)
 *
 * CRITICAL: Clears existing timers before scheduling new ones
 * to prevent race conditions where multiple timers fire simultaneously.
 *
 * @param {Client} cli - Discord client instance
 * @param {Object} cfg - Bot configuration object
 */
function schedTimers(cli, cfg) {
  const a = state.st.a,
    t = a.endTime - Date.now();
  // Bug #15 fix: Delete timer keys after clearing to prevent orphaned references
  ["goingOnce", "goingTwice", "finalCall", "auctionEnd"].forEach((k) => {
    if (state.st.th[k]) {
      clearTimeout(state.st.th[k]);
      delete state.st.th[k];
    }
  });
  if (t > TIMEOUTS.GOING_ONCE && !a.go1)
    state.st.th.goingOnce = setTimeout(
      async () => await ann1(cli, cfg),
      t - TIMEOUTS.GOING_ONCE
    );
  if (t > TIMEOUTS.GOING_TWICE && !a.go2)
    state.st.th.goingTwice = setTimeout(
      async () => await ann2(cli, cfg),
      t - TIMEOUTS.GOING_TWICE
    );
  if (t > TIMEOUTS.FINAL_CALL)
    state.st.th.finalCall = setTimeout(
      async () => await ann3(cli, cfg),
      t - TIMEOUTS.FINAL_CALL
    );
  state.st.th.auctionEnd = setTimeout(async () => await endAuc(cli, cfg), t);
}

/**
 * Announces "Going Once!" warning
 *
 * @param {Client} cli - Discord client instance
 * @param {Object} cfg - Bot configuration object
 */
async function ann1(cli, cfg) {
  const a = state.st.a;
  if (!a || a.status !== "active" || state.st.pause) return;

  // Bug #26 fix: Check thread existence before sending
  const th = await cli.channels.fetch(a.threadId).catch(() => null);
  if (!th) {
    state.logger.error(`${EMOJI.ERROR} Thread ${a.threadId} no longer exists, skipping announcement`);
    return;
  }

  const endTimestamp = Math.floor(a.endTime / 1000);

  await th.send({
    content: "@everyone",
    embeds: [
      new EmbedBuilder()
        .setColor(COLORS.WARNING)
        .setTitle(`${EMOJI.WARNING} GOING ONCE!`)
        .setDescription(`Auction ends <t:${endTimestamp}:R>`)
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

/**
 * Announces "Going Twice!" warning
 *
 * @param {Client} cli - Discord client instance
 * @param {Object} cfg - Bot configuration object
 */
async function ann2(cli, cfg) {
  const a = state.st.a;
  if (!a || a.status !== "active" || state.st.pause) return;

  // Bug #26 fix: Check thread existence before sending
  const th = await cli.channels.fetch(a.threadId).catch(() => null);
  if (!th) {
    state.logger.error(`${EMOJI.ERROR} Thread ${a.threadId} no longer exists, skipping announcement`);
    return;
  }

  const endTimestamp = Math.floor(a.endTime / 1000);

  await th.send({
    content: "@everyone",
    embeds: [
      new EmbedBuilder()
        .setColor(state.getColor(COLORS.WARNING))
        .setTitle(`${EMOJI.WARNING} GOING TWICE!`)
        .setDescription(`Auction ends <t:${endTimestamp}:R>`)
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

/**
 * Announces "Final Call!" warning
 *
 * @param {Client} cli - Discord client instance
 * @param {Object} cfg - Bot configuration object
 */
async function ann3(cli, cfg) {
  const a = state.st.a;
  if (!a || a.status !== "active" || state.st.pause) return;

  // Bug #26 fix: Check thread existence before sending
  const th = await cli.channels.fetch(a.threadId).catch(() => null);
  if (!th) {
    state.logger.error(`${EMOJI.ERROR} Thread ${a.threadId} no longer exists, skipping announcement`);
    return;
  }

  const endTimestamp = Math.floor(a.endTime / 1000);

  await th.send({
    content: "@everyone",
    embeds: [
      new EmbedBuilder()
        .setColor(state.getColor(COLORS.ERROR))
        .setTitle(`${EMOJI.WARNING} FINAL CALL!`)
        .setDescription(`Auction ends <t:${endTimestamp}:R>`)
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

/**
 * Ends the current auction and determines winners
 *
 * @param {Client} cli - Discord client instance
 * @param {Object} cfg - Bot configuration object
 */
async function endAuc(cli, cfg) {
  const a = state.st.a;
  if (!a) return;
  a.status = "ended";

  // Bug #26 fix: Check thread existence before sending
  const th = await cli.channels.fetch(a.threadId).catch(() => null);
  if (!th) {
    state.logger.error(`${EMOJI.ERROR} Thread ${a.threadId} no longer exists, cannot send auction results`);
    // Still need to finalize to clear locked points and update state
    await finalize(cli, cfg);
    return;
  }

  const isBatch = a.quantity > 1;

  if (isBatch && a.bids.length > 0) {
    // Batch auction - determine winners
    // Bug #22 fix: Ensure each user can only win once (take their highest bid only)
    const seenUsers = new Set();
    const uniqueBids = a.bids
      .sort((x, y) => y.amount - x.amount)
      .filter((b) => {
        const userKey = normalizeUsername(b.user);
        if (seenUsers.has(userKey)) {
          return false; // Skip duplicate user
        }
        seenUsers.add(userKey);
        return true;
      })
      .slice(0, a.quantity);

    a.winners = uniqueBids.map((b) => ({
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
          .setColor(state.getColor(COLORS.AUCTION))
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
      state.st.h.push({
        item: a.item,
        winner: w.username,
        winnerId: w.userId,
        amount: w.amount,
        timestamp: Date.now(),
      });
    });

    // Bug #24 fix: Limit history to prevent unbounded growth (keep last 1000 entries)
    const MAX_HISTORY_SIZE = 1000;
    if (state.st.h.length > MAX_HISTORY_SIZE) {
      const removed = state.st.h.length - MAX_HISTORY_SIZE;
      state.st.h = state.st.h.slice(-MAX_HISTORY_SIZE);
      state.logger.info(`🧹 Trimmed auction history: removed ${removed} oldest entries, kept ${MAX_HISTORY_SIZE}`);
    }
  } else if (a.curWin) {
    // Single item auction
    await th.send({
      embeds: [
        new EmbedBuilder()
          .setColor(state.getColor(COLORS.AUCTION))
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
    state.st.h.push({
      item: a.item,
      winner: a.curWin,
      winnerId: a.curWinId,
      amount: a.curBid,
      timestamp: Date.now(),
    });

    // Bug #24 fix: Limit history to prevent unbounded growth (keep last 1000 entries)
    const MAX_HISTORY_SIZE = 1000;
    if (state.st.h.length > MAX_HISTORY_SIZE) {
      const removed = state.st.h.length - MAX_HISTORY_SIZE;
      state.st.h = state.st.h.slice(-MAX_HISTORY_SIZE);
      state.logger.info(`🧹 Trimmed auction history: removed ${removed} oldest entries, kept ${MAX_HISTORY_SIZE}`);
    }
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

  // Lock the thread first to prevent new messages
  if (typeof th.setLocked === "function") {
    await th
      .setLocked(true, "Auction ended")
      .catch((err) =>
        state.logger.warn(`⚠️ Failed to lock thread ${th.id}:`, err.message)
      );
  }

  // Wait for Discord API to process the lock before archiving
  await new Promise(r => setTimeout(r, 500));

  await th
    .setArchived(true, "Ended")
    .catch((err) =>
      state.logger.warn(`⚠️ Failed to archive thread ${th.id}:`, err.message)
    );
  state.st.q.shift();
  state.st.a = null;
  save();

  if (state.st.q.length > 0) {
    const n = state.st.q[0];
    await th.parent.send(
      `${EMOJI.CLOCK} Next in 20s...\n${EMOJI.LIST} **${n.item}** - ${n.startPrice}pts`
    );
    state.st.th.next = setTimeout(
      async () => await startNext(cli, cfg),
      TIMEOUTS.NEXT_ITEM_DELAY
    );
  } else {
    setTimeout(async () => await finalize(cli, cfg), TIMEOUTS.FINALIZE_DELAY);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SESSION MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Submits session tally to Google Sheets
 *
 * @param {Object} config - Bot configuration object
 * @param {Array<Object>} sessionItems - Items sold in this session
 */
async function submitSessionTally(config, sessionItems) {
  if (!state.st.cp || sessionItems.length === 0) {
    state.logger.info(`⚠️ No items to tally`);
    return;
  }

  if (!state.st.sd) state.st.sd = state.ts();

  const allMembers = state.st.cp.getAllUsernames();
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

  const sub = await submitRes(config.sheet_webhook_url, res, state.st.sd);

  if (sub.ok) {
    state.logger.info(`✅ Session tally submitted`);
    state.st.h = [];
    state.st.sd = null;
    state.st.lp = {};
    const { clearCache } = require('./points-cache');
    clearCache();
  } else {
    state.logger.error(`❌ Tally submission failed:`, sub.err);
  }
}

/**
 * Finalizes the auction session, submits results, and cleans up state
 *
 * CRITICAL: Uses finalization lock to prevent concurrent finalization
 *
 * @param {Client} cli - Discord client instance
 * @param {Object} cfg - Bot configuration object
 */
async function finalize(cli, cfg) {
  // Prevent concurrent finalization or bids during finalization
  if (state.finalizationInProgress) {
    state.logger.warn("⚠️ Finalization already in progress, skipping duplicate call");
    return;
  }

  state.finalizationInProgress = true;
  try {
    const [adm, bch] = await Promise.all([
      state.discordCache.getChannel('admin_logs_channel_id'),
      state.discordCache.getChannel('bidding_channel_id')
    ]);

    // Stop cache auto-refresh
    const { stopCacheAutoRefresh } = require('./points-cache');
    stopCacheAutoRefresh();

    if (state.st.h.length === 0) {
      await bch.send(`${EMOJI.SUCCESS} **Session complete!** No sales.`);
      const { clearCache } = require('./points-cache');
      clearCache();
      state.st.sd = null;
      state.st.lp = {};
      await save(true); // Force immediate sync to persist session completion
      return;
    }

    if (!state.st.sd) state.st.sd = state.ts();

    const allMembers = state.st.cp ? state.st.cp.getAllUsernames() : [];

    const winners = {};
    state.st.h.forEach((a) => {
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

    state.logger.info(`${EMOJI.CHART} FINALIZE DEBUG:`);
    state.logger.info("Winners (normalized):", winners);
    state.logger.info(
      "Non-zero results:",
      res.filter((r) => r.totalSpent > 0)
    );

    const sub = await submitRes(cfg.sheet_webhook_url, res, state.st.sd);

    if (sub.ok) {
      // Create multiple embeds instead of truncating
      // Track session items separately - history may contain old items from bot restart
      // Use timestamp comparison to only include this session's items
      const sessionStartTime = typeof state.st.sd === 'string' ? Date.parse(state.st.sd) : state.st.sd.getTime();
      const sessionItems = state.st.h.filter(a => a.timestamp >= sessionStartTime);
      const itemList = sessionItems.length > 0
        ? sessionItems.map((a, i) => `${i + 1}. **${a.item}**: ${a.winner} - ${a.amount}pts`)
        : ["No items"];

      const totalSpent = res.reduce((s, r) => s + r.totalSpent, 0);

      const sessionEmbeds = createPaginatedEmbeds(
        `${EMOJI.SUCCESS} Session Complete`,
        itemList,
        15,
        { color: COLORS.SUCCESS, footer: `Total: ${totalSpent} pts` }
      );

      // Update first embed with summary
      sessionEmbeds[0]
        .setDescription(`**Results submitted**\n**${sessionItems.length}** items sold\n**${totalSpent}** pts total`)
        .addFields(
          { name: `${EMOJI.CLOCK} Time`, value: state.st.sd, inline: true },
          { name: `${EMOJI.TROPHY} Sold`, value: `${sessionItems.length}`, inline: true },
          { name: `${EMOJI.BID} Total`, value: `${totalSpent}`, inline: true },
          { name: "👥 Members Updated", value: `${res.length}`, inline: false }
        )
        .setFooter({ text: "Points deducted" });

      // Send all embeds
      try {
        for (const embed of sessionEmbeds) {
          await bch.send({ embeds: [embed] });
          await adm.send({ embeds: [embed] });
        }
      } catch (err) {
        state.logger.error(`Failed to send session summary embeds:`, err.message);
        // Still continue to cleanup below
      }
    } else {
      const filteredMembers = res.filter((r) => r.totalSpent > 0);
      const items = filteredMembers.map((r) => `${r.member}: ${r.totalSpent}pts`);
      const allData = items.join("\n");
      const d = allData.length > 1020
        ? (() => {
            let count = 0;
            let body = "";
            for (const item of items) {
              const candidate = count === 0 ? item : `${body}\n${item}`;
              const suffix = `\n...and ${items.length - count - 1} more items`;
              if (candidate.length + suffix.length > 1020) break;
              body = candidate;
              count++;
            }
            const remaining = items.length - count;
            return remaining > 0
              ? (count > 0 ? `${body}\n` : "") + `...and ${remaining} more items`
              : body;
          })()
        : allData;
      await adm.send({
        embeds: [
          new EmbedBuilder()
            .setColor(state.getColor(COLORS.ERROR))
            .setTitle(`${EMOJI.ERROR} Submit Failed`)
            .setDescription(`**Error:** ${sub.err}\n**Time:** ${state.st.sd}`)
            .addFields({
              name: `${EMOJI.LIST} Manual Entry`,
              value: `\`\`\`\n${d}\n\`\`\``,
            })
            .setTimestamp(),
        ],
      });
      await bch.send(`${EMOJI.ERROR} Submit failed. Admins notified.`);
    }

    state.st.h = [];
    state.st.sd = null;
    state.st.lp = {};
    const { clearCache } = require('./points-cache');
    clearCache();
    await save(true); // Force immediate sync to persist session finalization
  } finally {
    state.finalizationInProgress = false;
  }
}

/**
 * Checks if session is currently being finalized
 *
 * @returns {boolean} True if finalization is in progress
 */
function isFinalizingSession() {
  return state.finalizationInProgress;
}

/**
 * Forces immediate end of active auction (emergency recovery)
 *
 * CRITICAL - ADMIN ONLY:
 * - Should only be used when auction is stuck/crashed
 * - Bypasses normal auction end workflow
 * - Forces session finalization immediately
 *
 * @param {Client} client - Discord client instance
 * @param {Object} config - Bot configuration object
 */
async function forceEndAuction(client, config) {
  if (!state.st.a) {
    state.logger.info(`${EMOJI.WARNING} No active auction to end`);
    return;
  }

  state.logger.info(`Force ending auction: ${state.st.a.item}`);

  // Clear all timers
  [
    "goingOnce",
    "goingTwice",
    "finalCall",
    "auctionEnd",
    "next",
    "aStart",
  ].forEach((k) => {
    if (state.st.th[k]) {
      clearTimeout(state.st.th[k]);
      delete state.st.th[k];
    }
  });

  // Force finalize current session
  await finalize(client, config);

  state.logger.info(`Auction force-ended`);
}

module.exports = {
  pauseAuction,
  resumeAuction,
  startNext,
  activate,
  schedTimers,
  ann1,
  ann2,
  ann3,
  endAuc,
  submitSessionTally,
  finalize,
  isFinalizingSession,
  forceEndAuction,
};
