import { NextRequest, NextResponse } from "next/server";
import { generateCsrfToken, CSRF_COOKIE } from "@/lib/csrf";
import { IS_SECURE_COOKIE } from "@/lib/cookie-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/get-client-ip";
import { apiError } from "@/lib/api-error";

/**
 * GET /api/auth/csrf — Issue a CSRF token (double-submit cookie pattern).
 *
 * SEC-CSRF-01 (#629): Rate-limited to 30 req/min per IP to prevent
 * token-generation abuse and entropy exhaustion.
 */
export async function GET(request: NextRequest) {
  const ip = getClientIp(request);
  const rl = await checkRateLimit(`csrf-token:${ip}`, {
    maxRequests: 30,
    windowMs: 60_000,
    failPolicy: "grace" as const,
  });
  if (!rl.allowed) {
    return apiError(
      429,
      "Too many requests",
      undefined,
      { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) },
      "RATE_LIMITED",
    );
  }

  const token = generateCsrfToken();

  const response = NextResponse.json({ csrfToken: token });
  // F-028: The CSRF cookie is httpOnly: true by design.
  // The double-submit pattern works here because the frontend reads the token
  // from the JSON response body, not from `document.cookie`.
  // Do NOT change this to httpOnly: false, as it would expose the token to XSS.
  response.cookies.set(CSRF_COOKIE, token, {
    httpOnly: true,
    secure: IS_SECURE_COOKIE,
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 4, // 4 hours
  });

  return response;
}
