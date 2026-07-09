/**
 * Guards the password-hash audit classifier (scripts/audit-password-hashes.ts).
 *
 * The audit gates removal of the legacy PBKDF2 verification path: it must never
 * misclassify a legacy hash as safe, and must recognise the current
 * `$sha256$`+bcrypt format even though it too contains "$2".
 */
import { describe, it, expect } from "vitest";
import { classifyHash, tallyHashes } from "@/scripts/audit-password-hashes";

describe("classifyHash", () => {
  it("detects legacy PBKDF2 hex:hex hashes", () => {
    expect(classifyHash("a1b2c3d4:deadbeefcafe0123")).toBe("legacy-pbkdf2");
  });

  it("detects plain bcrypt hashes", () => {
    expect(classifyHash("$2a$10$abcdefghijklmnopqrstuvABCDEFGHIJKLMNOPQRSTUV0123456789")).toBe(
      "bcrypt-only",
    );
    expect(classifyHash("$2b$12$abcdefghijklmnopqrstuv")).toBe("bcrypt-only");
  });

  it("detects the current $sha256$+bcrypt format (must not be read as legacy)", () => {
    expect(classifyHash("$sha256$$2a$10$abcdefghijklmnopqrstuv")).toBe("current-prehash");
  });

  it("flags anything unrecognised as unknown", () => {
    expect(classifyHash("plaintext-oops")).toBe("unknown");
    expect(classifyHash("")).toBe("unknown");
  });
});

describe("tallyHashes", () => {
  it("counts a mixed population and never undercounts legacy", () => {
    const totals = tallyHashes([
      "a1:b2", // legacy
      "c3:d4", // legacy
      "$2a$10$abcdefghijklmnopqrstuv", // bcrypt-only
      "$sha256$$2a$10$abcdefghijklmnopqrstuv", // current
      "$sha256$$2b$10$zzzzzzzzzzzzzzzzzzzzzz", // current
      "weird", // unknown
    ]);
    expect(totals["legacy-pbkdf2"]).toBe(2);
    expect(totals["bcrypt-only"]).toBe(1);
    expect(totals["current-prehash"]).toBe(2);
    expect(totals.unknown).toBe(1);
  });
});
