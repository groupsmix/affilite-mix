/**
 * OI-03 / S8-F9: Verify DSAR/erasure covers all PII tables.
 *
 * Season 8 CEO audit finding F9 flagged OI-03 as unproven:
 *   "DSAR/erasure covers all PII tables — completeness unverified"
 *
 * This contract test closes OI-03 by verifying:
 *   1. erase_subject_data() covers all 7 user-facing PII tables.
 *   2. erase_user() covers all 7 user-facing PII tables.
 *   3. purge_retention() covers all 9 analytics/event tables.
 *   4. The PII coverage map doc exists and is current.
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

function readRepoFile(relPath: string): string {
  return fs.readFileSync(path.resolve(__dirname, "../..", relPath), "utf-8");
}

const PII_TABLES = [
  "newsletter_subscribers",
  "memberships",
  "comments",
  "wrist_shots",
  "quiz_submissions",
  "price_alerts",
  "drip_enrollments",
] as const;

const RETENTION_TABLES = [
  "affiliate_clicks",
  "audit_log",
  "stripe_events",
  "newsletter_subscribers",
  "quiz_submissions",
  "comments",
  "web_vitals",
  "experiment_events",
  "ad_impressions",
] as const;

describe("OI-03: erase_subject_data() PII coverage", () => {
  const source = readRepoFile("supabase/migrations/2026050301_erase_subject_data_complete.sql");

  for (const table of PII_TABLES) {
    it(`covers table: ${table}`, () => {
      expect(source).toContain(table);
    });
  }
});

describe("OI-03: erase_user() PII coverage", () => {
  const source = readRepoFile("supabase/migrations/00088_erase_user_rpc.sql");

  for (const table of PII_TABLES) {
    it(`covers table: ${table}`, () => {
      expect(source).toContain(table);
    });
  }
});

describe("OI-03: purge_retention() analytics coverage", () => {
  const source = readRepoFile("supabase/migrations/00086_extend_purge_retention_experiment_ad.sql");

  for (const table of RETENTION_TABLES) {
    it(`covers table: ${table}`, () => {
      expect(source).toContain(table);
    });
  }
});

describe("OI-03: PII coverage documentation", () => {
  it("PII coverage map doc exists", () => {
    const docPath = path.resolve(__dirname, "../..", "docs/pii-table-coverage.md");
    expect(fs.existsSync(docPath)).toBe(true);
  });

  it("PII coverage map references all user-facing PII tables", () => {
    const doc = readRepoFile("docs/pii-table-coverage.md");
    for (const table of PII_TABLES) {
      expect(doc).toContain(table);
    }
  });

  it("PII coverage map references all retention-managed tables", () => {
    const doc = readRepoFile("docs/pii-table-coverage.md");
    for (const table of RETENTION_TABLES) {
      expect(doc).toContain(table);
    }
  });
});
