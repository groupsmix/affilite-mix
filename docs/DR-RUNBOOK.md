# Disaster Recovery Runbook

Operational playbook for recovering from production incidents affecting Affilite-Mix. Each procedure is self-contained and can be executed independently.

> **Audience:** On-call engineer / Super Administrator
>
> **Related docs:**
> [backup-strategy.md](./backup-strategy.md) ·
> [BACKUP-POLICY.md](./BACKUP-POLICY.md) ·
> [rollback-strategy.md](./rollback-strategy.md) ·
> [secrets-rotation-runbook.md](./secrets-rotation-runbook.md) ·
> [incident-response.md](./incident-response.md) ·
> [cloudflare-recovery.md](./cloudflare-recovery.md)

---

## Table of Contents

1. [Restore Database](#1-restore-database)
2. [Rollback Worker](#2-rollback-worker)
3. [Rotate Secrets](#3-rotate-secrets)
4. [Disable Cron](#4-disable-cron)
5. [Drain Queue](#5-drain-queue)
6. [Replay Queue](#6-replay-queue)
7. [Disable Admin User](#7-disable-admin-user)
8. [Recover Hacked Admin](#8-recover-hacked-admin)

---

## 1. Restore Database

**When:** Data loss, corruption, accidental deletion, or total Supabase project loss.

**RTO:** 30 min (PITR) / 4 hours (full rebuild). **RPO:** 5 min (PITR) / 24 hours (daily snapshot).

### Prerequisites

- `psql` or Supabase CLI installed
- Access to Supabase Dashboard (project owner or admin)
- Access to Cloudflare R2 (for off-site backup dumps)

### Option A — Point-in-Time Recovery (PITR)

Use when the Supabase project is intact but data was corrupted or deleted.

1. Open [Supabase Dashboard](https://supabase.com/dashboard) → your project → **Settings → Database → Backups**
2. Select **Point in Time** tab
3. Choose a timestamp **before** the incident
4. Click **Restore** and confirm
5. Wait for the restore to complete (typically 5–30 minutes depending on database size)
6. Verify:
   ```bash
   curl -s -H "Authorization: Bearer $CRON_SECRET" \
     https://wristnerd.site/api/health | jq .
   ```

### Option B — Daily Snapshot Restore

Use when PITR is unavailable or the incident is older than the PITR retention window.

1. Supabase Dashboard → **Settings → Database → Backups → Daily backups**
2. Select the most recent snapshot **before** the incident
3. Click **Restore** and confirm
4. After restore, check for data drift (any writes between snapshot time and incident time are lost)

### Option C — Full Rebuild from Scratch

Use when the entire Supabase project is destroyed.

1. **Provision a new Supabase project** in the Supabase Dashboard. Record:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`

2. **Apply all migrations:**

   ```bash
   supabase db push --project-ref <new-project-ref>
   # OR manually:
   for f in supabase/migrations/*.sql; do
     psql "$NEW_DATABASE_URL" -f "$f"
   done
   ```

3. **Restore data from R2 backup:**

   ```bash
   # Download the latest logical dump from R2
   wrangler r2 object get backup-bucket/latest/backup.sql --file backup.sql

   # Restore
   psql "$NEW_DATABASE_URL" -f backup.sql
   ```

4. **Update Cloudflare Worker secrets:**

   ```bash
   wrangler secret put NEXT_PUBLIC_SUPABASE_URL
   wrangler secret put NEXT_PUBLIC_SUPABASE_ANON_KEY
   wrangler secret put SUPABASE_SERVICE_ROLE_KEY
   ```

5. **Update GitHub Actions secrets** if CI/CD uses the database URL.

6. **Verify:**

   ```bash
   curl -s -H "Authorization: Bearer $CRON_SECRET" \
     https://wristnerd.site/api/health | jq .
   # Check row counts
   psql "$NEW_DATABASE_URL" -c \
     "SELECT 'sites', count(*) FROM sites
      UNION ALL SELECT 'products', count(*) FROM products
      UNION ALL SELECT 'content', count(*) FROM content;"
   ```

7. **DNS cutover** (if applicable): Ensure Cloudflare DNS points to the updated Worker.

### Post-Restore Checklist

- [ ] RLS policies applied correctly (`SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname='public'`)
- [ ] Admin login works
- [ ] Public pages load and display content
- [ ] Cron jobs execute successfully (wait for next scheduled run or trigger manually)
- [ ] Document the incident timeline and data loss window

---

## 2. Rollback Worker

**When:** Bad deployment causes 5xx errors, broken pages, or Worker crash loops.

**Time to recover:** ~30 seconds.

> Full details in [rollback-strategy.md](./rollback-strategy.md).

### Via Cloudflare Dashboard (preferred)

1. [Cloudflare Dashboard](https://dash.cloudflare.com/) → **Workers & Pages** → `affilite-mix`
2. Click the **Deployments** tab
3. Find the last known-good deployment
4. Click **⋮ → Rollback to this deployment**
5. Confirm

### Via Cloudflare API

```bash
# List recent deployments
curl -s "https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/workers/scripts/affilite-mix/deployments" \
  -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
  | jq '.result[:5] | .[] | {id, created_on}'

# Rollback to a specific deployment
curl -X POST \
  "https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/workers/scripts/affilite-mix/deployments/${GOOD_DEPLOYMENT_ID}/rollback" \
  -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}"
```

### Via Git Revert (permanent fix)

```bash
git log --oneline -10
git revert <bad-commit-sha>
git push origin main
# CI/CD triggers a fresh deployment
```

### Post-Rollback

1. **Verify all domains respond:**
   ```bash
   for domain in wristnerd.site arabictools.wristnerd.site crypto.wristnerd.site; do
     echo "$domain: $(curl -s -o /dev/null -w '%{http_code}' https://$domain/)"
   done
   ```
2. **Invalidate stale ISR cache** if the bad deployment wrote corrupt cache entries:
   ```bash
   curl -X POST https://wristnerd.site/api/revalidate \
     -H "Authorization: Bearer ${CRON_SECRET}" \
     -H "Content-Type: application/json" \
     -d '{"tags": ["content", "products", "categories"]}'
   ```
3. **Check Sentry** for residual errors after rollback.
4. If the bad deployment included a schema migration, see [rollback-strategy.md § 5](./rollback-strategy.md#5-database-rollback) — fix the DB **before** rolling back the Worker.

---

## 3. Rotate Secrets

**When:** Secret compromise suspected, scheduled rotation, or post-breach credential reset.

> Full per-secret procedures in [secrets-rotation-runbook.md](./secrets-rotation-runbook.md).

### Emergency Rotation (All Secrets)

Use when a broad compromise is suspected (e.g., `.env` file leaked, admin workstation compromised).

```bash
# Generate new values
JWT_NEW=$(openssl rand -hex 64)
CRON_NEW=$(openssl rand -base64 32)

# Rotate each secret — wrangler prompts for the value interactively
wrangler secret put JWT_SECRET
wrangler secret put CRON_SECRET
wrangler secret put CRON_PUBLISH_SECRET
wrangler secret put CRON_AI_SECRET
wrangler secret put CRON_PRICE_SECRET
wrangler secret put CRON_SITEMAP_SECRET
wrangler secret put CRON_STRIPE_SYNC_SECRET
wrangler secret put CRON_COMMISSION_SECRET
wrangler secret put CRON_DEALS_SECRET
wrangler secret put CRON_RETENTION_SECRET
wrangler secret put CRON_EPC_SECRET
wrangler secret put SUPABASE_SERVICE_ROLE_KEY
wrangler secret put STRIPE_SECRET_KEY
wrangler secret put STRIPE_WEBHOOK_SECRET
wrangler secret put RESEND_API_KEY
wrangler secret put R2_ACCESS_KEY_ID
wrangler secret put R2_SECRET_ACCESS_KEY
wrangler secret put INTERNAL_API_TOKEN
```

### Per-Secret Rotation Order (minimize downtime)

1. **`JWT_SECRET`** — Invalidates all admin sessions. Rotate first if admin compromise is suspected.
2. **Per-trigger `CRON_*_SECRET`** — Rotate one at a time. Each route falls back to `CRON_SECRET`.
3. **`CRON_SECRET` (shared fallback)** — Rotate last so per-trigger secrets absorb the transition.
4. **`SUPABASE_SERVICE_ROLE_KEY`** — Regenerate in Supabase Dashboard → Settings → API. Brief downtime expected.
5. **`STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET`** — Roll in Stripe Dashboard; update Worker secret; redeploy.
6. **External API keys** (`RESEND_API_KEY`, `R2_*`, AI providers) — Generate new key at provider; update; revoke old key.

### Post-Rotation

- [ ] Redeploy (`npm run deploy` or push to `main`)
- [ ] Verify health: `curl -s https://wristnerd.site/api/health | jq .`
- [ ] Verify cron runs on next scheduled tick
- [ ] Update GitHub Actions secrets to match
- [ ] Revoke old keys/tokens at each provider
- [ ] Update `.env.example` comments if secret format changed

---

## 4. Disable Cron

**When:** A cron job is causing damage (e.g., publishing corrupt data, runaway email sends), or you need to freeze all automated operations during an incident.

### Disable a Single Cron Route

Prevent a specific cron from executing by returning early. This does not require a redeploy.

**Option A — Revoke the per-trigger secret:**

```bash
# Remove the per-trigger secret (the route will 401 on next invocation)
wrangler secret delete CRON_PUBLISH_SECRET
```

The route falls back to `CRON_SECRET`. To fully block it, also rotate `CRON_SECRET` (but this affects all cron routes).

**Option B — Cloudflare Dashboard:**

1. Workers & Pages → `affilite-mix` → **Settings → Triggers**
2. Find the cron trigger for the problematic schedule
3. **Delete** or **disable** the trigger

**Option C — Remove the schedule from `wrangler.jsonc` and redeploy:**

```bash
# Edit wrangler.jsonc — remove the specific cron entry from triggers.crons
# Then redeploy
npm run deploy
```

### Disable All Cron Jobs

```bash
# Nuclear option: revoke the shared CRON_SECRET
# All cron routes will 401 because no per-trigger or fallback secret matches
wrangler secret delete CRON_SECRET

# Or: remove all triggers from Cloudflare Dashboard
# Workers & Pages → affilite-mix → Settings → Triggers → delete all cron triggers
```

### Re-Enable Cron

```bash
# Re-set the secret(s)
wrangler secret put CRON_SECRET
# Optionally restore per-trigger secrets
wrangler secret put CRON_PUBLISH_SECRET

# If triggers were removed from Dashboard, redeploy to recreate them
npm run deploy
```

### Verification

```bash
# Manually invoke a cron route to test
curl -X POST https://wristnerd.site/api/cron/publish \
  -H "Authorization: Bearer $CRON_SECRET"
# Expected: 200 (when enabled) / 401 (when disabled)
```

---

## 5. Drain Queue

**When:** The click-tracking queue contains poison messages, or you need to stop queue processing during a Supabase outage to prevent retry storms.

### Stop Queue Processing

**Option A — Pause the consumer via Cloudflare Dashboard:**

1. [Cloudflare Dashboard](https://dash.cloudflare.com/) → **Workers & Pages** → `affilite-mix`
2. **Queues** → `click-tracking`
3. Click **Pause consumer** — messages accumulate but are not delivered

**Option B — Revoke `INTERNAL_API_TOKEN`:**

The queue consumer in `workers/custom-worker.ts` requires `INTERNAL_API_TOKEN` and `CRON_HOST` to forward batches to `/api/queue/clicks`. Removing the token causes the consumer to retry all batches (with exponential backoff up to `max_retries: 3`) then route them to the DLQ.

```bash
wrangler secret delete INTERNAL_API_TOKEN
```

**Option C — Delete the consumer binding** (last resort):

Remove the consumer entry from `wrangler.jsonc` → `queues.consumers` and redeploy. Messages remain in the queue but are not consumed.

### Drain (Discard) All Pending Messages

```bash
# Via Cloudflare API — purge the queue
curl -X POST \
  "https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/queues/click-tracking/purge" \
  -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}"
```

> **Warning:** Purging permanently discards all pending click events. Only do this if the messages are known to be corrupt or recovery is not needed.

### Resume Queue Processing

1. Re-set the `INTERNAL_API_TOKEN` secret if it was removed:
   ```bash
   wrangler secret put INTERNAL_API_TOKEN
   ```
2. Unpause the consumer in the Cloudflare Dashboard (Queues → `click-tracking` → Resume)
3. Verify messages are flowing:
   ```bash
   # Check the queue depth in Dashboard → Queues → click-tracking → Metrics
   # Or check the DLQ for failures
   ```

---

## 6. Replay Queue

**When:** Click events were lost due to a Supabase outage, consumer bug, or accidental queue purge, and you have the DLQ or log data to replay.

### Replay from Dead-Letter Queue (DLQ)

The `click-tracking-dlq` queue receives messages that failed all 3 retries. The DLQ consumer in `workers/custom-worker.ts` forwards these to `/api/queue/clicks?dlq=true` when `INTERNAL_API_TOKEN` and `CRON_HOST` are set.

1. **Ensure the DLQ consumer is active** and the target DB is healthy:

   ```bash
   curl -s -H "Authorization: Bearer $CRON_SECRET" \
     https://wristnerd.site/api/health | jq .checks.database
   # Must be "ok" before replaying
   ```

2. **Unpause the DLQ consumer** if it was paused:
   - Dashboard → Queues → `click-tracking-dlq` → Resume

3. The DLQ consumer will automatically forward batches to `/api/queue/clicks?dlq=true`. Monitor via Cloudflare Workers logs or Sentry for errors.

### Replay from Tail Worker Logs

If DLQ messages were already acked but logged via the Tail Worker:

1. Export log entries containing `[queue/click-tracking-dlq]` from your log sink (Logpush, Datadog, etc.)
2. Extract the click payloads from the log bodies
3. Re-submit them to the clicks endpoint:
   ```bash
   curl -X POST https://wristnerd.site/api/queue/clicks \
     -H "Authorization: Bearer $INTERNAL_API_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"messages": [<extracted-payloads>]}'
   ```

### Replay from R2 Backup (if available)

If click data was backed up to R2 before loss:

```bash
# Download the click backup
wrangler r2 object get backup-bucket/clicks/YYYY-MM-DD.json --file clicks.json

# Re-submit in batches of 25 (matching consumer batch size)
cat clicks.json | jq -c '.[0:25]' | \
  xargs -I{} curl -s -X POST https://wristnerd.site/api/queue/clicks \
    -H "Authorization: Bearer $INTERNAL_API_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"messages": {}}'
```

### Post-Replay Verification

```bash
# Compare expected vs actual click counts for the affected period
psql "$DATABASE_URL" -c \
  "SELECT date_trunc('hour', created_at) AS hour, count(*)
   FROM affiliate_clicks
   WHERE created_at >= '<incident-start>'
   GROUP BY 1 ORDER BY 1;"
```

---

## 7. Disable Admin User

**When:** An admin account needs to be immediately locked out — suspected compromise, terminated employee, or access policy violation.

### Via Admin API

Requires an active `super_admin` session:

```bash
# 1. List admin users to find the target user ID
curl -s https://wristnerd.site/api/admin/users \
  -H "Cookie: nh_admin_token=<your-jwt>" | jq '.[] | {id, email, role, is_active}'

# 2. Deactivate the user (set is_active = false)
curl -X PATCH https://wristnerd.site/api/admin/users \
  -H "Cookie: nh_admin_token=<your-jwt>" \
  -H "Content-Type: application/json" \
  -d '{"id": "<target-user-id>", "is_active": false}'
```

> **Safeguard:** The API prevents deactivating the last active `super_admin` (returns 409).

### Via Direct Database Update

Use when the admin panel is inaccessible or the compromised user may have changed API behavior:

```sql
-- Deactivate by email
UPDATE admin_users
SET is_active = false, updated_at = now()
WHERE email = 'compromised@example.com';

-- Verify
SELECT id, email, role, is_active FROM admin_users
WHERE email = 'compromised@example.com';
```

### Invalidate Active Sessions

Deactivating a user prevents new logins, but existing JWT sessions remain valid until they expire. To force-expire all sessions:

```bash
# Rotate JWT_SECRET — invalidates ALL admin sessions (all users must re-login)
wrangler secret put JWT_SECRET
# Redeploy for the new secret to take effect
npm run deploy
```

If you only need to invalidate one user's session without affecting others, the current architecture requires a JWT secret rotation. Track [future enhancement: per-user token revocation list].

---

## 8. Recover Hacked Admin

**When:** An admin account has been confirmed compromised — unauthorized logins detected in the audit log, unexplained content changes, or the admin reports their credentials were stolen.

### Immediate Containment (first 5 minutes)

1. **Disable the compromised account:**

   ```sql
   UPDATE admin_users
   SET is_active = false, updated_at = now()
   WHERE email = '<compromised-email>';
   ```

2. **Rotate `JWT_SECRET`** to kill all active sessions (including the attacker's):

   ```bash
   openssl rand -hex 64  # generate new secret
   wrangler secret put JWT_SECRET
   npm run deploy
   ```

3. **Check for additional compromised accounts:**

   ```sql
   -- Look for recent logins from unexpected sources
   SELECT * FROM audit_log
   WHERE action IN ('login', 'login_failed')
   AND created_at > now() - interval '7 days'
   ORDER BY created_at DESC;
   ```

4. **Disable any other suspicious accounts** found in step 3.

### Assess Damage (next 30 minutes)

5. **Review the audit log** for actions taken by the compromised account:

   ```sql
   SELECT action, resource_type, resource_id, created_at, metadata
   FROM audit_log
   WHERE admin_user_id = '<compromised-user-id>'
   AND created_at > '<estimated-compromise-start>'
   ORDER BY created_at;
   ```

6. **Check for unauthorized changes:**
   - Content published/modified: `SELECT * FROM content WHERE updated_at > '<time>' ORDER BY updated_at DESC;`
   - Products modified: `SELECT * FROM products WHERE updated_at > '<time>' ORDER BY updated_at DESC;`
   - New admin users created: `SELECT * FROM admin_users WHERE created_at > '<time>';`
   - Sites modified: `SELECT * FROM sites WHERE updated_at > '<time>';`

7. **Revert unauthorized changes:**
   - If PITR is enabled: restore the affected tables to pre-compromise state
   - If not: manually revert changes identified in step 6
   - Revalidate cache to purge any attacker-injected content:
     ```bash
     curl -X POST https://wristnerd.site/api/revalidate \
       -H "Authorization: Bearer ${CRON_SECRET}" \
       -H "Content-Type: application/json" \
       -d '{"tags": ["content", "products", "categories"]}'
     ```

### Credential Reset (next 60 minutes)

8. **Rotate all secrets** the compromised admin could have accessed. See [§ 3 Rotate Secrets](#3-rotate-secrets) for the full procedure. At minimum:
   - `JWT_SECRET` (already done in step 2)
   - `CRON_SECRET` and all `CRON_*_SECRET` values
   - `SUPABASE_SERVICE_ROLE_KEY` (if the admin had access to Cloudflare env vars)
   - `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET`
   - Any API keys visible in the Cloudflare Dashboard

9. **Reset the compromised user's password** (only after the account owner's identity is re-verified):

   ```sql
   -- Generate a new bcrypt hash (use the app's password hashing, not raw SQL)
   -- Re-enable the account after the owner sets a new password via the admin UI
   UPDATE admin_users
   SET is_active = true, password_hash = '<new-hash>', updated_at = now()
   WHERE email = '<compromised-email>';
   ```

10. **Re-enroll TOTP** if the compromised account had 2FA:
    ```sql
    UPDATE admin_users
    SET totp_secret = NULL, totp_enabled = false, totp_verified_at = NULL,
        totp_failed_attempts = 0, totp_locked_until = NULL, updated_at = now()
    WHERE email = '<compromised-email>';
    ```
    The user must re-enroll TOTP on next login.

### Post-Incident

11. **File a post-mortem** documenting:
    - How the compromise occurred (phishing, credential reuse, leaked `.env`, etc.)
    - Timeline of attacker actions (from audit log)
    - Data affected and recovery actions taken
    - Prevention measures (enforce TOTP, rotate secrets on schedule, audit log monitoring)

12. **Enforce TOTP on all admin accounts** if not already required.

13. **Review access recertification** — see [access-recertification.md](./access-recertification.md).

---

## Quick Reference

| Procedure                 | Key Command                                      | Recovery Time |
| ------------------------- | ------------------------------------------------ | ------------- |
| Restore DB (PITR)         | Supabase Dashboard → Backups → Point in Time     | 5–30 min      |
| Restore DB (full rebuild) | `supabase db push` + `pg_restore`                | 2–4 hours     |
| Rollback Worker           | Dashboard → Deployments → Rollback               | ~30 sec       |
| Rotate all secrets        | `wrangler secret put <NAME>` × N + redeploy      | ~15 min       |
| Disable cron (single)     | `wrangler secret delete CRON_<TRIGGER>_SECRET`   | Immediate     |
| Disable cron (all)        | `wrangler secret delete CRON_SECRET`             | Immediate     |
| Drain queue               | Dashboard → Queues → Pause / Purge               | Immediate     |
| Replay DLQ                | Unpause `click-tracking-dlq` consumer            | Auto          |
| Disable admin             | `PATCH /api/admin/users` with `is_active: false` | Immediate     |
| Force-expire sessions     | `wrangler secret put JWT_SECRET` + redeploy      | ~5 min        |
