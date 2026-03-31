import { NextResponse } from "next/server";
import { generateCsrfToken, CSRF_COOKIE } from "@/lib/csrf";

/** GET /api/auth/csrf — Issue a CSRF token (double-submit cookie pattern) */
export async function GET() {
  return issueCsrfToken();
}

/**
 * Issue (or rotate) a CSRF token.
 * Exported so that middleware can call it after every state-changing request
 * to implement token rotation for defence-in-depth.
 */
export function issueCsrfToken(): NextResponse {
  const token = generateCsrfToken();

  const response = NextResponse.json({ csrfToken: token });
  response.cookies.set(CSRF_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 4, // 4 hours
  });

  return response;
}
