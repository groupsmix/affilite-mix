# Disaster Recovery Runbook

## §1 — Supabase PITR Recovery

### When to Use

- Database corruption
- Accidental data deletion
- Failed migration that cannot be rolled back

### Procedure

1. Log into the Supabase dashboard for the production project.
2. Navigate to **Settings → Database → Backups**.
3. Select the most recent Point-in-Time Recovery (PITR) snapshot before the incident.
4. Click **Restore** and confirm.
5. Wait for the restore to complete (typically 5–15 minutes).
6. Verify data integrity by running the smoke tests:
   ```bash
   npm run test -- --filter migration-order
   ```
7. Clear Cloudflare cache: `npm run cache:purge` or via the Cloudflare dashboard.

## §2 — Regional Failover (F-INFRA-02)

### Prerequisites

- Warm-standby Supabase project provisioned in a second region.
- Daily logical backup → restore CI job running successfully.

### A191 — Warm-Standby Verification Schedule

The warm-standby must be **tested quarterly** to ensure it is actually functional and data is current:

1. **Monthly:** Verify the daily logical backup CI job completed successfully (check GitHub Actions run history).
2. **Quarterly:** Perform a full failover drill:
   - Trigger the failover procedure (§2 below) against a **staging** environment.
   - Verify data freshness: compare row counts on key tables (`click_events`, `newsletter_subscribers`, `sites`) between primary and standby.
   - Verify read-only mode works: confirm POST/PUT/PATCH/DELETE return 503.
   - Execute failback and verify full functionality restored.
   - Record the drill result in the tabletop exercise log (`docs/tabletop-exercises.md`).
3. **Acceptance criteria:** If any drill step fails, file a P1 issue and fix within 7 days. The RTO target (4 hours) is only valid if the standby is verified operational.

### Failover Procedure

1. **Assess the outage:** Check Supabase status page and confirm the primary region is down.
2. **Enable read-only mode:**

   ```bash
   wrangler secret put READ_ONLY --value "1"
   wrangler deploy
   ```

   This causes the middleware to:
   - Block all `POST`/`PUT`/`PATCH`/`DELETE` requests with `503` and a maintenance banner.
   - Route `getTenantClient()` reads to the standby project.

3. **Update DNS (if needed):**
   If the standby is in a different region, update the Supabase URL:

   ```bash
   wrangler secret put NEXT_PUBLIC_SUPABASE_URL --value "https://standby-project.supabase.co"
   wrangler deploy
   ```

4. **Verify standby data freshness:**
   Check the last successful backup restore timestamp in CI.

5. **Communicate:**
   - Post status update to users.
   - Add `X-Degraded: 1` header to responses (automatic in read-only mode).

### Failback Procedure

1. Confirm primary region is back online.
2. Sync any data that was written to standby during the outage (if any writes were allowed).
3. Remove read-only mode:
   ```bash
   wrangler secret put READ_ONLY --value "0"
   wrangler deploy
   ```
4. Restore the primary Supabase URL if changed.
5. Verify end-to-end functionality.

## §3 — Cloudflare Workers Outage

### Symptoms

- 502/503 errors from all routes
- Cloudflare status page shows Workers degradation

### Mitigation

1. If only a single region is affected, Cloudflare's global load balancing should route around it automatically.
2. For global outages, there is no immediate mitigation — Cloudflare Workers is the sole compute layer.
3. **Communication:** Update the status page and notify users.

## §4 — R2 Storage Outage

### Symptoms

- Images not loading (broken `<img>` tags)
- Upload failures in admin panel

### Mitigation

1. The app should continue to function — R2 is used for images, not core functionality.
2. Cached images on Cloudflare CDN will continue to serve.
3. New uploads will fail until R2 recovers.
4. Consider enabling the maintenance banner if the visual experience is severely degraded.

## §5 — Stripe Webhook Failures

### Symptoms

- Membership changes not processing
- Stripe dashboard shows webhook delivery failures

### Mitigation

1. Stripe retries webhooks automatically for up to 3 days.
2. Check the dead-letter queue for failed events.
3. If the webhook endpoint is down, events will queue in Stripe and be delivered when the endpoint recovers.
4. For manual reconciliation, use the Stripe dashboard to re-send specific events.

## Contact

- **On-call:** See PagerDuty schedule
- **Supabase support:** support@supabase.io
- **Cloudflare support:** Via dashboard → Support
