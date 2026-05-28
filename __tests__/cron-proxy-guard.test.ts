/**
 * F-API-01 cron proxy guard: every cron route registered in
 * `lib/cron-registry.ts` MUST either filter by `site_id` or call
 * `.unsafeNoSiteFilter()` on every awaited query against the privileged
 * client. Without this, the privileged-client Proxy throws at runtime
 * and the scheduled job silently fails.
 *
 * This is a static-analysis test, not a runtime mock: it scans every
 * cron route source file (registry-derived, so a new cron must opt in)
 * for `.from(`/`untypedFrom(` call sites and asserts each query chain
 * either ends with `.eq("site_id", ...)` / `.in("site_id", ...)` /
 * `.match({ site_id: ... })` or contains `.unsafeNoSiteFilter()`.
 *
 * The DLQ insert in `app/api/queue/clicks/route.ts` is also covered —
 * `click_failures` has no `site_id` column and the queue handler is
 * INTERNAL_API_TOKEN-gated, so it must opt out explicitly.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { cronJobs } from "@/lib/cron-registry";

const repoRoot = join(__dirname, "..");

/**
 * Strip line and block comments from TS source so the chain extractor
 * doesn't trip over `// F-API-01: …` comments interleaved between
 * chained method calls. Preserves newlines so the chain-continuation
 * heuristic below still works.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/**
 * Extract every awaited Supabase query chain in the file. We treat a
 * chain as the text between `.from(` (or `untypedFrom(`) and the next
 * top-level `;` — close enough for regression detection without a full
 * TS parser.
 */
function extractChains(rawSrc: string): string[] {
  const src = stripComments(rawSrc);
  const chains: string[] = [];
  const re = /\b(?:\.from|untypedFrom)\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const start = m.index;
    let i = m.index + m[0].length;
    let depth = 1;
    while (i < src.length && depth > 0) {
      const c = src[i];
      if (c === "(") depth++;
      else if (c === ")") depth--;
      i++;
    }
    // Walk forward collecting chained method calls until we hit a
    // statement boundary at the same paren depth.
    let end = i;
    let pdepth = 0;
    while (end < src.length) {
      const c = src[end];
      if (c === "(" || c === "[" || c === "{") pdepth++;
      else if (c === ")" || c === "]" || c === "}") {
        if (pdepth === 0) break;
        pdepth--;
      } else if (pdepth === 0 && (c === ";" || c === "\n")) {
        // Newline is a soft boundary only when the next non-space char
        // doesn't continue the chain with `.method(`.
        if (c === "\n") {
          let j = end + 1;
          while (j < src.length && /\s/.test(src[j])) j++;
          if (src[j] !== ".") break;
        } else {
          break;
        }
      }
      end++;
    }
    chains.push(src.slice(start, end));
  }
  return chains;
}

function chainHasSiteFilter(chain: string): boolean {
  if (/\.unsafeNoSiteFilter\s*\(\s*\)/.test(chain)) return true;
  if (/\.eq\s*\(\s*["']site_id["']\s*,/.test(chain)) return true;
  if (/\.in\s*\(\s*["']site_id["']\s*,/.test(chain)) return true;
  if (/\.match\s*\(\s*\{\s*site_id\s*:/.test(chain)) return true;
  // Insert/upsert payload carrying site_id is also accepted by the
  // Proxy at runtime; the lint here is intentionally a *static* check
  // and we only need to catch the cron sweep patterns that historically
  // shipped without any opt-out. Payload-style site_id is covered by
  // separate route-level tests (see __tests__/cron-publish.test.ts).
  return false;
}

describe("F-API-01 cron proxy guard (registry-derived)", () => {
  for (const job of cronJobs) {
    const relPath = `app${job.path}/route.ts`;
    it(`${job.name}: every awaited query chain opts out or filters by site_id`, () => {
      const absPath = join(repoRoot, relPath);
      expect(
        existsSync(absPath),
        `Cron route file not found for registered job: ${job.name} (${relPath}). ` +
          `Either delete the registry entry or create the route file.`,
      ).toBe(true);

      const src = readFileSync(absPath, "utf8");
      const chains = extractChains(src);

      const offenders: string[] = [];
      for (const chain of chains) {
        if (!chainHasSiteFilter(chain)) {
          offenders.push(chain.slice(0, 240).replace(/\s+/g, " "));
        }
      }

      expect(
        offenders,
        `[F-API-01] Cron route ${relPath} has ${offenders.length} query chain(s) ` +
          `that neither filter by site_id nor opt out via .unsafeNoSiteFilter(). ` +
          `The privileged-client Proxy will reject these at runtime:\n` +
          offenders.map((o, i) => `  ${i + 1}. ${o}`).join("\n"),
      ).toEqual([]);
    });
  }

  it("DLQ insert in app/api/queue/clicks/route.ts opts out (click_failures has no site_id)", () => {
    const absPath = join(repoRoot, "app/api/queue/clicks/route.ts");
    const src = readFileSync(absPath, "utf8");
    // Specifically the DLQ branch must call .unsafeNoSiteFilter() because
    // the outer DLQ row wraps the failed message and has no site_id.
    // Reuse the route-scoped extractor — both `click_failures` chains
    // (the awaited DLQ insert and the fire-and-forget rejected-rows
    // path) must opt out.
    const chains = extractChains(src).filter((c) => /click_failures/.test(c));
    expect(
      chains.length,
      "no `click_failures` chains found in app/api/queue/clicks/route.ts",
    ).toBeGreaterThan(0);
    const missing = chains.filter((c) => !chainHasSiteFilter(c));
    expect(
      missing,
      `[F-API-01] click_failures chain(s) without .unsafeNoSiteFilter() or site_id filter:\n` +
        missing.map((c, i) => `  ${i + 1}. ${c.slice(0, 240).replace(/\s+/g, " ")}`).join("\n"),
    ).toEqual([]);
  });
});
