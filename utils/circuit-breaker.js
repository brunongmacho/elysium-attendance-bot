/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ELYSIUM GUILD BOT - Circuit Breaker Pattern
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Circuit Breaker for MongoDB operations with Google Sheets fallback
 *
 * States:
 * - CLOSED: Normal operation (MongoDB working)
 * - OPEN: MongoDB failing, use fallback (Sheets)
 * - HALF_OPEN: Testing if MongoDB recovered
 *
 * Features:
 * - Automatic fallback to Sheets if MongoDB fails
 * - Auto-recovery detection
 * - Failure threshold configuration
 * - Success/failure tracking
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ═══════════════════════════════════════════════════════════════════════════
// CIRCUIT BREAKER CLASS
// ═══════════════════════════════════════════════════════════════════════════

class CircuitBreaker {
  /**
   * Create a circuit breaker
   * @param {Object} options - Configuration options
   * @param {number} options.threshold - Number of failures before opening circuit (default: 5)
   * @param {number} options.timeout - Milliseconds before attempting recovery (default: 60000)
   * @param {string} options.name - Name for logging (default: 'CircuitBreaker')
   */
  constructor(options = {}) {
    this.threshold = options.threshold || 5;
    this.timeout = options.timeout || 60000; // 1 minute
    this.name = options.name || 'CircuitBreaker';

    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.failures = 0;
    this.successes = 0;
    this.lastFailure = 0;
    this.lastStateChange = Date.now();

    this.stats = {
      totalAttempts: 0,
      totalSuccesses: 0,
      totalFailures: 0,
      totalFallbacks: 0,
      stateChanges: {
        CLOSED: 0,
        OPEN: 0,
        HALF_OPEN: 0
      }
    };
  }

  /**
   * Execute operation with circuit breaker protection
   * @param {Function} operation - Primary operation (MongoDB)
   * @param {Function} fallback - Fallback operation (Sheets)
   * @returns {Promise<any>} - Result from operation or fallback
   */
  async execute(operation, fallback) {
    this.stats.totalAttempts++;

    // Check if circuit is open
    if (this.state === 'OPEN') {
      // Check if timeout elapsed
      if (Date.now() - this.lastFailure > this.timeout) {
        console.log(`🔄 [${this.name}] Timeout elapsed, switching to HALF_OPEN`);
        this.setState('HALF_OPEN');
      } else {
        // Circuit still open, use fallback
        console.warn(`⚠️ [${this.name}] Circuit OPEN, using fallback`);
        this.stats.totalFallbacks++;
        return await this.executeFallback(fallback);
      }
    }

    // Try primary operation
    try {
      const result = await operation();
      this.onSuccess();
      return result;

    } catch (error) {
      this.onFailure(error);

      // Use fallback
      console.warn(`⚠️ [${this.name}] Primary failed, using fallback:`, error.message);
      this.stats.totalFallbacks++;
      return await this.executeFallback(fallback);
    }
  }

  /**
   * Execute fallback operation
   * @param {Function} fallback - Fallback function
   */
  async executeFallback(fallback) {
    if (!fallback) {
      throw new Error(`[${this.name}] No fallback provided and circuit is open`);
    }

    try {
      return await fallback();
    } catch (fallbackError) {
      console.error(`❌ [${this.name}] Fallback also failed:`, fallbackError.message);
      throw fallbackError;
    }
  }

  /**
   * Handle successful operation
   */
  onSuccess() {
    this.failures = 0;
    this.successes++;
    this.stats.totalSuccesses++;

    // Recover from HALF_OPEN or OPEN state
    if (this.state !== 'CLOSED') {
      console.log(`✅ [${this.name}] Operation successful, closing circuit`);
      this.setState('CLOSED');
    }
  }

  /**
   * Handle failed operation
   * @param {Error} error - Error that occurred
   */
  onFailure(error) {
    this.failures++;
    this.successes = 0;
    this.stats.totalFailures++;
    this.lastFailure = Date.now();

    console.error(`❌ [${this.name}] Operation failed (${this.failures}/${this.threshold}):`, error.message);

    // Open circuit if threshold reached
    if (this.failures >= this.threshold) {
      if (this.state !== 'OPEN') {
        console.error(`🚨 [${this.name}] Failure threshold reached, opening circuit`);
        this.setState('OPEN');
      }
    }
  }

  /**
   * Set circuit breaker state
   * @param {string} newState - New state (CLOSED, OPEN, HALF_OPEN)
   */
  setState(newState) {
    if (this.state !== newState) {
      console.log(`🔄 [${this.name}] State: ${this.state} → ${newState}`);
      this.state = newState;
      this.lastStateChange = Date.now();
      this.stats.stateChanges[newState]++;
    }
  }

  /**
   * Get current circuit breaker status
   */
  getStatus() {
    return {
      name: this.name,
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      threshold: this.threshold,
      lastFailure: this.lastFailure,
      lastStateChange: this.lastStateChange,
      stats: this.stats
    };
  }

  /**
   * Manually reset circuit breaker
   */
  reset() {
    console.log(`🔄 [${this.name}] Manual reset`);
    this.failures = 0;
    this.successes = 0;
    this.setState('CLOSED');
  }

  /**
   * Check if circuit is healthy
   */
  isHealthy() {
    return this.state === 'CLOSED';
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = CircuitBreaker;
