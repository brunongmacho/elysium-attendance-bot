/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                    SENTRY ERROR TRACKING & APM                            ║
 * ║         Application Performance Monitoring & Error Reporting              ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * @fileoverview Sentry integration for error tracking and performance monitoring
 * Features:
 * - Automatic error capture
 * - Performance profiling
 * - Breadcrumbs for debugging
 * - Release tracking
 * - User context
 * - Custom tags and metadata
 */

const Sentry = require('@sentry/node');
const { ProfilingIntegration } = require('@sentry/profiling-node');
const { createLogger } = require('./logger');

const logger = createLogger('sentry');

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const SENTRY_DSN = process.env.SENTRY_DSN;
const SENTRY_ENVIRONMENT = process.env.NODE_ENV || 'development';
const SENTRY_ENABLED = process.env.SENTRY_ENABLED !== 'false' && !!SENTRY_DSN;

// Read version from package.json
let packageVersion = '9.0.0';
try {
  const packageJson = require('../package.json');
  packageVersion = packageJson.version;
} catch (err) {
  logger.warn('Could not read package.json version');
}

// ═══════════════════════════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════

let initialized = false;

/**
 * Initialize Sentry
 */
function initializeSentry() {
  if (initialized) {
    logger.warn('Sentry already initialized');
    return;
  }

  if (!SENTRY_ENABLED) {
    logger.info('Sentry is disabled (no DSN or SENTRY_ENABLED=false)');
    return;
  }

  try {
    Sentry.init({
      dsn: SENTRY_DSN,
      environment: SENTRY_ENVIRONMENT,
      release: `elysium-attendance-bot@${packageVersion}`,

      // Performance Monitoring
      tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || '0.1'), // 10% of transactions
      profilesSampleRate: parseFloat(process.env.SENTRY_PROFILES_SAMPLE_RATE || '0.1'), // 10% of transactions

      // Integrations
      integrations: [
        new ProfilingIntegration(),
        new Sentry.Integrations.Http({ tracing: true }),
        new Sentry.Integrations.OnUncaughtException({
          onFatalError: async (err) => {
            logger.error('Fatal error detected, reporting to Sentry', err);
            // Let the process crash after reporting
            process.exit(1);
          },
        }),
        new Sentry.Integrations.OnUnhandledRejection({
          mode: 'warn', // 'warn' or 'strict'
        }),
      ],

      // Error filtering
      beforeSend(event, hint) {
        // Filter out certain errors if needed
        const error = hint.originalException;

        // Example: Don't send rate limit errors to Sentry
        if (error && error.message && error.message.includes('rate limit')) {
          logger.debug('Skipping rate limit error from Sentry');
          return null;
        }

        return event;
      },

      // Breadcrumb filtering
      beforeBreadcrumb(breadcrumb, hint) {
        // Filter sensitive data from breadcrumbs
        if (breadcrumb.category === 'console' && breadcrumb.message) {
          // Redact potential tokens/secrets in console logs
          breadcrumb.message = breadcrumb.message.replace(/token[=:]\s*[\w-]+/gi, 'token=***');
        }
        return breadcrumb;
      },
    });

    initialized = true;
    logger.info('Sentry initialized successfully', {
      environment: SENTRY_ENVIRONMENT,
      release: packageVersion,
    });
  } catch (error) {
    logger.error('Failed to initialize Sentry', error);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ERROR TRACKING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Capture an exception
 */
function captureException(error, context = {}) {
  if (!SENTRY_ENABLED) return null;

  try {
    return Sentry.captureException(error, {
      tags: context.tags || {},
      extra: context.extra || {},
      user: context.user || {},
      level: context.level || 'error',
    });
  } catch (err) {
    logger.error('Failed to capture exception in Sentry', err);
    return null;
  }
}

/**
 * Capture a message
 */
function captureMessage(message, level = 'info', context = {}) {
  if (!SENTRY_ENABLED) return null;

  try {
    return Sentry.captureMessage(message, {
      level,
      tags: context.tags || {},
      extra: context.extra || {},
      user: context.user || {},
    });
  } catch (err) {
    logger.error('Failed to capture message in Sentry', err);
    return null;
  }
}

/**
 * Add breadcrumb
 */
function addBreadcrumb(breadcrumb) {
  if (!SENTRY_ENABLED) return;

  try {
    Sentry.addBreadcrumb({
      timestamp: Date.now() / 1000,
      ...breadcrumb,
    });
  } catch (err) {
    logger.error('Failed to add breadcrumb in Sentry', err);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CONTEXT MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Set user context
 */
function setUser(user) {
  if (!SENTRY_ENABLED) return;

  try {
    Sentry.setUser({
      id: user.id,
      username: user.username,
      ...(user.email ? { email: user.email } : {}),
    });
  } catch (err) {
    logger.error('Failed to set user in Sentry', err);
  }
}

/**
 * Set custom tag
 */
function setTag(key, value) {
  if (!SENTRY_ENABLED) return;

  try {
    Sentry.setTag(key, value);
  } catch (err) {
    logger.error('Failed to set tag in Sentry', err);
  }
}

/**
 * Set custom context
 */
function setContext(name, context) {
  if (!SENTRY_ENABLED) return;

  try {
    Sentry.setContext(name, context);
  } catch (err) {
    logger.error('Failed to set context in Sentry', err);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PERFORMANCE MONITORING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Start a transaction for performance monitoring
 */
function startTransaction(name, op, context = {}) {
  if (!SENTRY_ENABLED) {
    // Return a mock transaction
    return {
      setName: () => {},
      setTag: () => {},
      setData: () => {},
      finish: () => {},
      startChild: (childContext) => startTransaction(childContext.op || 'child', 'child'),
    };
  }

  try {
    return Sentry.startTransaction({
      name,
      op,
      ...context,
    });
  } catch (err) {
    logger.error('Failed to start transaction in Sentry', err);
    return null;
  }
}

/**
 * Start a span within current transaction
 */
function startSpan(transaction, op, description) {
  if (!SENTRY_ENABLED || !transaction) {
    return {
      finish: () => {},
      setTag: () => {},
      setData: () => {},
    };
  }

  try {
    return transaction.startChild({
      op,
      description,
    });
  } catch (err) {
    logger.error('Failed to start span in Sentry', err);
    return null;
  }
}

/**
 * Wrap a function with performance monitoring
 */
function withPerformanceMonitoring(name, fn, op = 'function') {
  return async function (...args) {
    const transaction = startTransaction(name, op);
    try {
      const result = await fn.apply(this, args);
      transaction?.finish();
      return result;
    } catch (error) {
      transaction?.setTag('error', true);
      transaction?.finish();
      captureException(error, {
        tags: { operation: name },
      });
      throw error;
    }
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// INTEGRATION HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create command context for Sentry
 */
function createCommandContext(interaction) {
  return {
    tags: {
      command: interaction.commandName || 'unknown',
      channel: interaction.channelId,
      guild: interaction.guildId,
    },
    user: {
      id: interaction.user?.id,
      username: interaction.user?.username,
    },
    extra: {
      commandOptions: interaction.options?.data || [],
    },
  };
}

/**
 * Wrap Discord command handler with error tracking
 */
function wrapCommandHandler(commandName, handler) {
  return async function (interaction) {
    const transaction = startTransaction(`command.${commandName}`, 'command');
    const context = createCommandContext(interaction);

    setContext('command', context);

    try {
      const result = await handler(interaction);
      transaction?.setTag('status', 'success');
      transaction?.finish();
      return result;
    } catch (error) {
      transaction?.setTag('status', 'error');
      transaction?.finish();
      captureException(error, context);
      throw error;
    }
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// FLUSH & CLEANUP
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Flush pending events (useful before shutdown)
 */
async function flush(timeout = 2000) {
  if (!SENTRY_ENABLED) return true;

  try {
    return await Sentry.flush(timeout);
  } catch (err) {
    logger.error('Failed to flush Sentry events', err);
    return false;
  }
}

/**
 * Close Sentry client
 */
async function close(timeout = 2000) {
  if (!SENTRY_ENABLED) return true;

  try {
    return await Sentry.close(timeout);
  } catch (err) {
    logger.error('Failed to close Sentry client', err);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
  // Initialization
  initializeSentry,
  initialized: () => initialized,
  enabled: () => SENTRY_ENABLED,

  // Error tracking
  captureException,
  captureMessage,
  addBreadcrumb,

  // Context
  setUser,
  setTag,
  setContext,

  // Performance
  startTransaction,
  startSpan,
  withPerformanceMonitoring,

  // Integration helpers
  createCommandContext,
  wrapCommandHandler,

  // Cleanup
  flush,
  close,

  // Raw Sentry client (for advanced usage)
  Sentry,
};
