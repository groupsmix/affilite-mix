# Cloudflare Production Settings — Zone & Worker Toggles

Required and optional Cloudflare Dashboard settings for the `wristnerd.xyz` zone, with direct links and verification commands.

> **Audience:** Account owner / DevOps
> **Last updated:** April 2026

---

## How to Use This Document

Each setting is marked:

- **REQUIRED** — must be configured for production security/correctness
- **RECOMMENDED** — strongly advised; skip only with a documented reason
- **OPTIONAL** — nice-to-have; enable based on your plan and needs

After applying changes, run the [verification script](#verification) at the bottom to confirm.

---

## SSL/TLS (REQUIRED)

> Dashboard: [SSL/TLS > Overview](https://dash.cloudflare.com/?to=/:account/:zone/ssl-tls)

### T15. SSL Mode → Full (Strict)

| Setting  | Value             | Why                                                                                                                                                                            |
| -------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| SSL Mode | **Full (Strict)** | Validates the origin certificate. Prevents MITM between Cloudflare and the origin. Since the worker IS the origin, this ensures Cloudflare validates its own edge certificate. |

**Dashboard path:** SSL/TLS > Overview > Your SSL/TLS encryption mode > **Full (Strict)**

```bash
# Verify via API
curl -s "https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/settings/ssl" \
  -H "Authorization: Bearer ${API_TOKEN}" | jq '.result.value'
# Expected: "strict"
```

### T16. Always Use HTTPS → ON

| Setting          | Value  | Why                                                                                                                       |
| ---------------- | ------ | ------------------------------------------------------------------------------------------------------------------------- |
| Always Use HTTPS | **ON** | 301-redirects all HTTP requests to HTTPS. Without this, a user visiting `http://wristnerd.xyz` gets a plaintext response. |

**Dashboard path:** SSL/TLS > Edge Certificates > Always Use HTTPS > **ON**

```bash
curl -s "https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/settings/always_use_https" \
  -H "Authorization: Bearer ${API_TOKEN}" | jq '.result.value'
# Expected: "on"
```

### T17. Minimum TLS Version → 1.2

| Setting             | Value   | Why                                                                               |
| ------------------- | ------- | --------------------------------------------------------------------------------- |
| Minimum TLS Version | **1.2** | TLS 1.0 and 1.1 have known vulnerabilities. All modern browsers support TLS 1.2+. |

**Dashboard path:** SSL/TLS > Edge Certificates > Minimum TLS Version > **TLS 1.2**

```bash
curl -s "https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/settings/min_tls_version" \
  -H "Authorization: Bearer ${API_TOKEN}" | jq '.result.value'
# Expected: "1.2"
```

---

## HSTS (REQUIRED)

> Dashboard: [SSL/TLS > Edge Certificates](https://dash.cloudflare.com/?to=/:account/:zone/ssl-tls/edge-certificates)

### T18. HTTP Strict Transport Security → ON

| Setting            | Value                  |
| ------------------ | ---------------------- |
| Enable HSTS        | **ON**                 |
| Max Age            | **63072000** (2 years) |
| Include Subdomains | **ON**                 |
| Preload            | **ON**                 |
| No-Sniff           | **ON**                 |

**Dashboard path:** SSL/TLS > Edge Certificates > HTTP Strict Transport Security (HSTS) > **Enable** > configure all fields

**Why:** Edge HSTS is defense-in-depth. Even if the Next.js response headers are misconfigured, Cloudflare will always send the HSTS header. The `preload` flag allows submission to the [HSTS Preload List](https://hstspreload.org/), which hardcodes HTTPS-only in browsers.

```bash
curl -s "https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/settings/security_header" \
  -H "Authorization: Bearer ${API_TOKEN}" | jq '.result.value'
# Expected:
# {
#   "strict_transport_security": {
#     "enabled": true,
#     "max_age": 63072000,
#     "include_subdomains": true,
#     "preload": true,
#     "nosniff": true
#   }
# }
```

---

## Security (REQUIRED)

> Dashboard: [Security](https://dash.cloudflare.com/?to=/:account/:zone/security)

### T19. WAF Managed Ruleset → ON

| Setting                    | Value                    | Why                                                                                          |
| -------------------------- | ------------------------ | -------------------------------------------------------------------------------------------- |
| Cloudflare Managed Ruleset | **ON**                   | Blocks known attack patterns (SQLi, XSS, etc.) at the edge before requests reach the worker. |
| OWASP Core Ruleset         | **ON** (if on Pro+ plan) | Additional OWASP Top 10 protection. Not available on Free plan.                              |

**Dashboard path:** Security > WAF > Managed rules > Deploy **Cloudflare Managed Ruleset**

> **Free plan limitation:** Only the Cloudflare Managed (Free) ruleset is available. OWASP requires Pro or higher.

### T20. Bot Fight Mode → ON

| Setting        | Value  | Why                                                                                                         |
| -------------- | ------ | ----------------------------------------------------------------------------------------------------------- |
| Bot Fight Mode | **ON** | Issues JavaScript challenges to automated bot traffic. Protects forms, API endpoints, and content scraping. |

**Dashboard path:** Security > Bots > Bot Fight Mode > **ON**

### T21. Rate Limiting Rules

> Dashboard: [Security > WAF > Rate limiting rules](https://dash.cloudflare.com/?to=/:account/:zone/security/waf/rate-limiting-rules)

**Free plan:** 1 rate limiting rule, 10-second period, 10-second mitigation.

| Expression                                                                                                                                                     | Requests | Period     | Mitigation | Duration   |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ---------- | ---------- | ---------- |
| `(http.request.uri.path matches "^/api/auth/.*") or (http.request.uri.path matches "^/api/newsletter/.*") or (http.request.uri.path matches "^/api/admin/.*")` | 5        | 10 seconds | Block      | 10 seconds |

**Dashboard path:** Security > WAF > Rate limiting rules > **Create rule**

> **Pro plan upgrade:** Split into separate rules with longer periods (60s) and mitigation timeouts (600s):
>
> | Path pattern        | Limit  | Period | Block duration |
> | ------------------- | ------ | ------ | -------------- |
> | `/api/auth/*`       | 5 req  | 60s    | 600s           |
> | `/api/newsletter/*` | 3 req  | 60s    | 600s           |
> | `/api/admin/*`      | 10 req | 60s    | 300s           |

---

## Performance (RECOMMENDED)

### T22. Tiered Cache → ON

> Dashboard: [Caching > Tiered Cache](https://dash.cloudflare.com/?to=/:account/:zone/caching/tiered-cache)

| Setting      | Value                    | Why                                                                                                  |
| ------------ | ------------------------ | ---------------------------------------------------------------------------------------------------- |
| Tiered Cache | **Smart Tiered Caching** | Reduces origin requests by using upper-tier data centers as a shared cache layer. Free on all plans. |

**Dashboard path:** Caching > Tiered Cache > Enable **Smart Tiered Caching Topology**

### T23. Early Hints & 0-RTT → ON

> Dashboard: [Speed > Optimization](https://dash.cloudflare.com/?to=/:account/:zone/speed/optimization)

| Setting     | Value  | Why                                                                                                                    |
| ----------- | ------ | ---------------------------------------------------------------------------------------------------------------------- |
| Early Hints | **ON** | Sends `103 Early Hints` responses so browsers can preload assets before the full response arrives.                     |
| 0-RTT       | **ON** | Allows TLS 1.3 zero round-trip resumption for returning visitors. Minor replay risk (safe for GET-only static assets). |

**Dashboard path:**

- Early Hints: Speed > Optimization > Content Optimization > **Early Hints** > ON
- 0-RTT: Speed > Optimization > Protocol Optimization > **0-RTT Connection Resumption** > ON

### T24. Cache Rules

> Dashboard: [Caching > Cache Rules](https://dash.cloudflare.com/?to=/:account/:zone/caching/cache-rules)

Create rules to control what gets cached at the edge:

**Rule 1 — Bypass cache for API and admin routes:**

| Field             | Value                                                                                              |
| ----------------- | -------------------------------------------------------------------------------------------------- |
| Name              | `Bypass API and Admin`                                                                             |
| Expression        | `(starts_with(http.request.uri.path, "/api/")) or (starts_with(http.request.uri.path, "/admin/"))` |
| Cache eligibility | **Bypass cache**                                                                                   |

**Rule 2 — Cache static assets aggressively:**

| Field             | Value                                                                                                                 |
| ----------------- | --------------------------------------------------------------------------------------------------------------------- |
| Name              | `Cache Static Assets`                                                                                                 |
| Expression        | `(http.request.uri.path.extension in {"js" "css" "png" "jpg" "jpeg" "gif" "webp" "avif" "svg" "ico" "woff" "woff2"})` |
| Cache eligibility | **Eligible for cache**                                                                                                |
| Edge TTL          | Override: **30 days**                                                                                                 |
| Browser TTL       | Override: **7 days**                                                                                                  |

### T25. Cache Reserve (OPTIONAL)

> Dashboard: [Caching > Cache Reserve](https://dash.cloudflare.com/?to=/:account/:zone/caching/cache-reserve)

| Setting       | Value             | Why                                                                                                                     |
| ------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Cache Reserve | **ON** (optional) | Stores cached content in R2 to survive edge eviction. Costs $5/month + storage. Only worthwhile for high-traffic sites. |

---

## DNS Audit (RECOMMENDED)

### T11. Verify api.wristnerd.xyz A Record

Check whether `api.wristnerd.xyz` still points to `204.168.141.220`:

```bash
dig +short api.wristnerd.xyz A
```

If this IP is unknown or no longer in use, **delete the record** to prevent dangling DNS:

**Dashboard path:** [DNS > Records](https://dash.cloudflare.com/?to=/:account/:zone/dns) > find `api` A record > Delete

---

## Apply All Settings via API (One-Shot Script)

For automated setup, run this script with a scoped API token:

```bash
#!/bin/bash
# apply-zone-settings.sh
# Requires: ZONE_ID, API_TOKEN environment variables

set -euo pipefail

API="https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/settings"
AUTH=(-H "Authorization: Bearer ${API_TOKEN}" -H "Content-Type: application/json")

echo "Applying zone security settings to wristnerd.xyz..."

# T15: SSL → Full (Strict)
curl -s -X PATCH "${API}/ssl" "${AUTH[@]}" \
  -d '{"value":"strict"}' | jq '.success'

# T16: Always Use HTTPS
curl -s -X PATCH "${API}/always_use_https" "${AUTH[@]}" \
  -d '{"value":"on"}' | jq '.success'

# T17: Minimum TLS 1.2
curl -s -X PATCH "${API}/min_tls_version" "${AUTH[@]}" \
  -d '{"value":"1.2"}' | jq '.success'

# T18: HSTS
curl -s -X PATCH "${API}/security_header" "${AUTH[@]}" \
  -d '{
    "value": {
      "strict_transport_security": {
        "enabled": true,
        "max_age": 63072000,
        "include_subdomains": true,
        "preload": true,
        "nosniff": true
      }
    }
  }' | jq '.success'

# T23: Early Hints
curl -s -X PATCH "${API}/early_hints" "${AUTH[@]}" \
  -d '{"value":"on"}' | jq '.success'

# T23: 0-RTT
curl -s -X PATCH "${API}/0rtt" "${AUTH[@]}" \
  -d '{"value":"on"}' | jq '.success'

echo "Done. Verify with: docs/cloudflare-production.md#verification"
```

> **Note:** WAF Managed Rulesets, Bot Fight Mode, Rate Limiting, Tiered Cache, and Cache Rules must be configured via the Dashboard or the Rulesets API (not the Zone Settings API).

---

## Verification

Run these commands to verify all settings are correct:

```bash
#!/bin/bash
# verify-zone-settings.sh
# Requires: ZONE_ID, API_TOKEN environment variables

set -euo pipefail

API="https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/settings"
AUTH=(-H "Authorization: Bearer ${API_TOKEN}")

echo "=== Zone Security Settings ==="

echo -n "SSL Mode: "
curl -s "${API}/ssl" "${AUTH[@]}" | jq -r '.result.value'

echo -n "Always Use HTTPS: "
curl -s "${API}/always_use_https" "${AUTH[@]}" | jq -r '.result.value'

echo -n "Min TLS Version: "
curl -s "${API}/min_tls_version" "${AUTH[@]}" | jq -r '.result.value'

echo -n "HSTS Enabled: "
curl -s "${API}/security_header" "${AUTH[@]}" | jq -r '.result.value.strict_transport_security.enabled'

echo -n "HSTS Max Age: "
curl -s "${API}/security_header" "${AUTH[@]}" | jq -r '.result.value.strict_transport_security.max_age'

echo -n "Early Hints: "
curl -s "${API}/early_hints" "${AUTH[@]}" | jq -r '.result.value'

echo -n "0-RTT: "
curl -s "${API}/0rtt" "${AUTH[@]}" | jq -r '.result.value'

echo ""
echo "=== Expected Values ==="
echo "SSL Mode:          strict"
echo "Always Use HTTPS:  on"
echo "Min TLS Version:   1.2"
echo "HSTS Enabled:      true"
echo "HSTS Max Age:      63072000"
echo "Early Hints:       on"
echo "0-RTT:             on"
```

---

## Related Documents

- [docs/CLOUDFLARE.md](./CLOUDFLARE.md) — canonical resource inventory, bindings, secrets, deploy runbook
- [docs/cloudflare-recovery.md](./cloudflare-recovery.md) — account recovery and rebuild playbook
- [docs/secrets-rotation-runbook.md](./secrets-rotation-runbook.md) — how to rotate each secret
- [docs/incident-response.md](./incident-response.md) — production incident response
