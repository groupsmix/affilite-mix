#!/usr/bin/env node
/**
 * scripts/inject-tail-consumers.mjs
 *
 * N-003 / Audit R-008: when the log-shipper Tail Worker is deployed
 * alongside the main Worker, this script rewrites the root
 * `wrangler.jsonc` so the `"tail_consumers"` array references the
 * shipper service. It is invoked by the deploy workflow only when
 * `LOG_SHIPPER_ENABLED=true` so plain `npm run deploy` from a fresh
 * checkout (no shipper deployed) still works.
 *
 * Why a script instead of editing wrangler.jsonc statically:
 *   - Referencing a non-existent service in `tail_consumers` makes
 *     every wrangler deploy fail. Operators that haven't provisioned
 *     the shipper yet would be hard-blocked.
 *   - This script keeps the static config opt-out by default and
 *     lets the deploy workflow flip it on once the shipper exists.
 *
 * Usage:
 *   SHIPPER_SERVICE=affilite-mix-log-shipper \
 *     node scripts/inject-tail-consumers.mjs path/to/wrangler.jsonc
 *
 * The script is idempotent: re-running with the same service is a no-op.
 * Comments in the JSONC file are preserved by editing the raw text;
 * the script only touches the `"tail_consumers"` array literal.
 */
import { readFileSync, writeFileSync } from "node:fs";

const path = process.argv[2];
if (!path) {
  console.error("usage: inject-tail-consumers.mjs <wrangler.jsonc>");
  process.exit(2);
}

const service = process.env.SHIPPER_SERVICE;
if (!service) {
  console.error("::error::SHIPPER_SERVICE env var is required");
  process.exit(2);
}

const original = readFileSync(path, "utf8");

// Match the actual `"tail_consumers"` array assignment at the start of a
// line (anchored after leading whitespace) so we don't accidentally edit
// the example inside the JSONC comment block above it. This handles both
// the empty `[]` form and a previously-injected single-service form so
// the script is idempotent.
const re = /^(\s*)"tail_consumers"\s*:\s*\[(?:\s*\{\s*"service"\s*:\s*"[^"]*"\s*\}\s*)?\s*\]/m;
const match = original.match(re);
if (!match) {
  console.error("::error::tail_consumers key not found in", path);
  console.error(
    '::error::expected an empty `"tail_consumers": []` (or a previously injected single-service form) at the top level of the config.',
  );
  process.exit(1);
}

const indent = match[1];
const replacement = `${indent}"tail_consumers": [\n${indent}\t{ "service": "${service}" }\n${indent}]`;
const updated = original.replace(re, replacement);

if (updated === original) {
  // Already pointing at our service.
  console.log(`tail_consumers already references "${service}" — no-op.`);
  process.exit(0);
}

writeFileSync(path, updated);
console.log(`tail_consumers rewritten to reference "${service}".`);
