# Bugfix Requirements Document

## Introduction

A QA pass against the deployed AffiliteMix admin panel (route prefix `/q7m-k4j9`, Next.js / React 19 on Cloudflare with a Supabase backend) returned a **NOT launch-ready** verdict. The dominant root cause is that the database behind the deployment is not fully provisioned/seeded and several Postgres RPCs are not deployed, which cascades into roughly eight module failures. Two further issues sit in the access/permissions layer and are independent of the database state, and a set of admin-shell UX gaps remain.

This document captures the defective behaviors that must be fixed before launch, the correct behavior expected for each, and the existing behavior that must be preserved (regression prevention). The findings are grouped around five root causes:

1. Unprovisioned/unseeded database and undeployed RPCs (F-007, F-009, F-005, F-003)
2. Inconsistent and unhelpful error handling for database failures (F-008, F-010)
3. Broken access-management layer — users list source mismatch and read-only permissions (F-015, F-012, F-016)
4. Un-seeded static catalogs and platform site-context (F-018, F-019, F-013)
5. Admin-shell UX gaps (F-002, F-006, F-004, F-020)

Items that passed QA (F-001, F-011, F-017, F-021, F-022, F-023, the Cloudflare Access gate) and reportedly fixed/contextual notes (F-003, F-014, F-016) are out of scope as defects; the relevant passing behaviors are listed under Unchanged Behavior to guard against regressions.

## Bug Analysis

### Current Behavior (Defect)

**Root cause 1 — Unprovisioned database / undeployed RPCs**

1.1 WHEN an admin opens a site-scoped module (Analytics, Products, or Content) for one of the 4 configured tenants whose matching row is missing from the DB `sites` table, or whose active-site cookie holds a slug/id not matching any DB `sites` row, THEN the system fails to resolve the active site: Analytics shows a full-page block ("The active site could not be resolved in the database..."), and Products and Content show "one or more database queries failed" banners. (F-007)

1.2 WHEN a super_admin (or any admin) submits the New Product form against a site that is not provisioned in the database, THEN the write path is blocked and the system returns a generic "Failed to save," making CMS data entry non-functional. (F-009)

1.3 WHEN a super_admin loads the Dashboard home (`/q7m-k4j9` index, the default post-login landing) in an environment where the `get_niche_health_stats` RPC is not deployed, THEN the page hard-crashes to the admin-dashboard error boundary on every load across all tenants, because `getNicheHealthStats()` throws on RPC error with no fallback and the `{isSuperAdmin && ...}` grid renders `<NicheHealthCard>` / `<RevenuePerSiteCard>` unguarded. (F-005)

**Root cause 2 — Inconsistent / unhelpful error handling**

1.4 WHEN the same active-site/DB-resolution failure occurs across modules, THEN the system handles it inconsistently: the Dashboard hard-crashes, Analytics shows a full-page block, Products/Content show a soft banner but remain usable, and other modules render empty. (F-008)

1.5 WHEN a save operation fails, THEN the system surfaces a generic, non-actionable "Failed to save" message with no reason, no field-level detail, and no error reference id. (F-010)

**Root cause 3 — Broken access-management layer**

1.6 WHEN an admin opens the Admin Users list (`/q7m-k4j9/users`), THEN the list is always empty — created users and the current super_admin never appear even after a "User created" success toast and a full reload — and the empty-state copy ("Add your first admin user to enable login") is misleading because login already works. The likely cause is a read/write source mismatch (list reads `admin_users` while create writes to a different source) or filtering out users without a site grant. (F-015)

1.7 WHEN a test admin account (e.g. `zzz-test-delete-qa@example.com`) needs to be removed, THEN it cannot be managed or deleted through the UI because it never appears in the Admin Users list. (F-016)

1.8 WHEN an admin opens the Permissions manager (`/q7m-k4j9/platform/permissions`), THEN the page is read-only — it shows the role catalog and capability matrix but provides no UI to grant or revoke a role to a user (no assign/add/save controls). (F-012)

**Root cause 4 — Un-seeded static catalogs / platform site-context**

1.9 WHEN an admin opens `platform/modules`, THEN the page renders blank below the site selector with no list, no empty state, and no spinner. (F-018)

1.10 WHEN an admin opens the Integrations or Affiliate Networks catalogs, THEN they are empty ("No integration providers available" and an empty "Available Networks" table), even though these are app-defined static catalogs that should always render. (F-019)

1.11 WHEN an admin opens a platform module (`platform/permissions` or `platform/feature-flags`) that has its own "Select Site" dropdown, THEN the dropdown defaults to the first site (arabic-tools) instead of inheriting the globally active site. (F-013)

**Root cause 5 — Admin-shell UX gaps**

1.12 WHEN an admin visits the admin login page or any `/q7m-k4j9/*` route, THEN the public GDPR cookie-consent banner renders, even though the admin is a private internal tool. (F-002)

1.13 WHEN a user navigates to a non-existent admin sub-path (e.g. `/q7m-k4j9/dashboard`), THEN the request falls through to the PUBLIC site 404 instead of an admin-styled not-found page. (F-006)

1.14 WHEN a user logs in fresh, THEN they land on `/sites?needsSite=1` with most navigation disabled until they "Set as active" a site, and the word "Active" is overloaded between the per-tenant enable/disable "Active" toggle and the "Set as active" working-context button, causing confusion. (F-004)

1.15 WHEN an admin performs actions during a session, THEN the Audit Log shows "No results," giving no record of those actions. (F-020)

### Expected Behavior (Correct)

**Root cause 1 — Unprovisioned database / undeployed RPCs**

2.1 WHEN an admin opens a site-scoped module (Analytics, Products, or Content) for any of the 4 configured tenants, THEN the system SHALL resolve the active site against provisioned `sites` rows and load the module successfully; the site-provisioning migration/seed SHALL populate `sites` for all 4 tenants, and the Sites list SHALL include a health check that flags any unprovisioned site. (F-007)

2.2 WHEN a super_admin (or any admin) submits the New Product form against a provisioned site, THEN the system SHALL save the product successfully and enable CMS data entry. (F-009)

2.3 WHEN a super_admin loads the Dashboard home in an environment where the `get_niche_health_stats` RPC is not deployed, THEN the system SHALL fail soft: `getNicheHealthStats()` SHALL log and return an empty result, the super_admin grid cards SHALL each degrade gracefully (e.g. per-card `.catch(() => [])` or a nested error boundary) instead of throwing, and the missing RPCs SHALL be deployed to the environment. (F-005)

**Root cause 2 — Inconsistent / unhelpful error handling**

2.4 WHEN a DB-resolution or query failure occurs in any module, THEN the system SHALL handle it consistently using the graceful "still usable + banner" pattern, and the Dashboard index SHALL NEVER throw to a blank error boundary. (F-008)

2.5 WHEN a save operation fails, THEN the system SHALL surface the actual, actionable cause (e.g. "This site isn't provisioned in the database yet") and/or an error reference id rather than a generic message. (F-010)

**Root cause 3 — Broken access-management layer**

2.6 WHEN an admin opens the Admin Users list, THEN the list SHALL read from the same source that the create flow writes to, SHALL include the bootstrapped super_admin and all created users, SHALL refresh correctly after a create, and SHALL display accurate empty-state copy. (F-015)

2.7 WHEN a test admin account needs to be removed, THEN it SHALL appear in the Admin Users list and be manageable/deletable through the UI. (F-016)

2.8 WHEN an admin opens the Permissions manager, THEN the system SHALL provide UI controls to grant and revoke a role to/from a user (assign/add/save), in addition to displaying the role catalog and capability matrix. (F-012)

**Root cause 4 — Un-seeded static catalogs / platform site-context**

2.9 WHEN an admin opens `platform/modules`, THEN the system SHALL render the seeded default module catalog, and SHALL show a proper empty or error state when no data is available rather than a blank page. (F-018)

2.10 WHEN an admin opens the Integrations or Affiliate Networks catalogs, THEN the system SHALL always render the app-defined static catalogs (seeded/registered providers and networks). (F-019)

2.11 WHEN an admin opens a platform module with its own "Select Site" dropdown, THEN the system SHALL respect the globally active-site context (or default the dropdown to it) rather than defaulting to the first site. (F-013)

**Root cause 5 — Admin-shell UX gaps**

2.12 WHEN an admin visits the admin login page or any `/q7m-k4j9/*` route, THEN the system SHALL suppress the public GDPR cookie-consent banner. (F-002)

2.13 WHEN a user navigates to a non-existent admin sub-path, THEN the system SHALL render an admin-scoped, admin-styled not-found page for `/q7m-k4j9/*`. (F-006)

2.14 WHEN a user logs in fresh, THEN the system SHALL disambiguate the two "Active" concepts (rename one of the enable/disable toggle or the "Set as active" context button) and/or auto-select a default working site so navigation is not left broadly disabled. (F-004)

2.15 WHEN an admin performs a site-scoped write action after provisioning, THEN the system SHALL record it in the Audit Log so that the action is verifiably logged. (F-020)

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a site is correctly provisioned in the database and an admin opens a site-scoped module, THEN the system SHALL CONTINUE TO run its database queries and render data correctly.

3.2 WHEN a regular (non-super) admin loads the Dashboard home, THEN the system SHALL CONTINUE TO load it successfully without crashing, as its paths are already guarded.

3.3 WHEN getDashboardStats and other modules that already fall back when an RPC is not deployed are invoked, THEN the system SHALL CONTINUE TO degrade gracefully as it does today.

3.4 WHEN an invalid login or unknown account is submitted, THEN the system SHALL CONTINUE TO avoid user enumeration. (F-001)

3.5 WHEN an admin uses the New Product form for fields and quality validation, THEN the system SHALL CONTINUE TO apply its existing product-form quality behavior. (F-011)

3.6 WHEN an admin submits the user-creation form, THEN the system SHALL CONTINUE TO apply its existing user-form validation. (F-017)

3.7 WHEN an admin uses the command palette, THEN the system SHALL CONTINUE TO function as it does today. (F-021)

3.8 WHEN an admin uses Settings and password management, THEN the system SHALL CONTINUE TO function as it does today. (F-022)

3.9 WHEN an admin uses the Add Site wizard, THEN the system SHALL CONTINUE TO function as it does today. (F-023)

3.10 WHEN a request reaches the admin panel, THEN the system SHALL CONTINUE TO enforce the Cloudflare Access gate.

3.11 WHEN an admin toggles a feature flag, THEN the system SHALL CONTINUE TO persist the change. (F-014)

3.12 WHEN a valid admin authenticates, THEN the system SHALL CONTINUE TO allow login successfully.
