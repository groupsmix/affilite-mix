# Implementation Plan

## Overview

This plan fixes the 16 launch-blocking changes across the five root-cause clusters in `design.md`,
using the bug-condition methodology. Each task maps to the bug-condition model `isBugCondition(X)`
and the correctness Properties 1–8. Exploration tests (Properties 1–7, one per cluster) and the
preservation test (Property 8) are written and run on the UNFIXED code BEFORE any fix, using
Vitest + fast-check (`__tests__/`) and injecting DB/RPC failure states (missing `sites` row, RPC
error, empty catalog, fetch non-OK) rather than depending on a live unprovisioned database. The
fix is then applied per cluster, after which the SAME tests are re-run to confirm the fix
(Properties 1–7 now pass) and preservation (Property 8 still passes).

## Tasks

### Phase 1 — Exploratory Bug Condition Checking (write BEFORE the fix)

- [x] 1. Write the site-resolution bug condition exploration test
  - **Property 1: Bug Condition** - Site-scoped modules resolve a provisioned site
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate F-007 (Bug Condition `rc1` site-resolution branch)
  - **Scoped PBT Approach**: For all 4 configured tenants × an active-site slug/cookie whose matching `sites` row is missing (provisioning disabled), assert the current defective outcome
  - Render Analytics / Products / Content with no `sites` row; assert the full-page block / "one or more database queries failed" banner appears (per design Test Case 2)
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (this is correct - it proves the active site cannot be resolved against a provisioned row)
  - Document counterexamples found (e.g. "active slug `watch-tools` → Analytics renders the resolution block")
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 2.1_

- [x] 2. Write the provisioned-write / actionable-error bug condition exploration test
  - **Property 2: Bug Condition** - Provisioned-site writes succeed with actionable failures
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate F-009 / F-010 (Bug Condition `rc1` create branch / `rc2` save branch)
  - **Scoped PBT Approach**: For New Product submissions against an unprovisioned site (and varying valid payloads), assert the save is blocked with a generic message
  - POST New Product against an unprovisioned site via `app/api/admin/products/route.ts`; assert the response is a generic "Failed to save" with no actionable cause and no error reference id (per design Test Case 3)
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (the assertion that an actionable cause / reference id is returned does not hold)
  - Document counterexamples found (e.g. "createProduct → FK/missing-site error surfaced only as 'Failed to save'")
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 2.2, 2.5_

- [x] 3. Write the dashboard fail-soft bug condition exploration test
  - **Property 3: Bug Condition** - Dashboard fails soft and never crashes
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate F-005 / F-008 (Bug Condition `rc1` RPC branch / `rc2` consistency branch)
  - **Scoped PBT Approach**: For a super_admin loading the Dashboard index with `get_niche_health_stats` stubbed to error (and across dashboard-loader failure states), assert the page does NOT fail soft today
  - Stub `getNicheHealthStats()` / the RPC to error; assert it throws and the unguarded `<NicheHealthCard>` / `<RevenuePerSiteCard>` cause the admin-dashboard error boundary to render (per design Test Cases 1 and 11)
  - Also assert the inconsistent handling: Dashboard crashes while Products/Content soft-banner the same resolution failure
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (the page throws to a blank error boundary instead of failing soft)
  - Document counterexamples found
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 2.3, 2.4_

- [x] 4. Write the admin users list bug condition exploration test
  - **Property 4: Bug Condition** - Admin Users list is complete and consistent
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate F-015 / F-016 (Bug Condition `rc3` users branch)
  - **Scoped PBT Approach**: For a Users page render where `admin_users` is empty / the privileged list throws (with the bootstrapped super_admin expected to exist), assert the list is empty and the copy is misleading
  - Render the Users page with `admin_users` empty / list throwing; assert the list renders empty and the misleading "Add your first admin user to enable login" empty-state copy appears (per design Test Case 4)
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (the bootstrapped super_admin and created users are not shown; copy is inaccurate)
  - Document counterexamples found
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 2.6, 2.7_

- [x] 5. Write the permissions manager bug condition exploration test
  - **Property 5: Bug Condition** - Permissions manager can grant and revoke roles
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate F-012 (Bug Condition `rc3` permissions branch)
  - **Scoped PBT Approach**: For any render of the Permissions manager (varying role catalog / matrix data), assert no assign/revoke affordance exists
  - Render the Permissions manager; assert there are NO assign/revoke controls in the DOM (no user+role selector, no add/save/revoke buttons), only the role catalog and capability matrix (per design Test Case 5)
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (the assertion that assign/revoke controls exist does not hold)
  - Document counterexamples found
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 2.8_

- [x] 6. Write the static catalogs / active-site bug condition exploration test
  - **Property 6: Bug Condition** - Static catalogs always render and respect active site
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate F-018 / F-019 / F-013 (Bug Condition `rc4`)
  - **Scoped PBT Approach**: Across the platform catalog routes (modules, integrations, affiliate-networks) with the DB registry empty / fetch non-OK, and platform managers mounted with a non-first active site, assert the defective outcomes
  - Render Modules manager with `GET /api/admin/modules` non-OK and assert the post-selector region is blank (no list, no empty state, no spinner) (Test Case 6); render Integrations / Affiliate Networks with an empty registry and assert "No integration providers available" / empty "Available Networks" (Test Case 7); render a platform manager with a non-first active site and assert the dropdown defaults to `dbSites[0]` (arabic-tools) (Test Case 8)
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (catalogs do not render and the dropdown ignores the active site)
  - Document counterexamples found
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 2.9, 2.10, 2.11_

- [x] 7. Write the admin-shell UX bug condition exploration test
  - **Property 7: Bug Condition** - Admin-shell UX is correctly scoped
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate F-002 / F-006 / F-004 / F-020 (Bug Condition `rc5`)
  - **Scoped PBT Approach**: Across admin routes (with `cookieConsent` enabled), unknown `/q7m-k4j9/*` sub-paths, fresh-login state, and site-scoped write actions, assert the defective outcomes
  - Render an admin route with `site.features.cookieConsent` true and assert `<CookieConsentCmp>` is present (Test Case 9); request an unknown `/q7m-k4j9/*` sub-path and assert the public 404 renders instead of the admin not-found (Test Case 10); assert fresh login lands on `/sites?needsSite=1` with navigation broadly disabled and the overloaded "Active" label; assert the Audit Log shows "No results" for a site-scoped write
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (banner leaks, public 404 is hit, nav is disabled/ambiguous, audit entry missing)
  - Document counterexamples found
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 2.12, 2.13, 2.14, 2.15_

### Phase 2 — Preservation Checking (write BEFORE the fix)

- [x] 8. Write preservation property tests (BEFORE implementing fix)
  - **Property 8: Preservation** - Non-buggy behavior is unchanged
  - **IMPORTANT**: Follow observation-first methodology — run the UNFIXED code on inputs where `isBugCondition` is false, record actual outputs, then assert them
  - Observe and capture baseline behavior on UNFIXED code:
    - Provisioned-site reads (Analytics/Products/Content/Dashboard render data) (3.1)
    - Regular (non-super) admin Dashboard loads without crashing; `getDashboardStats` and existing RPC fallbacks still degrade gracefully (3.2, 3.3)
    - Invalid/valid login anti-enumeration and the Cloudflare Access gate (3.4, 3.10, 3.12)
    - Product-form and user-form validation rejections (3.5, 3.6)
    - Command palette, Settings/password management, Add Site wizard (3.7, 3.8, 3.9)
    - Feature-flag toggle persists (3.11)
    - Public site still renders `<CookieConsentCmp>` when `cookieConsent` is enabled (only admin routes suppress it)
  - Write property-based tests over random `(route, role, site-state)` where `isBugCondition` is false, asserting `originalSystem(input) = fixedSystem(input)`
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms the baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11, 3.12_

### Phase 3 — Implementation (apply the fix per cluster)

- [x] 9. Cluster 1 — Provisioning & RPC deployment (F-007, F-009, F-005)
  - [x] 9.1 Apply the seed + RPC migrations to the deployed environment
    - Ensure `2026061701_seed_static_sites.sql` (all 4 tenants), `00022_niche_health_rpc.sql` (`get_niche_health_stats`), `00027`/`00032` (`get_dashboard_stats`), and `00028_platform_modules_permissions_integrations.sql` (roles, permissions, integration_providers seeds) are applied
    - Keep the runtime auto-provisioner (`resolveDbSiteRow` → `upsertConfigSite`) as the belt-and-suspenders fallback
    - _Bug_Condition: isBugCondition(input) rc1 (site-resolution + create branches) from design_
    - _Expected_Behavior: Property 1 / Property 2 — active site resolves against a provisioned `sites` row and module loads / write succeeds_
    - _Preservation: provisioned-site reads/writes unchanged (3.1)_
    - _Requirements: 2.1, 2.2_

  - [x] 9.2 Fail soft in `getNicheHealthStats`
    - In `lib/dal/niche-health.ts`, replace `if (error) throw error` with `logger.error(...); return []` so a missing/failed RPC degrades to "no niche data"
    - Preserve the success path and the `MAX_LIMIT` cap
    - _Bug_Condition: isBugCondition(input) rc1 RPC branch (get_niche_health_stats not deployed) from design_
    - _Expected_Behavior: Property 3 — getNicheHealthStats logs and returns an empty result instead of throwing_
    - _Preservation: existing RPC fallbacks still degrade gracefully (3.3)_
    - _Requirements: 2.3_

  - [x] 9.3 Guard the super_admin Dashboard cards
    - Wrap `<NicheHealthCard />` and `<RevenuePerSiteCard />` (in `app/q7m-k4j9/(dashboard)/components/niche-health.tsx` and the `{isSuperAdmin && ...}` grid in `app/q7m-k4j9/(dashboard)/page.tsx`) in a per-card resilient boundary (e.g. `safeAdminData` loaders or a nested error boundary)
    - Retain the `{isSuperAdmin && ...}` gate
    - _Bug_Condition: isBugCondition(input) rc1 RPC branch (unguarded super_admin cards) from design_
    - _Expected_Behavior: Property 3 — cards degrade gracefully; Dashboard index never throws to a blank error boundary_
    - _Preservation: regular-admin Dashboard still loads (3.2)_
    - _Requirements: 2.3, 2.4_

  - [x] 9.4 Add an unprovisioned-site health check to the Sites list
    - In `app/q7m-k4j9/(dashboard)/sites/*`, compare `config/sites/*` against `listSites()` and flag any configured tenant whose `sites` row is missing with a "Not provisioned — run site provisioning" badge/action
    - _Bug_Condition: isBugCondition(input) rc1 site-resolution branch from design_
    - _Expected_Behavior: Property 1 — the Sites list flags any site that cannot be provisioned_
    - _Preservation: provisioned-site rendering unchanged (3.1)_
    - _Requirements: 2.1_

- [x] 10. Cluster 2 — Consistent, actionable error handling (F-008, F-010)
  - [x] 10.1 Standardise the graceful "still usable + banner" pattern
    - Ensure every site-scoped module uses `safeAdminData` + `AdminDataError` for both site resolution and queries in `app/q7m-k4j9/(dashboard)/page.tsx` and the Analytics module page; align Analytics' full-page block with the non-fatal banner pattern where feasible
    - Confirm the Dashboard index can never reach the error boundary (works with task 9.3)
    - _Bug_Condition: isBugCondition(input) rc2 consistency branch from design_
    - _Expected_Behavior: Property 3 — a single consistent graceful pattern; Dashboard index never throws_
    - _Preservation: provisioned-site reads still render (3.1); regular-admin Dashboard unchanged (3.2)_
    - _Requirements: 2.4_

  - [x] 10.2 Surface actionable save errors with a reference id
    - In `app/api/admin/products/route.ts` (and shared save error mapping), map known failures (missing/unprovisioned site → FK violation, RLS denial) to specific messages such as "This site isn't provisioned in the database yet" and attach an error reference id to the JSON error body
    - `product-form.tsx` already renders `data.error`; optionally display the reference id
    - _Bug_Condition: isBugCondition(input) rc2 save branch (errorMessageIsGeneric) from design_
    - _Expected_Behavior: Property 2 — failed saves surface the actual, actionable cause and/or an error reference id_
    - _Preservation: product-form field + quality validation unchanged (3.5)_
    - _Requirements: 2.5_

- [x] 11. Cluster 3 — Access management (F-015/F-016, F-012)
  - [x] 11.1 Guarantee admin-users list/create source alignment and seeding
    - In `lib/dal/admin-users.ts` (+ bootstrap path), confirm both list and create use `admin_users` via the privileged client; ensure the bootstrapped super_admin is actually persisted to `admin_users` (fix the bootstrap if it stored the account elsewhere); keep the "inject current admin when empty" fallback as a safety net only
    - _Bug_Condition: isBugCondition(input) rc3 users branch (adminUsersListSourceMismatchOrEmpty) from design_
    - _Expected_Behavior: Property 4 — list reads the create source and includes the bootstrapped super_admin and all created users (manageable/deletable)_
    - _Preservation: privileged-client access pattern for admin_users preserved; user-form validation unchanged (3.6)_
    - _Requirements: 2.6, 2.7_

  - [x] 11.2 Fix the Users empty-state copy and post-create refresh
    - In `app/q7m-k4j9/(dashboard)/users/page.tsx` / `users-table.tsx`, change `UsersEmptyState` copy from "Add your first admin user to enable login" to accurate text (login already works); verify `router.refresh()` after a create repopulates the list
    - _Bug_Condition: isBugCondition(input) rc3 users branch (misleading copy / stale list) from design_
    - _Expected_Behavior: Property 4 — accurate empty-state copy and correct refresh after create_
    - _Preservation: existing user-creation flow and success toast unchanged (3.6)_
    - _Requirements: 2.6_

  - [x] 11.3 Add assign/revoke UI to the Permissions manager
    - In `app/q7m-k4j9/(dashboard)/platform/permissions/permissions-manager.tsx`, add controls to select a user + role and submit `POST /api/admin/permissions` `{ user_id, site_id, role_name }`, list current `site_user_roles` for the selected site, and revoke via `DELETE /api/admin/permissions?user_id=&site_id=`
    - Backend, audit logging, and authz already exist — this is a client-only addition
    - _Bug_Condition: isBugCondition(input) rc3 permissions branch (NOT hasAssignRevokeControls) from design_
    - _Expected_Behavior: Property 5 — UI controls to assign and revoke a role to/from a user wired to existing endpoints_
    - _Preservation: existing role catalog + capability matrix display unchanged_
    - _Requirements: 2.8_

- [x] 12. Cluster 4 — Catalogs & active-site context (F-018, F-019, F-013)
  - [x] 12.1 Never render the Modules manager blank
    - In `app/q7m-k4j9/(dashboard)/platform/modules/modules-manager.tsx`, render the static `MODULE_REGISTRY` even when the per-site fetch fails, and add explicit empty/error states plus a loading state for the post-selector region
    - _Bug_Condition: isBugCondition(input) rc4 (rendersBlankBelowSelector) from design_
    - _Expected_Behavior: Property 6 — platform/modules renders the seeded MODULE_REGISTRY with a proper empty/error state_
    - _Preservation: provisioned-site module reads unchanged (3.1)_
    - _Requirements: 2.9_

  - [x] 12.2 Always render the static Integrations / Affiliate Networks catalogs
    - Ensure migration `00028`'s `integration_providers` seed is applied; defend `integrations-manager.tsx` and `affiliate-networks/*` so the app-defined provider/network catalog always renders even if the DB registry is momentarily empty (render a static fallback catalog), replacing the bare "No integration providers available" / empty "Available Networks"
    - _Bug_Condition: isBugCondition(input) rc4 (catalogRendersEmpty) from design_
    - _Expected_Behavior: Property 6 — Integrations and Affiliate Networks always render their registered providers/networks_
    - _Preservation: privileged-client read of integration_providers preserved (global RLS-restricted table)_
    - _Requirements: 2.10_

  - [x] 12.3 Inherit the globally active site in platform managers
    - In `permissions-manager.tsx`, `feature-flags-manager.tsx`, `modules-manager.tsx`, and `integrations-manager.tsx`, pass the globally active site (slug/db_id) into each manager and initialise `selectedSiteId` to it, falling back to `dbSites[0]` only when there is no active site
    - _Bug_Condition: isBugCondition(input) rc4 (NOT inheritsActiveSite) from design_
    - _Expected_Behavior: Property 6 — platform "Select Site" dropdowns default to / respect the globally active site_
    - _Preservation: feature-flag toggles still persist (3.11)_
    - _Requirements: 2.11_

- [x] 13. Cluster 5 — Admin-shell UX (F-002, F-006, F-004, F-020)
  - [x] 13.1 Suppress the public cookie-consent banner on admin routes
    - In `app/layout.tsx`, detect the admin path prefix (`/q7m-k4j9`) via the request pathname header already used elsewhere and skip rendering `<CookieConsentCmp>` for admin routes, leaving the public render unchanged
    - _Bug_Condition: isBugCondition(input) rc5 (publicCookieBannerRendered on admin route) from design_
    - _Expected_Behavior: Property 7 — the public GDPR cookie-consent banner is suppressed on /q7m-k4j9/\*_
    - _Preservation: public site still renders the banner when cookieConsent is enabled_
    - _Requirements: 2.12_

  - [x] 13.2 Render an admin-styled not-found for unknown admin sub-paths
    - Add an `app/q7m-k4j9/(dashboard)/not-found.tsx` (and/or a catch-all admin segment that calls `notFound()`) so unknown `/q7m-k4j9/*` sub-paths render the admin not-found instead of falling through to the public root 404
    - _Bug_Condition: isBugCondition(input) rc5 (isUnknownAdminSubPath AND fallsThroughToPublic404) from design_
    - _Expected_Behavior: Property 7 — unknown admin sub-paths render an admin-styled not-found_
    - _Preservation: known admin routes and the public 404 unchanged_
    - _Requirements: 2.13_

  - [x] 13.3 Disambiguate "Active" and reduce the fresh-login dead-end
    - On the Sites page / fresh-login flow (`/sites?needsSite=1`) and nav labels, rename one of the two "Active" affordances (e.g. working-context button → "Set as working site" / enable toggle → "Enabled") and/or auto-select a default working site on fresh login so navigation is not broadly disabled
    - _Bug_Condition: isBugCondition(input) rc5 (isFreshLogin AND navigationBroadlyDisabledOrAmbiguousActive) from design_
    - _Expected_Behavior: Property 7 — disambiguated "Active" concepts and/or an auto-selected working site_
    - _Preservation: Add Site wizard and "Set as active" working-context behavior otherwise unchanged (3.9)_
    - _Requirements: 2.14_

  - [x] 13.4 Verify audit recording for site-scoped writes
    - In the site-scoped write paths and `lib/audit-log.ts` usage, confirm site-scoped write actions call `recordAuditEvent` after provisioning so entries appear in the (privileged, site-scoped) Audit Log page
    - _Bug_Condition: isBugCondition(input) rc5 (site_scoped_write AND NOT auditEntryRecorded) from design_
    - _Expected_Behavior: Property 7 — site-scoped write actions are recorded in the Audit Log_
    - _Preservation: privileged-client access pattern for audit_log preserved_
    - _Requirements: 2.15_

### Phase 4 — Fix & Preservation Verification (re-run the SAME tests)

- [x] 14. Verify the fix and confirm no regressions
  - [x] 14.1 Verify bug condition exploration tests now pass
    - **Property 1: Expected Behavior** - Site-scoped modules resolve a provisioned site
    - **Property 2: Expected Behavior** - Provisioned-site writes succeed with actionable failures
    - **Property 3: Expected Behavior** - Dashboard fails soft and never crashes
    - **Property 4: Expected Behavior** - Admin Users list is complete and consistent
    - **Property 5: Expected Behavior** - Permissions manager can grant and revoke roles
    - **Property 6: Expected Behavior** - Static catalogs always render and respect active site
    - **Property 7: Expected Behavior** - Admin-shell UX is correctly scoped
    - **IMPORTANT**: Re-run the SAME tests from tasks 1–7 - do NOT write new tests
    - The tests from tasks 1–7 encode the expected behavior; when they pass they confirm the bugs are fixed
    - **EXPECTED OUTCOME**: All exploration tests PASS (confirms F-002, F-004, F-005, F-006, F-007, F-008, F-009, F-010, F-012, F-013, F-015, F-016, F-018, F-019, F-020 are fixed)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 2.11, 2.12, 2.13, 2.14, 2.15_

  - [x] 14.2 Verify preservation tests still pass
    - **Property 8: Preservation** - Non-buggy behavior is unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 8 - do NOT write new tests
    - **EXPECTED OUTCOME**: Tests PASS (confirms provisioned-site reads/writes, guarded fallbacks, auth/anti-enumeration, validation, command palette, settings, Add Site wizard, Cloudflare Access gate, feature-flag persistence, and valid-admin login are unchanged)
    - Confirm all preservation tests still pass after the fix (no regressions)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11, 3.12_

- [x] 15. Checkpoint - Ensure all tests pass
  - Run the full suite (`npm run test`) plus the relevant integration tests (`npm run test:integration`)
  - Ensure all unit, property-based, and integration tests pass
  - Confirm the integration flows from the design pass: fresh-login → provisioned-site → Dashboard → Products create → Audit Log (no crash, save succeeds, action logged); Permissions assign → list → revoke → list; admin route banner suppression + admin not-found; active-site context across platform managers
  - Ask the user if questions arise

## Task Dependency Graph

```json
{
  "waves": [
    {
      "wave": 1,
      "description": "Write and run exploration tests (Properties 1-7) and the preservation test (Property 8) on the UNFIXED code. 1-7 must FAIL; 8 must PASS.",
      "tasks": ["1", "2", "3", "4", "5", "6", "7", "8"]
    },
    {
      "wave": 2,
      "description": "Apply the fix per cluster. Clusters are independent and may run in parallel once Phase 1/2 are complete.",
      "tasks": ["9", "10", "11", "12", "13"]
    },
    {
      "wave": 3,
      "description": "Re-run the SAME tests: Properties 1-7 flip to PASS, Property 8 remains PASS.",
      "tasks": ["14"]
    },
    {
      "wave": 4,
      "description": "Checkpoint - full suite and integration flows pass.",
      "tasks": ["15"]
    }
  ]
}
```

```
Phase 1 (exploration, fail on unfixed)   Phase 2 (preservation, pass on unfixed)
  1  2  3  4  5  6  7                       8
   \  \  \ \ / /  /  /                       |
    \  \  \ | | /  /  /                       |
     v  v  v v v v  v  v                      |
  ┌────────────────────────────────────────────────────────┐
  │ Phase 3 — Implementation (per cluster)                  │
  │   9  (Cluster 1: 9.1 → 9.2 → 9.3 → 9.4)   ← tasks 1,2,3 │
  │  10  (Cluster 2: 10.1 → 10.2)             ← tasks 2,3   │
  │  11  (Cluster 3: 11.1 → 11.2 → 11.3)      ← task 4,5    │
  │  12  (Cluster 4: 12.1 → 12.2 → 12.3)      ← task 6      │
  │  13  (Cluster 5: 13.1 → 13.2 → 13.3 → 13.4)← task 7     │
  └────────────────────────────────────────────────────────┘
                          |
                          v
              14 (14.1 re-run 1–7, 14.2 re-run 8)
                          |
                          v
                   15 (Checkpoint)
```

Dependencies:

- Tasks 1–7 (exploration) and task 8 (preservation) MUST be written and run on the UNFIXED code before any Phase 3 task. 1–7 must FAIL; 8 must PASS.
- Each Phase 3 cluster (9–13) is independent of the other clusters and may proceed in parallel once Phase 1/2 are complete: task 9 depends on tasks 1–3; task 10 depends on tasks 2–3; task 11 depends on tasks 4–5; task 12 depends on task 6; task 13 depends on task 7.
- Within a cluster, sub-tasks proceed in listed order.
- Task 14 depends on all of Phase 3 (9–13). Task 15 depends on task 14.

## Notes

- Tests use Vitest + fast-check (see existing patterns in `__tests__/`); run with `npm run test` and integration flows with `npm run test:integration`.
- Properties 1–7 are bug-condition exploration tests: they MUST FAIL on the unfixed code (failure confirms the defect). Do NOT alter the code to make them pass during Phase 1.
- Property 8 is the preservation test: it MUST PASS on the unfixed code (capturing baseline behavior via observation-first methodology).
- Phase 4 re-runs the SAME tests — no new tests are written. Properties 1–7 should flip to PASS; Property 8 should remain PASS.
- Tasks 9.1, 9.2, 12.2 involve applying deployment migrations (`2026061701_seed_static_sites.sql`, `00022`, `00027/00032`, `00028`); coordinate these with the deployed environment rather than only code changes.
