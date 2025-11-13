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
  baseDelay: 3000, // 3 seconds (increased from 2)
  maxDelay: 45000, // 45 seconds (increased from 30)
  timeout: 30000,  // 30 seconds
  enableCircuitBreaker: true,
  // Rate limit specific settings
  rateLimitMaxRetries: 7, // More retries for rate limits (increased from 5)
  rateLimitBaseDelay: 15000, // 15 seconds for rate limits (increased from 10)
  rateLimitMaxDelay: 180000, // 3 minutes max for rate limits (increased from 2)
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
 * @param {boolean} isRateLimit - Whether this is a rate limit error
 * @returns {number} Delay in milliseconds
 */
function calculateBackoff(attempt, baseDelay, maxDelay, isRateLimit = false) {
  const exponentialDelay = baseDelay * Math.pow(2, attempt);
  const jitter = Math.random() * 1000; // 0-1000ms random jitter
  const delay = Math.min(exponentialDelay + jitter, maxDelay);

  // For rate limits, add extra jitter to spread out requests
  if (isRateLimit) {
    const extraJitter = Math.random() * 5000; // 0-5s extra jitter
    return Math.min(delay + extraJitter, maxDelay);
  }

  return delay;
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
     /**
   * Make an API call to Google Sheets (Koyeb-stable version)
   */
  async call(action, data = {}, callOptions = {}) {
    const options = { ...this.options, ...callOptions };
    const startTime = Date.now();
    const { fetch, Agent } = await import("undici");

    // Custom agent with longer connect timeout (30s)
    const agent = new Agent({
      connect: {
        timeout: 30000, // default 10 000 ms → now 30 000 ms
      },
    });

    if (options.enableCircuitBreaker && !checkCircuitBreaker()) {
      const error = new Error(
        `Circuit breaker is OPEN. Wait ${Math.round(circuitBreaker.resetTimeout / 1000)}s before retry.`
      );
      error.code = "CIRCUIT_BREAKER_OPEN";
      throw error;
    }

    metrics.totalRequests++;

    let isRateLimited = false;
    let rateLimitAttempts = 0;
    let normalAttempts = 0;

    while (true) {
      const currentAttempt = isRateLimited ? rateLimitAttempts : normalAttempts;
      const maxRetries = isRateLimited ? options.rateLimitMaxRetries : options.maxRetries;

      if (currentAttempt >= maxRetries) {
        recordFailure();
        throw new Error(`API call failed after ${maxRetries} attempts.`);
      }

      try {
        if (isRateLimited) rateLimitAttempts++; else normalAttempts++;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), options.timeout);

        const response = await fetch(this.webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, ...data }),
          signal: controller.signal,
          dispatcher: agent, // use custom agent with longer connect timeout
        });

        clearTimeout(timeoutId);

        if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);

        const result = await response.json();
        if (result.status === "error") throw new Error(result.message || "Sheet operation failed");

        const duration = Date.now() - startTime;
        metrics.avgResponseTime = Math.round(
          (metrics.avgResponseTime * (metrics.successfulRequests - 1) + duration) /
          Math.max(1, metrics.successfulRequests)
        );
        metrics.lastRequestTime = Date.now();
        recordSuccess();
        return result;

            } catch (error) {
        const transientErrors = [
          "UND_ERR_CONNECT_TIMEOUT",
          "UND_ERR_HEADERS_TIMEOUT",
          "UND_ERR_SOCKET",
          "ECONNRESET",
          "ECONNREFUSED",
          "FetchError",
          "TimeoutError"
        ];

        const errorCode = error.code || '';
        const errorMessage = error.message || '';
        
        const isTransient = transientErrors.some(
          code => errorCode.includes(code) || errorMessage.includes(code)
        );
        const isRateLimitError =
          errorMessage.includes("HTTP 429") || errorMessage.includes("Too Many Requests");

        if (isRateLimitError && !isRateLimited) {
          isRateLimited = true;
          rateLimitAttempts = 0;
          console.log("⚠️ Rate limit detected. Switching to extended retry strategy...");
        }

        if (isTransient || error.name === "AbortError") {
          console.warn(`⚠️ Transient network issue (${errorCode || error.name}): retrying...`);
        } else {
          console.error(`❌ API error on ${action}: ${errorMessage}`);
        }

        const attemptForBackoff = isRateLimited ? rateLimitAttempts : normalAttempts;
        const baseDelay = isRateLimited ? options.rateLimitBaseDelay : options.baseDelay;
        const maxDelay = isRateLimited ? options.rateLimitMaxDelay : options.maxDelay;
        const delay = calculateBackoff(attemptForBackoff, baseDelay, maxDelay, isRateLimited);

        console.log(`⏳ Waiting ${Math.round(delay / 1000)}s before retry (${attemptForBackoff + 1}/${maxRetries})...`);
        await sleep(delay);
      }
    }
  }



  // ========================================================================
  // LEARNING SYSTEM METHODS
  // ========================================================================

  /**
   * Save a prediction for future learning
   */
  async savePredictionForLearning(data) {
    return await this.call('savePredictionForLearning', data);
  }

  /**
   * Update prediction with actual result
   */
  async updatePredictionAccuracy(data) {
    return await this.call('updatePredictionAccuracy', data);
  }

  /**
   * Get learning data
   */
  async getLearningData(data) {
    return await this.call('getLearningData', data);
  }

  /**
   * Get learning metrics
   */
  async getLearningMetrics(data) {
    return await this.call('getLearningMetrics', data);
  }

  // ========================================================================
  // GOOGLE DRIVE METHODS (Learning & Data Storage)
  // ========================================================================

  /**
   * Initialize Google Drive folder structure
   */
  async initializeDriveFolders() {
    return await this.call('initializeDriveFolders', {});
  }

  /**
   * Upload screenshot to Google Drive
   * @param {Object} data - { imageUrl, type, username, bossName, timestamp }
   */
  async uploadScreenshot(data) {
    return await this.call('uploadScreenshot', data);
  }

  /**
   * Export learning data to Google Drive
   * @param {Object} filters - Optional filters { type, startDate, endDate }
   */
  async exportLearningData(filters = {}) {
    return await this.call('exportLearningData', { filters });
  }

  /**
   * Export prediction features for ML training
   */
  async exportPredictionFeatures() {
    return await this.call('exportPredictionFeatures', {});
  }

  /**
   * Create daily backup of all sheets
   */
  async createDailyBackup() {
    return await this.call('createDailyBackup', {});
  }

  /**
   * Log admin action to audit trail
   * @param {Object} data - { action, username, details, timestamp }
   */
  async logAuditTrail(data) {
    return await this.call('logAuditTrail', data);
  }

  /**
   * Bootstrap learning system from historical data
   * Analyzes all ForDistribution data and creates completed predictions
   */
  async bootstrapLearning() {
    return await this.call('bootstrapLearning', {});
  }

  /**
   * Check if bootstrap is needed
   */
  async needsBootstrap() {
    return await this.call('needsBootstrap', {});
  }

  /**
   * Get all weekly attendance data for spawn prediction
   * Fetches all spawn columns from all weekly sheets
   */
  async getAllWeeklyAttendance() {
    return await this.call('getAllWeeklyAttendance', {});
  }

  // ========================================================================
  // METRICS & MONITORING
  // ========================================================================

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
