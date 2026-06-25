/**
 * Task 1.1 — Bug 1 exploration test (PHASE 1, run on UNFIXED code).
 *
 * BUG: `hashEmailForGdpr` uses `import crypto from "crypto"` (Node.js built-in).
 * On Cloudflare Workers that import resolves to `undefined`, so any call to
 * `crypto.createHmac(...)` throws:
 *   TypeError: Cannot read properties of undefined (reading 'createHmac')
 *
 * GOAL: Prove the bug exists BEFORE the fix is applied.
 * This test is EXPECTED TO FAIL on unfixed code — failure IS the success signal.
 *
 * Scoped PBT approach:
 *   - Replace the `crypto` module export with `undefined` (simulating Workers)
 *   - Call `hashEmailForGdpr("user@example.com")`
 *   - Assert it does NOT throw (the fixed behaviour)
 *   → On unfixed code the assertion fails, confirming the bug.
 *
 * Validates: Requirements 1.1, 1.2
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─────────────────────────────────────────────────────────────────────────────
// Mock the Node.js `crypto` built-in to `undefined`, simulating what happens
// on Cloudflare Workers where the import resolves to nothing.
// ─────────────────────────────────────────────────────────────────────────────
vi.mock("crypto", () => ({
  default: undefined,
}));

describe("Bug 1 exploration — hashEmailForGdpr crashes when Node.js crypto is unavailable", () => {
  beforeEach(() => {
    process.env.GDPR_HASH_SECRET = "test-secret-for-bug1-exploration";
    // Ensure the module cache is cleared so the mock takes effect
    vi.resetModules();
  });

  afterEach(() => {
    delete process.env.GDPR_HASH_SECRET;
  });

  /**
   * Property 1: Bug Condition — Node.js `crypto` import breaks on Workers runtime
   *
   * When `crypto` default export is `undefined` (Workers simulation), calling
   * `hashEmailForGdpr` should NOT throw a TypeError.
   *
   * On UNFIXED code: `crypto` is `undefined` → `crypto.createHmac` throws
   *   TypeError: Cannot read properties of undefined (reading 'createHmac')
   * This test assertion (no throw) therefore FAILS on unfixed code, confirming bug.
   *
   * Validates: Requirements 1.1, 1.2
   */
  it("Property 1: hashEmailForGdpr should not throw when Node.js crypto module is undefined (Workers simulation)", async () => {
    // Re-import the module AFTER the mock is in place so the mock takes effect
    const { hashEmailForGdpr } = await import("@/lib/gdpr-hash");

    // On UNFIXED code: this throws TypeError because `crypto` (the mocked `undefined`)
    // does not have `createHmac`. The test FAILS here — confirming the bug.
    // On FIXED code: uses `globalThis.crypto.subtle` instead, so no throw.
    await expect(
      Promise.resolve().then(() => hashEmailForGdpr("user@example.com")),
    ).resolves.toBeDefined();
  });
});
