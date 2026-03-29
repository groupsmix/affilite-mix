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

/** GET /api/admin/sites — list all available sites (config + DB) */
export async function GET() {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Merge config-defined sites with DB sites
  const configSites = allSites.map((s) => ({
    id: s.id,
    name: s.name,
    domain: s.domain,
    language: s.language,
    direction: s.direction,
    source: "config" as const,
  }));

  let dbSites: { id: string; slug: string; name: string; domain: string; language: string; direction: string; source: "database"; created_at: string; db_id: string }[] = [];
  try {
    const rows = await listSites();
    dbSites = rows.map((r) => ({
      id: r.slug,
      slug: r.slug,
      name: r.name,
      domain: r.domain,
      language: r.language,
      direction: r.direction,
      source: "database" as const,
      created_at: r.created_at,
      db_id: r.id,
    }));
  } catch {
    // DB might not be reachable; fall back to config-only
  }

  // Merge: DB sites take precedence if slug matches a config site
  const dbSlugs = new Set(dbSites.map((s) => s.id));
  const mergedSites = [
    ...dbSites,
    ...configSites.filter((s) => !dbSlugs.has(s.id)),
  ];

  return NextResponse.json({ sites: mergedSites });
}

/** POST /api/admin/sites — create a new site */
export async function POST(request: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { slug, name, domain, language, direction } = body as {
    slug?: string;
    name?: string;
    domain?: string;
    language?: string;
    direction?: "ltr" | "rtl";
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
    const site = await createSite({ slug, name, domain, language, direction });
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
    const message = err instanceof Error ? err.message : "Failed to create site";
    if (message.includes("duplicate") || message.includes("unique")) {
      return NextResponse.json({ error: "A site with this slug or domain already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** PATCH /api/admin/sites — update an existing site */
export async function PATCH(request: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { id, name, domain, language, direction } = body as {
    id?: string;
    name?: string;
    domain?: string;
    language?: string;
    direction?: "ltr" | "rtl";
  };

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const updates: Record<string, string> = {};
  if (name !== undefined) updates.name = name;
  if (domain !== undefined) updates.domain = domain;
  if (language !== undefined) updates.language = language;
  if (direction !== undefined) updates.direction = direction;

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
      details: updates,
    });
    return NextResponse.json(site);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update site";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** DELETE /api/admin/sites — delete a site */
export async function DELETE(request: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
    const message = err instanceof Error ? err.message : "Failed to delete site";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
