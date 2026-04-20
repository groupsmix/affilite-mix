# Disaster Recovery Drill Checklist

Regular DR drills verify that backup, restore, rollback, and failover procedures actually work. Run these drills on a schedule to build confidence and identify gaps before a real incident.

---

## Drill Schedule

| Drill | Frequency | Duration | Environment |
| --- | --- | --- | --- |
| Database restore | Quarterly | 1–2 hours | Staging Supabase project |
| Worker rollback | Monthly | 15 minutes | Production (safe — Cloudflare retains versions) |
| Secrets rotation | Quarterly (staggered) | 30 minutes | Production (one secret at a time) |
| Full failover | Bi-annually | 2–4 hours | Staging → new Supabase project |
| Cron failure recovery | Quarterly | 30 minutes | Production |

---

## Drill 1: Database Restore

**Goal:** Verify that a database backup can be restored to a functioning state.

### Prerequisites
- [ ] Access to Supabase Dashboard for the staging project
- [ ] A recent backup (PITR or daily) OR manual backup dumps from `backup-strategy.md`
- [ ] `psql` or Supabase CLI installed locally

### Steps

- [ ] **1. Create a fresh Supabase project** for the drill (or use an existing staging project)
- [ ] **2. Apply all migrations:**
  ```bash
  # Using Supabase CLI
  supabase db push --project-ref <staging-ref>

  # Or manually
  for f in supabase/migrations/*.sql; do
    psql "$STAGING_DB_URL" -f "$f"
  done
  ```
- [ ] **3. Restore data from backup:**
  ```bash
  # From manual backup dumps
  for TABLE in sites categories products content content_products newsletter_subscribers admin_users; do
    pg_restore --data-only --table=$TABLE -d "$STAGING_DB_URL" backups/latest/$TABLE.dump
  done
  ```
- [ ] **4. Verify data integrity:**
  ```sql
  -- Row counts should match production (approximately)
  SELECT 'sites' AS tbl, COUNT(*) FROM sites
  UNION ALL SELECT 'categories', COUNT(*) FROM categories
  UNION ALL SELECT 'products', COUNT(*) FROM products
  UNION ALL SELECT 'content', COUNT(*) FROM content;

  -- Foreign key integrity
  SELECT c.id FROM content c
  LEFT JOIN sites s ON c.site_id = s.id
  WHERE s.id IS NULL;
  -- Expected: 0 rows (no orphaned content)
  ```
- [ ] **5. Verify RLS policies:**
  ```sql
  -- Check that RLS is enabled on all expected tables
  SELECT tablename, rowsecurity
  FROM pg_tables
  WHERE schemaname = 'public'
  ORDER BY tablename;
  ```
- [ ] **6. Connect the application to the restored DB** (update env vars on staging) and verify:
  - [ ] Homepage loads
  - [ ] Admin login works
  - [ ] Content is visible
  - [ ] Products display correctly
- [ ] **7. Document results:**
  - Time to restore: _____ minutes
  - Data completeness: _____% (compare row counts to production)
  - Issues encountered: _____
  - RLS policies intact: Yes / No

### Success Criteria
- All migrations apply without errors
- Data restores completely (row counts within 1% of source)
- Application functions normally against restored DB
- RLS policies are correctly applied
- Total drill time < 2 hours

---

## Drill 2: Worker Rollback

**Goal:** Verify that a Cloudflare Workers rollback restores service within 60 seconds.

### Steps

- [ ] **1. Record the current deployment ID:**
  ```bash
  curl -s "https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/workers/scripts/affilite-mix/deployments" \
    -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
    | jq '.result[0].id'
  ```
- [ ] **2. Verify current state:**
  ```bash
  curl -s https://wristnerd.site/api/health | jq .status
  # Expected: "healthy"
  ```
- [ ] **3. Deploy a known-good change** (e.g., a no-op commit) to create a new version
- [ ] **4. Rollback to the previous version** via Cloudflare Dashboard or API:
  ```bash
  curl -X POST "https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/workers/scripts/affilite-mix/deployments/${PREVIOUS_DEPLOYMENT_ID}/rollback" \
    -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}"
  ```
- [ ] **5. Verify rollback succeeded:**
  ```bash
  # Should respond within 30 seconds of rollback
  curl -s https://wristnerd.site/api/health | jq .status
  curl -s -o /dev/null -w "%{http_code}" https://wristnerd.site/
  ```
- [ ] **6. Document results:**
  - Time from rollback initiation to healthy response: _____ seconds
  - Any errors during rollback: _____
  - Cache invalidation needed: Yes / No

### Success Criteria
- Rollback completes in < 60 seconds
- Health endpoint returns `"healthy"` after rollback
- All domains respond with 200

---

## Drill 3: Secrets Rotation

**Goal:** Verify that each secret can be rotated without extended downtime.

Rotate one secret per drill session. Follow the procedures in [secrets-rotation-runbook.md](./secrets-rotation-runbook.md).

### Steps

- [ ] **1. Choose the secret to rotate** (follow the rotation schedule)
- [ ] **2. Generate the new secret value** (see runbook for per-secret instructions)
- [ ] **3. Record the start time**
- [ ] **4. Update the secret** in Cloudflare Workers and GitHub Secrets
- [ ] **5. Deploy the new version** (push to `main` or manual workflow dispatch)
- [ ] **6. Verify functionality:**
  - [ ] If JWT_SECRET: admin login still works (existing sessions will be invalidated — expected)
  - [ ] If SUPABASE_SERVICE_ROLE_KEY: `/api/health` database check passes
  - [ ] If CRON_SECRET: health endpoint responds to authenticated requests
  - [ ] If RESEND_API_KEY: `/api/health` email check passes
  - [ ] If R2 keys: image upload in admin panel works
- [ ] **7. Record the end time and any downtime observed**
- [ ] **8. Document results:**
  - Secret rotated: _____
  - Total downtime: _____ seconds
  - Unexpected behavior: _____

### Success Criteria
- Rotation completes with < 5 minutes of downtime
- No data loss
- All dependent features resume normal operation

---

## Drill 4: Full Failover (New Supabase Project)

**Goal:** Verify the team can stand up a fully functional instance from scratch.

### Steps

- [ ] **1. Create a new Supabase project**
- [ ] **2. Apply all migrations** in order
- [ ] **3. Restore data** from the most recent backup
- [ ] **4. Update environment variables:**
  ```bash
  wrangler secret put NEXT_PUBLIC_SUPABASE_URL
  wrangler secret put NEXT_PUBLIC_SUPABASE_ANON_KEY
  wrangler secret put SUPABASE_SERVICE_ROLE_KEY
  ```
- [ ] **5. Deploy the application**
- [ ] **6. Verify end-to-end functionality:**
  - [ ] Health endpoint returns `"healthy"`
  - [ ] Public pages render content
  - [ ] Admin login works
  - [ ] Content CRUD operations work
  - [ ] Image uploads work (if R2 is still connected)
  - [ ] Affiliate click tracking works
  - [ ] Cron jobs execute on schedule
- [ ] **7. Document results:**
  - Total failover time: _____ minutes
  - Data loss (if any): _____
  - Steps that failed or needed adjustment: _____

### Success Criteria
- Full failover completes in < 4 hours
- All critical features operational
- Data loss is within acceptable bounds (< 24h of data for free-tier, < 1h for PITR)

---

## Drill 5: Cron Failure Recovery

**Goal:** Verify that missed cron jobs can be detected and manually re-triggered.

### Steps

- [ ] **1. Verify current cron status** by checking Cloudflare Workers logs for `[scheduled]` entries
- [ ] **2. Manually trigger the cron endpoint:**
  ```bash
  curl -X POST https://wristnerd.site/api/cron/publish \
    -H "Authorization: Bearer ${CRON_SECRET}" \
    -H "Content-Type: application/json"
  ```
- [ ] **3. Verify the response** — should return 200 with published/archived counts
- [ ] **4. Check that scheduled content was published** by querying the DB or viewing the site
- [ ] **5. Document results:**
  - Manual trigger successful: Yes / No
  - Content published correctly: Yes / No
  - Time to detect and recover from simulated missed cron: _____ minutes

### Success Criteria
- Manual cron trigger succeeds
- Published content appears on the site within 1 minute
- Recovery process documented and repeatable

---

## Drill Log Template

After each drill, record results here or in a separate `docs/drill-logs/` directory:

```markdown
# DR Drill Log: [Drill Name]

**Date:** YYYY-MM-DD
**Participants:** [Names]
**Drill type:** [Database Restore / Rollback / Secrets Rotation / Full Failover / Cron Recovery]

## Results
- Duration: _____ minutes
- Success: Yes / No / Partial
- Downtime observed: _____

## Issues Discovered
1. [Issue description + remediation]

## Action Items
| Action | Owner | Due Date |
| --- | --- | --- |
| [Fix discovered issue] | [Name] | YYYY-MM-DD |

## Next Drill Scheduled
YYYY-MM-DD — [Drill type]
```

---

## Recommended Tools

| Purpose | Recommended Tool | Notes |
| --- | --- | --- |
| Uptime monitoring | Better Stack / UptimeRobot | Multi-region HTTP checks |
| Pager / on-call | PagerDuty / Opsgenie / Better Stack | Escalation policies + phone alerts |
| Cron monitoring | Better Stack Heartbeats / Cronitor | Detects missed scheduled jobs |
| Log aggregation | Cloudflare Logpush / Datadog | Query structured JSON logs at scale |
| Status page | Better Stack / Atlassian Statuspage | Communicate outages to stakeholders |
