/**
 * Capability gating — product-honesty / fail-closed regression net.
 *
 * The architecture promises that a tenant which has not enabled a module
 * must not be able to reach that module's public pages or APIs: they must
 * return 404 as if the surface did not exist (`docs/architecture.md:48-57`).
 *
 * Several modules are backend-only or journey-incomplete on current main
 * (membership checkout has no return/cancel pages; community UGC has no
 * public consumer; the media-kit renders unverified marketing stats). The
 * remediation gates every one of those surfaces behind an explicit,
 * disabled-by-default FeatureFlag and fails closed (404 / notFound) when
 * the flag is absent.
 *
 * This suite proves, parameterically, that:
 *   1. The central guard (`requireSiteFeature` / `hasSiteFeature`) fails
 *      closed when a flag is missing and passes only when it is set.
 *   2. Every in-scope public surface actually invokes that guard and
 *      returns 404 / notFound, in every exported handler.
 *   3. Incomplete modules are disabled-by-default on every configured
 *      tenant, so they are unreachable in the shipped product.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import type { SiteDefinition, FeatureFlags } from "@/config/site-definition";

const REPO_ROOT = path.resolve(__dirname, "..");

// ── notFound() sentinel: Next's notFound throws internally; we mirror that
//    so `requireSiteFeature` propagates a distinguishable rejection. ──
const NOT_FOUND = "NEXT_HTTP_ERROR_FALLBACK;404";
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error(NOT_FOUND);
  }),
}));

// ── Reconfigurable current-site mock for the runtime guard tests. ──
function fakeSite(features: FeatureFlags): SiteDefinition {
  return { features } as unknown as SiteDefinition;
}
let currentSiteFeatures: FeatureFlags = {};
vi.mock("@/lib/site-context", () => ({
  getCurrentSite: vi.fn(async () => fakeSite(currentSiteFeatures)),
}));

// The list of incomplete / backend-only modules that must fail closed.
const GATED_FEATURES: Array<keyof FeatureFlags> = ["deals", "membership", "community", "mediaKit"];

describe("central capability guard fails closed", () => {
  beforeEach(() => {
    currentSiteFeatures = {};
    vi.clearAllMocks();
  });

  describe.each(GATED_FEATURES)("feature %s", (feature) => {
    it("requireSiteFeature() calls notFound (404) when the flag is absent", async () => {
      const { requireSiteFeature } = await import("@/lib/site-features");
      const { notFound } = await import("next/navigation");
      currentSiteFeatures = {};
      await expect(requireSiteFeature(feature)).rejects.toThrow(NOT_FOUND);
      expect(notFound).toHaveBeenCalledTimes(1);
    });

    it("requireSiteFeature() returns the site (no notFound) when the flag is set", async () => {
      const { requireSiteFeature } = await import("@/lib/site-features");
      const { notFound } = await import("next/navigation");
      currentSiteFeatures = { [feature]: true } as FeatureFlags;
      const site = await requireSiteFeature(feature);
      expect(site).toBeTruthy();
      expect(notFound).not.toHaveBeenCalled();
    });

    it("hasSiteFeature() reflects the flag exactly", async () => {
      const { hasSiteFeature } = await import("@/lib/site-features");
      const off = fakeSite({});
      const on = fakeSite({ [feature]: true } as FeatureFlags);
      expect(hasSiteFeature(off, feature)).toBe(false);
      expect(hasSiteFeature(on, feature)).toBe(true);
    });
  });

  it("a falsy/absent flag is never treated as enabled (no undefined leak)", async () => {
    const { hasSiteFeature } = await import("@/lib/site-features");
    const site = fakeSite({ deals: undefined } as FeatureFlags);
    expect(hasSiteFeature(site, "deals")).toBe(false);
  });
});

// ── Source-level invariants: every in-scope surface invokes the guard. ──

interface PageSurface {
  file: string;
  feature: keyof FeatureFlags;
}

interface ApiSurface {
  file: string;
  feature: keyof FeatureFlags;
}

const PAGE_SURFACES: PageSurface[] = [
  { file: "app/(public)/deals/page.tsx", feature: "deals" },
  { file: "app/(public)/media-kit/page.tsx", feature: "mediaKit" },
];

const API_SURFACES: ApiSurface[] = [
  { file: "app/api/community/comments/route.ts", feature: "community" },
  { file: "app/api/community/wrist-shots/route.ts", feature: "community" },
  { file: "app/api/membership/checkout/route.ts", feature: "membership" },
];

function read(relPath: string): string {
  return fs.readFileSync(path.join(REPO_ROOT, relPath), "utf-8");
}

function countOccurrences(haystack: string, needle: RegExp): number {
  return (haystack.match(needle) ?? []).length;
}

describe("in-scope public pages are gated via requireSiteFeature", () => {
  it.each(PAGE_SURFACES)("$file gates on $feature and 404s when disabled", ({ file, feature }) => {
    const src = read(file);
    // The default export (the page) must gate — not only generateMetadata.
    const gate = new RegExp(`requireSiteFeature\\(\\s*["']${feature}["']\\s*\\)`);
    expect(src, `${file} must call requireSiteFeature("${feature}")`).toMatch(gate);
    // The page component itself must invoke the guard (>=1 call inside the
    // default export, in addition to any generateMetadata call).
    const defaultExportIdx = src.indexOf("export default");
    expect(defaultExportIdx, `${file} must have a default export`).toBeGreaterThan(-1);
    const componentBody = src.slice(defaultExportIdx);
    expect(componentBody, `${file} page component must call the guard`).toMatch(gate);
  });
});

describe("in-scope public APIs fail closed (404) in every handler", () => {
  it.each(API_SURFACES)(
    "$file gates every handler on $feature and returns 404",
    ({ file, feature }) => {
      const src = read(file);
      const handlerCount = countOccurrences(
        src,
        /export async function (GET|POST|PUT|DELETE|PATCH)/g,
      );
      expect(handlerCount, `${file} must export at least one handler`).toBeGreaterThan(0);

      const gate = new RegExp(`hasSiteFeature\\([^)]*["']${feature}["']\\s*\\)`, "g");
      const gateCount = countOccurrences(src, gate);
      expect(
        gateCount,
        `${file} must gate on hasSiteFeature("${feature}") once per handler (` +
          `${handlerCount} handlers, ${gateCount} gates)`,
      ).toBeGreaterThanOrEqual(handlerCount);

      // Each gate must be paired with a 404 response.
      expect(src, `${file} must return a 404 when the feature is disabled`).toMatch(
        /(status:\s*404|apiError\(\s*404)/,
      );
    },
  );
});

// ── Config invariant: incomplete modules are disabled-by-default. ──

describe("incomplete modules are disabled by default on every tenant", () => {
  // Modules whose full user journey does not exist on current main and which
  // therefore must not be enabled on any shipped tenant.
  const INCOMPLETE: Array<keyof FeatureFlags> = ["membership", "community", "mediaKit"];

  it.each(INCOMPLETE)("no configured site enables %s", async (feature) => {
    const { allSites } = await import("@/config/sites");
    const sites = allSites;
    expect(sites.length, "expected configured sites").toBeGreaterThan(0);
    const enabled = sites.filter((s) => Boolean(s.features[feature])).map((s) => s.id);
    expect(enabled, `these tenants enable incomplete module "${feature}"`).toEqual([]);
  });
});
