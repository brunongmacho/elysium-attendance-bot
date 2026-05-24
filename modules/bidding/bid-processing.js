/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                    BID PROCESSING - Auctioneering & Standalone            ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Processes bids for both auctioneering mode and standalone bidding mode.
 * All bids are instant (no confirmations required).
 *
 * @module modules/bidding/bid-processing
 */

const { EmbedBuilder } = require("discord.js");
const state = require('./state');
const { COLORS, EMOJI, ERROR_MESSAGES, RL, ME } = require('./constants');
const { save } = require('./persistence');
const { lock, unlock } = require('./points-locking');
const { getPts, logBidRejection } = require('./points-cache');
const { normalizeUsername } = require('./utilities');

// ═══════════════════════════════════════════════════════════════════════════
// BID PROCESSING - Auctioneering Mode (Instant Bidding)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Processes instant bids for auctioneering mode (NO confirmations)
 *
 * CRITICAL FEATURES:
 * 1. INSTANT PROCESSING - No confirmation required
 * 2. RACE CONDITION PREVENTION - Rate limiting, points locking
 * 3. TIME EXTENSION - Bids in final 15 seconds extend by 15 seconds
 * 4. VALIDATION CHECKS - Role, rate limit, amount, points
 * 5. STATE UPDATES - Lock/unlock points, update current item
 * 6. USER FEEDBACK - Immediate confirmation embed
 *
 * @param {Message} msg - Discord message object
 * @param {string} amt - Bid amount as string (will be parsed to integer)
 * @param {Object} auctState - Auctioneering module state reference
 * @param {Object} auctRef - Auctioneering module reference (for callbacks)
 * @param {Object} config - Bot configuration object
 * @returns {Promise<Object>} { ok: boolean, msg?: string, instant?: true }
 */
async function procBidAuctioneering(msg, amt, auctState, auctRef, config) {
  const itemFromThread = msg.channel?.id ? auctState.threadItems?.[msg.channel.id] : null;
  const currentItem = itemFromThread || auctState.currentItem;

  // Safety check: Ensure currentItem and currentSession exist
  if (!currentItem) {
    await msg.reply(ERROR_MESSAGES.NO_ACTIVE_ITEM);
    return { ok: false, msg: "No item" };
  }

  const currentSession = currentItem.currentSession;
  if (!currentSession) {
    await msg.reply(ERROR_MESSAGES.SESSION_UNAVAILABLE);
    state.logger.error(`⚠️ Missing currentSession for item: ${currentItem.item}`);
    return { ok: false, msg: "No session" };
  }

  // Check if item has already ended (force-stopped)
  if (currentItem.status === "ended") {
    await msg.reply(`${EMOJI.ERROR} **Auction Ended** - This item is no longer accepting bids.`);
    return { ok: false, msg: "Ended" };
  }

  const m = msg.member,
    u = m.nickname || m.displayName || msg.author.displayName || msg.author.username,
    uid = msg.author.id;

  if (!state.hasRole(m) && !state.isAdm(m, config)) {
    await msg.reply(ERROR_MESSAGES.NO_ROLE);
    return { ok: false, msg: "No role" };
  }

  // CRITICAL: Block bids during session finalization
  if (state.finalizationInProgress) {
    await msg.reply(`${EMOJI.CLOCK} Session finalizing... please wait`);
    return { ok: false, msg: "Finalizing" };
  }

  // Attendance check removed - all guild members can now bid freely
  const now = Date.now();
  if (state.st.lb[uid] && now - state.st.lb[uid] < 3000) {
    const wait = Math.ceil((3000 - (now - state.st.lb[uid])) / 1000);
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

  // Bid validation: First bid can match starting price, subsequent bids must exceed current bid
  // This prevents race conditions while allowing the starting bid to be placed
  const hasWinner = currentItem.curWin !== null && currentItem.curWin !== undefined;
  if (hasWinner ? (bid <= currentItem.curBid) : (bid < currentItem.curBid)) {
    const minBid = hasWinner ? currentItem.curBid + 1 : currentItem.curBid;
    await msg.reply(`${EMOJI.ERROR} Must be >= ${minBid}pts (current: ${currentItem.curBid}pts${hasWinner ? ', outbid required' : ', starting bid'})`);
    return { ok: false, msg: "Too low" };
  }

  if (!state.st.cp) {
    await msg.reply(`${EMOJI.ERROR} Cache not loaded!`);
    return { ok: false, msg: "No cache" };
  }

  const tot = getPts(u);

  if (tot === 0) {
    await msg.reply(`${EMOJI.ERROR} No points`);
    // Log to admin channel (critical: user has no points but trying to bid)
    logBidRejection(msg.client, config, {
      user: u,
      userId: uid,
      item: currentItem.item,
      bidAmount: bid,
      reason: 'No points available',
      totalPoints: tot
    });
    return { ok: false, msg: "No pts" };
  }

  // Calculate locked points ACROSS ALL SYSTEMS (auctioneering uses st.lp from bidding.js)
  // Use Discord ID for nickname-agnostic lookup
  const lockedKey = uid || normalizeUsername(u);
  const curLocked = state.st.lp[lockedKey] || 0;
  const av = tot - curLocked;

  // Check if self-outbid - use ID for comparison when available
  const selfKey = currentItem.curWinId || (currentItem.curWin ? normalizeUsername(currentItem.curWin) : null);
  const isSelf = selfKey && (uid === selfKey || (currentItem.curWin && normalizeUsername(currentItem.curWin) === normalizeUsername(u)));
  const needed = isSelf ? Math.max(0, bid - currentItem.curBid) : bid;

  if (needed > av) {
    await msg.reply(
      `${EMOJI.ERROR} **Insufficient!**\n${EMOJI.BID} Total: ${tot}\n${EMOJI.LOCK} Locked: ${curLocked}\n${EMOJI.CHART} Available: ${av}\n${EMOJI.WARNING} Need: ${needed}`
    );
    // Log to admin channel (critical: insufficient points)
    logBidRejection(msg.client, config, {
      user: u,
      userId: uid,
      item: currentItem.item,
      bidAmount: bid,
      reason: 'Insufficient points',
      totalPoints: tot,
      lockedPoints: curLocked,
      availablePoints: av,
      neededPoints: needed
    });
    return { ok: false, msg: "Insufficient" };
  }

  // ==========================================
  // INSTANT BIDDING - NO CONFIRMATIONS
  // Bids process immediately with 3s rate limit spam protection
  // ==========================================

  // Update rate limit immediately to prevent rapid-fire bids
  state.st.lb[uid] = now;

  // Handle previous winner (unlock their points)
  if (currentItem.curWin && !isSelf) {
    try {
      // Use curWinId for nickname-agnostic unlock
      unlock(currentItem.curWin, currentItem.curBid, currentItem.curWinId);
    } catch (err) {
      state.logger.error(`❌ CRITICAL: Failed to unlock points for ${currentItem.curWin}:`, err);
    }
  }

  // Lock the new bid
  try {
    // Use uid for nickname-agnostic lock
    lock(u, needed, uid);
  } catch (err) {
    state.logger.error(`❌ CRITICAL: Failed to lock points for ${u}:`, err);
    // If we can't lock points, we MUST restore previous state
    if (currentItem.curWin && !isSelf) {
      try {
        // Use curWinId for restore
        lock(currentItem.curWin, currentItem.curBid, currentItem.curWinId);
      } catch (restoreErr) {
        state.logger.error(`❌ FATAL: Failed to restore previous state:`, restoreErr);
      }
    }
    return {
      status: "error",
      msg: "⚠️ Failed to process bid - system error. Please contact admin.",
    };
  }

  // Store previous bid for display
  const prevBid = currentItem.curBid;

  // Update current item
  currentItem.curBid = bid;
  currentItem.curWin = u;
  currentItem.curWinId = uid;

  if (!currentItem.bids) currentItem.bids = [];
  currentItem.bids.push({
    user: u,
    userId: uid,
    amount: bid,
    timestamp: now,
  });

  // CRITICAL: Check if bid is in last 65 seconds - extend time by 15 seconds
  // MUST clear timers BEFORE checking to prevent race condition where timer fires during processing
  const timeLeft = currentItem.endTime - Date.now();
  if (!currentItem.extCnt) currentItem.extCnt = 0;

  let timeExtended = false;
  if (timeLeft < 20000 && timeLeft > 0 && currentItem.extCnt < ME) {
    // CRITICAL: Validate auctioneering module has required methods
    if (!auctRef ||
        typeof auctRef.safelyClearItemTimers !== "function" ||
        typeof auctRef.rescheduleItemTimers !== "function") {
      state.logger.error("❌ Cannot extend time - auctioneering module missing critical timer methods");
      return {
        status: "error",
        msg: "⚠️ Time extension failed - system error. Please contact admin.",
      };
    }

    // STEP 1: Clear ALL timers IMMEDIATELY to prevent old itemEnd from firing
    auctRef.safelyClearItemTimers(msg.channel.id);
    state.logger.info(`🛑 Cleared timers to prevent race condition`);

    // STEP 2: Update endTime (now safe since timers are cleared)
    const extensionTime = 15000; // 15 seconds
    currentItem.endTime += extensionTime;
    currentItem.extCnt++;
    timeExtended = true;

    state.logger.info(
      `⏰ Time extended for ${currentItem.item} by 15 seconds (bid in final 15s, ext #${currentItem.extCnt}/${ME})`
    );
    state.logger.info(`Old end time: ${new Date(currentItem.endTime - extensionTime).toLocaleTimeString()}`);
    state.logger.info(`New end time: ${new Date(currentItem.endTime).toLocaleTimeString()}`);
    state.logger.info(`New time left: ${Math.ceil((currentItem.endTime - Date.now()) / 1000)}s`);

    // STEP 3: Reschedule timers with new endTime
    auctRef.rescheduleItemTimers(
      msg.client,
      config,
      msg.channel,
      msg.channel.id
    );
    state.logger.info(`✅ Timers rescheduled with new endTime`);
  }

  // Update via auctioneering module - CRITICAL for state sync
  if (!auctRef || typeof auctRef.updateCurrentItemState !== "function") {
    state.logger.error("❌ CRITICAL: Cannot sync state with auctioneering module");
    // This is critical - if state doesn't sync, timers will use stale data
    // Continue anyway but log the issue for investigation
  } else {
    auctRef.updateCurrentItemState({
      curBid: bid,
      curWin: u,
      curWinId: uid,
      bids: currentItem.bids,
    }, msg.channel.id);
  }

  // Save state
  save();

  // Send immediate confirmation to bidder
  await msg.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(COLORS.SUCCESS)
        .setTitle(`${EMOJI.SUCCESS} Bid Placed!`)
        .setDescription(`You're now the highest bidder on **${currentItem.item}**`)
        .addFields(
          {
            name: `${EMOJI.BID} Your Bid`,
            value: `${bid}pts`,
            inline: true,
          },
          {
            name: `${EMOJI.CHART} Previous`,
            value: `${prevBid}pts`,
            inline: true,
          },
          {
            name: `💳 Available`,
            value: `${av - needed}pts`,
            inline: true,
          }
        )
        .setFooter({
          text: isSelf
            ? `Self-overbid (+${needed}pts) • ${currentItem.extCnt}/${ME} extensions`
            : `Locked ${needed}pts • ${currentItem.extCnt}/${ME} extensions`,
        }),
    ],
  });

  // Announce to channel
  const announceEmbed = new EmbedBuilder()
    .setColor(COLORS.AUCTION)
    .setTitle(`${EMOJI.FIRE} New High Bid!`)
    .setDescription(`**${currentItem.item}**`)
    .addFields(
      {
        name: `${EMOJI.BID} Amount`,
        value: `${bid}pts`,
        inline: true,
      },
      {
        name: "👤 Bidder",
        value: u,
        inline: true
      },
      {
        name: "⏱️ Time",
        value: `${Math.ceil((currentItem.endTime - Date.now()) / 1000)}s remaining`,
        inline: true,
      }
    );

  await msg.channel.send({ embeds: [announceEmbed] });

  // Announce time extension if it happened
  if (timeExtended) {
    const endTimestamp = Math.floor(currentItem.endTime / 1000);
    await msg.channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0xffa500)
          .setTitle(`⏰ Time Extended!`)
          .setDescription(
            `Bid placed in final seconds - adding 15 more seconds to the auction!`
          )
          .addFields({
            name: "⏱️ Ends",
            value: `<t:${endTimestamp}:R>`,
            inline: true,
          })
          .setFooter({ text: `Extension ${currentItem.extCnt}/${ME}` }),
      ],
    });
  }

  return { ok: true, instant: true };
}

// ═══════════════════════════════════════════════════════════════════════════
// BID PROCESSING - Standalone Mode (Instant Bidding)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Processes instant bids for standalone mode (NO confirmations)
 *
 * DUAL MODE ROUTING:
 * - First checks if auctioneering module is active
 * - Routes to procBidAuctioneering if auctioneering is active
 * - Continues with standalone mode if not
 *
 * @param {Message} msg - Discord message object
 * @param {string} amt - Bid amount as string (will be parsed to integer)
 * @param {Object} cfg - Bot configuration object
 * @returns {Promise<Object>} { ok: boolean, msg?: string }
 */
async function procBid(msg, amt, cfg) {
  // CRITICAL FIX: Check if auctioneering is active first
  if (state.auctioneering && typeof state.auctioneering.getAuctionState === "function") {
    const auctState = state.auctioneering.getAuctionState();
    if (auctState && auctState.active && auctState.currentItem) {
      return await procBidAuctioneering(
        msg,
        amt,
        auctState,
        state.auctioneering,
        cfg
      );
    }
  }

  const a = state.st.a;
  if (!a) return { ok: false, msg: "No auction" };
  if (a.status !== "active") return { ok: false, msg: "Not started" };
  if (msg.channel.id !== a.threadId) return { ok: false, msg: "Wrong thread" };

  const m = msg.member,
    u = m.nickname || m.displayName || msg.author.displayName || msg.author.username,
    uid = msg.author.id;
  if (!state.hasRole(m) && !state.isAdm(m, cfg)) {
    await msg.reply(`${EMOJI.ERROR} Need guild role`);
    return { ok: false, msg: "No role" };
  }

  // Rate limit
  const now = Date.now();
  if (state.st.lb[uid] && now - state.st.lb[uid] < RL) {
    const wait = Math.ceil((RL - (now - state.st.lb[uid])) / 1000);
    await msg.reply(`${EMOJI.CLOCK} Wait ${wait}s (rate limit)`);
    return { ok: false, msg: "Rate limited" };
  }

  const bid = parseInt(amt);
  if (isNaN(bid) || bid <= 0 || !Number.isInteger(bid)) {
    await msg.reply(`${EMOJI.ERROR} Invalid bid (integers only)`);
    return { ok: false, msg: "Invalid" };
  }

  // Bid validation: First bid can match starting price, subsequent bids must exceed current bid
  // This prevents race conditions while allowing the starting bid to be placed
  const hasWinner = a.curWin !== null && a.curWin !== undefined;
  if (hasWinner ? (bid <= a.curBid) : (bid < a.curBid)) {
    const minBid = hasWinner ? a.curBid + 1 : a.curBid;
    await msg.reply(`${EMOJI.ERROR} Must be >= ${minBid}pts (current: ${a.curBid}pts${hasWinner ? ', outbid required' : ', starting bid'})`);
    return { ok: false, msg: "Too low" };
  }

  // Cache check
  if (!state.st.cp) {
    await msg.reply(`${EMOJI.ERROR} Cache not loaded!`);
    return { ok: false, msg: "No cache" };
  }

  const tot = getPts(u),
    av = tot - ((state.st.lp[uid || normalizeUsername(u)]) || 0);

  if (tot === 0) {
    await msg.reply(`${EMOJI.ERROR} No points`);
    return { ok: false, msg: "No pts" };
  }

  // Check if self-overbidding - use ID for comparison
  const selfKey = a.curWinId || (a.curWin ? normalizeUsername(a.curWin) : null);
  const isSelf = selfKey && (uid === selfKey || (a.curWin && normalizeUsername(a.curWin) === normalizeUsername(u)));

  // Use Discord ID for nickname-agnostic lookup
  const lockedKey = uid || normalizeUsername(u);
  const curLocked = state.st.lp[lockedKey] || 0;
  const needed = isSelf ? Math.max(0, bid - a.curBid) : bid;

  if (needed > av) {
    await msg.reply(
      `${EMOJI.ERROR} **Insufficient!**\n${EMOJI.BID} Total: ${tot}\n${EMOJI.LOCK} Locked: ${curLocked}\n${EMOJI.CHART} Available: ${av}\n${EMOJI.WARNING} Need: ${needed}`
    );
    return { ok: false, msg: "Insufficient" };
  }

  // ==========================================
  // INSTANT BIDDING - NO CONFIRMATIONS
  // Bids process immediately with 3s rate limit spam protection
  // ==========================================

  // Update rate limit immediately to prevent rapid-fire bids
  state.st.lb[uid] = now;

  // Handle previous winner (unlock their points)
  if (a.curWin && !isSelf) {
    // Use curWinId for nickname-agnostic unlock
    unlock(a.curWin, a.curBid, a.curWinId);
  }

  // Lock the new bid - use uid for nickname-agnostic lock
  lock(u, needed, uid);

  // Store previous bid for display
  const prevBid = a.curBid;

  // Update current auction
  a.curBid = bid;
  a.curWin = u;
  a.curWinId = uid;

  if (!a.bids) a.bids = [];
  a.bids.push({
    user: u,
    userId: uid,
    amount: bid,
    timestamp: now,
  });

  save();

  // Send immediate confirmation to bidder
  const confirmEmbed = new EmbedBuilder()
    .setColor(state.getColor(COLORS.SUCCESS))
    .setTitle(`${EMOJI.SUCCESS} Bid Placed!`)
    .setDescription(
      `You're now the highest bidder on **${a.item}**`
    )
    .addFields(
      { name: `${EMOJI.BID} Your Bid`, value: `${bid}pts`, inline: true },
      { name: `${EMOJI.CHART} Previous High`, value: `${prevBid}pts`, inline: true },
      { name: "💳 Points Left", value: `${av - needed}pts`, inline: true }
    )
    .setFooter({ text: isSelf ? "Self-overbid processed" : "Points locked until outbid or win" });

  await msg.reply({ embeds: [confirmEmbed] });

  // Notify previous winner they were outbid (if not self-overbid)
  if (a.curWin && !isSelf && a.curWinId) {
    try {
      const prevWinner = await msg.guild.members.fetch(a.curWinId).catch(() => null);
      if (prevWinner) {
        const outbidEmbed = new EmbedBuilder()
          .setColor(state.getColor(COLORS.INFO))
          .setTitle(`${EMOJI.WARNING} You've Been Outbid!`)
          .setDescription(`**${a.item}** - New high bid: ${bid}pts`)
          .addFields(
            { name: "Your Bid", value: `${prevBid}pts`, inline: true },
            { name: "New High", value: `${bid}pts`, inline: true }
          )
          .setFooter({ text: `${prevBid}pts unlocked` });

        await prevWinner.send({ embeds: [outbidEmbed] }).catch(() => {
          // Silently fail if DMs are closed
        });
      }
    } catch (err) {
      // Silently fail - don't block auction for DM errors
    }
  }

  state.logger.info(`[BID] ${u} bid ${bid}pts on ${a.item} (was: ${prevBid}pts, self: ${isSelf})`);

  return { ok: true, msg: "Bid placed" };
}

module.exports = { procBidAuctioneering, procBid };
