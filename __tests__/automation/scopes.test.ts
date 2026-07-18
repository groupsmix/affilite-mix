import { describe, it, expect } from "vitest";
import {
  hasScope,
  isGrantableScope,
  isForbiddenScope,
  assertGrantableScopes,
  GRANTABLE_SCOPES,
  FORBIDDEN_SCOPES,
} from "@/lib/automation/scopes";

describe("automation scopes", () => {
  it("recognises grantable read + mutation scopes", () => {
    expect(isGrantableScope("site:read")).toBe(true);
    expect(isGrantableScope("content:draft")).toBe(true);
    expect(isGrantableScope("nonsense")).toBe(false);
  });

  it("treats destructive/config scopes as forbidden", () => {
    for (const s of FORBIDDEN_SCOPES) {
      expect(isForbiddenScope(s)).toBe(true);
      expect(isGrantableScope(s)).toBe(false);
    }
  });

  it("hasScope only matches an explicitly held scope", () => {
    expect(hasScope(["site:read", "content:draft"], "content:draft")).toBe(true);
    expect(hasScope(["site:read"], "content:publish")).toBe(false);
  });

  it("assertGrantableScopes dedupes and rejects forbidden/unknown", () => {
    expect(assertGrantableScopes(["site:read", "site:read"])).toEqual(["site:read"]);
    expect(() => assertGrantableScopes(["secrets:write"])).toThrow(/owner-only/);
    expect(() => assertGrantableScopes(["bogus"])).toThrow(/Unknown/);
  });

  it("grantable set never includes a forbidden scope", () => {
    for (const s of FORBIDDEN_SCOPES) {
      expect(GRANTABLE_SCOPES).not.toContain(s);
    }
  });
});
