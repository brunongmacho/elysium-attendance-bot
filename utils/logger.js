/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                    STRUCTURED LOGGING SYSTEM (PINO)                       ║
 * ║         High-Performance JSON Logging with Correlation IDs                ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * @fileoverview Production-grade structured logging using Pino
 * Features:
 * - Structured JSON logs for machine parsing
 * - Correlation IDs for request tracing
 * - Log levels (DEBUG, INFO, WARN, ERROR)
 * - Pretty printing in development
 * - Low overhead (async logging)
 * - Contextual metadata
 */

const pino = require('pino');
const { v4: uuidv4 } = require('uuid');

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const isProduction = process.env.NODE_ENV === 'production';
const logLevel = process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug');

// Pretty printing configuration for development
const prettyPrint = !isProduction ? {
  target: 'pino-pretty',
  options: {
    colorize: true,
    translateTime: 'HH:MM:ss Z',
    ignore: 'pid,hostname',
    singleLine: false,
    messageFormat: '[{module}] {msg}',
  }
} : undefined;

// ═══════════════════════════════════════════════════════════════════════════
// BASE LOGGER
// ═══════════════════════════════════════════════════════════════════════════

const baseLogger = pino({
  level: logLevel,
  transport: prettyPrint,
  formatters: {
    level: (label) => {
      return { level: label.toUpperCase() };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  base: {
    env: process.env.NODE_ENV || 'development',
    service: 'tenchu-attendance-bot',
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// CORRELATION ID MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Async local storage for correlation IDs
 * Allows automatic correlation ID tracking across async operations
 */
const { AsyncLocalStorage } = require('async_hooks');
const asyncLocalStorage = new AsyncLocalStorage();

/**
 * Generate a new correlation ID
 */
function generateCorrelationId() {
  return uuidv4();
}

/**
 * Get current correlation ID from async context
 */
function getCorrelationId() {
  const store = asyncLocalStorage.getStore();
  return store?.correlationId || null;
}

/**
 * Set correlation ID for current async context
 */
function setCorrelationId(correlationId) {
  const store = asyncLocalStorage.getStore();
  if (store) {
    store.correlationId = correlationId;
  }
}

/**
 * Run a function with a correlation ID context
 */
function withCorrelationId(fn, correlationId = null) {
  const id = correlationId || generateCorrelationId();
  return asyncLocalStorage.run({ correlationId: id }, fn);
}

// ═══════════════════════════════════════════════════════════════════════════
// ENHANCED LOGGER CLASS
// ═══════════════════════════════════════════════════════════════════════════

class Logger {
  constructor(module = 'general', context = {}) {
    this.module = module;
    this.context = context;
    this.childLogger = baseLogger.child({ module, ...context });
  }

  /**
   * Add correlation ID and custom context to log metadata
   */
  _enrichMetadata(metadata = {}) {
    const correlationId = getCorrelationId();
    return {
      ...this.context,
      ...metadata,
      ...(correlationId ? { correlationId } : {}),
    };
  }

  /**
   * Debug level logging
   */
  debug(message, metadata = {}) {
    this.childLogger.debug(this._enrichMetadata(metadata), message);
  }

  /**
   * Info level logging
   */
  info(message, metadata = {}) {
    this.childLogger.info(this._enrichMetadata(metadata), message);
  }

  /**
   * Warning level logging
   */
  warn(message, metadata = {}) {
    this.childLogger.warn(this._enrichMetadata(metadata), message);
  }

  /**
   * Error level logging
   */
  error(message, error = null, metadata = {}) {
    const enriched = this._enrichMetadata(metadata);

    if (error instanceof Error) {
      enriched.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
        ...(error.code ? { code: error.code } : {}),
      };
    } else if (error) {
      enriched.errorData = error;
    }

    this.childLogger.error(enriched, message);
  }

  /**
   * Create a child logger with additional context
   */
  child(additionalContext = {}) {
    return new Logger(this.module, { ...this.context, ...additionalContext });
  }

  /**
   * Startup/initialization logs (mapped to info)
   */
  startup(message, metadata = {}) {
    this.info(`[STARTUP] ${message}`, metadata);
  }

  /**
   * Command execution logs
   */
  command(commandName, userId, metadata = {}) {
    this.info('Command executed', {
      ...metadata,
      commandName,
      userId,
      eventType: 'command_execution',
    });
  }

  /**
   * Performance tracking
   */
  performance(operation, durationMs, metadata = {}) {
    this.info('Operation completed', {
      ...metadata,
      operation,
      durationMs,
      eventType: 'performance',
    });
  }

  /**
   * API call logging
   */
  apiCall(api, method, status, durationMs, metadata = {}) {
    this.info('API call', {
      ...metadata,
      api,
      method,
      status,
      durationMs,
      eventType: 'api_call',
    });
  }

  /**
   * Cache operation logging
   */
  cache(operation, key, hit, metadata = {}) {
    this.debug('Cache operation', {
      ...metadata,
      operation,
      key,
      hit,
      eventType: 'cache',
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CONVENIENCE FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a logger for a specific module
 */
function createLogger(module, context = {}) {
  return new Logger(module, context);
}

/**
 * Timer utility for measuring operation duration
 */
function createTimer() {
  const start = Date.now();
  return {
    stop: () => Date.now() - start,
    stopAndLog: (logger, operation, metadata = {}) => {
      const duration = Date.now() - start;
      logger.performance(operation, duration, metadata);
      return duration;
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
  Logger,
  createLogger,
  createTimer,
  generateCorrelationId,
  getCorrelationId,
  setCorrelationId,
  withCorrelationId,
  baseLogger, // Export base logger for direct access if needed
};
