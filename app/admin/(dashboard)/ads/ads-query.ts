import type { AdPlacementType, AdProvider } from "@/types/database";

import type { AdsTableRow } from "./ads-table";

/** Columns the UI is allowed to sort by. Must match DataTable column ids. */
export const ADS_SORT_COLUMNS = [
  "name",
  "impressions_30d",
  "est_revenue_30d",
  "cpm",
  "created_at",
] as const;
export type AdsSortColumn = (typeof ADS_SORT_COLUMNS)[number];

/** Provider enum — mirrors VALID_PROVIDERS in app/api/admin/ads/route.ts. */
export const ADS_PROVIDER_VALUES = [
  "adsense",
  "carbon",
  "ethicalads",
  "custom",
] as const satisfies readonly AdProvider[];

/** Slot enum — mirrors VALID_PLACEMENT_TYPES in app/api/admin/ads/route.ts. */
export const ADS_SLOT_VALUES = [
  "header",
  "sidebar",
  "in_content",
  "footer",
  "between_posts",
] as const satisfies readonly AdPlacementType[];

/** Values accepted by the `status` facet (maps to is_active). */
export const ADS_STATUS_VALUES = ["active", "inactive"] as const;
export type AdsStatusValue = (typeof ADS_STATUS_VALUES)[number];

export interface AdsQueryParams {
  q: string;
  providers: AdProvider[];
  slots: AdPlacementType[];
  statuses: AdsStatusValue[];
  sortBy: AdsSortColumn;
  sortDesc: boolean;
  page: number;
  pageSize: number;
}

export interface AdsQueryResult {
  rows: AdsTableRow[];
  totalCount: number;
}

function compareRows(a: AdsTableRow, b: AdsTableRow, sortBy: AdsSortColumn): number {
  switch (sortBy) {
    case "name":
      return a.name.localeCompare(b.name);
    case "impressions_30d":
      return a.impressions_30d - b.impressions_30d;
    case "est_revenue_30d":
      return a.est_revenue_30d - b.est_revenue_30d;
    case "cpm":
      return a.cpm - b.cpm;
    case "created_at":
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  }
}

/**
 * Apply search, facet filters, sort, and pagination over the full list of ad
 * placements. The `ad_placements` table is small (one row per placement per
 * site, typically <50), so this runs in-memory on each page render instead of
 * adding a server-side DAL surface.
 */
export function applyAdsQuery(all: AdsTableRow[], params: AdsQueryParams): AdsQueryResult {
  const { q, providers, slots, statuses, sortBy, sortDesc, page, pageSize } = params;

  const providerSet = new Set<AdProvider>(providers);
  const slotSet = new Set<AdPlacementType>(slots);
  const needle = q.trim().toLowerCase();

  let filtered = all.filter((row) => {
    if (providerSet.size > 0 && !providerSet.has(row.provider)) return false;
    if (slotSet.size > 0 && !slotSet.has(row.placement_type)) return false;
    if (statuses.length > 0) {
      const statusValue: AdsStatusValue = row.is_active ? "active" : "inactive";
      if (!statuses.includes(statusValue)) return false;
    }
    if (needle && !row.name.toLowerCase().includes(needle)) return false;
    return true;
  });

  // Stable secondary sort on insertion index keeps order deterministic when
  // primary keys collide (e.g. two placements with identical revenue).
  filtered = filtered
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const cmp = compareRows(a.row, b.row, sortBy);
      if (cmp !== 0) return sortDesc ? -cmp : cmp;
      return a.index - b.index;
    })
    .map(({ row }) => row);

  const totalCount = filtered.length;
  const start = Math.max(0, (page - 1) * pageSize);
  const rows = filtered.slice(start, start + pageSize);
  return { rows, totalCount };
}

function parseCsvEnum<T extends string>(raw: string | undefined, allowed: readonly T[]): T[] {
  if (!raw) return [];
  const allowedSet = new Set<string>(allowed);
  const out: T[] = [];
  for (const part of raw.split(",")) {
    const trimmed = part.trim();
    if (trimmed && allowedSet.has(trimmed)) out.push(trimmed as T);
  }
  return out;
}

export interface AdsSearchParamsInput {
  q?: string;
  "f.provider"?: string;
  "f.placement_type"?: string;
  "f.is_active"?: string;
  sort?: string;
  page?: string;
  size?: string;
}

/** Parse the raw Next.js searchParams into a strongly-typed query object. */
export function parseAdsSearchParams(
  sp: AdsSearchParamsInput,
  defaults: { pageSize: number; sortBy: AdsSortColumn; sortDesc: boolean },
): AdsQueryParams {
  const q = (sp.q ?? "").trim();
  const providers = parseCsvEnum<AdProvider>(sp["f.provider"], ADS_PROVIDER_VALUES);
  const slots = parseCsvEnum<AdPlacementType>(sp["f.placement_type"], ADS_SLOT_VALUES);
  const statuses = parseCsvEnum<AdsStatusValue>(sp["f.is_active"], ADS_STATUS_VALUES);

  let sortBy: AdsSortColumn = defaults.sortBy;
  let sortDesc = defaults.sortDesc;
  if (sp.sort) {
    const [col, dir] = sp.sort.split(":");
    if (col && (ADS_SORT_COLUMNS as readonly string[]).includes(col)) {
      sortBy = col as AdsSortColumn;
      sortDesc = dir === "desc";
    }
  }

  const pageNum = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const rawSize = parseInt(sp.size ?? String(defaults.pageSize), 10);
  const pageSize = rawSize > 0 && rawSize <= 200 ? rawSize : defaults.pageSize;

  return { q, providers, slots, statuses, sortBy, sortDesc, page: pageNum, pageSize };
}
