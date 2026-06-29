# Bugfix Requirements Document

## Introduction

This document captures requirements for nine confirmed security and reliability findings from a codebase audit (Round 2). The bugs span three priority tiers:

- **P1 (Fix Soon)**: Three findings with direct security or data-integrity impact — cross-tenant data exposure via unenforced RLS, a TOCTOU race that bypasses the anti-abuse terminal-state guard on memberships, and a double-billing race during concurrent checkouts.
- **P2 (Fix When You Can)**: Three correctness/hygiene findings — a reconciliation gap that leaves cancelled memberships active after a cron outage, an exploitable tenant-enumeration endpoint with no legitimate use, and a silent RLS regression that breaks all web-vitals DB persistence.
- **P3 (Verify / Low)**: Two low-risk suspected issues — a narrow TOTP replay window and a per-row RLS re-evaluation regression that was previously optimised away.

All nine bugs are confirmed unless marked SUSPECTED.

---

## Bug Analysis

---

### Bug 1 — Cross-tenant anon over-read via RLS policies [P1 · CONFIRMED]

**Files:** `supabase/migrations/00074_reintroduce_public_rls.sql` (lines 34–42), `supabase/migrations/00031_harden_public_rls_active_site_check.sql` (lines 21–29), `supabase/migrations/2026052601_revoke_anon_grants_fix_rls.sql` (lines 44–50)

#### Current Behavior (Defect)

1.1 WHEN an anonymous caller issues a REST request to any Supabase public table (products, categories, content, pages, content_products, ad_placements) using the shared anon key THEN the system returns rows from every active tenant whose `status='active'` or `is_published=true`, regardless of which tenant the caller belongs to, because the `public_read_*` RLS policies contain no `site_id` binding to the requesting tenant

1.2 WHEN an anonymous caller queries `GET /rest/v1/products?select=*,site_id,affiliate_url` THEN the system returns product records including `site_id` UUIDs, `affiliate_url`, and `ad_placements` data for all active tenants simultaneously

1.3 WHEN an anonymous caller queries `GET /rest/v1/sites` THEN the system returns every active tenant's `slug`, `domain`, `theme`, `nav_items`, `features`, and other structural metadata, despite the migration comment explicitly stating "no app code path reads sites under anon"

1.4 WHEN migration `2026052601` re-grants anon SELECT on the seven public-facing tables THEN the system restores cross-tenant read access without adding any tenant-scoping predicate, undoing the intended isolation of the `current_request_site_ids()` mechanism used by authenticated policies

#### Expected Behavior (Correct)

2.1 WHEN an anonymous caller reads any public table via the REST API THEN the system SHALL only return rows belonging to the single site resolved from the request context (e.g. via `current_request_site_ids()` or an equivalent `x-site-id`–derived mechanism), filtering out all rows from other tenants

2.2 WHEN an anonymous caller queries products, categories, content, pages, content_products, or ad_placements THEN the system SHALL apply the same `site_id = ANY(current_request_site_ids())` scoping predicate that authenticated tenant-isolation policies use, so a single anon key cannot enumerate another tenant's catalog

2.3 WHEN no resolvable `site_id` can be derived from the anonymous request context THEN the system SHALL return an empty result set rather than falling back to cross-tenant reads

2.4 WHEN an anonymous caller queries `GET /rest/v1/sites` THEN the system SHALL return no rows at all, because no legitimate app code path reads `sites` under the anon role; alternatively, anon SELECT on `sites` SHALL be fully revoked

#### Unchanged Behavior (Regression Prevention)

3.1 WHEN the server-side rendering path calls the anon Supabase client for a specific tenant's public content THEN the system SHALL CONTINUE TO return that tenant's active products, published content, published pages, and active categories correctly

3.2 WHEN authenticated admin users read their own tenant's data THEN the system SHALL CONTINUE TO apply `site_id = ANY(current_request_site_ids())` isolation as before, unaffected by the anon policy change

3.3 WHEN PII tables (newsletter_subscribers, clicks, commissions, memberships, users) are queried under the anon role THEN the system SHALL CONTINUE TO deny access, as anon remains revoked on those tables

3.4 WHEN an admin with a multi-site JWT reads data across their authorized sites THEN the system SHALL CONTINUE TO return rows for all sites in the JWT's `app_metadata.site_ids` array via the `ANY()` operator

---

**Bug Condition Derivation (Bug 1)**

```pascal
FUNCTION isBugCondition_1(X)
  INPUT:  X of type SupabaseRestRequest
  OUTPUT: boolean

  // The bug fires when: anon role is used AND the target table is one
  // of the seven public-facing tables AND no site_id scoping is present
  // in the RLS policy for that table
  RETURN X.role = 'anon'
     AND X.table IN {products, categories, content, pages,
                     content_products, ad_placements, sites}
     AND NOT PolicyHasSiteIdPredicate(X.table)
END FUNCTION

// Property: Fix Checking — anon read must be tenant-scoped
FOR ALL X WHERE isBugCondition_1(X) DO
  result ← anonSelect'(X)
  ASSERT ALL rows IN result SATISFY row.site_id IN current_request_site_ids(X)
END FOR

// Property: Preservation Checking
FOR ALL X WHERE NOT isBugCondition_1(X) DO
  ASSERT anonSelect(X) = anonSelect'(X)
END FOR
```

---

### Bug 2 — Stripe terminal-state guard bypass via TOCTOU race [P1 · CONFIRMED]

**File:** `app/api/cron/stripe-sync/route.ts` (lines 108–146)

#### Current Behavior (Defect)

2.1 WHEN the `stripe-sync` reconciliation cron runs Phase 2 and finds an active Stripe subscription whose DB membership has a non-active status THEN the system calls `isReconcilableToActive(dbMembership.status)` as a guard, but then issues a bare `UPDATE memberships SET status='active' WHERE stripe_subscription_id=...` via `untypedFrom(sb, "memberships").update(...)` which bypasses the `apply_stripe_membership_event` RPC entirely

2.2 WHEN a `charge.dispute.created` or `charge.refunded` webhook is delivered concurrently with a cron execution THEN the system allows the following race: (a) the webhook handler flips status to `disputed` or `cancelled` via the guarded RPC, then (b) the cron's non-atomic read-check passes on the stale pre-webhook snapshot, then (c) the cron's direct UPDATE overwrites the status back to `active`, restoring entitlement to a charged-back or refunded customer

2.3 WHEN the cron's `isReconcilableToActive()` check passes for a `past_due` or `expired` membership that was concurrently escalated to `disputed` or `cancelled` by a webhook THEN the system overwrites the terminal status with `active` because the guard function was evaluated on a stale read, not inside the same transaction as the UPDATE

#### Expected Behavior (Correct)

2.4 WHEN the reconciliation cron determines a membership should be reactivated THEN the system SHALL route the status transition through the `apply_stripe_membership_event` RPC (or an equivalent atomic CAS update) rather than issuing a bare `UPDATE`, so the terminal-state guard's `CASE WHEN status IN ('disputed','cancelled') THEN status ELSE 'active' END` logic is enforced atomically at the DB level

2.5 WHEN the reconciliation cron issues an UPDATE for a membership THEN the system SHALL include `WHERE status IN ('past_due','expired')` (or the equivalent `RECONCILABLE_TO_ACTIVE` allowlist) in the UPDATE predicate, so that a membership which transitioned to `disputed` or `cancelled` between the read and the write is not overwritten

2.6 WHEN a terminal status (`disputed` or `cancelled`) is present at UPDATE time regardless of what was read earlier THEN the system SHALL CONTINUE TO preserve that status and SHALL NOT set it to `active`

#### Unchanged Behavior (Regression Prevention)

3.1 WHEN a `past_due` or `expired` membership has an active Stripe subscription and no concurrent webhook changes it to a terminal state THEN the system SHALL CONTINUE TO reactivate it during reconciliation

3.2 WHEN the cron encounters an active Stripe subscription that has no corresponding DB membership row THEN the system SHALL CONTINUE TO replay the `checkout.session.completed` event via `processStripeEvent` to create the missing row

3.3 WHEN the `apply_stripe_membership_event` RPC detects a duplicate `stripe_event_id` THEN the system SHALL CONTINUE TO return `{duplicate: true}` and skip the side effect

---

**Bug Condition Derivation (Bug 2)**

```pascal
FUNCTION isBugCondition_2(X)
  INPUT:  X of type CronReconcileAttempt
            { stripe_subscription_id: string,
              db_status_at_read: string,
              concurrent_webhook_arrived: boolean,
              webhook_new_status: string }
  OUTPUT: boolean

  // The race window: guard passes on stale read, direct UPDATE overwrites webhook result
  RETURN isReconcilableToActive(X.db_status_at_read)
     AND X.concurrent_webhook_arrived = true
     AND X.webhook_new_status IN {'disputed', 'cancelled'}
END FUNCTION

// Property: Fix Checking — terminal state must never be overwritten by cron
FOR ALL X WHERE isBugCondition_2(X) DO
  result ← cronReconcile'(X)
  ASSERT memberships.status WHERE stripe_subscription_id = X.stripe_subscription_id
         IN {'disputed', 'cancelled'}
END FOR

// Property: Preservation Checking
FOR ALL X WHERE NOT isBugCondition_2(X) DO
  ASSERT cronReconcile(X) = cronReconcile'(X)
END FOR
```

---

### Bug 3 — Orphaned second Stripe subscription (double billing) [P1 · CONFIRMED]

**Files:** `app/api/membership/checkout/route.ts` (lines 160–163), `supabase/migrations/00051_memberships.sql` (lines 22–23), `supabase/migrations/2026062202_stripe_terminal_state_guard.sql` (lines 67–88)

#### Current Behavior (Defect)

3.1 WHEN two concurrent POST requests to `/api/membership/checkout` are submitted for the same email and site THEN the system evaluates `getActiveMembership(email, siteId)` on both without any row lock, both find no active membership, and both proceed to create separate Stripe Checkout sessions

3.2 WHEN both Stripe Checkout sessions are completed by the user (or by concurrent test flows) THEN the system attempts to `INSERT` two membership rows for the same email+site combination; the second `create_membership` INSERT violates the partial unique index `idx_memberships_email_site` (`UNIQUE (email, site_id) WHERE status='active'`), raises a constraint error, and the second webhook event is routed to the DLQ

3.3 WHEN the second Stripe subscription is orphaned in the DLQ THEN the system leaves the customer billed for two active Stripe subscriptions while only one membership entitlement is recorded in the DB, and no automatic cancellation of the orphaned subscription is triggered

#### Expected Behavior (Correct)

2.1 WHEN a checkout request arrives for an email+site that already has an in-flight Checkout session or an active membership THEN the system SHALL prevent the creation of a second Stripe subscription by at least one of: (a) acquiring a row-level or advisory lock before issuing the Checkout session, (b) cancelling the orphaned Stripe subscription when `create_membership` fails with a unique constraint violation, or (c) detecting the duplicate upstream before a second Checkout session URL is issued

2.2 WHEN the `checkout.session.completed` webhook handler encounters a unique constraint violation on INSERT into `memberships` THEN the system SHALL schedule cancellation of the just-created Stripe subscription (identified by `session.subscription`) to prevent the customer being billed for an entitlement they will never receive

2.3 WHEN a second checkout attempt for the same email+site is made while a previous Checkout session is still pending THEN the system SHALL return a 409 conflict or redirect to the existing session rather than issuing a new Stripe Checkout URL

#### Unchanged Behavior (Regression Prevention)

3.1 WHEN a single checkout request is submitted with no concurrency THEN the system SHALL CONTINUE TO create exactly one Stripe Checkout session and one membership row upon webhook completion

3.2 WHEN a user whose prior membership is `cancelled` or `expired` initiates a new checkout THEN the system SHALL CONTINUE TO allow the checkout because the partial unique index `WHERE status='active'` does not block re-subscription

3.3 WHEN the Stripe Checkout session is created successfully THEN the system SHALL CONTINUE TO return a `{url, session_id}` JSON response with a 200 status

---

**Bug Condition Derivation (Bug 3)**

```pascal
FUNCTION isBugCondition_3(X)
  INPUT:  X of type CheckoutRequestPair
            { email: string, site_id: uuid,
              request_1_time: timestamp,
              request_2_time: timestamp,
              webhook_1_arrived_before_request_2: boolean }
  OUTPUT: boolean

  // Both requests pass the 409 check before either webhook lands
  RETURN X.email = X.email                             // same email
     AND X.site_id = X.site_id                         // same site
     AND X.webhook_1_arrived_before_request_2 = false  // race window open
END FUNCTION

// Property: Fix Checking — at most one active subscription per email+site
FOR ALL X WHERE isBugCondition_3(X) DO
  result ← checkout'(X)
  ASSERT COUNT(active Stripe subscriptions for X.email, X.site_id) <= 1
     AND COUNT(memberships WHERE email=X.email AND site_id=X.site_id AND status='active') <= 1
END FOR

// Property: Preservation Checking
FOR ALL X WHERE NOT isBugCondition_3(X) DO
  ASSERT checkout(X) = checkout'(X)
END FOR
```

---

### Bug 4 — Reconciliation gap: stale DB-active membership never deactivated [P2 · CONFIRMED]

**File:** `app/api/cron/stripe-sync/route.ts` (Phase 2 walks active Stripe subs only; Phase 1 replays ~48 h of events)

#### Current Behavior (Defect)

4.1 WHEN a membership is active in the DB but its Stripe subscription was cancelled more than 48 hours ago (e.g. due to a cron outage) THEN the system never deactivates the membership, because Phase 1 only replays the last 48 hours of Stripe events and Phase 2 only iterates over subscriptions with `status:'active'` in Stripe — a cancelled subscription is not in that list

4.2 WHEN the cron recovers after an outage longer than 48 hours THEN the system leaves all memberships whose Stripe subscriptions were cancelled during the outage window in `active` status indefinitely, granting the users free continued access

#### Expected Behavior (Correct)

2.1 WHEN the stripe-sync cron runs THEN the system SHALL include a reverse-reconciliation pass that queries DB rows with `status='active'`, fetches the current Stripe subscription status for each, and deactivates (via `apply_stripe_membership_event` with `cancel_membership` op) any membership whose Stripe subscription is no longer active

2.2 WHEN the reverse-reconciliation pass finds a DB-active membership whose Stripe subscription has status `canceled`, `incomplete_expired`, or `unpaid` THEN the system SHALL transition the membership to `cancelled` using the terminal-state guard RPC so the transition is auditable and idempotent

#### Unchanged Behavior (Regression Prevention)

3.1 WHEN a DB-active membership's Stripe subscription is still `active` THEN the system SHALL CONTINUE TO leave the membership status unchanged during reconciliation

3.2 WHEN a DB-active membership is in `disputed` or `cancelled` state THEN the system SHALL CONTINUE TO skip it during the reconciliation pass (it was already handled by the terminal-state path)

3.3 WHEN Phase 1 event replay and Phase 2 active-subscription reconciliation run THEN the system SHALL CONTINUE TO operate as before — the reverse pass is additive, not a replacement

---

### Bug 5 — Anon sites enumeration — pure attack surface [P2 · CONFIRMED]

**Files:** `supabase/migrations/00074_reintroduce_public_rls.sql` (lines 18–19), `supabase/migrations/2026062102_sites_anon_column_scope.sql`

#### Current Behavior (Defect)

5.1 WHEN an anonymous caller queries `GET /rest/v1/sites` THEN the system returns every active tenant's `slug`, `domain`, `theme`, `nav_items`, and `features` fields, exposing a full tenant directory to unauthenticated parties

5.2 WHEN migration `2026062102` column-scopes the anon SELECT grant on `sites` THEN the system still allows anon reads of the scoped columns despite the migration comment acknowledging "no app code path reads sites under anon", leaving an unnecessary attack surface that serves no functional purpose

#### Expected Behavior (Correct)

2.1 WHEN any caller uses the anon role to SELECT from the `sites` table THEN the system SHALL return zero rows and SHALL deny the operation, because no app rendering path requires anon access to `sites`

2.2 WHEN anon SELECT on `sites` is revoked entirely THEN the system SHALL fully remove the `public_read_sites` RLS policy (or make it vacuous) and REVOKE SELECT on `sites` from the anon role, closing the tenant-enumeration surface

#### Unchanged Behavior (Regression Prevention)

3.1 WHEN authenticated admin API calls or server-side rendering using `getTenantClient()` read the `sites` table THEN the system SHALL CONTINUE TO return the correct site row, because those paths use the authenticated role, not anon

3.2 WHEN the seven other public-facing tables (products, categories, content, pages, content_products, ad_placements) are queried by the anon role THEN the system SHALL CONTINUE TO return the appropriate public data, unaffected by the removal of anon access on `sites`

---

### Bug 6 — `/api/vitals` DB persistence silently broken (RLS regression) [P2 · CONFIRMED]

**Files:** `app/api/vitals/route.ts` (lines 97–98), `supabase/migrations/00023_web_vitals_table.sql`, `supabase/migrations/00038` (referenced), `supabase/migrations/00078_tighten_unsafe_service_role_policies.sql`, `supabase/migrations/00079_fix_service_role_policies_and_anon_insert.sql`

#### Current Behavior (Defect)

6.1 WHEN the `/api/vitals` route receives a valid Core Web Vitals beacon THEN the system calls `getTenantClient()` (authenticated role) and attempts `sb.from("web_vitals").insert(...)`, but the `web_vitals` table has no authenticated INSERT RLS policy (the anon INSERT policy was dropped in migrations 00078/00079), so the insert is silently RLS-denied

6.2 WHEN the RLS-denied insert throws an error THEN the system swallows it in the outer `try/catch` block with only a `captureException` call, returns `{ok: true}` to the caller, and the metric is lost — `SELECT count(*) FROM web_vitals` remains at zero regardless of beacon volume

6.3 WHEN the `eslint-disable` comment in `route.ts` claims "privileged client; site_id validated" THEN the comment is stale and misleading because `getTenantClient()` is an authenticated (not privileged/service) client, and `web_vitals` has no `site_id` column to validate against

#### Expected Behavior (Correct)

2.1 WHEN the `/api/vitals` route successfully validates a beacon payload THEN the system SHALL persist the metric to `web_vitals` using either `getServiceClient()` (bypasses RLS) or an authenticated INSERT policy on `web_vitals`, so `SELECT count(*) FROM web_vitals` accurately reflects received beacon volume

2.2 WHEN `getServiceClient()` is used for the `web_vitals` insert THEN the system SHALL ensure the `site_id` has been validated from the request context before the insert, as a substitute for the RLS check that service role bypasses

2.3 WHEN the DB insert for a vitals beacon fails for a non-RLS reason (e.g. table does not exist, schema mismatch) THEN the system SHALL CONTINUE TO log the failure via `captureException` and return `{ok: true}` to prevent beacon loss

#### Unchanged Behavior (Regression Prevention)

3.1 WHEN the vitals endpoint receives an invalid payload (wrong metric name, non-numeric value, disallowed origin) THEN the system SHALL CONTINUE TO return 400/403 as before, unchanged by the client swap

3.2 WHEN the structured logger emits a `web_vital` event THEN the system SHALL CONTINUE TO do so regardless of whether the DB insert succeeds, so log-based observability pipelines are unaffected

3.3 WHEN all other API routes that use `getTenantClient()` are called THEN the system SHALL CONTINUE TO behave as before; only the vitals route's DB insert path changes

---

### Bug 7 — `db_now()` SECURITY DEFINER missing `search_path` [P2 · CONFIRMED]

**File:** `supabase/migrations/00099_fix_A26_A30_audit_findings.sql` (lines 58–65)

#### Current Behavior (Defect)

7.1 WHEN the `db_now()` function is defined in migration `00099` THEN the system creates it as `SECURITY DEFINER` without `SET search_path = pg_catalog, public`, in violation of the search-path lockdown established by migration `00083` which pinned all other SECURITY DEFINER functions

7.2 WHEN a database security advisor scan runs THEN the system reports a `function_search_path_mutable` warning for `db_now()`, indicating a policy gap even though the function body (`SELECT now()`) is not exploitable in practice

7.3 WHEN `check-migrations.sh` runs its guard for missing `SET search_path` THEN the system fails to flag `db_now()` because the guard's awk pattern uses a gawk-only `\b` word-boundary token that is not portable to POSIX awk, causing the check to silently miss this function

#### Expected Behavior (Correct)

2.1 WHEN `db_now()` is defined or altered THEN the system SHALL include `SET search_path = pg_catalog, public` in the function definition (or drop SECURITY DEFINER entirely, since `now()` is callable by all roles without privilege escalation)

2.2 WHEN the database advisor runs THEN the system SHALL report zero `function_search_path_mutable` warnings for `db_now()`

2.3 WHEN `check-migrations.sh` scans for SECURITY DEFINER functions without `SET search_path` THEN the system SHALL correctly detect `db_now()` (and any future similar function) by using a POSIX-compatible awk pattern rather than the gawk-only `\b` boundary

#### Unchanged Behavior (Regression Prevention)

3.1 WHEN application code calls `db_now()` to get the authoritative server timestamp THEN the system SHALL CONTINUE TO return the current `TIMESTAMPTZ` value correctly after the `search_path` fix is applied

3.2 WHEN all other SECURITY DEFINER functions locked by migration `00083` are invoked THEN the system SHALL CONTINUE TO behave as before, unaffected by the targeted fix to `db_now()`

---

### Bug 8 — TOTP single-use persist-after-verify race [P3 · SUSPECTED]

**File:** `app/q7m-k4j9/login/route.ts`

#### Current Behavior (Defect)

8.1 WHEN two concurrent admin login requests are submitted with the same valid TOTP code within the same 30-second time-step window THEN the system evaluates whether the code's `step` value is greater than `totp_last_step` on both requests before either write persists the new baseline, allowing both requests to pass the single-use check

8.2 WHEN both concurrent requests pass the `totp_last_step` comparison THEN the system processes both as valid authentications — the same TOTP code is consumed twice within its validity window, violating the NIST 800-63B §5.1.4.2 single-use OTP requirement

#### Expected Behavior (Correct)

2.1 WHEN a TOTP code is validated THEN the system SHALL perform an atomic compare-and-set on `totp_last_step` (e.g. `UPDATE admin_users SET totp_last_step = $new_step WHERE totp_last_step IS NULL OR totp_last_step < $new_step RETURNING id`) so that only the first concurrent request can advance the baseline and the second receives zero updated rows, which SHALL be treated as a replay rejection

2.2 WHEN the atomic CAS UPDATE returns zero rows THEN the system SHALL reject the login attempt as a replayed code and return an appropriate error response, regardless of whether the TOTP code itself is cryptographically valid

#### Unchanged Behavior (Regression Prevention)

3.1 WHEN a single sequential login request with a valid TOTP code is submitted THEN the system SHALL CONTINUE TO authenticate the admin user successfully

3.2 WHEN a TOTP code from a previous time-step (beyond the ±1 step drift window) is submitted THEN the system SHALL CONTINUE TO reject it via the existing step comparison

3.3 WHEN an admin user's `totp_last_step` is NULL (no baseline yet, first use) THEN the system SHALL CONTINUE TO accept the first valid code and initialize the baseline

---

### Bug 9 — Tenant-isolation policy performance regression [P3 · SUSPECTED]

**File:** `supabase/migrations/00092_multi_site_rls_and_cleanup.sql`

#### Current Behavior (Defect)

9.1 WHEN migration `00092` recreates tenant-isolation policies for products, content, pages, categories, newsletter_subscribers, and affiliate_clicks THEN the system writes bare `USING (site_id = ANY(public.current_request_site_ids()))` predicates without a `(SELECT ...)` wrapper, undoing the init-plan optimisation applied by migration `00082`

9.2 WHEN RLS is evaluated for a query that scans multiple rows on any of the affected tables THEN the system re-evaluates `current_request_site_ids()` per row instead of once per query, because without the `(SELECT ...)` wrapper the Postgres planner cannot cache the result as an InitPlan

#### Expected Behavior (Correct)

2.1 WHEN tenant-isolation RLS policies reference `current_request_site_ids()` THEN the system SHALL wrap the call as `(SELECT current_request_site_ids())` in all policy predicates, matching the canonical form established by migration `00082` and the Supabase performance advisor recommendation

2.2 WHEN the policies are rewritten with the wrapped form THEN the system SHALL evaluate `current_request_site_ids()` exactly once per query execution rather than once per qualifying row, restoring the init-plan performance characteristic

#### Unchanged Behavior (Regression Prevention)

3.1 WHEN authenticated queries filter by `site_id` on products, content, pages, categories, newsletter_subscribers, or affiliate_clicks THEN the system SHALL CONTINUE TO return correctly tenant-scoped results — the optimisation changes only the evaluation strategy, not the semantics

3.2 WHEN multi-site admin JWTs with `app_metadata.site_ids` arrays are used THEN the system SHALL CONTINUE TO return rows for all authorized sites via the `ANY(array)` operator

3.3 WHEN migration `00082`'s double-wrap collapse regex runs on an already-wrapped policy THEN the system SHALL CONTINUE TO collapse `(select (select ...))` to `(select ...)` idempotently, so re-applying the wrap migration is safe
