import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { getSiteById } from "@/config/sites";
import { ACTIVE_SITE_COOKIE } from "@/lib/active-site";

/** POST /api/admin/sites/select — set the active site cookie */
export async function POST(request: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { siteId } = body as { siteId?: string };

  if (!siteId || typeof siteId !== "string") {
    return NextResponse.json(
      { error: "siteId is required" },
      { status: 400 },
    );
  }

  const site = getSiteById(siteId);
  if (!site) {
    return NextResponse.json(
      { error: "Site not found" },
      { status: 404 },
    );
  }

  const response = NextResponse.json({ ok: true, site: { id: site.id, name: site.name } });
  response.cookies.set(ACTIVE_SITE_COOKIE, site.id, {
    httpOnly: false, // client-side needs to read this for the site switcher
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 24 * 365, // 1 year
  });

  return response;
}
