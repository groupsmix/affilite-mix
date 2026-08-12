import { describe, expect, it } from "vitest";
import {
  getDailyClicks,
  getTopContentSlugs,
  getTopProducts,
  getTopReferrers,
} from "@/lib/dal/affiliate-clicks";

type Row = {
  site_id: string;
  product_name: string;
  referrer: string;
  content_slug: string;
  created_at: string;
  is_internal: boolean;
};

class FakeAnalyticsClient {
  readonly calls: { name: string; args: Record<string, unknown> }[] = [];

  constructor(private readonly rows: Row[]) {}

  rpc(name: string, args: Record<string, unknown>) {
    this.calls.push({ name, args });
    const matching = this.rows.filter(
      (row) =>
        row.site_id === args.p_site_id &&
        !row.is_internal &&
        row.created_at >= String(args.p_since) &&
        (args.p_until === null || row.created_at <= String(args.p_until)),
    );

    if (name === "get_daily_clicks") {
      const counts = new Map<string, number>();
      for (const row of matching) {
        const date = row.created_at.slice(0, 10);
        counts.set(date, (counts.get(date) ?? 0) + 1);
      }
      return Promise.resolve({
        data: Array.from(counts, ([date, count]) => ({ date, count })),
        error: null,
      });
    }

    const key =
      name === "get_top_products"
        ? "product_name"
        : name === "get_top_referrers"
          ? "referrer"
          : "content_slug";
    const counts = new Map<string, number>();
    for (const row of matching) {
      const value =
        key === "referrer"
          ? row.referrer.trim() || "(direct)"
          : row[key as "product_name" | "content_slug"];
      if (key === "content_slug" && !value) continue;
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    const data = Array.from(counts, ([value, count]) => ({
      [key]: value,
      click_count: count,
    })).sort(
      (a, b) => b.click_count - a.click_count || String(a[key]).localeCompare(String(b[key])),
    );
    return Promise.resolve({ data: data.slice(0, Number(args.p_limit)), error: null });
  }
}

const rows: Row[] = Array.from({ length: 10_051 }, (_, index) => ({
  site_id: "site-1",
  product_name: index < 10_001 ? "Popular" : "Other",
  referrer: index < 10_001 ? "search.example" : "",
  content_slug: index < 10_001 ? "popular-page" : "",
  created_at: "2026-01-15T12:00:00.000Z",
  is_internal: false,
}));

describe("custom-range analytics RPC aggregation", () => {
  it("uses one database aggregation call per metric for >10k rows", async () => {
    const client = new FakeAnalyticsClient(rows);
    const getClient = () => client;
    const [products, referrers, slugs, daily] = await Promise.all([
      getTopProducts("site-1", "2026-01-01", 10, "2026-01-31", getClient as never),
      getTopReferrers("site-1", "2026-01-01", 10, "2026-01-31", getClient as never),
      getTopContentSlugs("site-1", "2026-01-01", 10, "2026-01-31", getClient as never),
      getDailyClicks("site-1", { since: "2026-01-01", until: "2026-01-31" }, getClient as never),
    ]);

    expect(client.calls).toHaveLength(4);
    expect(client.calls.every(({ args }) => args.p_until !== null)).toBe(true);
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
