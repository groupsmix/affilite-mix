# Log Retention & Immutable Storage (WORM)

> **A188 Remediation** — Centralized, immutable log retention configuration.
> **Status:** Configuration documented; implementation requires Cloudflare Workers Paid plan features.
> **Priority:** ⚠️ **CRITICAL** — This is the single highest-priority infrastructure task. A184 (UEBA), A193 (forensics), A208 (purple-team MTTR), and A190 (breach notification evidence) are all blocked until this is operational. Target completion: Q3 2026.
> **Last updated:** 2026-05-30

---

## 1. Problem Statement

- Cloudflare Tail Worker log retention is ~72 hours on the free plan (`docs/ai-governance.md:75`).
- The log-shipper Tail Worker is **disabled by default** (`LOG_SHIPPER_ENABLED=true` required).
- No centralized SIEM with WORM (Write Once Read Many) retention ≥ 1 year.
- Without immutable logs, forensic investigations (A193), insider-risk detection (A184), and breach notifications (A190) lack reliable evidence.

---

## 2. Target Architecture

```
Cloudflare Workers (runtime logs)
       │
       ▼
Tail Worker (log-shipper)  ─── LOG_SHIPPER_ENABLED=true
       │
       ▼
Cloudflare R2 Bucket (immutable)
  ├── Object Lock: COMPLIANCE mode
  ├── Retention: 365 days minimum
  └── Lifecycle: Archive to Glacier-compatible tier after 90 days
       │
       ▼
SIEM Integration (optional)
  └── Pull from R2 via S3-compatible API
```

---

## 3. Implementation Steps

### Step 1: Enable Log Shipper

Set the environment variable in `wrangler.jsonc` or via Cloudflare Dashboard:

```
LOG_SHIPPER_ENABLED=true
```

Verify by checking Tail Worker invocations in the Cloudflare Dashboard after deployment.

### Step 2: Configure R2 Bucket with Object Lock

```bash
# Create the bucket with object lock enabled (must be set at creation time)
wrangler r2 bucket create affilite-mix-audit-logs --jurisdiction eu

# Enable object lock (via Cloudflare API — not yet available in wrangler CLI)
curl -X PUT "https://api.cloudflare.com/client/v4/accounts/{account_id}/r2/buckets/affilite-mix-audit-logs/lock" \
  -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"enabled": true}'

# Set default retention (365 days, COMPLIANCE mode — cannot be shortened)
curl -X PUT "https://api.cloudflare.com/client/v4/accounts/{account_id}/r2/buckets/affilite-mix-audit-logs/retention" \
  -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"mode": "COMPLIANCE", "period": {"days": 365}}'
```

### Step 3: Configure Log Shipper Destination

Update the Tail Worker configuration to ship logs to the R2 bucket:

- Partition logs by date: `audit-logs/YYYY/MM/DD/HH-mm-{uuid}.json.gz`
- Include: request metadata, response status, Worker exceptions, authentication events, admin API calls.
- Exclude: response bodies, PII (apply scrubbing rules before storage).

### Step 4: Verify

1. Trigger a test admin action.
2. Wait 60 seconds.
3. Check R2 bucket for the log entry:
   ```bash
   wrangler r2 object list affilite-mix-audit-logs --prefix "audit-logs/$(date +%Y/%m/%d)"
   ```

---

## 4. Retention Policy

| Log Type                              | Minimum Retention | Storage Tier                                 | Justification                           |
| ------------------------------------- | ----------------- | -------------------------------------------- | --------------------------------------- |
| Security events (auth, admin, errors) | 365 days          | R2 COMPLIANCE lock                           | SOC 2 CC7.2, PCI 10.5, breach forensics |
| Application logs (non-security)       | 90 days           | R2 standard                                  | Debugging, performance analysis         |
| SBOM attestations                     | 3 years           | R2 + Sigstore (see `docs/sbom-retention.md`) | NTIA SBOM, supply-chain audit           |

---

## 5. Dependencies

- **A184 (UEBA):** Insider-risk detection rules require centralized logs from this pipeline.
- **A193 (Forensics):** Immutable logs enable tamper-proof forensic evidence.
- **A208 (Purple-team MTTR):** SIEM-based metrics require this log pipeline.

---

## 6. Action Items

- [ ] Enable `LOG_SHIPPER_ENABLED=true` in production Worker configuration
- [ ] Create R2 bucket with object lock (COMPLIANCE mode, 365-day retention)
- [ ] Configure Tail Worker to ship to R2 with the partitioning scheme above
- [ ] Set up R2 lifecycle policy (archive after 90 days)
- [ ] Verify end-to-end log flow with a test event
- [ ] Evaluate SIEM integration (Datadog, Elastic, or self-hosted) for query/alert capabilities
