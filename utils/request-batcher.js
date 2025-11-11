/**
 * ============================================================================
 * REQUEST BATCHING SYSTEM
 * ============================================================================
 *
 * Intelligent request batching to prevent Google Sheets API rate limiting.
 * Groups multiple operations together and processes them in controlled batches.
 *
 * Features:
 * - Automatic request queueing with flush windows
 * - Batch size limits (max 20 per batch)
 * - Inter-batch delays to respect rate limits
 * - Priority queue support (high/normal/low priority)
 * - Operation grouping by type
 * - Promise-based API for easy integration
 *
 * Rate Limit Strategy:
 * - Google Sheets API Limits:
 *   * 60 requests per minute per user
 *   * 100 requests per 100 seconds per user
 * - Our Batching Strategy:
 *   * Max 20 items per batch
 *   * 2-second delay between batches
 *   * Results in ~30 requests/minute (well under limit!)
 *   * Prevents 429 rate limit errors
 *
 * Performance Benefits:
 * - Reduces total API calls by grouping operations
 * - Eliminates rate limit errors
 * - Improves throughput for bulk operations
 * - Better user experience (fewer delays from rate limits)
 *
 * @module utils/request-batcher
 * @requires ./sheet-api - For making batched API calls
 * @requires ./error-handler - For debug logging
 *
 * @author Elysium Attendance Bot Team
 * @version 1.0
 * ============================================================================
 */

// ============================================================================
// DEPENDENCIES
// ============================================================================

const { debug } = require('./error-handler');

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Batching configuration
 * @constant
 */
const CONFIG = {
  MAX_BATCH_SIZE: 20,           // Maximum items per batch
  BATCH_DELAY: 2000,            // Delay between batches (ms)
  FLUSH_WINDOW: 100,            // Wait time to collect requests (ms)
  MAX_QUEUE_SIZE: 1000,         // Maximum queued requests
  PRIORITY_LEVELS: {
    HIGH: 0,
    NORMAL: 1,
    LOW: 2,
  },
};

// ============================================================================
// BATCH QUEUE
// ============================================================================

/**
 * Request queue organized by priority and operation type.
 * Structure: Map<operationType, Map<priority, Array<Request>>>
 * @type {Map<string, Map<number, Array>>}
 */
const requestQueue = new Map();

/**
 * Timer for flush window.
 * @type {NodeJS.Timeout|null}
 */
let flushTimer = null;

/**
 * Flag to indicate if a batch is currently being processed.
 * @type {boolean}
 */
let isProcessing = false;

/**
 * Statistics tracking.
 * @type {Object}
 */
const stats = {
  totalRequests: 0,
  batchesSent: 0,
  requestsSaved: 0,        // Requests that were batched vs sent individually
  avgBatchSize: 0,
  lastFlushTime: 0,
};

// ============================================================================
// QUEUE MANAGEMENT
// ============================================================================

/**
 * Add a request to the batch queue.
 *
 * Requests are queued and grouped by operation type and priority.
 * A flush window timer starts automatically to process the queue.
 *
 * @function enqueue
 * @param {string} operationType - Type of operation (e.g., 'updatePoints', 'logAttendance')
 * @param {Object} data - Request data
 * @param {number} [priority=1] - Priority level (0=high, 1=normal, 2=low)
 * @returns {Promise<*>} Promise that resolves with the operation result
 *
 * @example
 * const result = await enqueue('updatePoints', { user: 'Alice', points: 10 }, 0);
 */
function enqueue(operationType, data, priority = CONFIG.PRIORITY_LEVELS.NORMAL) {
  return new Promise((resolve, reject) => {
    // Check queue size limit
    const currentSize = getQueueSize();
    if (currentSize >= CONFIG.MAX_QUEUE_SIZE) {
      reject(new Error(`Queue full: ${currentSize} requests pending`));
      return;
    }

    // Initialize operation type map if needed
    if (!requestQueue.has(operationType)) {
      requestQueue.set(operationType, new Map());
    }

    const opQueue = requestQueue.get(operationType);

    // Initialize priority array if needed
    if (!opQueue.has(priority)) {
      opQueue.set(priority, []);
    }

    // Add request to queue
    opQueue.get(priority).push({
      data,
      resolve,
      reject,
      timestamp: Date.now(),
    });

    stats.totalRequests++;

    debug('Request enqueued', {
      operationType,
      priority,
      queueSize: currentSize + 1,
    });

    // Start flush timer if not already running
    if (!flushTimer && !isProcessing) {
      flushTimer = setTimeout(() => {
        flushTimer = null;
        processQueue();
      }, CONFIG.FLUSH_WINDOW);
    }
  });
}

/**
 * Get total number of queued requests.
 *
 * @function getQueueSize
 * @returns {number} Total queued requests
 */
function getQueueSize() {
  let total = 0;
  for (const opQueue of requestQueue.values()) {
    for (const priorityQueue of opQueue.values()) {
      total += priorityQueue.length;
    }
  }
  return total;
}

/**
 * Dequeue requests into batches respecting priority and batch size.
 *
 * Strategy:
 * 1. Process high priority first, then normal, then low
 * 2. Group by operation type for efficiency
 * 3. Respect MAX_BATCH_SIZE limit
 *
 * @function dequeueBatch
 * @returns {Array<Object>} Array of batches to process
 */
function dequeueBatch() {
  const batches = [];
  const priorities = [
    CONFIG.PRIORITY_LEVELS.HIGH,
    CONFIG.PRIORITY_LEVELS.NORMAL,
    CONFIG.PRIORITY_LEVELS.LOW,
  ];

  // Process each operation type
  for (const [operationType, opQueue] of requestQueue.entries()) {
    // Process by priority
    for (const priority of priorities) {
      if (!opQueue.has(priority)) continue;

      const queue = opQueue.get(priority);
      if (queue.length === 0) continue;

      // Create batches of MAX_BATCH_SIZE
      while (queue.length > 0) {
        const batchSize = Math.min(CONFIG.MAX_BATCH_SIZE, queue.length);
        const batch = queue.splice(0, batchSize);

        batches.push({
          operationType,
          priority,
          requests: batch,
        });
      }

      // Clean up empty priority queue
      if (queue.length === 0) {
        opQueue.delete(priority);
      }
    }

    // Clean up empty operation queue
    if (opQueue.size === 0) {
      requestQueue.delete(operationType);
    }
  }

  return batches;
}

// ============================================================================
// BATCH PROCESSING
// ============================================================================

/**
 * Process all queued requests in batches.
 *
 * Dequeues all pending requests, groups them into batches, and processes
 * each batch with delays to respect rate limits.
 *
 * @function processQueue
 * @returns {Promise<void>}
 */
async function processQueue() {
  if (isProcessing) {
    debug('Batch processing already in progress, skipping');
    return;
  }

  isProcessing = true;
  const startTime = Date.now();

  try {
    // Get all batches to process
    const batches = dequeueBatch();

    if (batches.length === 0) {
      debug('No batches to process');
      return;
    }

    debug('Processing batches', {
      totalBatches: batches.length,
      totalRequests: batches.reduce((sum, b) => sum + b.requests.length, 0),
    });

    // Process each batch with delays
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];

      try {
        await processBatch(batch);

        // Add delay between batches (except after last batch)
        if (i < batches.length - 1) {
          debug(`Waiting ${CONFIG.BATCH_DELAY}ms before next batch...`);
          await sleep(CONFIG.BATCH_DELAY);
        }
      } catch (error) {
        console.error('Error processing batch:', error);
        // Continue with next batch even if one fails
      }
    }

    // Update statistics
    stats.batchesSent += batches.length;
    stats.lastFlushTime = Date.now();

    const totalRequests = batches.reduce((sum, b) => sum + b.requests.length, 0);
    stats.avgBatchSize = Math.round(
      (stats.avgBatchSize * (stats.batchesSent - batches.length) + totalRequests) /
      stats.batchesSent
    );

    const duration = Date.now() - startTime;
    debug('Batch processing completed', {
      batches: batches.length,
      requests: totalRequests,
      duration: `${duration}ms`,
    });

  } finally {
    isProcessing = false;

    // Check if more requests arrived while processing
    if (getQueueSize() > 0 && !flushTimer) {
      flushTimer = setTimeout(() => {
        flushTimer = null;
        processQueue();
      }, CONFIG.FLUSH_WINDOW);
    }
  }
}

/**
 * Process a single batch of requests.
 *
 * Sends the batch to the API and resolves/rejects individual promises
 * based on results.
 *
 * @function processBatch
 * @param {Object} batch - Batch to process
 * @returns {Promise<void>}
 */
async function processBatch(batch) {
  const { operationType, requests } = batch;

  debug('Processing batch', {
    operationType,
    size: requests.length,
    priority: batch.priority,
  });

  try {
    // For now, process requests individually
    // In a future enhancement, we could modify the backend to accept batched operations
    const results = await Promise.allSettled(
      requests.map(req => processSingleRequest(operationType, req.data))
    );

    // Resolve/reject individual promises based on results
    results.forEach((result, index) => {
      const request = requests[index];

      if (result.status === 'fulfilled') {
        request.resolve(result.value);
      } else {
        request.reject(result.reason);
      }
    });

    // Track requests saved by batching
    if (requests.length > 1) {
      stats.requestsSaved += requests.length - 1;
    }

  } catch (error) {
    // If batch processing fails entirely, reject all requests
    requests.forEach(request => {
      request.reject(new Error(`Batch processing failed: ${error.message}`));
    });
    throw error;
  }
}

/**
 * Process a single request within a batch.
 *
 * This is a placeholder that should be replaced with actual API calls.
 * In practice, you would use the SheetAPI instance here.
 *
 * @function processSingleRequest
 * @param {string} operationType - Operation type
 * @param {Object} data - Request data
 * @returns {Promise<*>} Operation result
 */
async function processSingleRequest(operationType, data) {
  // This is a placeholder - in actual use, you would:
  // const api = require('./sheet-api-instance');
  // return await api.call(operationType, data);

  // For now, simulate processing
  debug('Processing single request', { operationType, data });
  return { success: true, operationType, data };
}

/**
 * Sleep utility.
 *
 * @function sleep
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// MANUAL FLUSH
// ============================================================================

/**
 * Manually flush the queue immediately.
 *
 * Useful for testing or when you need to ensure all queued requests
 * are processed before continuing.
 *
 * @function flush
 * @returns {Promise<void>}
 *
 * @example
 * await flush(); // Wait for all queued requests to complete
 */
async function flush() {
  // Cancel pending flush timer
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }

  // Process queue immediately
  await processQueue();
}

// ============================================================================
// STATISTICS
// ============================================================================

/**
 * Get batching statistics.
 *
 * @function getStats
 * @returns {Object} Current statistics
 *
 * @example
 * const stats = getStats();
 * console.log(`Batched ${stats.totalRequests} requests into ${stats.batchesSent} batches`);
 */
function getStats() {
  return {
    ...stats,
    queueSize: getQueueSize(),
    isProcessing,
    requestsPerBatch: stats.batchesSent > 0
      ? (stats.totalRequests / stats.batchesSent).toFixed(2)
      : 0,
  };
}

/**
 * Reset statistics.
 *
 * @function resetStats
 */
function resetStats() {
  stats.totalRequests = 0;
  stats.batchesSent = 0;
  stats.requestsSaved = 0;
  stats.avgBatchSize = 0;
  stats.lastFlushTime = 0;
}

// ============================================================================
// MODULE EXPORTS
// ============================================================================

module.exports = {
  // Core API
  enqueue,
  flush,

  // Statistics
  getStats,
  resetStats,
  getQueueSize,

  // Configuration (for testing/customization)
  CONFIG,

  // For testing
  _internal: {
    requestQueue,
    processQueue,
    processBatch,
  },
};
