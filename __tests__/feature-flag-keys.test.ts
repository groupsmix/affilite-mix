import { describe, it, expect } from "vitest";
import {
  applyFeatureOverrides,
  normalizeFlagKey,
  isKnownFeatureKey,
  KNOWN_FEATURE_KEYS,
} from "@/lib/feature-flag-keys";

describe("feature-flag-keys", () => {
  describe("normalizeFlagKey", () => {
    it("strips the governance `features.` prefix", () => {
      expect(normalizeFlagKey("features.giftFinder")).toBe("giftFinder");
    });

    it("leaves a bare key untouched", () => {
      expect(normalizeFlagKey("giftFinder")).toBe("giftFinder");
      expect(normalizeFlagKey("experimental_thing")).toBe("experimental_thing");
    });
  });

  describe("isKnownFeatureKey", () => {
    it("recognises live features in both bare and prefixed form", () => {
      expect(isKnownFeatureKey("giftFinder")).toBe(true);
      expect(isKnownFeatureKey("features.newsletter")).toBe(true);
    });

    it("rejects arbitrary custom keys", () => {
      expect(isKnownFeatureKey("experimental_checkout")).toBe(false);
      expect(isKnownFeatureKey("features.captchaOnLogin")).toBe(false);
    });
  });

  describe("applyFeatureOverrides", () => {
    it("returns the base unchanged when there are no overrides (byte-identical safety)", () => {
      const base = { newsletter: true, giftFinder: false };
      expect(applyFeatureOverrides(base, null)).toEqual(base);
      expect(applyFeatureOverrides(base, undefined)).toEqual(base);
      expect(applyFeatureOverrides(base, {})).toEqual(base);
    });

    it("applies only explicit boolean overrides for known keys", () => {
      const base = { newsletter: true, giftFinder: false, cookieConsent: true };
      const result = applyFeatureOverrides(base, { giftFinder: true, deals: true }) as Record<
        string,
        boolean
      >;
      expect(result.giftFinder).toBe(true); // overridden
      expect(result.deals).toBe(true); // new known key added
      expect(result.newsletter).toBe(true); // untouched
      expect(result.cookieConsent).toBe(true); // untouched
    });

    it("ignores non-boolean and unknown-key override values", () => {
      const base = { newsletter: true };
      const result = applyFeatureOverrides(base, {
        // non-boolean values for known keys must be ignored
        giftFinder: "yes" as unknown as boolean,
        comparisons: 1 as unknown as boolean,
        // unknown key must never leak into the result
        somethingCustom: true,
      });
      expect(result).toEqual({ newsletter: true });
      expect("somethingCustom" in result).toBe(false);
    });

    it("can disable a feature that defaulted on", () => {
      const base = { newsletter: true };
      const result = applyFeatureOverrides(base, { newsletter: false });
      expect(result.newsletter).toBe(false);
    });

    it("does not mutate the base object", () => {
      const base = { newsletter: true, giftFinder: false };
      const snapshot = { ...base };
      applyFeatureOverrides(base, { giftFinder: true });
      expect(base).toEqual(snapshot);
    });
  });

  describe("KNOWN_FEATURE_KEYS", () => {
    it("excludes object-typed and security-control flags", () => {
      expect(KNOWN_FEATURE_KEYS.has("blog")).toBe(false);
      expect(KNOWN_FEATURE_KEYS.has("captchaOnLogin")).toBe(false);
    });
  });
});
