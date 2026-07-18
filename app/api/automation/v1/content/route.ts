import type { NextRequest } from "next/server";
import { withAutomation } from "@/lib/automation/gateway";
import { automationSuccess } from "@/lib/automation/envelope";
import { getAutomationDbClient } from "@/lib/automation/db";
import { listContent, type ContentSortColumn } from "@/lib/dal/content";
import { listAIDrafts } from "@/lib/dal/ai-drafts";
import type { ContentRow } from "@/types/database";

const CONTENT_STATUSES: ContentRow["status"][] = [
  "draft",
  "review",
  "published",
  "scheduled",
  "archived",
];

function clampLimit(raw: string | null): number {
  const n = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(n) || n <= 0) return 25;
  return Math.min(n, 100);
}

function isContentStatus(status: string | null): status is ContentRow["status"] {
  return !!status && (CONTENT_STATUSES as string[]).includes(status);
}

// GET /api/automation/v1/content
// List content for the bound site. Read-only; supports status/type filters
// and keyset pagination via ?cursor. Returns list columns only (no body).
// `status=pending` is a special case: it returns AI drafts from `ai_drafts`
// instead of the published content table.
export const GET = withAutomation(
  ["content:read"],
  async (request: NextRequest, { auth, requestId }) => {
    const { siteId } = auth;
    const params = request.nextUrl.searchParams;
    const statusParam = params.get("status");
    const typeParam = params.get("type") ?? undefined;
    const qParam = params.get("q") ?? undefined;
    const limit = clampLimit(params.get("limit"));
    const cursor = params.get("cursor") ?? undefined;

    if (statusParam === "pending") {
      const rows = await listAIDrafts(
        { siteId, status: "pending", contentType: typeParam, q: qParam, limit, cursor },
        getAutomationDbClient,
      );

      const items = rows.map((r) => ({
        id: r.id,
        title: r.title,
        slug: r.slug,
        excerpt: r.excerpt,
        type: r.content_type,
        status: r.status,
        publish_at: null,
        updated_at: r.updated_at,
      }));

      const nextCursor = rows.length > 0 ? rows[rows.length - 1]!.created_at : null;
      return automationSuccess({ items, next_cursor: nextCursor }, requestId);
    }

    const status = isContentStatus(statusParam) ? statusParam : undefined;

    const rows = await listContent(
      {
        siteId,
        status,
        contentType: typeParam,
        q: qParam,
        limit,
        cursor,
        sortBy: "created_at" as ContentSortColumn,
        sortDirection: "desc",
      },
      getAutomationDbClient,
    );

    const items = rows.map((r) => ({
      id: r.id,
      title: r.title,
      slug: r.slug,
      type: r.type,
      status: r.status,
      publish_at: r.publish_at,
      updated_at: r.updated_at,
    }));

    const nextCursor = rows.length > 0 ? rows[rows.length - 1]!.created_at : null;

    return automationSuccess({ items, next_cursor: nextCursor }, requestId);
  },
);
