import { NextRequest, NextResponse } from "next/server";
import {
  listAIDrafts,
  listAIDraftsCursor,
  createAIDraft,
  updateAIDraft,
  deleteAIDraft,
  isValidUUID,
  publishAIDraftTransactional,
} from "@/lib/dal/ai-drafts";
import { generateContent } from "@/lib/ai/content-generator";
import { sanitizeHtml } from "@/lib/sanitize-html";
import { recordAuditEvent } from "@/lib/audit-log";
import { getSiteById } from "@/config/sites";
import { captureException } from "@/lib/sentry";
import { parseJsonBody } from "@/lib/api-error";
import { parsePagination } from "@/lib/pagination";
import { withAuthz } from "@/lib/authz";
import { hasPermission } from "@/lib/dal/permissions";
import { checkRateLimit } from "@/lib/rate-limit";
import type { AIContentType } from "@/lib/ai/content-generator";

const VALID_CONTENT_TYPES = new Set(["article", "review", "comparison", "guide"]);
const VALID_STATUSES = new Set(["pending", "approved", "rejected", "published"]);

/** AUDIT-FIX A7-002 / A9-003: Maximum input sizes for AI generation.
 *  Prevents token/cost amplification and prompt injection via oversized inputs.
 */
const MAX_TOPIC_LENGTH = 500;
const MAX_KEYWORD_COUNT = 20;
const MAX_KEYWORD_LENGTH = 100;
const MAX_KEYWORDS_TOTAL_CHARS = 500;

/** AUDIT-FIX A7-002: Rate limit for AI generation per user.
 *  Prevents cost amplification from rapid generation requests.
 */
const AI_GENERATE_RATE_LIMIT = {
  maxRequests: 10,
  windowMs: 60 * 1000, // 10 per minute
  failPolicy: "closed" as const,
};

/** AUDIT-FIX A9-003: Schema validation for AI generation input.
 *  Returns { valid: false, error: string } or { valid: true, sanitized }.
 */
function validateGenerateInput(body: Record<string, unknown>):
  | { valid: false; error: string }
  | {
      valid: true;
      topic: string;
      contentType: AIContentType;
      keywords: string[];
    } {
  const topic = typeof body.topic === "string" ? body.topic.trim() : "";

  if (!topic) {
    return { valid: false, error: "topic is required" };
  }

  // AUDIT-FIX A9-003: Cap topic length to prevent token amplification
  if (topic.length > MAX_TOPIC_LENGTH) {
    return {
      valid: false,
      error: `topic exceeds maximum length of ${MAX_TOPIC_LENGTH} characters (got ${topic.length})`,
    };
  }

  const rawContentType = typeof body.content_type === "string" ? body.content_type : "article";
  if (!VALID_CONTENT_TYPES.has(rawContentType)) {
    return {
      valid: false,
      error: "content_type must be one of: article, review, comparison, guide",
    };
  }

  const rawKeywords = Array.isArray(body.keywords)
    ? body.keywords.filter((k: unknown): k is string => typeof k === "string")
    : [];

  // AUDIT-FIX A9-003: Cap keyword count and individual length
  if (rawKeywords.length > MAX_KEYWORD_COUNT) {
    return {
      valid: false,
      error: `maximum ${MAX_KEYWORD_COUNT} keywords allowed (got ${rawKeywords.length})`,
    };
  }

  const keywords = rawKeywords.map((k) => k.trim()).filter((k) => k.length > 0);

  for (const kw of keywords) {
    if (kw.length > MAX_KEYWORD_LENGTH) {
      return {
        valid: false,
        error: `keyword exceeds maximum length of ${MAX_KEYWORD_LENGTH} characters`,
      };
    }
  }

  const totalKeywordChars = keywords.reduce((sum, k) => sum + k.length, 0);
  if (totalKeywordChars > MAX_KEYWORDS_TOTAL_CHARS) {
    return {
      valid: false,
      error: `total keyword length exceeds ${MAX_KEYWORDS_TOTAL_CHARS} characters`,
    };
  }

  return {
    valid: true,
    topic,
    contentType: rawContentType as AIContentType,
    keywords,
  };
}

/** GET — List AI drafts */
export const GET = withAuthz("content", "view", async (request: NextRequest, { siteId }) => {
  const { searchParams } = request.nextUrl;

  // AUDIT-FIX A5-003: Support cursor-based pagination
  const useCursor = searchParams.get("cursor") !== null;
  const cursor = searchParams.get("cursor") ?? undefined;

  let drafts;
  try {
    if (useCursor) {
      const result = await listAIDraftsCursor({
        siteId,
        status: VALID_STATUSES.has(searchParams.get("status") ?? "")
          ? (searchParams.get("status") as "pending" | "approved" | "rejected" | "published")
          : undefined,
        contentType: searchParams.get("content_type") ?? undefined,
        limit: Number(searchParams.get("limit") ?? "20"),
        cursor,
      });
      return NextResponse.json({
        items: result.items,
        nextCursor: result.nextCursor,
        hasMore: result.hasMore,
      });
    } else {
      const pagination = parsePagination(searchParams);
      if (pagination instanceof NextResponse) return pagination;

      drafts = await listAIDrafts({
        siteId,
        status: VALID_STATUSES.has(searchParams.get("status") ?? "")
          ? (searchParams.get("status") as "pending" | "approved" | "rejected" | "published")
          : undefined,
        contentType: searchParams.get("content_type") ?? undefined,
        limit: pagination.limit,
        offset: pagination.offset,
      });
      return NextResponse.json(drafts);
    }
  } catch (err) {
    captureException(err, { context: "[api/admin/ai-content] GET failed:" });
    return NextResponse.json({ error: "Failed to list AI drafts" }, { status: 500 });
  }
});

/** POST — Generate new AI content */
export const POST = withAuthz(
  "content",
  "create",
  async (request: NextRequest, { session, siteId, siteSlug }) => {
    const rawOrError = await parseJsonBody(request);
    if (rawOrError instanceof NextResponse) return rawOrError;
    const body = rawOrError;

    // AUDIT-FIX A7-002 / A9-003: Validate and sanitize input
    const validation = validateGenerateInput(body);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const { topic, contentType, keywords } = validation;

    // AUDIT-FIX A7-002: Rate limit AI generation per user
    try {
      const userRateLimitKey = `ai-generate:${session.userId ?? session.email ?? "unknown"}`;
      const rl = await checkRateLimit(userRateLimitKey, AI_GENERATE_RATE_LIMIT);
      if (!rl.allowed) {
        return NextResponse.json(
          {
            error: "AI generation rate limit exceeded. Please try again later.",
            retryAfterMs: rl.retryAfterMs,
          },
          {
            status: 429,
            headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) },
          },
        );
      }
    } catch (rlErr) {
      captureException(rlErr, { context: "[api/admin/ai-content] rate limit check failed" });
      // Fail-open: continue even if rate limit check fails
    }

    try {
      const site = getSiteById(siteSlug);

      // AUDIT-FIX A9-003: Provider timeout prevents hanging requests
      const generateTimeoutMs = Number(process.env.AI_GENERATE_TIMEOUT_MS ?? "30000");
      const timeoutSignal = AbortSignal.timeout(generateTimeoutMs);

      const result = await Promise.race([
        generateContent({
          siteId: siteSlug,
          siteName: site?.name ?? siteSlug,
          niche: site?.brand.niche ?? "",
          contentType: contentType as AIContentType,
          topic,
          keywords,
          language: site?.language,
        }),
        new Promise<never>((_, reject) => {
          timeoutSignal.addEventListener("abort", () =>
            reject(new Error(`AI generation timed out after ${generateTimeoutMs}ms`)),
          );
        }),
      ]);

      const draft = await createAIDraft({
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
      });

      void recordAuditEvent({
        site_id: siteId,
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
  },
);

/**
 * AUDIT-FIX A6-001 / A9-001 / A11-004: PATCH requires separate permission check for publish.
 *
 * The "publish" action creates publicly-visible content. A user with only
 * "content:edit" should NOT be able to publish — they need "content:publish".
 *
 * Permission model:
 *   - approve/reject/edit → requires content:edit
 *   - publish → requires content:publish (separate permission)
 *
 * This prevents a low-privilege editor from publishing unreviewed content.
 */
export const PATCH = withAuthz(
  "content",
  "edit",
  async (request: NextRequest, { session, siteId }) => {
    const rawOrError = await parseJsonBody(request);
    if (rawOrError instanceof NextResponse) return rawOrError;
    const body = rawOrError;

    const id = typeof body.id === "string" ? body.id : "";

    // AUDIT-FIX A6-002: Validate UUID format
    if (!id || !isValidUUID(id)) {
      return NextResponse.json({ error: "id must be a valid UUID" }, { status: 400 });
    }

    const action = typeof body.action === "string" ? body.action : "";

    try {
      // AUDIT-FIX A6-001 / A9-001: Publish requires separate permission
      if (action === "publish") {
        const canPublish = await hasPermission(session.userId, siteId, "content", "publish");
        if (!canPublish) {
          captureException(new Error("Publish attempted without permission"), {
            context: "[api/admin/ai-content] PATCH publish denied",
            extra: { userId: session.userId, siteId, draftId: id },
          });
          return NextResponse.json(
            { error: "Forbidden: publish permission required" },
            { status: 403 },
          );
        }

        // AUDIT-FIX A5-004: Use transactional publish RPC
        const publishResult = await publishAIDraftTransactional(
          siteId,
          id,
          session.email ?? session.userId ?? "admin",
        );

        if (!publishResult.ok) {
          return NextResponse.json(
            { error: publishResult.error ?? "Publish failed", code: publishResult.code },
            { status: publishResult.code === "NOT_FOUND" ? 404 : 409 },
          );
        }

        void recordAuditEvent({
          site_id: siteId,
          actor: session.email ?? session.userId ?? "admin",
          action: "publish",
          entity_type: "ai_draft",
          entity_id: id,
          details: { contentId: publishResult.contentId },
        });

        // Return the updated draft
        const { listAIDrafts: listOne } = await import("@/lib/dal/ai-drafts");
        const updated = await listOne({ siteId, status: undefined, limit: 1 });
        return NextResponse.json({
          ...updated[0],
          status: "published" as const,
          _publishedContentId: publishResult.contentId,
        });
      }

      if (action === "approve") {
        const draft = await updateAIDraft(siteId, id, {
          status: "approved",
          reviewed_at: new Date().toISOString(),
          reviewed_by: session.email ?? session.userId ?? "admin",
        });

        void recordAuditEvent({
          site_id: siteId,
          actor: session.email ?? session.userId ?? "admin",
          action: "approve",
          entity_type: "ai_draft",
          entity_id: id,
        });

        return NextResponse.json(draft);
      }

      if (action === "reject") {
        const draft = await updateAIDraft(siteId, id, {
          status: "rejected",
          reviewed_at: new Date().toISOString(),
          reviewed_by: session.email ?? session.userId ?? "admin",
        });

        void recordAuditEvent({
          site_id: siteId,
          actor: session.email ?? session.userId ?? "admin",
          action: "reject",
          entity_type: "ai_draft",
          entity_id: id,
        });

        return NextResponse.json(draft);
      }

      // AUDIT-FIX A6-005: Split DTOs — editors can only modify safe fields.
      // Slug and body are excluded from editor updates to prevent
      // mass assignment of fields that affect published pages.
      const isAdmin = session.role === "super_admin" || session.role === "owner";

      const updates: Record<string, unknown> = {};
      if (typeof body.title === "string") updates.title = body.title;
      if (typeof body.excerpt === "string") updates.excerpt = body.excerpt;
      if (typeof body.meta_title === "string") updates.meta_title = body.meta_title;
      if (typeof body.meta_description === "string")
        updates.meta_description = body.meta_description;

      // Only admins can modify slug and body — these affect published pages
      if (isAdmin) {
        if (typeof body.slug === "string") updates.slug = body.slug;
        if (typeof body.body === "string") updates.body = body.body;
      }

      if (Object.keys(updates).length === 0) {
        return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
      }

      const draft = await updateAIDraft(siteId, id, updates as Parameters<typeof updateAIDraft>[2]);

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

    // AUDIT-FIX A6-002: Validate UUID format
    if (!id || !isValidUUID(id)) {
      return NextResponse.json({ error: "id must be a valid UUID" }, { status: 400 });
    }

    try {
      await deleteAIDraft(siteId, id);

      void recordAuditEvent({
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
