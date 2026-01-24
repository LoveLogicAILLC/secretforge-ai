/**
 * Production logging and monitoring utilities
 * Structured logging with different levels and contexts
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  FATAL = 4,
}

export interface LogContext {
  requestId?: string;
  userId?: string;
  endpoint?: string;
  method?: string;
  ip?: string;
  duration?: number;
  [key: string]: any;
}

export interface LogEntry {
  level: string;
  timestamp: string;
  message: string;
  context?: LogContext;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

class Logger {
  private minLevel: LogLevel = LogLevel.INFO;
  private context: LogContext = {};

  constructor(context?: LogContext) {
    if (context) {
      this.context = context;
    }
  }

  setMinLevel(level: LogLevel) {
    this.minLevel = level;
  }

  setContext(context: LogContext) {
    this.context = { ...this.context, ...context };
  }

  debug(message: string, context?: LogContext) {
    this.log(LogLevel.DEBUG, message, context);
  }

  info(message: string, context?: LogContext) {
    this.log(LogLevel.INFO, message, context);
  }

  warn(message: string, context?: LogContext) {
    this.log(LogLevel.WARN, message, context);
  }

  error(message: string, error?: Error, context?: LogContext) {
    this.log(LogLevel.ERROR, message, {
      ...context,
      error: error
        ? {
            name: error.name,
            message: error.message,
            stack: error.stack,
          }
        : undefined,
    });
  }

  fatal(message: string, error?: Error, context?: LogContext) {
    this.log(LogLevel.FATAL, message, {
      ...context,
      error: error
        ? {
            name: error.name,
            message: error.message,
            stack: error.stack,
          }
        : undefined,
    });
  }

  private log(level: LogLevel, message: string, context?: LogContext) {
    if (level < this.minLevel) return;

    const entry: LogEntry = {
      level: LogLevel[level],
      timestamp: new Date().toISOString(),
      message,
      context: { ...this.context, ...context },
    };

    // Remove undefined values
    if (entry.context) {
      entry.context = Object.fromEntries(
        Object.entries(entry.context).filter(([_, v]) => v !== undefined)
      );
    }

    // Output to console (captured by Cloudflare Workers)
    const output = JSON.stringify(entry);

    switch (level) {
      case LogLevel.DEBUG:
      case LogLevel.INFO:
        console.log(output);
        break;
      case LogLevel.WARN:
        console.warn(output);
        break;
      case LogLevel.ERROR:
      case LogLevel.FATAL:
        console.error(output);
        break;
    }
  }

  /**
   * Create child logger with additional context
   */
  child(context: LogContext): Logger {
    const child = new Logger({ ...this.context, ...context });
    child.setMinLevel(this.minLevel);
    return child;
  }
}

// Export singleton instance
export const logger = new Logger();

/**
 * Performance monitoring utilities
 */
export class PerformanceMonitor {
  private metrics: Map<string, number[]> = new Map();

  /**
   * Record timing for an operation
   */
  record(operation: string, duration: number) {
    if (!this.metrics.has(operation)) {
      this.metrics.set(operation, []);
    }
    this.metrics.get(operation)!.push(duration);

    // Log slow operations
    if (duration > 1000) {
      logger.warn(`Slow operation detected: ${operation}`, {
        operation,
        duration: `${duration}ms`,
      });
    }
  }

  /**
   * Get performance statistics for an operation
   */
  getStats(operation: string) {
    const durations = this.metrics.get(operation) || [];
    if (durations.length === 0) {
      return null;
    }

    const sorted = [...durations].sort((a, b) => a - b);
    const sum = durations.reduce((a, b) => a + b, 0);

    return {
      count: durations.length,
      avg: sum / durations.length,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      p50: sorted[Math.floor(sorted.length * 0.5)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)],
    };
  }

  /**
   * Get all metrics
   */
  getAllStats() {
    const stats: Record<string, any> = {};
    for (const [operation, _] of this.metrics) {
      stats[operation] = this.getStats(operation);
    }
    return stats;
  }

  /**
   * Clear all metrics
   */
  clear() {
    this.metrics.clear();
  }
}

export const performanceMonitor = new PerformanceMonitor();

/**
 * Timing decorator for async functions
 */
export function timed(operationName: string) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const original = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const start = Date.now();
      try {
        return await original.apply(this, args);
      } finally {
        const duration = Date.now() - start;
        performanceMonitor.record(operationName, duration);
      }
    };

    return descriptor;
  };
}

/**
 * Timing helper for manual timing
 */
export async function time<T>(operationName: string, fn: () => Promise<T>): Promise<T> {
  const start = Date.now();
  try {
    return await fn();
  } finally {
    const duration = Date.now() - start;
    performanceMonitor.record(operationName, duration);
  }
}

/**
 * Error tracking utilities
 */
export class ErrorTracker {
  private errors: Map<string, number> = new Map();

  /**
   * Track an error occurrence
   */
  track(errorType: string, error: Error) {
    const count = this.errors.get(errorType) || 0;
    this.errors.set(errorType, count + 1);

    logger.error(`Error tracked: ${errorType}`, error, {
      errorType,
      count: count + 1,
    });

    // Alert on repeated errors
    if (count + 1 >= 10) {
      logger.fatal(`High error rate detected: ${errorType}`, error, {
        errorType,
        count: count + 1,
      });
    }
  }

  /**
   * Get error counts
   */
  getCounts() {
    return Object.fromEntries(this.errors);
  }

  /**
   * Clear error tracking
   */
  clear() {
    this.errors.clear();
  }
}

export const errorTracker = new ErrorTracker();

/**
 * Health check utilities
 */
export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  checks: {
    name: string;
    status: 'pass' | 'fail';
    message?: string;
    duration?: number;
  }[];
}

export class HealthChecker {
  private checks: Map<string, () => Promise<boolean>> = new Map();

  /**
   * Register a health check
   */
  register(name: string, check: () => Promise<boolean>) {
    this.checks.set(name, check);
  }

  /**
   * Run all health checks
   */
  async check(): Promise<HealthStatus> {
    const results: {
      name: string;
      status: 'pass' | 'fail';
      message?: string;
      duration?: number;
    }[] = [];
    let allPassed = true;

    for (const [name, check] of this.checks) {
      const start = Date.now();
      try {
        const passed = await check();
        results.push({
          name,
          status: passed ? 'pass' : 'fail',
          duration: Date.now() - start,
        });
        if (!passed) allPassed = false;
      } catch (error) {
        results.push({
          name,
          status: 'fail',
          message: error instanceof Error ? error.message : 'Unknown error',
          duration: Date.now() - start,
        });
        allPassed = false;
      }
    }

    return {
      status: allPassed ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      checks: results,
    };
  }
}

export const healthChecker = new HealthChecker();

/**
 * Metrics collection for monitoring
 */
export class MetricsCollector {
  private counters: Map<string, number> = new Map();
  private gauges: Map<string, number> = new Map();
  private histograms: Map<string, number[]> = new Map();

  /**
   * Increment a counter
   */
  increment(name: string, value: number = 1) {
    const current = this.counters.get(name) || 0;
    this.counters.set(name, current + value);
  }

  /**
   * Set a gauge value
   */
  gauge(name: string, value: number) {
    this.gauges.set(name, value);
  }

  /**
   * Record a histogram value
   */
  histogram(name: string, value: number) {
    if (!this.histograms.has(name)) {
      this.histograms.set(name, []);
    }
    this.histograms.get(name)!.push(value);
  }

  /**
   * Get all metrics
   */
  getMetrics() {
    return {
      counters: Object.fromEntries(this.counters),
      gauges: Object.fromEntries(this.gauges),
      histograms: Object.fromEntries(
        Array.from(this.histograms.entries()).map(([name, values]) => {
          const sorted = [...values].sort((a, b) => a - b);
          const sum = values.reduce((a, b) => a + b, 0);
          return [
            name,
            {
              count: values.length,
              sum,
              avg: sum / values.length,
              min: sorted[0],
              max: sorted[sorted.length - 1],
              p50: sorted[Math.floor(sorted.length * 0.5)],
              p95: sorted[Math.floor(sorted.length * 0.95)],
              p99: sorted[Math.floor(sorted.length * 0.99)],
            },
          ];
        })
      ),
    };
  }

  /**
   * Clear all metrics
   */
  clear() {
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
  }
}

export const metricsCollector = new MetricsCollector();
