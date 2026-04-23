import { NextResponse } from "next/server";
import { COOKIE_NAME } from "@/lib/auth";
import { ACTIVE_SITE_COOKIE } from "@/lib/active-site";
import { IS_SECURE_COOKIE, getCookieDomain } from "@/lib/cookie-utils";
import { headers } from "next/headers";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  const host = (await headers()).get("host");
  const domain = getCookieDomain(host ?? undefined);
  response.cookies.set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: IS_SECURE_COOKIE,
    sameSite: "strict",
    path: "/",
    maxAge: 0,
    domain,
  });
  response.cookies.set(ACTIVE_SITE_COOKIE, "", {
    httpOnly: true,
    secure: IS_SECURE_COOKIE,
    sameSite: "strict",
    path: "/",
    maxAge: 0,
    domain,
  });
  return response;
}
