# Troubleshooting: Cross-Tenant Data Leak Investigation

**Category:** Security — P0 Critical
**Last reviewed:** 2026-05-25

## Overview

affilite-mix is a multi-tenant platform where data isolation is enforced at multiple layers. A cross-tenant data leak means a user in Site A can see or modify data belonging to Site B. This is a critical security incident.

## Isolation Architecture

affilite-mix enforces tenant isolation at four layers:

1. **RLS (Row-Level Security):** PostgreSQL policies enforce `site_id` scoping on all tenant tables
2. **DAL (Data Access Layer):** All queries in `lib/dal/` require `siteId` parameter
3. **Middleware:** `middleware.ts` resolves the site from the request domain/headers
4. **API Guards:** `lib/admin-guard.ts` and `lib/authz.ts` verify membership + permissions per-site

## Immediate Response

If a cross-tenant leak is suspected:

1. **Preserve evidence:** Do NOT modify the affected data or code before investigation
2. **Notify security team** immediately via #security-incidents
3. **Identify scope:** Which tenants are affected? What data was exposed?
4. **If confirmed:** Trigger incident response per `docs/security-policy.md`

## Investigation Steps

### Step 1: Verify the Report

```sql
-- Check if the reported data actually belongs to a different site
SELECT id, site_id, created_at FROM <table>
WHERE id = '<reported_record_id>';

-- Verify the user's site_id
SELECT id, site_id, email FROM admin_users
WHERE id = '<reported_user_id>';
```

### Step 2: Check RLS Policies

```sql
-- List all RLS policies on the affected table
SELECT * FROM pg_policies WHERE tablename = '<table_name>';

-- Verify RLS is enabled
SELECT relname, relrowsecurity, relforcerowsecurity
FROM pg_class WHERE relname = '<table_name>';
```

Common RLS bypass scenarios:

- Policy uses `auth.uid()` instead of `site_id` header
- Policy has `USING (true)` on SELECT (allows all reads)
- Policy was accidentally dropped during migration

### Step 3: Check the DAL Function

```bash
# Find the DAL function that was called
grep -rn "from.*<table_name>" lib/dal/

# Verify it uses site_id scoping
grep -A5 "from.*<table_name>" lib/dal/<file>.ts
```

Common DAL bypass scenarios:

- Function missing `.eq("site_id", siteId)` filter
- Function uses `getServiceClient()` (bypasses RLS) without site_id filter
- New function added without following DAL conventions

### Step 4: Check the API Route

```bash
# Find the API route that served the request
grep -rn "<endpoint_path>" app/api/

# Verify it uses requireAdmin() or withAuthz()
grep -n "requireAdmin\|withAuthz" app/api/<path>/route.ts
```

Common API bypass scenarios:

- Route uses `getAdminSession()` directly instead of `requireAdmin()` (banned by ESLint rule)
- Route uses raw `sb.from()` instead of DAL functions (banned by ESLint rule)
- Route doesn't validate site_id from session matches requested data

### Step 5: Check Middleware Site Resolution

```bash
# Verify the site was correctly resolved for the request
grep -n "resolveSite\|getSiteByDomain" middleware.ts lib/site-context.ts
```

Common middleware scenarios:

- Domain mapping returns wrong site_id
- `x-site-id` header is being honored from external requests (it shouldn't be)
- Site resolution cache returns stale data

### Step 6: Audit Log Analysis

```sql
-- Check recent actions by the affected user
SELECT * FROM audit_log
WHERE actor_user_id = '<user_id>'
AND created_at > now() - interval '24 hours'
ORDER BY created_at DESC;

-- Check for cross-site access patterns
SELECT DISTINCT site_id, action, entity_type
FROM audit_log
WHERE actor_user_id = '<user_id>'
AND created_at > now() - interval '7 days';
```

### Step 7: Run Cross-Tenant Test Suite

```bash
# Run the dedicated cross-tenant authorization tests
npx vitest run __tests__/cross-tenant-authz.test.ts

# Run full security test suite
npx vitest run __tests__/security/
```

## Root Cause Categories

| Category             | Example                                     | Fix                               |
| -------------------- | ------------------------------------------- | --------------------------------- |
| Missing RLS policy   | New table added without policy              | Add `CREATE POLICY` in migration  |
| DAL site_id missing  | New function without site scoping           | Add `.eq("site_id", siteId)`      |
| Service-role leak    | Privileged client used in non-admin route   | Use `getTenantClient()` instead   |
| Cache poisoning      | Site resolution cache shared across tenants | Add site_id to cache key          |
| Migration regression | ALTER TABLE dropped RLS policy              | Re-add policy, add migration test |

## Containment

If a leak is confirmed:

1. **Disable the affected endpoint** (comment out route or return 503)
2. **Identify all affected records** via audit log
3. **Notify affected tenants** per data breach notification requirements
4. **Deploy hotfix** with corrected site scoping
5. **Add regression test** to `__tests__/cross-tenant-authz.test.ts`

## Prevention

- ESLint rules enforce DAL usage and ban raw `sb.from()` in API routes
- ESLint rules ban direct `getAdminSession()` — must use `requireAdmin()`/`withAuthz()`
- ESLint rules ban `select("*")` — explicit column projections prevent accidental exposure
- Cross-tenant authorization tests run in CI on every PR
- RLS policies are audited in migration review

## Related

- `__tests__/cross-tenant-authz.test.ts` — Cross-tenant isolation test suite
- `docs/security-policy.md` — Security incident response process
- `lib/dal/` — Data Access Layer with tenant scoping
- `lib/authz.ts` — Authorization wrapper with permission checks
