/**
 * T1-F4 regression: TOTP codes were replayable within their ~90-second validity
 * window (window:1 = ±1 step × 30s). verifyTotpToken() returned a boolean and
 * callers never persisted the time-step, so capturing a valid code and reusing
 * it before expiry would succeed. NIST 800-63B §5.1.4.2 requires single-use OTP.
 *
 * The fix adds verifyTotpTokenStep() — same verification, but returns the
 * integer time-step that was consumed so callers can:
 *   1. Persist it via claimTotpStep() (conditional UPDATE).
 *   2. Reject requests where step <= last_totp_step (already consumed).
 */
import { describe, it, expect } from "vitest";
import { generateTotpSecret, verifyTotpTokenStep, TOTP_PERIOD } from "@/lib/totp";

async function generateValidToken(secret: string, algorithm: string) {
  const OTPAuth = await import("otpauth");
  const totp = new OTPAuth.TOTP({
    secret: OTPAuth.Secret.fromBase32(secret),
    algorithm: algorithm as "SHA256" | "SHA1" | "SHA512",
    digits: 6,
    period: TOTP_PERIOD,
  });
  return totp.generate();
}

describe("T1-F4: verifyTotpTokenStep — single-use OTP", () => {
  it("returns { ok: false } for an invalid token", () => {
    const { secret } = generateTotpSecret("test@example.com");
    // "aaaaaa" is not a digit-only 6-char token — verifyTotpToken would just
    // return false; verifyTotpTokenStep must also return { ok: false }
    const result = verifyTotpTokenStep(secret, "aaaaaa");
    expect(result.ok).toBe(false);
  });

  it("returns { ok: false } for a clearly wrong numeric token", () => {
    const { secret } = generateTotpSecret("test@example.com");
    // "000000" has ~0.03% chance of being valid — acceptable for a unit test.
    // The real contract is { ok: false } for any invalid token.
    const result = verifyTotpTokenStep(secret, "000000");
    // Note: may be flaky with probability 1/1000 — retry if it ever fails.
    expect(result.ok).toBe(false);
  });

  it("returns { ok: true, step: number } for a valid current token", async () => {
    const { secret, algorithm } = generateTotpSecret("test@example.com");
    const token = await generateValidToken(secret, algorithm);

    const before = Math.floor(Date.now() / 1000 / TOTP_PERIOD);
    const result = verifyTotpTokenStep(secret, token);
    const after = Math.floor(Date.now() / 1000 / TOTP_PERIOD);

    expect(result.ok).toBe(true);
    if (result.ok) {
      // Step must be the current step ± window (1)
      expect(result.step).toBeGreaterThanOrEqual(before - 1);
      expect(result.step).toBeLessThanOrEqual(after + 1);
    }
  });

  it("the returned step is the accepted time-step (currentStep + delta)", async () => {
    const { secret, algorithm } = generateTotpSecret("test@example.com");
    const token = await generateValidToken(secret, algorithm);
    const currentStep = Math.floor(Date.now() / 1000 / TOTP_PERIOD);

    const result = verifyTotpTokenStep(secret, token);

    expect(result.ok).toBe(true);
    if (result.ok) {
      // The step must be within ±1 of the current step (matches window:1)
      expect(Math.abs(result.step - currentStep)).toBeLessThanOrEqual(1);
    }
  });

  it("two identical calls for the same valid token return the same step", async () => {
    // This verifies that the step value is deterministic and suitable for
    // use as a conditional-update key in claimTotpStep().
    const { secret, algorithm } = generateTotpSecret("test@example.com");
    const token = await generateValidToken(secret, algorithm);

    const r1 = verifyTotpTokenStep(secret, token);
    const r2 = verifyTotpTokenStep(secret, token);

    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    if (r1.ok && r2.ok) {
      // Same token, same clock → same step (idempotent; replay detection lives in claimTotpStep)
      expect(r1.step).toBe(r2.step);
    }
  });

  it("TOTP_PERIOD matches the 30s window used to compute the step", () => {
    expect(TOTP_PERIOD).toBe(30);
    // A step must represent a 30s window
    const step1 = Math.floor(1000000 / TOTP_PERIOD);
    const step2 = Math.floor(1000019 / TOTP_PERIOD); // same 30s window: 999990..1000019
    // 1000000 and 1000019 are in the same 30s window
    expect(step1).toBe(step2);
    // 1000020 starts the next window
    expect(Math.floor(1000000 / TOTP_PERIOD)).toBeLessThan(Math.floor(1000020 / TOTP_PERIOD));
  });
});
