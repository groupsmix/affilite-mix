/**
 * Integration-test gate (J-1).
 *
 * Tests under `__tests__/integration/**` talk to a real Supabase instance
 * and must be opt-in — unit test runs in CI use placeholder env vars and
 * would otherwise hit network errors.  A test is only executed when:
 *
 *   1. `TEST_WITH_SUPABASE=1` is set (explicit opt-in from the runner)
 *   2. `NEXT_PUBLIC_SUPABASE_URL` is configured with a non-placeholder
 *      value (we use `https://placeholder.supabase.co` in CI's default env)
 *
 * Both conditions must be true; either one alone is treated as "not
 * configured" and the suite is skipped via `describe.skipIf`.
 *
 * For local development use `docker-compose up -d` + the exports in
 * `scripts/integration-env.sh`.  For CI, the nightly
 * `integration-nightly.yml` workflow wires these variables from the
 * `STAGING_SUPABASE_*` GitHub secrets.
 */
export const shouldRunSupabaseIntegration: boolean =
  process.env.TEST_WITH_SUPABASE === "1" &&
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !process.env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder");
