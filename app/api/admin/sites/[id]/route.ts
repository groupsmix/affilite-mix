import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { getSiteRowById, updateSite, deleteSite } from "@/lib/dal/sites";
import { recordAuditEvent } from "@/lib/audit-log";
import { checkRateLimit } from "@/lib/rate-limit";
import { captureException } from "@/lib/sentry";

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

/** GET /api/admin/sites/[id] — get a single site by DB id */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rlError = await enforceRateLimit(session.email, session.userId);
  if (rlError) return rlError;

  const { id } = await params;
  const site = await getSiteRowById(id);
  if (!site) {
    return NextResponse.json({ error: "Site not found" }, { status: 404 });
  }

  return NextResponse.json(site);
}

/** PUT /api/admin/sites/[id] — update a site (super_admin only) */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden: super_admin role required" }, { status: 403 });
  }

  const rlError = await enforceRateLimit(session.email, session.userId);
  if (rlError) return rlError;

  const { id } = await params;
  const existing = await getSiteRowById(id);
  if (!existing) {
    return NextResponse.json({ error: "Site not found" }, { status: 404 });
  }

  const body = await request.json();

  // Build updates object from allowed fields
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
    captureException(err, { context: "[api/admin/sites/[id]] PUT update failed:" });
    const message = err instanceof Error ? err.message : "Failed to update site";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** DELETE /api/admin/sites/[id] — delete a site (super_admin only) */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden: super_admin role required" }, { status: 403 });
  }

  const rlError = await enforceRateLimit(session.email, session.userId);
  if (rlError) return rlError;

  const { id } = await params;

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
    captureException(err, { context: "[api/admin/sites/[id]] DELETE failed:" });
    const message = err instanceof Error ? err.message : "Failed to delete site";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
