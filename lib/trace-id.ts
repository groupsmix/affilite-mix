/**
 * Request tracing utilities.
 *
 * Generates a unique trace ID per request and propagates it through headers
 * so that every log line, Sentry event, and downstream service call can be
 * correlated back to a single user-facing request.
 *
 * Header conventions:
 *   - `x-trace-id`   — the canonical trace identifier (set by middleware)
 *   - `cf-ray`       — Cloudflare's own ray ID (read-only, used as fallback)
 *
 * Usage in API routes:
 *   import { generateTraceId, TRACE_ID_HEADER } from "@/lib/trace-id";
 *   const traceId = request.headers.get(TRACE_ID_HEADER) ?? generateTraceId();
 *   logger.info("Processing order", { traceId });
 */

/** Header name used to propagate the trace ID through the request chain. */
export const TRACE_ID_HEADER = "x-trace-id";

/**
 * Generate a compact, collision-resistant trace ID.
 *
 * Format: `t-<timestamp_hex>-<random_hex>`
 * Example: `t-18f3a2b1c-4f7a9e2d`
 *
 * Uses `crypto.randomUUID()` where available (Cloudflare Workers, modern Node)
 * and falls back to timestamp + Math.random for older environments.
 */
export function generateTraceId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const ts = Date.now().toString(16);
  const rand = Math.random().toString(16).slice(2, 10);
  return `t-${ts}-${rand}`;
}
