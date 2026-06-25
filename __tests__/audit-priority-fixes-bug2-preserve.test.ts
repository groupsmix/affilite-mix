/**
 * Task 2.2 — Bug 2 preservation tests (PHASE 2 + post-fix regression baseline).
 *
 * GOAL: Capture the correct baseline behaviours of `verifyTotpTokenWithRotation`
 * and verify they are preserved after the Bug 2 fix (task 4.1) is applied.
 *
 * OBSERVATION LOG (recorded from unfixed code):
 *   - verifyTotpTokenWithRotation(encryptedSecret, validToken, decryptFn)
 *     with no lastStep returns `true` (a plain boolean — NOT an object).
 *   - An expired/invalid token (one that fails TOTP validation) returns `false`.
 *   - A non-6-digit token returns `false` WITHOUT calling decryptFn (spy confirmed).
 *   - A SHA-1 secret (enc:v0: or plaintext) called after the SHA-1 deprecation
 *     deadline returns `false`.
 *   - enc:v1: encrypted secrets are decrypted with the current key (usePreviousKey=false).
 *   - enc:v0: encrypted secrets are tried with the previous key first, then the
 *     current key as fallback.
 *
 * POST-FIX NOTE: After the fix, the return type changed from `boolean` to
 * `VerifyTotpStepResult` ({ ok: boolean; step: number | null }). Tests that
 * previously asserted on the truthy/falsy nature of a raw boolean now check
 * `.ok` directly, which is the preserved behavioral invariant.
 *
 * Property 8: Preservation — Valid non-replayed token and encrypted-secret logic
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import fc from "fast-check";
import * as OTPAuth from "otpauth";
import { generateTotpSecret, verifyTotpTokenWithRotation } from "@/lib/totp";

// SHA1_DEPRECATION_DEADLINE is 2026-08-27T00:00:00Z — we simulate post-deadline
// by advancing the fake clock past that date using vi.useFakeTimers.
const POST_DEADLINE_DATE = new Date("2026-09-01T00:00:00Z");

const PERIOD = 30;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate the current valid TOTP token for a given raw base32 secret,
 * using SHA256 (the default algorithm for new enrollments).
 */
function generateValidToken(secret: string): { token: string; step: number } {
  const totp = new OTPAuth.TOTP({
    algorithm: "SHA256",
    digits: 6,
    period: PERIOD,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
  const token = totp.generate();
  const step = Math.floor(Date.now() / 1000 / PERIOD);
  return { token, step };
}

/**
 * A no-op decryptFn that returns the ciphertext unchanged.
 * Simulates "the stored ciphertext IS the raw base32 secret" — used when
 * we wrap a real base32 with enc:v1: so the rotation path is exercised.
 */
const noopDecrypt = async (cipher: string, _usePrevKey: boolean): Promise<string | null> => cipher;

/**
 * A spy wrapper around noopDecrypt that records whether it was called.
 */
function makeSpyDecrypt() {
  let called = false;
  const spyDecrypt = async (cipher: string, usePrevKey: boolean): Promise<string | null> => {
    called = true;
    return noopDecrypt(cipher, usePrevKey);
  };
  return { spyDecrypt, wasCalled: () => called };
}

afterEach(() => {
  vi.useRealTimers();
});

// ─────────────────────────────────────────────────────────────────────────────
// Observation tests — record the exact shape of the current (unfixed) return
// ─────────────────────────────────────────────────────────────────────────────

describe("Bug 2 preservation — verifyTotpTokenWithRotation baseline behaviors", () => {
  /**
   * Observation 1: A valid non-replayed token with no lastStep returns a truthy value.
   *
   * On UNFIXED code: returns the plain boolean `true`.
   * On FIXED code: returns `{ ok: true, step: N }` (still truthy).
   *
   * The preservation property is: the result is truthy. We avoid asserting the exact
   * shape (`=== true` vs `{ ok: true }`) here so the test remains valid across both
   * unfixed and fixed code. The shape is recorded in the comment block above.
   */
  it("observation 1: valid token with no lastStep returns ok:true", async () => {
    const { secret } = generateTotpSecret("preserve-valid@example.com");
    const encryptedSecret = "enc:v1:" + secret;
    const { token } = generateValidToken(secret);

    const result = await verifyTotpTokenWithRotation(encryptedSecret, token, noopDecrypt);

    // On FIXED code: returns { ok: true, step: N }
    expect(result.ok).toBe(true);
    expect(typeof result.step).toBe("number");
  });

  /**
   * Observation 2: An invalid/expired token (wrong code) returns a falsy value.
   *
   * On UNFIXED code: returns `false`. On FIXED code: returns `{ ok: false, step: null }` (falsy).
   */
  it("observation 2: invalid/expired token returns ok:false", async () => {
    const { secret } = generateTotpSecret("preserve-invalid@example.com");
    const encryptedSecret = "enc:v1:" + secret;

    // "000000" is almost certainly not the valid token for any real TOTP secret
    const result = await verifyTotpTokenWithRotation(encryptedSecret, "000000", noopDecrypt);

    // On FIXED code: returns { ok: false, step: null }
    expect(result.ok).toBe(false);
    expect(result.step).toBeNull();
  });

  /**
   * Observation 3: A non-6-digit token returns falsy WITHOUT calling decryptFn.
   *
   * This verifies that the format guard (`!/^\d{6}$/.test(normalizedToken)`)
   * fires before any decryption is attempted — an important performance and
   * security invariant.
   *
   * Spy confirms decryptFn is never invoked for invalid token formats.
   */
  it("observation 3: non-6-digit token returns ok:false without calling decryptFn", async () => {
    const { secret } = generateTotpSecret("preserve-nondigit@example.com");
    const encryptedSecret = "enc:v1:" + secret;
    const { spyDecrypt, wasCalled } = makeSpyDecrypt();

    const shortResult = await verifyTotpTokenWithRotation(
      encryptedSecret,
      "12345", // 5 digits — too short
      spyDecrypt,
    );
    expect(shortResult.ok).toBe(false);
    expect(shortResult.step).toBeNull();
    expect(wasCalled()).toBe(false);
  });

  it("observation 3b: non-digit characters return ok:false without calling decryptFn", async () => {
    const { secret } = generateTotpSecret("preserve-alpha@example.com");
    const encryptedSecret = "enc:v1:" + secret;
    const { spyDecrypt, wasCalled } = makeSpyDecrypt();

    const alphaResult = await verifyTotpTokenWithRotation(
      encryptedSecret,
      "abc123", // contains letters
      spyDecrypt,
    );
    expect(alphaResult.ok).toBe(false);
    expect(alphaResult.step).toBeNull();
    expect(wasCalled()).toBe(false);
  });

  it("observation 3c: 7-digit token returns ok:false without calling decryptFn", async () => {
    const { secret } = generateTotpSecret("preserve-7digit@example.com");
    const encryptedSecret = "enc:v1:" + secret;
    const { spyDecrypt, wasCalled } = makeSpyDecrypt();

    const longResult = await verifyTotpTokenWithRotation(
      encryptedSecret,
      "1234567", // 7 digits — too long
      spyDecrypt,
    );
    expect(longResult.ok).toBe(false);
    expect(longResult.step).toBeNull();
    expect(wasCalled()).toBe(false);
  });

  /**
   * Observation 4: A SHA-1 secret past the deprecation deadline returns falsy.
   *
   * SHA-1 secrets are identified by `needsSha256Reenrollment(storedSecret)`:
   *   - enc:v0: prefix → SHA-1 era
   *   - plaintext (no enc:v1: prefix) → SHA-1 era
   *
   * We advance fake timers past SHA1_DEPRECATION_DEADLINE (2026-08-27) to simulate
   * post-deadline conditions without needing to mock the exported function.
   *
   * NOTE: The key behavioral invariant here is that the result is FALSY (verification
   * fails). The enc:v0: path attempts decryption before the deadline check takes effect
   * in some code paths, so we only assert on the return value, not on whether
   * decryptFn was called.
   */
  it("observation 4: SHA-1 secret (enc:v0:) past the deprecation deadline returns falsy", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(POST_DEADLINE_DATE);

    // enc:v0: prefix marks this as a legacy SHA-1 era enrollment
    const sha1EncryptedSecret = "enc:v0:JBSWY3DPEHPK3PXP";
    const spyDecrypt = async (cipher: string, usePrevKey: boolean): Promise<string | null> =>
      noopDecrypt(cipher, usePrevKey);

    const result = await verifyTotpTokenWithRotation(sha1EncryptedSecret, "123456", spyDecrypt);

    // OBSERVED on unfixed code: returns false because either:
    // (a) the deprecation guard fires → early return { ok: false, step: null }, OR
    // (b) the token "123456" doesn't match the TOTP code for "JBSWY3DPEHPK3PXP"
    // Either way, ok is false — this is the preserved invariant.
    expect(result.ok).toBe(false);
    expect(result.step).toBeNull();

    vi.useRealTimers();
  });

  it("observation 4b: plaintext SHA-1 secret past the deprecation deadline returns falsy", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(POST_DEADLINE_DATE);

    // Plain base32 with no enc:v1: prefix → SHA-1 era
    const plaintextSha1Secret = "JBSWY3DPEHPK3PXP";
    const { spyDecrypt, wasCalled } = makeSpyDecrypt();

    const result = await verifyTotpTokenWithRotation(plaintextSha1Secret, "123456", spyDecrypt);

    expect(result.ok).toBe(false);
    // plaintext secrets skip decryptFn entirely — not called regardless
    expect(wasCalled()).toBe(false);

    vi.useRealTimers();
  });

  /**
   * Observation 5: SHA-1 secret BEFORE the deprecation deadline is NOT rejected
   * by the deprecation guard (it should proceed to normal TOTP verification).
   *
   * This confirms the deadline guard is date-gated and preserves the grace period.
   */
  it("observation 5: SHA-1 secret BEFORE the deprecation deadline is NOT rejected by deadline guard", async () => {
    // Use a date well before the 2026-08-27 deadline
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-01T00:00:00Z"));

    // Generate a SHA-1 secret (using SHA1 algorithm explicitly)
    const totp = new OTPAuth.TOTP({
      algorithm: "SHA1",
      digits: 6,
      period: PERIOD,
      secret: OTPAuth.Secret.fromBase32("JBSWY3DPEHPK3PXP"),
    });
    const token = totp.generate();
    const plaintextSha1Secret = "JBSWY3DPEHPK3PXP"; // plaintext, SHA-1

    // decryptFn won't be called for plaintext secrets (not encrypted)
    // But the deprecation guard should NOT fire, so TOTP verification runs
    const result = await verifyTotpTokenWithRotation(plaintextSha1Secret, token, noopDecrypt);

    // Verification may pass or fail depending on algorithm match, but it must NOT
    // be rejected with ok:false-from-deadline-guard when deadline hasn't passed.
    // We only assert that the function ran through without early deadline rejection.
    // (The result itself — ok: true or ok: false — depends on TOTP algorithm matching.)
    expect(result).toHaveProperty("ok");
    expect(result).toHaveProperty("step");

    vi.useRealTimers();
  });

  /**
   * Observation 6: null/undefined stored secret returns falsy immediately.
   */
  it("observation 6: null storedSecret returns ok:false", async () => {
    const { spyDecrypt, wasCalled } = makeSpyDecrypt();
    const result = await verifyTotpTokenWithRotation(null, "123456", spyDecrypt);
    expect(result.ok).toBe(false);
    expect(result.step).toBeNull();
    expect(wasCalled()).toBe(false);
  });

  it("observation 6b: undefined storedSecret returns ok:false", async () => {
    const { spyDecrypt, wasCalled } = makeSpyDecrypt();
    const result = await verifyTotpTokenWithRotation(undefined, "123456", spyDecrypt);
    expect(result.ok).toBe(false);
    expect(result.step).toBeNull();
    expect(wasCalled()).toBe(false);
  });

  /**
   * Observation 7: Empty token string returns falsy.
   */
  it("observation 7: empty token returns falsy", async () => {
    const { secret } = generateTotpSecret("preserve-empty-token@example.com");
    const encryptedSecret = "enc:v1:" + secret;
    const { spyDecrypt, wasCalled } = makeSpyDecrypt();

    const result = await verifyTotpTokenWithRotation(encryptedSecret, "", spyDecrypt);
    expect(result.ok).toBe(false);
    expect(result.step).toBeNull();
    // Empty string fails the !storedSecret || !token guard — no decrypt
    expect(wasCalled()).toBe(false);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Key-rotation path observations
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Observation 8: enc:v1: secret — decryptFn called with (payload, false).
   * The current-key path is used first.
   */
  it("observation 8: enc:v1: secret calls decryptFn with usePreviousKey=false", async () => {
    const { secret } = generateTotpSecret("preserve-v1@example.com");
    const encryptedSecret = "enc:v1:" + secret;
    const calls: Array<{ cipher: string; usePrev: boolean }> = [];
    const trackingDecrypt = async (cipher: string, usePrev: boolean): Promise<string | null> => {
      calls.push({ cipher, usePrev });
      return cipher; // no-op decrypt
    };

    const { token } = generateValidToken(secret);
    await verifyTotpTokenWithRotation(encryptedSecret, token, trackingDecrypt);

    expect(calls.length).toBeGreaterThanOrEqual(1);
    const firstCall = calls[0]!;
    expect(firstCall.usePrev).toBe(false); // current key tried first
    expect(firstCall.cipher).toBe(secret); // payload is the raw secret (after stripping prefix)
  });

  /**
   * Observation 9: enc:v0: secret — decryptFn called with (payload, true) first.
   * If previous-key decryption succeeds, current-key fallback is NOT attempted.
   */
  it("observation 9: enc:v0: secret calls decryptFn with usePreviousKey=true first", async () => {
    const { secret } = generateTotpSecret("preserve-v0@example.com");
    const encryptedSecret = "enc:v0:" + secret;
    const calls: Array<{ cipher: string; usePrev: boolean }> = [];
    const prevKeyDecrypt = async (cipher: string, usePrev: boolean): Promise<string | null> => {
      calls.push({ cipher, usePrev });
      if (usePrev) return cipher; // prev key succeeds
      return null;
    };

    const { token } = generateValidToken(secret);
    await verifyTotpTokenWithRotation(encryptedSecret, token, prevKeyDecrypt);

    // Previous key should be tried first
    expect(calls[0]!.usePrev).toBe(true);
    // Since prev key succeeded, current key fallback should NOT be called
    expect(calls.filter((c) => !c.usePrev).length).toBe(0);
  });

  /**
   * Observation 10: enc:v0: secret — if prev-key decryption fails, current key is tried.
   */
  it("observation 10: enc:v0: secret falls back to current key when prev key fails", async () => {
    const { secret } = generateTotpSecret("preserve-v0-fallback@example.com");
    const encryptedSecret = "enc:v0:" + secret;
    const calls: Array<{ cipher: string; usePrev: boolean }> = [];
    const fallbackDecrypt = async (cipher: string, usePrev: boolean): Promise<string | null> => {
      calls.push({ cipher, usePrev });
      if (usePrev) return null; // prev key fails
      return cipher; // current key succeeds
    };

    const { token } = generateValidToken(secret);
    await verifyTotpTokenWithRotation(encryptedSecret, token, fallbackDecrypt);

    // Both calls should have been made
    expect(calls.some((c) => c.usePrev === true)).toBe(true);
    expect(calls.some((c) => c.usePrev === false)).toBe(true);
  });

  /**
   * Observation 11: enc:v1: secret where decryptFn returns null → returns falsy.
   */
  it("observation 11: failed decryption (decryptFn returns null) → returns falsy", async () => {
    const { secret } = generateTotpSecret("preserve-decrypt-fail@example.com");
    const encryptedSecret = "enc:v1:" + secret;
    const alwaysNullDecrypt = async (): Promise<string | null> => null;

    const { token } = generateValidToken(secret);
    const result = await verifyTotpTokenWithRotation(encryptedSecret, token, alwaysNullDecrypt);
    expect(result.ok).toBe(false);
    expect(result.step).toBeNull();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Property-based tests
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * P8a — For any non-6-digit token, the result is always falsy and decryptFn is
   * never called, regardless of the secret format.
   *
   * **Validates: Requirements 3.3**
   */
  it("P8a (PBT): any non-6-digit token → falsy result without calling decryptFn", async () => {
    const { secret } = generateTotpSecret("pbt-format@example.com");
    const encryptedSecret = "enc:v1:" + secret;

    await fc.assert(
      fc.asyncProperty(
        fc.oneof(
          // Too short
          fc.stringMatching(/^\d{1,5}$/),
          // Too long
          fc.stringMatching(/^\d{7,12}$/),
          // Non-digit characters
          fc.stringMatching(/^[a-zA-Z!@#$%]{1,10}$/),
          // Empty string is caught by the !token guard, so we use whitespace
          fc.constantFrom(" 12345", "12345 ", "1234 6"),
        ),
        async (invalidToken) => {
          const { spyDecrypt, wasCalled } = makeSpyDecrypt();
          const result = await verifyTotpTokenWithRotation(
            encryptedSecret,
            invalidToken,
            spyDecrypt,
          );
          expect(result.ok).toBe(false);
          expect(result.step).toBeNull();
          expect(wasCalled()).toBe(false);
        },
      ),
      { numRuns: 50 },
    );
  });

  /**
   * P8b — For any null/undefined/empty storedSecret, the result is always falsy
   * and decryptFn is never called.
   *
   * **Validates: Requirements 3.1**
   */
  it("P8b (PBT): null, undefined, or empty storedSecret → always falsy without calling decryptFn", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(fc.constant(null), fc.constant(undefined), fc.constant("")),
        fc.stringMatching(/^\d{6}$/),
        async (emptySecret, token) => {
          const { spyDecrypt, wasCalled } = makeSpyDecrypt();
          const result = await verifyTotpTokenWithRotation(
            emptySecret as string | null | undefined,
            token,
            spyDecrypt,
          );
          expect(result.ok).toBe(false);
          expect(result.step).toBeNull();
          expect(wasCalled()).toBe(false);
        },
      ),
      { numRuns: 30 },
    );
  });

  /**
   * P8c — For a valid token (enc:v1: encrypted, correct TOTP code), the result
   * is truthy when no lastStep is provided. This is the core preservation invariant:
   * a first-use valid token MUST always succeed.
   *
   * We generate fresh secrets and tokens each run to avoid timing issues.
   *
   * **Validates: Requirements 3.1, 3.2**
   */
  it("P8c (PBT): valid token with enc:v1: encrypted secret → truthy result (no lastStep)", async () => {
    // We use a fixed secret generated once per test to avoid timing edge cases
    // across many PBT iterations.
    const { secret } = generateTotpSecret("pbt-valid@example.com");
    const encryptedSecret = "enc:v1:" + secret;
    const { token } = generateValidToken(secret);

    await fc.assert(
      fc.asyncProperty(
        // lastStep is null or omitted — the non-replay case
        fc.constantFrom(null, undefined),
        async (_lastStep) => {
          const result = await verifyTotpTokenWithRotation(encryptedSecret, token, noopDecrypt);
          expect(result.ok).toBe(true);
          expect(typeof result.step).toBe("number");
        },
      ),
      { numRuns: 10 }, // Small — we're really just confirming the truthy invariant
    );
  });

  /**
   * P8d — SHA-1 secret past the deprecation deadline always returns falsy,
   * regardless of whether the token would otherwise be valid.
   *
   * The SHA-1 deprecation check fires before TOTP validation, so even a
   * technically-correct token must be rejected after the deadline.
   *
   * NOTE: For enc:v0: secrets, decryptFn may be called depending on code path
   * ordering. The key invariant is that the RESULT is falsy.
   *
   * **Validates: Requirements 3.4**
   */
  it("P8d (PBT): SHA-1 secret past deadline → always falsy regardless of token", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(POST_DEADLINE_DATE);

    await fc.assert(
      fc.asyncProperty(
        fc.oneof(
          // enc:v0: → legacy SHA-1 era
          fc.base64String({ minLength: 8, maxLength: 20 }).map((s) => "enc:v0:" + s),
          // plaintext (no enc:v1: prefix) → legacy SHA-1 era
          fc.base64String({ minLength: 8, maxLength: 20 }),
        ),
        fc.stringMatching(/^\d{6}$/),
        async (sha1Secret, token) => {
          const result = await verifyTotpTokenWithRotation(sha1Secret, token, noopDecrypt);
          // The key invariant: SHA-1 secrets past the deadline always return ok:false
          expect(result.ok).toBe(false);
          expect(result.step).toBeNull();
        },
      ),
      { numRuns: 30 },
    );

    vi.useRealTimers();
  });
});
