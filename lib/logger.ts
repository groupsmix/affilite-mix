import { truncateIp } from "./get-client-ip";
/**
 * Structured logger.
 *
 * Every log line is emitted as a single JSON object so Cloudflare's log
 * stream (and downstream consumers like Sentry, Logflare, or Better Stack)
 * can parse it without a grammar.  The shape is deliberately flat:
 *
 *     { "ts": "…", "level": "info", "msg": "…", "ctx": "…", <...extras> }
 *
 * A request-scoped correlation ID is generated per API request and propagated
 * via the `x-trace-id` header in `middleware.ts`. Passing it into
 * `logger.child({ requestId })` adds it to every subsequent log line
 * emitted through that child so log lines from a single request can be
 * correlated end-to-end.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function currentThreshold(): number {
  const raw = (process.env.LOG_LEVEL ?? "").toLowerCase();
  if (raw === "debug" || raw === "info" || raw === "warn" || raw === "error") {
    return LEVEL_ORDER[raw];
  }
  // Default: info in production, debug in dev.
  return process.env.NODE_ENV === "production" ? LEVEL_ORDER.info : LEVEL_ORDER.debug;
}

export interface Logger {
  debug: (msg: string, extras?: Record<string, unknown>) => void;
  info: (msg: string, extras?: Record<string, unknown>) => void;
  warn: (msg: string, extras?: Record<string, unknown>) => void;
  error: (msg: string, extras?: Record<string, unknown>) => void;
  /** Return a new logger whose emitted lines include the given bindings. */
  child: (bindings: Record<string, unknown>) => Logger;
}

function emit(
  level: LogLevel,
  bindings: Record<string, unknown>,
  msg: string,
  extras?: Record<string, unknown>,
) {
  if (LEVEL_ORDER[level] < currentThreshold()) return;

  const line = {
    ts: new Date().toISOString(),
    level,
    msg,
    ...bindings,
    ...(extras ?? {}),
  };

  // Serialise once so we can survive non-cloneable values (Error, etc.)
  const serialised = JSON.stringify(line, jsonReplacer);

  // Route through the matching console method so Cloudflare colourises
  // correctly and log-tailing tools can still filter by level.
  switch (level) {
    case "debug":
    case "info":
      console.log(serialised);
      return;
    case "warn":
      console.warn(serialised);
      return;
    case "error":
      console.error(serialised);
  }
}

function jsonReplacer(key: string, value: unknown): unknown {
  if (value instanceof Error) {
    return { message: value.message, name: value.name, stack: value.stack };
  }
  if (key === "ip" || key === "client_ip" || key === "ip_address") {
    return typeof value === "string" ? truncateIp(value) : value;
  }
  return value;
}

function build(bindings: Record<string, unknown>): Logger {
  return {
    debug: (msg, extras) => emit("debug", bindings, msg, extras),
    info: (msg, extras) => emit("info", bindings, msg, extras),
    warn: (msg, extras) => emit("warn", bindings, msg, extras),
    error: (msg, extras) => emit("error", bindings, msg, extras),
    child: (extra) => build({ ...bindings, ...extra }),
  };
}

/** The root logger.  Use `logger.child({ requestId })` inside API routes. */
export const logger: Logger = build({});
