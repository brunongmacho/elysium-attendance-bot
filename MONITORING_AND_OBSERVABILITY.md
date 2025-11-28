# Monitoring and Observability Guide

This guide covers the comprehensive monitoring, logging, and observability infrastructure implemented in the ELYSIUM Attendance Bot.

## Table of Contents

1. [Structured Logging](#structured-logging)
2. [Metrics & Prometheus](#metrics--prometheus)
3. [Error Tracking & APM (Sentry)](#error-tracking--apm-sentry)
4. [Graceful Degradation](#graceful-degradation)
5. [Configuration](#configuration)
6. [Usage Examples](#usage-examples)

---

## Structured Logging

### Overview

The bot uses **Pino**, a high-performance structured JSON logger, replacing all `console.log` statements. This provides:

- **Structured JSON logs** for machine parsing
- **Log levels**: DEBUG, INFO, WARN, ERROR
- **Correlation IDs** for request tracing across async operations
- **Contextual metadata** automatically attached to logs
- **Pretty printing** in development, JSON in production

### Location

- **Implementation**: `utils/logger.js`
- **Old logging system**: `utils/log-config.js` (legacy, can be phased out)

### Basic Usage

```javascript
const { createLogger } = require('./utils/logger');
const logger = createLogger('module-name');

// Different log levels
logger.debug('Debugging information', { userId: '123', action: 'cache_read' });
logger.info('Operation completed', { duration: 250 });
logger.warn('Rate limit approaching', { remaining: 5 });
logger.error('Operation failed', error, { context: 'additional info' });

// Specialized logging
logger.command('attendance', 'user123');
logger.performance('sheetsApiCall', 1500);
logger.apiCall('sheets', 'batchUpdate', 200, 850);
logger.cache('get', 'points:user123', true);
```

### Correlation IDs

Correlation IDs allow you to trace a single request through all async operations:

```javascript
const { withCorrelationId, createLogger } = require('./utils/logger');
const logger = createLogger('commands');

// Wrap command handler with correlation ID
async function handleCommand(interaction) {
  return withCorrelationId(async () => {
    logger.info('Command started', { command: interaction.commandName });

    await someAsyncOperation(); // This will have the same correlation ID
    await anotherOperation();   // This too

    logger.info('Command completed');
  });
}
```

All logs within the `withCorrelationId` callback will have the same `correlationId` field, making it easy to trace the entire request flow.

### Child Loggers

Create child loggers with additional context:

```javascript
const logger = createLogger('attendance');
const userLogger = logger.child({ userId: '123456', username: 'Alice' });

// All logs from userLogger will include userId and username
userLogger.info('User joined thread');
userLogger.info('User points awarded');
```

---

## Metrics & Prometheus

### Overview

The bot exposes **Prometheus metrics** for monitoring application performance and business metrics:

- Command execution counts and durations
- Error rates by type and module
- Google Sheets API call rates and durations
- Cache hit/miss ratios
- Discord API performance
- Memory usage
- Business metrics (boss spawns, bids, active threads, etc.)

### Location

- **Implementation**: `utils/metrics.js`
- **HTTP Server**: `utils/metrics-server.js`

### Endpoints

The metrics server runs on port **9090** (configurable via `METRICS_PORT`):

- **`GET /metrics`** - Prometheus metrics endpoint (text format)
- **`GET /metrics/json`** - JSON format (for debugging)
- **`GET /health`** - Basic health check
- **`GET /health/detailed`** - Detailed health with circuit breaker status
- **`GET /ping`** - Simple ping endpoint

### Available Metrics

#### Command Metrics
- `elysium_bot_command_executions_total{command, status}` - Counter
- `elysium_bot_command_duration_seconds{command}` - Histogram

#### Error Metrics
- `elysium_bot_errors_total{type, module}` - Counter

#### Google Sheets Metrics
- `elysium_bot_sheets_api_calls_total{operation, status}` - Counter
- `elysium_bot_sheets_api_duration_seconds{operation}` - Histogram
- `elysium_bot_sheets_rate_limit_remaining` - Gauge

#### Cache Metrics
- `elysium_bot_cache_operations_total{cache, operation, result}` - Counter
- `elysium_bot_cache_size{cache}` - Gauge

#### Discord API Metrics
- `elysium_bot_discord_api_calls_total{method, status}` - Counter
- `elysium_bot_discord_api_duration_seconds{method}` - Histogram

#### Business Metrics
- `elysium_bot_active_threads` - Gauge
- `elysium_bot_active_auctions` - Gauge
- `elysium_bot_boss_spawns_total{boss}` - Counter
- `elysium_bot_bids_placed_total{item}` - Counter

#### System Metrics
- `elysium_bot_heap_used_percentage` - Gauge
- Plus all default Node.js metrics (memory, CPU, event loop, etc.)

### Usage Examples

```javascript
const metrics = require('./utils/metrics');

// Record a command execution
const timer = metrics.startTimer();
try {
  await executeCommand();
  const duration = timer.stop();
  metrics.recordCommandExecution('attendance', duration, true);
} catch (error) {
  metrics.recordCommandExecution('attendance', timer.stop(), false);
  metrics.recordError('command_error', 'attendance');
}

// Record Sheets API call
const timer = metrics.startTimer();
const result = await sheetAPI.call('getPoints', {});
metrics.recordSheetsApiCall('getPoints', timer.stop(), result.status === 'ok');

// Record cache operation
metrics.recordCacheOperation('points', 'get', 'hit');
metrics.updateCacheSize('points', pointsCache.size);

// Record business metrics
metrics.recordBossSpawn('Erebus');
metrics.recordBid('Legendary Weapon');
metrics.updateActiveThreads(threadCount);
metrics.updateActiveAuctions(auctionCount);
```

### Prometheus Scrape Config

Add this to your Prometheus configuration:

```yaml
scrape_configs:
  - job_name: 'elysium-bot'
    static_configs:
      - targets: ['localhost:9090']
    scrape_interval: 15s
```

---

## Error Tracking & APM (Sentry)

### Overview

The bot integrates with **Sentry** for:

- Automatic error capture and reporting
- Performance profiling
- Breadcrumb trails for debugging
- Release tracking
- User context
- Custom tags and metadata

### Location

- **Implementation**: `utils/sentry.js`

### Configuration

Set the following environment variables:

```bash
# Required
SENTRY_DSN=https://your-sentry-dsn@sentry.io/project-id

# Optional
SENTRY_ENABLED=true                    # Set to false to disable (default: true if DSN is set)
SENTRY_TRACES_SAMPLE_RATE=0.1         # 10% of transactions (default: 0.1)
SENTRY_PROFILES_SAMPLE_RATE=0.1       # 10% of transactions (default: 0.1)
NODE_ENV=production                    # Environment name
```

### Initialization

Sentry is automatically initialized at the start of `index2.js` before any other code runs.

### Usage Examples

#### Error Capture

```javascript
const { captureException, captureMessage } = require('./utils/sentry');

try {
  await riskyOperation();
} catch (error) {
  captureException(error, {
    tags: { module: 'attendance', operation: 'joinThread' },
    extra: { userId: '123', threadId: '456' },
    level: 'error',
  });
  throw error;
}

// Capture a message
captureMessage('Rate limit warning', 'warning', {
  tags: { api: 'discord' },
  extra: { remaining: 5 },
});
```

#### Breadcrumbs

```javascript
const { addBreadcrumb } = require('./utils/sentry');

addBreadcrumb({
  category: 'command',
  message: 'User executed attendance command',
  level: 'info',
  data: { userId: '123', command: 'attendance' },
});
```

#### Performance Monitoring

```javascript
const { startTransaction, startSpan } = require('./utils/sentry');

async function handleCommand(interaction) {
  const transaction = startTransaction('command.attendance', 'command');

  try {
    // Main operation
    const span1 = startSpan(transaction, 'db', 'Fetch user points');
    const points = await getPoints(userId);
    span1.finish();

    const span2 = startSpan(transaction, 'http', 'Update Google Sheets');
    await updateSheet(points);
    span2.finish();

    transaction.setTag('status', 'success');
  } catch (error) {
    transaction.setTag('status', 'error');
    throw error;
  } finally {
    transaction.finish();
  }
}
```

#### Command Wrapper

```javascript
const { wrapCommandHandler } = require('./utils/sentry');

// Automatically wraps with error tracking and performance monitoring
const attendanceHandler = wrapCommandHandler('attendance', async (interaction) => {
  // Your command logic here
  await handleAttendance(interaction);
});
```

#### Context Setting

```javascript
const { setUser, setTag, setContext } = require('./utils/sentry');

// Set user context
setUser({
  id: interaction.user.id,
  username: interaction.user.username,
});

// Set custom tags
setTag('guild_id', interaction.guildId);

// Set custom context
setContext('command', {
  name: interaction.commandName,
  options: interaction.options.data,
});
```

---

## Graceful Degradation

### Overview

The **Operation Queue** system provides graceful degradation when external services (like Google Sheets) are unavailable:

- **Circuit Breaker Pattern** - Stops calling failing services automatically
- **Operation Queuing** - Queues operations when services are down
- **Automatic Retry** - Retries with exponential backoff
- **Persistent Queue** - Survives bot restarts
- **Staleness Tracking** - Shows when cached data is out of date

### Location

- **Implementation**: `utils/operation-queue.js`

### How It Works

1. **Circuit Breaker States**:
   - **CLOSED** - Normal operation, requests allowed
   - **OPEN** - Service is down, requests blocked
   - **HALF_OPEN** - Testing if service recovered

2. **Automatic Retry**:
   - Initial delay: 5 seconds
   - Max delay: 5 minutes
   - Max retries: 5 (configurable)
   - Exponential backoff: delay × 2^(retry_count)

3. **Persistent Queue**:
   - Saved to `.queue.json` (gitignored)
   - Automatically loaded on restart
   - Max queue size: 1000 operations (configurable)

### Usage Example

```javascript
const { getCircuitBreaker, getStalenessTracker } = require('./utils/operation-queue');

// Check if service is available
const sheetsBreaker = getCircuitBreaker('sheets');

if (sheetsBreaker.canAttempt()) {
  try {
    const result = await sheetAPI.call('updatePoints', { userId, points });
    sheetsBreaker.recordSuccess();

    const tracker = getStalenessTracker('points');
    tracker.markSuccess();
  } catch (error) {
    sheetsBreaker.recordFailure();

    // Queue the operation for retry
    await operationQueue.enqueue({
      type: 'updatePoints',
      service: 'sheets',
      data: { userId, points },
    });

    // Mark data as potentially stale
    const tracker = getStalenessTracker('points');
    tracker.markStale();
  }
} else {
  // Circuit is open, immediately queue
  await operationQueue.enqueue({
    type: 'updatePoints',
    service: 'sheets',
    data: { userId, points },
  });
}

// Show staleness indicator to user
const tracker = getStalenessTracker('points');
const staleness = tracker.getStalenessIndicator();
if (staleness) {
  embed.setFooter({ text: staleness });
}
```

### Custom Operation Queue

To handle custom operations, extend the `OperationQueue` class:

```javascript
const { OperationQueue } = require('./utils/operation-queue');

class SheetsOperationQueue extends OperationQueue {
  async executeOperation(operation) {
    switch (operation.type) {
      case 'updatePoints':
        await sheetAPI.call('updatePoints', operation.data);
        break;
      case 'logAttendance':
        await sheetAPI.call('logAttendance', operation.data);
        break;
      default:
        throw new Error(`Unknown operation type: ${operation.type}`);
    }
  }
}

const sheetsQueue = new SheetsOperationQueue();
await sheetsQueue.initialize();
```

---

## Configuration

### Environment Variables

```bash
# Logging
LOG_LEVEL=info                         # debug, info, warn, error (default: info in production, debug in dev)
NODE_ENV=production                    # development, production

# Metrics Server
METRICS_PORT=9090                      # Prometheus metrics server port (default: 9090)
METRICS_HOST=0.0.0.0                   # Metrics server host (default: 0.0.0.0)

# Sentry (Error Tracking)
SENTRY_DSN=https://...                 # Sentry DSN (required for Sentry)
SENTRY_ENABLED=true                    # Enable/disable Sentry (default: true if DSN set)
SENTRY_TRACES_SAMPLE_RATE=0.1         # Performance monitoring sample rate (default: 0.1 = 10%)
SENTRY_PROFILES_SAMPLE_RATE=0.1       # Profiling sample rate (default: 0.1 = 10%)

# Operation Queue
MAX_QUEUE_SIZE=1000                    # Maximum queued operations (default: 1000)
MAX_OPERATION_RETRIES=5                # Max retries per operation (default: 5)
```

### Package Dependencies

All dependencies are already installed:

```json
{
  "dependencies": {
    "pino": "^latest",              // Structured logging
    "pino-pretty": "^latest",       // Pretty printing for dev
    "@sentry/node": "^latest",      // Sentry SDK
    "@sentry/profiling-node": "^latest", // Performance profiling
    "prom-client": "^latest",       // Prometheus metrics
    "uuid": "^latest"               // Correlation IDs
  }
}
```

---

## Usage Examples

### Complete Command Handler with All Features

```javascript
const { createLogger, withCorrelationId, createTimer } = require('./utils/logger');
const metrics = require('./utils/metrics');
const { captureException, startTransaction } = require('./utils/sentry');
const { getCircuitBreaker, getStalenessTracker } = require('./utils/operation-queue');

const logger = createLogger('attendance');

async function handleAttendanceCommand(interaction) {
  // Wrap with correlation ID for tracing
  return withCorrelationId(async () => {
    const timer = createTimer();
    const transaction = startTransaction('command.attendance', 'command');

    try {
      logger.command('attendance', interaction.user.id, {
        username: interaction.user.username,
      });

      // Check circuit breaker
      const breaker = getCircuitBreaker('sheets');
      if (!breaker.canAttempt()) {
        logger.warn('Sheets service unavailable, using cached data');
        // Return cached data with staleness indicator
        const tracker = getStalenessTracker('points');
        const staleness = tracker.getStalenessIndicator();
        // ... return cached response
      }

      // Execute command logic
      const span = startSpan(transaction, 'db', 'Fetch points');
      const points = await getPoints(interaction.user.id);
      span.finish();

      // Record metrics
      const duration = timer.stop();
      metrics.recordCommandExecution('attendance', duration, true);

      breaker.recordSuccess();
      transaction.setTag('status', 'success');
      transaction.finish();

      logger.info('Attendance command completed', {
        userId: interaction.user.id,
        durationMs: duration,
      });

      return points;
    } catch (error) {
      // Log error
      logger.error('Attendance command failed', error, {
        userId: interaction.user.id,
      });

      // Capture in Sentry
      captureException(error, {
        tags: { command: 'attendance' },
        extra: { userId: interaction.user.id },
      });

      // Record metrics
      const duration = timer.stop();
      metrics.recordCommandExecution('attendance', duration, false);
      metrics.recordError('command_error', 'attendance');

      // Update circuit breaker
      const breaker = getCircuitBreaker('sheets');
      breaker.recordFailure();

      transaction.setTag('status', 'error');
      transaction.finish();

      throw error;
    }
  });
}
```

---

## Monitoring Dashboards

### Grafana Dashboard Example

Create a Grafana dashboard with these queries:

```promql
# Command execution rate
rate(elysium_bot_command_executions_total[5m])

# Command success rate
sum(rate(elysium_bot_command_executions_total{status="success"}[5m])) /
sum(rate(elysium_bot_command_executions_total[5m]))

# Command latency (p95)
histogram_quantile(0.95, rate(elysium_bot_command_duration_seconds_bucket[5m]))

# Error rate by module
rate(elysium_bot_errors_total[5m])

# Sheets API call rate
rate(elysium_bot_sheets_api_calls_total[5m])

# Cache hit rate
sum(rate(elysium_bot_cache_operations_total{result="hit"}[5m])) /
sum(rate(elysium_bot_cache_operations_total{operation="get"}[5m]))

# Memory usage
elysium_bot_heap_used_percentage
```

---

## Troubleshooting

### Logs not appearing?

Check `LOG_LEVEL` environment variable:
```bash
export LOG_LEVEL=debug
```

### Metrics endpoint not accessible?

Check if the metrics server started:
```bash
curl http://localhost:9090/health
```

Verify the port isn't blocked:
```bash
export METRICS_PORT=9090
```

### Sentry not capturing errors?

Verify DSN is set:
```bash
echo $SENTRY_DSN
```

Check if Sentry is enabled:
```bash
export SENTRY_ENABLED=true
```

### Queue not processing?

Check queue status:
```bash
curl http://localhost:9090/health/detailed
```

Look for circuit breaker states and queue size.

---

## Next Steps

1. **Set up Prometheus** to scrape the `/metrics` endpoint
2. **Create Grafana dashboards** for visualization
3. **Configure Sentry** with your DSN and alerts
4. **Monitor logs** in production to identify issues
5. **Set up alerts** for error rates, latency, and circuit breaker states

---

## Summary

This comprehensive monitoring stack provides:

✅ **Structured Logging** - JSON logs with correlation IDs
✅ **Metrics** - Prometheus-compatible metrics for all operations
✅ **Error Tracking** - Sentry integration for error reporting and APM
✅ **Graceful Degradation** - Circuit breakers and operation queuing
✅ **Health Checks** - HTTP endpoints for monitoring
✅ **Performance Monitoring** - Transaction tracing and profiling

With these tools, you can monitor, debug, and optimize the ELYSIUM bot in production! 🚀
