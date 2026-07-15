import type { NextRequest } from "next/server";
import { withAutomation } from "@/lib/automation/gateway";
import { automationSuccess } from "@/lib/automation/envelope";
import { getAutomationDbClient } from "@/lib/automation/db";
import { listContent, type ContentSortColumn } from "@/lib/dal/content";
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

// GET /api/automation/v1/content
// List content for the bound site. Read-only; supports status/type filters
// and keyset pagination via ?cursor. Returns list columns only (no body).
export const GET = withAutomation(
  ["content:read"],
  async (request: NextRequest, { auth, requestId }) => {
    const { siteId } = auth;
    const params = request.nextUrl.searchParams;

    const statusParam = params.get("status");
    const status =
      statusParam && (CONTENT_STATUSES as string[]).includes(statusParam)
        ? (statusParam as ContentRow["status"])
        : undefined;

    const rows = await listContent(
      {
        siteId,
        status,
        contentType: params.get("type") ?? undefined,
        q: params.get("q") ?? undefined,
        limit: clampLimit(params.get("limit")),
        cursor: params.get("cursor") ?? undefined,
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
