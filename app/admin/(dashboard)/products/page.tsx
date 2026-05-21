import { requireAdminSession } from "../components/admin-guard";
import {
  listProducts,
  countProducts,
  listDistinctMerchants,
  type ProductSortColumn,
} from "@/lib/dal/products";
import { listCategories } from "@/lib/dal/categories";
import { resolveDbSiteId } from "@/lib/dal/site-resolver";
import { redirect } from "next/navigation";
import Link from "next/link";

import { Card, CardContent } from "@/components/ui/card";
import { CsvTools } from "./csv-tools";
import { ProductsTable, type ProductsTableRow } from "./products-table";
import type { ProductRow } from "@/types/database";

const DEFAULT_PAGE_SIZE = 20;
const ALLOWED_PAGE_SIZES = new Set([10, 20, 50, 100]);

const STATUS_VALUES = new Set<ProductRow["status"]>(["draft", "active", "archived"]);
const STATUS_OPTIONS: { label: string; value: string }[] = [
  { label: "Active", value: "active" },
  { label: "Draft", value: "draft" },
  { label: "Archived", value: "archived" },
];

const SORT_COLUMNS = new Set<ProductSortColumn>([
  "name",
  "price_amount",
  "score",
  "merchant",
  "status",
  "created_at",
  "updated_at",
]);

// DataTable sends price/EPC header sort events with these column ids.
// `epc` maps to `score` (score is the closest numeric signal available
// per-product today; see PR description — EPC is not yet persisted).
const COLUMN_ID_TO_SORT: Record<string, ProductSortColumn | undefined> = {
  name: "name",
  price_amount: "price_amount",
  price: "price_amount",
  epc: "score",
  score: "score",
  merchant: "merchant",
  status: "status",
  created_at: "created_at",
  updated_at: "updated_at",
};

interface ProductsPageProps {
  searchParams: Promise<{
    q?: string;
    "f.status"?: string;
    "f.category_id"?: string;
    "f.merchant"?: string;
    sort?: string;
    page?: string;
    size?: string;
    missing_url?: string;
  }>;
}

function parseCsvString(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((v) => v.length > 0);
}

function parseCsvEnum<T extends string>(raw: string | undefined, allowed: Set<T>): T[] {
  return parseCsvString(raw).filter((v): v is T => allowed.has(v as T));
}

export default async function ProductsPage({ searchParams }: ProductsPageProps) {
  const sp = await searchParams;

  const session = await requireAdminSession();
  if (!session.activeSiteSlug) redirect("/admin/sites");
  const dbSiteId = await resolveDbSiteId(session.activeSiteSlug);

  const statuses = parseCsvEnum(sp["f.status"], STATUS_VALUES);
  const categoryIds = parseCsvString(sp["f.category_id"]);
  const networks = parseCsvString(sp["f.merchant"]);
  const q = (sp.q ?? "").trim() || undefined;
  const missingUrl = sp.missing_url === "1";

  let sortBy: ProductSortColumn | undefined;
  let sortDirection: "asc" | "desc" | undefined;
  if (sp.sort) {
    const [col, dir] = sp.sort.split(":");
    const mapped = col ? COLUMN_ID_TO_SORT[col] : undefined;
    if (mapped && SORT_COLUMNS.has(mapped)) {
      sortBy = mapped;
      sortDirection = dir === "asc" ? "asc" : "desc";
    }
  }

  const pageNum = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const rawSize = parseInt(sp.size ?? String(DEFAULT_PAGE_SIZE), 10);
  const pageSize = ALLOWED_PAGE_SIZES.has(rawSize) ? rawSize : DEFAULT_PAGE_SIZE;

  const [products, totalProducts, categories, merchants] = await Promise.all([
    listProducts({
      siteId: dbSiteId,
      statuses: statuses.length > 0 ? statuses : undefined,
      categoryIds: categoryIds.length > 0 ? categoryIds : undefined,
      networks: networks.length > 0 ? networks : undefined,
      q,
      missingUrl: missingUrl || undefined,
      sortBy,
      sortDirection,
      limit: pageSize,
      offset: (pageNum - 1) * pageSize,
    }),
    countProducts({
      siteId: dbSiteId,
      statuses: statuses.length > 0 ? statuses : undefined,
      categoryIds: categoryIds.length > 0 ? categoryIds : undefined,
      networks: networks.length > 0 ? networks : undefined,
      q,
      missingUrl: missingUrl || undefined,
    }),
    listCategories(dbSiteId),
    listDistinctMerchants(dbSiteId),
  ]);

  const categoryNameById = new Map(categories.map((c) => [c.id, c.name]));

  const rows: ProductsTableRow[] = products.map((p) => ({
    id: p.id,
    name: p.name,
    image_url: p.image_url ?? null,
    image_alt: p.image_alt ?? null,
    status: p.status,
    category_id: p.category_id ?? null,
    category_name: p.category_id ? (categoryNameById.get(p.category_id) ?? null) : null,
    merchant: p.merchant ?? null,
    price: p.price ?? null,
    price_amount: p.price_amount ?? null,
    price_currency: p.price_currency ?? null,
    // Per-product EPC is not persisted on the products table today; show "—".
    // The column remains sortable (server sort falls back to `score`) so the
    // contract is ready when per-product EPC data lands.
    epc: null,
    affiliate_url: p.affiliate_url ?? null,
  }));

  const categoryOptions = categories.map((c) => ({ label: c.name, value: c.id }));
  const networkOptions = merchants.map((m) => ({ label: m, value: m }));

  const hasAnyFilter =
    Boolean(q) ||
    statuses.length > 0 ||
    categoryIds.length > 0 ||
    networks.length > 0 ||
    missingUrl ||
    pageNum > 1;

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Products</h1>
        <Link
          href="/admin/products/new"
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          Add Product
        </Link>
      </div>

      <div className="mb-6">
        <CsvTools />
      </div>

      {rows.length === 0 && !hasAnyFilter ? (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-muted-foreground">No products yet.</p>
            <Link
              href="/admin/products/new"
              className="mt-2 inline-block text-sm font-medium text-blue-600 hover:underline"
            >
              Create your first product
            </Link>
          </CardContent>
        </Card>
      ) : (
        <ProductsTable
          data={rows}
          totalCount={totalProducts}
          pageSize={pageSize}
          statusOptions={STATUS_OPTIONS}
          categoryOptions={categoryOptions}
          networkOptions={networkOptions}
          missingUrlActive={missingUrl}
        />
      )}
    </div>
  );
}
