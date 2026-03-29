import { NextResponse } from "next/server";
import { generateCsrfToken, CSRF_COOKIE } from "@/lib/csrf";

/**
 * GET /api/auth/csrf — Issue a CSRF token.
 * Sets the token as an httpOnly cookie and returns it in the response body
 * so clients can attach it as the `x-csrf-token` header on mutations.
 */
export async function GET() {
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
