/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * ELYSIUM ATTENDANCE SYSTEM - THIN WRAPPER
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * This file is a thin compatibility wrapper that re-exports all functions from
 * the decomposed modules/attendance/ directory. External consumers should see
 * no change in the API.
 *
 * @module attendance
 */

// Re-export everything from the decomposed module
module.exports = require('./modules/attendance/index');
