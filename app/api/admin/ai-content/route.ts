import { NextRequest, NextResponse } from "next/server";
import { listAIDrafts, createAIDraft, updateAIDraft, deleteAIDraft } from "@/lib/dal/ai-drafts";
import { generateContent } from "@/lib/ai/content-generator";
import { createContent } from "@/lib/dal/content";
import { sanitizeHtml } from "@/lib/sanitize-html";
import { recordAuditEvent } from "@/lib/audit-log";
import { getSiteById } from "@/config/sites";
import { captureException } from "@/lib/sentry";
import { parseJsonBody } from "@/lib/api-error";
import { parsePagination } from "@/lib/pagination";
import { withAuthz } from "@/lib/authz";
import { hasPermission } from "@/lib/dal/permissions";
import type { AIContentType } from "@/lib/ai/content-generator";
import { enforceAdminRateLimit } from "@/lib/admin-rate-limit";
import { getTenantClientForSite } from "@/lib/supabase-server";

const VALID_CONTENT_TYPES = new Set(["article", "review", "comparison", "guide"]);
const VALID_STATUSES = new Set(["pending", "approved", "rejected", "published"]);

/** AUDIT-FIX A4-001: Topic schema — max 160 chars, NFC normalized. */
const MAX_TOPIC_LENGTH = 160;
/** AUDIT-FIX A4-001: Cap keywords count and per-keyword length. */
const MAX_KEYWORDS_COUNT = 50;
const MAX_KEYWORD_LENGTH = 100;
/** AUDIT-FIX A4-002: Field length limits. */
const MAX_TITLE_LENGTH = 200;
const MAX_EXCERPT_LENGTH = 500;
const MAX_META_LENGTH = 200;
const MAX_BODY_LENGTH = 100_000; // matches MAX_INPUT_LENGTH in sanitize-html

/** AUDIT-FIX A3-003 / A4-002: Slug allowlist — lowercase alphanumeric and hyphens only. */
const SLUG_REGEX = /^[a-z0-9-]{1,120}$/;

/** AUDIT-FIX A3-003: Validate UUID v4 format. */
function isValidUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/** AUDIT-FIX A4-001: Normalize user-provided text fields. */
function normalizeText(value: string): string {
  return value.normalize("NFC").trim();
}

/** GET — List AI drafts */
export const GET = withAuthz(
  "content",
  "view",
  async (request: NextRequest, { session, siteId }) => {
    const rlResponse = await enforceAdminRateLimit("ai-content", session);
    if (rlResponse) return rlResponse;

    const { searchParams } = request.nextUrl;
    const pagination = parsePagination(searchParams);
    if (pagination instanceof NextResponse) return pagination;

    try {
      const getClient = () => getTenantClientForSite(siteId, session.userId);
      // AUDIT-FIX A2-004: Validate content_type against allowlist before passing to DAL
      let contentType = searchParams.get("content_type") ?? undefined;
      if (contentType && !VALID_CONTENT_TYPES.has(contentType)) {
        contentType = undefined;
      }

      const drafts = await listAIDrafts(
        {
          siteId,
          status: VALID_STATUSES.has(searchParams.get("status") ?? "")
            ? (searchParams.get("status") as "pending" | "approved" | "rejected" | "published")
            : undefined,
          contentType,
          limit: pagination.limit,
          offset: pagination.offset,
        },
        getClient,
      );

      return NextResponse.json(drafts);
    } catch (err) {
      captureException(err, { context: "[api/admin/ai-content] GET failed:" });
      return NextResponse.json({ error: "Failed to list AI drafts" }, { status: 500 });
    }
  },
);

/** POST — Generate new AI content */
export const POST = withAuthz(
  "content",
  "create",
  async (request: NextRequest, { session, siteId, siteSlug }) => {
    const rlResponse = await enforceAdminRateLimit("ai-content", session);
    if (rlResponse) return rlResponse;

    const rawOrError = await parseJsonBody(request);
    if (rawOrError instanceof NextResponse) return rawOrError;
    const body = rawOrError;

    // AUDIT-FIX A4-001: Validate and normalize topic
    let topic = typeof body.topic === "string" ? normalizeText(body.topic) : "";
    if (!topic || topic.length < 1) {
      return NextResponse.json({ error: "topic is required" }, { status: 400 });
    }
    if (topic.length > MAX_TOPIC_LENGTH) {
      return NextResponse.json(
        { error: `topic must be at most ${MAX_TOPIC_LENGTH} characters` },
        { status: 400 },
      );
    }

    const contentType = typeof body.content_type === "string" ? body.content_type : "article";
    if (!VALID_CONTENT_TYPES.has(contentType)) {
      return NextResponse.json(
        { error: "content_type must be one of: article, review, comparison, guide" },
        { status: 400 },
      );
    }

    // AUDIT-FIX A4-001: Validate keywords — cap count and per-keyword length
    const rawKeywords = Array.isArray(body.keywords)
      ? body.keywords.filter((k: unknown) => typeof k === "string")
      : [];
    const keywords = rawKeywords
      .map((k: string) => normalizeText(k))
      .filter((k: string) => k.length > 0)
      .slice(0, MAX_KEYWORDS_COUNT);
    if (keywords.some((k: string) => k.length > MAX_KEYWORD_LENGTH)) {
      return NextResponse.json(
        { error: `each keyword must be at most ${MAX_KEYWORD_LENGTH} characters` },
        { status: 400 },
      );
    }

    try {
      const getClient = () => getTenantClientForSite(siteId, session.userId);
      const site = getSiteById(siteSlug);

      // AUDIT-FIX A1-003/A2-002: Wrap user data inside a data boundary in the prompt.
      // The generateContent function should treat topic/keywords as data, not instructions.
      const result = await generateContent({
        siteId: siteSlug,
        siteName: site?.name ?? siteSlug,
        niche: site?.brand.niche ?? "",
        contentType: contentType as AIContentType,
        topic,
        keywords,
        language: site?.language,
      });

      const draft = await createAIDraft(
        {
          site_id: siteId,
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
        },
        getClient,
      );

      await recordAuditEvent({
        site_id: siteId,
        actor: session.email ?? session.userId ?? "admin",
        action: "create",
        entity_type: "ai_draft",
        entity_id: draft.id,
        details: { topic: topic.slice(0, 100), contentType, provider: result.provider },
      });

      return NextResponse.json(draft, { status: 201 });
    } catch (err) {
      captureException(err, { context: "[api/admin/ai-content] POST generate failed:" });
      // AUDIT-FIX A1-005: Return stable generic message; never leak provider details.
      return NextResponse.json({ error: "Content generation failed" }, { status: 500 });
    }
  },
);

/** PATCH — Approve, reject, edit, or publish an AI draft */
export const PATCH = withAuthz(
  "content",
  "edit",
  async (request: NextRequest, { session, siteId }) => {
    const rlResponse = await enforceAdminRateLimit("ai-content", session);
    if (rlResponse) return rlResponse;

    const rawOrError = await parseJsonBody(request);
    if (rawOrError instanceof NextResponse) return rawOrError;
    const body = rawOrError;

    const id = typeof body.id === "string" ? body.id : "";
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }
    // AUDIT-FIX A3-003: Validate UUID format before DB lookup
    if (!isValidUuid(id)) {
      return NextResponse.json({ error: "Invalid draft id format" }, { status: 400 });
    }

    const action = typeof body.action === "string" ? body.action : "";

    try {
      const getClient = () => getTenantClientForSite(siteId, session.userId);
      if (action === "approve" || action === "publish") {
        // AUDIT-FIX A3-001: Publish requires a separate "publish" permission.
        // A user with only "content:edit" cannot publish without "content:publish".
        if (
          action === "publish" &&
          !(await hasPermission(session.userId ?? "", siteId, "content", "publish"))
        ) {
          return NextResponse.json(
            { error: "Forbidden: publish permission required" },
            { status: 403 },
          );
        }

        const draft = await updateAIDraft(
          siteId,
          id,
          {
            status: "approved",
            reviewed_at: new Date().toISOString(),
            reviewed_by: session.email ?? session.userId ?? "admin",
          },
          getClient,
        );

        // AUDIT-FIX A3-003: Return 404 when draft doesn't exist (cross-tenant probe)
        if (!draft) {
          return NextResponse.json({ error: "Draft not found" }, { status: 404 });
        }

        if (action === "publish") {
          // A7-010: Guard against race conditions — check slug uniqueness
          // before inserting to prevent duplicate content from concurrent
          // publish requests on the same draft.
          const { getContentBySlug } = await import("@/lib/dal/content");
          const existing = await getContentBySlug(siteId, draft.slug, true, getClient);
          if (existing) {
            return NextResponse.json(
              { error: "Content with this slug already exists" },
              { status: 409 },
            );
          }

          await createContent(
            {
              site_id: siteId,
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
              review_state: "published",
              // SEC-13: mark as AI-generated and record human review timestamp
              ai_generated: true,
              human_reviewed_at: new Date().toISOString(),
            },
            getClient,
          );

          const publishedDraft = await updateAIDraft(
            siteId,
            id,
            { status: "published" },
            getClient,
          );
          if (!publishedDraft) {
            return NextResponse.json({ error: "Draft not found after publish" }, { status: 404 });
          }

          // G-06: Await audit for critical publish action — must be durable before response.
          await recordAuditEvent({
            site_id: siteId,
            actor: session.email ?? session.userId ?? "admin",
            action: "publish",
            entity_type: "ai_draft",
            entity_id: id,
          });

          return NextResponse.json(publishedDraft);
        }

        await recordAuditEvent({
          site_id: siteId,
          actor: session.email ?? session.userId ?? "admin",
          action: "approve",
          entity_type: "ai_draft",
          entity_id: id,
        });

        return NextResponse.json(draft);
      }

      if (action === "reject") {
        const draft = await updateAIDraft(
          siteId,
          id,
          {
            status: "rejected",
            reviewed_at: new Date().toISOString(),
            reviewed_by: session.email ?? session.userId ?? "admin",
          },
          getClient,
        );

        // A3-003: updateAIDraft returns null when draft doesn't exist
        if (!draft) {
          return NextResponse.json({ error: "Draft not found" }, { status: 404 });
        }

        await recordAuditEvent({
          site_id: siteId,
          actor: session.email ?? session.userId ?? "admin",
          action: "reject",
          entity_type: "ai_draft",
          entity_id: id,
        });

        return NextResponse.json(draft);
      }

      // ── Generic edit (no action specified) ──────────────────
      const updates: Record<string, unknown> = {};

      // AUDIT-FIX A4-002: Validate title, slug, excerpt, meta fields
      if (typeof body.title === "string") {
        const title = normalizeText(body.title);
        if (title.length > MAX_TITLE_LENGTH) {
          return NextResponse.json(
            { error: `title must be at most ${MAX_TITLE_LENGTH} characters` },
            { status: 400 },
          );
        }
        updates.title = title;
      }

      if (typeof body.slug === "string") {
        const slug = normalizeText(body.slug);
        if (!SLUG_REGEX.test(slug)) {
          return NextResponse.json(
            {
              error: "slug must be 1-120 lowercase alphanumeric characters and hyphens only",
            },
            { status: 400 },
          );
        }
        updates.slug = slug;
      }

      // AUDIT-FIX A1-004/A2-003: Sanitize HTML body on write to prevent stored XSS.
      if (typeof body.body === "string") {
        if (body.body.length > MAX_BODY_LENGTH) {
          return NextResponse.json(
            { error: `body must be at most ${MAX_BODY_LENGTH} characters` },
            { status: 400 },
          );
        }
        updates.body = sanitizeHtml(body.body);
      }

      if (typeof body.excerpt === "string") {
        const excerpt = normalizeText(body.excerpt);
        if (excerpt.length > MAX_EXCERPT_LENGTH) {
          return NextResponse.json(
            { error: `excerpt must be at most ${MAX_EXCERPT_LENGTH} characters` },
            { status: 400 },
          );
        }
        updates.excerpt = excerpt;
      }

      if (typeof body.meta_title === "string") {
        const metaTitle = normalizeText(body.meta_title);
        if (metaTitle.length > MAX_META_LENGTH) {
          return NextResponse.json(
            { error: `meta_title must be at most ${MAX_META_LENGTH} characters` },
            { status: 400 },
          );
        }
        updates.meta_title = metaTitle;
      }

      if (typeof body.meta_description === "string") {
        const metaDesc = normalizeText(body.meta_description);
        if (metaDesc.length > MAX_META_LENGTH) {
          return NextResponse.json(
            { error: `meta_description must be at most ${MAX_META_LENGTH} characters` },
            { status: 400 },
          );
        }
        updates.meta_description = metaDesc;
      }

      const draft = await updateAIDraft(
        siteId,
        id,
        updates as Parameters<typeof updateAIDraft>[2],
        getClient,
      );

      // AUDIT-FIX A3-003: Return 404 when no row was updated (cross-tenant IDOR probe)
      if (!draft) {
        return NextResponse.json({ error: "Draft not found" }, { status: 404 });
      }

      return NextResponse.json(draft);
    } catch (err) {
      captureException(err, { context: "[api/admin/ai-content] PATCH failed:" });
      return NextResponse.json({ error: "Failed to update AI draft" }, { status: 500 });
    }
  },
);

/** DELETE — Remove an AI draft */
export const DELETE = withAuthz(
  "content",
  "delete",
  async (request: NextRequest, { session, siteId }) => {
    const rlResponse = await enforceAdminRateLimit("ai-content", session);
    if (rlResponse) return rlResponse;

    let id: string | null = null;
    const bodyOrErr = await parseJsonBody(request);
    if (!(bodyOrErr instanceof NextResponse)) {
      id = (bodyOrErr as { id?: string }).id ?? null;
    }
    if (!id) {
      id = request.nextUrl.searchParams.get("id");
    }
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }
    // AUDIT-FIX A3-003: Validate UUID format
    if (!isValidUuid(id)) {
      return NextResponse.json({ error: "Invalid draft id format" }, { status: 400 });
    }

    try {
      const getClient = () => getTenantClientForSite(siteId, session.userId);
      await deleteAIDraft(siteId, id, getClient);

      await recordAuditEvent({
        site_id: siteId,
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
  },
);
