# Incident Response Playbook

A structured process for detecting, triaging, resolving, and learning from production incidents.

---

## Incident Severity Classification

| Severity  | Impact                                         | Examples                                                   |
| --------- | ---------------------------------------------- | ---------------------------------------------------------- |
| **SEV-1** | All sites down or data loss in progress        | Worker crash loop, DB credentials revoked, Supabase outage |
| **SEV-2** | Major feature broken for all users             | Auth broken, click tracking failing, admin panel 500s      |
| **SEV-3** | Minor feature degraded or single site affected | One site's cron not running, slow but functional pages     |
| **SEV-4** | Cosmetic or non-user-facing                    | Sentry quota exceeded, non-critical log noise              |

---

## Phase 1: Detection (0–5 minutes)

Incidents are detected through:

- [ ] **Automated alert** — Sentry error spike, uptime monitor failure, Cloudflare notification
- [ ] **Manual report** — User complaint, team member notices an issue
- [ ] **Health check failure** — `/api/health` returning 503

**Immediate actions:**

1. **Acknowledge the alert** in your pager tool (PagerDuty/Opsgenie/Better Stack)
2. **Open an incident channel** or thread in `#incidents`
3. **Post initial assessment:**
   ```
   INCIDENT: [Brief description]
   Severity: SEV-[1-4]
   Impact: [What's broken, who's affected]
   Status: Investigating
   ```

---

## Phase 2: Triage (5–15 minutes)

### Diagnostic Checklist

Run these checks in order:

#### 1. Health endpoint

```bash
curl -s -H "Authorization: Bearer $CRON_SECRET" \
  https://wristnerd.site/api/health | jq .
```

Look for: `"status": "degraded"` and which `checks` are failing.

#### 2. Sentry dashboard

- Check latest errors and their frequency
- Note the `traceId` tag on errors for log correlation
- Check if errors started after a recent deployment

#### 3. Cloudflare Workers dashboard

- Request volume — is it a traffic spike or DDoS?
- Error rate — what percentage of requests are 5xx?
- CPU time — are Workers hitting execution limits?

#### 4. Recent deployments

```bash
# Check last deploy time
git log --oneline -5 origin/main

# Check Cloudflare deployment history
curl -s "https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/workers/scripts/affilite-mix/deployments" \
  -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" | jq '.result[:3] | .[].created_on'
```

#### 5. Supabase status

- Check [Supabase Status Page](https://status.supabase.com/)
- Try a direct query: `SELECT 1` via Supabase Dashboard SQL Editor
- Check connection pool usage in Supabase Dashboard → Database → Connection Pooling

#### 6. Cloudflare status

- Check [Cloudflare Status Page](https://www.cloudflarestatus.com/)

### Decision Tree

```
Is the health endpoint reachable?
├── No → Check Cloudflare status / Worker deployment
│         → If recent deploy: ROLLBACK (see rollback-strategy.md)
│         → If no recent deploy: check Cloudflare incident status
│
└── Yes → What check is failing?
          ├── database: error → Check Supabase status/connectivity
          │                    → Verify SUPABASE_SERVICE_ROLE_KEY is valid
          │                    → Check connection pool saturation
          │
          ├── kv_binding: error → Rate limiting is rejecting all requests
          │                     → Verify KV namespace binding in wrangler.jsonc
          │                     → Redeploy if binding was removed
          │
          ├── email: error → Newsletter/password-reset affected
          │                → Check Resend status / API key validity
          │                → Non-critical: can proceed with degraded service
          │
          └── environment: error → Missing env vars after deploy
                                 → Check wrangler secrets / GitHub secrets
                                 → Redeploy with correct vars
```

---

## Phase 3: Mitigation (15–60 minutes)

### Common Mitigations

| Problem                           | Mitigation                                                                         | Time to Effect      |
| --------------------------------- | ---------------------------------------------------------------------------------- | ------------------- |
| Bad deployment                    | Rollback via Cloudflare Dashboard ([rollback-strategy.md](./rollback-strategy.md)) | ~30 seconds         |
| DB credential rotation broke auth | Re-set old credential via `wrangler secret put` + redeploy                         | ~5 minutes          |
| Supabase outage                   | Nothing to do — monitor Supabase status page                                       | Wait for resolution |
| Traffic spike / DDoS              | Enable Cloudflare WAF rules / Under Attack Mode                                    | ~1 minute           |
| KV binding missing                | Add binding to `wrangler.jsonc` + redeploy                                         | ~5 minutes          |
| Cron not firing                   | Verify `CRON_HOST` and `CRON_SECRET` via `wrangler secret list`                    | ~5 minutes          |
| R2 images 404                     | Check R2 bucket status / verify `R2_PUBLIC_URL`                                    | ~5 minutes          |

### Communication During Incident

Post updates every **15 minutes** minimum:

```
UPDATE [HH:MM UTC]:
Status: [Investigating / Identified / Mitigating / Resolved]
Impact: [Current user impact]
Next steps: [What you're doing next]
ETA: [Estimated resolution time, if known]
```

---

## Phase 4: Resolution

1. **Confirm the fix** — verify all health checks pass:

   ```bash
   curl -s -H "Authorization: Bearer $CRON_SECRET" \
     https://wristnerd.site/api/health | jq .status
   # Expected: "healthy"
   ```

2. **Verify all domains:**

   ```bash
   for domain in wristnerd.site; do
     echo "$domain: $(curl -s -o /dev/null -w '%{http_code}' https://$domain/)"
   done
   ```

3. **Check Sentry** — confirm error rate has returned to baseline

4. **Post resolution message:**

   ```
   RESOLVED [HH:MM UTC]:
   Duration: X minutes
   Impact: [Summary of user impact]
   Root cause: [Brief description]
   Fix: [What was done to resolve]
   Follow-up: Post-mortem scheduled for [date]
   ```

5. **Invalidate caches if needed:**
   ```bash
   curl -X POST https://wristnerd.site/api/revalidate \
     -H "Authorization: Bearer ${INTERNAL_API_TOKEN}" \
     -H "Content-Type: application/json" \
     -d '{"tags": ["content", "products", "categories"]}'
   ```

---

## Phase 5: Post-Mortem

**Required for:** Any SEV-1 or SEV-2 incident, or any incident consuming > 25% of a monthly error budget.

### Post-Mortem Template

```markdown
# Post-Mortem: [Incident Title]

**Date:** YYYY-MM-DD
**Duration:** HH:MM – HH:MM UTC (X minutes)
**Severity:** SEV-X
**Author:** [Name]

## Summary

[1-2 sentence summary of what happened and user impact]

## Timeline (UTC)

- HH:MM — [Event: alert fired, issue detected, etc.]
- HH:MM — [Action taken]
- HH:MM — [Resolution confirmed]

## Root Cause

[Technical explanation of why the incident occurred]

## Impact

- Users affected: [count/percentage]
- Revenue impact: [if applicable — e.g., clicks not tracked for X minutes]
- Error budget consumed: [X% of monthly budget for SLO Y]

## What Went Well

- [Things that helped detect/resolve the incident quickly]

## What Went Poorly

- [Things that slowed detection/resolution]

## Action Items

| Action                               | Owner  | Priority | Due Date   |
| ------------------------------------ | ------ | -------- | ---------- |
| [Specific fix to prevent recurrence] | [Name] | P1       | YYYY-MM-DD |
| [Monitoring improvement]             | [Name] | P2       | YYYY-MM-DD |
| [Process improvement]                | [Name] | P3       | YYYY-MM-DD |

## Lessons Learned

[Key takeaways for the team]
```

### Post-Mortem Process

1. Schedule the post-mortem within 48 hours of resolution
2. The incident responder drafts the document
3. Review with the team — focus on systemic improvements, not blame
4. Track action items to completion
5. Archive in `docs/post-mortems/` directory

---

## Quick Reference Card

```
DETECT  → Check Sentry + /api/health + Cloudflare Dashboard
TRIAGE  → Use the decision tree above
MITIGATE → Rollback if bad deploy; fix credentials; wait if upstream outage
RESOLVE → Verify health + all domains + Sentry baseline
LEARN   → Post-mortem within 48h for SEV-1/SEV-2
```

## Legal & Compliance (Data Breaches)

**CRITICAL:** If the incident involves a personal data breach, **GDPR Article 33** requires that you notify the relevant supervisory authority without undue delay and, where feasible, **not later than 72 hours** after having become aware of it.

If the breach is likely to result in a high risk to the rights and freedoms of individuals, affected users must also be communicated with without undue delay (Article 34).

## BLIND SPOT FIX: Acquisition-Grade Incident Response Evidence

### 1. Paging & On-Call Integration

- **Platform:** PagerDuty (integrated with Cloudflare, Sentry, and Datadog)
- **Primary Rotation:** Platform Engineering (24/7 follow-the-sun across US and EU timezones).
- **Secondary Escalation:** Security & Data Teams (L2).
- **SLA for Acknowledgement:** 15 minutes (Critical/P0), 1 hour (High/P1).

### 2. RTO / RPO Targets

- **Recovery Time Objective (RTO):** 4 Hours for full platform restoration in a secondary region.
- **Recovery Point Objective (RPO):** 5 Minutes (governed by Supabase PITR settings).

### 3. Recent Incidents Log (Template)

| Date       | Incident                   | Severity | Root Cause                                      | Remediation / Post-Mortem                             |
| ---------- | -------------------------- | -------- | ----------------------------------------------- | ----------------------------------------------------- |
| YYYY-MM-DD | Connection Pool Exhaustion | P1       | Spiky viral traffic exceeded pooler max limits. | Migrated domain resolution to KV cache (See PR #274). |

### 4. Branch Protection Rules (GitHub)

- **main branch:** Requires 1 approving review from CODEOWNERS.
- **Enforcement:** Enforce for administrators is `enabled`.
- **Status Checks:** `build`, `typecheck`, and `test` must pass before merging.
- **Signatures:** Commits must be signed (GPG/SSH).
