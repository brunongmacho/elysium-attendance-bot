/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                        METRICS HTTP SERVER                                ║
 * ║              Prometheus Metrics & Health Check Endpoint                   ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * @fileoverview HTTP server for exposing metrics and health checks
 * Endpoints:
 * - GET /metrics - Prometheus metrics endpoint
 * - GET /health - Health check endpoint
 * - GET /health/detailed - Detailed health information
 */

const http = require('http');
const { getMetrics, getMetricsJSON } = require('./metrics');
const { getCircuitBreaker } = require('./operation-queue');
const { createLogger } = require('./logger');

const logger = createLogger('metrics-server');

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const PORT = parseInt(process.env.METRICS_PORT || '9090', 10);
const HOST = process.env.METRICS_HOST || '0.0.0.0';

// ═══════════════════════════════════════════════════════════════════════════
// HEALTH CHECK
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get basic health status
 */
function getHealthStatus() {
  const uptime = process.uptime();
  const memUsage = process.memoryUsage();

  return {
    status: 'healthy',
    uptime: Math.floor(uptime),
    timestamp: new Date().toISOString(),
    memory: {
      heapUsed: Math.floor(memUsage.heapUsed / 1024 / 1024) + 'MB',
      heapTotal: Math.floor(memUsage.heapTotal / 1024 / 1024) + 'MB',
      rss: Math.floor(memUsage.rss / 1024 / 1024) + 'MB',
    },
  };
}

/**
 * Get detailed health status
 */
function getDetailedHealthStatus() {
  const basic = getHealthStatus();
  const memUsage = process.memoryUsage();

  return {
    ...basic,
    version: process.env.npm_package_version || '9.0.0',
    node: process.version,
    platform: process.platform,
    memory: {
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external,
      arrayBuffers: memUsage.arrayBuffers,
      rss: memUsage.rss,
    },
    circuitBreakers: getCircuitBreakerStatus(),
  };
}

/**
 * Get circuit breaker status
 */
function getCircuitBreakerStatus() {
  try {
    const sheetsBreaker = getCircuitBreaker('sheets');
    const discordBreaker = getCircuitBreaker('discord');

    return {
      sheets: sheetsBreaker.getState(),
      discord: discordBreaker.getState(),
    };
  } catch (error) {
    logger.warn('Failed to get circuit breaker status', { error: error.message });
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// HTTP SERVER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Request handler
 */
async function handleRequest(req, res) {
  const url = req.url;
  const method = req.method;

  logger.debug('HTTP request received', { method, url });

  try {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle OPTIONS
    if (method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Only allow GET
    if (method !== 'GET') {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Method not allowed' }));
      return;
    }

    // Route handling
    if (url === '/metrics') {
      // Prometheus metrics endpoint
      const metrics = await getMetrics();
      res.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4' });
      res.end(metrics);
    } else if (url === '/metrics/json') {
      // JSON metrics endpoint (for debugging)
      const metrics = await getMetricsJSON();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(metrics, null, 2));
    } else if (url === '/health') {
      // Basic health check
      const health = getHealthStatus();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(health, null, 2));
    } else if (url === '/health/detailed') {
      // Detailed health check
      const health = getDetailedHealthStatus();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(health, null, 2));
    } else if (url === '/' || url === '/ping') {
      // Simple ping endpoint
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('OK');
    } else {
      // 404
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Not found',
        availableEndpoints: [
          'GET /metrics - Prometheus metrics',
          'GET /metrics/json - JSON metrics',
          'GET /health - Basic health check',
          'GET /health/detailed - Detailed health check',
          'GET /ping - Simple ping',
        ],
      }, null, 2));
    }
  } catch (error) {
    logger.error('Error handling request', error, { method, url });
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Internal server error' }));
  }
}

/**
 * Create and start metrics server
 */
function startMetricsServer() {
  const server = http.createServer(handleRequest);

  server.listen(PORT, HOST, () => {
    logger.info(`Metrics server listening`, {
      host: HOST,
      port: PORT,
      endpoints: {
        metrics: `http://${HOST}:${PORT}/metrics`,
        health: `http://${HOST}:${PORT}/health`,
      },
    });
  });

  server.on('error', (error) => {
    logger.error('Metrics server error', error);
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    logger.info('SIGTERM received, closing metrics server');
    server.close(() => {
      logger.info('Metrics server closed');
    });
  });

  return server;
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
  startMetricsServer,
  getHealthStatus,
  getDetailedHealthStatus,
};
