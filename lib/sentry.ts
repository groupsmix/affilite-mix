import { truncateIp } from "./get-client-ip";
import { redactLogContext } from "./log-redaction";
/**
 * Sentry error monitoring helpers for Cloudflare Workers.
 *
 * @sentry/cloudflare uses a different initialization pattern than the
 * standard Node.js SDK — it wraps the Worker handler via `withSentry()`
 * rather than calling `init()` directly.
 *
 * This module provides helper functions that can be used throughout the
 * application for manual error capture. The `captureException` and
 * `captureMessage` functions from @sentry/cloudflare work regardless of
 * whether Sentry has been initialized via the handler wrapper.
 *
 * Trace-id integration:
 *   Pass `{ traceId }` in the context to tag Sentry events with the
 *   request's trace ID (injected by middleware via `x-trace-id`).
 *   This lets you jump from a Sentry alert straight to the matching
 *   log lines in Cloudflare / Datadog.
 *
 * Setup:
 *   1. Create a Sentry project (https://sentry.io)
 *   2. Set SENTRY_DSN in your environment / Cloudflare Workers secrets
 *   3. The @opennextjs/cloudflare adapter should wrap the handler with
 *      `withSentry()` — see Sentry's Cloudflare Workers documentation
 *
 * In local development, Sentry is disabled when SENTRY_DSN is not set.
 */

import {
  captureException as sentryCaptureException,
  captureMessage as sentryCaptureMessage,
  isInitialized,
  setTag,
  addEventProcessor,
  type SeverityLevel,
} from "@sentry/cloudflare";
import { after } from "next/server";

/**
 * Check Sentry availability and log a warning if not configured in production.
 * Called once at startup from instrumentation.ts.
 */
export function checkSentryConfig() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn && process.env.NODE_ENV === "production") {
    console.warn(
      "[sentry] SENTRY_DSN not set — error monitoring is disabled. " +
        "Set the SENTRY_DSN environment variable to enable Sentry.",
    );
  }

  // F-004: Global PII Scrubbing
  // Sentry is initialized via the @opennextjs/cloudflare wrapper. We inject
  // a global event processor here to scrub PII from all outgoing events.
  try {
    if (isInitialized()) {
      addEventProcessor((event) => {
        if (event.request) {
          if (event.request.url) {
            event.request.url = event.request.url.split("?")[0].split("#")[0];
          }
          if (event.request.headers) {
            delete event.request.headers["cookie"];
            delete event.request.headers["authorization"];
          }
        }
        if (event.user) {
          delete event.user.email;
          delete event.user.ip_address;
        }
        return event;
      });
    }
  } catch (e) {
    // Ignore errors if addEventProcessor is not available in this environment
  }
}

/**
 * Capture an exception in Sentry with optional context.
 * Always also logs to console for Cloudflare's built-in log stream.
 *
 * When a `traceId` key is present in the context, it is set as a Sentry
 * tag so that errors can be filtered/searched by trace ID in the dashboard.
 */
export function captureException(error: unknown, context?: Record<string, unknown>) {
  if (
    context &&
    context.user &&
    typeof context.user === "object" &&
    (context.user as Record<string, unknown>).ip_address
  ) {
    const user = context.user as Record<string, unknown>;
    user.ip_address = truncateIp(user.ip_address as string);
  }
  if (isInitialized()) {
    try {
      after(async () => {
        if (context?.traceId && typeof context.traceId === "string") {
          setTag("traceId", context.traceId);
        }
        sentryCaptureException(error, { data: context });
      });
    } catch {
      // fail-open: best-effort [criticality:non-critical]
      if (context?.traceId && typeof context.traceId === "string") {
        setTag("traceId", context.traceId);
      }
      sentryCaptureException(error, { data: context });
    }
  }
  // Always log to console as well for Cloudflare's built-in log stream.
  // SECURITY: strip CR/LF from BOTH the error and context string values
  // before logging so a user-controlled value cannot inject a fake log
  // line into Cloudflare's log stream (CodeQL js/log-injection).
  console.error("[error]", sanitizeForLog(error), redactLogContext(context));
}

/**
 * Sanitize a logged value: replace CR/LF with a single space in strings,
 * recurse into plain object fields, and convert Errors to a sanitized
 * `{ name, message, stack }` shape.
 */
function sanitizeForLog(value: unknown): unknown {
  if (value == null) return value;
  if (typeof value === "string") return value.replace(/[\r\n]+/g, " ");
  if (value instanceof Error) {
    return {
      name: value.name.replace(/[\r\n]+/g, " "),
      message: value.message.replace(/[\r\n]+/g, " "),
      stack: typeof value.stack === "string" ? value.stack.replace(/[\r\n]+/g, " ") : undefined,
    };
  }
  if (typeof value !== "object") return value;
  // Plain object — shallow-sanitize string fields only.
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = typeof v === "string" ? v.replace(/[\r\n]+/g, " ") : v;
  }
  return out;
}

/**
 * Capture a message in Sentry with optional context.
 */
export function captureMessage(message: string, level: SeverityLevel = "info") {
  if (isInitialized()) {
    try {
      after(async () => {
        sentryCaptureMessage(message, level);
      });
    } catch {
      // fail-open: best-effort [criticality:non-critical]
      sentryCaptureMessage(message, level);
    }
  }
}
