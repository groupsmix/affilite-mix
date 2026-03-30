import { NextResponse } from "next/server";
import { getAdminSession, createToken, COOKIE_NAME } from "@/lib/auth";

/**
 * POST /api/auth/refresh
 * Re-issues the admin JWT if the current one is still valid.
 * Called periodically from the admin layout to prevent silent
 * logout during long editing sessions (24-hour token expiry).
 */
export async function POST() {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const token = await createToken(session);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 24, // 24 hours
  });

  return response;
}
