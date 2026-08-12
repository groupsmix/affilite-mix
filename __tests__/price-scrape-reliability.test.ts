import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const route = fs.readFileSync(path.join(root, "app/api/cron/price-scrape/route.ts"), "utf8");
const migration = fs.readFileSync(
  path.join(root, "supabase/migrations/2026071504_price_snapshots_daily_idempotency.sql"),
  "utf8",
);

describe("price catalog snapshot reliability", () => {
  it("uses a bounded keyset checkpoint instead of an unbounded catalog query", () => {
    expect(route).toContain('query.gt("id", afterId)');
    expect(route).toContain(".limit(PRODUCT_PAGE_SIZE)");
    expect(route).toContain("MAX_PRODUCT_PAGES");
    expect(route).not.toContain(".range(start, end)");
  });

  it("batches alert lookup and bounds transient email retries", () => {
    expect(route).toContain("findTriggeredAlertsForProducts");
    expect(route).toContain("fetchWithTimeout");
    expect(route).toContain("retryableStatuses: [429, 500, 502, 503, 504]");
  });

  it("does not fabricate a sender when price-alert email configuration is missing", () => {
    expect(route).toContain("const fromEmail = process.env.NEWSLETTER_FROM_EMAIL;");
    expect(route).toContain("Price alert email sender is not configured");
    expect(route).toContain(
      'captureException(error, { context: "[cron/price-scrape] sender not configured" })',
    );
    expect(route).toContain("if (!fromEmail)");
    expect(route).toContain("continue;");
    expect(route).not.toContain("noreply@example.com");
  });

  it("labels snapshots as catalog-derived and deduplicates daily retries", () => {
    expect(route).toContain('CATALOG_SNAPSHOT_SOURCE = "catalog_snapshot"');
    expect(route).toContain('"Price catalog snapshot complete"');
    expect(migration).toContain(
      "ON public.price_snapshots (site_id, product_id, source, snapshot_date)",
    );
    expect(migration).toContain("ranked.duplicate_rank > 1");
  });
});
