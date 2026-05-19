/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                    GUILD BIDDING ENGINE - Thin Entry Point                ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Thin wrapper that re-exports all bidding functionality from the decomposed
 * modules/bidding/ directory.
 *
 * Architecture:
 * - modules/bidding/state.js       - Centralized mutable state container
 * - modules/bidding/constants.js   - Colors, emojis, config constants
 * - modules/bidding/persistence.js - State save/load/init & sheets helpers
 * - modules/bidding/points-locking.js - Points locking system
 * - modules/bidding/points-cache.js   - Points cache management
 * - modules/bidding/auction-lifecycle.js - Auction lifecycle management
 * - modules/bidding/bid-processing.js   - Bid processing (both modes)
 * - modules/bidding/commands.js         - Command handlers
 * - modules/bidding/cleanup.js          - Memory leak prevention
 * - modules/bidding/index.js            - Main entry, re-exports everything
 *
 * @version 6.0.0
 */

const bidding = require('./modules/bidding/index');

module.exports = bidding;
