#!/usr/bin/env tsx
/**
 * scripts/audit-password-hashes.ts
 *
 * Classifies every stored admin password hash so you know whether it is safe
 * to delete the legacy PBKDF2 verification path in lib/password.ts.
 *
 * lib/password.ts verifies three hash shapes and upgrades older ones to the
 * current `$sha256$`+bcrypt format on the user's next successful login:
 *   - legacy PBKDF2  "hex:hex"      (weakest — the path we want to remove)
 *   - bcrypt-only    "$2a$..."       (needs a $sha256$ prehash upgrade)
 *   - current        "$sha256$$2a$…" (fully migrated)
 *
 * The PBKDF2 path can only be removed once ZERO users still have a legacy hash,
 * otherwise those users are locked out. Run this before removing it.
 *
 * Usage:
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     npm run audit:password-hashes [-- --json]
 *
 * Exit code: 0 if no legacy PBKDF2 hashes remain, 1 if any still exist.
 */

import { createClient } from "@supabase/supabase-js";

const PREHASH_PREFIX = "$sha256$";

export type HashKind = "legacy-pbkdf2" | "bcrypt-only" | "current-prehash" | "unknown";

/** Classify a stored hash string using the same shape rules as lib/password.ts. */
export function classifyHash(stored: string): HashKind {
  if (stored.startsWith(PREHASH_PREFIX)) return "current-prehash";
  // legacy PBKDF2 is "hexsalt:hexhash" — two hex groups joined by a colon.
  if (/^[0-9a-f]+:[0-9a-f]+$/i.test(stored)) return "legacy-pbkdf2";
  if (/^\$2[aby]\$/.test(stored)) return "bcrypt-only";
  return "unknown";
}

export type AuditTotals = Record<HashKind, number>;

export function tallyHashes(hashes: string[]): AuditTotals {
  const totals: AuditTotals = {
    "legacy-pbkdf2": 0,
    "bcrypt-only": 0,
    "current-prehash": 0,
    unknown: 0,
  };
  for (const h of hashes) totals[classifyHash(h)] += 1;
  return totals;
}

const args = new Set(process.argv.slice(2));
const asJson = args.has("--json");

function fail(msg: string): never {
  console.error(`\u001b[31m✗ ${msg}\u001b[0m`);
  process.exit(1);
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/$/, "");
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) fail("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");

  const sb = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await sb.from("admin_users").select("password_hash");
  if (error) fail(`Failed to read admin_users: ${error.message}`);

  const rows = (data ?? []) as Array<{ password_hash: string | null }>;
  const hashes = rows
    .map((r) => r.password_hash)
    .filter((h): h is string => typeof h === "string" && h.length > 0);

  const totals = tallyHashes(hashes);
  const legacy = totals["legacy-pbkdf2"];

  if (asJson) {
    console.log(
      JSON.stringify(
        { total: hashes.length, safeToRemovePbkdf2: legacy === 0, ...totals },
        null,
        2,
      ),
    );
    process.exit(legacy === 0 ? 0 : 1);
  }

  console.log(`\nPassword hash audit (${hashes.length} admin users)\n`);
  console.log(`  current ($sha256$+bcrypt) : ${totals["current-prehash"]}`);
  console.log(`  bcrypt-only (auto-upgrades): ${totals["bcrypt-only"]}`);
  console.log(`  \u001b[${legacy === 0 ? 32 : 31}mlegacy PBKDF2             : ${legacy}\u001b[0m`);
  if (totals.unknown > 0)
    console.log(`  \u001b[33munknown format            : ${totals.unknown}\u001b[0m`);
  console.log("");

  if (legacy === 0 && totals.unknown === 0) {
    console.log(
      "\u001b[32m✓ No legacy PBKDF2 hashes remain — safe to remove the PBKDF2 path.\u001b[0m\n",
    );
    process.exit(0);
  }
  if (totals.unknown > 0)
    fail("Unknown hash formats present — investigate before removing any path.");
  fail(`${legacy} legacy PBKDF2 hash(es) remain — do NOT remove the PBKDF2 path yet.`);
}

const invokedDirectly =
  typeof process.argv[1] === "string" && /audit-password-hashes\.(ts|js)$/.test(process.argv[1]);
if (invokedDirectly) {
  main().catch((err) => fail(err instanceof Error ? err.message : String(err)));
}
