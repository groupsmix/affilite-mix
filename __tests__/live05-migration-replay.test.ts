/**
 * LIVE-05 — fresh-DB replay safety
 *
 * The deploy pipeline replays every migration on a clean staging DB
 * before promoting to production. That replay was failing in 00003
 * because CREATE POLICY / CREATE INDEX statements referenced
 * `scheduled_jobs`, which was only defined in the legacy schema.sql
 * and had no creating migration.
 *
 * This test pins the fix: every reference to scheduled_jobs in
 * migrations 00003 / 00020 / 00024 must be wrapped in a
 * `to_regclass IS NOT NULL` guard, and a canonical CREATE TABLE
 * migration must exist in the chain.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const MIG_DIR = resolve(process.cwd(), "supabase", "migrations");

function read(rel: string): string {
  return readFileSync(join(MIG_DIR, rel), "utf8");
}

describe("LIVE-05 — fresh-DB migration replay safety", () => {
  it("00003 wraps the scheduled_jobs CREATE POLICY in a to_regclass guard", () => {
    const src = read("00003_rls_defense_in_depth.sql");
    expect(src).toMatch(/to_regclass\(\s*'public\.scheduled_jobs'\s*\)\s+IS NOT NULL/);
    // The bare unguarded CREATE POLICY pattern must not reappear.
    expect(src).not.toMatch(/^\s*CREATE POLICY [^\n]+ON scheduled_jobs\b/m);
  });

  it("00020 wraps scheduled_jobs / ad_placements / audit_log policies in to_regclass guards", () => {
    const src = read("00020_harden_rls_and_add_indexes.sql");
    for (const table of [
      "scheduled_jobs",
      "ad_placements",
      "ad_impressions",
      "shared_content",
      "niche_templates",
      "audit_log",
      "newsletter_subscribers",
      "categories",
      "products",
      "content",
      "content_products",
      "affiliate_clicks",
    ]) {
      expect(src, `00020 missing to_regclass guard for ${table}`).toMatch(
        new RegExp(`to_regclass\\(\\s*'public\\.${table}'\\s*\\)\\s+IS NOT NULL`),
      );
    }
  });

  it("00024 wraps the scheduled_jobs CREATE INDEX in a to_regclass guard", () => {
    const src = read("00024_harden_public_rls_and_indexes.sql");
    expect(src).toMatch(/to_regclass\(\s*'public\.scheduled_jobs'\s*\)\s+IS NOT NULL/);
  });

  it("a canonical CREATE TABLE IF NOT EXISTS scheduled_jobs migration exists", () => {
    const files = readdirSync(MIG_DIR).filter(
      (f) => f.endsWith(".sql") && !f.endsWith("-down.sql"),
    );
    const owners = files.filter((f) => {
      const src = readFileSync(join(MIG_DIR, f), "utf8");
      return /CREATE TABLE\s+IF NOT EXISTS\s+scheduled_jobs\s*\(/i.test(src);
    });
    expect(
      owners.length,
      `expected exactly one migration to create scheduled_jobs, found: ${JSON.stringify(owners)}`,
    ).toBe(1);
  });
});
