import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { getActiveSiteSlug } from "@/lib/active-site";
import { resolveDbSiteId } from "@/lib/dal/site-resolver";
import { listPages, createPage } from "@/lib/dal/pages";
import { checkRateLimit } from "@/lib/rate-limit";

/** 100 admin API requests per minute per user session */
const ADMIN_RATE_LIMIT = { maxRequests: 100, windowMs: 60 * 1000 };

async function enforceRateLimit(email: string | undefined, userId: string | undefined) {
  const key = `admin:${email ?? userId ?? "unknown"}`;
  const rl = await checkRateLimit(key, ADMIN_RATE_LIMIT);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please slow down." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } },
    );
  }
  return null;
}

/**
 * GET /api/admin/pages  — list all pages for the current site
 */
export async function GET() {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rlError = await enforceRateLimit(session.email, session.userId);
  if (rlError) return rlError;

  const siteSlug = await getActiveSiteSlug();
  if (!siteSlug) {
    return NextResponse.json({ error: "No active site selected" }, { status: 400 });
  }

  try {
    const siteId = await resolveDbSiteId(siteSlug);
    const pages = await listPages(siteId);
    return NextResponse.json(pages);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/admin/pages  — create a new page
 * Body: { slug, title, body, is_published?, sort_order? }
 */
export async function POST(request: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rlError = await enforceRateLimit(session.email, session.userId);
  if (rlError) return rlError;

  const siteSlug = await getActiveSiteSlug();
  if (!siteSlug) {
    return NextResponse.json({ error: "No active site selected" }, { status: 400 });
  }

  try {
    const siteId = await resolveDbSiteId(siteSlug);
    const body = await request.json();

    if (!body.slug || !body.title) {
      return NextResponse.json({ error: "slug and title are required" }, { status: 400 });
    }

    const page = await createPage({
      site_id: siteId,
      slug: body.slug,
      title: body.title,
      body: body.body ?? "",
      is_published: body.is_published ?? false,
      sort_order: body.sort_order ?? 0,
    });

    return NextResponse.json(page, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
