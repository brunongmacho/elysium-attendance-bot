/**
 * Time and date utility functions
 */

/**
 * Format uptime in human-readable format
 */
function formatUptime(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

/**
 * Get current timestamp in MM/DD/YY HH:MM format
 */
function getTimestamp() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const year = String(now.getFullYear()).slice(-2);
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${month}/${day}/${year} ${hours}:${minutes}`;
}

/**
 * Get current timestamp with full date/time details
 */
function getCurrentTimestamp() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const year = String(now.getFullYear()).slice(-2);
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');

  return {
    date: `${month}/${day}/${year}`,
    time: `${hours}:${minutes}`,
    full: `${month}/${day}/${year} ${hours}:${minutes}`
  };
}

/**
 * Format time remaining in minutes and seconds
 */
function formatTimeRemaining(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

/**
 * Normalize timestamp to ensure consistent comparison
 */
function normalizeTimestamp(timestamp) {
  if (!timestamp) return "";

  try {
    // Handle different timestamp formats
    let normalized = timestamp.trim();

    // Convert "MM/DD/YY HH:MM" to "MM/DD/YY HH:MM"
    // Ensure zero-padding for single-digit values
    const parts = normalized.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s+(\d{1,2}):(\d{1,2})/);

    if (parts) {
      const [, month, day, year, hour, minute] = parts;
      return `${month.padStart(2, '0')}/${day.padStart(2, '0')}/${year.slice(-2)} ${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
    }

    return normalized;
  } catch (err) {
    console.error("Error normalizing timestamp:", err);
    return timestamp;
  }
}

/**
 * Parse timestamp string to Date object
 */
function parseTimestamp(timestamp) {
  try {
    // Expected format: "MM/DD/YY HH:MM"
    const parts = timestamp.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s+(\d{1,2}):(\d{1,2})/);

    if (parts) {
      const [, month, day, year, hour, minute] = parts;
      const fullYear = year.length === 2 ? `20${year}` : year;
      return new Date(fullYear, month - 1, day, hour, minute);
    }

    return new Date(timestamp);
  } catch (err) {
    console.error("Error parsing timestamp:", err);
    return null;
  }
}

/**
 * Get spawn time age in human-readable format
 */
function getSpawnAge(timestamp) {
  const spawnDate = parseTimestamp(timestamp);
  if (!spawnDate) return "Unknown";

  const ageMs = Date.now() - spawnDate.getTime();
  const ageHours = Math.floor(ageMs / 3600000);
  const ageMinutes = Math.floor((ageMs % 3600000) / 60000);

  if (ageHours > 0) return `${ageHours}h ago`;
  return `${ageMinutes}m ago`;
}

/**
 * Check if a timestamp is within a time window
 */
function isWithinTimeWindow(timestamp, windowMs) {
  try {
    const time = new Date(timestamp).getTime();
    const now = Date.now();
    return (now - time) < windowMs;
  } catch (err) {
    return false;
  }
}

module.exports = {
  formatUptime,
  getTimestamp,
  getCurrentTimestamp,
  formatTimeRemaining,
  normalizeTimestamp,
  parseTimestamp,
  getSpawnAge,
  isWithinTimeWindow,
};
