# Runbook: Cloudflare Zone Incident

**Severity:** P0/P1 — depending on scope
**Owner:** Platform team
**Last reviewed:** 2026-05-25

## Overview

affilite-mix is deployed on Cloudflare (Workers, R2, DNS). This runbook covers incidents where a Cloudflare zone becomes degraded or unavailable, including DNS outages, Workers failures, and edge configuration issues.

## Symptoms

- Sites returning 5xx errors from Cloudflare edge
- DNS resolution failures for custom domains
- Workers returning "Script not found" or "Worker threw exception"
- R2 returning 503 or timeout errors
- Cloudflare status page shows incident for your region

## Triage

### 1. Check Cloudflare Status

```bash
# Check Cloudflare system status
curl -s https://www.cloudflarestatus.com/api/v2/status.json | jq '.status'

# Check specific component status
curl -s https://www.cloudflarestatus.com/api/v2/components.json \
  | jq '.components[] | select(.name | test("Workers|DNS|CDN")) | {name, status}'
```

### 2. Check Zone Health

```bash
# Zone status
curl -s -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/zones/$ZONE_ID" \
  | jq '.result | {name, status, paused}'

# DNS records
curl -s -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records" \
  | jq '.result[] | {name, type, content, proxied}'
```

### 3. Check Workers Status

```bash
# List deployed Workers
wrangler deployments list

# Check Worker logs (last 10 minutes)
wrangler tail --format json | head -100
```

## Mitigation Procedures

### Scenario A: Cloudflare Global Outage

1. **Wait for Cloudflare to resolve** — there is no self-serve mitigation for a global outage
2. Monitor https://www.cloudflarestatus.com for updates
3. Post status update to users via backup channel (email, social media)
4. If outage exceeds SLA, prepare failover (see Scenario D)

### Scenario B: Workers Script Error

```bash
# 1. Check recent deployments
wrangler deployments list

# 2. If recent deployment caused the issue, rollback
wrangler rollback

# 3. Check Worker logs for error details
wrangler tail --format json 2>&1 | grep '"outcome":"exception"'

# 4. If rollback doesn't fix, check wrangler.toml configuration
cat workers/wrangler.toml
```

### Scenario C: DNS Propagation Issue

```bash
# 1. Verify DNS resolution from multiple locations
dig +short example.com @1.1.1.1
dig +short example.com @8.8.8.8
dig +short example.com @9.9.9.9

# 2. Check if zone is paused
curl -s -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/zones/$ZONE_ID" \
  | jq '.result.paused'

# 3. Verify nameservers
dig +short NS example.com

# 4. If nameservers are wrong, contact domain registrar
```

### Scenario D: Extended Outage — Failover

If Cloudflare outage exceeds 30 minutes and impacts users:

1. **Pause Cloudflare proxy** (DNS-only mode):
   ```bash
   # Switch critical records to DNS-only (gray cloud)
   curl -X PATCH -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"proxied": false}' \
     "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records/$RECORD_ID"
   ```
2. Traffic will route directly to origin (Vercel) without Cloudflare edge
3. **Caveats:** No WAF, no caching, no Workers processing
4. **Re-enable** Cloudflare proxy once incident is resolved

### Scenario E: R2 Storage Outage

```bash
# 1. Check R2 bucket status
wrangler r2 bucket list

# 2. Check if objects are accessible
wrangler r2 object get affilite-mix-assets/test-object.txt

# 3. If R2 is down, static assets may fail to load
#    Mitigation: Cloudflare CDN cache may serve stale copies
#    Long-term: Consider multi-region R2 replication
```

## Communication

1. **Internal:** Post in #platform-incidents with severity and ETA
2. **External:** If user-facing impact > 5 minutes, update status page
3. **Post-incident:** Schedule post-mortem within 48 hours

## Post-Incident Checklist

- [ ] All sites returning 200 on health check endpoints
- [ ] DNS resolving correctly for all custom domains
- [ ] Workers processing requests without errors
- [ ] R2 assets loading correctly
- [ ] Monitoring dashboards back to baseline
- [ ] Terraform state matches actual configuration
- [ ] Post-mortem scheduled and assigned
- [ ] Incident documented in runbook improvements (if applicable)
