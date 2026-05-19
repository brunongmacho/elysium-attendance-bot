/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                    POINTS CACHE MANAGEMENT - Auto-Refresh System          ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Manages the caching of bidding points from Google Sheets with automatic
 * refresh intervals and stale cache detection.
 *
 * @module modules/bidding/points-cache
 */

const { EmbedBuilder } = require("discord.js");
const state = require('./state');
const { COLORS, EMOJI, CACHE_REFRESH_INTERVAL } = require('./constants');
const { save, fetchPts } = require('./persistence');
const { PointsCache } = require('../../utils/points-cache');

// ═══════════════════════════════════════════════════════════════════════════
// POINTS CACHE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Loads and caches bidding points from Google Sheets
 *
 * CACHING STRATEGY:
 * - Caches points in memory (st.cp) for fast access during bidding
 * - Records cache timestamp (st.ct) for staleness detection
 * - Automatically starts auto-refresh if auction is active
 *
 * AUTO-REFRESH:
 * - Refreshes cache every 30 minutes during active auctions
 * - Keeps data fresh without manual intervention
 * - Prevents stale point balances in long auction sessions
 *
 * @param {string} url - Google Sheets webhook URL
 * @returns {Promise<boolean>} True if cache loaded successfully
 */
async function loadCache(url) {
  // Validate URL parameter
  if (!url || typeof url !== "string") {
    state.logger.error("❌ Invalid URL provided to loadCache");
    return false;
  }

  state.logger.info("🔄 Loading cache...");
  const t0 = Date.now();
  const p = await fetchPts(url);
  if (!p) {
    state.logger.error("❌ Cache fail");
    return false;
  }
  // Wrap points data in PointsCache for O(1) lookups
  state.st.cp = new PointsCache(p);
  state.st.ct = Date.now();
  save();
  state.logger.info(
    `✅ Cache: ${Date.now() - t0}ms - ${Object.keys(p).length} members`
  );

  // Start auto-refresh timer if auction is active
  if (state.st.a && state.st.a.status === "active") {
    startCacheAutoRefresh(url);
  }

  return true;
}

/**
 * Starts automatic cache refresh interval (30 minutes)
 *
 * AUTO-REFRESH BEHAVIOR:
 * - Only runs while auction is active
 * - Automatically stops when auction ends
 * - Prevents memory leaks by clearing existing timer first
 *
 * @param {string} url - Google Sheets webhook URL for refresh
 */
function startCacheAutoRefresh(url) {
  // Clear existing timer
  if (state.st.cacheRefreshTimer) {
    clearInterval(state.st.cacheRefreshTimer);
  }

  // Set up auto-refresh every 30 minutes
  state.st.cacheRefreshTimer = setInterval(async () => {
    try {
      // Check both bidding mode (st.a) and auctioneering mode
      const biddingActive = state.st.a && state.st.a.status === "active";
      let auctioneeringActive = false;

      try {
        auctioneeringActive = state.auctioneering && state.auctioneering.getAuctionState().active;
      } catch (err) {
        // Module not available or error getting state
      }

      if (biddingActive || auctioneeringActive) {
        state.logger.info("🔄 Auto-refreshing cache...");
        await loadCache(url);
      } else {
        // Stop refreshing if no active auction
        stopCacheAutoRefresh();
      }
    } catch (error) {
      state.logger.error("❌ Error in cache auto-refresh:", error.message);
      // Continue interval, don't break it
    }
  }, CACHE_REFRESH_INTERVAL);

  state.logger.info("✅ Cache auto-refresh enabled (every 30 minutes)");
}

/**
 * Stops automatic cache refresh interval
 *
 * CLEANUP:
 * - Clears interval timer
 * - Nullifies timer reference
 * - Called when auction ends or is cancelled
 */
function stopCacheAutoRefresh() {
  if (state.st.cacheRefreshTimer) {
    clearInterval(state.st.cacheRefreshTimer);
    state.st.cacheRefreshTimer = null;
    state.logger.info("⏹️ Cache auto-refresh stopped");
  }
}

/**
 * Retrieves points for a user from cache with case-insensitive matching
 *
 * MATCHING LOGIC:
 * 1. Try exact match first (fastest)
 * 2. Try case-insensitive match (fallback)
 * 3. Return 0 if user not found
 *
 * IMPORTANT: Returns 0 for unknown users (allows them to bid with 0 points warning)
 *
 * @param {string} u - Username to look up
 * @returns {number|null} Points balance or null if cache not loaded
 */
function getPts(u) {
  if (!state.st.cp) return null;
  // Use PointsCache for efficient O(1) lookup
  return state.st.cp.getPoints(u);
}

/**
 * Logs critical bid rejections to admin channel for visibility and debugging
 *
 * THROTTLING:
 * - Only logs once per user per 30 seconds to prevent spam
 * - Stores last log time per user in st.lastBidRejectionLog
 *
 * ASYNC & NON-BLOCKING:
 * - Runs asynchronously after 0ms timeout (doesn't block bidding)
 * - Silent fail if admin channel unavailable (doesn't break bidding)
 *
 * @param {Client} client - Discord client instance
 * @param {Object} config - Bot configuration with admin_logs_channel_id
 * @param {Object} details - Rejection details (user, item, bidAmount, reason, etc.)
 */
async function logBidRejection(client, config, details) {
  try {
    if (!client || !config || !config.admin_logs_channel_id) return;

    // Debounce: Only log every 30 seconds per user to avoid spam
    const now = Date.now();
    const key = `${details.userId}_bid_rejection`;
    if (state.st.lastBidRejectionLog && state.st.lastBidRejectionLog[key]) {
      const timeSinceLastLog = now - state.st.lastBidRejectionLog[key];
      if (timeSinceLastLog < 30000) return; // Skip if logged recently
    }

    if (!state.st.lastBidRejectionLog) state.st.lastBidRejectionLog = {};
    state.st.lastBidRejectionLog[key] = now;

    // Send to admin logs asynchronously (don't block bid processing)
    setTimeout(async () => {
      try {
        const adminLogs = await state.discordCache?.getChannel('admin_logs_channel_id').catch(() => null);
        if (!adminLogs) return;

        const embed = new EmbedBuilder()
          .setColor(0xFFA500) // Orange for warning
          .setTitle(`${EMOJI.WARNING} Bid Rejected`)
          .setDescription(`**User:** ${details.user} (<@${details.userId}>)\n**Item:** ${details.item}\n**Bid:** ${details.bidAmount}pts\n**Reason:** ${details.reason}`)
          .setTimestamp();

        if (details.totalPoints !== undefined) embed.addFields({ name: 'Total Points', value: `${details.totalPoints}pts`, inline: true });
        if (details.availablePoints !== undefined) embed.addFields({ name: 'Available', value: `${details.availablePoints}pts`, inline: true });
        if (details.neededPoints !== undefined) embed.addFields({ name: 'Needed', value: `${details.neededPoints}pts`, inline: true });

        await adminLogs.send({ embeds: [embed] });
      } catch (err) {
        // Silent fail - don't block bidding if admin logging fails
        state.logger.error('Failed to log bid rejection to admin channel:', err.message);
      }
    }, 0);
  } catch (err) {
    // Silent fail
    state.logger.error('logBidRejection error:', err.message);
  }
}

/**
 * Clears points cache and stops auto-refresh
 *
 * CLEANUP:
 * - Stops auto-refresh timer (prevents memory leaks)
 * - Nullifies cache (st.cp) and timestamp (st.ct)
 * - Persists cleared state
 *
 * SIDE EFFECTS:
 * - Users won't be able to bid until cache is reloaded
 * - Any pending bids will fail with "cache not loaded" error
 */
function clearCache() {
  state.logger.info("🧹 Clear cache");
  stopCacheAutoRefresh();
  state.st.cp = null;
  state.st.ct = null;
  save();
}

module.exports = {
  loadCache,
  startCacheAutoRefresh,
  stopCacheAutoRefresh,
  getPts,
  logBidRejection,
  clearCache,
};
