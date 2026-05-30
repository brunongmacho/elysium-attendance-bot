/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║              AUCTIONEERING CONSTANTS - Config & Constants                ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Emoji constants, color codes, timeouts, and session configuration.
 *
 * @module modules/auctioneering/constants
 */

/**
 * Wait time between auction items (milliseconds).
 */
const ITEM_WAIT = 20000;

/**
 * Discord embed color codes for different message types.
 */
const COLORS = {
  SUCCESS: 0x00ff00,
  WARNING: 0xffa500,
  ERROR: 0xff0000,
  INFO: 0x4a90e2,
  AUCTION: 0xffd700,
};

/**
 * Emoji constants for consistent visual feedback.
 */
const EMOJI = {
  SUCCESS: "✅",
  ERROR: "❌",
  WARNING: "⚠️",
  INFO: "ℹ️",
  AUCTION: "🔨",
  BID: "💰",
  TIME: "⏱️",
  CLOCK: "🕐",
  LIST: "📋",
  PAUSE: "⏸️",
  PLAY: "▶️",
  FIRE: "🔥",
  STOP: "⏹️",
  TROPHY: "🏆",
  CHART: "📊",
  LOCK: "🔒",
  BELL: "🔔",
  RESET: "🔄",
};

/**
 * Timeout durations for various operations (milliseconds).
 */
const TIMEOUTS = {
  FETCH_TIMEOUT: 10000,
  CONFIRMATION: 30000,
  PREVIEW_DELAY: 15000,
};

/**
 * Configuration for dual-session auctions.
 */
const DUAL_SESSION_CONFIG = {
  enabled: false,
  restPeriodMinutes: 60,
  pollIntervalMs: 30000,
  maxPollAttempts: 720,
};

module.exports = {
  ITEM_WAIT,
  COLORS,
  EMOJI,
  TIMEOUTS,
  DUAL_SESSION_CONFIG,
};
