import type { NextRequest } from "next/server";
import { withAutomation } from "@/lib/automation/gateway";
import { automationSuccess, automationError } from "@/lib/automation/envelope";
import { getAutomationDbClient } from "@/lib/automation/db";
import { getAIDraft, updateAIDraft } from "@/lib/dal/ai-drafts";
import { getContentBySlug, createContent, updateContent } from "@/lib/dal/content";
import { sanitizeHtml } from "@/lib/sanitize-html";
import { recordAuditEvent } from "@/lib/audit-log";
import type { ContentRow } from "@/types/database";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_CONTENT_TYPES: ContentRow["type"][] = [
  "article",
  "review",
  "comparison",
  "guide",
  "blog",
];

function draftIdFromPath(request: NextRequest): string | null {
  // Path is /api/automation/v1/content/drafts/[id]/publish
  const parts = request.nextUrl.pathname.split("/").filter(Boolean);
  const id = parts[parts.length - 2];
  return id && UUID_RE.test(id) ? id : null;
}

// POST /api/automation/v1/content/drafts/:id/publish
// Promote an AI draft to live content. If a published/scheduled content item
// with the same slug already exists, it is overwritten with the draft body
// (idempotent republication). Requires scope content:publish.
export const POST = withAutomation(
  ["content:publish"],
  async (request: NextRequest, { auth, requestId }) => {
    const { siteId, account } = auth;
    const id = draftIdFromPath(request);
    if (!id) {
      return automationError("AUTOMATION_BAD_REQUEST", "Invalid draft id", requestId);
    }

    const draft = await getAIDraft(siteId, id, getAutomationDbClient);
    if (!draft) {
      return automationError("AUTOMATION_NOT_FOUND", "Draft not found", requestId);
    }

    const contentType = draft.content_type as ContentRow["type"];
    if (!VALID_CONTENT_TYPES.includes(contentType)) {
      return automationError(
        "AUTOMATION_VALIDATION_ERROR",
        `Unsupported content_type: ${draft.content_type}`,
        requestId,
      );
    }

    const now = new Date().toISOString();
    const bodyHtml = sanitizeHtml(draft.body);

    const existing = await getContentBySlug(siteId, draft.slug, true, getAutomationDbClient);

    let content: ContentRow;
    if (existing) {
      content = await updateContent(
        siteId,
        existing.id,
        {
          title: draft.title,
          slug: draft.slug,
          body: bodyHtml,
          excerpt: draft.excerpt,
          type: contentType,
          status: "published",
          tags: draft.keywords,
          author: "AI",
          publish_at: now,
          meta_title: draft.meta_title,
          meta_description: draft.meta_description,
          review_state: "published",
          ai_generated: true,
          human_reviewed_at: now,
        },
        getAutomationDbClient,
      );
    } else {
      content = await createContent(
        {
          site_id: siteId,
          title: draft.title,
          slug: draft.slug,
          body: bodyHtml,
          excerpt: draft.excerpt,
          featured_image: "",
          type: contentType,
          status: "published",
          category_id: null,
          tags: draft.keywords,
          author: "AI",
          publish_at: now,
          meta_title: draft.meta_title,
          meta_description: draft.meta_description,
          og_image: null,
          body_previous: null,
          review_state: "published",
          ai_generated: true,
          human_reviewed_at: now,
        },
        getAutomationDbClient,
      );
    }

    const publishedDraft = await updateAIDraft(
      siteId,
      id,
      {
        status: "published",
        reviewed_at: now,
        reviewed_by: `agent:${account.id}`,
      },
      getAutomationDbClient,
    );

    await recordAuditEvent({
      site_id: siteId,
      actor: `agent:${account.id}`,
      action: "automation.content.draft.publish",
      entity_type: "ai_draft",
      entity_id: id,
      details: {
        content_id: content.id,
        slug: content.slug,
        title: content.title,
        republished: Boolean(existing),
      },
    });

    return automationSuccess({ draft: publishedDraft, content }, requestId);
  },
);
