# Verification Checklist

Use this checklist to verify all fixes before launch. Check off each item as you complete it.

---

## Phase 1: Environment Setup (30 minutes)

### Set Required Environment Variables

- [ ] **Production APP_URL**
  ```bash
  echo "https://wristnerd.xyz" | wrangler secret put APP_URL --name affilite-mix
  ```
  Verify: `wrangler secret list --name affilite-mix | grep APP_URL`

- [ ] **GitHub Staging DB URL**
  1. Go to: https://github.com/YOUR_ORG/YOUR_REPO/settings/secrets/actions
  2. Click "New repository secret"
  3. Name: `STAGING_SUPABASE_DB_URL`
  4. Value: `postgresql://postgres.<staging-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres`
  5. Click "Add secret"

---

## Phase 2: Local Verification (2-3 hours)

### Database Migration Verification

- [ ] **Test clean migration replay**
  ```bash
  supabase db reset
  ```
  Expected: All migrations apply successfully

- [ ] **Verify audit_log schema**
  ```bash
  psql $SUPABASE_DB_URL -c "\d public.audit_log"
  ```
  Expected: Columns include `actor`, `entity_type`, `ip`

- [ ] **Verify ad_impressions schema**
  ```bash
  psql $SUPABASE_DB_URL -c "\d public.ad_impressions"
  ```
  Expected: Columns include `impression_count`, `cpm_revenue_cents`, `last_seen_at`

- [ ] **Verify analytics RPCs exist**
  ```bash
  psql $SUPABASE_DB_URL -c "\df get_top_*"
  ```
  Expected: `get_top_products`, `get_top_referrers`, `get_top_content_slugs`, `get_daily_clicks`

- [ ] **Regenerate TypeScript types**
  ```bash
  npm run db:types
  ```
  Expected: No errors, types updated

### Code Quality Checks

- [ ] **Run unit tests**
  ```bash
  npm test
  ```
  Expected: All tests pass

- [ ] **Run integration tests**
  ```bash
  npm test __tests__/integration/
  ```
  Expected: All 4 test suites pass
  - Newsletter flow
  - Password reset flow
  - Audit log flow
  - Impression tracking

- [ ] **Type checking (stricter rules)**
  ```bash
  npm run typecheck
  ```
  Expected: No type errors
  Note: If errors appear, they're real issues that need fixing

- [ ] **Linting (promise rules as errors)**
  ```bash
  npm run lint
  ```
  Expected: No lint errors
  Note: Fix any floating promises with `void` or `.catch()`

- [ ] **Build**
  ```bash
  npm run build
  ```
  Expected: Build succeeds with no errors

---

## Phase 3: Deploy to Production (1 hour)

### Pre-Deploy Checks

- [ ] **Verify all CI checks pass**
  Go to: https://github.com/YOUR_ORG/YOUR_REPO/actions
  Expected: Latest commit shows all green checks

- [ ] **Verify staging DB smoke test passes**
  Check deploy workflow logs for:
  ```
  ✅ Database reset smoke test PASSED
  ```

### Deploy

- [ ] **Build OpenNext bundle**
  ```bash
  npx @opennextjs/cloudflare build
  ```
  Expected: Build completes successfully

- [ ] **Deploy to Cloudflare**
  ```bash
  npx opennextjs-cloudflare deploy
  ```
  Expected: Deploy succeeds, shows worker URL

- [ ] **Wait for propagation**
  ```bash
  sleep 30
  ```

---

## Phase 4: Production Verification (1 hour)

### Health Checks

- [ ] **Health endpoint**
  ```bash
  curl https://wristnerd.xyz/api/health \
    -H "Authorization: Bearer $CRON_SECRET"
  ```
  Expected: HTTP 200, `{"status":"healthy"}`

- [ ] **Homepage loads**
  ```bash
  curl -I https://wristnerd.xyz/
  ```
  Expected: HTTP 200

### Cron Jobs

- [ ] **Verify cron triggers in Cloudflare Dashboard**
  1. Go to: https://dash.cloudflare.com
  2. Navigate to: Workers & Pages → affilite-mix → Settings → Triggers
  3. Check "Cron Triggers" section
  
  Expected: 3 cron schedules visible:
  - `*/5 * * * *` (every 5 minutes)
  - `0 2 * * *` (daily at 2 AM UTC)
  - `0 3 * * *` (daily at 3 AM UTC)

- [ ] **Test cron endpoints manually**
  ```bash
  # Scheduled publishing
  curl -X POST https://wristnerd.xyz/api/cron/publish \
    -H "Authorization: Bearer $CRON_SECRET"
  
  # AI generation
  curl -X POST https://wristnerd.xyz/api/cron/ai-generate \
    -H "Authorization: Bearer $CRON_SECRET"
  
  # Sitemap refresh
  curl -X POST https://wristnerd.xyz/api/cron/sitemap-refresh \
    -H "Authorization: Bearer $CRON_SECRET"
  ```
  Expected: All return HTTP 200

### 404 Pages

- [ ] **Test English site 404**
  ```bash
  curl -I https://wristnerd.xyz/nonexistent-page
  ```
  Expected: HTTP 404, branded page with English text

- [ ] **Test Arabic site 404**
  ```bash
  curl -I https://arabictools.wristnerd.xyz/nonexistent-page
  ```
  Expected: HTTP 404, branded page with Arabic text

- [ ] **Verify 404 page content**
  ```bash
  curl https://wristnerd.xyz/nonexistent-page
  ```
  Expected: HTML contains site branding, not "Niche Not Found"

### Password Reset

- [ ] **Test password reset flow**
  ```bash
  curl -X POST https://wristnerd.xyz/api/auth/forgot-password \
    -H "Content-Type: application/json" \
    -d '{"email":"test@example.com"}'
  ```
  Expected: HTTP 200, success message

- [ ] **Verify reset email (if RESEND_API_KEY is set)**
  Check email inbox for test@example.com
  Expected: Email contains `https://wristnerd.xyz/admin/reset-password?token=...`
  NOT: `https://attacker.com/...` or request origin

### Impression Tracking

- [ ] **Test impression tracking**
  ```bash
  # Record a test impression
  curl -X POST https://wristnerd.xyz/api/track/impression \
    -H "Content-Type: application/json" \
    -d '{"placementId":"test-placement","pagePath":"/test"}'
  ```
  Expected: HTTP 200 or 204

- [ ] **Verify impression was recorded**
  ```bash
  psql $SUPABASE_DB_URL -c \
    "SELECT * FROM ad_impressions WHERE page_path = '/test' ORDER BY created_at DESC LIMIT 1;"
  ```
  Expected: Row exists with `impression_count = 1`

### Audit Logging

- [ ] **Verify audit log writes**
  Perform an admin action (e.g., create a product)
  
  ```bash
  psql $SUPABASE_DB_URL -c \
    "SELECT actor, action, entity_type, ip FROM audit_log ORDER BY created_at DESC LIMIT 5;"
  ```
  Expected: Recent entries have `actor`, `entity_type`, and `ip` populated

---

## Phase 5: Monitoring (First 24 Hours)

### Immediate Checks (First Hour)

- [ ] **Monitor error rates in Sentry**
  Go to: https://sentry.io/organizations/YOUR_ORG/issues/
  Expected: No new critical errors

- [ ] **Check Cloudflare Worker logs**
  ```bash
  wrangler tail affilite-mix
  ```
  Expected: No errors, normal request flow

- [ ] **Verify cron jobs execute**
  Wait for next 5-minute mark, check logs
  Expected: Scheduled publishing cron executes successfully

### First 24 Hours

- [ ] **Monitor impression counts**
  ```bash
  psql $SUPABASE_DB_URL -c \
    "SELECT COUNT(*), SUM(impression_count) FROM ad_impressions WHERE impression_date = CURRENT_DATE;"
  ```
  Expected: Counts increase over time, no data loss

- [ ] **Monitor newsletter signups**
  ```bash
  psql $SUPABASE_DB_URL -c \
    "SELECT COUNT(*) FROM newsletter_subscribers WHERE created_at > NOW() - INTERVAL '24 hours';"
  ```
  Expected: New signups have `unsubscribe_token` populated

- [ ] **Check audit log activity**
  ```bash
  psql $SUPABASE_DB_URL -c \
    "SELECT COUNT(*) FROM audit_log WHERE created_at > NOW() - INTERVAL '24 hours';"
  ```
  Expected: Admin actions are being logged

- [ ] **Verify no schema errors**
  Check Sentry for database-related errors
  Expected: No "column does not exist" or "relation does not exist" errors

---

## Phase 6: Sign-Off

### Engineering Lead

- [ ] All code fixes verified
- [ ] All tests passing
- [ ] No critical errors in production
- [ ] Signature: _________________ Date: _______

### DevOps

- [ ] Database migrations replay cleanly
- [ ] Smoke test passes in CI
- [ ] Backups verified
- [ ] Monitoring configured
- [ ] Signature: _________________ Date: _______

### Security

- [ ] Password reset uses canonical URL
- [ ] Audit logging working correctly
- [ ] RLS policies verified
- [ ] No security warnings in Sentry
- [ ] Signature: _________________ Date: _______

### Product

- [ ] Cron jobs scheduled and running
- [ ] 404 pages branded and localized
- [ ] User-facing features working
- [ ] Analytics tracking correctly
- [ ] Signature: _________________ Date: _______

---

## Rollback Triggers

If any of these occur, execute rollback plan:

- [ ] Error rate > 5% in Sentry
- [ ] Database connection failures
- [ ] Cron jobs failing repeatedly
- [ ] Impression tracking losing data
- [ ] Password reset emails not sending
- [ ] 404 pages showing errors

### Rollback Command
```bash
wrangler rollback --name affilite-mix
```

---

## Success Criteria

All items above must be checked before considering launch complete.

**Current Status:** ⏳ Ready to start verification

**Estimated Time:** 4-6 hours total

**Next Step:** Begin Phase 1 (Environment Setup)

---

*Last Updated: 2026-04-22*  
*Version: 1.0*  
*Issues Resolved: 10/10*
