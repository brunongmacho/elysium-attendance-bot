/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                   GRACEFUL DEGRADATION & OPERATION QUEUE                  ║
 * ║         Queue Operations When External Services Are Unavailable           ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * @fileoverview Graceful degradation system for handling service outages
 * Features:
 * - Queue operations when Google Sheets API is down
 * - Automatic retry with exponential backoff
 * - Persistent queue (survives restarts)
 * - Staleness indicators for cached data
 * - Circuit breaker pattern
 * - Queue size limits
 */

const fs = require('fs').promises;
const path = require('path');
const { createLogger } = require('./logger');

const logger = createLogger('operation-queue');

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const QUEUE_FILE = path.join(__dirname, '../.queue.json');
const MAX_QUEUE_SIZE = parseInt(process.env.MAX_QUEUE_SIZE || '1000', 10);
const MAX_RETRIES = parseInt(process.env.MAX_OPERATION_RETRIES || '5', 10);
const INITIAL_RETRY_DELAY = 5000; // 5 seconds
const MAX_RETRY_DELAY = 300000; // 5 minutes
const CIRCUIT_BREAKER_THRESHOLD = 10; // Number of failures before opening circuit
const CIRCUIT_BREAKER_TIMEOUT = 60000; // 1 minute before trying again

// ═══════════════════════════════════════════════════════════════════════════
// CIRCUIT BREAKER STATE
// ═══════════════════════════════════════════════════════════════════════════

const circuitBreakers = new Map();

class CircuitBreaker {
  constructor(service) {
    this.service = service;
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.successCount = 0;
  }

  recordSuccess() {
    this.failureCount = 0;
    this.successCount++;
    if (this.state === 'HALF_OPEN' && this.successCount >= 3) {
      this.state = 'CLOSED';
      this.successCount = 0;
      logger.info(`Circuit breaker CLOSED for ${this.service}`);
    }
  }

  recordFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    this.successCount = 0;

    if (this.failureCount >= CIRCUIT_BREAKER_THRESHOLD && this.state === 'CLOSED') {
      this.state = 'OPEN';
      logger.warn(`Circuit breaker OPENED for ${this.service} after ${this.failureCount} failures`);
    }
  }

  canAttempt() {
    if (this.state === 'CLOSED') {
      return true;
    }

    if (this.state === 'OPEN') {
      const timeSinceLastFailure = Date.now() - this.lastFailureTime;
      if (timeSinceLastFailure >= CIRCUIT_BREAKER_TIMEOUT) {
        this.state = 'HALF_OPEN';
        logger.info(`Circuit breaker HALF_OPEN for ${this.service}, allowing test request`);
        return true;
      }
      return false;
    }

    // HALF_OPEN state allows attempts
    return true;
  }

  getState() {
    return {
      service: this.service,
      state: this.state,
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime,
    };
  }
}

function getCircuitBreaker(service) {
  if (!circuitBreakers.has(service)) {
    circuitBreakers.set(service, new CircuitBreaker(service));
  }
  return circuitBreakers.get(service);
}

// ═══════════════════════════════════════════════════════════════════════════
// OPERATION QUEUE
// ═══════════════════════════════════════════════════════════════════════════

class OperationQueue {
  constructor() {
    this.queue = [];
    this.processing = false;
    this.initialized = false;
  }

  /**
   * Initialize queue from persistent storage
   */
  async initialize() {
    if (this.initialized) return;

    try {
      const data = await fs.readFile(QUEUE_FILE, 'utf8');
      this.queue = JSON.parse(data);
      logger.info(`Loaded ${this.queue.length} operations from persistent queue`);
    } catch (error) {
      if (error.code === 'ENOENT') {
        logger.info('No existing queue file found, starting fresh');
        this.queue = [];
      } else {
        logger.error('Failed to load queue from file', error);
        this.queue = [];
      }
    }

    this.initialized = true;

    // Start processing if there are items
    if (this.queue.length > 0) {
      this.startProcessing();
    }
  }

  /**
   * Persist queue to disk
   */
  async persist() {
    try {
      await fs.writeFile(QUEUE_FILE, JSON.stringify(this.queue, null, 2), 'utf8');
      logger.debug(`Persisted ${this.queue.length} operations to queue file`);
    } catch (error) {
      logger.error('Failed to persist queue to file', error);
    }
  }

  /**
   * Add operation to queue
   */
  async enqueue(operation) {
    if (this.queue.length >= MAX_QUEUE_SIZE) {
      logger.warn('Queue is full, removing oldest operation');
      this.queue.shift();
    }

    const queuedOperation = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      ...operation,
      queuedAt: Date.now(),
      retryCount: 0,
      lastAttempt: null,
    };

    this.queue.push(queuedOperation);
    logger.info('Operation queued', {
      id: queuedOperation.id,
      type: operation.type,
      service: operation.service,
      queueSize: this.queue.length,
    });

    await this.persist();

    // Start processing if not already running
    if (!this.processing) {
      this.startProcessing();
    }

    return queuedOperation.id;
  }

  /**
   * Get queue status
   */
  getStatus() {
    return {
      size: this.queue.length,
      processing: this.processing,
      oldestOperation: this.queue[0]?.queuedAt || null,
      circuitBreakers: Array.from(circuitBreakers.values()).map(cb => cb.getState()),
    };
  }

  /**
   * Start processing queue
   */
  async startProcessing() {
    if (this.processing) {
      logger.debug('Queue processing already in progress');
      return;
    }

    this.processing = true;
    logger.info('Starting queue processing');

    while (this.queue.length > 0) {
      const operation = this.queue[0];
      const breaker = getCircuitBreaker(operation.service);

      // Check circuit breaker
      if (!breaker.canAttempt()) {
        logger.debug(`Circuit breaker OPEN for ${operation.service}, waiting...`);
        await this.delay(CIRCUIT_BREAKER_TIMEOUT);
        continue;
      }

      // Check retry limit
      if (operation.retryCount >= MAX_RETRIES) {
        logger.error('Operation exceeded max retries, removing from queue', {
          id: operation.id,
          type: operation.type,
          retryCount: operation.retryCount,
        });
        this.queue.shift();
        await this.persist();
        continue;
      }

      // Calculate backoff delay
      const backoffDelay = Math.min(
        INITIAL_RETRY_DELAY * Math.pow(2, operation.retryCount),
        MAX_RETRY_DELAY
      );

      // Wait for backoff if this is a retry
      if (operation.retryCount > 0) {
        logger.debug(`Waiting ${backoffDelay}ms before retry ${operation.retryCount + 1}`, {
          id: operation.id,
        });
        await this.delay(backoffDelay);
      }

      // Attempt operation
      try {
        logger.info('Processing operation', {
          id: operation.id,
          type: operation.type,
          service: operation.service,
          attempt: operation.retryCount + 1,
        });

        operation.lastAttempt = Date.now();
        operation.retryCount++;

        // Execute the operation
        await this.executeOperation(operation);

        // Success! Record and remove from queue
        breaker.recordSuccess();
        this.queue.shift();
        await this.persist();

        logger.info('Operation completed successfully', {
          id: operation.id,
          type: operation.type,
        });
      } catch (error) {
        logger.warn('Operation failed', {
          id: operation.id,
          type: operation.type,
          error: error.message,
          attempt: operation.retryCount,
        });

        breaker.recordFailure();
        await this.persist();

        // If we've hit max retries, remove the operation
        if (operation.retryCount >= MAX_RETRIES) {
          this.queue.shift();
          await this.persist();
        }
      }
    }

    this.processing = false;
    logger.info('Queue processing completed');
  }

  /**
   * Execute a queued operation
   */
  async executeOperation(operation) {
    // This should be overridden or extended based on operation type
    throw new Error(`Operation execution not implemented for type: ${operation.type}`);
  }

  /**
   * Delay helper
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Clear the queue
   */
  async clear() {
    this.queue = [];
    await this.persist();
    logger.info('Queue cleared');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// STALENESS TRACKING
// ═══════════════════════════════════════════════════════════════════════════

const stalenessTrackers = new Map();

class StalenessTracker {
  constructor(key) {
    this.key = key;
    this.lastSuccessfulSync = Date.now();
    this.isStale = false;
  }

  markSuccess() {
    this.lastSuccessfulSync = Date.now();
    this.isStale = false;
  }

  markStale() {
    this.isStale = true;
  }

  getStalenessDuration() {
    return Date.now() - this.lastSuccessfulSync;
  }

  getStalenessIndicator() {
    if (!this.isStale) return null;

    const duration = this.getStalenessDuration();
    const minutes = Math.floor(duration / 60000);

    if (minutes < 5) return '⚠️ Data may be up to 5 minutes old';
    if (minutes < 30) return `⚠️ Data is ~${minutes} minutes old`;
    if (minutes < 120) return `⚠️ Data is ~${Math.floor(minutes / 60)} hour(s) old`;
    return `🔴 Data is more than 2 hours old`;
  }
}

function getStalenessTracker(key) {
  if (!stalenessTrackers.has(key)) {
    stalenessTrackers.set(key, new StalenessTracker(key));
  }
  return stalenessTrackers.get(key);
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
  OperationQueue,
  CircuitBreaker,
  getCircuitBreaker,
  getStalenessTracker,
  CIRCUIT_BREAKER_THRESHOLD,
  MAX_QUEUE_SIZE,
  MAX_RETRIES,
};
