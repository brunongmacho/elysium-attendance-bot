/**
 * =============================================================================
 * AUTOCOMPLETE HANDLERS
 * =============================================================================
 *
 * Handles autocomplete for slash command options.
 * Provides boss names, pending members, and other dynamic data.
 *
 * @module commands/autocomplete
 * @author ELYSIUM Development Team
 */

const fs = require('fs');
const levenshtein = require('fast-levenshtein');

// Load boss configuration
const bossConfig = JSON.parse(fs.readFileSync('./boss_spawn_config.json', 'utf-8'));

/**
 * Get all boss names from configuration
 * @returns {string[]} Array of all boss names
 */
function getAllBossNames() {
  const timerBosses = Object.keys(bossConfig.timerBasedBosses || {})
    .filter(key => !key.startsWith('_'));
  const scheduleBosses = Object.keys(bossConfig.scheduleBasedBosses || {})
    .filter(key => !key.startsWith('_'));

  return [...timerBosses, ...scheduleBosses].sort();
}

/**
 * Get rotation boss names from boss rotation module (dynamic list from Google Sheets)
 * @param {Object} bossRotation - Boss rotation module
 * @returns {string[]} Array of rotation boss names
 */
function getRotationBossNames(bossRotation) {
  if (bossRotation && typeof bossRotation.getRotatingBosses === 'function') {
    const bosses = bossRotation.getRotatingBosses();
    return bosses.length > 0 ? bosses : ['Amentis', 'General Aquleus', 'Baron Braudmore'];
  }
  // Fallback to default if module not available
  return ['Amentis', 'General Aquleus', 'Baron Braudmore'];
}

/**
 * Filter boss names based on user input with fuzzy matching
 *
 * @param {string} focusedValue - User's current input
 * @param {string[]} bossList - List of bosses to filter (defaults to all bosses)
 * @returns {Array<{name: string, value: string}>} Filtered boss list (max 25)
 */
function filterBossNames(focusedValue, bossList = null) {
  const bosses = bossList || getAllBossNames();
  const lowerInput = focusedValue.toLowerCase();

  // Filter and sort by relevance
  const filtered = bosses
    .filter(boss => {
      const lowerBoss = boss.toLowerCase();

      // Direct substring match OR fuzzy match (Levenshtein distance <= 3)
      return lowerBoss.includes(lowerInput) ||
             levenshtein.get(lowerBoss, lowerInput) <= 3;
    })
    .sort((a, b) => {
      const aLower = a.toLowerCase();
      const bLower = b.toLowerCase();

      // Exact matches first
      if (aLower === lowerInput && bLower !== lowerInput) return -1;
      if (bLower === lowerInput && aLower !== lowerInput) return 1;

      // Starts with input next
      const aStarts = aLower.startsWith(lowerInput);
      const bStarts = bLower.startsWith(lowerInput);
      if (aStarts && !bStarts) return -1;
      if (bStarts && !aStarts) return 1;

      // Contains input next
      const aIncludes = aLower.includes(lowerInput);
      const bIncludes = bLower.includes(lowerInput);
      if (aIncludes && !bIncludes) return -1;
      if (bIncludes && !aIncludes) return 1;

      // Sort by Levenshtein distance
      const aDist = levenshtein.get(aLower, lowerInput);
      const bDist = levenshtein.get(bLower, lowerInput);
      if (aDist !== bDist) return aDist - bDist;

      // Alphabetical as final tiebreaker
      return a.localeCompare(b);
    })
    .slice(0, 25) // Discord limit
    .map(boss => ({
      name: boss,
      value: boss
    }));

  return filtered;
}

/**
 * Get pending attendance members for autocomplete
 *
 * @param {Object} attendance - Attendance module
 * @param {string} focusedValue - User's current input
 * @returns {Array<{name: string, value: string}>} Filtered member list (max 25)
 */
function getPendingMembers(attendance, focusedValue) {
  const pending = attendance.getPendingVerifications();
  const lowerInput = focusedValue.toLowerCase();

  const filtered = Object.keys(pending)
    .filter(username => username.toLowerCase().includes(lowerInput))
    .slice(0, 25)
    .map(username => ({
      name: username,
      value: username
    }));

  return filtered;
}

/**
 * Main autocomplete handler
 *
 * @param {AutocompleteInteraction} interaction - Discord autocomplete interaction
 * @param {Object} attendance - Attendance module
 * @param {Object} bossRotation - Boss rotation module
 * @returns {Promise<void>}
 */
async function handleAutocomplete(interaction, attendance, bossRotation = null) {
  const commandName = interaction.commandName;
  const focusedOption = interaction.options.getFocused(true);
  const focusedValue = focusedOption.value;

  let choices = [];

  try {
    // Boss name autocomplete (for most boss timer commands)
    if (
      (commandName === 'killed' ||
       commandName === 'spawned' ||
       commandName === 'unkill' ||
       commandName === 'setboss' ||
       commandName === 'nospawn') &&
      focusedOption.name === 'boss'
    ) {
      choices = filterBossNames(focusedValue);
    }

    // Rotation boss autocomplete (dynamic list from Google Sheets)
    else if (
      commandName === 'rotation' &&
      focusedOption.name === 'boss'
    ) {
      choices = filterBossNames(focusedValue, getRotationBossNames(bossRotation));
    }

    // Pending member autocomplete (for verify/deny)
    else if (
      (commandName === 'verify' || commandName === 'deny') &&
      focusedOption.name === 'member'
    ) {
      choices = getPendingMembers(attendance, focusedValue);
    }

    await interaction.respond(choices);

  } catch (error) {
    console.error('❌ Autocomplete error:', error);
    // Respond with empty array on error to prevent interaction failure
    await interaction.respond([]).catch(() => {});
  }
}

module.exports = {
  handleAutocomplete,
  getAllBossNames,
  getRotationBossNames,
  filterBossNames,
  getPendingMembers
};
