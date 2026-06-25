/**
 * Task 2.1 — Bug 1 preservation tests (PHASE 2, run on UNFIXED code).
 *
 * GOAL: Capture the correct Node.js baseline behaviour of `hashEmailForGdpr`
 * so these tests act as a regression baseline after the fix is applied.
 *
 * These tests are EXPECTED TO PASS on UNFIXED code (the current
 * `crypto.createHmac` implementation). They must continue to pass after the
 * Bug 1 fix (replacing Node.js `crypto` with the Web Crypto API) to confirm
 * that the fix preserves all observable behaviours on Node.js.
 *
 * Property 7: Preservation — Digest identity, empty-secret guard, and email normalisation
 *
 * Three properties are tested:
 *   P7a — For any non-empty email, the result is exactly 16 lowercase hex chars.
 *   P7b — For the same email with different cases/whitespace, results are identical.
 *   P7c — With empty/unset GDPR_HASH_SECRET, the function throws before hashing.
 *
 * Validates: Requirements 3.1, 3.2
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fc from "fast-check";
import { hashEmailForGdpr } from "@/lib/gdpr-hash";

// ─────────────────────────────────────────────────────────────────────────────
// Environment setup — use a stable test secret for all preservation checks.
// ─────────────────────────────────────────────────────────────────────────────
const TEST_SECRET = "preservation-test-secret-do-not-change";

const ORIG_GDPR = process.env.GDPR_HASH_SECRET;

beforeEach(() => {
  process.env.GDPR_HASH_SECRET = TEST_SECRET;
});

afterEach(() => {
  if (ORIG_GDPR === undefined) delete process.env.GDPR_HASH_SECRET;
  else process.env.GDPR_HASH_SECRET = ORIG_GDPR;
});

// ─────────────────────────────────────────────────────────────────────────────
// Observation log (recorded from unfixed Node.js implementation):
//   hashEmailForGdpr("user@example.com")   → 16-char lowercase hex string
//   hashEmailForGdpr("USER@EXAMPLE.COM ")  → same value (normalisation confirmed)
//   hashEmailForGdpr with GDPR_HASH_SECRET="" → throws configuration error
// ─────────────────────────────────────────────────────────────────────────────

describe("Bug 1 preservation — hashEmailForGdpr output and error behavior on Node.js", () => {
  /**
   * Observation: hashEmailForGdpr("user@example.com") on Node.js returns a
   * 16-char lowercase hex string.
   */
  it("observation: hashEmailForGdpr returns a 16-char lowercase hex string on Node.js", async () => {
    const result = await hashEmailForGdpr("user@example.com");
    expect(result).toMatch(/^[0-9a-f]{16}$/);
    // Record the exact observed value for documentation purposes.
    // This value is stable for the same email + TEST_SECRET combination.
    expect(result).toHaveLength(16);
  });

  /**
   * Observation: hashEmailForGdpr("USER@EXAMPLE.COM ") returns the same value
   * as hashEmailForGdpr("user@example.com") — normalisation is applied.
   */
  it("observation: normalisation — upper-case and trailing space produce the same digest as lower-case trimmed email", async () => {
    const lower = await hashEmailForGdpr("user@example.com");
    const upper = await hashEmailForGdpr("USER@EXAMPLE.COM ");
    expect(upper).toBe(lower);
  });

  /**
   * Observation: calling with GDPR_HASH_SECRET="" throws a configuration error
   * before any hashing is attempted.
   */
  it("observation: empty GDPR_HASH_SECRET throws a configuration error", async () => {
    process.env.GDPR_HASH_SECRET = "";
    await expect(hashEmailForGdpr("user@example.com")).rejects.toThrow(
      /GDPR_HASH_SECRET must be set/,
    );
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Property-based tests
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * P7a — Digest format invariant.
   *
   * For ANY non-empty email string, hashEmailForGdpr must return exactly
   * 16 lowercase hex characters.
   *
   * **Validates: Requirements 3.1, 3.2**
   */
  it("P7a: for any non-empty email string, result is exactly 16 chars matching /^[0-9a-f]{16}$/", async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate reasonable email-like strings (non-empty ASCII)
        fc.emailAddress(),
        async (email) => {
          const result = await hashEmailForGdpr(email);
          expect(result).toHaveLength(16);
          expect(result).toMatch(/^[0-9a-f]{16}$/);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * P7b — Normalisation invariant.
   *
   * For the same email with different case combinations and leading/trailing
   * whitespace, hashEmailForGdpr must return the identical digest every time.
   *
   * This verifies that `.toLowerCase().trim()` is applied before hashing,
   * preserving audit-log correlation across different input representations
   * of the same email address.
   *
   * **Validates: Requirements 3.1, 3.2**
   */
  it("P7b: same email with different case/whitespace produces identical digests", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.emailAddress(),
        // Generate a random mix of leading/trailing spaces (0–4 each side)
        fc.nat({ max: 4 }),
        fc.nat({ max: 4 }),
        async (email, leadingSpaces, trailingSpaces) => {
          const leading = " ".repeat(leadingSpaces);
          const trailing = " ".repeat(trailingSpaces);

          const canonical = await hashEmailForGdpr(email.toLowerCase());
          const upperVariant = await hashEmailForGdpr(email.toUpperCase());
          const paddedVariant = await hashEmailForGdpr(`${leading}${email}${trailing}`);
          const upperPaddedVariant = await hashEmailForGdpr(
            `${leading}${email.toUpperCase()}${trailing}`,
          );

          expect(upperVariant).toBe(canonical);
          expect(paddedVariant).toBe(canonical);
          expect(upperPaddedVariant).toBe(canonical);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * P7c — Empty/unset secret guard invariant.
   *
   * When GDPR_HASH_SECRET is empty or whitespace-only, hashEmailForGdpr must
   * throw a configuration error BEFORE any crypto operation is attempted.
   * This is a critical security invariant — PII must never be hashed with
   * an empty, shared, or auth-derived key.
   *
   * **Validates: Requirements 3.1, 3.2**
   */
  it("P7c: empty or whitespace-only GDPR_HASH_SECRET always throws a configuration error", async () => {
    await fc.assert(
      fc.asyncProperty(
        // Whitespace-only strings: build by repeating a whitespace char 0–20 times
        fc
          .nat({ max: 20 })
          .chain((len) =>
            fc
              .array(fc.constantFrom(" ", "\t", "\r", "\n"), { minLength: len, maxLength: len })
              .map((chars) => chars.join("")),
          ),
        fc.emailAddress(),
        async (whitespaceSecret, email) => {
          process.env.GDPR_HASH_SECRET = whitespaceSecret;
          await expect(hashEmailForGdpr(email)).rejects.toThrow(/GDPR_HASH_SECRET must be set/);
        },
      ),
      { numRuns: 50 },
    );
  });

  /**
   * P7c (unset variant) — When GDPR_HASH_SECRET is not set at all (undefined),
   * the function must also throw a configuration error.
   *
   * **Validates: Requirements 3.1, 3.2**
   */
  it("P7c (unset): unset GDPR_HASH_SECRET throws a configuration error for any email", async () => {
    await fc.assert(
      fc.asyncProperty(fc.emailAddress(), async (email) => {
        delete process.env.GDPR_HASH_SECRET;
        await expect(hashEmailForGdpr(email)).rejects.toThrow(/GDPR_HASH_SECRET must be set/);
      }),
      { numRuns: 50 },
    );
  });

  /**
   * Determinism check — the same email always yields the same digest for a
   * given secret. This is a prerequisite for audit-log correlation to work.
   *
   * **Validates: Requirements 3.1, 3.2**
   */
  it("determinism: same email always yields the same 16-char hex digest", async () => {
    await fc.assert(
      fc.asyncProperty(fc.emailAddress(), async (email) => {
        const first = await hashEmailForGdpr(email);
        const second = await hashEmailForGdpr(email);
        expect(first).toBe(second);
        expect(first).toMatch(/^[0-9a-f]{16}$/);
      }),
      { numRuns: 100 },
    );
  });
});
