import { requireAdminSession } from "../components/admin-guard";
import { listCategories, getCategoryUsageCountsBatch } from "@/lib/dal/categories";
import { resolveDbSiteId } from "@/lib/dal/site-resolver";
import { redirect } from "next/navigation";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  CATEGORIES_TABLE_PAGE_SIZE,
  CategoriesTable,
  type CategoriesTableRow,
} from "./categories-table";

const DEFAULT_PAGE_SIZE = CATEGORIES_TABLE_PAGE_SIZE;

const TAXONOMY_VALUES = new Set(["general", "budget", "occasion", "recipient", "brand"] as const);
type TaxonomyValue = typeof TAXONOMY_VALUES extends Set<infer V> ? V : never;

const SORTABLE_COLUMNS = new Set(["name", "content_count", "created_at"] as const);
type SortableColumn = typeof SORTABLE_COLUMNS extends Set<infer V> ? V : never;

interface CategoriesPageProps {
  searchParams: Promise<{
    q?: string;
    "f.taxonomy_type"?: string;
    sort?: string;
    page?: string;
    size?: string;
  }>;
}

function parseCsv(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((v) => v.length > 0);
}

export default async function CategoriesPage({ searchParams }: CategoriesPageProps) {
  const sp = await searchParams;

  const session = await requireAdminSession();
  if (!session.activeSiteSlug) redirect("/admin/sites");
  const dbSiteId = await resolveDbSiteId(session.activeSiteSlug);

  const q = (sp.q ?? "").trim();
  const taxonomyFilter = parseCsv(sp["f.taxonomy_type"]).filter((v): v is TaxonomyValue =>
    TAXONOMY_VALUES.has(v as TaxonomyValue),
  );

  let sortCol: SortableColumn = "name";
  let sortDesc = false;
  if (sp.sort) {
    const [col, dir] = sp.sort.split(":");
    if (col && SORTABLE_COLUMNS.has(col as SortableColumn)) {
      sortCol = col as SortableColumn;
      sortDesc = dir === "desc";
    }
  }

  const pageNum = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const rawSize = parseInt(sp.size ?? String(DEFAULT_PAGE_SIZE), 10);
  const pageSize = rawSize > 0 && rawSize <= 200 ? rawSize : DEFAULT_PAGE_SIZE;

  // Categories are typically <100 per site; fetch the q-filtered list in one
  // shot and do taxonomy filtering / sorting / paging in-memory. This avoids
  // adding new DAL surface area for something so small (per Task 12 scope).
  const all = await listCategories(dbSiteId, q ? { q } : undefined);

  const filteredByTaxonomy =
    taxonomyFilter.length > 0
      ? all.filter((c) => taxonomyFilter.includes(c.taxonomy_type as TaxonomyValue))
      : all;

  // Batch-fetch content counts (products count is computed too but unused in
  // this view) for the full filtered set, so sorting by count is correct
  // across pages.
  const { contentCounts } = await getCategoryUsageCountsBatch(
    dbSiteId,
    filteredByTaxonomy.map((c) => c.id),
  );

  const enriched: CategoriesTableRow[] = filteredByTaxonomy.map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    taxonomy_type: c.taxonomy_type,
    content_count: contentCounts.get(c.id) ?? 0,
    created_at: c.created_at,
  }));

  enriched.sort((a, b) => {
    let cmp = 0;
    if (sortCol === "name") {
      cmp = a.name.localeCompare(b.name);
    } else if (sortCol === "content_count") {
      cmp = a.content_count - b.content_count;
    } else if (sortCol === "created_at") {
      cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    }
    return sortDesc ? -cmp : cmp;
  });

  const totalCount = enriched.length;
  const start = (pageNum - 1) * pageSize;
  const pageRows = enriched.slice(start, start + pageSize);

  const hasAnyFilter = q.length > 0 || taxonomyFilter.length > 0;

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Categories</h1>
        <Button asChild>
          <Link href="/admin/categories/new">Add Category</Link>
        </Button>
      </div>

      <CategoriesTable
        data={pageRows}
        totalCount={totalCount}
        hasAnyFilter={hasAnyFilter}
        pageSize={pageSize}
      />
    </div>
  );
}
