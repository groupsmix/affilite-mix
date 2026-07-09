#!/usr/bin/env tsx
/**
 * scripts/check-site-config-drift.ts
 *
 * Reconciles the two site sources of truth:
 *   1. Static config  — config/sites/*.ts (compiled into the Worker bundle)
 *   2. Database        — the Supabase `sites` table (runtime source for the
 *                        admin panel and the DB fallback in site-resolution)
 *
 * A domain/id present in one but missing from the other (or with a mismatched
 * `domain` / `is_active`) produces inconsistent site resolution at the
 * middleware layer — worst case a tenant serves the wrong theme/nav or 404s.
 * This script surfaces that drift and exits non-zero when it finds any, so it
 * can gate deploys in CI.
 *
 * Usage (local):
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     npm run check:site-drift
 *
 * Usage (CI):
 *   - name: Check site config/DB drift
 *     run: npm run check:site-drift
 *
 * Flags:
 *   --json    Emit a machine-readable JSON report instead of text.
 *   --strict  Also treat is_active mismatches as drift (default: warn only).
 */

import { createClient } from "@supabase/supabase-js";
import { allSites } from "../config/sites";

type DbSite = {
  id: string;
  domain: string | null;
  is_active: boolean | null;
};

export type DriftReport = {
  missingInDb: Array<{ id: string; domain: string }>;
  missingInConfig: Array<{ id: string; domain: string | null }>;
  domainMismatch: Array<{ id: string; configDomain: string; dbDomain: string | null }>;
  activeMismatch: Array<{ id: string; configActive: boolean; dbActive: boolean | null }>;
};

export type ConfigSite = { id: string; domain: string };

/**
 * Pure drift computation — no I/O, exported for unit testing.
 * Compares static config sites against DB rows and returns the four
 * categories of drift.
 */
export function computeSiteDrift(configSites: ConfigSite[], dbSites: DbSite[]): DriftReport {
  const dbById = new Map(dbSites.map((s) => [s.id, s]));
  const configById = new Map(configSites.map((s) => [s.id, s]));

  const report: DriftReport = {
    missingInDb: [],
    missingInConfig: [],
    domainMismatch: [],
    activeMismatch: [],
  };

  for (const [id, cfg] of configById) {
    const db = dbById.get(id);
    if (!db) {
      report.missingInDb.push({ id, domain: cfg.domain });
      continue;
    }
    if (db.domain !== cfg.domain) {
      report.domainMismatch.push({ id, configDomain: cfg.domain, dbDomain: db.domain });
    }
    if (db.is_active === false) {
      report.activeMismatch.push({ id, configActive: true, dbActive: db.is_active });
    }
  }

  for (const db of dbSites) {
    if (!configById.has(db.id)) {
      report.missingInConfig.push({ id: db.id, domain: db.domain });
    }
  }

  return report;
}

export function hasBlockingDrift(report: DriftReport, strict = false): boolean {
  const hard =
    report.missingInDb.length + report.missingInConfig.length + report.domainMismatch.length;
  return hard + (strict ? report.activeMismatch.length : 0) > 0;
}

const args = new Set(process.argv.slice(2));
const asJson = args.has("--json");
const strict = args.has("--strict");

function fail(msg: string): never {
  console.error(`\u001b[31m✗ ${msg}\u001b[0m`);
  process.exit(1);
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/$/, "");
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !serviceKey) {
    fail("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  const sb = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await sb.from("sites").select("id, domain, is_active");

  if (error) {
    fail(`Failed to read sites table: ${error.message}`);
  }

  const dbSites = (data ?? []) as DbSite[];
  const configSites: ConfigSite[] = allSites.map((s) => ({ id: s.id, domain: s.domain }));
  const configCount = configSites.length;

  const report = computeSiteDrift(configSites, dbSites);

  const hardDrift =
    report.missingInDb.length + report.missingInConfig.length + report.domainMismatch.length;
  const softDrift = report.activeMismatch.length;
  const totalDrift = hardDrift + (strict ? softDrift : 0);

  if (asJson) {
    console.log(
      JSON.stringify(
        {
          ok: totalDrift === 0,
          configCount,
          dbCount: dbSites.length,
          ...report,
        },
        null,
        2,
      ),
    );
    process.exit(totalDrift === 0 ? 0 : 1);
  }

  // Text report
  console.log(`\nSite config drift check`);
  console.log(`  config/sites/*.ts : ${configCount} sites`);
  console.log(`  DB sites table    : ${dbSites.length} sites\n`);

  const line = (label: string, rows: unknown[]) => {
    const color = rows.length === 0 ? 32 : 31; // green / red
    console.log(
      `\u001b[${color}m  ${rows.length === 0 ? "✓" : "✗"} ${label}: ${rows.length}\u001b[0m`,
    );
  };

  line("In config but missing from DB", report.missingInDb);
  for (const r of report.missingInDb) console.log(`      - ${r.id} (${r.domain})`);

  line("In DB but missing from config", report.missingInConfig);
  for (const r of report.missingInConfig)
    console.log(`      - ${r.id} (${r.domain ?? "no domain"})`);

  line("Domain mismatch (config vs DB)", report.domainMismatch);
  for (const r of report.domainMismatch)
    console.log(`      - ${r.id}: config=${r.configDomain} db=${r.dbDomain ?? "null"}`);

  const activeColor = report.activeMismatch.length === 0 ? 32 : strict ? 31 : 33;
  console.log(
    `\u001b[${activeColor}m  ${report.activeMismatch.length === 0 ? "✓" : strict ? "✗" : "⚠"} ` +
      `DB-inactive but active in config: ${report.activeMismatch.length}` +
      `${strict ? "" : " (warn only; pass --strict to fail)"}\u001b[0m`,
  );
  for (const r of report.activeMismatch) console.log(`      - ${r.id}`);

  console.log("");
  if (totalDrift === 0) {
    console.log("\u001b[32m✓ No blocking site config drift.\u001b[0m\n");
    process.exit(0);
  }
  fail(`${totalDrift} blocking drift issue(s) found.`);
}

// Only auto-run when invoked directly (not when imported by tests).
const invokedDirectly =
  typeof process.argv[1] === "string" && /check-site-config-drift\.(ts|js)$/.test(process.argv[1]);

if (invokedDirectly) {
  main().catch((err) => {
    fail(err instanceof Error ? err.message : String(err));
  });
}
