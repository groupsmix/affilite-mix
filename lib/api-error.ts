import { NextResponse } from "next/server";
import type { RateLimitResult, RateLimitConfig } from "@/lib/rate-limit";

/**
 * Standardised error codes for programmatic error handling.
 *
 * AUDIT-FIX: Previously API errors returned only a plain-English `error`
 * string, forcing clients to parse free-text messages to distinguish error
 * types. Adding a machine-readable `code` field lets clients switch on a
 * stable enum value while the human-readable `error` message can evolve.
 */
export type ApiErrorCode =
  | "BAD_REQUEST"
  | "INVALID_JSON"
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "CSRF_FAILED"
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "CONFLICT"
  | "PAYLOAD_TOO_LARGE"
  | "SERVICE_UNAVAILABLE"
  | "INTERNAL_ERROR"
  | "CAPTCHA_FAILED"
  | "TOTP_REQUIRED"
  | "QUOTA_EXCEEDED"
  | "COMMISSION_INGEST_ALL_NETWORKS_FAILED";

/** Map HTTP status codes to default error codes when no explicit code is given. */
function defaultCodeForStatus(status: number): ApiErrorCode {
  switch (status) {
    case 400:
      return "BAD_REQUEST";
    case 401:
      return "UNAUTHORIZED";
    case 403:
      return "FORBIDDEN";
    case 404:
      return "NOT_FOUND";
    case 409:
      return "CONFLICT";
    case 413:
      return "PAYLOAD_TOO_LARGE";
    case 429:
      return "RATE_LIMITED";
    case 503:
      return "SERVICE_UNAVAILABLE";
    default:
      return "INTERNAL_ERROR";
  }
}

/**
 * Standardised API error response.
 *
 * Every error returned by our API routes uses this shape so clients can
 * rely on a single `{ error: string; code: string; details?: unknown }` contract.
 *
 * The optional `code` parameter lets callers supply a specific error code;
 * when omitted, a sensible default is inferred from the HTTP status.
 */
/**
 * F-10: Redact potentially sensitive details before including in client responses.
 * Only allow primitive values and arrays of primitives. Strips anything that
 * looks like a stack trace, upstream error message, or nested object.
 */
function redactDetails(details: unknown): unknown {
  if (details === null || details === undefined) return undefined;
  if (typeof details === "string") {
    // Strip stack traces and internal paths
    if (details.includes("\n    at ") || details.includes("/node_modules/")) {
      return "Internal error details redacted";
    }
    return details.length > 500 ? details.slice(0, 500) + "…" : details;
  }
  if (typeof details === "number" || typeof details === "boolean") return details;
  if (Array.isArray(details)) {
    // Only allow arrays of strings (e.g. validation error lists)
    return details
      .filter((item): item is string => typeof item === "string")
      .map((s) => (s.length > 200 ? s.slice(0, 200) + "…" : s));
  }
  if (typeof details === "object") {
    // Allow flat objects with string/number values (validation errors)
    const safe: Record<string, string | number> = {};
    for (const [key, val] of Object.entries(details as Record<string, unknown>)) {
      if (typeof val === "string") {
        safe[key] = val.length > 200 ? val.slice(0, 200) + "…" : val;
      } else if (typeof val === "number") {
        safe[key] = val;
      }
      // Skip nested objects, functions, etc.
    }
    return Object.keys(safe).length > 0 ? safe : undefined;
  }
  return undefined;
}

export function apiError(
  status: number,
  message: string,
  details?: unknown,
  headers?: Record<string, string>,
  code?: ApiErrorCode,
): NextResponse {
  const body: { error: string; code: ApiErrorCode; details?: unknown } = {
    error: message,
    code: code ?? defaultCodeForStatus(status),
  };
  // F-10: Redact details to prevent leaking upstream diagnostics
  const redacted = redactDetails(details);
  if (redacted !== undefined) body.details = redacted;
  return NextResponse.json(body, { status, headers });
}

/**
 * Build standard rate-limit response headers.
 *
 * Returns headers that inform the client about their current rate-limit
 * window so legitimate integrators and debugging tools can adjust their
 * request cadence.
 *
 *   X-RateLimit-Limit     — max requests allowed in the window
 *   X-RateLimit-Remaining — requests remaining in the current window
 *   X-RateLimit-Reset     — Unix epoch (seconds) when the window resets
 */
/** Maximum JSON body size (1 MB). Reject before parsing to prevent memory exhaustion. */
const MAX_JSON_BODY_BYTES = 1_048_576;
/** A77-F1: Maximum nesting depth for parsed JSON to prevent stack overflow. */
const MAX_JSON_DEPTH = 20;

/**
 * Safely parse the JSON body of a request.
 * Returns the parsed body on success, or a 400/413 NextResponse on failure.
 *
 * RC-RECHECK-01: Always streams the body with a byte cap regardless of whether
 * Content-Length is present. This prevents oversized payloads from being parsed
 * even when Content-Length is missing, spoofed, or chunked-encoded.
 */
export async function parseJsonBody(
  request: Request,
): Promise<Record<string, unknown> | NextResponse> {
  const contentLength = request.headers.get("content-length");

  if (contentLength) {
    const len = Number.parseInt(contentLength, 10);
    if (!Number.isFinite(len) || len > MAX_JSON_BODY_BYTES) {
      return apiError(413, "Request body too large", undefined, undefined, "PAYLOAD_TOO_LARGE");
    }
  }

  if (!request.body) {
    return apiError(400, "Invalid JSON body", undefined, undefined, "INVALID_JSON");
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    received += value.byteLength;
    if (received > MAX_JSON_BODY_BYTES) {
      void reader.cancel();
      return apiError(413, "Request body too large", undefined, undefined, "PAYLOAD_TOO_LARGE");
    }

    chunks.push(value);
  }

  const body = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    const text = new TextDecoder().decode(body);

    // A77-F1: Pre-parse depth check — scan for maximum nesting of { / [
    // to reject pathologically nested payloads before JSON.parse can
    // stack-overflow.
    let depth = 0;
    let maxDepth = 0;
    let inString = false;
    let escaped = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = inString;
        continue;
      }
      if (ch === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (ch === "{" || ch === "[") {
        depth++;
        if (depth > maxDepth) maxDepth = depth;
        if (maxDepth > MAX_JSON_DEPTH) {
          return apiError(400, "JSON nesting too deep", undefined, undefined, "INVALID_JSON");
        }
      } else if (ch === "}" || ch === "]") {
        depth--;
      }
    }

    const parsed = JSON.parse(text);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return apiError(400, "Invalid JSON body", undefined, undefined, "INVALID_JSON");
    }
    return parsed as Record<string, unknown>;
  } catch {
    return apiError(400, "Invalid JSON body", undefined, undefined, "INVALID_JSON");
  }
}

export function rateLimitHeaders(
  config: RateLimitConfig,
  result: RateLimitResult,
): Record<string, string> {
  const resetEpoch = Math.ceil(
    (Date.now() + (result.retryAfterMs > 0 ? result.retryAfterMs : config.windowMs)) / 1000,
  );

  return {
    "X-RateLimit-Limit": String(config.maxRequests),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(resetEpoch),
  };
}
