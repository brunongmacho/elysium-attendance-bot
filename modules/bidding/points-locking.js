/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                    POINTS LOCKING SYSTEM - Race Condition Prevention      ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Manages the locking and unlocking of bidding points to prevent
 * double-spending across simultaneous auctions.
 *
 * CRITICAL: The 'st.lp' (locked points) object is SHARED across both
 * bidding.js and auctioneering.js modules to prevent race conditions
 * where users bid more points than they have across multiple auctions.
 *
 * @module modules/bidding/points-locking
 */

const state = require('./state');
const { save } = require('./persistence');
const { normalizeUsername } = require('./utilities');

/**
 * Calculates available points for a user
 *
 * Uses Discord ID if available for nickname-agnostic calculation.
 * Falls back to normalized username for backwards compatibility.
 *
 * @param {string} u - Username (used as fallback key)
 * @param {number} tot - Total points
 * @param {string} userId - Discord user ID (preferred key)
 * @returns {number} Available points (never negative)
 * @example
 * // User has 1000 total points, 300 locked in another auction
 * avail("Username", 1000) // Returns 700
 */
const avail = (u, tot, userId = null) => {
  // Try Discord ID first (nickname-agnostic), then fall back to name
  const nameKey = normalizeUsername(u);
  const locked = userId
    ? (state.st.lp[userId] || state.st.lp[nameKey] || 0)
    : (state.st.lp[nameKey] || 0);
  return Math.max(0, tot - locked);
};

/**
 * Locks points for a user (atomic operation with persistence)
 *
 * CRITICAL RACE CONDITION PREVENTION:
 * - Immediately locks points when bid is placed
 * - Persists state to prevent double-spending if bot crashes
 * - Shared across bidding.js and auctioneering.js modules
 *
 * USAGE:
 * - Called when user places a bid
 * - Called when user increases their existing bid (only lock difference)
 *
 * @param {string} u - Username (will be normalized as fallback)
 * @param {number} amt - Amount of points to lock
 * @param {string} userId - Discord user ID (preferred key for nickname-agnostic tracking)
 */
const lock = (u, amt, userId = null) => {
  // Use Discord ID as key if available (nickname-agnostic)
  const key = userId || normalizeUsername(u);
  state.st.lp[key] = (state.st.lp[key] || 0) + amt;
  save();
};

/**
 * Unlocks points for a user (atomic operation with persistence)
 *
 * CRITICAL RACE CONDITION PREVENTION:
 * - Releases points when user is outbid
 * - Releases points when auction is cancelled
 * - Automatically removes entry if points reach 0 (keeps state clean)
 *
 * USAGE:
 * - Called when user is outbid by someone else
 * - Called when auction is cancelled or skipped
 * - Called after session finalization
 *
 * @param {string} u - Username (will be normalized as fallback)
 * @param {number} amt - Amount of points to unlock
 * @param {string} userId - Discord user ID (preferred key for nickname-agnostic tracking)
 */
const unlock = (u, amt, userId = null) => {
  // Use Discord ID as key if available (nickname-agnostic)
  const key = userId || normalizeUsername(u);
  state.st.lp[key] = Math.max(0, (state.st.lp[key] || 0) - amt);
  if (state.st.lp[key] === 0) delete state.st.lp[key];
  save();
};

module.exports = { avail, lock, unlock };
