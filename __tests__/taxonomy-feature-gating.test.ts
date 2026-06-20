/**
 * Guards the config invariant behind the taxonomy/brand route gate
 * (lib + app/(public)/components/taxonomy-*.tsx, backlog T-09).
 *
 * The gift-style taxonomy (occasion / recipient / budget) and the brand pages
 * are watch-niche surfaces. They must render only on tenants that explicitly
 * enable the controlling feature flag, and must NOT be exposed on sites like
 * compareai.site. The route components enforce this at request time via
 * `notFound()`; this test locks the configuration those gates depend on so a
 * future edit can't silently re-expose them.
 */
import { describe, it, expect } from "vitest";
import { getSiteById } from "@/config/sites";

describe("taxonomy/brand feature gating config (T-09)", () => {
  it("wristnerd (watch-tools) enables the taxonomy and brand features", () => {
    const site = getSiteById("watch-tools");
    expect(site).toBeTruthy();
    expect(site!.features.taxonomyPages).toBeTruthy();
    expect(site!.features.brandSpotlights).toBeTruthy();
    expect(site!.features.giftFinder).toBeTruthy();
  });

  it("compareai (ai-compared) does NOT enable any watch-niche surface", () => {
    const site = getSiteById("ai-compared");
    expect(site).toBeTruthy();
    expect(site!.features.taxonomyPages).toBeFalsy();
    expect(site!.features.brandSpotlights).toBeFalsy();
    expect(site!.features.giftFinder).toBeFalsy();
  });

  it("the other tool tenants don't accidentally enable the watch taxonomy", () => {
    for (const id of ["arabic-tools", "crypto-tools"]) {
      const site = getSiteById(id);
      expect(site, `${id} should exist`).toBeTruthy();
      expect(site!.features.taxonomyPages, `${id} taxonomyPages`).toBeFalsy();
      expect(site!.features.brandSpotlights, `${id} brandSpotlights`).toBeFalsy();
    }
  });
});
