import { NextRequest, NextResponse } from "next/server";
import { validateCsrfToken, CSRF_COOKIE, CSRF_HEADER } from "@/lib/csrf";
import { CRON_PATH_PREFIX } from "@/lib/cron-registry";
import { csrfExemptPaths } from "@/lib/security/csrf-exempt-registry";
import { getAllowedOrigins } from "@/lib/security/allowed-origins";
import type { MiddlewareContext } from "./compose";

/** Admin session cookie names (prefixed in secure contexts, plain in dev). */
const ADMIN_COOKIE_NAME = "__Host-nh_admin_token";
const LEGACY_ADMIN_COOKIE_NAME = "nh_admin_token";

const AUTOMATION_PATH_PREFIX = "/api/automation/" as const;

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * A request authenticated purely by `Authorization: Bearer` carries no ambient
 * credential: a browser never attaches that header to a cross-site request, so
 * the double-submit token protects nothing here. Requests that also carry an
 * admin session cookie stay under CSRF enforcement, so an attacker cannot
 * disarm it by appending an Authorization header to a cookie-authenticated
 * victim request.
 */
function isBearerOnlyRequest(request: NextRequest): boolean {
  const authorization = request.headers.get("authorization");
  if (!authorization || !/^Bearer\s+\S+$/i.test(authorization.trim())) return false;

  return !request.cookies.get(ADMIN_COOKIE_NAME) && !request.cookies.get(LEGACY_ADMIN_COOKIE_NAME);
}

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
    pathname.startsWith(AUTOMATION_PATH_PREFIX) ||
    isBearerOnlyRequest(request);

  if (!isExempt) {
    const cookieValue = request.cookies.get(CSRF_COOKIE)?.value;
    const headerValue = request.headers.get(CSRF_HEADER) ?? undefined;
    if (!validateCsrfToken(cookieValue, headerValue)) {
      return new NextResponse("Forbidden – missing CSRF token", { status: 403 });
    }
  }

  return null;
}
