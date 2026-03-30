/**
 * Structured logging utility compatible with Cloudflare Workers.
 *
 * Outputs JSON-formatted log lines with level, timestamp, and optional
 * context fields. In production on Cloudflare Workers, structured logs
 * are captured by Sentry and Cloudflare's built-in log stream.
 *
 * Usage:
 *   import { logger } from "@/lib/logger";
 *   logger.info("User logged in", { userId: "abc", ip: "1.2.3.4" });
 *   logger.error("Failed to send email", { error: err.message });
 */

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  [key: string]: unknown;
}

function formatEntry(level: LogLevel, message: string, context?: Record<string, unknown>): LogEntry {
  return {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...context,
  };
}

function shouldLog(level: LogLevel): boolean {
  if (process.env.NODE_ENV === "production") {
    // In production, skip debug logs
    return level !== "debug";
  }
  return true;
}

export const logger = {
  debug(message: string, context?: Record<string, unknown>) {
    if (!shouldLog("debug")) return;
    console.debug(JSON.stringify(formatEntry("debug", message, context)));
  },

  info(message: string, context?: Record<string, unknown>) {
    if (!shouldLog("info")) return;
    console.info(JSON.stringify(formatEntry("info", message, context)));
  },

  warn(message: string, context?: Record<string, unknown>) {
    if (!shouldLog("warn")) return;
    console.warn(JSON.stringify(formatEntry("warn", message, context)));
  },

  error(message: string, context?: Record<string, unknown>) {
    if (!shouldLog("error")) return;
    console.error(JSON.stringify(formatEntry("error", message, context)));
  },
};
