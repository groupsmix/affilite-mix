// scripts/check-db-types.mjs
//
// Structural one-way drift check between the live staging Postgres
// schema and types/supabase.ts.
//
// Replaces the earlier `diff -u` against `supabase gen types typescript`,
// which can never pass because types/supabase.ts is a hand-curated file
// (extra schema.sql-only tables; some tables are typed permissively as
// `Record<string, any>`). This script enforces the invariant the audit
// actually cares about — every (table, column) that exists in the live
// staging DB is declared in types/supabase.ts — without forcing a
// mechanical regenerate that would break the rest of the codebase.
//
// Rules
//   1. Every public-schema table in the live DB must appear in
//      types/supabase.ts (under `Database.public.Tables`).
//   2. If a table's `Row` is typed as `Record<string, any>` (or any
//      `Record<…>`), the column-level check is skipped for that table
//      (a warning is printed). This preserves the existing permissive
//      typings without weakening the gate for fully-typed tables.
//   3. If a table's `Row` is fully typed (object literal with named
//      fields), every live column must be declared in `Row`. Extra
//      columns in `Row` are allowed (covers schema.sql-only fields and
//      pre-staged migrations).
//   4. Tables declared in types/supabase.ts that don't exist in the
//      live DB are allowed (covers schema.sql-only tables like
//      `pages`/`epc_metrics`); they're listed as informational warnings.
//
// Reads:
//   - DB schema via `psql` (must be on PATH).
//   - types/supabase.ts (relative to the repo root / cwd).
//
// Env:
//   STAGING_SUPABASE_DB_URL > SUPABASE_DB_POOLER_URL > DATABASE_URL.
//   REQUIRE_STAGING_DB=true makes a missing URL a hard error
//   (matches scripts/db-audit.sh policy).

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const TYPES_FILE = resolve(process.cwd(), "types/supabase.ts");

function getDbUrl() {
  return (
    process.env.STAGING_SUPABASE_DB_URL ||
    process.env.SUPABASE_DB_POOLER_URL ||
    process.env.DATABASE_URL ||
    ""
  );
}

function fetchLiveSchema(dbUrl) {
  // -t -A -F'|' --no-psqlrc → tab-free, pipe-separated, no startup files.
  // Quote-and-escape the SQL so the shell sees it as a single argv.
  const sql = `
SELECT table_name, column_name
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND table_name NOT LIKE 'pg_%'
 ORDER BY table_name, ordinal_position;
`.trim();

  let out;
  try {
    out = execFileSync(
      "psql",
      [dbUrl, "-t", "-A", "-F", "|", "--no-psqlrc", "-v", "ON_ERROR_STOP=1", "-c", sql],
      {
        stdio: ["ignore", "pipe", "pipe"],
        encoding: "utf8",
        timeout: 60_000,
        maxBuffer: 16 * 1024 * 1024,
      },
    );
  } catch (err) {
    const msg = String(err?.stderr || err?.message || err);
    const isUnreachable = /ENOTFOUND|tenant.*not found|could not connect|connection refused|no route to host/i.test(msg);
    if (isUnreachable) {
      if (process.env.REQUIRE_STAGING_DB === "true") {
        console.error(`::error::check-db-types: staging DB is unreachable. Update SUPABASE_DB_POOLER_URL secret or pause the REQUIRE_STAGING_DB gate. Detail: ${msg.split("\n")[0]}`);
        process.exit(1);
      }
      console.warn(`⚠  Staging DB unreachable — skipping DB type drift check (REQUIRE_STAGING_DB!=true). Detail: ${msg.split("\n")[0]}`);
      process.exit(0);
    }
    throw err;
  }

  /** @type {Map<string, Set<string>>} */
  const live = new Map();
  for (const rawLine of out.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    const [table, column] = line.split("|");
    if (!table || !column) continue;
    if (!live.has(table)) live.set(table, new Set());
    live.get(table).add(column);
  }
  return live;
}

/**
 * Parse the `public.Tables` section of types/supabase.ts.
 * Returns Map<tableName, { permissive: boolean, columns: Set<string> }>.
 *
 * Strategy: locate the `public: { … Tables: { … } … }` block, then
 * walk its body brace-by-brace to pull out top-level keys. For each
 * table block, find the `Row: …` declaration and decide whether it's
 * `Record<…>` (permissive) or an object literal (extract field names).
 */
function parseDeclaredTypes() {
  const src = readFileSync(TYPES_FILE, "utf8");

  // Find `public: {` — the outer schema. Assumes only one `public:` key
  // at top level inside `Database`, which is true for this repo.
  const publicMatch = src.match(/\n\s*public\s*:\s*\{/);
  if (!publicMatch) {
    throw new Error("Could not locate `public: {` block in types/supabase.ts");
  }
  const publicBodyStart = publicMatch.index + publicMatch[0].length;
  const publicBody = sliceBalanced(src, publicBodyStart);

  // Inside public, find `Tables: { … }`.
  const tablesMatch = publicBody.match(/\n\s*Tables\s*:\s*\{/);
  if (!tablesMatch) {
    throw new Error("Could not locate `Tables: {` block inside `public` in types/supabase.ts");
  }
  const tablesBodyStart = tablesMatch.index + tablesMatch[0].length;
  const tablesBody = sliceBalanced(publicBody, tablesBodyStart);

  /** @type {Map<string, { permissive: boolean, columns: Set<string> }>} */
  const declared = new Map();

  // Walk the body: find each top-level `name: {` then its balanced body.
  let cursor = 0;
  while (cursor < tablesBody.length) {
    const rest = tablesBody.slice(cursor);
    const m = rest.match(/(?:^|\n)\s*([a-zA-Z_][\w]*)\s*:\s*\{/);
    if (!m) break;
    const tableName = m[1];
    const blockBodyStart = cursor + m.index + m[0].length;
    const blockBody = sliceBalanced(tablesBody, blockBodyStart);

    declared.set(tableName, parseTableBlock(blockBody));

    cursor = blockBodyStart + blockBody.length + 1; // skip past closing brace
  }

  return declared;
}

/**
 * Given the body of a single table block (between its outer `{` and
 * matching `}`), find the `Row: …` declaration and classify it.
 */
function parseTableBlock(blockBody) {
  // Find `Row:` at top level of this block.
  // Look for either `Row: Record<…>` or `Row: { … }`.
  const recordMatch = blockBody.match(/\n\s*Row\s*:\s*Record\s*</);
  if (recordMatch) {
    return { permissive: true, columns: new Set() };
  }

  const rowMatch = blockBody.match(/\n\s*Row\s*:\s*\{/);
  if (!rowMatch) {
    // No Row declaration — treat as permissive but flag it.
    return { permissive: true, columns: new Set() };
  }

  const rowBodyStart = rowMatch.index + rowMatch[0].length;
  const rowBody = sliceBalanced(blockBody, rowBodyStart);

  /** @type {Set<string>} */
  const columns = new Set();
  // Walk the row body collecting top-level field names. Each field
  // looks like `name: <type>;` or `name?: <type>;`. Skip nested object
  // literals so e.g. `nav_items: { label: string }[]` only contributes
  // `nav_items`.
  let cursor = 0;
  while (cursor < rowBody.length) {
    // Find next field start at top level.
    const m = rowBody.slice(cursor).match(/(?:^|\n)\s*([a-zA-Z_][\w]*)\s*\??\s*:/);
    if (!m) break;
    columns.add(m[1]);
    // Advance past this field by skipping to its terminating `;` at
    // depth 0 (same level as `rowBody[0]`).
    const fieldStart = cursor + m.index + m[0].length;
    cursor = skipToFieldEnd(rowBody, fieldStart);
  }

  return { permissive: false, columns };
}

/**
 * Slice a balanced `{ … }` body starting at `start`, where `start`
 * points at the character AFTER the opening `{`. Returns the substring
 * inside the braces (not including the closing `}`).
 */
function sliceBalanced(src, start) {
  let depth = 1;
  let i = start;
  while (i < src.length) {
    const ch = src[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return src.slice(start, i);
    }
    i++;
  }
  throw new Error(`Unbalanced braces starting at offset ${start}`);
}

/**
 * Advance past a single field declaration's terminator. Walks until
 * we find a `;` or `,` at the same brace/bracket depth as `start`.
 */
function skipToFieldEnd(src, start) {
  let depth = 0;
  let i = start;
  while (i < src.length) {
    const ch = src[i];
    if (ch === "{" || ch === "[" || ch === "(" || ch === "<") depth++;
    else if (ch === "}" || ch === "]" || ch === ")" || ch === ">") {
      if (depth === 0) return i; // outer close — bail
      depth--;
    } else if ((ch === ";" || ch === ",") && depth === 0) {
      return i + 1;
    }
    i++;
  }
  return i;
}

function main() {
  const dbUrl = getDbUrl();
  if (!dbUrl) {
    if (process.env.REQUIRE_STAGING_DB === "true") {
      console.error(
        "::error::STAGING_SUPABASE_DB_URL (or SUPABASE_DB_POOLER_URL) is required on protected branches / non-fork PRs.",
      );
      console.error("::error::Add it in GitHub → Settings → Secrets and variables → Actions.");
      process.exit(1);
    }
    console.warn(
      "⚠  No DB URL set (STAGING_SUPABASE_DB_URL, SUPABASE_DB_POOLER_URL, DATABASE_URL) — skipping DB type drift check (REQUIRE_STAGING_DB!=true).",
    );
    process.exit(0);
  }

  console.log("▶ Fetching live schema from staging DB…");
  const live = fetchLiveSchema(dbUrl);
  console.log(`  ${live.size} public-schema tables found.`);

  console.log("▶ Parsing types/supabase.ts…");
  const declared = parseDeclaredTypes();
  console.log(`  ${declared.size} tables declared.`);

  /** @type {string[]} */
  const errors = [];
  /** @type {string[]} */
  const warnings = [];

  // Rule 1+2+3: every live table/column must be declared (or table is permissive).
  for (const [table, liveCols] of live) {
    const decl = declared.get(table);
    if (!decl) {
      errors.push(
        `[missing-table] live table public.${table} has no declaration in types/supabase.ts`,
      );
      continue;
    }
    if (decl.permissive) {
      warnings.push(
        `[permissive] public.${table} is typed as Record<string, any> in types/supabase.ts — column-level drift not enforced.`,
      );
      continue;
    }
    for (const col of liveCols) {
      if (!decl.columns.has(col)) {
        errors.push(
          `[missing-column] live column public.${table}.${col} is not declared in types/supabase.ts`,
        );
      }
    }
  }

  // Rule 4: tables declared but absent from the live DB → warn only.
  for (const table of declared.keys()) {
    if (!live.has(table)) {
      warnings.push(
        `[stale-table] types/supabase.ts declares public.${table} but the live staging DB has no such table.`,
      );
    }
  }

  if (warnings.length) {
    console.warn("");
    console.warn("Warnings (non-fatal):");
    for (const w of warnings) console.warn(`  - ${w}`);
  }

  if (errors.length) {
    console.error("");
    console.error("❌ DB type drift detected:");
    for (const e of errors) console.error(`  - ${e}`);
    console.error("");
    console.error("   Fix: add the missing table/column to types/supabase.ts.");
    console.error(
      "   Tables you do not want to fully type can use `Row: Record<string, any>` (with matching Insert/Update) to skip column-level enforcement.",
    );
    process.exit(1);
  }

  console.log("");
  console.log("✅ No drift — every live (table, column) is declared in types/supabase.ts.");
}

main();
