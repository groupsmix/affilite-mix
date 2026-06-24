# Admin Launch Blockers Bugfix Design

## Overview

A QA pass against the deployed AffiliteMix admin panel (`/q7m-k4j9`, Next.js / React 19 on
Cloudflare with a Supabase/Postgres backend) returned a **NOT launch-ready** verdict. The
verdict is driven by 15 defects that cluster around five root causes. The dominant root cause is
that the database behind the deployment is not fully provisioned/seeded and several Postgres RPCs
are not deployed, which cascades into module-level failures; the remaining clusters are
inconsistent error handling, a broken access-management layer, un-seeded static catalogs /
platform site-context, and admin-shell UX gaps.

The fix approach is deliberately **targeted and minimal per defect**, and is grounded in the
actual implementation:

- **Provisioning (F-007, F-009, F-005):** the runtime auto-provisioner
  (`lib/dal/site-resolver.ts` → `upsertConfigSite`) and the declarative seed
  (`2026061701_seed_static_sites.sql`) already exist. The gap is (a) guaranteeing the seed
  migration and the RPC migrations (`00022`, `00027/00032`, `00028`) are _applied_ to the
  deployed environment, and (b) closing the few remaining code paths that still hard-throw
  (`getNicheHealthStats`) or render unguarded super_admin cards on the Dashboard index.
- **Error handling (F-008, F-010):** standardise on the existing graceful "still usable +
  banner" pattern (`safeAdminData` / `AdminDataError`) so the Dashboard index never throws to a
  blank error boundary, and surface the actual, actionable failure cause on save instead of a
  generic "Failed to save."
- **Access management (F-015/F-016, F-012):** align the Admin Users list source with the create
  source and fix empty-state copy; the Permissions manager backend (`POST`/`DELETE
/api/admin/permissions`) already supports assign/revoke — the fix is purely the missing UI.
- **Catalogs / site-context (F-018, F-019, F-013):** always render the app-defined static
  catalogs (`MODULE_REGISTRY`, seeded `integration_providers`, the affiliate-network catalog) with
  proper empty/error states, and make platform "Select Site" dropdowns inherit the globally
  active site rather than defaulting to the first DB site.
- **Admin-shell UX (F-002, F-006, F-004, F-020):** suppress the public cookie-consent banner on
  `/q7m-k4j9/*`, render an admin-styled not-found for unknown admin sub-paths, disambiguate the
  overloaded "Active" concept (and/or auto-select a working site), and verify audit entries are
  recorded for site-scoped writes after provisioning.

The bug-condition methodology below treats each defect as a member of an overall bug condition
`C(X)`; the fixed system must satisfy the correct behavior `P(result)` for every buggy input,
while every non-buggy input (`¬C(X)`) must remain byte-for-byte unchanged.

## Glossary

- **Bug_Condition (C)**: The condition that triggers any of the 15 launch-blocking defects — an
  admin input/route/state combination that currently produces a crash, a blank region, an empty
  list that should be populated, a non-actionable error, or a UX trap.
- **Property (P)**: The desired behavior for a buggy input — the module loads/saves successfully,
  fails soft with a usable banner, renders the expected catalog/list, or presents the corrected
  UX, per the Expected Behavior clauses (2.1–2.15).
- **Preservation**: Existing behavior that must remain unchanged for non-buggy inputs — provisioned
  sites still query and render, guarded paths still degrade gracefully, security/anti-enumeration
  behavior, form validation, command palette, settings, Add Site wizard, the Cloudflare Access
  gate, feature-flag persistence, and successful login (clauses 3.1–3.12).
- **`resolveDbSiteId` / `resolveDbSiteRow`** (`lib/dal/site-resolver.ts`): Resolves the active-site
  slug to its `sites.id`, auto-provisioning a row from static config (`config/sites/*` via
  `toSiteRow`) using the privileged client when the row is missing. Throws only when the slug is
  neither in the DB nor a known static site (or DB is unavailable).
- **`safeAdminData` / `AdminDataError`** (`app/q7m-k4j9/(dashboard)/components/admin-page-state.tsx`):
  The graceful failure helper — runs a loader, logs on throw, and returns a typed fallback plus an
  error string so a Server Component can render a non-fatal banner instead of crashing.
- **`getNicheHealthStats`** (`lib/dal/niche-health.ts`): Calls the `get_niche_health_stats` RPC;
  currently `if (error) throw error` with no fallback.
- **`NicheHealthCard` / `RevenuePerSiteCard`**: super_admin-only Dashboard grid cards rendered
  unguarded inside `{isSuperAdmin && ...}` in `app/q7m-k4j9/(dashboard)/page.tsx`.
- **`listAdminUsers` / `createAdminUser`** (`lib/dal/admin-users.ts`): Both read/write the global
  `admin_users` table via the privileged client (`defaultAdminUsersClient`).
- **`MODULE_REGISTRY`** (`lib/module-registry.ts`): The static, app-defined module catalog merged
  with per-site `site_modules` rows by `GET /api/admin/modules`.
- **`listIntegrationProviders`** (`lib/dal/integrations.ts`): Reads the global
  `integration_providers` registry table (seeded by migration `00028`).
- **Active-site context**: The globally selected working site (`session.activeSiteSlug` /
  `activeSiteName`); platform managers currently ignore it and default `selectedSiteId` to
  `dbSites[0]`.

## Bug Details

### Bug Condition

The bug manifests across five clusters whenever an admin interacts with a module, route, or
control that depends on (1) a provisioned/seeded database row or deployed RPC, (2) a consistent
error-handling path, (3) the access-management read/write source and controls, (4) an
app-defined static catalog or the active-site context, or (5) a correctly scoped admin-shell
behavior. In each case the current code either hard-throws to an error boundary, renders a blank
region with no state, returns an empty list/catalog that should be populated, surfaces a generic
non-actionable error, or presents a confusing/missing UX.

**Formal Specification:**

```
FUNCTION isBugCondition(input)
  INPUT: input of type AdminInteraction
         { route, role, activeSiteSlug, dbState, rpcState, action, payload }
  OUTPUT: boolean

  // ── Cluster 1: unprovisioned DB / undeployed RPC ─────────────────────
  rc1 :=
       (isSiteScopedModule(input.route)            // Analytics | Products | Content | Dashboard
        AND NOT siteRowResolvable(input.activeSiteSlug, input.dbState))
    OR (input.action = "create_product"
        AND NOT siteProvisioned(input.activeSiteSlug, input.dbState))
    OR (isDashboardIndex(input.route)
        AND input.role = "super_admin"
        AND NOT rpcDeployed("get_niche_health_stats", input.rpcState))

  // ── Cluster 2: inconsistent / unhelpful error handling ───────────────
  rc2 :=
       (dbResolutionOrQueryFails(input) AND handledInconsistently(input.route))
    OR (input.action = "save" AND saveFailed(input) AND errorMessageIsGeneric(input))

  // ── Cluster 3: broken access-management layer ────────────────────────
  rc3 :=
       (input.route = "/q7m-k4j9/users"
        AND adminUsersListSourceMismatchOrEmpty(input.dbState))
    OR (input.route = "/q7m-k4j9/platform/permissions"
        AND NOT hasAssignRevokeControls(input.route))

  // ── Cluster 4: un-seeded catalogs / platform site-context ────────────
  rc4 :=
       (input.route = "/q7m-k4j9/platform/modules"   AND rendersBlankBelowSelector(input))
    OR (isStaticCatalogRoute(input.route)            AND catalogRendersEmpty(input))
    OR (hasOwnSiteDropdown(input.route)              AND NOT inheritsActiveSite(input))

  // ── Cluster 5: admin-shell UX gaps ───────────────────────────────────
  rc5 :=
       (isAdminRoute(input.route)        AND publicCookieBannerRendered(input))
    OR (isUnknownAdminSubPath(input.route) AND fallsThroughToPublic404(input))
    OR (isFreshLogin(input)              AND navigationBroadlyDisabledOrAmbiguousActive(input))
    OR (input.action = "site_scoped_write" AND NOT auditEntryRecorded(input))

  RETURN rc1 OR rc2 OR rc3 OR rc4 OR rc5
END FUNCTION
```

### Examples

- **F-007 (rc1):** Active-site cookie holds `watch-tools`, but `sites` has no matching row →
  Dashboard renders the "Active site could not load" `AdminDataError`; Analytics shows a full-page
  block; Products/Content show "one or more database queries failed." Expected: the row is
  auto-provisioned (or seeded) and the module loads.
- **F-009 (rc1):** super_admin submits New Product against an unprovisioned site → `createProduct`
  fails on a foreign-key/missing-site error and the form shows "Failed to save." Expected: the site
  is provisioned and the product saves.
- **F-005 (rc1):** super_admin opens `/q7m-k4j9` where `get_niche_health_stats` is not deployed →
  `getNicheHealthStats()` throws, `NicheHealthCard` is unguarded → the whole page renders the
  admin-dashboard error boundary. Expected: the card degrades to empty and the page renders.
- **F-008 (rc2):** The same active-site failure crashes the Dashboard but only soft-banners
  Products/Content. Expected: a single consistent graceful pattern; the Dashboard index never
  throws to a blank boundary.
- **F-010 (rc2):** A save fails for a concrete reason (unprovisioned site) but the user sees only
  "Failed to save." Expected: "This site isn't provisioned in the database yet" and/or an error
  reference id.
- **F-015 (rc3):** Admin Users list is empty even after "User created" + reload, and the current
  super_admin never appears; empty-state copy says "Add your first admin user to enable login"
  although login already works. Expected: list reads the create source, includes the bootstrapped
  super_admin and created users, refreshes after create, and shows accurate copy.
- **F-012 (rc3):** Permissions manager shows the role catalog + matrix but no assign/revoke
  controls, even though `POST`/`DELETE /api/admin/permissions` already implement assignment.
  Expected: UI controls to grant/revoke a role to/from a user.
- **F-018 (rc4):** `platform/modules` renders blank below the site selector (no list, no empty
  state, no spinner) when `GET /api/admin/modules` fails. Expected: the seeded `MODULE_REGISTRY`
  renders, with a proper empty/error state otherwise.
- **F-019 (rc4):** Integrations shows "No integration providers available" and Affiliate Networks
  shows an empty "Available Networks" table, although both are app-defined static catalogs.
  Expected: the static catalogs always render.
- **F-013 (rc4):** `platform/permissions` and `platform/feature-flags` default their dropdown to
  the first site (`arabic-tools`) instead of the globally active site. Expected: inherit/default
  to the active site.
- **F-002 (rc5):** The public GDPR cookie-consent banner renders on the admin login and dashboard.
  Expected: suppressed on `/q7m-k4j9/*`.
- **F-006 (rc5):** `/q7m-k4j9/dashboard` (non-existent) falls through to the public 404. Expected:
  an admin-styled not-found.
- **F-004 (rc5):** Fresh login lands on `/sites?needsSite=1` with navigation disabled and an
  overloaded "Active" label. Expected: disambiguated labels and/or an auto-selected working site.
- **F-020 (rc5):** Audit Log shows "No results" after the admin performs actions. Expected:
  site-scoped writes are recorded and appear after provisioning.
- **Edge case (¬C):** An admin opens Analytics for a correctly provisioned `crypto-tools` site →
  loads and renders data unchanged (must be preserved).

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**

- A correctly provisioned site still runs its DB queries and renders data correctly (3.1).
- A regular (non-super) admin still loads the Dashboard home without crashing — its paths are
  already guarded (3.2).
- `getDashboardStats` and other modules that already fall back on a missing RPC still degrade
  gracefully (3.3).
- Invalid login / unknown account still avoids user enumeration (3.4, F-001).
- New Product form field + quality validation is unchanged (3.5, F-011).
- User-creation form validation is unchanged (3.6, F-017).
- Command palette (3.7, F-021), Settings & password management (3.8, F-022), and the Add Site
  wizard (3.9, F-023) all function as today.
- The Cloudflare Access gate is still enforced for every admin request (3.10).
- Feature-flag toggles still persist (3.11, F-014).
- A valid admin still logs in successfully (3.12).

**Scope:**
All inputs that do NOT satisfy `isBugCondition` MUST be completely unaffected by this fix. In
particular:

- Provisioned-site reads and writes, and already-guarded fallback paths.
- Authentication, anti-enumeration, rate-limiting, step-up auth, and RLS/tenant-isolation behavior
  (the privileged-client access pattern for `admin_users`, `audit_log`, `roles`/`permissions`,
  and `integration_providers` is preserved — these tables are global, RLS-restricted to
  service_role, and intentionally read via the privileged gateway).
- All existing validation rules, success toasts, and navigation flows for non-buggy inputs.

**Note:** The actual expected correct behavior is enumerated in the Correctness Properties section
(Properties 1–8). This section focuses on what must NOT change.

## Hypothesized Root Cause

Based on the bug analysis and a read of the implementation, the most likely causes per cluster are:

1. **Unprovisioned DB / undeployed RPC (F-007, F-009, F-005):**
   - The deployed environment is missing applied migrations: `2026061701_seed_static_sites.sql`
     (seeds all 4 tenants), `00022_niche_health_rpc.sql` (`get_niche_health_stats`),
     `00027/00032` (`get_dashboard_stats`), and `00028` (platform catalogs).
   - Runtime auto-provisioning (`resolveDbSiteRow` → `upsertConfigSite`) exists but only triggers
     for _known static-config_ slugs and only on a successful privileged write; an environment
     whose DB is entirely unprovisioned or whose privileged client is misconfigured still fails.
   - `getNicheHealthStats()` has no fallback (`if (error) throw error`), and the super_admin grid
     renders `<NicheHealthCard>` / `<RevenuePerSiteCard>` unguarded, so a missing RPC throws past
     the page into the dashboard error boundary.

2. **Inconsistent / unhelpful error handling (F-008, F-010):**
   - The graceful `safeAdminData` + `AdminDataError` pattern is applied to the Dashboard's
     site-resolution and metrics, and to Products/Content, but NOT to the super_admin niche/revenue
     cards — so one module crashes while others soft-fail.
   - On save, `product-form.tsx` surfaces `data.error ?? "Failed to save"`; the API does not map
     an unprovisioned-site / FK failure to an actionable message or attach an error reference id.

3. **Broken access-management layer (F-015/F-016, F-012):**
   - The Admin Users list and create flow both target `admin_users` via the privileged client, so
     the empty list most likely stems from the deployed `admin_users` table being unseeded (the
     bootstrapped super_admin was created by a mechanism that did not persist to `admin_users`, or
     the privileged read fails in the deployed env so `safeAdminData` returns `[]`), compounded by
     misleading empty-state copy. A read/write source mismatch and/or a membership-join filter that
     drops users without a site grant are the secondary suspects.
   - The Permissions manager is read-only purely because the client component never renders
     assign/revoke controls — the backend assign/revoke endpoints already exist and audit-log the
     change.

4. **Un-seeded catalogs / platform site-context (F-018, F-019, F-013):**
   - `platform/modules` renders blank when `GET /api/admin/modules` returns non-OK (e.g. DB
     unavailable): `modules` stays `[]`, `grouped` is empty, and there is no empty/error/loading
     state for that case — even though `MODULE_REGISTRY` is a static catalog that could render
     regardless.
   - Integrations reads `integration_providers` from the DB; if `00028`'s seed has not been
     applied the registry is empty → "No integration providers available." The Affiliate Networks
     "available" list is an app-defined catalog that should always render.
   - All three platform managers seed `selectedSiteId` to `dbSites[0]` and never read the global
     active-site context.

5. **Admin-shell UX gaps (F-002, F-006, F-004, F-020):**
   - `CookieConsentCmp` is rendered in the public root `app/layout.tsx` gated only on
     `site.features.cookieConsent`; admin routes share this layout, so the banner leaks into
     `/q7m-k4j9/*`.
   - An `app/q7m-k4j9/not-found.tsx` exists, but unknown sub-paths under the `(dashboard)` route
     group are not triggering it (no `notFound()` boundary / catch-all within the admin segment),
     so Next.js falls back to the public root 404.
   - Fresh login routes to `/sites?needsSite=1` with most navigation disabled until a site is "Set
     as active," and "Active" is overloaded between the per-tenant enable/disable toggle and the
     working-context selector.
   - The Audit Log shows "No results" because, on an unprovisioned DB, site-scoped write actions
     either never ran or never reached `recordAuditEvent`; after provisioning, writes must record
     entries.

## Correctness Properties

Property 1: Bug Condition — Site-scoped modules resolve a provisioned site

_For any_ input where a site-scoped module (Dashboard, Analytics, Products, Content) is opened for
one of the 4 configured tenants and the bug condition holds because the `sites` row is missing
(`rc1` site-resolution branch), the fixed system SHALL resolve the active site against a provisioned
`sites` row (auto-provisioned from static config and/or seeded by migration) and load the module
successfully; and the Sites list SHALL flag any site that cannot be provisioned.

**Validates: Requirements 2.1**

Property 2: Bug Condition — Provisioned-site writes succeed with actionable failures

_For any_ input where a New Product (or other CMS write) is submitted (`rc1` create branch / `rc2`
save branch), the fixed system SHALL save successfully when the site is provisioned, and when a
save fails it SHALL surface the actual, actionable cause (e.g. "This site isn't provisioned in the
database yet") and/or an error reference id rather than a generic "Failed to save."

**Validates: Requirements 2.2, 2.5**

Property 3: Bug Condition — Dashboard fails soft and never crashes

_For any_ input where the Dashboard index is loaded by a super_admin while `get_niche_health_stats`
(or any dashboard query) is unavailable (`rc1` RPC branch / `rc2` consistency branch), the fixed
system SHALL fail soft: `getNicheHealthStats()` SHALL log and return an empty result, the
super_admin grid cards SHALL each degrade gracefully (per-card catch / nested error boundary), and
the Dashboard index SHALL NEVER throw to a blank error boundary — the graceful "still usable +
banner" pattern SHALL be applied consistently across modules.

**Validates: Requirements 2.3, 2.4**

Property 4: Bug Condition — Admin Users list is complete and consistent

_For any_ input where the Admin Users list is opened (`rc3` users branch), the fixed system SHALL
read from the same source the create flow writes to, SHALL include the bootstrapped super_admin and
all created users (and therefore manageable/deletable test accounts), SHALL refresh correctly after
a create, and SHALL display accurate empty-state copy.

**Validates: Requirements 2.6, 2.7**

Property 5: Bug Condition — Permissions manager can grant and revoke roles

_For any_ input where the Permissions manager is opened (`rc3` permissions branch), the fixed system
SHALL provide UI controls to assign and revoke a role to/from a user for a site (wired to the
existing `POST`/`DELETE /api/admin/permissions` endpoints), in addition to displaying the role
catalog and capability matrix.

**Validates: Requirements 2.8**

Property 6: Bug Condition — Static catalogs always render and respect active site

_For any_ input where a platform catalog page is opened (`rc4`), the fixed system SHALL render the
app-defined static catalogs — `platform/modules` renders the seeded `MODULE_REGISTRY` with a proper
empty/error state when no data is available; Integrations and Affiliate Networks always render their
registered providers/networks — and any platform "Select Site" dropdown SHALL default to / respect
the globally active site rather than the first site.

**Validates: Requirements 2.9, 2.10, 2.11**

Property 7: Bug Condition — Admin-shell UX is correctly scoped

_For any_ input where an admin route is visited (`rc5`), the fixed system SHALL suppress the public
GDPR cookie-consent banner on `/q7m-k4j9/*`, render an admin-styled not-found for unknown admin
sub-paths, disambiguate the two "Active" concepts and/or auto-select a default working site so
navigation is not broadly disabled, and record site-scoped write actions in the Audit Log so they
are verifiably logged.

**Validates: Requirements 2.12, 2.13, 2.14, 2.15**

Property 8: Preservation — Non-buggy behavior is unchanged

_For any_ input where the bug condition does NOT hold (`isBugCondition` returns false), the fixed
system SHALL produce the same result as the original system, preserving: provisioned-site reads and
renders (3.1); the already-guarded regular-admin Dashboard and existing RPC fallbacks (3.2, 3.3);
login anti-enumeration (3.4); product-form and user-form validation (3.5, 3.6); the command palette,
Settings/password management, and Add Site wizard (3.7, 3.8, 3.9); the Cloudflare Access gate
(3.10); feature-flag persistence (3.11); and successful valid-admin login (3.12).

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11, 3.12**

## Fix Implementation

### Changes Required

Assuming the root-cause analysis is correct, the fix is grouped by cluster. Each change is scoped
to the smallest surface that restores the Expected Behavior without disturbing `¬C(X)` paths.

#### Cluster 1 — Provisioning & RPC deployment (F-007, F-009, F-005)

**Environment / migrations (deployment, not code):**

1. **Apply the seed + RPC migrations to the deployed environment**: ensure
   `2026061701_seed_static_sites.sql` (all 4 tenants), `00022_niche_health_rpc.sql`
   (`get_niche_health_stats`), `00027`/`00032` (`get_dashboard_stats`), and
   `00028_platform_modules_permissions_integrations.sql` (roles, permissions, integration_providers
   seeds) are applied. This is the authoritative fix for the unprovisioned-DB cascade; the runtime
   auto-provisioner remains the belt-and-suspenders fallback.

**Code:**

**File**: `lib/dal/niche-health.ts` 2. **Fail soft in `getNicheHealthStats`**: replace `if (error) throw error` with a log + empty
return (`logger.error(...); return []`) so a missing/failed RPC degrades to "no niche data"
instead of throwing. Preserves the success path and the `MAX_LIMIT` cap.

**File**: `app/q7m-k4j9/(dashboard)/components/niche-health.tsx` and the super_admin grid in
`app/q7m-k4j9/(dashboard)/page.tsx` 3. **Guard the super_admin cards**: wrap `<NicheHealthCard />` and `<RevenuePerSiteCard />` in a
per-card resilient boundary (e.g. wrap their data loaders in `safeAdminData`, or render them
inside a nested React error boundary) so neither can throw past the Dashboard page. The
`{isSuperAdmin && ...}` gate is retained.

**File**: `app/q7m-k4j9/(dashboard)/sites/*` (Sites list) 4. **Add an unprovisioned-site health check**: in the Sites list, flag any configured tenant whose
`sites` row is missing (compare `config/sites/*` against `listSites()`), surfacing a "Not
provisioned — run site provisioning" badge/action.

#### Cluster 2 — Consistent, actionable error handling (F-008, F-010)

**File**: `app/q7m-k4j9/(dashboard)/page.tsx` (+ Analytics module page) 5. **Standardise the graceful pattern**: ensure every site-scoped module uses
`safeAdminData` + `AdminDataError` (still-usable banner) for both site resolution and queries,
and that the Dashboard index can never reach the error boundary (covered by change 3). Align
Analytics' full-page block with the same non-fatal banner pattern where feasible.

**File**: `app/api/admin/products/route.ts` (and shared save error mapping) 6. **Surface actionable save errors**: map known failures (missing/unprovisioned site → FK
violation, RLS denial) to specific messages such as "This site isn't provisioned in the database
yet," and attach an error reference id (e.g. the Sentry event id / a generated correlation id)
to the JSON error body. `product-form.tsx` already renders `data.error`, so surfacing the
mapped message + reference id requires no client change beyond optionally displaying the id.

#### Cluster 3 — Access management (F-015/F-016, F-012)

**Files**: `app/q7m-k4j9/(dashboard)/users/page.tsx`, `users-table.tsx`,
`lib/dal/admin-users.ts` (+ bootstrap path) 7. **Guarantee list/create source alignment and seeding**: confirm both list and create use
`admin_users` via the privileged client (they do); ensure the bootstrapped super_admin is
actually persisted to `admin_users` (fix the bootstrap if it stored the account elsewhere) so
it appears in the list. Keep the "inject current admin when empty" fallback as a safety net only. 8. **Fix empty-state copy**: change the `UsersEmptyState` copy from "Add your first admin user to
enable login" to accurate text (login already works), and verify `router.refresh()` after a
create repopulates the list.

**File**: `app/q7m-k4j9/(dashboard)/platform/permissions/permissions-manager.tsx` 9. **Add assign/revoke UI**: add controls to select a user + role and submit
`POST /api/admin/permissions` ({ user_id, site_id, role_name }), list current `site_user_roles`
for the selected site, and revoke via `DELETE /api/admin/permissions?user_id=&site_id=`. The
backend, audit logging, and authz already exist — this is a client-only addition.

#### Cluster 4 — Catalogs & active-site context (F-018, F-019, F-013)

**File**: `app/q7m-k4j9/(dashboard)/platform/modules/modules-manager.tsx` 10. **Never render blank**: render the static `MODULE_REGISTRY` even when the per-site fetch fails,
and add explicit empty/error states (and keep a loading state) for the post-selector region.

**Files**: `app/q7m-k4j9/(dashboard)/platform/integrations/integrations-manager.tsx`,
`app/q7m-k4j9/(dashboard)/affiliate-networks/*`, and (deployment) migration `00028` seed 11. **Always render static catalogs**: ensure the `integration_providers` seed is applied; defend
the UI so the app-defined provider/network catalog always renders even if the DB registry is
momentarily empty (render a static fallback catalog), replacing the bare "No integration
providers available" / empty "Available Networks" with the registered catalog.

**Files**: `permissions-manager.tsx`, `feature-flags-manager.tsx`, `modules-manager.tsx`,
`integrations-manager.tsx` 12. **Inherit the active site**: pass the globally active site (slug/db_id) into each platform
manager and initialise `selectedSiteId` to it (falling back to `dbSites[0]` only when there is
no active site), instead of unconditionally defaulting to the first DB site.

#### Cluster 5 — Admin-shell UX (F-002, F-006, F-004, F-020)

**File**: `app/layout.tsx` (cookie-consent render) 13. **Suppress the banner on admin routes**: detect the admin path prefix (`/q7m-k4j9`) — e.g. via
the request pathname header already used elsewhere — and skip rendering `<CookieConsentCmp>`
for admin routes, leaving the public render unchanged.

**File**: `app/q7m-k4j9/(dashboard)/not-found.tsx` (new) and/or a catch-all admin route 14. **Admin-styled not-found**: ensure unknown `/q7m-k4j9/*` sub-paths render the admin not-found
(add a `not-found.tsx` inside the `(dashboard)` route group and/or a catch-all segment that
calls `notFound()`), so they no longer fall through to the public 404.

**Files**: Sites page / fresh-login flow (`/sites?needsSite=1`), nav labels 15. **Disambiguate "Active" and reduce the dead-end**: rename one of the two "Active" affordances
(e.g. the working-context button to "Set as working site" / the enable toggle to "Enabled"),
and/or auto-select a default working site on fresh login so navigation is not broadly disabled.

**Files**: site-scoped write paths + `lib/audit-log.ts` usage 16. **Verify audit recording**: confirm site-scoped write actions call `recordAuditEvent` after
provisioning so entries appear in the (already privileged, site-scoped) Audit Log page.

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate
each defect on the unfixed code (confirming or refuting the root-cause hypotheses), then verify the
fix produces the correct behavior for buggy inputs and preserves behavior for non-buggy inputs.
Because several defects are environment/provisioning-driven, tests inject DB/RPC failure states
(missing `sites` row, RPC error, empty catalog, fetch non-OK) rather than depending on a live
unprovisioned database.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bugs BEFORE implementing the fix. Confirm or
refute the root-cause analysis. If refuted, re-hypothesize.

**Test Plan**: Drive each module/route with the failing precondition and assert the current
defective outcome (crash/blank/empty/generic-error), using the existing recording-client and
component-render test patterns in `__tests__/`.

**Test Cases**:

1. **F-005 Dashboard crash** — render the super_admin Dashboard with `get_niche_health_stats`
   stubbed to error; assert `getNicheHealthStats()` throws and the page surfaces the error boundary
   (will fail-soft only after the fix).
2. **F-007 site resolution** — render Analytics/Products/Content with no `sites` row and provisioning
   disabled; assert the full-page block / "queries failed" banner appears (will resolve after seed/
   provision).
3. **F-009/F-010 save error** — POST New Product against an unprovisioned site; assert the response
   is a generic "Failed to save" with no actionable cause or reference id.
4. **F-015 empty users list** — render the Users page with `admin_users` empty / list throwing;
   assert the list is empty and the misleading empty-state copy renders.
5. **F-012 read-only permissions** — render the Permissions manager; assert there are no
   assign/revoke controls in the DOM.
6. **F-018 blank modules** — render the Modules manager with `GET /api/admin/modules` returning
   non-OK; assert the post-selector region is blank (no list, no empty state).
7. **F-019 empty catalogs** — render Integrations / Affiliate Networks with the registry empty;
   assert "No integration providers available" / empty "Available Networks."
8. **F-013 wrong default site** — render a platform manager with a non-first active site; assert the
   dropdown defaults to `dbSites[0]` (arabic-tools).
9. **F-002 cookie banner** — render an admin route with `site.features.cookieConsent` true; assert
   `<CookieConsentCmp>` is present.
10. **F-006 public 404** — request an unknown `/q7m-k4j9/*` sub-path; assert the public 404 renders
    instead of the admin not-found.
11. **Edge case (F-008 consistency)** — trigger the same DB-resolution failure across Dashboard vs
    Products/Content; assert the inconsistent handling (crash vs banner).

**Expected Counterexamples**:

- Dashboard throws on missing RPC; modules render blank/empty; save errors are generic; the users
  list and catalogs are empty; the cookie banner leaks; unknown admin paths hit the public 404.
- Possible causes: undeployed RPC + unprovisioned DB, unguarded cards, missing empty/error states,
  un-seeded registry tables, first-site default, shared public layout, missing admin not-found
  boundary.

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed system produces the
expected behavior.

**Pseudocode:**

```
FOR ALL input WHERE isBugCondition(input) DO
  result := fixedSystem(input)
  ASSERT expectedBehavior(result)   // loads | fails-soft-with-banner | renders catalog |
                                    // complete list | actionable error | corrected UX
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed system
produces the same result as the original system.

**Pseudocode:**

```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT originalSystem(input) = fixedSystem(input)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:

- It generates many inputs across the route × role × site-state domain automatically.
- It catches edge cases (e.g. a provisioned site that happens to have zero products) that manual
  unit tests might miss.
- It provides strong guarantees that provisioned-site reads/writes, validation, auth, and
  navigation are unchanged for all non-buggy inputs.

**Test Plan**: Observe behavior on the unfixed code for provisioned sites, valid logins, valid
form submissions, feature-flag toggles, and the public cookie banner, then write property-based
tests capturing that behavior and assert it is identical after the fix.

**Test Cases**:

1. **Provisioned-site reads (3.1)** — observe Analytics/Products/Content/Dashboard render data for a
   provisioned site; assert unchanged after fix.
2. **Regular-admin Dashboard + existing fallbacks (3.2, 3.3)** — observe non-super dashboard loads
   and `getDashboardStats` fallback; assert unchanged.
3. **Auth & anti-enumeration (3.4, 3.10, 3.12)** — observe invalid/valid login and Cloudflare Access
   gate; assert unchanged.
4. **Validation (3.5, 3.6)** — observe product-form and user-form validation rejections; assert
   unchanged.
5. **Feature-flag persistence (3.11)** — observe a flag toggle persists; assert unchanged after the
   active-site-default change to the managers.
6. **Public cookie banner (preservation of F-002 fix)** — observe the public site still renders the
   banner when `cookieConsent` is enabled; only admin routes suppress it.

### Unit Tests

- `getNicheHealthStats` returns `[]` (and logs) on RPC error; returns rows on success (cap intact).
- Dashboard index renders without throwing when niche/revenue/metrics loaders fail.
- Product save API maps unprovisioned-site/FK/RLS failures to actionable messages + reference id.
- Users page renders the bootstrapped super_admin and created users; empty-state copy is accurate.
- Permissions manager renders assign/revoke controls and calls the correct endpoints.
- Modules manager renders `MODULE_REGISTRY` and an empty/error state when the fetch fails.
- Integrations / Affiliate Networks render the static catalog when the DB registry is empty.
- Platform managers initialise `selectedSiteId` to the active site, falling back to first only when
  there is no active site.
- Admin routes suppress `<CookieConsentCmp>`; public routes still render it.
- Unknown `/q7m-k4j9/*` sub-paths render the admin not-found.

### Property-Based Tests

- For random (route, role, site-state) where `isBugCondition` holds, the fixed system never throws
  to the dashboard error boundary and renders the expected loads-or-soft-banner / catalog / list /
  actionable-error / corrected-UX outcome.
- For random provisioned-site inputs (`¬C`), reads/writes, validation, and navigation are identical
  before and after the fix (preservation).
- For random platform-manager mounts with varying active sites, the dropdown defaults to the active
  site whenever one exists.

### Integration Tests

- Full fresh-login → provisioned-site → Dashboard → Products create → Audit Log flow: no crash, save
  succeeds, and the action appears in the Audit Log.
- Permissions assign → list reflects assignment → revoke → list reflects removal, end to end.
- Navigate to a known admin route (banner suppressed) and to an unknown admin sub-path (admin
  not-found), confirming admin-shell scoping.
- Context switching across platform managers respects the active site after switching working sites.
