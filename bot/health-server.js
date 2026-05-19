/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                    HTTP HEALTH CHECK SERVER                               ║
 * ║         Provides /health endpoint for external monitoring services        ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * @file bot/health-server.js
 * @description Extracted from index2.js for modularity. Creates an HTTP server
 *              that reports bot status, memory metrics, cache stats, and
 *              MongoDB health at the /health (or /) endpoint.
 *
 * @dependencies
 * - http (Node.js built-in)
 * - utils/logger (structured logging)
 *
 * @usage
 *   const { createHealthServer } = require('./bot/health-server');
 *   const server = createHealthServer(client, config, {
 *     botVersion: BOT_VERSION,
 *     botStartTime: BOT_START_TIME,
 *     stateManager,
 *     dbAPI,
 *     reportsGetCacheStats: () => reports.getCacheStats(),
 *     attendanceGetCacheStats: () => attendance.getCacheStats(),
 *   });
 */

const http = require('http');
const { createLogger } = require('../utils/logger');

const mainLogger = createLogger('health');

/**
 * Creates and starts an HTTP health check server.
 *
 * @param {Object} client   - Discord Client instance
 * @param {Object} config   - Bot configuration object (uses `config.port`)
 * @param {Object} deps     - Additional dependencies
 * @param {string} deps.botVersion              - Bot version string
 * @param {number} deps.botStartTime            - Bot start timestamp
 * @param {Object} [deps.stateManager]          - State manager singleton
 * @param {Object} [deps.dbAPI]                 - Database API instance
 * @param {Function} [deps.reportsGetCacheStats]    - Reports cache stats function
 * @param {Function} [deps.attendanceGetCacheStats] - Attendance cache stats function
 * @returns {http.Server} The created HTTP server instance
 */
function createHealthServer(client, config, deps = {}) {
  const PORT = config.port || 3000;

  const {
    botVersion = '9.0.0',
    botStartTime = Date.now(),
    stateManager = null,
    dbAPI = null,
    reportsGetCacheStats = null,
    attendanceGetCacheStats = null,
  } = deps;

  const server = http.createServer(async (req, res) => {
    if (req.url === '/health' || req.url === '/') {
      const healthData = {
        status: 'healthy',
        version: botVersion,
        uptime: process.uptime(),
        bot: client.user ? client.user.tag : 'not ready',
        activeSpawns: stateManager ? Object.keys(stateManager.activeSpawns).length : 0,
        pendingVerifications: stateManager
          ? Object.keys(stateManager.pendingVerifications).length
          : 0,
        timestamp: new Date().toISOString(),
      };

      // ── Memory metrics ──────────────────────────────────────────────
      const memUsage = process.memoryUsage();
      const formatBytes = (bytes) => {
        const mb = bytes / 1024 / 1024;
        return `${Math.round(mb * 10) / 10} MB`;
      };

      healthData.memory = {
        heapUsed: formatBytes(memUsage.heapUsed),
        heapTotal: formatBytes(memUsage.heapTotal),
        heapUsedPercent: `${Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100)}%`,
        rss: formatBytes(memUsage.rss),
        external: formatBytes(memUsage.external),
        arrayBuffers: formatBytes(memUsage.arrayBuffers || 0),
      };

      // ── Cache statistics ────────────────────────────────────────────
      if (reportsGetCacheStats || attendanceGetCacheStats) {
        try {
          healthData.caches = {
            reports: reportsGetCacheStats ? reportsGetCacheStats() : null,
            attendance: attendanceGetCacheStats ? attendanceGetCacheStats() : null,
          };
        } catch (cacheError) {
          healthData.caches = { error: 'Cache stats unavailable' };
        }
      }

      // ── MongoDB health metrics ──────────────────────────────────────
      if (dbAPI && dbAPI.connected && dbAPI.db) {
        try {
          const mongoStartTime = Date.now();
          await dbAPI.db.admin().ping();
          const mongoLatency = Date.now() - mongoStartTime;

          const collections = await dbAPI.db.listCollections().toArray();
          const collectionNames = collections.map((c) => c.name);

          const collectionStats = {};
          for (const collName of [
            'attendance',
            'bosses',
            'members',
            'event_reminders',
            'boss_timers',
          ]) {
            if (collectionNames.includes(collName)) {
              try {
                const count = await dbAPI.db
                  .collection(collName)
                  .estimatedDocumentCount();
                const stats = await dbAPI.db.collection(collName).stats();
                collectionStats[collName] = {
                  documents: count,
                  sizeBytes: stats.size,
                  avgDocSize: stats.avgObjSize || 0,
                };
              } catch (err) {
                collectionStats[collName] = { error: 'unavailable' };
              }
            }
          }

          const dbStats = await dbAPI.db.stats();

          healthData.mongodb = {
            connected: true,
            latencyMs: mongoLatency,
            database: dbAPI.db.databaseName,
            collections: {
              total: collections.length,
              names: collectionNames,
              stats: collectionStats,
            },
            database_stats: {
              sizeBytes: dbStats.dataSize,
              storageSizeBytes: dbStats.storageSize,
              indexes: dbStats.indexes,
              indexSizeBytes: dbStats.indexSize,
            },
          };
        } catch (mongoError) {
          healthData.mongodb = {
            connected: false,
            error: mongoError.message,
          };
        }
      } else {
        healthData.mongodb = {
          connected: false,
          reason: 'not_initialized',
        };
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(healthData, null, 2));
    } else {
      res.writeHead(404);
      res.end('Not Found');
    }
  });

  server.listen(PORT, () =>
    mainLogger.info(`🌐 Health check server on port ${PORT}`)
  );

  return server;
}

module.exports = { createHealthServer };
