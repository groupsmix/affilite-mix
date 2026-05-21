# Security Incident Log

This document records RLS and tenant-isolation regressions for SOC 2 / acquirer disclosure.

## 1. Migration 00064 → 00067 RLS Regression

### Timeline

| Event                 | Migration                               | Description                                                                                                      |
| --------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **00064 deployed**    | `00064_tenant_isolation_rls.sql`        | Introduced tenant-isolation RLS policies on core tables. Intended to restrict every row to its owning `site_id`. |
| **Gap (00065–00066)** | 00065 (actor_user_id), 00066 (indexes)  | Unrelated migrations; no RLS changes. The 00064 policies were live during this window.                           |
| **00067 deployed**    | `00067_harden_tenant_isolation_rls.sql` | Hardened the 00064 policies — tightened SELECT/UPDATE/DELETE conditions that were too permissive in 00064.       |

### What Data Was Reachable During the Gap

Between 00064 and 00067, the tenant-isolation policies on the following tables had overly broad SELECT conditions that could allow an authenticated user with a valid JWT for **one** site to read rows belonging to **another** site:

- `affiliate_clicks`
- `affiliate_links`
- `content`
- `products`
- `categories`
- `comments`
- `newsletter_subscribers`

No evidence of exploitation has been found, but absence of evidence is not evidence of absence — there was no automated cross-tenant access detection in place at the time.

### Detection

The gap was discovered during a manual code review, not by any automated system. At the time of the incident:

- No cross-tenant access test suite existed.
- No RLS regression CI guard was in place.
- No audit trail captured which site_id a given query was scoped to.

**Lesson:** Without automated cross-tenant testing, RLS regressions are invisible until a manual review catches them.

### Remediation in Current Code

1. Migration `00067_harden_tenant_isolation_rls.sql` closes all known gaps.
2. `__tests__/cross-tenant-authz.test.ts` now validates site-scoping for every tenant-isolated table.
3. `__tests__/dal-site-scoping.test.ts` asserts every DAL function passes `site_id`.
4. `__tests__/migration-order.test.ts` enforces migration prefix uniqueness to prevent apply-order ambiguity.
5. CI guard `__tests__/admin-routes-no-service-role.test.ts` prevents new admin routes from importing the service-role client directly.
