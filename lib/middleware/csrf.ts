import { NextRequest, NextResponse } from "next/server";
import { validateCsrfToken, CSRF_COOKIE, CSRF_HEADER } from "@/lib/csrf";
import { CRON_PATH_PREFIX } from "@/lib/cron-registry";
import { csrfExemptPaths } from "@/lib/security/csrf-exempt-registry";
import { getAllowedOrigins } from "@/lib/security/allowed-origins";
import type { MiddlewareContext } from "./compose";

const AUTOMATION_PATH_PREFIX = "/api/automation/" as const;

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * H-4: CSRF protection for state-changing API routes.
 * Validates double-submit cookie token for non-safe methods.
 */
export function withCsrf(request: NextRequest, ctx: MiddlewareContext): NextResponse | null {
  const { pathname, verifiedSite } = ctx;

  if (SAFE_METHODS.has(request.method) || !pathname.startsWith("/api/")) {
    return null;
  }

  const origin = request.headers.get("origin") ?? "";
  const allowedOrigins = getAllowedOrigins(verifiedSite);

  // 1. If Origin is present, reject mismatched origins immediately
  if (origin && !allowedOrigins.includes(origin)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  // 2. Validate CSRF double-submit cookie token (unless exempt)
  const isExempt =
    csrfExemptPaths().has(pathname) ||
    pathname.startsWith(CRON_PATH_PREFIX) ||
    pathname.startsWith(AUTOMATION_PATH_PREFIX);

  if (!isExempt) {
    const cookieValue = request.cookies.get(CSRF_COOKIE)?.value;
    const headerValue = request.headers.get(CSRF_HEADER) ?? undefined;
    if (!validateCsrfToken(cookieValue, headerValue)) {
      return new NextResponse("Forbidden – missing CSRF token", { status: 403 });
    }
  }

  return null;
}
