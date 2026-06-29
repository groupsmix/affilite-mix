# Tasks to Fix — Batch 1: P1 Critical
# Security vulnerabilities, auth bugs, data integrity, build blockers

Fix these before anything else. Each one is a confirmed-existing issue with direct security
or correctness impact.

---

## Task A — Null check missing after `resolveDbSiteId()` (LIB-2)

**File:** `lib/admin-guard.ts` lines 193–212
**Risk:** Auth bypass / DB error — a null `dbSiteId` is passed to `getAdminSiteMembership`.

### Steps
- [ ] A.1 Read `lib/admin-guard.ts` lines 185–220.
- [ ] A.2 After the `resolveDbSiteId()` assignment, add:
  ```ts
  if (!dbSiteId) {
    return { authorized: false, reason: "site_not_found" };
  }
  ```
- [ ] A.3 `npm run typecheck` — pass. `npx vitest run` — pass.

---

## Task B — `sanitizeHtml(null)` returns null instead of `""` (LIB-4)

**File:** `lib/sanitize-html.ts`
**Risk:** null propagates into `dangerouslySetInnerHTML={{ __html: null }}`.

### Steps
- [ ] B.1 Find `if (!html) return html` — change to `if (!html) return ""`.
- [ ] B.2 Apply the same change to the memoized wrapper.
- [ ] B.3 `grep -r "sanitizeHtml" app/ lib/` — confirm no caller expects a null return.
- [ ] B.4 `npm run typecheck` and `npx vitest run` — both pass.

---

## Task BB — Validate `AdminPayload` fields to block forged role claims (LIB-HIGH-1)

**File:** `lib/auth.ts` — wherever `AdminPayload` is cast/decoded
**Risk:** A JWT with a crafted payload missing required fields can bypass role requirements.

### Steps
- [ ] BB.1 Read `lib/auth.ts` — find the `AdminPayload` type and where it is decoded.
- [ ] BB.2 Add explicit presence validation for every role-bearing field before the session
  is established:
  ```ts
  if (!payload.userId || !payload.role || payload.aud !== "affilite-mix-admin") {
    throw new Error("Invalid admin payload: missing required fields");
  }
  ```
- [ ] BB.3 If using zod or a schema library, add `.required()` / `.nonempty()` on `userId`,
  `role`, `aud` — no `.optional()` or `.default()` on those fields.
- [ ] BB.4 `npm run typecheck` and `npx vitest run` — both pass.

---

## Task BC — Add audit log when `RATE_LIMIT_FORCE_OPEN` bypass is active (LIB-HIGH-2)

**File:** wherever `RATE_LIMIT_FORCE_OPEN` is read (likely `lib/rate-limit.ts` or middleware)
**Risk:** Kill switch bypasses ALL rate limiting with zero audit trail. Silent in logs.

### Steps
- [ ] BC.1 Find the `RATE_LIMIT_FORCE_OPEN` check.
- [ ] BC.2 Emit a structured warning on every bypassed request:
  ```ts
  if (env.RATE_LIMIT_FORCE_OPEN === "true") {
    console.warn(JSON.stringify({
      level: "WARN",
      event: "rate_limit_bypassed",
      reason: "RATE_LIMIT_FORCE_OPEN",
      path: request.url,
      ts: new Date().toISOString(),
    }));
  }
  ```
- [ ] BC.3 If Sentry is available, emit there instead of `console.warn`.
- [ ] BC.4 `npm run typecheck` — pass.

---

## Task C — Stripe reverse reconciliation (Issue 4)

**File:** `app/api/cron/stripe-sync/route.ts`
**Risk:** DB-active memberships whose Stripe subscription is cancelled remain active silently.

### Steps
- [ ] C.1 Read `app/api/cron/stripe-sync/route.ts` in full.
- [ ] C.2 Read `lib/dal/admin-site-memberships.ts` for the membership query API.
- [ ] C.3 Add a second pass **gated behind `STRIPE_REVERSE_RECONCILE_ENABLED === "true"`**
  (default off), placed after the existing active-sync loop:
  1. Query: `SELECT * FROM memberships WHERE active = true AND stripe_subscription_id IS NOT NULL`.
  2. For each row call `stripe.subscriptions.retrieve(stripe_subscription_id)`.
  3. If Stripe status is `canceled` or `incomplete_expired`, set `active = false`.
  4. Log every deactivation (membership ID, Stripe sub ID, status, timestamp).
  5. If retrieve throws → skip that row and log the error; never deactivate without confirmed Stripe response.
- [ ] C.4 Add `STRIPE_REVERSE_RECONCILE_ENABLED=false` to `.env.example` and `.dev.vars.example`
  with a comment about the risk.
- [ ] C.5 Write a unit test that asserts the pass is entirely skipped when the flag is `false`.
- [ ] C.6 `npm run typecheck` — pass.

---

## Task D — Atomic TOTP compare-and-set RPC (Issue 8)

**Files:** `supabase/migrations/` (new), `app/api/auth/login/route.ts`, `app/api/auth/step-up/route.ts`
**Risk:** Non-atomic read-then-write on `totp_last_step` — two concurrent TOTP submissions can both pass.

### Steps
- [ ] D.1 Read `.kiro/specs/audit-round2-fixes/bugfix.md` ~line 329 for prior design notes.
- [ ] D.2 Read `app/api/auth/login/route.ts` lines 500–515.
- [ ] D.3 Create migration (next prefix):
  ```sql
  CREATE OR REPLACE FUNCTION verify_and_set_totp_step(
    p_user_id uuid,
    p_expected_step integer,
    p_new_step integer
  ) RETURNS boolean
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
  DECLARE updated_count integer;
  BEGIN
    UPDATE admin_users
    SET totp_last_step = p_new_step
    WHERE id = p_user_id
      AND (totp_last_step IS NULL OR totp_last_step < p_expected_step);
    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RETURN updated_count = 1;
  END; $$;
  ```
- [ ] D.4 Replace the plain `updateAdminUser` TOTP step call with the RPC:
  ```ts
  const { data: accepted } = await supabase.rpc("verify_and_set_totp_step", {
    p_user_id: user.id,
    p_expected_step: totpResult.step,
    p_new_step: totpResult.step,
  });
  if (!accepted) return errorResponse("TOTP step already used", 401);
  ```
- [ ] D.5 Apply the same to `step-up/route.ts` if it also writes `totp_last_step`.
- [ ] D.6 `npm run typecheck` — pass.

---

## Task E — Add `'compare'` to `homepage_template` DB constraint + TS type (DB-1)

**Files:** new migration, `lib/dal/sites.ts`, admin `site-form.tsx`
**Risk:** Postgres constraint violation when provisioning or editing the `ai-compared` site.

### Steps
- [ ] E.1 Read `supabase/migrations/2026052701_site_templates_and_card_styles.sql` — get exact constraint name.
- [ ] E.2 New migration:
  ```sql
  ALTER TABLE sites DROP CONSTRAINT IF EXISTS sites_homepage_template_check;
  ALTER TABLE sites ADD CONSTRAINT sites_homepage_template_check
    CHECK (homepage_template IN ('standard','cinematic','minimal','editorial','top10','compare'));
  ```
- [ ] E.3 Add `'compare'` to the TypeScript `homepage_template` union in `lib/dal/sites.ts`.
- [ ] E.4 Add `{ value: "compare", label: "Compare" }` to the template options in `site-form.tsx`.
- [ ] E.5 `npm run typecheck` — pass.

---

## Task EE — Issue 1: Audit RLS site-scoping on all anon-accessible tables

**Files:** `lib/dal/sites.ts`, `lib/dal/products.ts`, `lib/dal/content.ts`, Supabase migrations
**Risk (P1 arch):** `getAnonClient()` carries no `site_id`. Cross-tenant reads are only blocked
by RLS predicates on each table. Any table missing `site_id = current_request_site_id()` is
an over-read hole. The full DAL migration to `getTenantClient()` is a follow-on separate spec.

### Steps
- [ ] EE.1 List every table queried via `getAnonClient()` in the public DAL files.
- [ ] EE.2 For each table, find its SELECT RLS policy in `supabase/migrations/`. Confirm it
  includes `AND site_id = current_request_site_id()` or equivalent site-scoping.
- [ ] EE.3 For any table missing the site-scoping predicate, create a migration that adds it.
- [ ] EE.4 Document the result (table → policy status) in `docs/rls-audit.md` or a comment
  block in the migration.
- [ ] EE.5 **Do not** migrate `getAnonClient()` to `getTenantClient()` here — that is a
  separate architectural change requiring a staged rollout.

---

## Task EF — Issue 3: Add KV lock around Stripe checkout critical section

**File:** `app/api/membership/checkout/route.ts`
**Risk:** The unique index on `stripe_subscription_id` prevents duplicate rows but does not
prevent two concurrent checkout sessions from both succeeding before either writes — the unique
index only fires at INSERT time. A short-lived KV lock closes this window.

### Steps
- [ ] EF.1 Read `app/api/membership/checkout/route.ts` — find the checkout critical section
  (between "validate membership" and "create Stripe session / insert row").
- [ ] EF.2 Add a per-user/per-site KV lock using the available KV binding (or Durable Object
  if KV is not suitable for locking):
  ```ts
  const lockKey = `checkout_lock:${userId}:${siteId}`;
  const existing = await env.KV.get(lockKey);
  if (existing) {
    return errorResponse("Checkout already in progress", 409);
  }
  await env.KV.put(lockKey, "1", { expirationTtl: 30 }); // 30s TTL
  try {
    // ... existing checkout logic ...
  } finally {
    await env.KV.delete(lockKey);
  }
  ```
- [ ] EF.3 The lock TTL should be conservative (30–60 seconds) — long enough to cover a
  slow Stripe API call, short enough to not permanently block a legitimate retry.
- [ ] EF.4 Log a warning if the lock is hit (indicates a real double-submit attempt).
- [ ] EF.5 `npm run typecheck` — pass.

---

## Task EG — Issue 9: Review 00092 policy rewrite vs check-migrations.sh look-behind

**Files:** `supabase/migrations/` (00092), `scripts/check-migrations.sh`
**Risk (P3 perf):** Re-wrapping `tenant_isolation` policies to fix the initplan regression
may use `public.current_request_site_id()`, which trips the G-CI-01 Perl look-behind guard.

### Steps
- [ ] EG.1 Read `scripts/check-migrations.sh` lines 111–124 — understand the look-behind regex.
- [ ] EG.2 Read the 00092 migration — understand existing policy definitions.
- [ ] EG.3 Draft any policy rewrite using **unqualified** `current_request_site_id()` (no
  `public.` prefix) to avoid tripping the look-behind.
- [ ] EG.4 If the look-behind must be relaxed to allow `public.` prefix, update the regex in
  `check-migrations.sh` and add a test case.
- [ ] EG.5 Run `bash scripts/check-migrations.sh` on the new migration — must exit 0.

---

## Completion check

- [ ] `npm run typecheck` — exit 0
- [ ] `npx vitest run` — all green
- [ ] `npm run build` — no errors

→ Proceed to `taskstofix2.md`
