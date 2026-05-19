/**
 * ============================================================================
 * BOSS TIMER MODULE - WRAPPER
 * ============================================================================
 *
 * Thin wrapper that re-exports from the decomposed modules directory.
 * Preserves backward compatibility with all existing require() calls.
 *
 * @module boss-timer
 * ============================================================================
 */

const bossTimer = require('./modules/boss-timer');

module.exports = bossTimer;
