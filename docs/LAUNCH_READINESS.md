# Launch Readiness Checklist

## Status: 🟢 READY FOR VERIFICATION — ALL FIXES COMPLETE

This document tracks the critical path to production launch. All 10 issues (CRITICAL, HIGH, and MEDIUM priority) have been addressed in code. The fixes must now be verified before launch.

---

## Critical Blockers (RESOLVED — TESTING REQUIRED)

### ✅ 1. Schema Reconciliation Migration Created
**Status:** Code complete, needs verification  
**File:** `supabase/migrations/00041_critical_schema_reconciliation.sql`

**What was fixed:**
- Added missing `audit_log` columns: `actor`, `entity_type`, `ip`
- Added atomic upsert support for `ad_impressions` (prevents race conditions)
- Verified all critical tables exist (`ad_placements`, `ad_impressions`, `ai_drafts`, `affiliate_networks`)
- Verified all analytics RPC functions exist
- Added defensive checks for `sites.is_active` and `newsletter_subscribers.unsubscribe_token`

**Verification steps:**
```bash
# 1. Test clean migration replay from empty database
supabase db reset

# 2. Verify all tables exist
psql $SUPABASE_DB_URL -c "\dt public.*"

# 3. Verify audit_log schema
psql $SUPABASE_DB_URL -c "\d public.audit_log"

# 4. Verify analytics RPCs exist
psql $SUPABASE_DB_URL -c "\df get_top_*"

# 5. Regenerate TypeScript types
npm run db:types
```

---

### ✅ 2. Atomic Impression Tracking Fixed
**Status:** Code complete, needs testing  
**File:** `lib/dal/ad-impressions.ts`

**What was fixed:**
- Replaced read-then-update pattern with atomic `upsert()`
- Added support for `content_id` and `cpm_revenue_cents` tracking
- Changed column name from `count` to `impression_count` for clarity

**Verification steps:**
```bash
# Run concurrent impression test
npm run test -- ad-impressions.test.ts

# Or manual verification:
# 1. Record 100 concurrent impressions for the same placement/page/date
# 2. Verify final count is exactly 100 (not less due to race conditions)
```

---

### ✅ 3. Password Reset URL Security Fixed
**Status:** Code complete, needs testing  
**File:** `app/api/auth/forgot-password/route.ts`

**What was fixed:**
- Replaced `request.headers.get("origin")` with canonical `process.env.APP_URL`
- Added validation that `APP_URL` is configured before sending reset emails
- Prevents phishing via spoofed Origin headers

**Verification steps:**
```bash
# 1. Set APP_URL in environment
export APP_URL=https://wristnerd.xyz

# 2. Test password reset flow
curl -X POST https://wristnerd.xyz/api/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com"}'

# 3. Verify email contains correct domain (not request origin)
# 4. Verify reset link works
```

**Required environment variable:**
```bash
# Add to Cloudflare Worker secrets
wrangler secret put APP_URL
# Value: https://wristnerd.xyz (or your primary domain)
```

---

### ✅ 4. Cron Jobs Configured
**Status:** Code complete, needs verification  
**File:** `wrangler.jsonc`

**What was fixed:**
- Added daily AI generation cron: `0 2 * * *` (2 AM UTC)
- Added daily sitemap refresh cron: `0 3 * * *` (3 AM UTC)
- Kept existing scheduled publishing cron: `*/5 * * * *` (every 5 minutes)

**Verification steps:**
```bash
# 1. Deploy to Cloudflare
npx opennextjs-cloudflare deploy

# 2. Verify cron triggers in Cloudflare Dashboard
# Workers & Pages → affilite-mix → Settings → Triggers → Cron Triggers

# 3. Test cron endpoints manually
curl -X POST https://wristnerd.xyz/api/cron/ai-generate \
  -H "Authorization: Bearer $CRON_SECRET"

curl -X POST https://wristnerd.xyz/api/cron/sitemap-refresh \
  -H "Authorization: Bearer $CRON_SECRET"

# 4. Monitor logs for scheduled executions
wrangler tail affilite-mix
```

---

### ✅ 5. CI/CD Reproducibility Improved
**Status:** Code complete, needs verification  
**Files:** `.github/workflows/ci.yml`, `.github/workflows/deploy.yml`, `.github/workflows/preview.yml`

**What was fixed:**
- Replaced all `npm install` with `npm ci` for reproducible builds
- Ensures lockfile is respected in all automated environments

**Verification steps:**
```bash
# 1. Push to a branch and verify CI passes
git push origin feature/launch-fixes

# 2. Verify no "package-lock.json out of sync" warnings
# 3. Check that CI uses exact versions from lockfile
```

---

## High Priority (RESOLVED — TESTING REQUIRED)

### ✅ 6. TypeScript Strictness
**Status:** Code complete, needs verification  
**File:** `tsconfig.json`

**What was fixed:**
- Changed `allowJs: true` → `allowJs: false`
- Changed `skipLibCheck: true` → `skipLibCheck: false`
- Catches more type errors at compile time

**Verification steps:**
```bash
# Run type checking with stricter rules
npm run typecheck

# Fix any new type errors that surface
# (Most should already be caught by existing strict mode)
```

---

### ✅ 7. ESLint Promise Safety
**Status:** Code complete, needs verification  
**File:** `eslint.config.mjs`

**What was fixed:**
- `@typescript-eslint/no-floating-promises`: "warn" → "error"
- `@typescript-eslint/no-misused-promises`: "warn" → "error"
- Prevents unhandled promise rejections

**Verification steps:**
```bash
# Run linting with stricter promise rules
npm run lint

# Fix any floating promises that surface
# (Add void operator or .catch() handlers)
```

---

### ✅ 8. Tenant-Aware 404 Pages
**Status:** Code complete, needs verification  
**File:** `middleware.ts`

**What was fixed:**
- Removed hardcoded "Niche Not Found" HTML
- Now rewrites to `/not-found` which renders `app/(public)/not-found.tsx`
- Provides tenant branding, localization (Arabic support), and proper SEO
- Sets correct HTTP 404 status code

**Verification steps:**
```bash
# Test 404 page on English site
curl -I https://wristnerd.xyz/nonexistent-page
# Should return 404 with branded page

# Test 404 page on Arabic site
curl -I https://arabictools.wristnerd.xyz/nonexistent-page
# Should return 404 with Arabic text

# Test unknown domain
curl -I https://unknown-domain.test/
# Should return 404 with fallback page
```

---

### ✅ 9. Database Reset Smoke Test in CI
**Status:** Code complete, needs verification  
**File:** `.github/workflows/deploy.yml`

**What was fixed:**
- Added "Database reset smoke test" step before production migrations
- Drops and recreates staging database schema
- Applies all migrations from zero
- Verifies all critical tables, columns, and RPC functions exist
- Fails the deploy if schema is inconsistent

**Verification steps:**
```bash
# Set up staging database URL in GitHub secrets
# Go to: GitHub → Settings → Secrets and variables → Actions
# Add: STAGING_SUPABASE_DB_URL

# Push to main and verify the smoke test runs
git push origin main

# Check GitHub Actions logs for:
# ✅ Database reset smoke test PASSED
```

**Required GitHub secret:**
```
Name: STAGING_SUPABASE_DB_URL
Value: postgresql://postgres.<staging-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres
```

---

### ✅ 10. Integration Tests
**Status:** Code complete, needs verification  
**Files:** `__tests__/integration/*.test.ts`

**What was fixed:**
Created comprehensive integration tests:
- `newsletter-flow.test.ts` — Subscribe → confirm → unsubscribe flow
- `password-reset-flow.test.ts` — Reset token generation, validation, expiry
- `audit-log-flow.test.ts` — Write/read with all columns, filtering, site isolation
- `impression-tracking.test.ts` — Concurrent tracking, CPM revenue, last_seen_at

**Verification steps:**
```bash
# Run all integration tests
npm test __tests__/integration/

# Run specific test suites
npm test newsletter-flow
npm test password-reset-flow
npm test audit-log-flow
npm test impression-tracking

# All tests should pass
```

---

## Pre-Launch Verification Checklist

Run these steps in order before allowing production traffic:

### Database

- [ ] Run `supabase db reset` from empty database
- [ ] Verify all migrations apply cleanly
- [ ] Verify all tables exist: `sites`, `categories`, `products`, `content`, `affiliate_clicks`, `admin_users`, `newsletter_subscribers`, `audit_log`, `ad_placements`, `ad_impressions`, `ai_drafts`, `affiliate_networks`
- [ ] Verify `audit_log` has columns: `actor`, `entity_type`, `ip`
- [ ] Verify `sites` has column: `is_active`
- [ ] Verify `newsletter_subscribers` has column: `unsubscribe_token`
- [ ] Verify analytics RPCs exist: `get_top_products`, `get_top_referrers`, `get_top_content_slugs`, `get_daily_clicks`
- [ ] Run `npm run db:types` to regenerate TypeScript types
- [ ] Verify database backup is configured and tested

### Application

- [ ] All CI checks pass (lint, test, typecheck, build)
- [ ] Integration tests pass: `npm test __tests__/integration/`
- [ ] Preview deployment succeeds
- [ ] E2E tests pass against preview
- [ ] `APP_URL` environment variable is set in production
- [ ] All required Worker secrets are set (see `docs/CLOUDFLARE.md`)
- [ ] Cron jobs are visible in Cloudflare Dashboard (should see 3 schedules)
- [ ] Rate limiting KV namespace is bound
- [ ] Health check endpoint returns 200: `curl https://wristnerd.xyz/api/health -H "Authorization: Bearer $CRON_SECRET"`
- [ ] TypeScript compiles with stricter settings (`allowJs: false`, `skipLibCheck: false`)
- [ ] ESLint passes with promise rules as errors

### Security

- [ ] Password reset flow tested end-to-end
- [ ] Reset emails contain correct canonical domain (not request origin)
- [ ] Audit log writes and reads work correctly
- [ ] Admin authentication works
- [ ] RLS policies prevent unauthorized access
- [ ] CSRF protection is active
- [ ] Rate limiting is active on sensitive endpoints

### Monitoring

- [ ] Sentry DSN is configured
- [ ] Error monitoring is receiving events
- [ ] Cloudflare Workers observability is enabled
- [ ] Log retention strategy is documented
- [ ] Incident response runbook exists

### Performance

- [ ] Impression tracking handles concurrent requests correctly
- [ ] Analytics queries use RPC functions (not client-side aggregation)
- [ ] Site resolver cache is working
- [ ] Database connection pooling is configured

### Content

- [ ] At least one site is seeded with `is_active: true`
- [ ] DNS is configured for all active domains
- [ ] SSL certificates are valid
- [ ] `robots.txt` is serving correctly
- [ ] `sitemap.xml` is valid and discoverable
- [ ] 404 pages return proper HTTP status codes
- [ ] 404 pages show tenant branding and localization (test English and Arabic sites)

---

## Post-Launch Monitoring

### First 24 Hours

- [ ] Monitor error rates in Sentry
- [ ] Verify cron jobs are executing on schedule
- [ ] Check impression tracking for data loss
- [ ] Verify newsletter signups are working
- [ ] Monitor database connection pool usage
- [ ] Check rate limiting is not blocking legitimate traffic

### First Week

- [ ] Review audit log for suspicious activity
- [ ] Verify analytics data is accurate
- [ ] Check ad impression counts match expected traffic
- [ ] Monitor affiliate click tracking
- [ ] Review performance metrics
- [ ] Verify backup/restore procedures

---

## Rollback Plan

If critical issues are discovered post-launch:

1. **Immediate:** Revert to previous Cloudflare Worker deployment
   ```bash
   wrangler rollback --name affilite-mix
   ```

2. **Database:** If migration issues occur, restore from backup
   ```bash
   # See docs/BACKUP_RESTORE.md for full procedure
   ```

3. **DNS:** If domain routing fails, update DNS to point to fallback
   ```bash
   # See docs/DNS_FAILOVER.md
   ```

---

## Estimated Timeline

- **Critical fixes verification:** COMPLETE ✅
- **Medium priority fixes verification:** 4-6 hours
- **Integration test execution:** 2-3 hours
- **Full pre-launch checklist:** 1 day
- **Total to launch-ready:** 1-2 days

---

## Sign-Off

Before launch, the following must be verified by:

- [ ] **Engineering Lead:** All fixes tested and verified (10/10 complete)
- [ ] **DevOps:** Database migrations replay cleanly, backups tested, smoke test passes
- [ ] **Security:** Password reset, audit logging, RLS policies verified
- [ ] **Product:** Cron jobs scheduled, monitoring configured, 404 pages branded

---

## Next Steps

1. ✅ All code fixes complete (10/10 issues resolved)
2. Set required environment variables (`APP_URL`, `STAGING_SUPABASE_DB_URL`)
3. Run verification steps for each fix
4. Execute integration tests
5. Complete the pre-launch checklist
6. Schedule a launch window
7. Execute launch with monitoring in place
8. Follow post-launch monitoring plan

---

**Last Updated:** 2026-04-22  
**Status:** All fixes complete, ready for verification and launch
