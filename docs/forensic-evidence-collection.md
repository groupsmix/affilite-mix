# Forensic Evidence Collection & End-to-End Correlation

> **A193 Remediation** — Forensic evidence collection procedures and cross-platform log correlation.
> **Prerequisite:** Immutable log storage must be operational (see `docs/log-retention-worm.md`, A188).
> **Last updated:** 2026-05-30

---

## 1. Evidence Sources

| Source               | What to Collect                                                     | How to Export                                                               | Retention                                             |
| -------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------- |
| Cloudflare Workers   | Runtime logs, request metadata, exceptions                          | Logpush → R2 bucket (automated)                                             | 365 days (WORM)                                       |
| Cloudflare Audit Log | Account-level actions (user logins, config changes, Worker deploys) | Dashboard → Audit Log → Export CSV, or API: `GET /accounts/{id}/audit_logs` | 18 months (Cloudflare retains)                        |
| GitHub Audit Log     | Org membership changes, repo access, secret access, workflow runs   | API: `gh api /orgs/groupsmix/audit-log --paginate`                          | 180 days (GitHub retains); export to R2 monthly       |
| Supabase             | Query logs (pgaudit), auth logs, connection logs                    | SQL `COPY` to CSV → upload to R2                                            | Per pgaudit config; target 365 days                   |
| Sentry               | Error events, breadcrumbs, user context                             | Sentry API: `GET /api/0/issues/{id}/events/`                                | 90 days (Sentry plan-dependent)                       |
| Stripe               | Webhook delivery logs, payment events                               | Stripe Dashboard → Developers → Events                                      | 30 days (Stripe retains); export for longer retention |
| DNS (Cloudflare)     | Zone changes, record modifications                                  | Cloudflare API: `GET /zones/{id}/dns_records`                               | Snapshot monthly to R2                                |

---

## 2. End-to-End Correlation Procedure

### 2a. Correlation Keys

Every log source includes one or more correlation identifiers:

| Source             | Correlation Key                     | Example                |
| ------------------ | ----------------------------------- | ---------------------- |
| Cloudflare Workers | `cf-ray` header, `traceId` (Sentry) | `ray=8a1b2c3d4e5f-IAD` |
| Sentry             | `traceId` tag                       | `traceId=abc123def456` |
| Supabase           | Connection PID, query timestamp     | `pid=12345`            |
| GitHub             | `@timestamp`, `actor`, `action`     | `2026-05-30T12:00:00Z` |

### 2b. Correlation Workflow

Given an incident with a known timeframe [T_start, T_end]:

1. **Start with the detection source** (e.g., Sentry alert → extract `traceId`).
2. **Search Cloudflare logs** for matching `cf-ray` or `traceId` in the same time window.
3. **Search Supabase logs** for queries from the same Worker execution (match by timestamp ± 5 seconds and source IP).
4. **Search GitHub audit log** for any config/deploy changes in [T_start - 1h, T_end] (to identify causal deployments).
5. **Search Cloudflare audit log** for account-level changes in the same window.
6. **Assemble timeline** — merge all events into a single chronological view:

```
[T-00:45] GitHub: PR #123 merged to main (actor: alice)
[T-00:30] GitHub Actions: deploy workflow completed (run_id: 456)
[T-00:00] Cloudflare: Worker deployed (version: abc123)
[T+00:05] Sentry: Error spike detected (traceId: xyz789)
[T+00:05] Cloudflare Workers: 500 errors on /api/track (cf-ray: 8a1b...)
[T+00:06] Supabase: Connection pool exhaustion (pid: 12345-12399)
```

7. **Document the timeline** in the incident post-mortem and attach as evidence to the custody log (see `docs/incident-response.md` §5 Evidence Chain-of-Custody).

---

## 3. Forensic Imaging Procedures

### 3a. Database Snapshot

```bash
# Take a point-in-time snapshot BEFORE any remediation
# Use Supabase Dashboard → Settings → Database → Backups → Create manual backup
# Record the backup ID and timestamp in the custody log
```

### 3b. R2 Log Bucket Snapshot

```bash
# Create a read-only copy of the log bucket for the incident period
wrangler r2 object list affilite-mix-audit-logs \
  --prefix "audit-logs/YYYY/MM/DD" > /tmp/evidence-manifest.txt

# Hash the manifest
sha256sum /tmp/evidence-manifest.txt
```

### 3c. Worker Version Capture

```bash
# Record the deployed Worker version at time of incident
curl -s "https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/workers/scripts/affilite-mix" \
  -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" | jq '.result.etag, .result.modified_on'
```

---

## 4. Anti-Tampering Controls

- All evidence is stored in the WORM-locked R2 bucket (COMPLIANCE mode, 365-day retention).
- Evidence files are hashed (SHA-256) at collection time; hashes are recorded in the custody log.
- The custody log itself is stored as a GitHub Issue (with full edit history) or a shared Google Doc (with version history enabled).
- No team member may delete or modify evidence without the evidence custodian's explicit authorization.

---

## 5. Related Documents

- `docs/incident-response.md` — Overall incident response playbook (includes chain-of-custody procedure in §5)
- `docs/log-retention-worm.md` — Immutable log storage configuration (A188)
- `docs/insider-risk-detection.md` — UEBA detection rules that generate the alerts to investigate (A184)
- `docs/observability-runbook.md` — Operational observability and monitoring
