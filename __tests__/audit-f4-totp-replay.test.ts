/**
 * F4 audit: TOTP replay protection.
 *
 * A captured 6-digit code must not be usable more than once within its
 * validity window (~90s with window:1 = 3 steps of 30s). The fix persists
 * the highest consumed time-step and rejects subsequent codes whose step
 * is less than or equal to that baseline.
 */
import { describe, it, expect } from "vitest";
import * as OTPAuth from "otpauth";
import { verifyTotpToken } from "@/lib/totp";

const PERIOD = 30;

function generateValidCode(secret: string): string {
  const totp = new OTPAuth.TOTP({
    algorithm: "SHA256",
    digits: 6,
    period: PERIOD,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
  return totp.generate();
}

function currentStepNumber(): number {
  return Math.floor(Date.now() / 1000 / PERIOD);
}

describe("F4: verifyTotpToken single-use semantics", () => {
  it("returns ok=false for an invalid token", () => {
    // 32-char base32 secret
    const secret = "JBSWY3DPEHPK3PXPABCDEFGH";
    const result = verifyTotpToken(secret, "000000");
    expect(result.ok).toBe(false);
    expect(result.step).toBe(null);
  });

  it("accepts a valid code and returns the current time-step", () => {
    const secret = "JBSWY3DPEHPK3PXPABCDEFGH";
    const code = generateValidCode(secret);
    const result = verifyTotpToken(secret, code);
    expect(result.ok).toBe(true);
    expect(result.step).toBeTypeOf("number");
    // The returned step must be within ±1 of "now" (window:1 allows ±1 step).
    const now = currentStepNumber();
    expect(Math.abs((result.step as number) - now)).toBeLessThanOrEqual(1);
  });

  it("treats lastStep=null as no baseline (first use passes through)", () => {
    const secret = "JBSWY3DPEHPK3PXPABCDEFGH";
    const code = generateValidCode(secret);
    const result = verifyTotpToken(secret, code, { lastStep: null });
    expect(result.ok).toBe(true);
  });

  it("rejects the same code when its step is less than or equal to lastStep", () => {
    const secret = "JBSWY3DPEHPK3PXPABCDEFGH";
    const code = generateValidCode(secret);
    // First use establishes the baseline
    const first = verifyTotpToken(secret, code, { lastStep: null });
    expect(first.ok).toBe(true);
    const step = first.step as number;
    // Replay the same code with lastStep equal to the consumed step
    const replay = verifyTotpToken(secret, code, { lastStep: step });
    expect(replay.ok).toBe(false);
    expect(replay.step).toBe(null);
  });

  it("replays the same code with lastStep strictly greater than the consumed step", () => {
    const secret = "JBSWY3DPEHPK3PXPABCDEFGH";
    const code = generateValidCode(secret);
    const first = verifyTotpToken(secret, code, { lastStep: null });
    const step = first.step as number;
    const replay = verifyTotpToken(secret, code, { lastStep: step + 5 });
    expect(replay.ok).toBe(false);
  });

  it("does NOT reject a code whose step is strictly greater than lastStep (forward drift)", () => {
    // A clock-drifted user should still be able to authenticate with a code
    // that the server sees as a newer step than the last one consumed.
    const secret = "JBSWY3DPEHPK3PXPABCDEFGH";
    const code = generateValidCode(secret);
    const now = currentStepNumber();
    // Pretend the server has previously consumed a step one minute ago.
    const lastStep = now - 2;
    const result = verifyTotpToken(secret, code, { lastStep });
    expect(result.ok).toBe(true);
  });
});
