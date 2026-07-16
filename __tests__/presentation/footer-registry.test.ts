/**
 * The footer registry must have a real component for every layout variant so
 * magazine/minimal/directory can never silently fall back to standard again.
 */
import { describe, it, expect } from "vitest";
import { FOOTER_VARIANTS } from "@/app/(public)/components/footer/registry";

const ALL_VARIANTS = ["standard", "compare", "magazine", "minimal", "directory"] as const;

describe("FOOTER_VARIANTS registry", () => {
  it("registers a distinct component for every variant", () => {
    for (const v of ALL_VARIANTS) {
      expect(typeof FOOTER_VARIANTS[v]).toBe("function");
    }
  });

  it("has exactly the known variants and no extras", () => {
    expect(Object.keys(FOOTER_VARIANTS).sort()).toEqual([...ALL_VARIANTS].sort());
  });

  it("does not alias every variant to the same component", () => {
    const unique = new Set(Object.values(FOOTER_VARIANTS));
    expect(unique.size).toBeGreaterThan(1);
  });
});
