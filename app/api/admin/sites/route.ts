import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { allSites } from "@/config/sites";
import {
  listSites,
  createSite,
  updateSite,
  deleteSite,
} from "@/lib/dal/sites";
import { recordAuditEvent } from "@/lib/audit-log";
import { checkRateLimit } from "@/lib/rate-limit";

/** 100 admin API requests per minute per user session (3.30) */
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

/** GET /api/admin/sites — list all available sites (DB-first, config fallback) */
export async function GET() {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rlError = await enforceRateLimit(session.email, session.userId);
  if (rlError) return rlError;

  // Try DB first — returns full SiteRow data with all fields
  let dbSites: {
    id: string; slug: string; name: string; domain: string;
    language: string; direction: string; is_active: boolean;
    monetization_type: string; est_revenue_per_click: number;
    theme: Record<string, unknown>; features: Record<string, boolean>;
    meta_title: string | null; meta_description: string | null;
    source: "database"; db_id: string; created_at: string;
  }[] = [];
  try {
    const rows = await listSites();
    dbSites = rows.map((r) => ({
      id: r.slug,
      slug: r.slug,
      name: r.name,
      domain: r.domain,
      language: r.language,
      direction: r.direction,
      is_active: r.is_active,
      monetization_type: r.monetization_type,
      est_revenue_per_click: r.est_revenue_per_click,
      theme: r.theme,
      features: r.features,
      meta_title: r.meta_title,
      meta_description: r.meta_description,
      source: "database" as const,
      created_at: r.created_at,
      db_id: r.id,
    }));
  } catch {
    // DB might not be reachable; fall back to config-only
  }

  // Config fallback for sites not in DB
  const configSites = allSites.map((s) => ({
    id: s.id,
    name: s.name,
    domain: s.domain,
    language: s.language,
    direction: s.direction,
    source: "config" as const,
  }));

  const dbSlugs = new Set(dbSites.map((s) => s.id));
  const mergedSites = [
    ...dbSites,
    ...configSites.filter((s) => !dbSlugs.has(s.id)),
  ];

  return NextResponse.json({ sites: mergedSites });
}

/** POST /api/admin/sites — create a new site (super_admin only) */
export async function POST(request: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden: super_admin role required" }, { status: 403 });
  }

  const rlError = await enforceRateLimit(session.email, session.userId);
  if (rlError) return rlError;

  const body = await request.json();
  const { slug, name, domain } = body as {
    slug?: string;
    name?: string;
    domain?: string;
  };

  if (!slug || !name || !domain) {
    return NextResponse.json(
      { error: "slug, name, and domain are required" },
      { status: 400 },
    );
  }

  if (!/^[a-z0-9-]+$/.test(slug)) {
    return NextResponse.json(
      { error: "slug must be lowercase alphanumeric with hyphens only" },
      { status: 400 },
    );
  }

  try {
    const site = await createSite({
      slug,
      name,
      domain,
      language: body.language,
      direction: body.direction,
      is_active: body.is_active,
      monetization_type: body.monetization_type,
      est_revenue_per_click: body.est_revenue_per_click,
      ad_config: body.ad_config,
      theme: body.theme,
      logo_url: body.logo_url,
      favicon_url: body.favicon_url,
      nav_items: body.nav_items,
      footer_nav: body.footer_nav,
      features: body.features,
      meta_title: body.meta_title,
      meta_description: body.meta_description,
      og_image_url: body.og_image_url,
      social_links: body.social_links,
      custom_css: body.custom_css,
    });
    recordAuditEvent({
      site_id: site.id,
      actor: session.email ?? "admin",
      action: "create",
      entity_type: "site",
      entity_id: site.id,
      details: { slug, name, domain },
    });
    return NextResponse.json(site, { status: 201 });
  } catch (err) {
    console.error("[api/admin/sites] POST create failed:", err);
    const message = err instanceof Error ? err.message : "Failed to create site";
    if (message.includes("duplicate") || message.includes("unique")) {
      return NextResponse.json({ error: "A site with this slug or domain already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** PATCH /api/admin/sites — update an existing site (super_admin only) */
export async function PATCH(request: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden: super_admin role required" }, { status: 403 });
  }

  const rlError = await enforceRateLimit(session.email, session.userId);
  if (rlError) return rlError;

  const body = await request.json();
  const { id } = body as { id?: string };

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  // Build updates from all allowed fields
  const allowedFields = [
    "name", "domain", "language", "direction", "is_active",
    "monetization_type", "est_revenue_per_click", "ad_config",
    "theme", "logo_url", "favicon_url",
    "nav_items", "footer_nav",
    "features",
    "meta_title", "meta_description", "og_image_url",
    "social_links", "custom_css",
  ] as const;

  const updates: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      updates[field] = body[field];
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  try {
    const site = await updateSite(id, updates);
    recordAuditEvent({
      site_id: id,
      actor: session.email ?? "admin",
      action: "update",
      entity_type: "site",
      entity_id: id,
      details: updates as Record<string, unknown>,
    });
    return NextResponse.json(site);
  } catch (err) {
    console.error("[api/admin/sites] PATCH update failed:", err);
    const message = err instanceof Error ? err.message : "Failed to update site";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** DELETE /api/admin/sites — delete a site (super_admin only) */
export async function DELETE(request: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden: super_admin role required" }, { status: 403 });
  }

  const rlError = await enforceRateLimit(session.email, session.userId);
  if (rlError) return rlError;

  const { searchParams } = request.nextUrl;
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  try {
    await deleteSite(id);
    recordAuditEvent({
      site_id: id,
      actor: session.email ?? "admin",
      action: "delete",
      entity_type: "site",
      entity_id: id,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/admin/sites] DELETE failed:", err);
    const message = err instanceof Error ? err.message : "Failed to delete site";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
