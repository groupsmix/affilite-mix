# Supabase Migrations Runbook

This directory contains all incremental schema migrations for the database.

## 00065_products_affiliate_url_https.sql
- **Purpose:** Enforce HTTPS scheme on affiliate URLs to prevent Javascript/Data URI injections.
- **Risk:** Low. Check constraint only.
- **Rollback Strategy:** `ALTER TABLE products DROP CONSTRAINT products_affiliate_url_https;`
- **Data Backfill Notes:** No existing violations in production.
- **Expected Runtime:** < 1 second.

## 00064_drop_legacy_public_select_policies.sql
- **Purpose:** Drop insecure public read access on sensitive tables.
- **Risk:** High. May break anonymous queries if replacements are misconfigured.
- **Rollback Strategy:** Re-apply `FOR SELECT TO anon` policies.
- **Data Backfill Notes:** N/A.
- **Expected Runtime:** < 1 second.

## Rollback Plan (General)
Every production migration must answer:
1. **Can it be rolled back?** Yes, via `-down.sql` sibling.
2. **Does it lock tables?** If it takes an `ACCESS EXCLUSIVE` lock, document it.
3. **Does it backfill?** Backfills must run in batches.
4. **Can old app code still run?** Yes, migrations must be forward-compatible.
5. **Can new app code run before migration?** No, deploy pipeline runs DB migrations *before* app deployments.
