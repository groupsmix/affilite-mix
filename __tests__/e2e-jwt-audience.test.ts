/**
 * R2.1 static-source check: every E2E test file that mints a JWT for the
 * admin login flow MUST set the audience (`aud`) claim to exactly
 * "affilite-mix-admin" — the value lib/auth.ts verifyToken() expects.
 *
 * This is a source-level assertion (not a runtime mint) so a regression in
 * the token-minting helper — a typo'd audience, a dropped setAudience() call,
 * or a new E2E file that issues a token with the wrong audience — fails here
 * rather than surfacing as a confusing auth rejection deep in the E2E run.
 *
 * Scope: each E2E spec that constructs a `new SignJWT(...)` is a token issuer
 * and is required to carry the correct audience.
 *
 * _Requirements: 2.1_
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const EXPECTED_AUDIENCE = "affilite-mix-admin";
const E2E_DIR = resolve(__dirname, "..", "e2e");

/** All E2E spec files (top-level + helpers) that may mint tokens. */
function listE2eSourceFiles(): string[] {
  const entries = readdirSync(E2E_DIR, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && e.name.endsWith(".ts"))
    .map((e) => resolve(E2E_DIR, e.name));
}

/** Files that issue a JWT (construct a SignJWT). These are the token-minters. */
function listTokenMintingFiles(): { path: string; src: string }[] {
  return listE2eSourceFiles()
    .map((path) => ({ path, src: readFileSync(path, "utf8") }))
    .filter(({ src }) => /new\s+SignJWT\s*\(/.test(src));
}

describe("R2.1: E2E token-minting helpers set the JWT audience to affilite-mix-admin", () => {
  it("has at least one E2E file that mints an admin JWT", () => {
    // Guards against the discovery logic silently matching nothing (which
    // would make every assertion below vacuously pass).
    expect(listTokenMintingFiles().length).toBeGreaterThan(0);
  });

  it('every token-minting E2E file calls setAudience("affilite-mix-admin")', () => {
    const minters = listTokenMintingFiles();
    // Allow single- or double-quoted string literals around the audience.
    const setAudiencePattern = new RegExp(
      `\\.setAudience\\(\\s*["']${EXPECTED_AUDIENCE}["']\\s*\\)`,
    );
    for (const { path, src } of minters) {
      expect(
        setAudiencePattern.test(src),
        `${path} must call setAudience("${EXPECTED_AUDIENCE}")`,
      ).toBe(true);
    }
  });

  it("no token-minting E2E file sets a setAudience() value other than affilite-mix-admin", () => {
    const minters = listTokenMintingFiles();
    // Find every setAudience("...") call with a string-literal argument and
    // assert the argument is exactly the expected audience.
    const anyAudiencePattern = /\.setAudience\(\s*["']([^"']*)["']\s*\)/g;
    for (const { path, src } of minters) {
      for (const match of src.matchAll(anyAudiencePattern)) {
        const value = match[1];
        expect(value, `${path} sets an unexpected JWT audience "${value}"`).toBe(EXPECTED_AUDIENCE);
      }
    }
  });
});
