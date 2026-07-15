import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { allSites } from "@/config/sites";

const getCurrentSite = vi.hoisted(() => vi.fn());
const notFound = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
);

vi.mock("@/lib/site-context", () => ({
  getCurrentSite,
}));

vi.mock("next/navigation", () => ({
  notFound,
}));

import { requireSiteFeature } from "@/lib/site-features";

function source(relativePath: string): string {
  return fs.readFileSync(path.resolve(relativePath), "utf8");
}

describe("incomplete product capability gates", () => {
  it.each(["deals", "membership", "community", "mediaKit"] as const)(
    "returns not found when %s is disabled",
    async (feature) => {
      getCurrentSite.mockResolvedValue({ features: { [feature]: false } });

      await expect(requireSiteFeature(feature)).rejects.toThrow("NEXT_NOT_FOUND");
    },
  );

  it("guards the membership checkout before rate limiting or checkout work", () => {
    const checkout = source("app/api/membership/checkout/route.ts");
    const featureGate = checkout.indexOf('hasSiteFeature(currentSite, "membership")');
    const rateLimit = checkout.indexOf("getClientIp(request)");

    expect(featureGate).toBeGreaterThan(-1);
    expect(rateLimit).toBeGreaterThan(featureGate);
  });

  it.each([
    ["app/(public)/deals/page.tsx", 'requireSiteFeature("deals")'],
    ["app/(public)/media-kit/page.tsx", 'requireSiteFeature("mediaKit")'],
    ["app/api/community/comments/route.ts", 'hasSiteFeature(site, "community")'],
    ["app/api/community/wrist-shots/route.ts", 'hasSiteFeature(site, "community")'],
    ["app/api/membership/checkout/route.ts", 'hasSiteFeature(currentSite, "membership")'],
  ])("%s invokes its capability gate", (file, guard) => {
    expect(source(file)).toContain(guard);
  });

  it.each(["membership", "community", "mediaKit"] as const)(
    "keeps %s disabled for every static tenant",
    (feature) => {
      expect(allSites.every((site) => !site.features[feature])).toBe(true);
    },
  );
});
