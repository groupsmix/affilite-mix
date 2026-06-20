import { describe, it, expect } from "vitest";
import { resolveLayoutVariant } from "@/lib/layout-variant";

describe("resolveLayoutVariant", () => {
  it("prefers a valid DB value over the site config", () => {
    expect(resolveLayoutVariant("magazine", "compare")).toBe("magazine");
  });

  it("falls back to the site config when the DB value is absent", () => {
    expect(resolveLayoutVariant(null, "compare")).toBe("compare");
    expect(resolveLayoutVariant(undefined, "compare")).toBe("compare");
    expect(resolveLayoutVariant("", "compare")).toBe("compare");
  });

  it("ignores an unrecognized DB value and uses the site config", () => {
    expect(resolveLayoutVariant("bogus", "compare")).toBe("compare");
  });

  it("defaults to standard when neither side is usable", () => {
    expect(resolveLayoutVariant(null, undefined)).toBe("standard");
    expect(resolveLayoutVariant("nonsense", null)).toBe("standard");
  });

  it("does not coerce a missing DB value to standard when config asks for compare (regression)", () => {
    // The original bug: a missing layout_variant became the literal "standard",
    // which then shadowed the site config's "compare" layout.
    expect(resolveLayoutVariant(undefined, "compare")).toBe("compare");
    expect(resolveLayoutVariant(undefined, "compare")).not.toBe("standard");
  });
});
