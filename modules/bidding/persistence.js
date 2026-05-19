/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                    STATE PERSISTENCE - Dual Storage Strategy              ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Manages saving and loading bidding state to both local file system and
 * Google Sheets for resilience across bot restarts and Koyeb deployments.
 *
 * @module modules/bidding/persistence
 */

const fs = require("fs");
const state = require('./state');
const { SF, COLORS, EMOJI, FEATURE_FLAGS, mongoBiddingCircuit } = require('./constants');
const { normalizeUsername } = require('./utilities');
const { PointsCache } = require('../../utils/points-cache');
const { SheetAPI } = require('../../utils/sheet-api');
const errorHandler = require('../../utils/error-handler');

// MongoDB Integration (Phase 4)
const mongoHelpers = require('../../utils/mongodb-helpers');
const sheetSync = require('../../services/sheet-sync');

// ═══════════════════════════════════════════════════════════════════════════
// INTERNAL CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Interval between automatic Google Sheets syncs (5 minutes)
 * @constant {number}
 */
const SHEET_SYNC_INTERVAL = 5 * 60 * 1000;

// ═══════════════════════════════════════════════════════════════════════════
// STATE PERSISTENCE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Persists bidding state to both local file and Google Sheets
 *
 * DUAL STORAGE STRATEGY:
 * 1. LOCAL FILE (bidding-state.json):
 *    - Fast access for immediate state recovery
 *    - May be ephemeral on Koyeb (resets on restart)
 *
 * 2. GOOGLE SHEETS:
 *    - Persistent across Koyeb restarts
 *    - Synced every 5 minutes (throttled to prevent API rate limits)
 *    - Force sync available via forceSync parameter
 *
 * STATE CLEANING:
 * - Removes circular references from pending confirmations
 * - Excludes non-serializable timer handles
 *
 * @param {boolean} [forceSync=false] - Force immediate Google Sheets sync
 */
async function save(forceSync = false) {
  try {
    const { th, pauseTimer, cacheRefreshTimer, ...s } = state.st;

    // Clean up circular references from pending confirmations
    const cleanState = {
      ...s,
      pc: Object.fromEntries(
        Object.entries(s.pc).map(([key, val]) => {
          const { auctStateRef, auctRef, ...cleanVal } = val;
          return [key, cleanVal];
        })
      ),
      // Convert PointsCache instance to plain object for JSON serialization
      cp: s.cp && s.cp.toObject ? s.cp.toObject() : s.cp,
    };

    // Always save to local file for quick access (works even on ephemeral Koyeb FS)
    try {
      fs.writeFileSync(SF, JSON.stringify(cleanState, null, 2));
    } catch (fileErr) {
      // On Koyeb, file system might be read-only or restricted
      state.logger.warn(
        "⚠️ Local file save failed (expected on Koyeb):",
        fileErr.message
      );
    }

    // Sync to Google Sheets for persistence across Koyeb restarts
    const now = Date.now();
    const shouldSync =
      forceSync || now - state.lastSheetSyncTime > SHEET_SYNC_INTERVAL;

    if (state.cfg && state.cfg.sheet_webhook_url && shouldSync) {
      state.lastSheetSyncTime = now;
      if (forceSync) {
        // When forceSync is true, await the sync with retry logic
        state.logger.info("📊 Forcing immediate state sync to Google Sheets...");
        const maxRetries = 3;
        let lastError;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            await saveBiddingStateToSheet();
            state.logger.info("✅ State successfully synced to Google Sheets");
            break; // Success
          } catch (err) {
            lastError = err;
            if (attempt < maxRetries) {
              const delay = Math.pow(2, attempt) * 1000; // Exponential backoff: 2s, 4s, 8s
              state.logger.warn(`⚠️ Sync attempt ${attempt} failed, retrying in ${delay}ms...`);
              await new Promise(r => setTimeout(r, delay));
            }
          }
        }
        if (lastError) {
          state.logger.error(`❌ All ${maxRetries} sync attempts failed:`, lastError.message);
          throw new Error(`Failed to sync state after ${maxRetries} attempts`);
        }
      } else {
        // Background sync (fire-and-forget for periodic saves)
        saveBiddingStateToSheet().catch((err) => {
          state.logger.error("❌ Background sheet sync failed:", err.message);
        });
      }
    }
  } catch (e) {
    state.logger.error("❌ Save:", e);
  }
}

/**
 * Loads bidding state from local file or Google Sheets
 *
 * LOADING PRIORITY:
 * 1. LOCAL FILE: Attempt to load from bidding-state.json first (fastest)
 * 2. GOOGLE SHEETS: Fallback for Koyeb restarts where local file is lost
 * 3. FRESH STATE: Start with clean state if both sources fail
 *
 * STATE RESTORATION:
 * - Preserves: queue, active auction, locked points, history
 * - Resets: timers, rate limits, pause state, cache refresh timer
 *
 * @returns {Promise<boolean>} True if state was loaded successfully
 */
async function load() {
  try {
    // Try local file first (fast)
    if (fs.existsSync(SF)) {
      const d = JSON.parse(fs.readFileSync(SF, "utf8"));
      state.st = {
        ...state.st,
        ...d,
        // Wrap points cache back in PointsCache for efficient lookups
        cp: d.cp ? new PointsCache(d.cp) : null,
        th: {},
        lb: {},
        pause: false,
        pauseTimer: null,
        auctionLock: false,
        cacheRefreshTimer: null,
      };
      state.logger.info("✅ Loaded state from local file");
      return true;
    }
  } catch (e) {
    state.logger.warn("⚠️ Local file load failed:", e.message);
  }

  // Fallback to Google Sheets (for Koyeb restarts)
  if (state.cfg && state.cfg.sheet_webhook_url) {
    state.logger.info("📊 Local file not found, loading from Google Sheets...");
    try {
      const sheetState = await loadBiddingStateFromSheet(state.cfg.sheet_webhook_url);
      if (sheetState) {
        state.st = {
          ...state.st,
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
        state.logger.info("✅ Loaded state from Google Sheets");
        return true;
      }
    } catch (err) {
      state.logger.error("❌ Sheet load failed:", err.message);
    }
  }

  state.logger.info("ℹ️ Starting with fresh state");
  return false;
}

/**
 * Initializes the bidding module with configuration and dependencies
 *
 * SETUP:
 * - Injects config and admin check function
 * - Links auctioneering module for dual-mode support
 * - Starts automatic cleanup schedule for stale confirmations
 *
 * MUST be called before any bidding operations
 *
 * @param {Object} config - Bot configuration object
 * @param {Function} isAdminFunc - Function to check if user has admin privileges
 * @param {Object} auctioneeringRef - Reference to auctioneering.js module
 * @param {Object} cache - Discord channel cache instance
 */
function initializeBidding(config, isAdminFunc, auctioneeringRef, cache = null) {
  state.isAdmFunc = isAdminFunc;
  state.cfg = config;
  state.auctioneering = auctioneeringRef;
  state.sheetAPI = new SheetAPI(config.sheet_webhook_url);
  state.discordCache = cache;

  // Start cleanup schedule for pending confirmations
  const { startCleanupSchedule } = require('./cleanup');
  startCleanupSchedule();
}

/**
 * Clears all active timers from the bidding state
 * Optimization: Consolidates repeated timer clearing logic (5+ occurrences)
 *
 * @returns {number} Number of timers cleared
 */
function clearAllTimers() {
  if (!state.st.th || typeof state.st.th !== 'object') return 0;
  const count = Object.keys(state.st.th).length;
  Object.values(state.st.th).forEach((h) => clearTimeout(h));
  state.st.th = {};
  return count;
}

// ═══════════════════════════════════════════════════════════════════════════
// GOOGLE SHEETS API - Points & State Management
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Fetches bidding points from Google Sheets
 *
 * POINTS STRUCTURE:
 * - Key: username (case-insensitive matching)
 * - Value: available points balance
 *
 * @param {string} url - Google Sheets webhook URL (used as fallback)
 * @returns {Promise<Object|null>} Points object or null on failure
 */
async function fetchPts(url) {
  // Use Google Sheets only (MongoDB removed per user request)
  try {
    const result = await state.sheetAPI.call('getBiddingPointsSummary');
    return result.points || {};
  } catch (e) {
    state.logger.error("❌ Fetch pts:", e);
    return null;
  }
}

/**
 * Submits auction results to Google Sheets
 *
 * RESULT FORMAT:
 * - Array of objects: { member: username, totalSpent: points }
 * - Includes ALL members (winners and non-winners with 0 spent)
 *
 * @param {string} url - Google Sheets webhook URL
 * @param {Array<Object>} res - Results array with member and totalSpent
 * @param {string} time - Session timestamp (Manila timezone)
 * @returns {Promise<Object>} { ok: boolean, d: data, err: error, res: results }
 */
async function submitRes(url, res, time) {
  if (!time || !res || res.length === 0)
    return { ok: false, err: "Missing data" };

  // Submit to Google Sheets only (MongoDB removed per user request)
  state.logger.info(`💾 Submitting ${res.length} member results to Google Sheets...`);
  const startTime = Date.now();

  try {
    const d = await state.sheetAPI.call('submitBiddingResults', {
      results: res,
      timestamp: time,
    });

    const duration = Date.now() - startTime;

    if (d.status === "ok") {
      state.logger.info(`✅ [Sheets] Results submitted successfully (${duration}ms)`);
      return { ok: true, d: { status: "ok", source: 'Google Sheets' } };
    } else {
      state.logger.error(`❌ [Sheets] Failed to submit results: ${d.message || d.err}`);
      return { ok: false, err: d.message || d.err, res };
    }
  } catch (error) {
    state.logger.error(`❌ [Sheets] Failed to submit results:`, error.message);
    return { ok: false, err: error.message, res };
  }
}

/**
 * Saves bidding state to Google Sheets
 *
 * @returns {Promise<void>}
 */
async function saveBiddingStateToSheet() {
  try {
    const stateToSave = {
      queue: state.st.q,
      activeAuction: state.st.a,
      lockedPoints: state.st.lp,
      history: state.st.h,
    };

    // Phase 4: Save to MongoDB first if enabled
    if (FEATURE_FLAGS.USE_MONGODB_BIDDING) {
      try {
        await mongoHelpers.saveBotState('bidding', stateToSave);
        state.logger.info(`✅ [MongoDB] Bot state saved`);

        // Queue background sync to Sheets
        sheetSync.queueSync({
          type: 'saveBotState',
          data: { module: 'bidding', state: stateToSave }
        }, sheetSync.SYNC_PRIORITIES.HIGH);

        return;
      } catch (mongoError) {
        state.logger.error(`❌ [MongoDB] Save state error:`, mongoError);
        // Fall through to Sheets as backup
      }
    }

    // Legacy path or MongoDB fallback
    await state.sheetAPI.call('saveBotState', {
      state: stateToSave,
    });

    state.logger.info(`✅ Bot state saved to sheet`);
  } catch (e) {
    state.logger.error(`❌ Save state:`, e);
  }
}

/**
 * Loads bidding state from Google Sheets
 *
 * @param {string} url - Google Sheets webhook URL
 * @returns {Promise<Object|null>} State object or null on failure
 */
async function loadBiddingStateFromSheet(url) {
  // Phase 4: Load from MongoDB first if enabled
  if (FEATURE_FLAGS.USE_MONGODB_BIDDING) {
    try {
      const mongoState = await mongoHelpers.getBotState('bidding');
      if (mongoState) {
        state.logger.info(`✅ [MongoDB] Bot state loaded`);
        return mongoState;
      }
      state.logger.info(`ℹ️ [MongoDB] No saved state found, trying Sheets...`);
    } catch (mongoError) {
      state.logger.error(`❌ [MongoDB] Load state error:`, mongoError);
      state.logger.info(`🔄 Falling back to Sheets...`);
    }
  }

  // Legacy path or MongoDB fallback
  try {
    const data = await state.sheetAPI.call('getBotState');
    return data.state || null;
  } catch (e) {
    state.logger.error(`❌ Load state:`, e);
    return null;
  }
}

/**
 * Recovers bidding state after bot restart
 *
 * RECOVERY PROCESS:
 * 1. Load state from local file or Google Sheets
 * 2. Validate cache freshness (<60 minutes old)
 * 3. Clear stale cache if too old
 * 4. Reschedule auction timers if auction is active
 *
 * @param {Client} client - Discord client instance
 * @param {Object} config - Bot configuration object
 * @returns {Promise<boolean>} True if state recovered successfully
 */
async function recoverBiddingState(client, config) {
  if (await load()) {
    state.logger.info(`${EMOJI.SUCCESS} State recovered`);
    if (state.st.cp) {
      const age = Math.floor((Date.now() - state.st.ct) / 60000);
      state.logger.info(
        `${EMOJI.CHART} Cache: ${
          state.st.cp.size()
        } members (${age}m old)`
      );
      if (age > 60) {
        state.logger.info(`${EMOJI.WARNING} Cache old, clearing...`);
        const { clearCache } = require('./points-cache');
        clearCache();
      }
    } else state.logger.info(`${EMOJI.WARNING} No cache`);

    if (state.st.a && state.st.a.status === "active") {
      state.logger.info(`${EMOJI.FIRE} Rescheduling timers...`);
      const { schedTimers } = require('./auction-lifecycle');
      schedTimers(client, config);
      if (!state.st.cp)
        state.logger.warn(`${EMOJI.WARNING} Active auction but no cache!`);
    }
    return true;
  }
  return false;
}

/**
 * Forces immediate state save to Google Sheets (emergency backup)
 *
 * @returns {Promise<void>} Resolves when save completes
 */
async function forceSaveState() {
  return await saveBiddingStateToSheet();
}

module.exports = {
  save,
  load,
  initializeBidding,
  clearAllTimers,
  fetchPts,
  submitRes,
  saveBiddingStateToSheet,
  loadBiddingStateFromSheet,
  recoverBiddingState,
  forceSaveState,
};
