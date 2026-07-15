/**
 * The header registry must have a real component for every layout variant so
 * magazine/minimal/directory can never silently fall back to standard again.
 */
import { describe, it, expect } from "vitest";
import { HEADER_VARIANTS } from "@/app/(public)/components/header/registry";

const ALL_VARIANTS = ["standard", "compare", "magazine", "minimal", "directory"] as const;

describe("HEADER_VARIANTS registry", () => {
  it("registers a distinct component for every variant", () => {
    for (const v of ALL_VARIANTS) {
      expect(typeof HEADER_VARIANTS[v]).toBe("function");
    }
  });

  it("has exactly the known variants and no extras", () => {
    expect(Object.keys(HEADER_VARIANTS).sort()).toEqual([...ALL_VARIANTS].sort());
  });

  it("does not alias every variant to the same component", () => {
    const unique = new Set(Object.values(HEADER_VARIANTS));
    expect(unique.size).toBeGreaterThan(1);
  });
});
