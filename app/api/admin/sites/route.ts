import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession, assertRole } from "@/lib/admin-guard";
import { getSiteById, toSiteRow } from "@/config/sites";
import {
  listSites,
  createSite,
  updateSite,
  deleteSite,
  getSiteRowById,
  upsertConfigSite,
} from "@/lib/dal/sites";
import { listAdminSiteMemberships } from "@/lib/dal/admin-site-memberships";
import { getPrivilegedSupabaseClient } from "@/lib/server-only/service-role"; // nosemgrep: service-role-import
import { recordAuditEvent } from "@/lib/audit-log";
import { enforceAdminRateLimit } from "@/lib/admin-rate-limit";
import { captureException } from "@/lib/sentry";
import { parseJsonBody } from "@/lib/api-error";
import { validateAdminUrlFields } from "@/lib/admin-url-guard";
import { buildAdminSiteRegistry, isStaticConfigSiteSlug } from "@/lib/site-config-authority";
import type { SiteRow } from "@/types/database";

/** GET /api/admin/sites — list all available sites (super_admin: all, admin: membership-filtered) */
export async function GET() {
  try {
    // Use requireAdminSession() (no site context) because this endpoint must
    // work BEFORE a site is selected (chicken-and-egg: you need to list sites
    // to select one, but requireAdmin() demands a site cookie).
    const { error, session } = await requireAdminSession();
    if (error) return error;
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const rlError = await enforceAdminRateLimit("sites", session);
    if (rlError) return rlError;

    // Non-super_admin users only see sites they have membership for
    let allowedSiteIds: Set<string> | null = null;
    if (session.role !== "super_admin" && session.userId) {
      // admin_site_memberships table requires service_role (RLS restricted)
      const privilegedGetter = () => getPrivilegedSupabaseClient("admin-sites-list");
      const memberships = await listAdminSiteMemberships(session.userId, privilegedGetter);
      allowedSiteIds = new Set(memberships.map((m) => m.site_id));
    }

    let dbSites: SiteRow[] = [];
    try {
      dbSites = await listSites(() => getPrivilegedSupabaseClient("admin-sites-list"));
    } catch {
      // fail-open: best-effort [criticality:non-critical]
      // DB might not be reachable; fall back to config-only
    }

    let mergedSites = buildAdminSiteRegistry(dbSites);

    // Filter to membership-allowed sites for non-super_admin users
    if (allowedSiteIds) {
      mergedSites = mergedSites.filter((s) => allowedSiteIds.has(s.db_id ?? s.id));
    }

    return NextResponse.json({ sites: mergedSites });
  } catch (err) {
    captureException(err, { context: "admin-sites-get" });
    return NextResponse.json({ error: "Internal error listing sites" }, { status: 500 });
  }
}

/** POST /api/admin/sites — create a new site (super_admin only) */
export async function POST(request: NextRequest) {
  // Use requireAdminSession() (no site context) — same reason as GET above:
  // site management endpoints must be callable when no site cookie is set,
  // e.g. when creating the very first site or after clearing the active site.
  const { error, session } = await requireAdminSession();
  if (error) return error;
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // G-45: standardised 401 + Bearer challenge instead of 403.
  const roleError = assertRole(session, "super_admin");
  if (roleError) return roleError;

  const rlError = await enforceAdminRateLimit("sites", session);
  if (rlError) return rlError;

  const bodyOrError = await parseJsonBody(request);
  if (bodyOrError instanceof NextResponse) return bodyOrError;
  const body = bodyOrError;
  const { slug, name, domain } = body as {
    slug?: string;
    name?: string;
    domain?: string;
  };

  if (!slug || !name || !domain) {
    return NextResponse.json({ error: "slug, name, and domain are required" }, { status: 400 });
  }

  if (slug.length > 128) {
    return NextResponse.json({ error: "slug too long (max 128 chars)" }, { status: 400 });
  }
  if (name.length > 256) {
    return NextResponse.json({ error: "name too long (max 256 chars)" }, { status: 400 });
  }
  if (domain.length > 256) {
    return NextResponse.json({ error: "domain too long (max 256 chars)" }, { status: 400 });
  }

  if (!/^[a-z0-9-]+$/.test(slug)) {
    return NextResponse.json(
      { error: "slug must be lowercase alphanumeric with hyphens only" },
      { status: 400 },
    );
  }

  // G-01: validate URL-typed fields before persisting a new site row.
  const createUrlErr = validateAdminUrlFields({
    logo_url: body.logo_url as string | null | undefined,
    favicon_url: body.favicon_url as string | null | undefined,
    og_image_url: body.og_image_url as string | null | undefined,
  });
  if (createUrlErr) {
    return NextResponse.json({ error: createUrlErr.error }, { status: 400 });
  }

  try {
    const createPrivileged = () => getPrivilegedSupabaseClient("admin-sites-create");
    const configSite = getSiteById(slug);
    if (configSite && (name !== configSite.name || domain !== configSite.domain)) {
      return NextResponse.json(
        { error: "Static-config site identity must match config/sites" },
        { status: 409 },
      );
    }

    const site = configSite
      ? await upsertConfigSite(toSiteRow(configSite), createPrivileged)
      : await createSite(
          {
            slug,
            name,
            domain,
            language: body.language as string | undefined,
            direction: body.direction as "ltr" | "rtl" | undefined,
            is_active: body.is_active as boolean | undefined,
            monetization_type: body.monetization_type as "affiliate" | "ads" | "both" | undefined,
            est_revenue_per_click: body.est_revenue_per_click as number | undefined,
            ad_config: body.ad_config as Record<string, unknown> | undefined,
            theme: body.theme as Record<string, unknown> | undefined,
            logo_url: body.logo_url as string | null | undefined,
            favicon_url: body.favicon_url as string | null | undefined,
            nav_items: body.nav_items as
              | { label: string; href: string; icon?: string }[]
              | undefined,
            footer_nav: body.footer_nav as
              | { label: string; href: string; icon?: string }[]
              | undefined,
            features: body.features as Record<string, boolean> | undefined,
            meta_title: body.meta_title as string | null | undefined,
            meta_description: body.meta_description as string | null | undefined,
            og_image_url: body.og_image_url as string | null | undefined,
            social_links: body.social_links as Record<string, string> | undefined,
            homepage_template: body.homepage_template as
              | "standard"
              | "cinematic"
              | "minimal"
              | "editorial"
              | "top10"
              | "compare"
              | undefined,
            product_card_style: body.product_card_style as
              | "standard"
              | "compact"
              | "detailed"
              | undefined,
          },
          createPrivileged,
        );
    void recordAuditEvent({
      site_id: site.id,
      actor: session.email ?? "admin",
      action: "create",
      entity_type: "site",
      entity_id: site.id,
      details: { slug, name, domain },
    });
    return NextResponse.json(site, { status: 201 });
  } catch (err) {
    captureException(err, { context: "[api/admin/sites] POST create failed:" });
    const rawMsg = err instanceof Error ? err.message : "";
    if (rawMsg.includes("duplicate") || rawMsg.includes("unique")) {
      return NextResponse.json(
        { error: "A site with this slug or domain already exists" },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: "Failed to create site" }, { status: 500 });
  }
}

/** PATCH /api/admin/sites — update an existing site (super_admin only) */
export async function PATCH(request: NextRequest) {
  // Use requireAdminSession() — site management does not need an active site cookie.
  const { error, session } = await requireAdminSession();
  if (error) return error;
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // G-45: standardised 401 + Bearer challenge instead of 403.
  const roleError = assertRole(session, "super_admin");
  if (roleError) return roleError;

  const rlError = await enforceAdminRateLimit("sites", session);
  if (rlError) return rlError;

  const patchBodyOrError = await parseJsonBody(request);
  if (patchBodyOrError instanceof NextResponse) return patchBodyOrError;
  const body = patchBodyOrError;
  const { id } = body as { id?: string };

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  // Build updates from all allowed fields
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
    "homepage_template",
    "product_card_style",
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

  // G-01: validate any URL-typed fields being updated.
  const urlFields: Record<string, string | null | undefined> = {};
  for (const k of ["logo_url", "favicon_url", "og_image_url"] as const) {
    if (updates[k] !== undefined) urlFields[k] = updates[k] as string | null;
  }
  const updateUrlErr = validateAdminUrlFields(urlFields);
  if (updateUrlErr) {
    return NextResponse.json({ error: updateUrlErr.error }, { status: 400 });
  }

  try {
    const updatePrivileged = () => getPrivilegedSupabaseClient("admin-sites-update");
    const existing = await getSiteRowById(id, updatePrivileged);
    if (!existing) {
      return NextResponse.json({ error: "Site not found" }, { status: 404 });
    }
    if (isStaticConfigSiteSlug(existing.slug)) {
      return NextResponse.json(
        { error: "Static-config sites are read-only in the admin API" },
        { status: 409 },
      );
    }
    const site = await updateSite(id, updates, updatePrivileged);
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
    captureException(err, { context: "[api/admin/sites] PATCH update failed:" });
    return NextResponse.json({ error: "Failed to update site" }, { status: 500 });
  }
}

/** DELETE /api/admin/sites — delete a site (super_admin only) */
export async function DELETE(request: NextRequest) {
  // Use requireAdminSession() — site management does not need an active site cookie.
  const { error, session } = await requireAdminSession();
  if (error) return error;
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // G-45: standardised 401 + Bearer challenge instead of 403.
  const roleError = assertRole(session, "super_admin");
  if (roleError) return roleError;

  const rlError = await enforceAdminRateLimit("sites", session);
  if (rlError) return rlError;

  const { searchParams } = request.nextUrl;
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  try {
    const deletePrivileged = () => getPrivilegedSupabaseClient("admin-sites-delete");
    const existing = await getSiteRowById(id, deletePrivileged);
    if (!existing) {
      return NextResponse.json({ error: "Site not found" }, { status: 404 });
    }
    if (isStaticConfigSiteSlug(existing.slug)) {
      return NextResponse.json(
        { error: "Static-config sites cannot be deleted through the admin API" },
        { status: 409 },
      );
    }
    await deleteSite(id, deletePrivileged, session.role);
    // S0-FP-002: await audit for destructive actions so the trail is durable.
    await recordAuditEvent({
      site_id: id,
      actor: session.email ?? "admin",
      action: "delete",
      entity_type: "site",
      entity_id: id,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    captureException(err, { context: "[api/admin/sites] DELETE failed:" });
    return NextResponse.json({ error: "Failed to delete site" }, { status: 500 });
  }
}
