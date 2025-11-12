/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                      LOGGING CONFIGURATION SYSTEM                         ║
 * ║                    Control Verbosity Across Modules                       ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * @fileoverview Centralized logging configuration to reduce startup noise
 * and make logs more actionable. Only shows critical information by default.
 *
 * USAGE:
 * const logger = require('./utils/log-config');
 * logger.startup('✅ Module initialized');  // Only if STARTUP logs enabled
 * logger.info('📊 Processing data...');     // Only if INFO logs enabled
 * logger.error('❌ Error occurred');        // Always shown
 */

// ═══════════════════════════════════════════════════════════════════════════
// LOG LEVELS
// ═══════════════════════════════════════════════════════════════════════════

const LOG_LEVELS = {
  ERROR: 0,   // Always shown - critical failures
  WARN: 1,    // Always shown - important warnings
  INFO: 2,    // Optional - general information
  DEBUG: 3,   // Optional - detailed debugging
  STARTUP: 4, // Optional - startup/initialization logs
};

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const LOG_CONFIG = {
  // Global log level (shows this level and below)
  // ERROR = only errors/warnings
  // INFO = errors/warnings/info
  // DEBUG = everything except startup spam
  // STARTUP = everything including verbose startup logs
  currentLevel: process.env.LOG_LEVEL || 'INFO',

  // Module-specific overrides (turn off noisy modules)
  modules: {
    startup: process.env.LOG_STARTUP !== 'true',      // Disable verbose startup by default
    proactive: process.env.LOG_PROACTIVE !== 'true',   // Disable proactive intelligence spam
    nlp: process.env.LOG_NLP !== 'true',               // Disable NLP learning spam
    recovery: process.env.LOG_RECOVERY !== 'true',     // Disable recovery system spam
    intelligence: process.env.LOG_INTELLIGENCE !== 'true', // Disable intelligence engine spam
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// LOGGER CLASS
// ═══════════════════════════════════════════════════════════════════════════

class Logger {
  constructor(module = 'general') {
    this.module = module;
  }

  /**
   * Check if a log level should be shown
   */
  shouldLog(level) {
    const currentLevelValue = LOG_LEVELS[LOG_CONFIG.currentLevel.toUpperCase()] || LOG_LEVELS.INFO;
    const requestedLevelValue = LOG_LEVELS[level] || LOG_LEVELS.INFO;

    // Module-specific override
    if (level === 'STARTUP' && LOG_CONFIG.modules.startup === false) return false;
    if (this.module === 'proactive' && LOG_CONFIG.modules.proactive === false && level !== 'ERROR' && level !== 'WARN') return false;
    if (this.module === 'nlp' && LOG_CONFIG.modules.nlp === false && level !== 'ERROR' && level !== 'WARN') return false;
    if (this.module === 'recovery' && LOG_CONFIG.modules.recovery === false && level !== 'ERROR' && level !== 'WARN') return false;
    if (this.module === 'intelligence' && LOG_CONFIG.modules.intelligence === false && level !== 'ERROR' && level !== 'WARN') return false;

    return requestedLevelValue <= currentLevelValue;
  }

  /**
   * Log methods
   */
  error(message, ...args) {
    if (this.shouldLog('ERROR')) {
      console.error(message, ...args);
    }
  }

  warn(message, ...args) {
    if (this.shouldLog('WARN')) {
      console.warn(message, ...args);
    }
  }

  info(message, ...args) {
    if (this.shouldLog('INFO')) {
      console.log(message, ...args);
    }
  }

  debug(message, ...args) {
    if (this.shouldLog('DEBUG')) {
      console.log(message, ...args);
    }
  }

  startup(message, ...args) {
    if (this.shouldLog('STARTUP')) {
      console.log(message, ...args);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CONVENIENCE FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a logger for a specific module
 */
function createLogger(module) {
  return new Logger(module);
}

/**
 * Get current log configuration
 */
function getConfig() {
  return { ...LOG_CONFIG };
}

/**
 * Update log configuration at runtime
 */
function setConfig(updates) {
  Object.assign(LOG_CONFIG, updates);
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
  Logger,
  createLogger,
  getConfig,
  setConfig,
  LOG_LEVELS,
};
