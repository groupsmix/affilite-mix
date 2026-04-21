import { describe, it, expect } from "vitest";

import {
  applyAdsQuery,
  parseAdsSearchParams,
  type AdsQueryParams,
} from "@/app/admin/(dashboard)/ads/ads-query";
import type { AdsTableRow } from "@/app/admin/(dashboard)/ads/ads-table";

function makeRow(overrides: Partial<AdsTableRow>): AdsTableRow {
  return {
    id: overrides.id ?? "id",
    name: overrides.name ?? "sidebar-top",
    placement_type: overrides.placement_type ?? "sidebar",
    provider: overrides.provider ?? "adsense",
    is_active: overrides.is_active ?? true,
    impressions_30d: overrides.impressions_30d ?? 0,
    est_revenue_30d: overrides.est_revenue_30d ?? 0,
    cpm: overrides.cpm ?? 0,
    cpm_is_override: overrides.cpm_is_override ?? false,
    created_at: overrides.created_at ?? "2024-01-01T00:00:00.000Z",
  };
}

const BASE_QUERY: AdsQueryParams = {
  q: "",
  providers: [],
  slots: [],
  statuses: [],
  sortBy: "est_revenue_30d",
  sortDesc: true,
  page: 1,
  pageSize: 50,
};

const ROWS: AdsTableRow[] = [
  makeRow({
    id: "1",
    name: "sidebar-top",
    placement_type: "sidebar",
    provider: "adsense",
    is_active: true,
    impressions_30d: 5_000,
    est_revenue_30d: 10,
    cpm: 2,
    created_at: "2024-01-05T00:00:00.000Z",
  }),
  makeRow({
    id: "2",
    name: "in-content-1",
    placement_type: "in_content",
    provider: "carbon",
    is_active: true,
    impressions_30d: 20_000,
    est_revenue_30d: 80,
    cpm: 4,
    created_at: "2024-01-10T00:00:00.000Z",
  }),
  makeRow({
    id: "3",
    name: "footer-leaderboard",
    placement_type: "footer",
    provider: "ethicalads",
    is_active: false,
    impressions_30d: 1_000,
    est_revenue_30d: 2,
    cpm: 2,
    created_at: "2024-01-20T00:00:00.000Z",
  }),
];

describe("applyAdsQuery", () => {
  it("returns all rows sorted desc by est_revenue_30d by default", () => {
    const { rows, totalCount } = applyAdsQuery(ROWS, BASE_QUERY);
    expect(totalCount).toBe(3);
    expect(rows.map((r) => r.id)).toEqual(["2", "1", "3"]);
  });

  it("filters by multi-select provider", () => {
    const { rows, totalCount } = applyAdsQuery(ROWS, {
      ...BASE_QUERY,
      providers: ["carbon", "ethicalads"],
    });
    expect(totalCount).toBe(2);
    expect(rows.map((r) => r.id).sort()).toEqual(["2", "3"]);
  });

  it("filters by slot (placement_type)", () => {
    const { rows } = applyAdsQuery(ROWS, { ...BASE_QUERY, slots: ["sidebar"] });
    expect(rows.map((r) => r.id)).toEqual(["1"]);
  });

  it("filters by status (active/inactive)", () => {
    const active = applyAdsQuery(ROWS, { ...BASE_QUERY, statuses: ["active"] });
    expect(active.rows.map((r) => r.id).sort()).toEqual(["1", "2"]);

    const inactive = applyAdsQuery(ROWS, { ...BASE_QUERY, statuses: ["inactive"] });
    expect(inactive.rows.map((r) => r.id)).toEqual(["3"]);
  });

  it("searches over placement key case-insensitively", () => {
    const match = applyAdsQuery(ROWS, { ...BASE_QUERY, q: "FOOTER" });
    expect(match.rows.map((r) => r.id)).toEqual(["3"]);

    const partial = applyAdsQuery(ROWS, { ...BASE_QUERY, q: "in-content" });
    expect(partial.rows.map((r) => r.id)).toEqual(["2"]);

    const noMatch = applyAdsQuery(ROWS, { ...BASE_QUERY, q: "nothing" });
    expect(noMatch.rows).toEqual([]);
    expect(noMatch.totalCount).toBe(0);
  });

  it("sorts by impressions_30d ascending", () => {
    const { rows } = applyAdsQuery(ROWS, {
      ...BASE_QUERY,
      sortBy: "impressions_30d",
      sortDesc: false,
    });
    expect(rows.map((r) => r.id)).toEqual(["3", "1", "2"]);
  });

  it("sorts by name ascending", () => {
    const { rows } = applyAdsQuery(ROWS, {
      ...BASE_QUERY,
      sortBy: "name",
      sortDesc: false,
    });
    expect(rows.map((r) => r.id)).toEqual(["3", "2", "1"]);
  });

  it("paginates filtered results", () => {
    const { rows, totalCount } = applyAdsQuery(ROWS, {
      ...BASE_QUERY,
      sortBy: "est_revenue_30d",
      sortDesc: true,
      page: 2,
      pageSize: 2,
    });
    expect(totalCount).toBe(3);
    expect(rows.map((r) => r.id)).toEqual(["3"]);
  });

  it("combines search, facet filters, and sort deterministically", () => {
    const { rows, totalCount } = applyAdsQuery(ROWS, {
      ...BASE_QUERY,
      q: "-",
      providers: ["adsense", "carbon"],
      statuses: ["active"],
      sortBy: "cpm",
      sortDesc: true,
    });
    expect(totalCount).toBe(2);
    expect(rows.map((r) => r.id)).toEqual(["2", "1"]);
  });
});

describe("parseAdsSearchParams", () => {
  const defaults = {
    pageSize: 50,
    sortBy: "est_revenue_30d" as const,
    sortDesc: true,
  };

  it("applies defaults when the URL is empty", () => {
    expect(parseAdsSearchParams({}, defaults)).toEqual({
      q: "",
      providers: [],
      slots: [],
      statuses: [],
      sortBy: "est_revenue_30d",
      sortDesc: true,
      page: 1,
      pageSize: 50,
    });
  });

  it("parses CSV facets and ignores unknown values", () => {
    const result = parseAdsSearchParams(
      {
        "f.provider": "adsense,wat,ethicalads",
        "f.placement_type": "sidebar,bogus",
        "f.is_active": "inactive,active,maybe",
      },
      defaults,
    );
    expect(result.providers).toEqual(["adsense", "ethicalads"]);
    expect(result.slots).toEqual(["sidebar"]);
    expect(result.statuses).toEqual(["inactive", "active"]);
  });

  it("parses sort keys and direction, falling back on invalid columns", () => {
    expect(parseAdsSearchParams({ sort: "impressions_30d:asc" }, defaults)).toMatchObject({
      sortBy: "impressions_30d",
      sortDesc: false,
    });
    expect(parseAdsSearchParams({ sort: "name:desc" }, defaults)).toMatchObject({
      sortBy: "name",
      sortDesc: true,
    });
    // Unknown column → keep defaults.
    expect(parseAdsSearchParams({ sort: "hacker:asc" }, defaults)).toMatchObject({
      sortBy: "est_revenue_30d",
      sortDesc: true,
    });
  });

  it("parses page and size, clamping to sensible values", () => {
    expect(parseAdsSearchParams({ page: "3", size: "25" }, defaults)).toMatchObject({
      page: 3,
      pageSize: 25,
    });
    // page < 1 → clamped to 1.
    expect(parseAdsSearchParams({ page: "0" }, defaults)).toMatchObject({ page: 1 });
    // size out of range → falls back to default.
    expect(parseAdsSearchParams({ size: "9999" }, defaults).pageSize).toBe(defaults.pageSize);
    expect(parseAdsSearchParams({ size: "-1" }, defaults).pageSize).toBe(defaults.pageSize);
  });

  it("parses the search string and trims it", () => {
    expect(parseAdsSearchParams({ q: "  sidebar-top  " }, defaults).q).toBe("sidebar-top");
  });
});
