/**
 * audit follow-up G-T-01: stripe_events schema regression test
 *
 * The deep audit (S-06) hit the failure mode where production code
 * referenced `stripe_events.created_at` while the column did not
 * exist on the live DB — only a migration (00080) restored it.
 *
 * This test runs in plain `vitest` (no DB) by parsing the migration
 * SQL files in-tree. It guarantees that:
 *
 *   1. A migration adds `stripe_events.created_at` (i.e. nobody
 *      accidentally deletes 00080 in a future squash / rebase).
 *   2. The column type is `timestamptz` (or `timestamp with time
 *      zone`) and NOT NULL with a default — anything else regresses
 *      the retention purge guarantees.
 *   3. The retention purge function references `stripe_events`.
 *
 * For a live `pg_attribute` check (the form the audit recommended),
 * see `__tests__/integration/stripe-events-schema.integration.test.ts`
 * which runs in the integration test job and connects to the staging
 * DB. The unit-level check here is what runs on every PR.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS_DIR = join(__dirname, "..", "supabase", "migrations");

function loadMigrations(): { filename: string; body: string }[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql") && !f.endsWith("-down.sql"))
    .sort()
    .map((filename) => ({
      filename,
      body: readFileSync(join(MIGRATIONS_DIR, filename), "utf8"),
    }));
}

function stripSqlComments(sql: string): string {
  // Strip line comments. Block comments are not used in this repo's
  // migrations — keeping the parser dumb makes the assertions easier
  // to reason about.
  return sql
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n");
}

describe("stripe_events schema (audit S-06 / G-T-01)", () => {
  const migrations = loadMigrations();

  it("at least one migration adds the `created_at` column to stripe_events", () => {
    const matcher =
      /alter\s+table\s+(?:public\.)?stripe_events\s+add\s+column(?:\s+if\s+not\s+exists)?\s+created_at/i;

    const hits = migrations.filter((m) => matcher.test(stripSqlComments(m.body)));

    expect(
      hits.length,
      "Expected at least one migration to ADD COLUMN created_at to stripe_events. " +
        "If you removed 00080_stripe_events_created_at.sql, replace it with an " +
        "equivalent migration before merging.",
    ).toBeGreaterThan(0);
  });

  it("the added column is timestamptz, NOT NULL, with a default", () => {
    const m = migrations.find((x) =>
      /add\s+column(?:\s+if\s+not\s+exists)?\s+created_at/i.test(stripSqlComments(x.body)),
    );
    expect(m, "stripe_events.created_at migration is missing").toBeDefined();

    const body = stripSqlComments(m!.body);
    const stmt = body.match(
      /alter\s+table\s+(?:public\.)?stripe_events\s+add\s+column(?:\s+if\s+not\s+exists)?\s+created_at[^;]*;/i,
    );
    expect(stmt, "could not isolate the ADD COLUMN statement").not.toBeNull();

    const text = stmt![0].toLowerCase();
    expect(
      /timestamptz|timestamp\s+with\s+time\s+zone/.test(text),
      "stripe_events.created_at must be timestamptz",
    ).toBe(true);
    expect(/not\s+null/.test(text), "stripe_events.created_at must be NOT NULL").toBe(true);
    expect(/default\s+/.test(text), "stripe_events.created_at must declare a DEFAULT").toBe(true);
  });

  it("an index covers the new column", () => {
    const matcher =
      /create\s+index(?:\s+if\s+not\s+exists)?\s+\S+\s+on\s+(?:public\.)?stripe_events\s*\(\s*created_at/i;

    const hits = migrations.filter((m) => matcher.test(stripSqlComments(m.body)));
    expect(
      hits.length,
      "Expected at least one migration to CREATE INDEX on stripe_events(created_at).",
    ).toBeGreaterThan(0);
  });

  it("retention purge function references stripe_events", () => {
    const purge = migrations.find((m) =>
      /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?purge_retention\s*\(/i.test(
        stripSqlComments(m.body),
      ),
    );
    expect(purge, "purge_retention function is missing").toBeDefined();
    expect(
      /stripe_events/i.test(stripSqlComments(purge!.body)),
      "purge_retention must reference stripe_events to satisfy the 90-day retention contract",
    ).toBe(true);
  });
});
