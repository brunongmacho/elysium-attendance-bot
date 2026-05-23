/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║           AUCTIONEERING PERSISTENCE - Data Access & Persistence           ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Data access functions: fetchSheetItems, logAuctionResult, saveAuctionState.
 *
 * @module modules/auctioneering/persistence
 */

const { state } = require('./state');
const { EMOJI } = require('./constants');

/**
 * Fetches auction items from Google Sheets with circuit breaker and fallback cache.
 *
 * FEATURES:
 * - Circuit breaker prevents cascade failures during API outages
 * - Automatic fallback to cached items if API fails
 * - Exponential backoff retry logic (2s, 4s, 6s)
 * - Never returns null (returns empty array on total failure)
 * - Records success/failure metrics for monitoring
 *
 * @param {number} [retries=3] - Maximum retry attempts
 * @param {boolean} [allowCache=true] - Allow fallback to cached items
 * @returns {Promise<Array<Object>>} Items array (never null, but may be empty)
 */
async function fetchSheetItems(retries = 3, allowCache = true) {
  // Check circuit breaker - skip if open and use cache
  if (!state.auctionCache.canAttemptFetch()) {
    state.logger.info(`${EMOJI.WARNING} Circuit breaker OPEN - using cached items`);
    const cachedItems = state.auctionCache.getCachedItems();

    if (cachedItems.length > 0) {
      state.logger.info(`${EMOJI.INFO} Using ${cachedItems.length} cached items from ${state.auctionCache.cache.lastUpdate}`);
      return cachedItems;
    } else {
      state.logger.error(`${EMOJI.ERROR} No cached items available and circuit is open!`);
      return [];
    }
  }

  // Attempt to fetch from Google Sheets
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const data = await state.sheetAPI.call('getBiddingItems');
      const items = data.items || [];

      state.logger.info(
        `${EMOJI.SUCCESS} Fetched ${items.length} items from Google Sheets`
      );

      state.auctionCache.recordSuccess(items);

      return items;
    } catch (e) {
      state.logger.error(
        `${EMOJI.ERROR} Fetch items attempt ${attempt}/${retries}:`,
        e.message
      );

      if (attempt === retries) {
        state.auctionCache.recordFailure(e);
      }

      if (attempt < retries) {
        const backoff = Math.min(
          2000 * Math.pow(2, attempt) + Math.random() * 1000,
          30000
        );
        state.logger.info(`${EMOJI.WARNING} Retrying in ${Math.round(backoff / 1000)}s...`);
        await new Promise((resolve) => setTimeout(resolve, backoff));
      }
    }
  }

  if (allowCache) {
    const cachedItems = state.auctionCache.getCachedItems();

    if (cachedItems.length > 0) {
      const cacheAge = state.auctionCache.cache.lastFetch
        ? Math.floor((Date.now() - state.auctionCache.cache.lastFetch) / 1000 / 60)
        : '∞';

      state.logger.info(
        `${EMOJI.WARNING} FALLBACK: Using ${cachedItems.length} cached items (age: ${cacheAge} minutes)`
      );

      return cachedItems;
    } else {
      state.logger.error(`${EMOJI.ERROR} CRITICAL: No cached items available!`);
      return [];
    }
  }

  return [];
}

/**
 * Logs auction results to Google Sheets for permanent record keeping.
 *
 * @param {number} itemIndex - Index of item in the sheet
 * @param {string} winner - Winner's Discord username (or empty if no winner)
 * @param {number} winningBid - Final winning bid amount in points
 * @param {number} totalBids - Sum of all bids placed on this item
 * @param {number} bidCount - Number of bids placed
 * @param {string} itemSource - Source of item (e.g., "GoogleSheet")
 * @param {string} timestamp - Formatted timestamp of auction completion
 * @returns {Promise<boolean>} True if successfully logged, false otherwise
 */
async function logAuctionResult(
  itemIndex,
  winner,
  winningBid,
  totalBids,
  bidCount,
  itemSource,
  timestamp,
  winnerId = null,
  itemId = null
) {
  try {
    await state.sheetAPI.call('logAuctionResult', {
      itemIndex,
      winner,
      winningBid,
      totalBids,
      bidCount,
      itemSource,
      timestamp,
    });
    state.logger.info(
      `${EMOJI.SUCCESS} Result logged: ${winner || "No winner"} - ${winningBid}pts`
    );
    return true;
  } catch (e) {
    state.logger.error(`${EMOJI.ERROR} Log result:`, e);
    return false;
  }
}

/**
 * Saves the current auction state to Google Sheets for crash recovery.
 *
 * FEATURES:
 * - Circular reference protection (skips timers and circular objects)
 * - Cleans item data to only include serializable fields
 * - Auto-save triggers on important state changes
 * - Enables session recovery after bot restart
 *
 * @returns {Promise<boolean>} True if successfully saved, false otherwise
 */
async function saveAuctionState() {
  const cleanItem =
    state.auctionState.currentItem && typeof state.auctionState.currentItem === "object"
      ? {
          item: state.auctionState.currentItem.item,
          startPrice: state.auctionState.currentItem.startPrice,
          duration: state.auctionState.currentItem.duration,
          curBid: state.auctionState.currentItem.curBid,
          curWin: state.auctionState.currentItem.curWin,
          curWinId: state.auctionState.currentItem.curWinId,
          status: state.auctionState.currentItem.status,
          source: state.auctionState.currentItem.source,
          sheetIndex: state.auctionState.currentItem.sheetIndex,
          bossName: state.auctionState.currentItem.bossName,
          _id: state.auctionState.currentItem._id
        }
      : null;

  const stateToSave = {
    auctionState: {
      active: state.auctionState.active,
      currentItem: cleanItem,
      sessionItems: state.auctionState.sessionItems,
      currentItemIndex: state.auctionState.currentItemIndex,
      paused: state.auctionState.paused,
    },
    timestamp: state.getTimestamp(),
  };

  try {
    await state.sheetAPI.call('saveBotState', { state: stateToSave });
    state.logger.info(`${EMOJI.SUCCESS} Auction state saved`);
    return true;
  } catch (e) {
    state.logger.error(`${EMOJI.ERROR} Save auction state:`, e);
    return false;
  }
}

module.exports = {
  fetchSheetItems,
  logAuctionResult,
  saveAuctionState,
};
