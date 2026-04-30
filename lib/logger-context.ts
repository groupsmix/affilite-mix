/**
 * AUDIT-FIX: Request-scoped logger context helper.
 *
 * Creates a child logger pre-bound with siteId, traceId, and userId
 * extracted from the current request context. This standardizes log
 * output so every log line from a request handler includes correlation
 * fields without the developer having to remember to pass them.
 *
 * Usage in a route handler:
 *
 *   import { requestLogger } from "@/lib/logger-context";
 *
 *   export async function GET(request: NextRequest) {
 *     const log = requestLogger(request);
 *     log.info("Processing request", { extra: "data" });
 *   }
 */

import { logger, type Logger } from "./logger";
import { TRACE_ID_HEADER } from "./trace-id";

/**
 * Create a request-scoped logger with siteId, traceId, and optional
 * userId pre-bound as context fields.
 */
export function requestLogger(
  request: Request,
  extra?: { userId?: string; siteSlug?: string },
): Logger {
  const siteId = (request.headers as Headers).get("x-site-id") ?? undefined;
  const traceId = (request.headers as Headers).get(TRACE_ID_HEADER) ?? undefined;

  return logger.child({
    ...(siteId ? { siteId } : {}),
    ...(traceId ? { traceId } : {}),
    ...(extra?.userId ? { userId: extra.userId } : {}),
    ...(extra?.siteSlug ? { siteSlug: extra.siteSlug } : {}),
  });
}
