/**
 * R12 (Audit Fix Verification): Dead response-HMAC control removed.
 *
 * Static-source assertions that the dead `computeResponseHmac` integrity control
 * and its `response_hmac` field have been fully removed from the codebase, and
 * that no crypto import was left orphaned by that removal.
 *
 * These checks scan the application/source trees (excluding node_modules, build
 * output, .kiro spec files, and this test file) and ignore comment/spec anchors —
 * e.g. the explanatory B-F4 comment in `app/api/cron/commission-ingest/route.ts`
 * that documents the removal must NOT be treated as a live reference.
 *
 * Validates: Requirements 12.1, 12.2, 12.3
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const repoRoot = join(__dirname, "..");

/** Application + e2e source roots that constitute "source" for this requirement. */
const SCAN_ROOTS = ["app", "lib", "workers", "scripts", "e2e", "middleware.ts"];

/** Directory names that are never source (build output, deps, spec docs, VCS). */
const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  ".git",
  ".kiro",
  "coverage",
  "dist",
  ".open-next",
  ".wrangler",
]);

const SOURCE_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts", ".js", ".mjs", ".cjs"];

/**
 * This test file necessarily mentions the forbidden identifiers (in regexes,
 * descriptions, and comments), so it must exclude itself from the scan to avoid
 * matching its own contents.
 */
const SELF_BASENAME = "response-hmac-removed.test.ts";

function isSourceFile(name: string): boolean {
  return SOURCE_EXTENSIONS.some((ext) => name.endsWith(ext));
}

/** Recursively collect source files under a directory (or return a single file). */
function collectSources(absPath: string): string[] {
  let st;
  try {
    st = statSync(absPath);
  } catch {
    return [];
  }

  if (!st.isDirectory()) {
    const base = absPath.split(/[\\/]/).pop() ?? "";
    return isSourceFile(base) && base !== SELF_BASENAME ? [absPath] : [];
  }

  const out: string[] = [];
  for (const entry of readdirSync(absPath)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(absPath, entry);
    const childStat = statSync(full);
    if (childStat.isDirectory()) {
      out.push(...collectSources(full));
    } else if (isSourceFile(entry) && entry !== SELF_BASENAME) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Strip block and line comments so that comment/spec anchors mentioning the
 * removed identifiers are not counted as live references. The line-comment
 * stripper preserves `://` (e.g. URLs in string literals) by requiring the `//`
 * to not be immediately preceded by a colon.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/** Find the first line (1-indexed) in `src` whose text matches `re`, for diagnostics. */
function firstMatchingLine(src: string, re: RegExp): { line: number; text: string } | null {
  const lines = src.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (re.test(line)) return { line: i + 1, text: line.trim() };
  }
  return null;
}

const allSources = SCAN_ROOTS.flatMap((root) => collectSources(join(repoRoot, root)));

describe("R12: dead response-HMAC control removed", () => {
  it("scans a non-trivial number of source files (sanity guard)", () => {
    // Guards against the walk silently finding nothing and the assertions
    // below passing vacuously.
    expect(allSources.length).toBeGreaterThan(50);
  });

  // R12.1 — no computeResponseHmac definition (or any live reference) remains.
  it("defines no `computeResponseHmac` anywhere in source", () => {
    const violations: string[] = [];
    for (const file of allSources) {
      const code = stripComments(readFileSync(file, "utf8"));
      if (/computeResponseHmac/.test(code)) {
        const rel = relative(repoRoot, file).replaceAll("\\", "/");
        const loc = firstMatchingLine(code, /computeResponseHmac/);
        violations.push(`${rel}${loc ? `:${loc.line} → ${loc.text}` : ""}`);
      }
    }
    expect(
      violations,
      `Found live computeResponseHmac references (should be fully removed):\n${violations.join("\n")}`,
    ).toEqual([]);
  });

  // R12.3 — no response_hmac reference remains in source (comment anchors excluded).
  it("references no `response_hmac` anywhere in source (comment anchors excluded)", () => {
    const violations: string[] = [];
    for (const file of allSources) {
      const code = stripComments(readFileSync(file, "utf8"));
      if (/response_hmac/.test(code)) {
        const rel = relative(repoRoot, file).replaceAll("\\", "/");
        const loc = firstMatchingLine(code, /response_hmac/);
        violations.push(`${rel}${loc ? `:${loc.line} → ${loc.text}` : ""}`);
      }
    }
    expect(
      violations,
      `Found live response_hmac references (should be fully removed):\n${violations.join("\n")}`,
    ).toEqual([]);
  });

  // R12.3 — explicitly cover the three previously affected usages, which lived in
  // the commission-ingest network fetchers (CJ, Admitad, PartnerStack).
  describe("R12.3: each of the three previously affected fetcher usages is clean", () => {
    const ingestRoute = join(repoRoot, "app/api/cron/commission-ingest/route.ts");
    const fetchers = ["fetchCjReports", "fetchAdmitadReports", "fetchPartnerStackReports"];

    it("the commission-ingest route still defines all three network fetchers", () => {
      const src = readFileSync(ingestRoute, "utf8");
      for (const fetcher of fetchers) {
        expect(src, `${fetcher} should still exist in commission-ingest route`).toContain(fetcher);
      }
    });

    it("the commission-ingest route has no live response_hmac / computeResponseHmac reference", () => {
      const code = stripComments(readFileSync(ingestRoute, "utf8"));
      expect(code).not.toMatch(/response_hmac/);
      expect(code).not.toMatch(/computeResponseHmac/);
    });
  });
});

// ── R12.2: no crypto import orphaned by the response-HMAC removal ──────────────

/** Parse the binding identifiers introduced by an import clause. */
function parseImportBindings(clause: string): string[] {
  const bindings: string[] = [];
  // Named imports: { a, b as c, type D }
  const namedMatch = clause.match(/\{([^}]*)\}/);
  if (namedMatch) {
    for (const part of (namedMatch[1] ?? "").split(",")) {
      const token = part.trim().replace(/^type\s+/, "");
      if (!token) continue;
      const asMatch = token.match(/\bas\s+([A-Za-z_$][\w$]*)/);
      bindings.push(asMatch?.[1] ?? token);
    }
  }
  // Namespace import: * as crypto
  const nsMatch = clause.match(/\*\s+as\s+([A-Za-z_$][\w$]*)/);
  if (nsMatch?.[1]) bindings.push(nsMatch[1]);
  // Default import: leading bare identifier (strip any named/namespace portion first)
  const defaultPortion = clause.replace(/\{[^}]*\}/, "").replace(/\*\s+as\s+[A-Za-z_$][\w$]*/, "");
  const defaultMatch = defaultPortion.match(/^[\s,]*([A-Za-z_$][\w$]*)/);
  if (defaultMatch?.[1] && !nsMatch) bindings.push(defaultMatch[1]);
  return [...new Set(bindings)];
}

interface CryptoImport {
  file: string;
  importStatement: string;
  bindings: string[];
}

function findCryptoImports(src: string, file: string): CryptoImport[] {
  const out: CryptoImport[] = [];
  const importRe = /import\s+([\s\S]+?)\s+from\s+["'](?:node:)?crypto["'];?/g;
  let m: RegExpExecArray | null;
  while ((m = importRe.exec(src)) !== null) {
    out.push({ file, importStatement: m[0], bindings: parseImportBindings(m[1] ?? "") });
  }
  return out;
}

describe("R12.2: crypto imports are preserved only where still used", () => {
  const cryptoImports = allSources.flatMap((file) =>
    findCryptoImports(readFileSync(file, "utf8"), file),
  );

  it("finds the known still-in-use crypto importers (sanity guard)", () => {
    const files = cryptoImports.map((c) => relative(repoRoot, c.file).replaceAll("\\", "/"));
    // These import crypto for live, non-HMAC purposes and must be retained.
    expect(files).toContain("lib/dal/commissions.ts");
    expect(files).toContain("lib/click-queue.ts");
  });

  it("retains no orphaned crypto import (every imported binding is still referenced)", () => {
    const orphaned: string[] = [];
    for (const imp of cryptoImports) {
      const src = readFileSync(imp.file, "utf8");
      // Remove the import statement itself, then comments, before counting usages.
      const codeWithoutImport = stripComments(src.replace(imp.importStatement, ""));
      for (const binding of imp.bindings) {
        const usageRe = new RegExp(`\\b${binding.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
        if (!usageRe.test(codeWithoutImport)) {
          const rel = relative(repoRoot, imp.file).replaceAll("\\", "/");
          orphaned.push(`${rel}: '${binding}' imported from crypto but never used`);
        }
      }
    }
    expect(
      orphaned,
      `Found orphaned crypto import(s) — remove the import or restore the usage:\n${orphaned.join("\n")}`,
    ).toEqual([]);
  });
});
