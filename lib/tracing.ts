/**
 * Distributed tracing baseline (R-002 / E3#15).
 *
 * Extends the existing x-trace-id system with W3C Trace Context support.
 * This enables correlation across the Cloudflare Worker → Next.js API
 * boundary and any future external services (OpenTelemetry collectors, etc.).
 *
 * The `traceparent` header format follows the W3C specification:
 *   `00-<trace_id>-<span_id>-<trace_flags>`
 *
 * See: https://www.w3.org/TR/trace-context/
 */

import { logger } from "./logger";

const TRACEPARENT_HEADER = "traceparent";
const TRACESTATE_HEADER = "tracestate";

interface TraceContext {
  traceId: string;
  spanId: string;
  traceFlags: number;
  tracestate: string | null;
}

function randomHex(bytes: number): string {
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const buf = new Uint8Array(bytes);
    crypto.getRandomValues(buf);
    return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
  }
  let result = "";
  for (let i = 0; i < bytes; i++) {
    result += Math.floor(Math.random() * 256)
      .toString(16)
      .padStart(2, "0");
  }
  return result;
}

/**
 * Parse an incoming `traceparent` header or create a new trace context.
 */
export function parseOrCreateTraceContext(request: Request): TraceContext {
  const traceparent = request.headers.get(TRACEPARENT_HEADER);
  const tracestate = request.headers.get(TRACESTATE_HEADER);

  if (traceparent) {
    const parts = traceparent.split("-");
    if (
      parts.length === 4 &&
      parts[0] === "00" &&
      parts[1]!.length === 32 &&
      parts[2]!.length === 16
    ) {
      return {
        traceId: parts[1]!,
        spanId: randomHex(8),
        traceFlags: parseInt(parts[3]!, 16) || 0,
        tracestate,
      };
    }
  }

  return {
    traceId: randomHex(16),
    spanId: randomHex(8),
    traceFlags: 1,
    tracestate: null,
  };
}

/**
 * Format a trace context as a `traceparent` header value.
 */
function formatTraceparent(ctx: TraceContext): string {
  return `00-${ctx.traceId}-${ctx.spanId}-${ctx.traceFlags.toString(16).padStart(2, "0")}`;
}

/**
 * Apply trace context headers to a response.
 * Called from middleware alongside existing x-trace-id.
 */
export function applyTraceHeaders(responseHeaders: Headers, ctx: TraceContext): void {
  responseHeaders.set(TRACEPARENT_HEADER, formatTraceparent(ctx));
  if (ctx.tracestate) {
    responseHeaders.set(TRACESTATE_HEADER, ctx.tracestate);
  }
}

/**
 * RISK-07: Export trace span data for distributed tracing observability.
 *
 * Emits a structured log line for each completed span. Cloudflare Logpush
 * or `wrangler tail` can route these to Jaeger/Zipkin/Honeycomb/Grafana Tempo.
 * Format is compatible with OpenTelemetry JSON log exporter conventions.
 */
export function exportTraceSpan(
  ctx: TraceContext,
  spanName: string,
  durationMs: number,
  attributes: Record<string, string | number> = {},
): void {
  // FR-006: emit through the structured logger so the line participates
  // in level filtering, sampling, and tail-consumer routing. The `_otel`
  // marker remains so OTel-aware collectors can still discriminate span
  // logs from regular log lines.
  logger.info(spanName, {
    _otel: true,
    traceId: ctx.traceId,
    spanId: ctx.spanId,
    spanName,
    durationMs,
    traceFlags: ctx.traceFlags,
    attributes,
  });
}

export type { TraceContext };
