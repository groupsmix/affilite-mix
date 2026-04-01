import { NextResponse } from "next/server";
import { generateCsrfToken, CSRF_COOKIE } from "@/lib/csrf";
import { IS_SECURE_COOKIE } from "@/lib/cookie-utils";

/** GET /api/auth/csrf — Issue a CSRF token (double-submit cookie pattern) */
export async function GET() {
  const token = generateCsrfToken();

  const response = NextResponse.json({ csrfToken: token });
  response.cookies.set(CSRF_COOKIE, token, {
    httpOnly: true,
    secure: IS_SECURE_COOKIE,
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 4, // 4 hours
  });

  return response;
}
