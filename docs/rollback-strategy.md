# Rollback Strategy

This document describes how to identify a bad deployment, roll back to a previous version, and restore service for Affilite-Mix on Cloudflare Workers.

---

## Architecture Overview

Affilite-Mix is deployed to **Cloudflare Workers** via `@opennextjs/cloudflare`. Each deployment creates a new Worker version. Cloudflare retains previous versions, allowing quick rollback via the dashboard or API.

**Key components:**

- **Worker:** `affilite-mix` (runs the Next.js app)
- **KV Namespace:** `RATE_LIMIT_KV` (rate limiting counters)
- **R2 Bucket:** `next-inc-cache` (ISR cache)
- **Cron Trigger:** Every 5 minutes (scheduled publishing)
- **Database:** Supabase (external, not affected by Worker rollbacks)

---

## 1. Identifying a Bad Deployment

### Automated Signals

- **Sentry:** Error rate spike after deployment (configure Sentry alerts for >10 errors/minute).
- **Health endpoint:** `GET /api/health` returns `503` or fails to respond.
- **Cloudflare Analytics:** Spike in 5xx error rate in the Workers dashboard.
- **Uptime monitoring:** External uptime checks (e.g., Better Stack, UptimeRobot) report downtime for production domains.

### Manual Checks

After every deployment, verify:

1. **Health check:**

   ```bash
   curl -s https://wristnerd.xyz/api/health | jq .
   ```

   Expected: `{ "status": "healthy", "checks": { "database": { "status": "ok" } } }`

2. **Homepage loads:**

   ```bash
   curl -s -o /dev/null -w "%{http_code}" https://wristnerd.xyz/
   ```

   Expected: `200`

3. **Admin login page:**

   ```bash
   curl -s -o /dev/null -w "%{http_code}" https://wristnerd.xyz/admin/login
   ```

   Expected: `200`

4. **All site domains respond:**
   ```bash
   for domain in wristnerd.xyz arabictools.wristnerd.site crypto.wristnerd.site; do
     echo "$domain: $(curl -s -o /dev/null -w '%{http_code}' https://$domain/)"
   done
   ```

---

## 2. Rollback via Cloudflare Dashboard

**Time to rollback:** ~30 seconds

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/) > **Workers & Pages** > `affilite-mix`.
2. Click the **Deployments** tab.
3. Find the last known-good deployment (before the bad one).
4. Click the **three-dot menu** (⋮) next to that deployment.
5. Select **Rollback to this deployment**.
6. Confirm the rollback.

The previous version is restored immediately across all edge locations.

---

## 3. Rollback via Cloudflare API

For scripted or emergency rollbacks:

```bash
# List recent deployments
curl -s "https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/workers/scripts/affilite-mix/deployments" \
  -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" | jq '.result[] | {id, created_on}'

# Rollback to a specific deployment
curl -X POST "https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/workers/scripts/affilite-mix/deployments/${DEPLOYMENT_ID}/rollback" \
  -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}"
```

---

## 4. Rollback via Git Revert

If the issue is in the code and you want a permanent fix (not just a temporary rollback):

```bash
# Find the bad commit
git log --oneline -10

# Revert the bad commit(s)
git revert <bad-commit-sha>

# Push to main to trigger a new deployment
git push origin main
```

This triggers the CI/CD pipeline and deploys a corrected version.

---

## 5. Database Rollback

Worker rollbacks do **not** affect the Supabase database. If a bad deployment included a schema migration that needs reversal:

1. **Do not** roll back the Worker until the database is fixed (the old Worker version may not work with the new schema).
2. Write a reverse migration SQL script.
3. Apply it via the Supabase SQL Editor.
4. Then roll back the Worker if needed.

**Prevention:** Always make database migrations backwards-compatible. Add new columns as nullable, don't rename or drop columns in the same deploy as code changes.

---

## 6. Cache Invalidation After Rollback

After rolling back, the ISR cache in R2 may contain stale data from the bad deployment:

```bash
# Trigger full cache revalidation
curl -X POST https://wristnerd.xyz/api/revalidate \
  -H "Authorization: Bearer ${CRON_SECRET}" \
  -H "Content-Type: application/json" \
  -d '{"tags": ["content", "products", "categories"]}'
```

---

## 7. Communication Template

When a bad deployment is detected, notify stakeholders:

```
Subject: [Incident] Bad deployment detected — rolling back

What happened: Deployment at [TIME] introduced [ISSUE DESCRIPTION].
Impact: [e.g., 5xx errors on all sites, admin panel inaccessible].
Action taken: Rolled back to deployment [ID] at [TIME].
Current status: All sites restored and functioning normally.
Root cause: [To be determined / brief description].
Next steps: [Fix will be deployed after review and testing].
```

---

## Blue/Green Deployment (Future Enhancement)

For zero-downtime deployments, consider using Cloudflare Workers **Gradual Rollouts**:

1. Deploy the new version to a percentage of traffic (e.g., 10%).
2. Monitor error rates and performance.
3. Gradually increase to 100% if healthy.
4. If issues are detected, instantly route 100% back to the old version.

This can be configured in the Cloudflare dashboard under **Workers > Settings > Gradual Rollouts** or via the API.
