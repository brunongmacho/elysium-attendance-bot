/**
 * Google Sheets integration and LRU cache for column checks.
 */

const { normalizeTimestamp } = require('../../utils/common');
const state = require('./state');

// ═══════════════════════════════════════════════════════════════════════════════
// GOOGLE SHEETS INTEGRATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Posts data to Google Sheets via webhook with rate limiting and retry logic.
 * Implements automatic rate limiting (MIN_SHEET_DELAY) and handles 429 errors with exponential backoff.
 *
 * @param {Object} payload - Data payload to send to Google Sheets
 * @param {string} payload.action - Action type (e.g., "checkColumn", "addMember", "createColumn")
 * @param {number} [retryCount=0] - Current retry attempt number (internal use for recursion)
 * @returns {Promise<Object>} Response object containing ok, status, and text/error
 */
async function postToSheet(payload, retryCount = 0) {
  try {
    // Rate limiting: ensure minimum delay between API calls
    const now = Date.now();
    const timeSinceLastCall = now - state.lastSheetCall;
    if (timeSinceLastCall < state.TIMING.MIN_SHEET_DELAY) {
      const waitTime = state.TIMING.MIN_SHEET_DELAY - timeSinceLastCall;
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }

    state.lastSheetCall = Date.now();

    // Make the API call using SheetAPI (handles retries automatically)
    const { action, ...data } = payload;
    const result = await state.sheetAPI.call(action, data);

    return { ok: true, status: 200, text: JSON.stringify(result) };
  } catch (err) {
    console.error("❌ Webhook error:", err);
    return { ok: false, err: err.toString() };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 1 (CRIT-004): LRU Cache for Column Checks
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Checks if a column already exists for a specific boss spawn to prevent duplicates.
 * First checks local cache (stateManager.activeColumns), then LRU cache (with auto-eviction),
 * then queries Google Sheets if needed. Uses normalized timestamps to handle format variations.
 *
 * @param {string} boss - Boss name to check
 * @param {string} timestamp - Spawn timestamp in "MM/DD/YY HH:MM" format
 * @returns {Promise<boolean>} True if column exists, false otherwise
 */
async function checkColumnExists(boss, timestamp) {
  const normalizedTimestamp = normalizeTimestamp(timestamp);
  const cacheKey = `${boss.toUpperCase()}|${normalizedTimestamp}`;

  // O(1) lookup in stateManager.activeColumns using normalized key
  if (state.stateManager.activeColumns[cacheKey]) {
    return true;
  }

  // Check LRU cache (auto-handles TTL expiration)
  const cached = state.columnCheckCache.get(cacheKey);
  if (cached !== undefined) {
    return cached; // Cache hit - TTL checked automatically by LRUCache
  }

  // Cache miss - query Google Sheets
  const resp = await postToSheet({ action: "checkColumn", boss, timestamp });
  let exists = false;

  if (resp.ok) {
    try {
      const data = JSON.parse(resp.text);
      exists = data.exists === true;
    } catch (e) {
      exists = false;
    }
  }

  // Cache the result (LRU handles TTL and auto-eviction)
  state.columnCheckCache.set(cacheKey, exists);

  return exists;
}

module.exports = { postToSheet, checkColumnExists };
