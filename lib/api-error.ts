import { NextRequest, NextResponse } from "next/server";
import type { RateLimitResult, RateLimitConfig } from "@/lib/rate-limit";

/**
 * Standardised API error response.
 *
 * Every error returned by our API routes uses this shape so clients can
 * rely on a single `{ error: string; details?: unknown }` contract.
 */
export function apiError(
  status: number,
  message: string,
  details?: unknown,
  headers?: Record<string, string>,
): NextResponse {
  const body: { error: string; details?: unknown } = { error: message };
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
 * Returns the parsed body on success, or a 400 NextResponse on failure.
 */
export async function parseJsonBody(
  request: NextRequest,
): Promise<Record<string, unknown> | NextResponse> {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return apiError(400, "Invalid JSON body");
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
