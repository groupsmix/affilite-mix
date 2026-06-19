import { describe, it, expect } from "vitest";
import {
  parseVsSlug,
  isVsSlug,
  canonicalizeVsSlug,
  isNonCanonicalVsSlug,
  canonicalComparisonPath,
} from "@/lib/vs-slug";

describe("parseVsSlug", () => {
  it("splits a two-operand comparison slug", () => {
    expect(parseVsSlug("jasper-vs-writesonic")).toEqual({ left: "jasper", right: "writesonic" });
  });
  it("keeps operands that themselves contain hyphens intact", () => {
    expect(parseVsSlug("jasper-vs-copy-ai")).toEqual({ left: "jasper", right: "copy-ai" });
  });
  it("returns null for non-comparison slugs", () => {
    expect(parseVsSlug("best-ai-writing-tools")).toBeNull();
  });
  it("returns null for multi-operand (3-way) slugs", () => {
    expect(parseVsSlug("a-vs-b-vs-c")).toBeNull();
  });
  it("returns null when an operand is empty", () => {
    expect(parseVsSlug("-vs-foo")).toBeNull();
    expect(parseVsSlug("foo-vs-")).toBeNull();
  });
});

describe("isVsSlug", () => {
  it("is true for a valid comparison slug", () => {
    expect(isVsSlug("a-vs-b")).toBe(true);
  });
  it("is false for a plain slug", () => {
    expect(isVsSlug("a-b")).toBe(false);
  });
});

describe("canonicalizeVsSlug", () => {
  it("leaves an already-ordered slug unchanged", () => {
    expect(canonicalizeVsSlug("jasper-vs-writesonic")).toBe("jasper-vs-writesonic");
  });
  it("reverses an out-of-order slug", () => {
    expect(canonicalizeVsSlug("writesonic-vs-jasper")).toBe("jasper-vs-writesonic");
  });
  it("orders hyphenated operands by codepoint", () => {
    // 'copy-ai' < 'jasper'
    expect(canonicalizeVsSlug("jasper-vs-copy-ai")).toBe("copy-ai-vs-jasper");
  });
  it("is idempotent", () => {
    const once = canonicalizeVsSlug("writesonic-vs-jasper");
    expect(canonicalizeVsSlug(once)).toBe(once);
  });
  it("returns non-comparison slugs untouched", () => {
    expect(canonicalizeVsSlug("best-ai-tools")).toBe("best-ai-tools");
  });
  it("leaves identical operands unchanged", () => {
    expect(canonicalizeVsSlug("foo-vs-foo")).toBe("foo-vs-foo");
  });
});

describe("isNonCanonicalVsSlug", () => {
  it("flags a reversed slug", () => {
    expect(isNonCanonicalVsSlug("writesonic-vs-jasper")).toBe(true);
  });
  it("does not flag a canonical slug", () => {
    expect(isNonCanonicalVsSlug("jasper-vs-writesonic")).toBe(false);
  });
  it("does not flag a non-comparison slug", () => {
    expect(isNonCanonicalVsSlug("best-ai-tools")).toBe(false);
  });
});

describe("canonicalComparisonPath", () => {
  it("returns the canonical path for a reversed comparison", () => {
    expect(canonicalComparisonPath("/comparison/writesonic-vs-jasper")).toBe(
      "/comparison/jasper-vs-writesonic",
    );
  });
  it("returns null for an already-canonical comparison", () => {
    expect(canonicalComparisonPath("/comparison/jasper-vs-writesonic")).toBeNull();
  });
  it("returns null for non-comparison routes", () => {
    expect(canonicalComparisonPath("/review/writesonic-vs-jasper")).toBeNull();
    expect(canonicalComparisonPath("/comparison")).toBeNull();
  });
  it("ignores nested paths and percent-encoded slugs", () => {
    expect(canonicalComparisonPath("/comparison/a-vs-b/extra")).toBeNull();
    expect(canonicalComparisonPath("/comparison/a%2Dvs%2Db")).toBeNull();
  });
  it("returns null when no slug is present", () => {
    expect(canonicalComparisonPath("/comparison/")).toBeNull();
  });
});
