/**
 * DB1-01: Verify the UNIQUE constraint on memberships.stripe_subscription_id
 * exists in the migration file, preventing duplicate subscription rows.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/2026052904_db1_01_unique_stripe_subscription_id.sql",
);

describe("DB1-01 — unique stripe_subscription_id", () => {
  const sql = readFileSync(migrationPath, "utf8");

  it("drops the old non-unique index", () => {
    expect(sql).toMatch(/DROP INDEX IF EXISTS idx_memberships_stripe_sub\b/);
  });

  it("creates a unique partial index on stripe_subscription_id", () => {
    expect(sql).toMatch(/CREATE UNIQUE INDEX/i);
    expect(sql).toMatch(/idx_memberships_stripe_sub_unique/);
    expect(sql).toMatch(/ON memberships\s*\(stripe_subscription_id\)/i);
    expect(sql).toMatch(/WHERE stripe_subscription_id IS NOT NULL/i);
  });
});
