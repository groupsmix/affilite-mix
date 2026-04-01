import { NextResponse } from "next/server";
import { COOKIE_NAME } from "@/lib/auth";
import { ACTIVE_SITE_COOKIE } from "@/lib/active-site";
import { IS_SECURE_COOKIE } from "@/lib/cookie-utils";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: IS_SECURE_COOKIE,
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
  response.cookies.set(ACTIVE_SITE_COOKIE, "", {
    httpOnly: true,
    secure: IS_SECURE_COOKIE,
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
  return response;
}
