/**
 * Task 1.2 / 4.2 — Bug 2 exploration test (confirms the fix works).
 *
 * BUG (was): `verifyTotpTokenWithRotation` in `lib/totp.ts` ignored the `lastStep`
 * option entirely because:
 *   1. The function signature had no `options` parameter.
 *   2. The inner `verifyTotpToken` call was invoked WITHOUT forwarding `options.lastStep`.
 *   3. The function returned a plain `boolean` instead of `VerifyTotpStepResult`.
 *
 * FIX (task 4.1 applied): The function now accepts `options?: { lastStep?: number | null }`,
 * forwards it to `verifyTotpToken`, and returns `VerifyTotpStepResult`.
 *
 * These tests now PASS after the fix is applied.
 *
 * Validates: Requirements 1.1, 1.2, 1.3, 2.1, 2.4
 */
import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import * as OTPAuth from "otpauth";
import { generateTotpSecret, verifyTotpTokenWithRotation } from "@/lib/totp";

const PERIOD = 30;

/**
 * Generate a current valid TOTP token for a given raw base32 secret.
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
 * A no-op decryptFn that just returns the ciphertext as-is.
 * Used to simulate storing the raw base32 secret with enc:v1: prefix.
 */
const noopDecrypt = async (cipher: string, _usePrevKey: boolean) => cipher;

describe("Bug 2 exploration — verifyTotpTokenWithRotation replay protection (fix verification)", () => {
  /**
   * Property 2a: Bug Condition — Replay accepted because `lastStep` is never forwarded
   *
   * When a token whose time-step equals `lastStep` is submitted, the function MUST
   * return `{ ok: false, step: null }` — i.e., reject the replay.
   *
   * On UNFIXED code: the function ignores `lastStep` entirely (the parameter does
   * not even exist). The valid token is accepted and `true` is returned.
   * The assertion `expect(result).toEqual({ ok: false, step: null })` FAILS,
   * confirming the bug.
   *
   * Validates: Requirements 1.1, 1.3
   */
  it("Property 2a: replay is rejected when lastStep equals the token's current time-step", async () => {
    const { secret } = generateTotpSecret("replay-test@example.com");
    // Encrypt the secret with enc:v1: prefix so the rotation path is exercised
    const encryptedSecret = "enc:v1:" + secret;
    const { token, step } = generateValidToken(secret);

    // Fixed code: options parameter is now accepted and lastStep is forwarded.
    const result = await verifyTotpTokenWithRotation(encryptedSecret, token, noopDecrypt, {
      lastStep: step,
    });

    // Replay rejected → { ok: false, step: null }
    expect(result).toEqual({ ok: false, step: null });
  });

  /**
   * Property 2b: Bug Condition — Return type is VerifyTotpStepResult, not boolean
   *
   * Even on a first-use (non-replay) call, the fixed function must return an object
   * of shape `{ ok: boolean; step: number | null }`.
   *
   * On UNFIXED code: the function is typed as `Promise<boolean>` and returns `true`
   * or `false`. The shape assertion fails, confirming the return-type bug.
   *
   * Validates: Requirements 1.2
   */
  it("Property 2b: return value has shape { ok: boolean; step: number | null }", async () => {
    const { secret } = generateTotpSecret("shape-test@example.com");
    const encryptedSecret = "enc:v1:" + secret;
    const { token } = generateValidToken(secret);

    // Fixed code: returns { ok: true, step: N } for a valid non-replayed token.
    const result = await verifyTotpTokenWithRotation(encryptedSecret, token, noopDecrypt);

    // Shape check: result must be an object with ok (boolean) and step (number | null)
    expect(typeof result).toBe("object");
    expect(result).not.toBeNull();
    expect(result).toHaveProperty("ok");
    expect(result).toHaveProperty("step");
    expect(typeof result.ok).toBe("boolean");
    expect(result.step === null || typeof result.step === "number").toBe(true);
    // On a valid first-use token, ok must be true
    expect(result.ok).toBe(true);
    expect(typeof result.step).toBe("number");
  });

  /**
   * Property 2c: PBT — For arbitrary time-step values ≥ current step, replay is always rejected
   *
   * Uses fast-check to generate arbitrary lastStep values at or above the current
   * time-step. For every such value, a currently-valid token must be rejected.
   *
   * On UNFIXED code: all generated inputs produce `true` (replay accepted).
   * The assertion fails, confirming the bug across many inputs.
   *
   * Validates: Requirements 1.1, 1.3
   */
  it("Property 2c (PBT): replay is rejected for any lastStep ≥ current time-step", async () => {
    const { secret } = generateTotpSecret("pbt-replay@example.com");
    const encryptedSecret = "enc:v1:" + secret;
    const { token, step: currentStep } = generateValidToken(secret);

    await fc.assert(
      fc.asyncProperty(
        // Generate lastStep values at or above the current step (up to +10 steps ahead)
        fc.integer({ min: currentStep, max: currentStep + 10 }),
        async (lastStep) => {
          const result = await verifyTotpTokenWithRotation(encryptedSecret, token, noopDecrypt, {
            lastStep,
          });

          // Fixed code: replay is rejected for every generated lastStep.
          expect(result).toEqual({ ok: false, step: null });
        },
      ),
      { numRuns: 20 },
    );
  });
});
