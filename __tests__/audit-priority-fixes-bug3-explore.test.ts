/**
 * Task 1.3 — Bug 3 exploration test (PHASE 1, run on UNFIXED code).
 *
 * BUG: `docker/kong.yml` contains hardcoded Supabase demo JWT keys as literal
 * strings committed to source control. Anyone with repository read access can
 * use these keys to authenticate against any Supabase project that has not
 * rotated away from the default demo keys.
 *
 * GOAL: Confirm the literal JWT strings exist in the committed file BEFORE the
 * fix is applied.
 *
 * Scoped approach:
 *   - Read `docker/kong.yml` as raw text from disk
 *   - Assert the known Supabase demo anon JWT prefix is NOT present
 *   - Assert the known Supabase demo service_role JWT prefix is NOT present
 *   → On UNFIXED code both assertions FAIL because the strings ARE present,
 *     confirming the bug.
 *
 * EXPECTED OUTCOME (on UNFIXED code): Tests FAIL because the literal JWT strings
 * ARE present in the file.
 *
 * Documented counterexample:
 *   Both `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIs...`
 *   and `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwi...`
 *   found in `docker/kong.yml`.
 *
 * Validates: Requirements 1.1, 1.2
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

// The well-known Supabase self-hosted demo JWT prefixes.
// These are publicly documented in the Supabase self-hosted quickstart docs.
const ANON_JWT_PREFIX = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIs";
const SERVICE_ROLE_JWT_PREFIX =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwi";

// Resolve the path from the workspace root (one level up from __tests__)
const kongYmlPath = path.resolve(__dirname, "..", "docker", "kong.yml");

describe("Bug 3 exploration — docker/kong.yml contains literal JWT strings", () => {
  /**
   * Property 3: Bug Condition — Hardcoded Supabase JWT keys are present in source
   *
   * The committed `docker/kong.yml` MUST NOT contain the literal Supabase demo
   * anon JWT string. After the fix this assertion will PASS because the value
   * will be replaced with `$SUPABASE_ANON_KEY`.
   *
   * On UNFIXED code: the literal JWT IS present, so
   *   `fileContent.includes(ANON_JWT_PREFIX)` returns `true`
   * and the assertion `not.toContain(ANON_JWT_PREFIX)` FAILS, confirming the bug.
   *
   * Validates: Requirements 1.1, 1.2
   */
  it("Property 3a: docker/kong.yml must NOT contain the hardcoded Supabase anon JWT string", () => {
    const fileContent = fs.readFileSync(kongYmlPath, "utf-8");

    // Bug-condition check — this is true on UNFIXED code:
    //   fileContent.includes(ANON_JWT_PREFIX) === true
    // The `not.toContain` assertion therefore FAILS, confirming the bug.
    expect(fileContent).not.toContain(ANON_JWT_PREFIX);
  });

  /**
   * Property 3b: Bug Condition — Hardcoded service_role JWT key present in source
   *
   * The committed `docker/kong.yml` MUST NOT contain the literal Supabase demo
   * service_role JWT string. After the fix this assertion will PASS because the
   * value will be replaced with `$SUPABASE_SERVICE_ROLE_KEY`.
   *
   * On UNFIXED code: the literal JWT IS present, so
   *   `fileContent.includes(SERVICE_ROLE_JWT_PREFIX)` returns `true`
   * and the assertion `not.toContain(SERVICE_ROLE_JWT_PREFIX)` FAILS, confirming the bug.
   *
   * Validates: Requirements 1.1, 1.2
   */
  it("Property 3b: docker/kong.yml must NOT contain the hardcoded Supabase service_role JWT string", () => {
    const fileContent = fs.readFileSync(kongYmlPath, "utf-8");

    // Bug-condition check — this is true on UNFIXED code:
    //   fileContent.includes(SERVICE_ROLE_JWT_PREFIX) === true
    // The `not.toContain` assertion therefore FAILS, confirming the bug.
    expect(fileContent).not.toContain(SERVICE_ROLE_JWT_PREFIX);
  });

  /**
   * Property 3c: Bug Condition — Both env var references are absent (unfixed state)
   *
   * After the fix, `docker/kong.yml` MUST reference `$SUPABASE_ANON_KEY` and
   * `$SUPABASE_SERVICE_ROLE_KEY` rather than literal JWT strings. On unfixed code
   * these references are NOT present, which is the expected failing state here.
   *
   * This test asserts that env var references ARE present (the fixed state).
   * On UNFIXED code both assertions FAIL, further confirming the bug.
   *
   * Validates: Requirements 1.1, 1.2
   */
  it("Property 3c: docker/kong.yml must reference $SUPABASE_ANON_KEY and $SUPABASE_SERVICE_ROLE_KEY instead of literal JWTs", () => {
    const fileContent = fs.readFileSync(kongYmlPath, "utf-8");

    // After the fix: env var references must be present
    expect(fileContent).toContain("$SUPABASE_ANON_KEY");
    expect(fileContent).toContain("$SUPABASE_SERVICE_ROLE_KEY");

    // After the fix: no literal JWT values must remain
    expect(fileContent).not.toContain(ANON_JWT_PREFIX);
    expect(fileContent).not.toContain(SERVICE_ROLE_JWT_PREFIX);
  });
});
