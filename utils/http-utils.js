/**
 * HTTP Utilities with Timeout, Retry Logic, and Request Deduplication
 * Optimized for Google Sheets API and external requests
 */

const fetch = require('node-fetch');
const { TIMING } = require('./constants');
const { handleError, warn, debug } = require('./error-handler');

// Request deduplication cache
const requestCache = new Map();
const pendingRequests = new Map();

// Rate limiting
let lastRequestTime = 0;

/**
 * Sleep utility
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch with timeout support
 * @param {string} url - URL to fetch
 * @param {Object} options - Fetch options
 * @param {number} timeout - Timeout in milliseconds
 * @returns {Promise<Response>}
 */
async function fetchWithTimeout(url, options = {}, timeout = TIMING.HTTP_TIMEOUT) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error(`Request timeout after ${timeout}ms`);
    }
    throw error;
  }
}

/**
 * Fetch with retry logic using exponential backoff
 * @param {string} url - URL to fetch
 * @param {Object} options - Fetch options
 * @param {Object} retryOptions - Retry configuration
 * @returns {Promise<Response>}
 */
async function fetchWithRetry(url, options = {}, retryOptions = {}) {
  const {
    maxRetries = TIMING.HTTP_RETRY_ATTEMPTS,
    baseDelay = TIMING.HTTP_RETRY_BASE_DELAY,
    timeout = TIMING.HTTP_TIMEOUT,
    retryOn = [408, 429, 500, 502, 503, 504] // Status codes to retry on
  } = retryOptions;

  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Rate limiting: ensure minimum delay between requests
      const now = Date.now();
      const timeSinceLastRequest = now - lastRequestTime;
      if (timeSinceLastRequest < TIMING.MIN_SHEET_DELAY) {
        const waitTime = TIMING.MIN_SHEET_DELAY - timeSinceLastRequest;
        debug(`Rate limiting: waiting ${waitTime}ms`, { url });
        await sleep(waitTime);
      }
      lastRequestTime = Date.now();

      const response = await fetchWithTimeout(url, options, timeout);

      // Check if we should retry based on status code
      if (attempt < maxRetries && retryOn.includes(response.status)) {
        const delay = baseDelay * Math.pow(2, attempt);
        warn(`Request failed with status ${response.status}, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`, {
          url,
          status: response.status
        });
        await sleep(delay);
        continue;
      }

      return response;
    } catch (error) {
      lastError = error;

      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt);
        warn(`Request failed: ${error.message}, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`, {
          url,
          error: error.message
        });
        await sleep(delay);
      } else {
        handleError(error, 'fetchWithRetry', {
          silent: false,
          metadata: { url, attempts: attempt + 1 }
        });
      }
    }
  }

  throw lastError || new Error('Max retries exceeded');
}

/**
 * Post to Google Sheets with retry and caching
 * @param {string} url - Webhook URL
 * @param {Object} payload - Data payload
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} Response data
 */
async function postToSheet(url, payload, options = {}) {
  const {
    cache = false,
    cacheTTL = 30000, // 30 seconds default cache
    deduplicate = true
  } = options;

  // Generate cache key
  const cacheKey = JSON.stringify({ url, payload });

  // Check cache if enabled
  if (cache) {
    const cached = requestCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < cacheTTL) {
      debug('Using cached response', { cacheKey: cacheKey.slice(0, 50) });
      return cached.data;
    }
  }

  // Check for pending duplicate request
  if (deduplicate && pendingRequests.has(cacheKey)) {
    debug('Deduplicating request - waiting for pending request', {
      cacheKey: cacheKey.slice(0, 50)
    });
    return await pendingRequests.get(cacheKey);
  }

  // Create pending request promise
  const requestPromise = (async () => {
    try {
      const response = await fetchWithRetry(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const text = await response.text().catch(() => 'Unable to read response');
        throw new Error(`Sheet API error: ${response.status} - ${text}`);
      }

      const data = await response.json();

      // Cache successful response
      if (cache) {
        requestCache.set(cacheKey, {
          data,
          timestamp: Date.now()
        });

        // Auto-cleanup cache after TTL
        setTimeout(() => {
          requestCache.delete(cacheKey);
        }, cacheTTL);
      }

      return data;
    } catch (error) {
      handleError(error, 'postToSheet', {
        silent: false,
        metadata: { url, action: payload.action }
      });
      throw error;
    } finally {
      // Remove from pending requests
      pendingRequests.delete(cacheKey);
    }
  })();

  // Store pending request
  if (deduplicate) {
    pendingRequests.set(cacheKey, requestPromise);
  }

  return requestPromise;
}

/**
 * Batch multiple sheet operations into a single request
 * @param {string} url - Webhook URL
 * @param {Array} operations - Array of operations
 * @returns {Promise<Array>} Array of results
 */
async function batchSheetOperations(url, operations) {
  try {
    const response = await fetchWithRetry(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'batch',
        operations
      })
    });

    if (!response.ok) {
      const text = await response.text().catch(() => 'Unable to read response');
      throw new Error(`Batch operation failed: ${response.status} - ${text}`);
    }

    const data = await response.json();
    return data.results || [];
  } catch (error) {
    handleError(error, 'batchSheetOperations', {
      silent: false,
      metadata: { url, operationCount: operations.length }
    });
    throw error;
  }
}

/**
 * Clear request cache (useful for invalidating after writes)
 * @param {string} pattern - Pattern to match cache keys (optional)
 */
function clearCache(pattern = null) {
  if (!pattern) {
    requestCache.clear();
    debug('Cleared entire request cache');
    return;
  }

  let cleared = 0;
  for (const [key] of requestCache) {
    if (key.includes(pattern)) {
      requestCache.delete(key);
      cleared++;
    }
  }
  debug(`Cleared ${cleared} cache entries matching pattern: ${pattern}`);
}

/**
 * Get cache statistics
 * @returns {Object} Cache stats
 */
function getCacheStats() {
  return {
    cacheSize: requestCache.size,
    pendingRequests: pendingRequests.size,
    cacheKeys: Array.from(requestCache.keys()).map(k => k.slice(0, 50))
  };
}

module.exports = {
  fetchWithTimeout,
  fetchWithRetry,
  postToSheet,
  batchSheetOperations,
  clearCache,
  getCacheStats,
  sleep
};
