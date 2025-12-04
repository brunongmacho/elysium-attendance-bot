/**
 * ============================================================================
 * CENTRALIZED BOSS NAME MATCHING AND NORMALIZATION (PHASE 3.4)
 * ============================================================================
 *
 * Consolidates all boss name handling logic into a single module:
 * - Normalization (consistent casing, trimming)
 * - Fuzzy matching with Levenshtein distance
 * - Alias resolution
 * - Boss validation
 *
 * This replaces scattered `.toLowerCase()`, `.toUpperCase()` patterns
 * across the codebase with a single, tested implementation.
 *
 * @module utils/boss-matcher
 */

const levenshtein = require('fast-levenshtein');
const { LIMITS } = require('./constants');

// ============================================================================
// BOSS NAME NORMALIZATION
// ============================================================================

/**
 * Normalize boss name for consistent comparison and storage.
 *
 * Applies standard normalization rules:
 * - Trims whitespace
 * - Converts to consistent casing
 * - Removes extra spaces
 *
 * @param {string} bossName - Raw boss name input
 * @param {string} format - Output format: 'lower', 'upper', or 'title' (default: 'lower')
 * @returns {string} Normalized boss name
 *
 * @example
 * normalizeBossName('  Baron Braudmore  ');           // 'baron braudmore'
 * normalizeBossName('balrog', 'title');               // 'Balrog'
 * normalizeBossName('AMENTIS', 'lower');              // 'amentis'
 */
function normalizeBossName(bossName, format = 'lower') {
  if (!bossName) return '';

  const normalized = bossName
    .toString()
    .trim()
    .replace(/\s+/g, ' '); // Replace multiple spaces with single space

  switch (format) {
    case 'upper':
      return normalized.toUpperCase();
    case 'title':
      return normalized
        .toLowerCase()
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
    case 'lower':
    default:
      return normalized.toLowerCase();
  }
}

/**
 * Case-insensitive boss name comparison.
 *
 * @param {string} boss1 - First boss name
 * @param {string} boss2 - Second boss name
 * @returns {boolean} True if names match (case-insensitive)
 *
 * @example
 * bossNamesEqual('Balrog', 'balrog');      // true
 * bossNamesEqual('Balrog', 'BALROG');      // true
 * bossNamesEqual('Balrog', 'Papulatus');   // false
 */
function bossNamesEqual(boss1, boss2) {
  if (!boss1 || !boss2) return false;
  return normalizeBossName(boss1) === normalizeBossName(boss2);
}

// ============================================================================
// FUZZY MATCHING
// ============================================================================

/**
 * Find boss name from array using case-insensitive exact match.
 *
 * @param {string} input - Boss name to find
 * @param {Array<string>} bossList - Array of valid boss names
 * @returns {string|null} Matched boss name or null
 *
 * @example
 * findExactMatch('balrog', ['Balrog', 'Papulatus']);  // 'Balrog'
 * findExactMatch('BALROG', ['Balrog', 'Papulatus']);  // 'Balrog'
 * findExactMatch('invalid', ['Balrog', 'Papulatus']); // null
 */
function findExactMatch(input, bossList) {
  if (!input || !bossList || bossList.length === 0) return null;

  const normalizedInput = normalizeBossName(input);
  return bossList.find(boss =>
    normalizeBossName(boss) === normalizedInput
  ) || null;
}

/**
 * Find boss name using alias lookup.
 *
 * @param {string} input - Potential boss alias
 * @param {Object} bossPoints - Boss points object with aliases
 * @returns {string|null} Canonical boss name or null
 *
 * @example
 * findAliasMatch('bb', bossPoints);  // 'Baron Braudmore'
 * findAliasMatch('amen', bossPoints); // 'Amentis'
 */
function findAliasMatch(input, bossPoints) {
  if (!input || !bossPoints) return null;

  const normalizedInput = normalizeBossName(input);

  for (const [bossName, data] of Object.entries(bossPoints)) {
    if (data.aliases && Array.isArray(data.aliases)) {
      const matchedAlias = data.aliases.find(alias =>
        normalizeBossName(alias) === normalizedInput
      );
      if (matchedAlias) return bossName;
    }
  }

  return null;
}

/**
 * Find boss name using partial (substring) matching.
 *
 * @param {string} input - Partial boss name
 * @param {Array<string>} bossList - Array of valid boss names
 * @returns {string|null} Matched boss name or null
 *
 * @example
 * findPartialMatch('bal', ['Balrog', 'Papulatus']);    // 'Balrog'
 * findPartialMatch('pap', ['Balrog', 'Papulatus']);    // 'Papulatus'
 * findPartialMatch('xyz', ['Balrog', 'Papulatus']);    // null
 */
function findPartialMatch(input, bossList) {
  if (!input || !bossList || bossList.length === 0) return null;

  const normalizedInput = normalizeBossName(input);
  return bossList.find(boss =>
    normalizeBossName(boss).includes(normalizedInput)
  ) || null;
}

/**
 * Find boss name using Levenshtein distance (fuzzy matching).
 *
 * Finds the closest match within the configured distance threshold.
 *
 * @param {string} input - Potentially misspelled boss name
 * @param {Array<string>} bossList - Array of valid boss names
 * @param {number} maxDistance - Maximum allowed distance (default: from constants)
 * @returns {string|null} Closest match or null
 *
 * @example
 * findFuzzyMatch('balrg', ['Balrog', 'Papulatus']);    // 'Balrog' (distance: 1)
 * findFuzzyMatch('barlgo', ['Balrog', 'Papulatus']);   // 'Balrog' (distance: 2)
 * findFuzzyMatch('xyz', ['Balrog', 'Papulatus']);      // null (distance too large)
 */
function findFuzzyMatch(input, bossList, maxDistance = LIMITS.FUZZY_MATCH_MAX_DISTANCE) {
  if (!input || !bossList || bossList.length === 0) return null;

  const normalizedInput = normalizeBossName(input);
  let bestMatch = null;
  let bestDistance = maxDistance + 1;

  for (const boss of bossList) {
    const distance = levenshtein.get(normalizedInput, normalizeBossName(boss));
    if (distance <= maxDistance && distance < bestDistance) {
      bestDistance = distance;
      bestMatch = boss;
    }
  }

  return bestMatch;
}

/**
 * Comprehensive boss name matching with multiple strategies.
 *
 * Attempts matching in order of precision:
 * 1. Exact match (case-insensitive)
 * 2. Alias match
 * 3. Partial match (substring)
 * 4. Fuzzy match (Levenshtein distance)
 *
 * @param {string} input - User input boss name
 * @param {Object} bossPoints - Boss points database with aliases
 * @returns {string|null} Matched boss name or null
 *
 * @example
 * findBestMatch('balrog', bossPoints);      // 'Balrog' (exact)
 * findBestMatch('bb', bossPoints);          // 'Baron Braudmore' (alias)
 * findBestMatch('bal', bossPoints);         // 'Balrog' (partial)
 * findBestMatch('balrg', bossPoints);       // 'Balrog' (fuzzy)
 * findBestMatch('invalid', bossPoints);     // null
 */
function findBestMatch(input, bossPoints) {
  if (!input || !bossPoints) return null;

  const bossList = Object.keys(bossPoints);

  // Strategy 1: Exact match
  const exactMatch = findExactMatch(input, bossList);
  if (exactMatch) return exactMatch;

  // Strategy 2: Alias match
  const aliasMatch = findAliasMatch(input, bossPoints);
  if (aliasMatch) return aliasMatch;

  // Strategy 3: Partial match
  const partialMatch = findPartialMatch(input, bossList);
  if (partialMatch) return partialMatch;

  // Strategy 4: Fuzzy match
  const fuzzyMatch = findFuzzyMatch(input, bossList);
  if (fuzzyMatch) return fuzzyMatch;

  return null;
}

// ============================================================================
// BOSS VALIDATION
// ============================================================================

/**
 * Check if boss name exists in boss list.
 *
 * @param {string} bossName - Boss name to validate
 * @param {Array<string>|Object} bossList - Array of boss names or boss points object
 * @returns {boolean} True if boss exists
 *
 * @example
 * isValidBoss('Balrog', ['Balrog', 'Papulatus']);       // true
 * isValidBoss('Invalid', ['Balrog', 'Papulatus']);      // false
 * isValidBoss('balrog', bossPoints);                    // true (case-insensitive)
 */
function isValidBoss(bossName, bossList) {
  if (!bossName) return false;

  const list = Array.isArray(bossList) ? bossList : Object.keys(bossList);
  return findExactMatch(bossName, list) !== null;
}

/**
 * Find boss name in rotating bosses list.
 *
 * Specifically for boss-rotation.js - replaces scattered .find() patterns.
 *
 * @param {string} bossName - Boss name to find
 * @param {Array<string>} rotatingBosses - Array of rotating boss names
 * @returns {string|null} Canonical boss name or null if not rotating
 *
 * @example
 * findRotatingBoss('balrog', ROTATING_BOSSES);    // 'Balrog'
 * findRotatingBoss('BALROG', ROTATING_BOSSES);    // 'Balrog'
 * findRotatingBoss('Amentis', ROTATING_BOSSES);   // null (not rotating)
 */
function findRotatingBoss(bossName, rotatingBosses) {
  return findExactMatch(bossName, rotatingBosses);
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // Normalization
  normalizeBossName,
  bossNamesEqual,

  // Matching strategies
  findExactMatch,
  findAliasMatch,
  findPartialMatch,
  findFuzzyMatch,
  findBestMatch,

  // Validation
  isValidBoss,
  findRotatingBoss,
};
