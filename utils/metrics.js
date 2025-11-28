/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                     PROMETHEUS METRICS SYSTEM                             ║
 * ║              Application Performance & Business Metrics                   ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * @fileoverview Comprehensive metrics collection for monitoring
 * Exposes metrics endpoint for Prometheus scraping
 *
 * Metrics collected:
 * - Command execution counts
 * - Response times (histograms)
 * - Error rates
 * - Memory usage
 * - Google Sheets API call rates
 * - Cache hit/miss ratios
 * - Discord API calls
 * - Active threads/sessions
 */

const client = require('prom-client');
const { createLogger } = require('./logger');

const logger = createLogger('metrics');

// ═══════════════════════════════════════════════════════════════════════════
// PROMETHEUS CLIENT SETUP
// ═══════════════════════════════════════════════════════════════════════════

// Create a Registry to register the metrics
const register = new client.Registry();

// Add default metrics (memory, CPU, etc.)
client.collectDefaultMetrics({
  register,
  prefix: 'elysium_bot_',
  gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5], // Custom GC duration buckets
});

// ═══════════════════════════════════════════════════════════════════════════
// CUSTOM METRICS DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────────────────────
// COMMAND METRICS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Counter: Total command executions
 */
const commandExecutions = new client.Counter({
  name: 'elysium_bot_command_executions_total',
  help: 'Total number of command executions',
  labelNames: ['command', 'status'], // status: success, error
  registers: [register],
});

/**
 * Histogram: Command execution duration
 */
const commandDuration = new client.Histogram({
  name: 'elysium_bot_command_duration_seconds',
  help: 'Command execution duration in seconds',
  labelNames: ['command'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10], // Custom buckets for Discord commands
  registers: [register],
});

// ─────────────────────────────────────────────────────────────────────────────
// ERROR METRICS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Counter: Total errors
 */
const errors = new client.Counter({
  name: 'elysium_bot_errors_total',
  help: 'Total number of errors',
  labelNames: ['type', 'module'], // type: api_error, validation_error, etc.
  registers: [register],
});

// ─────────────────────────────────────────────────────────────────────────────
// GOOGLE SHEETS API METRICS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Counter: Google Sheets API calls
 */
const sheetsApiCalls = new client.Counter({
  name: 'elysium_bot_sheets_api_calls_total',
  help: 'Total number of Google Sheets API calls',
  labelNames: ['operation', 'status'], // operation: read, write, batch, status: success, error
  registers: [register],
});

/**
 * Histogram: Google Sheets API call duration
 */
const sheetsApiDuration = new client.Histogram({
  name: 'elysium_bot_sheets_api_duration_seconds',
  help: 'Google Sheets API call duration in seconds',
  labelNames: ['operation'],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30], // Sheets can be slow
  registers: [register],
});

/**
 * Gauge: Sheets API rate limit remaining
 */
const sheetsRateLimitRemaining = new client.Gauge({
  name: 'elysium_bot_sheets_rate_limit_remaining',
  help: 'Remaining Google Sheets API quota',
  registers: [register],
});

// ─────────────────────────────────────────────────────────────────────────────
// CACHE METRICS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Counter: Cache operations
 */
const cacheOperations = new client.Counter({
  name: 'elysium_bot_cache_operations_total',
  help: 'Total number of cache operations',
  labelNames: ['cache', 'operation', 'result'], // cache: points, discord, etc., operation: get, set, result: hit, miss
  registers: [register],
});

/**
 * Gauge: Cache size
 */
const cacheSize = new client.Gauge({
  name: 'elysium_bot_cache_size',
  help: 'Current cache size (number of entries)',
  labelNames: ['cache'],
  registers: [register],
});

// ─────────────────────────────────────────────────────────────────────────────
// DISCORD API METRICS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Counter: Discord API calls
 */
const discordApiCalls = new client.Counter({
  name: 'elysium_bot_discord_api_calls_total',
  help: 'Total number of Discord API calls',
  labelNames: ['method', 'status'],
  registers: [register],
});

/**
 * Histogram: Discord API call duration
 */
const discordApiDuration = new client.Histogram({
  name: 'elysium_bot_discord_api_duration_seconds',
  help: 'Discord API call duration in seconds',
  labelNames: ['method'],
  buckets: [0.05, 0.1, 0.5, 1, 2, 5],
  registers: [register],
});

// ─────────────────────────────────────────────────────────────────────────────
// BUSINESS METRICS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Gauge: Active attendance threads
 */
const activeThreads = new client.Gauge({
  name: 'elysium_bot_active_threads',
  help: 'Number of active attendance threads',
  registers: [register],
});

/**
 * Gauge: Active auction sessions
 */
const activeAuctions = new client.Gauge({
  name: 'elysium_bot_active_auctions',
  help: 'Number of active auction sessions',
  registers: [register],
});

/**
 * Counter: Boss spawns tracked
 */
const bossSpawns = new client.Counter({
  name: 'elysium_bot_boss_spawns_total',
  help: 'Total number of boss spawns tracked',
  labelNames: ['boss'],
  registers: [register],
});

/**
 * Counter: Bids placed
 */
const bidsPlaced = new client.Counter({
  name: 'elysium_bot_bids_placed_total',
  help: 'Total number of bids placed',
  labelNames: ['item'],
  registers: [register],
});

// ─────────────────────────────────────────────────────────────────────────────
// MEMORY METRICS (Custom)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Gauge: Heap used percentage
 */
const heapUsedPercentage = new client.Gauge({
  name: 'elysium_bot_heap_used_percentage',
  help: 'Percentage of heap memory used',
  registers: [register],
});

// Update heap percentage every 30 seconds
setInterval(() => {
  const usage = process.memoryUsage();
  const percentage = (usage.heapUsed / usage.heapTotal) * 100;
  heapUsedPercentage.set(percentage);
}, 30000);

// ═══════════════════════════════════════════════════════════════════════════
// METRIC HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Record a command execution
 */
function recordCommandExecution(command, durationMs, success = true) {
  const status = success ? 'success' : 'error';
  commandExecutions.inc({ command, status });
  commandDuration.observe({ command }, durationMs / 1000);

  logger.debug('Command metric recorded', {
    command,
    durationMs,
    status,
  });
}

/**
 * Record an error
 */
function recordError(type, module) {
  errors.inc({ type, module });
  logger.debug('Error metric recorded', { type, module });
}

/**
 * Record a Google Sheets API call
 */
function recordSheetsApiCall(operation, durationMs, success = true) {
  const status = success ? 'success' : 'error';
  sheetsApiCalls.inc({ operation, status });
  sheetsApiDuration.observe({ operation }, durationMs / 1000);

  logger.debug('Sheets API metric recorded', {
    operation,
    durationMs,
    status,
  });
}

/**
 * Update Sheets API rate limit
 */
function updateSheetsRateLimit(remaining) {
  sheetsRateLimitRemaining.set(remaining);
}

/**
 * Record a cache operation
 */
function recordCacheOperation(cache, operation, result) {
  cacheOperations.inc({ cache, operation, result });
  logger.debug('Cache metric recorded', { cache, operation, result });
}

/**
 * Update cache size
 */
function updateCacheSize(cache, size) {
  cacheSize.set({ cache }, size);
}

/**
 * Record a Discord API call
 */
function recordDiscordApiCall(method, durationMs, success = true) {
  const status = success ? 'success' : 'error';
  discordApiCalls.inc({ method, status });
  discordApiDuration.observe({ method }, durationMs / 1000);

  logger.debug('Discord API metric recorded', {
    method,
    durationMs,
    status,
  });
}

/**
 * Update active threads count
 */
function updateActiveThreads(count) {
  activeThreads.set(count);
}

/**
 * Update active auctions count
 */
function updateActiveAuctions(count) {
  activeAuctions.set(count);
}

/**
 * Record a boss spawn
 */
function recordBossSpawn(boss) {
  bossSpawns.inc({ boss });
  logger.debug('Boss spawn metric recorded', { boss });
}

/**
 * Record a bid
 */
function recordBid(item) {
  bidsPlaced.inc({ item });
  logger.debug('Bid metric recorded', { item });
}

/**
 * Create a timer for automatic duration tracking
 */
function startTimer() {
  const start = Date.now();
  return {
    stop: () => Date.now() - start,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// METRICS ENDPOINT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get metrics in Prometheus format
 */
async function getMetrics() {
  return register.metrics();
}

/**
 * Get metrics as JSON (for debugging)
 */
async function getMetricsJSON() {
  return register.getMetricsAsJSON();
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
  // Registry
  register,

  // Metric helpers
  recordCommandExecution,
  recordError,
  recordSheetsApiCall,
  updateSheetsRateLimit,
  recordCacheOperation,
  updateCacheSize,
  recordDiscordApiCall,
  updateActiveThreads,
  updateActiveAuctions,
  recordBossSpawn,
  recordBid,
  startTimer,

  // Metrics endpoint
  getMetrics,
  getMetricsJSON,

  // Raw metrics (for advanced usage)
  metrics: {
    commandExecutions,
    commandDuration,
    errors,
    sheetsApiCalls,
    sheetsApiDuration,
    sheetsRateLimitRemaining,
    cacheOperations,
    cacheSize,
    discordApiCalls,
    discordApiDuration,
    activeThreads,
    activeAuctions,
    bossSpawns,
    bidsPlaced,
    heapUsedPercentage,
  },
};
