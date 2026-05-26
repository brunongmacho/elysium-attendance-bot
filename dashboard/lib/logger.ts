/**
 * Logger utility
 * Wraps console methods to respect environment settings
 * In production, can be disabled or send to external logging service
 */

const isDevelopment = process.env.NODE_ENV === 'development';
const isProduction = process.env.NODE_ENV === 'production';

/**
 * Logger that only outputs in development
 * In production, could be extended to send to logging service (e.g., Sentry, LogRocket)
 */
export const logger = {
  /**
   * Log informational messages (development only)
   */
  log: (...args: any[]) => {
    if (isDevelopment) {
      console.log(...args);
    }
  },

  /**
   * Log errors (always logged, can be sent to error tracking in production)
   */
  error: (...args: any[]) => {
    if (isDevelopment) {
      console.error(...args);
    } else if (isProduction) {
      // In production, send to error tracking service
      // Example: Sentry.captureException(args[0]);
      console.error(...args);
    }
  },

  /**
   * Log warnings (always logged)
   */
  warn: (...args: any[]) => {
    if (isDevelopment) {
      console.warn(...args);
    } else if (isProduction) {
      // Could filter or send to logging service
      console.warn(...args);
    }
  },

  /**
   * Log debug information (development only)
   */
  debug: (...args: any[]) => {
    if (isDevelopment) {
      console.debug(...args);
    }
  },

  /**
   * Group console logs (development only)
   */
  group: (label: string) => {
    if (isDevelopment) {
      console.group(label);
    }
  },

  /**
   * End console group (development only)
   */
  groupEnd: () => {
    if (isDevelopment) {
      console.groupEnd();
    }
  },

  /**
   * Log a table (development only)
   */
  table: (data: any) => {
    if (isDevelopment) {
      console.table(data);
    }
  },
};

/**
 * Performance logger for measuring operations
 */
export const perfLogger = {
  /**
   * Start a performance measurement
   */
  start: (label: string) => {
    if (isDevelopment) {
      performance.mark(`${label}-start`);
    }
  },

  /**
   * End a performance measurement and log the duration
   */
  end: (label: string) => {
    if (isDevelopment) {
      performance.mark(`${label}-end`);
      performance.measure(label, `${label}-start`, `${label}-end`);
      const measure = performance.getEntriesByName(label)[0];
      console.log(`⏱️ ${label}: ${measure.duration.toFixed(2)}ms`);
      performance.clearMarks();
      performance.clearMeasures();
    }
  },
};
