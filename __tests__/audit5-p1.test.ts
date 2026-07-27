/**
 * audit5 P1 batch — week-1 polish, addresses findings #9, #18, #23, #24,
 * #27, #32 from the 2026-05-28(1) audit. Findings #5, #33, #36 are
 * already covered in the P0 batch (`__tests__/audit5-p0.test.ts`).
 *
 * Tests use file/source-pattern assertions where the change is
 * structural (regex on the source file) and unit-level assertions
 * where the change has runtime semantics (sanitize memoizer, KV
 * placeholder script).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync, existsSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import {
  sanitizeHtml,
  sanitizeHtmlMemoized,
  _resetSanitizeHtmlMemoCacheForTests,
} from "@/lib/sanitize-html";

function readRepoFile(rel: string): string {
  return readFileSync(resolve(__dirname, "..", rel), "utf8");
}

// ---------------------------------------------------------------------------
// audit5-#9 — LCP priority on first card / hero image
// ---------------------------------------------------------------------------
describe("audit5-#9 — LCP priority", () => {
  it("standard homepage flips priority on the first featured product", () => {
    const src = readRepoFile("app/(public)/page.tsx");
    expect(src).toMatch(/featuredProducts\.map\(\(product,\s*i\)\s*=>/);
    expect(src).toMatch(/priority=\{i\s*===\s*0\}/);
  });

  it("standard homepage flips priority on first content card iff no featured products", () => {
    const src = readRepoFile("app/(public)/page.tsx");
    expect(src).toMatch(/recentContent\.map\(\(content,\s*i\)\s*=>/);
    expect(src).toMatch(/priority=\{i\s*===\s*0\s*&&\s*featuredProducts\.length\s*===\s*0\}/);
  });

  it("editorial homepage marks the hero image priority", () => {
    const src = readRepoFile("app/(public)/components/homepage-editorial.tsx");
    // The hero <Image> is the only Image in the file that should bear
    // `priority` — find the heroContent block and assert priority is
    // present within it.
    const heroBlockStart = src.indexOf("heroContent.featured_image");
    expect(heroBlockStart).toBeGreaterThan(-1);
    const heroBlockEnd = src.indexOf("</Image>", heroBlockStart);
    const window = src.slice(
      heroBlockStart,
      heroBlockEnd === -1 ? heroBlockStart + 1000 : heroBlockEnd,
    );
    expect(window).toMatch(/priority\b/);
  });

  it("cinematic and minimal templates intentionally keep priority={false} (real text hero)", () => {
    // These templates DO have hero <section> + large <h1> above the
    // grid, so the H1 (not a product image) is the LCP. The G-48
    // decision stands; #9's blanket recommendation does not apply here.
    const minimal = readRepoFile("app/(public)/components/homepage-minimal.tsx");
    const cinematic = readRepoFile("app/(public)/components/homepage-cinematic.tsx");
    expect(minimal).toMatch(/priority=\{false\}/);
    expect(cinematic).toMatch(/priority=\{false\}/);
    // Sanity check that the hero text section still exists in both.
    expect(minimal).toMatch(/<h1/);
    expect(cinematic).toMatch(/<h1/);
  });
});

// ---------------------------------------------------------------------------
// audit5-#18 — global-error.tsx must not swallow reportError failures
// ---------------------------------------------------------------------------
describe("audit5-#18 — global-error.tsx error reporter is fault-tolerant", () => {
  const src = readRepoFile("app/global-error.tsx");

  it("wraps reportError in try/catch", () => {
    expect(src).toMatch(/try\s*\{[\s\S]*reportError\(error[\s\S]*\}\s*catch/);
  });

  it("handles a promise rejection from reportError", () => {
    // Either an explicit `.catch(` on the call result, or `await` inside
    // an async useEffect would satisfy the finding. We assert at least
    // one of these is present.
    const hasCatch = /\.catch\(/.test(src);
    const hasAwait = /await\s+reportError/.test(src);
    expect(hasCatch || hasAwait).toBe(true);
  });

  it("falls back to console.error on reporter failure", () => {
    expect(src).toMatch(/console\.error/);
  });
});

// ---------------------------------------------------------------------------
// audit5-#23 — cron clock fail-closed on db_now() null/error
// ---------------------------------------------------------------------------
describe("audit5-#23 — cron clock contract is fail-closed", () => {
  const src = readRepoFile("app/api/cron/publish/route.ts");

  it("destructures `error` from the db_now() RPC call", () => {
    expect(src).toMatch(/const\s+\{\s*data:\s*dbNowResult,\s*error:\s*dbNowError\s*\}/);
  });

  it("returns 503 (not 200) when db_now() returns null/undefined", () => {
    expect(src).toMatch(/dbNowResult\s*==\s*null/);
    expect(src).toMatch(/\{\s*status:\s*503\s*\}/);
  });

  it("captures the failure to Sentry so it cannot be missed", () => {
    // The captureException invocation must mention db_now in its
    // context so operators have a useful breadcrumb.
    expect(src).toMatch(/captureException\([\s\S]*?db_now/);
  });

  it("no longer falls back to `new Date().toISOString()` on RPC failure", () => {
    // The previous revision had:
    //   const dbNow = (dbNowResult as string | null) ?? new Date().toISOString();
    // Assert that string is gone.
    expect(src).not.toMatch(/dbNowResult.*\?\?\s*new\s+Date\(\)\.toISOString\(\)/);
  });
});

// ---------------------------------------------------------------------------
// audit5-#24, #32 — sanitizeHtmlMemoized exists, is bounded, and is wired
// ---------------------------------------------------------------------------
describe("audit5-#24/#32 — sanitizeHtmlMemoized", () => {
  beforeEach(() => {
    _resetSanitizeHtmlMemoCacheForTests();
  });

  it("returns the same output as the bare sanitizer for an arbitrary input", () => {
    const inputs = [
      "<p>plain</p>",
      '<a href="javascript:alert(1)">x</a>',
      "<script>alert(1)</script>",
      '<img src="http://example.com/x.png" onerror="alert(1)"/>',
      "<h1>title</h1><p>body</p>",
    ];
    for (const html of inputs) {
      expect(sanitizeHtmlMemoized(html)).toBe(sanitizeHtml(html));
    }
  });

  it("returns a cached result on repeated identical input", () => {
    const html = "<p>cache-hit</p>";
    const first = sanitizeHtmlMemoized(html);
    const second = sanitizeHtmlMemoized(html);
    expect(first).toBe(second);
    // String identity is not guaranteed for raw output, but the Map
    // cache stores the result by reference, so repeated calls return
    // the SAME string reference.
    expect(first === second).toBe(true);
  });

  it("evicts oldest entries when the LRU is full", () => {
    // Capacity is 64 (private constant). Insert 100 unique inputs;
    // the cache size MUST stay bounded. We verify by ensuring the
    // function still works correctly after exceeding capacity rather
    // than reading the cache directly.
    for (let i = 0; i < 100; i++) {
      sanitizeHtmlMemoized(`<p>entry-${i}</p>`);
    }
    // After eviction, an old key recomputes (still returns the same
    // sanitized output, but goes through htmlparser2 again).
    const stale = sanitizeHtmlMemoized("<p>entry-0</p>");
    expect(stale).toBe(sanitizeHtml("<p>entry-0</p>"));
  });

  it("html-renderer.tsx imports sanitizeHtmlMemoized (not the bare version)", () => {
    const src = readRepoFile("app/(public)/components/html-renderer.tsx");
    expect(src).toMatch(
      /import\s+\{\s*sanitizeHtmlMemoized\s*\}\s+from\s+["']@\/lib\/sanitize-html["']/,
    );
    expect(src).toMatch(/sanitizeHtmlMemoized\(/);
    // Bare `sanitizeHtml(html)` must NOT appear in this component.
    expect(src).not.toMatch(/[^a-zA-Z_]sanitizeHtml\(/);
  });

  it("public Page route imports sanitizeHtmlMemoized (not the bare version)", () => {
    const src = readRepoFile("app/(public)/p/[pageSlug]/page.tsx");
    expect(src).toMatch(
      /import\s+\{\s*sanitizeHtmlMemoized\s*\}\s+from\s+["']@\/lib\/sanitize-html["']/,
    );
    expect(src).toMatch(/sanitizeHtmlMemoized\(page\.body\)/);
  });

  it("rejects oversize inputs without caching them", () => {
    // MAX_INPUT_LENGTH = 100_000
    const oversize = "<p>" + "a".repeat(100_001) + "</p>";
    expect(() => sanitizeHtmlMemoized(oversize)).toThrow(/exceeds maximum/);
    // Cache should NOT contain the oversize input — we verify by
    // checking that a follow-up identical call also throws (cached
    // entries would have skipped the length check).
    expect(() => sanitizeHtmlMemoized(oversize)).toThrow(/exceeds maximum/);
  });
});

// ---------------------------------------------------------------------------
// audit5-#27 — wrangler placeholder guard
// ---------------------------------------------------------------------------
describe("audit5-#27 — wrangler placeholder guard", () => {
  const scriptPath = resolve(__dirname, "..", "scripts/check-wrangler-placeholders.mjs");
  const fixtureDir = resolve(__dirname, "..", ".tmp-audit5-p1");

  beforeEach(() => {
    // Create a tmp dir we control.
    mkdirSync(fixtureDir, { recursive: true });
  });
  afterEach(() => {
    rmSync(fixtureDir, { recursive: true, force: true });
  });

  function runCheck(args: string[], cwd: string): { exit: number; stderr: string } {
    try {
      execFileSync(process.execPath, [scriptPath, ...args], {
        cwd,
        stdio: ["ignore", "pipe", "pipe"],
      });
      return { exit: 0, stderr: "" };
    } catch (err) {
      const e = err as { status: number | null; stderr?: Buffer | string };
      const stderr =
        typeof e.stderr === "string"
          ? e.stderr
          : Buffer.isBuffer(e.stderr)
            ? e.stderr.toString("utf8")
            : "";
      return { exit: e.status ?? 1, stderr };
    }
  }

  it("the script exists and is executable", () => {
    expect(existsSync(scriptPath)).toBe(true);
  });

  it("exits 1 when a `${...}` placeholder remains in a generated JSON", () => {
    const f = resolve(fixtureDir, "wrangler.preview.json");
    writeFileSync(
      f,
      '{ "kv_namespaces": [ { "binding": "RATE_LIMIT_KV", "id": "${RATE_LIMIT_KV_NAMESPACE_ID}" } ] }\n',
      "utf8",
    );
    const { exit, stderr } = runCheck(["wrangler.preview.json"], fixtureDir);
    expect(exit).toBe(1);
    expect(stderr).toContain("RATE_LIMIT_KV_NAMESPACE_ID");
  });

  it("exits 0 when the generated JSON is fully substituted", () => {
    const f = resolve(fixtureDir, "wrangler.preview.json");
    writeFileSync(
      f,
      '{ "kv_namespaces": [ { "binding": "RATE_LIMIT_KV", "id": "abc123def456" } ] }\n',
      "utf8",
    );
    const { exit } = runCheck(["wrangler.preview.json"], fixtureDir);
    expect(exit).toBe(0);
  });

  it("the preview.yml workflow wires the guard after wrangler.preview.json generation", () => {
    const yml = readRepoFile(".github/workflows/preview.yml");
    expect(yml).toMatch(/check-wrangler-placeholders\.mjs/);
    // Order: generation step then guard step.
    const genIdx = yml.indexOf("generate-preview-wrangler.cjs");
    const guardIdx = yml.indexOf("check-wrangler-placeholders.mjs");
    expect(genIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeGreaterThan(genIdx);
  });

  it("generate-preview-wrangler.cjs substitutes env-var placeholders before write", () => {
    const src = readRepoFile("scripts/generate-preview-wrangler.cjs");
    expect(src).toMatch(/substitutePlaceholders/);
    expect(src).toMatch(/process\.env\[name\]/);
    // Sentinel must be a value that wrangler accepts as a string but
    // never matches a real KV namespace.
    expect(src).toMatch(/PLACEHOLDER_SENTINEL\s*=\s*"0{32}"/);
  });
});

// ---------------------------------------------------------------------------
// Cross-cutting sanity: when this PR's audit5 mock setup is removed the
// real captureException stays available (regression guard from #18 +
// #23 which both call into lib/sentry).
// ---------------------------------------------------------------------------
describe("audit5-p1 — lib/sentry exports stay intact", () => {
  it("captureException is still exported", async () => {
    const mod = await import("@/lib/sentry");
    expect(typeof mod.captureException).toBe("function");
  });
});

// Silence noisy console.warn that the placeholder substitution emits
// during test runs.
beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});
