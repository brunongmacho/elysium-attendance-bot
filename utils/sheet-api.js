/**
 * ============================================================================
 * UNIFIED GOOGLE SHEETS API CLIENT
 * ============================================================================
 *
 * Centralized API client for all Google Sheets operations.
 * Replaces 22+ duplicate fetch() blocks throughout the codebase.
 *
 * Features:
 * - Exponential backoff with jitter
 * - Automatic retry logic
 * - Centralized error handling
 * - Request/response logging
 * - Performance metrics
 * - Circuit breaker pattern
 *
 * Performance Benefits:
 * - Eliminates 300+ lines of duplicate code
 * - Consistent error handling across all modules
 * - Better observability and debugging
 * - Easier to add features (compression, caching, etc.)
 *
 * @module utils/sheet-api
 * @author Elysium Attendance Bot Team
 * @version 1.0
 * ============================================================================
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

const DEFAULT_OPTIONS = {
  maxRetries: 3,
  baseDelay: 2000, // 2 seconds
  maxDelay: 30000, // 30 seconds
  timeout: 30000,  // 30 seconds
  enableCircuitBreaker: true,
};

// ============================================================================
// CIRCUIT BREAKER STATE
// ============================================================================

const circuitBreaker = {
  failures: 0,
  lastFailureTime: 0,
  state: 'CLOSED', // CLOSED, OPEN, HALF_OPEN
  failureThreshold: 5,
  resetTimeout: 60000, // 1 minute
};

// ============================================================================
// METRICS
// ============================================================================

const metrics = {
  totalRequests: 0,
  successfulRequests: 0,
  failedRequests: 0,
  totalRetries: 0,
  avgResponseTime: 0,
  lastRequestTime: 0,
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Calculate exponential backoff delay with jitter.
 *
 * Formula: min(baseDelay * 2^attempt + random(0, 1000), maxDelay)
 *
 * @param {number} attempt - Retry attempt number (0-based)
 * @param {number} baseDelay - Base delay in milliseconds
 * @param {number} maxDelay - Maximum delay in milliseconds
 * @returns {number} Delay in milliseconds
 */
function calculateBackoff(attempt, baseDelay, maxDelay) {
  const exponentialDelay = baseDelay * Math.pow(2, attempt);
  const jitter = Math.random() * 1000; // 0-1000ms random jitter
  return Math.min(exponentialDelay + jitter, maxDelay);
}

/**
 * Sleep for specified duration.
 *
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check circuit breaker state.
 *
 * @returns {boolean} True if circuit is CLOSED or HALF_OPEN
 */
function checkCircuitBreaker() {
  const now = Date.now();

  // If circuit is OPEN, check if enough time has passed to reset
  if (circuitBreaker.state === 'OPEN') {
    if (now - circuitBreaker.lastFailureTime > circuitBreaker.resetTimeout) {
      circuitBreaker.state = 'HALF_OPEN';
      console.log('🔧 Circuit breaker entering HALF_OPEN state');
      return true;
    }
    return false;
  }

  return true;
}

/**
 * Record successful request.
 */
function recordSuccess() {
  if (circuitBreaker.state === 'HALF_OPEN') {
    circuitBreaker.state = 'CLOSED';
    circuitBreaker.failures = 0;
    console.log('✅ Circuit breaker CLOSED');
  }
  metrics.successfulRequests++;
}

/**
 * Record failed request.
 */
function recordFailure() {
  circuitBreaker.failures++;
  circuitBreaker.lastFailureTime = Date.now();
  metrics.failedRequests++;

  if (circuitBreaker.failures >= circuitBreaker.failureThreshold &&
      circuitBreaker.state !== 'OPEN') {
    circuitBreaker.state = 'OPEN';
    console.error(`🚨 Circuit breaker OPEN after ${circuitBreaker.failures} failures`);
  }
}

// ============================================================================
// MAIN API CLIENT CLASS
// ============================================================================

/**
 * Unified Google Sheets API client.
 *
 * Provides a centralized interface for all Google Sheets operations with
 * built-in retry logic, error handling, and performance tracking.
 *
 * @class SheetAPI
 * @example
 * const api = new SheetAPI('https://script.google.com/...');
 * const data = await api.call('getBiddingPoints', {});
 */
class SheetAPI {
  /**
   * Create a new SheetAPI instance.
   *
   * @param {string} webhookUrl - Google Sheets webhook URL
   * @param {Object} [options={}] - Configuration options
   */
  constructor(webhookUrl, options = {}) {
    this.webhookUrl = webhookUrl;
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Make an API call to Google Sheets.
   *
   * FEATURES:
   * - Automatic retry with exponential backoff
   * - Circuit breaker pattern
   * - Request/response logging
   * - Performance metrics
   * - Comprehensive error handling
   *
   * @param {string} action - Action to perform (e.g., 'getBiddingPoints')
   * @param {Object} [data={}] - Additional data to send with request
   * @param {Object} [callOptions={}] - Per-call options override
   * @returns {Promise<Object>} Response data
   * @throws {Error} If request fails after all retries
   *
   * @example
   * const points = await api.call('getBiddingPoints');
   * const result = await api.call('saveAuctionResults', { items: [...] });
   */
  async call(action, data = {}, callOptions = {}) {
    const options = { ...this.options, ...callOptions };
    const startTime = Date.now();

    // Check circuit breaker
    if (options.enableCircuitBreaker && !checkCircuitBreaker()) {
      const error = new Error(
        `Circuit breaker is OPEN. Too many recent failures. ` +
        `Wait ${Math.round(circuitBreaker.resetTimeout / 1000)}s before retry.`
      );
      error.code = 'CIRCUIT_BREAKER_OPEN';
      throw error;
    }

    metrics.totalRequests++;

    // Retry loop
    for (let attempt = 0; attempt < options.maxRetries; attempt++) {
      try {
        // Log request
        if (attempt === 0) {
          console.log(`📤 API call: ${action}`);
        } else {
          console.log(`🔄 Retry ${attempt}/${options.maxRetries - 1}: ${action}`);
          metrics.totalRetries++;
        }

        // Make request with timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), options.timeout);

        const response = await fetch(this.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, ...data }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        // Check HTTP status
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        // Parse response
        const result = await response.json();

        // Check application-level status
        if (result.status === 'error') {
          throw new Error(result.message || 'Sheet operation failed');
        }

        // Success!
        const duration = Date.now() - startTime;
        metrics.avgResponseTime = Math.round(
          (metrics.avgResponseTime * (metrics.successfulRequests - 1) + duration) /
          metrics.successfulRequests
        );
        metrics.lastRequestTime = Date.now();

        recordSuccess();

        console.log(`✅ API success: ${action} (${duration}ms)`);
        return result;

      } catch (error) {
        const isLastAttempt = attempt === options.maxRetries - 1;

        // Handle abort/timeout
        if (error.name === 'AbortError') {
          console.error(`⏱️ Timeout on ${action} (${options.timeout}ms)`);
          error.message = `Request timeout after ${options.timeout}ms`;
        }

        // Log error
        console.error(`❌ API error on ${action}: ${error.message}`);

        // If last attempt, fail
        if (isLastAttempt) {
          recordFailure();
          throw new Error(`API call failed after ${options.maxRetries} attempts: ${error.message}`);
        }

        // Calculate backoff delay
        const delay = calculateBackoff(
          attempt,
          options.baseDelay,
          options.maxDelay
        );

        console.log(`⏳ Waiting ${Math.round(delay / 1000)}s before retry...`);
        await sleep(delay);
      }
    }

    // Should never reach here
    throw new Error('Unexpected error in API call');
  }

  /**
   * Get API metrics.
   *
   * @returns {Object} Current metrics
   */
  getMetrics() {
    return {
      ...metrics,
      circuitBreakerState: circuitBreaker.state,
      circuitBreakerFailures: circuitBreaker.failures,
      successRate: metrics.totalRequests > 0
        ? ((metrics.successfulRequests / metrics.totalRequests) * 100).toFixed(2) + '%'
        : 'N/A',
    };
  }

  /**
   * Reset circuit breaker manually.
   */
  resetCircuitBreaker() {
    circuitBreaker.failures = 0;
    circuitBreaker.state = 'CLOSED';
    circuitBreaker.lastFailureTime = 0;
    console.log('🔧 Circuit breaker manually reset');
  }

  /**
   * Reset metrics.
   */
  resetMetrics() {
    metrics.totalRequests = 0;
    metrics.successfulRequests = 0;
    metrics.failedRequests = 0;
    metrics.totalRetries = 0;
    metrics.avgResponseTime = 0;
    metrics.lastRequestTime = 0;
  }
}

// ============================================================================
// MODULE EXPORTS
// ============================================================================

module.exports = {
  SheetAPI,
  calculateBackoff, // Export for testing
  metrics, // Export for monitoring
  circuitBreaker, // Export for monitoring
};
