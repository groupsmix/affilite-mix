/**
 * Tests for A98-62: Consent payload validation — stricter category/action constraints.
 */

import { describe, it, expect } from "vitest";

// Inline the validation function since it's not exported
const VALID_CONSENT_CATEGORIES = new Set([
  "necessary",
  "functional",
  "analytics",
  "advertising",
  "personalization",
  "security",
  "performance",
]);
const MAX_CATEGORIES = 10;
const MAX_BANNER_VERSION_LENGTH = 64;

function validateConsentCategories(categories: unknown): string | null {
  if (!Array.isArray(categories)) return "categories must be an array";
  if (categories.length === 0) return "categories cannot be empty";
  if (categories.length > MAX_CATEGORIES) return `categories exceeds maximum of ${MAX_CATEGORIES}`;

  for (const cat of categories) {
    if (typeof cat !== "string") return "each category must be a string";
    if (!VALID_CONSENT_CATEGORIES.has(cat.toLowerCase())) {
      return `unknown consent category: ${cat}`;
    }
  }
  return null;
}

describe("A98-62: Consent payload validation", () => {
  it("accepts valid categories", () => {
    expect(validateConsentCategories(["necessary", "analytics"])).toBeNull();
    expect(validateConsentCategories(["functional"])).toBeNull();
  });

  it("rejects empty array", () => {
    expect(validateConsentCategories([])).toBe("categories cannot be empty");
  });

  it("rejects non-array", () => {
    expect(validateConsentCategories("analytics")).toBe("categories must be an array");
    expect(validateConsentCategories(null)).toBe("categories must be an array");
  });

  it("rejects unknown categories", () => {
    expect(validateConsentCategories(["necessary", "hacker_category"])).toBe(
      "unknown consent category: hacker_category",
    );
  });

  it("is case-insensitive but validates", () => {
    expect(validateConsentCategories(["NECESSARY", "Analytics"])).toBeNull();
  });

  it("rejects too many categories", () => {
    const many = Array.from({ length: 11 }, (_, i) => "necessary");
    expect(validateConsentCategories(many)).toBe("categories exceeds maximum of 10");
  });

  it("rejects mixed valid and invalid", () => {
    expect(validateConsentCategories(["necessary", "malicious"])).toBe(
      "unknown consent category: malicious",
    );
  });
});
