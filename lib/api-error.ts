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
  | "QUOTA_EXCEEDED";

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
 * R-15: In production, only include `details` when it passes the public
 * error schema check (plain validation-error objects). Arbitrary internal
 * data is stripped to prevent accidental exposure of stack traces,
 * internal IDs, or upstream response bodies.
 */
function isPublicDetails(details: unknown): boolean {
  if (details === null || details === undefined) return false;
  if (typeof details !== "object" || Array.isArray(details)) return false;
  // Allow Record<string, string> (validation errors) through
  return Object.values(details as Record<string, unknown>).every(
    (v) => typeof v === "string" || typeof v === "number" || typeof v === "boolean",
  );
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
  if (details !== undefined) {
    // R-15: Only pass through safe, flat validation detail objects in production.
    // In non-production, always include details for developer convenience.
    if (process.env.NODE_ENV !== "production" || isPublicDetails(details)) {
      body.details = details;
    }
  }
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

/**
 * Safely parse the JSON body of a request.
 * Returns the parsed body on success, or a 400/413 NextResponse on failure.
 *
 * AM-03: Checks Content-Length before calling request.json() to prevent
 * large payloads from consuming memory/CPU before validation.
 */
export async function parseJsonBody(
  request: Request,
): Promise<Record<string, unknown> | NextResponse> {
  const contentLength = request.headers.get("content-length");
  if (contentLength) {
    const len = Number.parseInt(contentLength, 10);
    if (Number.isFinite(len) && len > MAX_JSON_BODY_BYTES) {
      return apiError(413, "Request body too large", undefined, undefined, "PAYLOAD_TOO_LARGE");
    }
  }

  try {
    return (await request.json()) as Record<string, unknown>;
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
