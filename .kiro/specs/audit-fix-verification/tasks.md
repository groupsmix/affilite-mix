# Implementation Plan: Audit Fix Verification Suite

## Overview

This plan builds the **verification suite** for sixteen already-applied fixes. No fix is re-implemented except where the design explicitly calls for it: extracting `isLoginPage` into a pure helper (R6) and adding a distinguishing query-failure/empty-period flag to `getAnalyticsSummary` so R11.3/R11.4 can be verified.

The work is sequenced to: (1) stand up the property-based testing harness, (2) make the pure logic independently testable, (3) write the nine property-based tests, (4) add mocked-fetch handler tests, SSR/CSR comparison tests, unit tests, and static-source/build checks, and (5) reconcile the two known discrepancies. Each task references the requirement(s) it covers; every property test references its design Property number.

Stack: TypeScript, Vitest (`npm test` → `vitest run`), fast-check for properties, Playwright for E2E (`npm run test:e2e`). Run property suites once (no watch mode): `npx vitest run <file>`.

## Tasks

- [x] 1. Add and wire the property-based testing harness
  - [x] 1.1 Add fast-check as a dev dependency and confirm Vitest integration
    - Add `fast-check` to `devDependencies` in `package.json` (pinned exact version)
    - Run `npm install` and verify `fast-check` resolves
    - Add a minimal throwaway `fc.assert(fc.property(...), { numRuns: 100 })` test, run it via `npx vitest run`, confirm it executes 100 iterations, then remove the throwaway file
    - Confirm no extra Vitest config is required (fast-check runs under the existing `vitest run` setup)
    - _Requirements: 6.1, 9.1, 11.1, 16.2_

- [x] 2. Extract the `isLoginPage` pure helper and verify it (R6)
  - [x] 2.1 Create the pure `isLoginPage` helper
    - Create `e2e/helpers/is-login-page.ts` exporting `isLoginPage(url: unknown): boolean`
    - Match only the case-sensitive substring `/q7m-k4j9/login`; return `false` for non-string, null, undefined, and empty string without throwing
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [x] 2.2 Refactor the existing async guard to use the pure helper
    - Update the inline `isLoginPage` async guard in `e2e/admin-site-manager-delete.spec.ts` to call the new pure helper for its URL check, preserving existing E2E behavior
    - _Requirements: 6.1_

  - [x]\* 2.3 Write property test for `isLoginPage`
    - File: `e2e/helpers/__tests__/is-login-page.test.ts`
    - **Property 1: `isLoginPage` matches exactly the obfuscated login segment** (`{ numRuns: 100 }`)
    - Generate strings containing `/q7m-k4j9/login`, strings containing `/admin/login` only, arbitrary strings, plus null/undefined/empty/non-string inputs
    - **Validates: Requirements 6.1, 6.2, 6.3, 6.4**

- [x] 3. Verify EPC per-link-group aggregation (R9)
  - [x] 3.1 Extract the link-grouping core into a pure, testable helper
    - In/near `app/api/cron/epc-recompute/route.ts`, expose a pure grouping function keyed by `(site_id, product_id, network)` and the per-group dedup-click + EPC computation so they can be exercised without I/O
    - Wire the existing run path to use the extracted helper (no behavior change); keep `upsertProductEpc` in `lib/dal/commissions.ts` as the upsert seam
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

  - [x]\* 3.2 Write property test for link-group partitioning
    - File: `__tests__/epc-recompute-aggregation.test.ts`
    - **Property 2: Affiliate links partition into link groups by their tuple** (`{ numRuns: 100 }`)
    - **Validates: Requirements 9.1**

  - [x]\* 3.3 Write property test for deduplicated group click count
    - Add to `__tests__/epc-recompute-aggregation.test.ts`
    - **Property 3: A group's click count is the deduplicated total over its URLs** (`{ numRuns: 100 }`)
    - **Validates: Requirements 9.2, 9.4**

  - [x]\* 3.4 Write property test for one upsert per link group per run
    - Add to `__tests__/epc-recompute-aggregation.test.ts`, using a spy on `upsertProductEpc`
    - **Property 4: Exactly one upsert per link group per run** (`{ numRuns: 100 }`)
    - **Validates: Requirements 9.3**

  - [x]\* 3.5 Write property test for EPC computation with zero/missing handling
    - Add to `__tests__/epc-recompute-aggregation.test.ts`
    - **Property 5: EPC is earnings over clicks, with safe zero/missing handling** (`{ numRuns: 100 }`)
    - Cover round-half-up to 2 decimals, zero-clicks → EPC 0 (no division error), missing/undefined earnings → 0
    - **Validates: Requirements 9.5, 9.6, 9.7**

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Verify domain rollup via injected privileged client (R10)
  - [x]\* 5.1 Write property test for domain rollup over injected data
    - File: `__tests__/domain-performance-rollup.test.ts`
    - Inject a fake `DalClientGetter` returning in-memory `listSites` + click-count/rate stubs (no real Supabase)
    - **Property 6: Domain rollup reflects the underlying per-site data** (`{ numRuns: 100 }`)
    - Assert one row per site, `clicks` equals injected count, `revenue` equals `round(clicks * rate, 2)`, all-zero iff every injected click count is zero
    - **Validates: Requirements 10.3, 10.8**

  - [x]\* 5.2 Write unit test for the client-retrieval error path
    - Add to `__tests__/domain-performance-rollup.test.ts`; inject a getter returning an unusable client
    - Assert `getDomainPerformance` surfaces a client-retrieval error and returns no rows (does not silently return zeros)
    - _Requirements: 10.9_

  - [x]\* 5.3 Write static-source check for route wiring and allowlist membership
    - Assert `app/api/admin/analytics/domains/route.ts` passes `getPrivilegedSupabaseClient` to `getDomainPerformance`
    - Assert both the runtime allowlist (`lib/security/service-role-allowlist.ts`) and the test allowlist include `getDomainPerformance` and the domain-performance route
    - _Requirements: 10.1, 10.2, 10.4_

  - [x]\* 5.4 Write SEC-03 cap and boundary checks
    - Assert the SEC-03 cap is 39, that an allowlist with ≤39 entries passes, and that >39 fails
    - _Requirements: 10.5, 10.6, 10.7_

  - [x] 5.5 Reconcile the SEC-03 cap discrepancy (38 vs live `<=39`)
    - Compare R10.5's cap of 38 against the live `__tests__/audit3-locks.test.ts` assertion of `count <= 39`
    - Resolve the conflict explicitly: either update the SEC-03 baseline/cap to a single agreed value or document why the live cap diverges from the requirement, and align the verification test in 5.4 with the resolution
    - Surface the decision to the user if the correct value is ambiguous
    - **RESOLVED (Option A, user-approved):** Empirically counted the live allowlist at **39** entries. The `38` existed only in R10.5; no `38`/`39` constant lives in code — SEC-03 is enforced solely by the `count <= 39` regression lock in `audit3-locks.test.ts`. The 39th entry (`lib/audit-log.ts`) is a legitimate, separately-audited addition made after the B-F2 domain-performance fix R10 verifies. Reconciled by updating R10.5/10.6/10.7 and task 5.4 to a cap of **39** (single source of truth, matching the live audited count). Design note updated accordingly.
    - _Requirements: 10.5, 10.6, 10.7_

- [x] 6. Verify AOV from real commissions (R11)
  - [x] 6.1 Add a distinguishable query-failure vs empty-period indication to `getAnalyticsSummary`
    - Update `lib/dal/analytics-dashboard.ts` so the two zero-valued AOV outcomes are distinguishable: a query failure emits a _query-failure_ indication (no partial results retained); an empty in-window period emits an _empty-period_ indication
    - This is the one application change R11 verification requires; without it R11.3/R11.4 cannot pass
    - _Requirements: 11.3, 11.4_

  - [x]\* 6.2 Write property test for AOV period-window filtering
    - File: `__tests__/aov-computation.test.ts`; inject a fake commissions client
    - **Property 7: AOV includes only commissions within the period window** (`[start, end)`, inclusive start, exclusive end) (`{ numRuns: 100 }`)
    - **Validates: Requirements 11.1**

  - [x]\* 6.3 Write property test for AOV mean computation
    - Add to `__tests__/aov-computation.test.ts`
    - **Property 8: AOV is the mean sale amount over the period** (`round(sum/order_count, 2)`) (`{ numRuns: 100 }`)
    - **Validates: Requirements 11.2**

  - [x]\* 6.4 Write unit tests for AOV query-failure and empty-period indications
    - Add to `__tests__/aov-computation.test.ts`
    - Inject a failing commissions query → assert AOV 0 with _query-failure_ indication and no partial results
    - Inject an empty in-window result → assert AOV 0 with _empty-period_ indication
    - _Requirements: 11.3, 11.4_

- [x] 7. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Verify dead response-HMAC removal (R12)
  - [x]\* 8.1 Write static-source assertions for removed HMAC code
    - Assert no `computeResponseHmac` definition exists in any source file
    - Assert no `response_hmac` reference remains in source (excluding spec/comment anchors), covering each of the three previously affected usages
    - Assert no orphaned crypto import remains while preserving crypto imports still referenced elsewhere
    - _Requirements: 12.1, 12.2, 12.3_

  - [x]\* 8.2 Write build/typecheck smoke check for clean removal
    - Run the existing typecheck step (`npm run typecheck`) and assert it completes without unresolved-reference errors attributable to `computeResponseHmac`/`response_hmac`
    - Add an example test confirming response generation produces the same output minus the HMAC field, with no error raised
    - _Requirements: 12.4, 12.5_

- [x] 9. Verify admin handler error surfacing via mocked-fetch (jsdom)
  - [x]\* 9.1 Write page-reorder handler tests (R13)
    - Render `app/q7m-k4j9/(dashboard)/pages/page-manager.tsx` (or invoke `handleMoveUp`/`handleMoveDown`) under jsdom with `fetchWithCsrf`/`fetch` mocked
    - Cover: non-OK → `setError` + `loadPages` restore; OK → `loadPages`; error banner visible while form closed; in-flight guard ignores extra requests; network rejection → error + restore; boundary no-op (already first/last)
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.7_

  - [x]\* 9.2 Write AI-content delete handler tests (R14)
    - Render `app/q7m-k4j9/(dashboard)/ai-content/ai-content-manager.tsx` under jsdom with mocked fetch
    - Cover: non-OK extracts `data.error` and `setError` while retaining item; OK clears error; `res.ok` checked before success; missing/empty error → default "Delete failed"; network failure → "could not be completed", item retained, not treated as success
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5_

  - [x]\* 9.3 Write affiliate-network delete handler tests (R15)
    - Render `app/q7m-k4j9/(dashboard)/affiliate-networks/affiliate-network-manager.tsx` under jsdom with mocked fetch
    - Cover: non-OK with body message → `setError` + item retained; OK → clear error + remove item; `res.ok` checked before success; non-parseable body → generic "Failed to delete" + item retained; no response → "could not be completed" + item retained
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5_

- [x] 10. Verify hydration-stable time rendering in cards (R16)
  - [x]\* 10.1 Write property test for timezone-stable date formatting
    - File: `__tests__/content-card-date-format.test.ts`; toggle `process.env.TZ` across runs
    - **Property 9: Card date formatting is timezone-stable** (equals `toLocaleDateString("en-US", { timeZone: "UTC" })`, invariant under ambient TZ) (`{ numRuns: 100 }`)
    - **Validates: Requirements 16.2, 16.3**

  - [x]\* 10.2 Write SSR/CSR markup comparison tests for the cards
    - Render `product-card.tsx` and `content-card.tsx` via `renderToString` and compare against the initial client render (before effects) for byte-identical time-dependent output and no React hydration mismatch warning
    - Cover: product-card `mounted` guard hides deal badge during SSR and initial CSR (16.1); mounted + active/unexpired deal renders badge within 1s (16.4); expired deal renders no badge/remaining-time (16.5); content-card with no `publish_at ?? created_at` renders no `<time>` element (16.6)
    - _Requirements: 16.1, 16.3, 16.4, 16.5, 16.6_

- [x] 11. Verify JWT audience handling (R2)
  - [x]\* 11.1 Write static-source check for test JWT audience
    - Assert token-minting helpers in E2E files (e.g., `mintAdminJwt` in `e2e/admin-login.spec.ts`) call `setAudience("affilite-mix-admin")`
    - _Requirements: 2.1_

  - [x]\* 11.2 Write unit tests for `verifyToken` audience acceptance/rejection
    - In `lib/auth.ts`'s `verifyToken`: accept `aud = "affilite-mix-admin"`; reject any other value; reject missing/empty `aud`; assert no session established on rejection
    - _Requirements: 2.2, 2.3, 2.4_

- [x] 12. Verify Playwright E2E corrections remain in place (static-source assertions)
  - [x]\* 12.1 Write static-source assertions for E2E config and waits
    - Assert `playwright.config.ts` sets `bypassCSP` for the test browser context (R3.1)
    - Assert `e2e/admin-login.spec.ts` waits on `body[data-e2e-hydrated="1"]` (R3.2), asserts the title contains "Admin Login" with a 5000ms visibility wait (R1), and selects the reset-password dialog by role `dialog` scoped to accessible name "Reset Password" (R4)
    - Assert post-login navigation uses `commit` (R5.1) and stubbed-Supabase navigation uses `domcontentloaded` with 30000ms timeout + 5000ms URL check (R7.1, R7.2)
    - Assert disabled-menu-item hover uses the `force` option (R8.1)
    - _Requirements: 1.1, 1.3, 1.4, 3.1, 3.2, 4.1, 5.1, 7.1, 7.2, 8.1_

- [x] 13. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional test sub-tasks and can be skipped for a faster MVP, but they constitute the bulk of this verification feature's value.
- The non-optional tasks (1.1, 2.1, 2.2, 3.1, 5.5, 6.1) are the structural changes the verification work requires: harness setup, the `isLoginPage` extraction, the EPC grouping seam, the SEC-03 reconciliation, and the AOV distinguishing flag.
- Property-based tests use fast-check at minimum 100 iterations and are each tagged with `Feature: audit-fix-verification, Property {number}: {property_text}`.
- Two known discrepancies are handled explicitly: task 5.5 reconciles the SEC-03 cap (R10.5's 38 vs live `<=39`; **resolved to 39** to match the live audited count — see task 5.5); task 6.1 adds the query-failure/empty-period flag so R11.3/R11.4 can pass.
- Each task references the requirement clauses it covers for traceability.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "5.3", "5.4", "8.1", "8.2", "11.1", "11.2", "12.1"] },
    {
      "id": 1,
      "tasks": ["2.1", "3.1", "5.1", "5.2", "5.5", "6.1", "9.1", "9.2", "9.3", "10.1", "10.2"]
    },
    { "id": 2, "tasks": ["2.2", "2.3", "3.2", "3.3", "3.4", "3.5", "6.2", "6.3", "6.4"] }
  ]
}
```
