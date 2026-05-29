/**
 * SEC-TURNSTILE-01 (#628): Regression test ensuring Turnstile verification
 * is always called in the wrist-shots POST handler, not conditionally
 * skipped when turnstileToken is omitted.
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const routeSource = fs.readFileSync(
  path.resolve(__dirname, "../app/api/community/wrist-shots/route.ts"),
  "utf-8",
);

describe("SEC-TURNSTILE-01 (#628): wrist-shots Turnstile required", () => {
  it("calls verifyTurnstile unconditionally (not wrapped in if-token check)", () => {
    // The old code was: `if (body.turnstileToken) { ... verifyTurnstile ... }`
    // After the fix, verifyTurnstile is called outside any conditional on token presence
    expect(routeSource).not.toMatch(/if\s*\(body\.turnstileToken\)\s*\{[\s\S]*?verifyTurnstile/);
  });

  it("passes turnstileToken ?? null to verifyTurnstile", () => {
    expect(routeSource).toContain("body.turnstileToken ?? null");
  });

  it("checks turnstileResult.success (not just truthiness)", () => {
    expect(routeSource).toContain("turnstileResult.success");
  });

  it("returns 403 when Turnstile fails", () => {
    const turnstileBlock = routeSource.slice(
      routeSource.indexOf("turnstileResult"),
      routeSource.indexOf("try {", routeSource.indexOf("turnstileResult")),
    );
    expect(turnstileBlock).toContain("403");
  });

  it("returns the error message from verifyTurnstile", () => {
    expect(routeSource).toContain('turnstileResult.error ?? "Captcha verification failed"');
  });
});
