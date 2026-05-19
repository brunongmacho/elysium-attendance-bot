/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                    ERROR HANDLER REGISTRATION                            ║
 * ║  Registers all Discord client and process-level error handlers           ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * @file bot/events/error-handlers.js
 * @description Extracted from index2.js error handling section.
 *              Registers error event listeners on the Discord client and
 *              process-level handlers for unhandled rejections and exceptions.
 *
 * @dependencies
 * - discord.js (Events)
 * - utils/logger
 * - utils/error-handler
 *
 * @usage
 *   const { registerErrorHandlers } = require('./bot/events/error-handlers');
 *   registerErrorHandlers(client);
 */

const { Events } = require("discord.js");
const { createLogger } = require('../../utils/logger');
const logger = createLogger('error-handlers');
const errorHandler = require('../../utils/error-handler');
const shutdownManager = require('../../utils/shutdown-manager');

/**
 * Registers all error handlers on the Discord client and process.
 *
 * Client-level handlers (non-fatal - Discord.js handles reconnection):
 * - error: General Discord client errors
 * - shardError: WebSocket/shard errors
 * - shardDisconnect: Shard disconnection events
 * - shardReconnecting: Shard reconnection attempts
 * - shardResume: Successful reconnection
 *
 * Process-level handlers:
 * - unhandledRejection: Promise rejections without catch handlers
 * - uncaughtException: Uncaught exceptions (fatal check)
 *
 * @param {import('discord.js').Client} client - Discord Client
 */
function registerErrorHandlers(client) {
  // Handle Discord client errors
  client.on(Events.Error, (error) => {
    console.error("❌ Discord client error:", error);
    // Don't crash on client errors - Discord.js will handle reconnection
  });

  // Handle WebSocket/Shard errors (including timeout errors)
  client.on(Events.ShardError, (error, shardId) => {
    console.error(`❌ WebSocket error on shard ${shardId}:`, error.message);
    // Don't crash - Discord.js will automatically attempt to reconnect
    if (error.message.includes('timeout')) {
      console.log(`⏱️ Shard ${shardId} timed out, waiting for automatic reconnection...`);
    }
  });

  // Handle shard disconnections
  client.on(Events.ShardDisconnect, (event, shardId) => {
    console.warn(`⚠️ Shard ${shardId} disconnected (code: ${event.code})`);
  });

  // Handle shard reconnection attempts
  client.on(Events.ShardReconnecting, (shardId) => {
    console.log(`🔄 Shard ${shardId} is reconnecting...`);
  });

  // Handle shard resume (successful reconnection)
  client.on(Events.ShardResume, (shardId, replayedEvents) => {
    console.log(`✅ Shard ${shardId} resumed (replayed ${replayedEvents} events)`);
  });

  // Handle unhandled promise rejections without crashing
  process.on("unhandledRejection", (error) => {
    console.error("❌ Unhandled promise rejection:", error);
    // Log but don't crash - allow the bot to continue operating
    // Koyeb will automatically restart if the process exits
  });

  // Handle uncaught exceptions — always fatal, perform graceful shutdown
  process.on("uncaughtException", (error) => {
    console.error("❌ Uncaught exception:", error);
    console.error("💥 Fatal error detected — starting graceful shutdown...");
    shutdownManager.shutdown('UNCAUGHT_EXCEPTION');
  });
}

module.exports = { registerErrorHandlers };
