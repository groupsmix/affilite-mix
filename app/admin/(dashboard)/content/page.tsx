import { requireAdminSession } from "../components/admin-guard";
import { listContent, countContent, type ContentSortColumn } from "@/lib/dal/content";
import { resolveDbSiteId } from "@/lib/dal/site-resolver";
import { redirect } from "next/navigation";
import Link from "next/link";

import { Card, CardContent } from "@/components/ui/card";
import { ContentTable, type ContentTableRow } from "./content-table";
import type { ContentRow } from "@/types/database";

const DEFAULT_PAGE_SIZE = 20;
const ALLOWED_PAGE_SIZES = new Set([10, 20, 50, 100]);
const STATUS_VALUES = new Set<ContentRow["status"]>([
  "draft",
  "review",
  "published",
  "scheduled",
  "archived",
]);
const TYPE_VALUES = new Set<ContentRow["type"]>([
  "article",
  "review",
  "comparison",
  "guide",
  "blog",
]);
const SORT_COLUMNS = new Set<ContentSortColumn>([
  "title",
  "publish_at",
  "status",
  "author",
  "created_at",
  "updated_at",
]);

interface ContentPageProps {
  searchParams: Promise<{
    // New DataTable-aligned params
    q?: string;
    "f.status"?: string;
    "f.type"?: string;
    sort?: string;
    page?: string;
    size?: string;
    // Legacy param (bookmark compat)
    status?: string;
  }>;
}

function parseCsvEnum<T extends string>(raw: string | undefined, allowed: Set<T>): T[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((v): v is T => (v as T) !== "" && allowed.has(v as T));
}

export default async function ContentPage({ searchParams }: ContentPageProps) {
  const sp = await searchParams;

  // Legacy bookmark compatibility: ?status=draft → ?f.status=draft
  if (sp.status && !sp["f.status"] && STATUS_VALUES.has(sp.status as ContentRow["status"])) {
    const params = new URLSearchParams();
    params.set("f.status", sp.status);
    if (sp.q) params.set("q", sp.q);
    if (sp.sort) params.set("sort", sp.sort);
    if (sp.page) params.set("page", sp.page);
    if (sp.size) params.set("size", sp.size);
    if (sp["f.type"]) params.set("f.type", sp["f.type"]);
    redirect(`/admin/content?${params.toString()}`);
  }

  const session = await requireAdminSession();
  if (!session.activeSiteSlug) redirect("/admin/sites");
  const dbSiteId = await resolveDbSiteId(session.activeSiteSlug);

  const statuses = parseCsvEnum(sp["f.status"], STATUS_VALUES);
  const types = parseCsvEnum(sp["f.type"], TYPE_VALUES);
  const q = (sp.q ?? "").trim() || undefined;

  let sortBy: ContentSortColumn | undefined;
  let sortDirection: "asc" | "desc" | undefined;
  if (sp.sort) {
    const [col, dir] = sp.sort.split(":");
    if (col && SORT_COLUMNS.has(col as ContentSortColumn)) {
      sortBy = col as ContentSortColumn;
      sortDirection = dir === "asc" ? "asc" : "desc";
    }
  }

  const pageNum = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const rawSize = parseInt(sp.size ?? String(DEFAULT_PAGE_SIZE), 10);
  const pageSize = ALLOWED_PAGE_SIZES.has(rawSize) ? rawSize : DEFAULT_PAGE_SIZE;

  const [contentItems, totalContent, scheduledCount] = await Promise.all([
    listContent({
      siteId: dbSiteId,
      statuses: statuses.length > 0 ? statuses : undefined,
      types: types.length > 0 ? types : undefined,
      q,
      sortBy,
      sortDirection,
      limit: pageSize,
      offset: (pageNum - 1) * pageSize,
    }),
    countContent({
      siteId: dbSiteId,
      statuses: statuses.length > 0 ? statuses : undefined,
      types: types.length > 0 ? types : undefined,
      q,
    }),
    countContent({ siteId: dbSiteId, status: "scheduled" }),
  ]);

  const rows: ContentTableRow[] = contentItems.map((item) => ({
    id: item.id,
    title: item.title,
    type: item.type,
    status: item.status,
    author: item.author,
    publish_at: item.publish_at,
  }));

  const hasAnyFilter = Boolean(q) || statuses.length > 0 || types.length > 0 || pageNum > 1;

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Content</h1>
        <Link
          href="/admin/content/new"
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          Add Content
        </Link>
      </div>

      {rows.length === 0 && !hasAnyFilter ? (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-muted-foreground">No content yet.</p>
            <Link
              href="/admin/content/new"
              className="mt-2 inline-block text-sm font-medium text-blue-600 hover:underline"
            >
              Create your first article
            </Link>
          </CardContent>
        </Card>
      ) : (
        <ContentTable
          data={rows}
          totalCount={totalContent}
          scheduledCount={scheduledCount}
          pageSize={pageSize}
        />
      )}
    </div>
  );
}
