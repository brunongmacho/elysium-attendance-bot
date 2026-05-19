/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                    GRACEFUL SHUTDOWN HANDLER                             ║
 * ║  Cleans up all resources and shuts down the bot gracefully               ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * @file bot/shutdown.js
 * @description Extracted from index2.js graceful shutdown section.
 *              Handles SIGTERM/SIGINT signals by stopping all scheduled tasks,
 *              saving state, closing connections, and destroying the client.
 *
 * @dependencies
 * - utils/logger
 *
 * @usage
 *   const { registerShutdownHandlers } = require('./bot/shutdown');
 *   registerShutdownHandlers(client, config, {
 *     server, stopBiddingChannelCleanupSchedule, scheduler,
 *     timerRegistry, crashRecovery, dbAPI,
 *   });
 */

const { createLogger } = require('../utils/logger');
const logger = createLogger('shutdown');

let isShuttingDown = false; // Prevent multiple shutdown attempts

/**
 * Registers SIGTERM and SIGINT handlers for graceful shutdown.
 *
 * Shutdown sequence:
 * 1. Stop bidding channel cleanup schedule
 * 2. Stop maintenance scheduler
 * 3. Clear all timers
 * 4. Save bot state
 * 5. Close MongoDB connection
 * 6. Close HTTP server
 * 7. Remove all Discord event listeners
 * 8. Destroy Discord client
 *
 * A forced shutdown timeout of 30 seconds ensures the process
 * eventually exits even if cleanup hangs.
 *
 * @param {import('discord.js').Client} client - Discord Client
 * @param {Object} config - Bot configuration
 * @param {Object} modules - Additional dependencies
 * @param {import('http').Server} modules.server - HTTP health check server
 * @param {Function} modules.stopBiddingChannelCleanupSchedule - Stops bidding cleanup timer
 * @param {Object} modules.scheduler - Maintenance scheduler
 * @param {Object} modules.timerRegistry - Centralized timer tracker
 * @param {Object} modules.crashRecovery - Crash recovery system
 * @param {Object} modules.dbAPI - Database API
 */
function registerShutdownHandlers(client, config, modules) {
  const {
    server,
    stopBiddingChannelCleanupSchedule,
    scheduler,
    timerRegistry,
    crashRecovery,
    dbAPI,
  } = modules;

  /**
   * Comprehensive graceful shutdown handler
   * Cleans up all resources to prevent memory leaks
   * @param {string} signal - Signal name (SIGTERM, SIGINT, etc.)
   */
  async function gracefulShutdown(signal) {
    if (isShuttingDown) {
      console.log(`⏭️ Shutdown already in progress, ignoring ${signal}`);
      return;
    }

    isShuttingDown = true;
    console.log(`\n🛑 ${signal} received - starting graceful shutdown...`);

    // Set a forced shutdown timeout (30 seconds)
    const forceShutdownTimeout = setTimeout(() => {
      console.error('⚠️ Graceful shutdown timeout - forcing exit');
      process.exit(1);
    }, 30000);

    try {
      // Step 1: Stop accepting new requests
      console.log('1️⃣ Stopping bidding channel cleanup...');
      stopBiddingChannelCleanupSchedule();

      // Step 2: Stop scheduled tasks
      console.log('2️⃣ Stopping maintenance scheduler...');
      scheduler.stopScheduler();

      // Step 3: Clear all timers
      console.log('3️⃣ Clearing all timers...');
      timerRegistry.clearAllTimers();

      // Step 4: Save state before shutdown
      console.log('4️⃣ Saving bot state...');
      if (typeof crashRecovery.saveState === 'function') {
        await crashRecovery.saveState();
      }

      // Step 5: Close MongoDB connection
      console.log('5️⃣ Closing MongoDB connection...');
      try {
        await dbAPI.close();
        console.log('✅ MongoDB connection closed');
      } catch (error) {
        console.log('⚠️ MongoDB close skipped (not connected)');
      }

      // Step 6: Close HTTP server
      console.log('6️⃣ Closing HTTP server...');
      await new Promise((resolve) => {
        server.close(() => {
          console.log('✅ HTTP server closed');
          resolve();
        });
        // Force close after 5 seconds
        setTimeout(resolve, 5000);
      });

      // Step 7: Remove all Discord event listeners
      console.log('7️⃣ Removing Discord event listeners...');
      client.removeAllListeners();

      // Step 8: Destroy Discord client
      console.log('8️⃣ Destroying Discord client...');
      await client.destroy();
      console.log('✅ Discord client destroyed');

      // Step 9: Clear the forced shutdown timeout
      clearTimeout(forceShutdownTimeout);

      console.log('✅ Graceful shutdown complete!');
      process.exit(0);

    } catch (error) {
      console.error('❌ Error during graceful shutdown:', error);
      clearTimeout(forceShutdownTimeout);
      process.exit(1);
    }
  }

  // Register shutdown handlers
  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));
}

module.exports = { registerShutdownHandlers };
