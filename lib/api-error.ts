import { NextResponse } from "next/server";
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
  request: Request,
): Promise<Record<string, unknown> | NextResponse> {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return apiError(400, "Invalid JSON body");
  }
}

/**
 * Safely parse the JSON body of a request with a maximum size limit.
 * F-005/F-006: Enforces body size caps on CSRF-exempt and public routes.
 *
 * @param request - The incoming request
 * @param maxBytes - Maximum allowed body size in bytes (default 64KB)
 * @returns Parsed body, or a 413/400 NextResponse on failure
 */
export async function parseJsonBodyWithLimit(
  request: Request,
  maxBytes: number = 64 * 1024, // Default 64KB
): Promise<Record<string, unknown> | NextResponse> {
  // Check Content-Length header if present
  const contentLength = request.headers.get("content-length");
  if (contentLength) {
    const length = parseInt(contentLength, 10);
    if (!isNaN(length) && length > maxBytes) {
      return apiError(413, "Payload Too Large", { maxBytes, received: length });
    }
  }

  // Read body with size enforcement
  try {
    const reader = request.body?.getReader();
    if (!reader) {
      // No body - try to parse as empty JSON
      return {};
    }

    const chunks: Uint8Array[] = [];
    let totalLength = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      totalLength += value.length;
      if (totalLength > maxBytes) {
        reader.cancel();
        return apiError(413, "Payload Too Large", { maxBytes, received: totalLength });
      }
      chunks.push(value);
    }

    // Concatenate chunks
    const body = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.length;
    }

    const text = new TextDecoder().decode(body);
    return JSON.parse(text) as Record<string, unknown>;
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
