/**
 * Shared API route wrapper.
 *
 * Wrapping an App Router `route.ts` handler with `withApiHandler` gives
 * it three things for free:
 *
 *   1. A request-scoped correlation ID.  Generated via crypto.randomUUID()
 *      or pulled from an inbound `x-request-id` header, then echoed back
 *      on the response so a client can correlate a failure with the
 *      server-side log line.
 *   2. Structured logging via `logger.child({ requestId, route })` —
 *      every log line emitted inside the handler is automatically tagged
 *      with the correlation ID.
 *   3. A catch-all that forwards uncaught exceptions to Sentry
 *      (`captureException`) and returns a generic 500 response with the
 *      same correlation ID so bug reports are actionable.
 *
 * Routes that need a custom error shape can still return NextResponse
 * directly — the wrapper only intervenes when the handler throws.
 */

import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-error";
import { captureException } from "@/lib/sentry";
import { logger, type Logger } from "@/lib/logger";

export interface ApiHandlerContext {
  /** Per-request correlation ID. */
  requestId: string;
  /** Structured logger scoped to { requestId, route }. */
  log: Logger;
}

type RouteHandler<TParams = unknown> = (
  request: NextRequest,
  ctx: { params?: TParams } & ApiHandlerContext,
) => Promise<Response> | Response;

interface Options {
  /** Route label included in every log line (e.g. "api/track/click"). */
  route: string;
}

function newRequestId(request: NextRequest): string {
  const inbound = request.headers.get("x-request-id");
  if (inbound && /^[\w.-]{8,128}$/.test(inbound)) return inbound;
  // Workers expose crypto.randomUUID globally.
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function attachRequestId(response: Response, requestId: string): Response {
  // Response headers are immutable on some runtimes — copy in that case.
  if (response.headers && typeof response.headers.set === "function") {
    try {
      response.headers.set("x-request-id", requestId);
      return response;
    } catch {
      /* fallthrough */
    }
  }
  const headers = new Headers(response.headers);
  headers.set("x-request-id", requestId);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * Wrap a Next.js App Router handler so it gets a correlation ID,
 * structured logging, and automatic Sentry reporting on throw.
 */
export function withApiHandler<TParams = unknown>(
  handler: RouteHandler<TParams>,
  options: Options,
): (request: NextRequest, routeCtx?: { params?: TParams }) => Promise<Response> {
  return async (request, routeCtx) => {
    const requestId = newRequestId(request);
    const log = logger.child({ requestId, route: options.route });

    try {
      const result = await handler(request, {
        ...(routeCtx ?? {}),
        requestId,
        log,
      });
      return attachRequestId(result, requestId);
    } catch (err) {
      captureException(err, { route: options.route, requestId });
      log.error("unhandled_exception", {
        err: err instanceof Error ? err : String(err),
      });
      return attachRequestId(apiError(500, "Internal server error", { requestId }), requestId);
    }
  };
}
