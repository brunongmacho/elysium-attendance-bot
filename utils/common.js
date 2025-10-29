/**
 * Common Utilities - Shared across all bot modules
 * Consolidates timestamp handling, formatting, and matching logic
 */

const levenshtein = require("fast-levenshtein");

// Timing constants
const TIMING = {
  MIN_SHEET_DELAY: 1000,
  REACTION_RETRY_ATTEMPTS: 3,
  REACTION_RETRY_DELAY: 500,
  SUBMIT_DELAY: 2000,
};

/**
 * Get current timestamp in Manila timezone
 * @returns {Object} { date, time, full }
 */
function getCurrentTimestamp() {
  const now = new Date();
  const manilaTime = new Date(
    now.toLocaleString("en-US", { timeZone: "Asia/Manila" })
  );

  const month = String(manilaTime.getMonth() + 1).padStart(2, "0");
  const day = String(manilaTime.getDate()).padStart(2, "0");
  const year = String(manilaTime.getFullYear()).slice(-2);
  const hours = String(manilaTime.getHours()).padStart(2, "0");
  const mins = String(manilaTime.getMinutes()).padStart(2, "0");

  return {
    date: `${month}/${day}/${year}`,
    time: `${hours}:${mins}`,
    full: `${month}/${day}/${year} ${hours}:${mins}`,
  };
}

/**
 * Get Sunday of current week in YYYYMMDD format
 * @returns {string} YYYYMMDD
 */
function getSundayOfWeek() {
  const now = new Date();
  const manilaTime = new Date(
    now.toLocaleString("en-US", { timeZone: "Asia/Manila" })
  );
  const sunday = new Date(manilaTime);
  sunday.setDate(sunday.getDate() - sunday.getDay());

  const year = sunday.getFullYear();
  const month = String(sunday.getMonth() + 1).padStart(2, "0");
  const day = String(sunday.getDate()).padStart(2, "0");

  return `${year}${month}${day}`;
}

/**
 * Format milliseconds into human-readable uptime
 * @param {number} ms - Milliseconds
 * @returns {string} Formatted uptime
 */
function formatUptime(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
  if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

/**
 * Normalize timestamp to MM/DD/YY HH:MM format for comparison
 * Handles both formats:
 * - Bot format: "10/29/25 09:22"
 * - Google Sheets format: "Tue Oct 28 2025 18:10:00 GMT+0800 (Philippine Standard Time)"
 * @param {string|Date} timestamp - Timestamp to normalize
 * @returns {string|null} Normalized timestamp
 */
function normalizeTimestamp(timestamp) {
  if (!timestamp) return null;

  const str = timestamp.toString().trim();

  // If already in MM/DD/YY HH:MM format, return as-is
  if (/^\d{1,2}\/\d{1,2}\/\d{2}\s+\d{1,2}:\d{2}$/.test(str)) {
    return str;
  }

  // Try to parse as Date (for Google Sheets format)
  try {
    const date = new Date(str);
    if (isNaN(date.getTime())) return null;

    // Convert to Manila timezone
    const manilaTime = new Date(date.toLocaleString("en-US", { timeZone: "Asia/Manila" }));

    const month = String(manilaTime.getMonth() + 1).padStart(2, "0");
    const day = String(manilaTime.getDate()).padStart(2, "0");
    const year = String(manilaTime.getFullYear()).slice(-2);
    const hours = String(manilaTime.getHours()).padStart(2, "0");
    const mins = String(manilaTime.getMinutes()).padStart(2, "0");

    return `${month}/${day}/${year} ${hours}:${mins}`;
  } catch (e) {
    return null;
  }
}

/**
 * Parse thread name format: [MM/DD/YY HH:MM] Boss Name
 * @param {string} name - Thread name
 * @returns {Object|null} { date, time, timestamp, boss }
 */
function parseThreadName(name) {
  const match = name.match(/^\[(.*?)\s+(.*?)\]\s+(.+)$/);
  if (!match) return null;
  return {
    date: match[1],
    time: match[2],
    timestamp: `${match[1]} ${match[2]}`,
    boss: match[3],
  };
}

/**
 * Find boss match with fuzzy matching
 * @param {string} input - User input
 * @param {Object} bossPoints - Boss points database
 * @returns {string|null} Matched boss name
 */
function findBossMatch(input, bossPoints) {
  const q = input.toLowerCase().trim();

  // Exact match first
  for (const name of Object.keys(bossPoints)) {
    if (name.toLowerCase() === q) return name;
    const meta = bossPoints[name];
    for (const alias of meta.aliases || []) {
      if (alias.toLowerCase() === q) return name;
    }
  }

  // Partial match (contains)
  for (const name of Object.keys(bossPoints)) {
    if (name.toLowerCase().includes(q) || q.includes(name.toLowerCase())) return name;
    const meta = bossPoints[name];
    for (const alias of meta.aliases || []) {
      if (alias.toLowerCase().includes(q) || q.includes(alias.toLowerCase())) return name;
    }
  }

  // Fuzzy match with adaptive threshold
  let best = { name: null, dist: 999 };
  for (const name of Object.keys(bossPoints)) {
    const dist = levenshtein.get(q, name.toLowerCase());
    if (dist < best.dist) best = { name, dist };
    for (const alias of bossPoints[name].aliases || []) {
      const d2 = levenshtein.get(q, alias.toLowerCase());
      if (d2 < best.dist) best = { name, dist: d2 };
    }
  }

  // Adaptive threshold: allow more errors for longer names
  const maxAllowedDistance = Math.max(2, Math.floor(q.length / 4));
  return best.dist <= maxAllowedDistance ? best.name : null;
}

/**
 * Check if two timestamps match after normalization
 * @param {string} ts1 - First timestamp
 * @param {string} ts2 - Second timestamp
 * @returns {boolean} True if they match
 */
function timestampsMatch(ts1, ts2) {
  const normalized1 = normalizeTimestamp(ts1);
  const normalized2 = normalizeTimestamp(ts2);
  return normalized1 && normalized2 && normalized1 === normalized2;
}

/**
 * Check if two boss names match (case-insensitive)
 * @param {string} boss1 - First boss name
 * @param {string} boss2 - Second boss name
 * @returns {boolean} True if they match
 */
function bossNamesMatch(boss1, boss2) {
  if (!boss1 || !boss2) return false;
  return boss1.toUpperCase() === boss2.toUpperCase();
}

/**
 * Sleep for specified milliseconds
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
  TIMING,
  getCurrentTimestamp,
  getSundayOfWeek,
  formatUptime,
  normalizeTimestamp,
  parseThreadName,
  findBossMatch,
  timestampsMatch,
  bossNamesMatch,
  sleep,
};
