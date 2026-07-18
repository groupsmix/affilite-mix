import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { requireAdmin, assertRole } from "@/lib/admin-guard";
import { recordAuditEvent } from "@/lib/audit-log";
import { parseJsonBody } from "@/lib/api-error";
import { captureException } from "@/lib/sentry";
import { presentationTag } from "@/lib/cache-tags";
import { getSiteById } from "@/config/sites";
import { resolvePresentation } from "@/lib/presentation/resolve";
import { sanitizePresentationDraft } from "@/lib/presentation/sanitize-draft";
import {
  getDraftPresentation,
  getPublishedPresentation,
  listArchivedPresentations,
  upsertDraftPresentation,
  publishPresentation,
  rollbackPresentation,
  rowToPresentationSource,
} from "@/lib/dal/site-presentations";
import type { SitePresentationRow } from "@/types/database";

/** Pick just the presentation-relevant static config for the active site. */
function siteConfigFor(slug: string) {
  const cfg = getSiteById(slug);
  return {
    layoutVariant: cfg?.layoutVariant,
    headerVariant: cfg?.headerVariant,
    footerVariant: cfg?.footerVariant,
    headerConfig: cfg?.headerConfig,
    footerConfig: cfg?.footerConfig,
    headerTokens: cfg?.headerTokens,
  };
}

/**
 * GET /api/admin/presentations — the active site's presentation state:
 * the resolved published + draft Presentation objects (for preview) plus the
 * archived version list (for the rollback affordance).
 */
export async function GET() {
  const { error, session, dbSiteId, siteSlug } = await requireAdmin();
  if (error) return error;
  if (!session || !dbSiteId || !siteSlug) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const roleError = assertRole(session, "admin");
  if (roleError) return roleError;

  try {
    const [draftRow, publishedRow, archived] = await Promise.all([
      getDraftPresentation(dbSiteId),
      getPublishedPresentation(dbSiteId),
      listArchivedPresentations(dbSiteId),
    ]);

    const site = siteConfigFor(siteSlug);
    const toPresentation = (row: SitePresentationRow | null) =>
      row ? resolvePresentation(site, rowToPresentationSource(row)) : null;

    return NextResponse.json({
      published: toPresentation(publishedRow),
      draft: toPresentation(draftRow),
      effective: resolvePresentation(
        site,
        publishedRow ? rowToPresentationSource(publishedRow) : null,
      ),
      versions: archived.map((r) => ({
        id: r.id,
        version: r.version,
        published_at: r.published_at,
      })),
    });
  } catch (err) {
    captureException(err, { context: "[api/admin/presentations] GET failed" });
    return NextResponse.json({ error: "Failed to load presentation" }, { status: 500 });
  }
}

/**
 * PUT /api/admin/presentations — save the site's design draft. Body is
 * untrusted and fully re-validated by sanitizePresentationDraft before it is
 * persisted (no raw CSS/JSX/scripts can be stored). Does not affect the live
 * site until published.
 */
export async function PUT(request: NextRequest) {
  const { error, session, dbSiteId } = await requireAdmin();
  if (error) return error;
  if (!session || !dbSiteId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const roleError = assertRole(session, "admin");
  if (roleError) return roleError;

  const bodyOrError = await parseJsonBody(request);
  if (bodyOrError instanceof NextResponse) return bodyOrError;

  try {
    const input = sanitizePresentationDraft(bodyOrError);
    const row = await upsertDraftPresentation(dbSiteId, input, session.userId ?? null);
    void recordAuditEvent({
      site_id: dbSiteId,
      actor: session.email ?? "admin",
      action: "update",
      entity_type: "site_presentation",
      entity_id: row.id,
      details: { status: "draft" },
    });
    return NextResponse.json({ ok: true, id: row.id });
  } catch (err) {
    captureException(err, { context: "[api/admin/presentations] PUT failed" });
    return NextResponse.json({ error: "Failed to save draft" }, { status: 500 });
  }
}

/**
 * POST /api/admin/presentations — lifecycle actions on the draft/published
 * version. Body: `{ action: "publish" | "rollback" }`. Both are atomic RPCs;
 * the site cache is invalidated only after the write succeeds.
 */
export async function POST(request: NextRequest) {
  const { error, session, dbSiteId } = await requireAdmin();
  if (error) return error;
  if (!session || !dbSiteId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const roleError = assertRole(session, "admin");
  if (roleError) return roleError;

  const bodyOrError = await parseJsonBody(request);
  if (bodyOrError instanceof NextResponse) return bodyOrError;
  const action = (bodyOrError as { action?: unknown }).action;

  if (action !== "publish" && action !== "rollback") {
    return NextResponse.json({ error: "action must be 'publish' or 'rollback'" }, { status: 400 });
  }

  try {
    const actor = session.userId ?? null;
    const row =
      action === "publish"
        ? await publishPresentation(dbSiteId, actor)
        : await rollbackPresentation(dbSiteId, actor);

    // Invalidate the live presentation cache only after a successful write.
    revalidateTag(presentationTag(dbSiteId));

    void recordAuditEvent({
      site_id: dbSiteId,
      actor: session.email ?? "admin",
      action,
      entity_type: "site_presentation",
      entity_id: row.id,
      details: { version: row.version ?? undefined },
    });
    return NextResponse.json({ ok: true, id: row.id, version: row.version });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("no draft presentation")) {
      return NextResponse.json({ error: "No draft to publish" }, { status: 409 });
    }
    if (msg.includes("no previous presentation")) {
      return NextResponse.json({ error: "No previous version to roll back to" }, { status: 409 });
    }
    captureException(err, { context: "[api/admin/presentations] POST failed" });
    return NextResponse.json({ error: "Failed to update presentation" }, { status: 500 });
  }
}
