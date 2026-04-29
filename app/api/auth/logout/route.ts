import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE_NAME } from "@/lib/auth";
import { ACTIVE_SITE_COOKIE } from "@/lib/active-site";
import { IS_SECURE_COOKIE } from "@/lib/cookie-utils";
import { revokeToken } from "@/lib/jwt-revocation";
import { CSRF_COOKIE } from "@/lib/csrf";

export async function POST() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value;

    if (token) {
      try {
        // Decode without verifying just to get JTI for revocation
        const [, payloadStr] = token.split(".");
        const base64 = payloadStr.replace(/-/g, "+").replace(/_/g, "/");
        const payload = JSON.parse(atob(base64));
        if (payload.jti) {
          await revokeToken(payload.jti);
        }
      } catch (e) {
        // Ignore malformed tokens
      }
    }
  } catch (err) {
    // Tests might run outside Next.js request context where cookies() throws
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: IS_SECURE_COOKIE,
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });

  // Also clear the active site cookie
  response.cookies.set(ACTIVE_SITE_COOKIE, "", {
    httpOnly: false, // Needs to be readable by client JS
    secure: IS_SECURE_COOKIE,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  // T-25: clear the CSRF double-submit cookie too. Leaving it set after
  // logout is mostly cosmetic (the matching JWT cookie is gone, so
  // server-side checks already fail), but a stale `__csrf` cookie is a
  // confusing artefact that complicates incident response — and any
  // future state-changing endpoint that relied on a present cookie
  // alone would inherit a footgun. Clear all auth-adjacent cookies on
  // logout as a single rule.
  response.cookies.set(CSRF_COOKIE, "", {
    httpOnly: false, // matches the issuance posture (client must read it back)
    secure: IS_SECURE_COOKIE,
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });

  return response;
}
