/**
 * F-012 — GDPR PII hashing must be decoupled from the auth signing key.
 *
 * Guards the regression the audit flagged: the privacy routes previously
 * hashed emails with `GDPR_HASH_SECRET || JWT_SECRET`, silently re-coupling
 * the compliance audit trail to the auth secret. `hashEmailForGdpr` must:
 *   1. Produce a stable, normalised 16-hex-char HMAC.
 *   2. Refuse to run without a dedicated GDPR_HASH_SECRET.
 *   3. NEVER fall back to JWT_SECRET.
 */
import { describe, it, expect, afterEach } from "vitest";
import { hashEmailForGdpr } from "@/lib/gdpr-hash";

const ORIG_GDPR = process.env.GDPR_HASH_SECRET;
const ORIG_JWT = process.env.JWT_SECRET;

afterEach(() => {
  if (ORIG_GDPR === undefined) delete process.env.GDPR_HASH_SECRET;
  else process.env.GDPR_HASH_SECRET = ORIG_GDPR;
  if (ORIG_JWT === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = ORIG_JWT;
});

describe("hashEmailForGdpr (F-012)", () => {
  it("produces a stable, normalised 16-hex-char HMAC", async () => {
    process.env.GDPR_HASH_SECRET = "test-secret";
    const h = await hashEmailForGdpr("User@Example.com");
    expect(h).toMatch(/^[0-9a-f]{16}$/);
    // Case + surrounding whitespace are normalised away.
    expect(await hashEmailForGdpr("  user@example.com  ")).toBe(h);
  });

  it("is deterministic for the same input and secret", async () => {
    process.env.GDPR_HASH_SECRET = "test-secret";
    expect(await hashEmailForGdpr("a@b.com")).toBe(await hashEmailForGdpr("a@b.com"));
  });

  it("produces different output when the secret changes", async () => {
    process.env.GDPR_HASH_SECRET = "secret-one";
    const a = await hashEmailForGdpr("a@b.com");
    process.env.GDPR_HASH_SECRET = "secret-two";
    const b = await hashEmailForGdpr("a@b.com");
    expect(a).not.toBe(b);
  });

  it("throws when GDPR_HASH_SECRET is unset", async () => {
    delete process.env.GDPR_HASH_SECRET;
    await expect(hashEmailForGdpr("a@b.com")).rejects.toThrow(/GDPR_HASH_SECRET must be set/);
  });

  it("throws when GDPR_HASH_SECRET is blank/whitespace", async () => {
    process.env.GDPR_HASH_SECRET = "   ";
    await expect(hashEmailForGdpr("a@b.com")).rejects.toThrow(/GDPR_HASH_SECRET must be set/);
  });

  it("does NOT fall back to JWT_SECRET (core F-012 regression)", async () => {
    // Only the auth signing key is present — hashing must fail rather than
    // silently re-couple PII hashing to auth.
    delete process.env.GDPR_HASH_SECRET;
    process.env.JWT_SECRET = "auth-signing-key-must-not-be-used-for-pii";
    await expect(hashEmailForGdpr("a@b.com")).rejects.toThrow();
  });
});
