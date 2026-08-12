import { describe, expect, it } from "vitest";
import {
  getDailyClicks,
  getTopContentSlugs,
  getTopProducts,
  getTopReferrers,
} from "@/lib/dal/affiliate-clicks";

type Row = {
  id: string;
  site_id: string;
  product_name: string;
  referrer: string;
  content_slug: string;
  created_at: string;
  is_internal: boolean;
};

class FakeAnalyticsClient {
  constructor(private readonly rows: Row[]) {}

  from() {
    const client = this;
    const state: {
      count: boolean;
      siteId?: string;
      since?: string;
      until?: string;
      afterId?: string;
      pageSize?: number;
    } = { count: false };

    const builder = {
      select(_columns: string, options?: { count?: string }) {
        state.count = options?.count === "exact";
        return builder;
      },
      eq(column: string, value: unknown) {
        if (column === "site_id") state.siteId = String(value);
        return builder;
      },
      gte(column: string, value: string) {
        if (column === "created_at") state.since = value;
        return builder;
      },
      lte(column: string, value: string) {
        if (column === "created_at") state.until = value;
        return builder;
      },
      order() {
        return builder;
      },
      gt(column: string, value: string) {
        if (column === "id") state.afterId = value;
        return builder;
      },
      limit(value: number) {
        state.pageSize = value;
        return builder;
      },
      then<TResult1 = unknown, TResult2 = never>(
        onFulfilled?:
          | ((value: { data: Row[]; error: null; count: number | null }) => TResult1)
          | null,
        onRejected?: ((reason: unknown) => TResult2) | null,
      ): Promise<TResult1 | TResult2> {
        const matching = client.rows
          .filter((row) => row.site_id === state.siteId)
          .filter((row) => !row.is_internal)
          .filter((row) => !state.since || row.created_at >= state.since)
          .filter((row) => !state.until || row.created_at <= state.until)
          .filter((row) => !state.afterId || row.id > state.afterId)
          .sort((a, b) => a.id.localeCompare(b.id));
        const data = matching.slice(0, state.pageSize);
        return Promise.resolve({
          data,
          error: null,
          count: state.count ? matching.length : null,
        }).then(onFulfilled, onRejected);
      },
    };
    return builder;
  }
}

const rows: Row[] = Array.from({ length: 10_051 }, (_, index) => ({
  id: String(index + 1).padStart(6, "0"),
  site_id: "site-1",
  product_name: index < 10_001 ? "Popular" : "Other",
  referrer: index < 10_001 ? "search.example" : "",
  content_slug: index < 10_001 ? "popular-page" : "",
  created_at: "2026-01-15T12:00:00.000Z",
  is_internal: false,
}));

const getClient = () => new FakeAnalyticsClient(rows);

describe("custom-range analytics pagination", () => {
  it("aggregates every row across pages, including a partial final page", async () => {
    const [products, referrers, slugs, daily] = await Promise.all([
      getTopProducts("site-1", "2026-01-01", 10, "2026-01-31", getClient as never),
      getTopReferrers("site-1", "2026-01-01", 10, "2026-01-31", getClient as never),
      getTopContentSlugs("site-1", "2026-01-01", 10, "2026-01-31", getClient as never),
      getDailyClicks("site-1", { since: "2026-01-01", until: "2026-01-31" }, getClient as never),
    ]);

    expect(products).toEqual([
      { product_name: "Popular", click_count: 10_001 },
      { product_name: "Other", click_count: 50 },
    ]);
    expect(referrers).toEqual([
      { referrer: "search.example", click_count: 10_001 },
      { referrer: "(direct)", click_count: 50 },
    ]);
    expect(slugs).toEqual([{ content_slug: "popular-page", click_count: 10_001 }]);
    expect(daily.find((row) => row.date === "2026-01-15")).toEqual({
      date: "2026-01-15",
      count: 10_051,
    });
  });
});
