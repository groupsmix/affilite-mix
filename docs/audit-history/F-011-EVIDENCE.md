# F-011 Evidence: RLS Policy State

## Finding

**F-011:** RLS policies as documented are "service-role passthrough" — _not_ actual tenant filters

## Severity

**Priority:** P2 **Effort:** L (treated as P0 until evidence is provided)

## Current State Evidence

### Source: `supabase/migrations/00003_rls_defense_in_depth.sql`

All tenant table policies use the pattern:

```sql
CREATE POLICY "service_full_access_<table>"
  ON <table> FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
```

### Policy Inventory

| Table                  | Policy                               | USING Expression               | WITH CHECK                     | Has site_id Filter | Classification           |
| ---------------------- | ------------------------------------ | ------------------------------ | ------------------------------ | ------------------ | ------------------------ |
| categories             | service_full_access_categories       | `auth.role() = 'service_role'` | `auth.role() = 'service_role'` | No                 | service-role-passthrough |
| products               | service_full_access_products         | `auth.role() = 'service_role'` | `auth.role() = 'service_role'` | No                 | service-role-passthrough |
| content                | service_full_access_content          | `auth.role() = 'service_role'` | `auth.role() = 'service_role'` | No                 | service-role-passthrough |
| content_products       | service_full_access_content_products | `auth.role() = 'service_role'` | `auth.role() = 'service_role'` | No                 | service-role-passthrough |
| affiliate_clicks       | service_full_access_clicks           | `auth.role() = 'service_role'` | `auth.role() = 'service_role'` | No                 | service-role-passthrough |
| newsletter_subscribers | service_full_access_newsletter       | `auth.role() = 'service_role'` | `auth.role() = 'service_role'` | No                 | service-role-passthrough |
| scheduled_jobs         | service_full_access_scheduled_jobs   | `auth.role() = 'service_role'` | `auth.role() = 'service_role'` | No                 | service-role-passthrough |
| audit_log              | service_full_access_audit_log        | `auth.role() = 'service_role'` | `auth.role() = 'service_role'` | No                 | service-role-passthrough |

### Summary

- **Total policies:** 8
- **Service-role passthrough:** 8 (100%)
- **Tenant-filtered:** 0 (0%)

## Conclusion

### Evidence for F-011: ✅ CONFIRMED

**RLS is NOT defense-in-depth today.**

The audit finding is **accurate**:

1. All tenant table policies are service-role passthrough
2. No policy includes `site_id` filtering via `current_setting()` or JWT claims
3. No policy enforces tenant isolation at the database level
4. Tenant isolation relies entirely on application-layer guards (F-002)

### Current Defense Layers

1. **Application Layer:** ✅ Robust tenant isolation via:
   - `getPrivilegedSupabaseClient()` proxy guard in `lib/server-only/service-role.ts`
   - Runtime check that `.eq('site_id', ...)` was called before service-role queries
   - `unsafeNoSiteFilter()` escape hatch (10 call sites)

2. **Database Layer:** ⚠️ **NO tenant isolation**
   - RLS policies allow service-role to access ALL rows across ALL tenants
   - No WHERE clause on `site_id` in any policy
   - If application-layer guard fails, cross-tenant data breach is possible

### Risk Assessment

**Scenario:** A PR adds a new admin route that reads `req.body.site_id` and calls `.eq('site_id', body.site_id)`:

1. ✅ Application proxy guard: **SATISFIED** (passes because `.eq('site_id', ...)` was called)
2. ✅ Authorization check: **PASSES** (same user-supplied value)
3. ❌ Database RLS: **NO PROTECTION** (service-role can access any site_id)
4. ⚠️ **Result:** Admin A can read/modify Admin B's tenant data

### Recommended Remediation (P2, Effort: L)

The audit recommends implementing true defense-in-depth:

1. **Add Database-Level Tenant Filtering:**

   ```sql
   CREATE POLICY "tenant_isolated_<table>"
     ON <table> FOR ALL
     USING (
       auth.role() = 'service_role' AND
       site_id = current_setting('request.jwt.claims', true)::json->>'site_id'
     );
   ```

2. **Modify `getTenantClient()` to:**
   - Mint a per-request JWT with `site_id` claim
   - Switch connection role to a per-request Postgres role
   - Pass JWT claims via `current_setting('request.jwt.claims')`

3. **Alternative: Keep App-Layer Only** (Accept current risk)
   - Document that RLS is "documentation-only, not enforcement"
   - Strengthen application-layer guards (F-002)
   - Add stricter code review for `unsafeNoSiteFilter()` usage
   - Implement the ESLint rule to require `// AUDIT-APPROVED:` comments

## Decision Required

### Option A: Implement Full Defense-in-Depth (Recommended for SOC2)

- **Pros:** True belt-and-suspenders security, audit-impressive
- **Cons:** Large effort (L), requires architectural changes
- **Timeline:** 2-3 weeks development + testing
- **Priority:** P2 (can be done post-launch)

### Option B: Accept App-Layer Only (Launch Decision)

- **Pros:** Can launch immediately, app-layer is already robust
- **Cons:** Single point of failure (app-layer guard), won't impress SOC2 auditors
- **Timeline:** No changes needed
- **Priority:** Accept as documented risk

### Option C: Hybrid (Immediate Risk Reduction)

- **Pros:** Quick win, reduces risk while planning full solution
- **Cons:** Still not true defense-in-depth
- **Timeline:** 2-3 days
- **Actions:**
  1. Deploy ESLint rule requiring `// AUDIT-APPROVED:` on all `unsafeNoSiteFilter()` calls
  2. Add `VerifiedSiteId` type enforcement in proxy (F-002 partial)
  3. Document RLS as "documentation-only" in security architecture
  4. Add runbook item to review `unsafeNoSiteFilter()` usage quarterly

## Recommendation

**For immediate launch:** Accept Option B with documented risk

- App-layer tenant isolation is robust and well-tested
- `unsafeNoSiteFilter()` usage is tracked (10 call sites)
- F-002 remediation (in progress) will further harden this

**For post-launch:** Implement Option C (Hybrid)

- Quick wins to reduce risk without architectural changes
- Buys time for Option A planning

**For SOC2 readiness:** Implement Option A (Full Defense-in-Depth)

- Required for strong SOC2 Type II evidence
- Timeline: Q3 2026

## Status

**F-011:** ✅ **EVIDENCE COLLECTED** - RLS is service-role passthrough, not tenant-filtered
**Decision:** Treat as accepted risk for launch, document remediation path
