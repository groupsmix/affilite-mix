import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { requireAdmin, assertRole } from "@/lib/admin-guard";
import { getSiteRowById, updateSite, deleteSite } from "@/lib/dal/sites";
import { recordAuditEvent } from "@/lib/audit-log";
import { enforceAdminRateLimit } from "@/lib/admin-rate-limit";
import { captureException } from "@/lib/sentry";
import { requireStepUpAuth } from "@/lib/step-up-auth";
import { parseJsonBody } from "@/lib/api-error";
import { validateAdminUrlFields } from "@/lib/admin-url-guard";
import { getAppCacheKV } from "@/lib/runtime-env";

/** GET /api/admin/sites/[id] — get a single site by DB id */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error, session } = await requireAdmin();
  if (error) return error;
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rlError = await enforceAdminRateLimit("sites", session);
  if (rlError) return rlError;

  const { id } = await params;
  const site = await getSiteRowById(id);
  if (!site) {
    return NextResponse.json({ error: "Site not found" }, { status: 404 });
  }

  return NextResponse.json(site);
}

/** PUT /api/admin/sites/[id] — update a site (super_admin only) */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error, session } = await requireAdmin();
  if (error) return error;
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // G-45: standardised 401 + Bearer challenge instead of 403.
  const roleError = assertRole(session, "super_admin");
  if (roleError) return roleError;

  const rlError = await enforceAdminRateLimit("sites", session);
  if (rlError) return rlError;

  const { id } = await params;
  const existing = await getSiteRowById(id);
  if (!existing) {
    return NextResponse.json({ error: "Site not found" }, { status: 404 });
  }

  const bodyOrError = await parseJsonBody(request);
  if (bodyOrError instanceof NextResponse) return bodyOrError;
  const body = bodyOrError;

  // Build updates object from allowed fields
  const allowedFields = [
    "name",
    "domain",
    "language",
    "direction",
    "is_active",
    "monetization_type",
    "est_revenue_per_click",
    "ad_config",
    "theme",
    "logo_url",
    "favicon_url",
    "nav_items",
    "footer_nav",
    "features",
    "meta_title",
    "meta_description",
    "og_image_url",
    "social_links",
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

  // G-01: SSRF-aware validation of any URL fields being persisted.
  const urlFields: Record<string, string | null | undefined> = {};
  for (const k of ["logo_url", "favicon_url", "og_image_url"] as const) {
    if (updates[k] !== undefined) urlFields[k] = updates[k] as string | null;
  }
  const urlErr = validateAdminUrlFields(urlFields);
  if (urlErr) {
    return NextResponse.json({ error: urlErr.error }, { status: 400 });
  }

  try {
    const site = await updateSite(id, updates);

    // A-024: Purge Next.js ISR + KV caches when site metadata changes or is disabled.
    revalidateTag("sites");
    try {
      const kv = getAppCacheKV();
      if (kv && site) {
        await kv
          .delete(`site-domain:${site.domain}`)
          .catch((e) => captureException(e, { context: "KV cache purge: site-domain" }));
        await kv
          .delete(`site-slug:${site.slug}`)
          .catch((e) => captureException(e, { context: "KV cache purge: site-slug" }));
        await kv
          .delete(`admin-guard:site-slug:${site.slug}`)
          .catch((e) => captureException(e, { context: "KV cache purge: admin-guard" }));
      }
    } catch {
      // fail-open: best-effort [criticality:non-critical]
      // Ignore KV purge errors — cache will expire naturally.
    }

    void recordAuditEvent({
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
  const { error, session } = await requireAdmin();
  if (error) return error;
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // G-45: standardised 401 + Bearer challenge instead of 403.
  const roleError = assertRole(session, "super_admin");
  if (roleError) return roleError;

  // FIX-18 (F-030): Step-up auth required for site deletion.
  const stepUpError = requireStepUpAuth(session);
  if (stepUpError) return stepUpError;

  const rlError = await enforceAdminRateLimit("sites", session);
  if (rlError) return rlError;

  const { id } = await params;

  try {
    // A-024: Purge caches before deletion so stale site data doesn't persist.
    revalidateTag("sites");
    try {
      const kv = getAppCacheKV();
      if (kv) {
        // KV.delete() only accepts exact keys — no wildcard support.
        // Delete the site-specific cache entries using the site ID.
        await kv
          .delete(`site-domain-miss:${id}`)
          .catch((e: unknown) =>
            captureException(e, { context: "KV cache purge: site-domain-miss" }),
          );
        await kv
          .delete(`admin-guard:site-slug:${id}`)
          .catch((e: unknown) => captureException(e, { context: "KV cache purge: admin-guard" }));
      }
    } catch {
      // fail-open: best-effort [criticality:non-critical]
      // Ignore KV purge errors.
    }

    await deleteSite(id);
    void recordAuditEvent({
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
