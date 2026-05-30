/**
 * A165-01: Tests for Separation of Duties (SOD) validation.
 *
 * Verifies that the SOD validator detects forbidden permission combinations
 * and that the assert variant throws when violations are present.
 */
import { describe, it, expect } from "vitest";
import { validateSod, assertSodCompliant } from "@/lib/security/sod-validation";

describe("validateSod", () => {
  it("returns no violations for an empty permission set", () => {
    expect(validateSod([])).toEqual([]);
  });

  it("returns no violations when only one side of a SOD pair is present", () => {
    const perms = [{ feature: "content", action: "create" }];
    expect(validateSod(perms)).toEqual([]);
  });

  it("detects content create + publish conflict", () => {
    const perms = [
      { feature: "content", action: "create" },
      { feature: "content", action: "publish" },
    ];
    const violations = validateSod(perms);
    expect(violations).toHaveLength(1);
    expect(violations[0].rule).toBe("content-create-vs-publish");
    expect(violations[0].permissionA).toBe("content:create");
    expect(violations[0].permissionB).toBe("content:publish");
  });

  it("detects content edit + approve conflict", () => {
    const perms = [
      { feature: "content", action: "edit" },
      { feature: "content", action: "approve" },
    ];
    const violations = validateSod(perms);
    expect(violations).toHaveLength(1);
    expect(violations[0].rule).toBe("content-edit-vs-approve");
  });

  it("detects users manage + settings configure conflict", () => {
    const perms = [
      { feature: "users", action: "manage" },
      { feature: "settings", action: "configure" },
    ];
    const violations = validateSod(perms);
    expect(violations).toHaveLength(1);
    expect(violations[0].rule).toBe("users-manage-vs-settings-configure");
  });

  it("detects products create + publish conflict", () => {
    const perms = [
      { feature: "products", action: "create" },
      { feature: "products", action: "publish" },
    ];
    const violations = validateSod(perms);
    expect(violations).toHaveLength(1);
    expect(violations[0].rule).toBe("products-create-vs-publish");
  });

  it("detects privacy manage + analytics manage conflict", () => {
    const perms = [
      { feature: "privacy", action: "manage" },
      { feature: "analytics", action: "manage" },
    ];
    const violations = validateSod(perms);
    expect(violations).toHaveLength(1);
    expect(violations[0].rule).toBe("privacy-manage-vs-analytics-manage");
  });

  it("returns multiple violations when several SOD pairs are present", () => {
    const perms = [
      { feature: "content", action: "create" },
      { feature: "content", action: "publish" },
      { feature: "users", action: "manage" },
      { feature: "settings", action: "configure" },
    ];
    const violations = validateSod(perms);
    expect(violations).toHaveLength(2);
    const rules = violations.map((v) => v.rule).sort();
    expect(rules).toEqual(["content-create-vs-publish", "users-manage-vs-settings-configure"]);
  });

  it("ignores duplicate permissions", () => {
    const perms = [
      { feature: "content", action: "create" },
      { feature: "content", action: "create" },
    ];
    expect(validateSod(perms)).toEqual([]);
  });

  it("ignores unrelated permissions", () => {
    const perms = [
      { feature: "newsletter", action: "send" },
      { feature: "tag", action: "create" },
    ];
    expect(validateSod(perms)).toEqual([]);
  });
});

describe("assertSodCompliant", () => {
  it("does not throw when adding a permission keeps the role SOD-compliant", () => {
    const existing = [{ feature: "content", action: "create" }];
    const next = { feature: "users", action: "manage" };
    expect(() => assertSodCompliant(existing, next)).not.toThrow();
  });

  it("throws when adding a permission would create a SOD violation", () => {
    const existing = [{ feature: "content", action: "create" }];
    const next = { feature: "content", action: "publish" };
    expect(() => assertSodCompliant(existing, next)).toThrow(/SOD violation/);
  });

  it("error message includes the rule name and the conflicting permissions", () => {
    const existing = [{ feature: "users", action: "manage" }];
    const next = { feature: "settings", action: "configure" };
    try {
      assertSodCompliant(existing, next);
      throw new Error("expected assertSodCompliant to throw");
    } catch (err) {
      const msg = (err as Error).message;
      expect(msg).toContain("users-manage-vs-settings-configure");
      expect(msg).toContain("users:manage");
      expect(msg).toContain("settings:configure");
    }
  });

  it("does not throw when the existing set is empty", () => {
    const next = { feature: "content", action: "create" };
    expect(() => assertSodCompliant([], next)).not.toThrow();
  });
});
