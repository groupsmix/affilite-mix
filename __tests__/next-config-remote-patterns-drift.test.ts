/**
 * Finding #19 drift guard: `next.config.ts` must not gain new third-party
 * image hosts without an explicit, reviewed change to this allowlist.
 *
 * Why this exists:
 *   `remotePatterns` controls which hostnames the Next.js image optimizer
 *   will fetch and serve. Each entry is an SSRF + availability dependency
 *   on a third party we do not control. Today the only third-party hosts
 *   allowed are the two Amazon CDNs, kept until the G-48 R2 ingest
 *   migration rewrites stored product `image_url` rows. After G-48 ships,
 *   both Amazon entries should be removed and this test's allowlist
 *   should shrink to an empty set.
 *
 * What this test does:
 *   Static-parses `next.config.ts` and extracts every hard-coded
 *   `hostname: "..."` literal. Dynamic entries (`r2PublicHostname`,
 *   `supabaseHostname`, `allSites.map(...)`) are intentionally not checked
 *   here — they are bounded by env vars and the sites config, both of
 *   which have their own review path.
 *
 * Failure modes this catches:
 *   - A developer adds a new hard-coded host (`hostname: "cdn.example.com"`)
 *     without updating the allowlist.
 *   - The Amazon hosts are re-introduced under a different literal form
 *     after the G-48 cleanup ships and the allowlist is shrunk.
 *
 * What this test does NOT do:
 *   - Validate dynamic hostnames at runtime (env- and DB-driven).
 *   - Verify upstream image fetches succeed.
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const REPO_ROOT = path.resolve(__dirname, "..");
const NEXT_CONFIG = path.join(REPO_ROOT, "next.config.ts");

/**
 * Hard-coded hostnames currently permitted in `next.config.ts`
 * `remotePatterns`.
 *
 * Removing G-48 follow-up: after the R2 ingest migration ships and stored
 * `image_url` rows are rewritten to the R2 bucket, BOTH Amazon entries
 * must be deleted from `next.config.ts` AND removed from this set in the
 * same PR. This test will then enforce an empty allowlist.
 */
const ALLOWED_HARDCODED_HOSTS: ReadonlySet<string> = new Set([
  "m.media-amazon.com",
  "images-na.ssl-images-amazon.com",
]);

/**
 * Extract every hard-coded `hostname: "..."` (or `'...'`) literal in the
 * file. Template literals and identifier references are deliberately
 * ignored — those are the dynamic env/sites paths, reviewed separately.
 */
function extractHardcodedHostnames(source: string): string[] {
  const re = /hostname\s*:\s*(["'])([^"']+)\1/g;
  const out: string[] = [];
  for (const m of source.matchAll(re)) {
    out.push(m[2]!);
  }
  return out;
}

describe("#19 next.config.ts remotePatterns drift guard", () => {
  const source = fs.readFileSync(NEXT_CONFIG, "utf8");

  it("only allowlisted third-party hostnames are hard-coded", () => {
    const hardcoded = extractHardcodedHostnames(source);
    const unexpected = hardcoded.filter((h) => !ALLOWED_HARDCODED_HOSTS.has(h));
    expect(
      unexpected,
      `Unexpected hard-coded hostname(s) in next.config.ts: ${unexpected.join(", ")}.\n` +
        `Each entry in remotePatterns is an SSRF + availability dependency.\n` +
        `If this addition is intentional, update ALLOWED_HARDCODED_HOSTS in this test\n` +
        `and document the reason in the PR description (link to a ticket).`,
    ).toEqual([]);
  });

  it("never re-introduces wildcard hostnames (`*.example.com`)", () => {
    const hardcoded = extractHardcodedHostnames(source);
    const wildcards = hardcoded.filter((h) => h.includes("*"));
    expect(
      wildcards,
      `Wildcard hostnames are forbidden in remotePatterns (G-03 / G-04): ${wildcards.join(", ")}`,
    ).toEqual([]);
  });

  it("contains the G-48 follow-up marker until the Amazon hosts are removed", () => {
    const hardcoded = extractHardcodedHostnames(source);
    const stillHasAmazon = hardcoded.some((h) => h.endsWith("amazon.com"));
    if (stillHasAmazon) {
      expect(
        source.includes("G-48"),
        "Amazon hosts are still hard-coded but the `G-48` follow-up marker is missing from next.config.ts. " +
          "Restore the marker comment so the cleanup ticket stays discoverable from the code.",
      ).toBe(true);
    }
  });

  it("does not allow `dangerouslyAllowSVG: true`", () => {
    // Companion check: even if a new host is added, SVG remains off.
    expect(source).toMatch(/dangerouslyAllowSVG\s*:\s*false/);
  });
});
