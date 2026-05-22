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

/**
 * F-OBS-02: PII field deny-list. These fields are unconditionally redacted
 * from log output to prevent accidental PII leakage.
 */
const DENIED_LOG_FIELDS = new Set([
  "email",
  "password",
  "secret",
  "token",
  "cookie",
  "authorization",
  "body",
  "password_hash",
  "totp_secret",
  "reset_token",
  "api_key",
  "apikey",
  "access_token",
  "refresh_token",
  // A41 / A8: additional PII / payment fields
  "phone",
  "phone_number",
  "mobile",
  "ssn",
  "social_security",
  "national_insurance",
  "ni_number",
  "dob",
  "date_of_birth",
  "card",
  "card_number",
  "pan",
  "cvv",
  "cvc",
  "expiry",
  "card_expiry",
  "payment_method",
  "bank_account",
  "iban",
  "routing_number",
  "private_key",
  "private",
  "credential",
  "credentials",
  "passphrase",
  "pin",
]);

function jsonReplacer(key: string, value: unknown): unknown {
  if (value instanceof Error) {
    return { message: value.message, name: value.name, stack: value.stack };
  }
  // F-OBS-02: Redact denied PII fields
  if (DENIED_LOG_FIELDS.has(key.toLowerCase())) {
    return "[REDACTED]";
  }
  // F-026: Tighten IP truncation logic to catch all common IP keys
  if (/^(?:req_)?ip(?:_address)?$|peer(?:_ip)?|^client_ip$/i.test(key)) {
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

/**
 * F-14: Per-event log sampling for high-volume paths.
 *
 * Use for click tracking, rate-limit denials, AI usage, and newsletter
 * abuse paths to avoid overwhelming log storage. Sampling is deterministic
 * per key (hash-based) so a given key always resolves the same way within
 * a given isolate's lifetime.
 */
const sampleCounters = new Map<string, number>();

export function shouldSample(eventKey: string, sampleRate: number): boolean {
  if (sampleRate >= 1) return true;
  if (sampleRate <= 0) return false;
  const count = (sampleCounters.get(eventKey) ?? 0) + 1;
  sampleCounters.set(eventKey, count);
  return count % Math.round(1 / sampleRate) === 0;
}

/**
 * F-13: Allowlisted log event schemas.
 * High-value events should use these typed emitters instead of raw logger
 * calls with arbitrary extras, to prevent PII leaking through unnamed fields.
 */
export function logSecurityEvent(event: {
  action: "login_success" | "login_failure" | "token_revoked" | "session_expired" | "rate_limited" | "ssrf_blocked";
  userId?: string;
  traceId?: string;
  metadata?: Record<string, string | number | boolean>;
}): void {
  logger.info(`security.${event.action}`, {
    action: event.action,
    userId: event.userId,
    traceId: event.traceId,
    ...event.metadata,
  });
}
