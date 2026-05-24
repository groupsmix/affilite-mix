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
  if (details !== undefined) body.details = details;
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
/**
 * Safely parse the JSON body of a request.
 * Returns the parsed body on success, or a 400/413 NextResponse on failure.
 *
 * A100-12: Enforces per-endpoint body size limit as defense-in-depth
 * independent of the middleware Content-Length check.
 */
export async function parseJsonBody(
  request: Request,
  options?: { maxBodyBytes?: number },
): Promise<Record<string, unknown> | NextResponse> {
  const maxBytes = options?.maxBodyBytes ?? 100 * 1024; // 100KB default per A100-17
  try {
    const text = await request.text();
    if (text.length > maxBytes) {
      return apiError(413, "Request body too large", undefined, undefined, "PAYLOAD_TOO_LARGE");
    }
    return JSON.parse(text) as Record<string, unknown>;
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
