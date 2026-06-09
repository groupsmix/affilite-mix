/**
 * AUDIT-11 regression guard: every copy of the `Permissions-Policy`
 * header value in this repo must be byte-for-byte identical.
 *
 * Why this matters:
 *   `Permissions-Policy` is emitted from three places:
 *     1. The static `headers()` config in `next.config.ts` (covers paths
 *        outside the middleware matcher).
 *     2. The per-request `applySecurityHeaders` helper in
 *        `lib/middleware-helpers.ts` (the authoritative path).
 *     3. The F10 error-path fallback inside `middleware.ts` (used when
 *        middleware itself fails before the helper can run).
 *   If any one of these drifts, whichever layer wins the precedence race
 *   silently strips directives — including the `interest-cohort=()`
 *   (G-51) FLoC/Topics opt-out. The 2026-06 audit re-verification caught
 *   exactly this drift in the F10 fallback. This test prevents recurrence.
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const REPO_ROOT = path.resolve(__dirname, "..");

function readSource(rel: string): string {
  return fs.readFileSync(path.join(REPO_ROOT, rel), "utf8");
}

/**
 * Extract every `Permissions-Policy` value literal from a source file.
 * Matches both the `next.config.ts` shape (`{ key: "Permissions-Policy",
 * value: "..." }`) and the `headers.set("Permissions-Policy", "...")`
 * shape used by middleware / helpers.
 */
function extractPermissionsPolicyValues(source: string): string[] {
  const values: string[] = [];

  // Shape A: `key: "Permissions-Policy", ... value: "..."`
  const headerObjectRe =
    /key\s*:\s*["']Permissions-Policy["'][\s\S]*?value\s*:\s*["']([^"']+)["']/g;
  for (const m of source.matchAll(headerObjectRe)) {
    values.push(m[1]!);
  }

  // Shape B: `.set("Permissions-Policy", "...")` — value literal may sit on
  // the next line, so allow whitespace/newlines between args.
  const headerSetRe = /\.set\(\s*["']Permissions-Policy["']\s*,\s*["']([^"']+)["']/g;
  for (const m of source.matchAll(headerSetRe)) {
    values.push(m[1]!);
  }

  return values;
}

describe("AUDIT-11 Permissions-Policy parity", () => {
  const sources = {
    "next.config.ts": readSource("next.config.ts"),
    "middleware.ts": readSource("middleware.ts"),
    "lib/middleware-helpers.ts": readSource("lib/middleware-helpers.ts"),
  };

  const valuesByFile: Record<string, string[]> = Object.fromEntries(
    Object.entries(sources).map(([f, src]) => [f, extractPermissionsPolicyValues(src)]),
  );

  it("each file declares at least one Permissions-Policy value", () => {
    for (const [file, values] of Object.entries(valuesByFile)) {
      expect(values.length, `${file} has no Permissions-Policy literal`).toBeGreaterThan(0);
    }
  });

  it("every Permissions-Policy value across all three files is byte-identical", () => {
    const all = Object.values(valuesByFile).flat();
    const unique = Array.from(new Set(all));
    expect(
      unique,
      "Permissions-Policy values drifted across files. Found distinct values:\n" +
        unique.map((v) => `  - ${JSON.stringify(v)}`).join("\n") +
        "\nPer-file breakdown:\n" +
        Object.entries(valuesByFile)
          .map(([f, vs]) => `  ${f}:\n` + vs.map((v) => `    ${JSON.stringify(v)}`).join("\n"))
          .join("\n"),
    ).toHaveLength(1);
  });

  it("the unified value includes `interest-cohort=()` (G-51 anti-FLoC/Topics)", () => {
    const all = Object.values(valuesByFile).flat();
    for (const v of all) {
      expect(v, `Permissions-Policy literal missing G-51 opt-out: ${v}`).toContain(
        "interest-cohort=()",
      );
    }
  });
});
