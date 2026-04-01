import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { getSiteById } from "@/config/sites";
import { ACTIVE_SITE_COOKIE } from "@/lib/active-site";
import { checkRateLimit } from "@/lib/rate-limit";
import { IS_SECURE_COOKIE } from "@/lib/cookie-utils";

/** 100 admin API requests per minute per user session (3.30) */
const ADMIN_RATE_LIMIT = { maxRequests: 100, windowMs: 60 * 1000 };

/** POST /api/admin/sites/select — set the active site cookie */
export async function POST(request: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rlKey = `admin:${session.email ?? session.userId ?? "unknown"}`;
  const rl = await checkRateLimit(rlKey, ADMIN_RATE_LIMIT);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please slow down." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } },
    );
  }

  const body = await request.json();
  const { siteId } = body as { siteId?: string };

  if (!siteId || typeof siteId !== "string") {
    return NextResponse.json({ error: "siteId is required" }, { status: 400 });
  }

  const site = getSiteById(siteId);
  if (!site) {
    return NextResponse.json({ error: "Site not found" }, { status: 404 });
  }

  const response = NextResponse.json({ ok: true, site: { id: site.id, name: site.name } });
  response.cookies.set(ACTIVE_SITE_COOKIE, site.id, {
    httpOnly: false, // client-side needs to read this for the site switcher
    secure: IS_SECURE_COOKIE,
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 24 * 365, // 1 year
  });

  return response;
}
