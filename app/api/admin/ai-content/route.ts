import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { listAIDrafts, createAIDraft, updateAIDraft, deleteAIDraft } from "@/lib/dal/ai-drafts";
import { generateContent } from "@/lib/ai/content-generator";
import { createContent } from "@/lib/dal/content";
import { sanitizeHtml } from "@/lib/sanitize-html";
import { recordAuditEvent } from "@/lib/audit-log";
import { getSiteById } from "@/config/sites";
import { captureException } from "@/lib/sentry";
import { parseJsonBody } from "@/lib/api-error";
import type { AIContentType } from "@/lib/ai/content-generator";

const VALID_CONTENT_TYPES = new Set(["article", "review", "comparison", "guide"]);
const VALID_STATUSES = new Set(["pending", "approved", "rejected", "published"]);

/** GET — List AI drafts */
export async function GET(request: NextRequest) {
  const { error, dbSiteId } = await requireAdmin();
  if (error) return error;

  const { searchParams } = request.nextUrl;
  try {
    const drafts = await listAIDrafts({
      siteId: dbSiteId,
      status: VALID_STATUSES.has(searchParams.get("status") ?? "")
        ? (searchParams.get("status") as "pending" | "approved" | "rejected" | "published")
        : undefined,
      contentType: searchParams.get("content_type") ?? undefined,
      limit: searchParams.get("limit") ? Number(searchParams.get("limit")) : undefined,
      offset: searchParams.get("offset") ? Number(searchParams.get("offset")) : undefined,
    });

    return NextResponse.json(drafts);
  } catch (err) {
    captureException(err, { context: "[api/admin/ai-content] GET failed:" });
    return NextResponse.json({ error: "Failed to list AI drafts" }, { status: 500 });
  }
}

/** POST — Generate new AI content */
export async function POST(request: NextRequest) {
  const { error, session, dbSiteId, siteSlug } = await requireAdmin();
  if (error) return error;

  const rawOrError = await parseJsonBody(request);
  if (rawOrError instanceof NextResponse) return rawOrError;
  const body = rawOrError;

  const topic = typeof body.topic === "string" ? body.topic.trim() : "";
  const contentType = typeof body.content_type === "string" ? body.content_type : "article";
  const keywords = Array.isArray(body.keywords)
    ? body.keywords.filter((k: unknown) => typeof k === "string")
    : [];

  if (!topic) {
    return NextResponse.json({ error: "topic is required" }, { status: 400 });
  }
  if (!VALID_CONTENT_TYPES.has(contentType)) {
    return NextResponse.json(
      { error: "content_type must be one of: article, review, comparison, guide" },
      { status: 400 },
    );
  }

  try {
    const site = getSiteById(siteSlug);
    const result = await generateContent({
      siteId: siteSlug,
      siteName: site?.name ?? siteSlug,
      niche: site?.brand.niche ?? "",
      contentType: contentType as AIContentType,
      topic,
      keywords,
      language: site?.language,
    });

    const draft = await createAIDraft({
      site_id: dbSiteId,
      title: result.title,
      slug: result.slug,
      body: result.body,
      excerpt: result.excerpt,
      content_type: result.contentType,
      topic,
      keywords,
      ai_provider: result.provider,
      ai_model: result.model,
      status: "pending",
      generated_at: new Date().toISOString(),
      meta_title: result.metaTitle,
      meta_description: result.metaDescription,
    });

    void recordAuditEvent({
      site_id: dbSiteId,
      actor: session.email ?? session.userId ?? "admin",
      action: "create",
      entity_type: "ai_draft",
      entity_id: draft.id,
      details: { topic, contentType, provider: result.provider },
    });

    return NextResponse.json(draft, { status: 201 });
  } catch (err) {
    captureException(err, { context: "[api/admin/ai-content] POST generate failed:" });
    const msg = err instanceof Error ? err.message : "Failed to generate content";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** PATCH — Approve, reject, or edit an AI draft */
export async function PATCH(request: NextRequest) {
  const { error, session, dbSiteId } = await requireAdmin();
  if (error) return error;

  const rawOrError = await parseJsonBody(request);
  if (rawOrError instanceof NextResponse) return rawOrError;
  const body = rawOrError;

  const id = typeof body.id === "string" ? body.id : "";
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const action = typeof body.action === "string" ? body.action : "";

  try {
    if (action === "approve" || action === "publish") {
      // Approve the draft and optionally publish it as real content
      const draft = await updateAIDraft(dbSiteId, id, {
        status: "approved",
        reviewed_at: new Date().toISOString(),
        reviewed_by: session.email ?? session.userId ?? "admin",
      });

      if (action === "publish") {
        // Create actual content from the draft
        await createContent({
          site_id: dbSiteId,
          title: draft.title,
          slug: draft.slug,
          body: sanitizeHtml(draft.body),
          excerpt: draft.excerpt,
          featured_image: "",
          type: draft.content_type as "article" | "review" | "comparison" | "guide" | "blog",
          status: "published",
          category_id: null,
          tags: draft.keywords ?? [],
          author: "AI",
          publish_at: null,
          meta_title: draft.meta_title,
          meta_description: draft.meta_description,
          og_image: null,
          body_previous: null,
        });

        await updateAIDraft(dbSiteId, id, { status: "published" });
        draft.status = "published";
      }

      void recordAuditEvent({
        site_id: dbSiteId,
        actor: session.email ?? session.userId ?? "admin",
        action: action === "publish" ? "publish" : "approve",
        entity_type: "ai_draft",
        entity_id: id,
      });

      return NextResponse.json(draft);
    }

    if (action === "reject") {
      const draft = await updateAIDraft(dbSiteId, id, {
        status: "rejected",
        reviewed_at: new Date().toISOString(),
        reviewed_by: session.email ?? session.userId ?? "admin",
      });

      void recordAuditEvent({
        site_id: dbSiteId,
        actor: session.email ?? session.userId ?? "admin",
        action: "reject",
        entity_type: "ai_draft",
        entity_id: id,
      });

      return NextResponse.json(draft);
    }

    // Edit: update title, body, excerpt, etc.
    const updates: Record<string, unknown> = {};
    if (typeof body.title === "string") updates.title = body.title;
    if (typeof body.slug === "string") updates.slug = body.slug;
    if (typeof body.body === "string") updates.body = body.body;
    if (typeof body.excerpt === "string") updates.excerpt = body.excerpt;
    if (typeof body.meta_title === "string") updates.meta_title = body.meta_title;
    if (typeof body.meta_description === "string") updates.meta_description = body.meta_description;

    const draft = await updateAIDraft(dbSiteId, id, updates as Parameters<typeof updateAIDraft>[2]);

    return NextResponse.json(draft);
  } catch (err) {
    captureException(err, { context: "[api/admin/ai-content] PATCH failed:" });
    return NextResponse.json({ error: "Failed to update AI draft" }, { status: 500 });
  }
}

/** DELETE — Remove an AI draft */
export async function DELETE(request: NextRequest) {
  const { error, session, dbSiteId } = await requireAdmin();
  if (error) return error;

  let id: string | null = null;
  try {
    const body = await request.json();
    id = body?.id ?? null;
  } catch {
    // fallback to query params
  }
  if (!id) {
    id = request.nextUrl.searchParams.get("id");
  }
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  try {
    await deleteAIDraft(dbSiteId, id);

    void recordAuditEvent({
      site_id: dbSiteId,
      actor: session.email ?? session.userId ?? "admin",
      action: "delete",
      entity_type: "ai_draft",
      entity_id: id,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    captureException(err, { context: "[api/admin/ai-content] DELETE failed:" });
    return NextResponse.json({ error: "Failed to delete AI draft" }, { status: 500 });
  }
}
