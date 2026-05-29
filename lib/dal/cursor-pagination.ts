/**
 * Keyset (cursor) pagination helper for high-volume DAL queries.
 *
 * Offset-based pagination degrades at depth: `OFFSET 10000` still scans
 * 10 000 rows before returning results. Keyset pagination uses an indexed
 * column (typically `created_at` + `id`) as the cursor, giving O(1)
 * seeks regardless of page depth.
 *
 * Usage:
 *
 *   const page = await cursorPaginate(sb, "affiliate_clicks", {
 *     siteId,
 *     limit: 50,
 *     cursor: req.query.cursor,       // opaque string from previous page
 *     orderColumn: "created_at",
 *     ascending: false,
 *     select: "id, product_name, created_at",
 *   });
 *
 *   // page.data   — the rows
 *   // page.cursor  — pass to the next request (null = no more pages)
 */

import { defaultDalClientGetter, type DalClientGetter } from "./dal-client";

/**
 * I2-01: Allowed order columns. Only these may be interpolated into
 * PostgREST .or()/.order() strings. Any value outside this set is
 * rejected at runtime, preventing filter injection via `orderColumn`.
 */
const ALLOWED_ORDER_COLUMNS = new Set([
  "created_at",
  "updated_at",
  "name",
  "title",
  "price",
  "rating",
  "popularity",
  "published_at",
  "id",
]);

export interface CursorPageOptions {
  siteId: string;
  limit?: number;
  cursor?: string | null;
  orderColumn?: string;
  ascending?: boolean;
  select: string;
}

export interface CursorPage<T> {
  data: T[];
  cursor: string | null;
  hasMore: boolean;
}

interface CursorPayload {
  v: 1;
  col: string;
  val: string;
  id: string;
}

function encodeCursor(col: string, val: string, id: string): string {
  const payload: CursorPayload = { v: 1, col, val, id };
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

/** Reject values that contain PostgREST filter metacharacters. */
const POSTGREST_UNSAFE = /[,()\\]/;

function isSafeCursorValue(v: string): boolean {
  return v.length > 0 && v.length <= 256 && !POSTGREST_UNSAFE.test(v);
}

function decodeCursor(cursor: string): CursorPayload | null {
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const parsed = JSON.parse(raw) as CursorPayload;
    if (parsed.v !== 1 || !parsed.col || !parsed.id) return null;
    if (!isSafeCursorValue(parsed.val) || !isSafeCursorValue(parsed.id)) return null;
    return parsed;
  } catch {
    // D10-02: parse failure returns null → caller starts from page 1 (fail-safe)
    return null;
  }
}

export async function cursorPaginate<T extends object>(
  table: string,
  opts: CursorPageOptions,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<CursorPage<T>> {
  const sb = await getClient();
  const limit = Math.min(opts.limit ?? 50, 200);
  const col = opts.orderColumn ?? "created_at";

  // I2-01: Reject orderColumn values not in the allow-list.
  if (!ALLOWED_ORDER_COLUMNS.has(col)) {
    throw new Error(
      `Invalid orderColumn '${col}'. Allowed: ${[...ALLOWED_ORDER_COLUMNS].join(", ")}`,
    );
  }

  const asc = opts.ascending ?? false;
  const select = opts.select;

  let query = sb.from(table).select(select).eq("site_id", opts.siteId);

  if (opts.cursor) {
    const decoded = decodeCursor(opts.cursor);
    if (decoded && decoded.col === col) {
      if (asc) {
        query = query.or(
          `${col}.gt.${decoded.val},and(${col}.eq.${decoded.val},id.gt.${decoded.id})`,
        );
      } else {
        query = query.or(
          `${col}.lt.${decoded.val},and(${col}.eq.${decoded.val},id.lt.${decoded.id})`,
        );
      }
    }
  }

  query = query
    .order(col, { ascending: asc })
    .order("id", { ascending: asc })
    .limit(limit + 1);

  const { data, error } = await query;
  if (error) throw error;

  // Supabase's `.select(dynamicString)` returns `GenericStringError[]` at the
  // type level because the column list isn't statically known. At runtime the
  // value is always a plain JSON row array. The intermediate `unknown` bridge
  // is the standard pattern used throughout this DAL (see type-guards.ts).
  const rawRows: unknown = data ?? [];
  const rows = rawRows as T[];
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  let nextCursor: string | null = null;
  if (hasMore && page.length > 0) {
    const last = page[page.length - 1];
    const rec = last as Record<string, unknown>;
    const lastVal = String(rec[col] ?? "");
    const lastId = String(rec["id"] ?? "");
    nextCursor = encodeCursor(col, lastVal, lastId);
  }

  return { data: page, cursor: nextCursor, hasMore };
}
