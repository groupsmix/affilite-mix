import { NextRequest, NextResponse } from "next/server";

/**
 * H-4: Composable middleware context shared between middleware functions.
 * Each function can read/write to this context to pass data downstream.
 */
export interface MiddlewareContext {
  /** Canonicalized hostname */
  hostname: string;
  /** Request pathname */
  pathname: string;
  /** Resolved site ID (null until site resolution completes) */
  siteId: string | null;
  /** Verified site reference for CORS/CSRF */
  verifiedSite: { slug: string; domain: string; aliases?: string[] } | null;
  /** Trace ID for request correlation */
  traceId: string;
  /** Whether GPC header is set */
  gpcEnabled: boolean;
  /** Recursion depth for self-referential subrequests */
  depth: number;
  /** Abort signal for timeout cancellation */
  signal?: AbortSignal;
}

/**
 * A middleware function that can either:
 * - Return a NextResponse to short-circuit the chain
 * - Return null/undefined to continue to the next middleware
 */
export type MiddlewareFunction = (
  request: NextRequest,
  ctx: MiddlewareContext,
) => Promise<NextResponse | null | undefined> | NextResponse | null | undefined;

/**
 * H-4: Compose multiple middleware functions into a single pipeline.
 * Each function runs in order. If any returns a NextResponse, the chain stops.
 * If all return null, a finalizer function builds the final response.
 */
export function compose(
  middlewares: MiddlewareFunction[],
  finalizer: (request: NextRequest, ctx: MiddlewareContext) => Promise<NextResponse>,
): (request: NextRequest, ctx: MiddlewareContext) => Promise<NextResponse> {
  return async (request: NextRequest, ctx: MiddlewareContext) => {
    for (const mw of middlewares) {
      const result = await mw(request, ctx);
      if (result) return result;
    }
    return finalizer(request, ctx);
  };
}
