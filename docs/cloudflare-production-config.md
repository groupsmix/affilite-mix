# Cloudflare Production Configuration

> **Due Diligence Artifact (E2-05)**
> **Last Updated:** 2026-06-12
> **Purpose:** Document Cloudflare production configuration for due diligence

## Account & Zone

| Property       | Value                                                   | Source               |
| -------------- | ------------------------------------------------------- | -------------------- |
| **Account ID** | Stored in GitHub Actions secret `CLOUDFLARE_ACCOUNT_ID` | `docs/CLOUDFLARE.md` |
| **Zone**       | `wristnerd.xyz`                                         | `docs/CLOUDFLARE.md` |
| **Zone ID**    | Stored in GitHub Actions secret `CLOUDFLARE_ZONE_ID`    | `docs/CLOUDFLARE.md` |
| **Plan**       | Free                                                    | `docs/CLOUDFLARE.md` |
| **Worker**     | `affilite-mix`                                          | `docs/CLOUDFLARE.md` |

## Custom Domains (IaC Managed)

**Status:** Migrated to Infrastructure-as-Code (E2-05 fix)

| Domain                      | Type       | Terraform Resource                                           | Status |
| --------------------------- | ---------- | ------------------------------------------------------------ | ------ |
| `wristnerd.xyz`             | Apex       | `cloudflare_workers_custom_domain.wristnerd_xyz`             | ✅ IaC |
| `arabictools.wristnerd.xyz` | Subdomain  | `cloudflare_workers_custom_domain.arabictools_wristnerd_xyz` | ✅ IaC |
| `crypto.wristnerd.xyz`      | Subdomain  | `cloudflare_workers_custom_domain.crypto_wristnerd_xyz`      | ✅ IaC |
| `cryptoranked.xyz`          | Standalone | `cloudflare_workers_custom_domain.cryptoranked_xyz`          | ✅ IaC |

**Excluded:** `compareai.site` - externally-managed DNS records (see `terraform/cloudflare/externally-managed-domains.tf`)

**Terraform File:** `terraform/cloudflare/worker-domains.tf`

## WAF Rules (IaC Managed)

**Status:** Fully source-controlled via Terraform

| Ruleset                | Description                                                    | Terraform Resource               |
| ---------------------- | -------------------------------------------------------------- | -------------------------------- |
| WAF Custom Block Rules | Hard-block OFAC-sanctioned countries, challenge high-risk ASNs | `cloudflare_ruleset.waf_custom`  |
| WAF Managed Rulesets   | Cloudflare Managed Rules + OWASP Core Ruleset                  | `cloudflare_ruleset.waf_managed` |

**Blocked Countries:** KP, IR, SY, CU, RU, BY, MM, VE, SD (OFAC sanctioned)
**Terraform File:** `terraform/cloudflare/main.tf`

## Rate Limiting Rules (IaC Managed)

**Status:** Fully source-controlled via Terraform

| Ruleset                    | Description    | Limit       | Terraform Resource                   |
| -------------------------- | -------------- | ----------- | ------------------------------------ |
| Rate Limit Auth Endpoints  | `/api/auth/*`  | 20 req/60s  | `cloudflare_ruleset.rate_limit_auth` |
| Rate Limit API Endpoints   | `/api/track/*` | 100 req/60s | `cloudflare_ruleset.rate_limit_api`  |
| Rate Limit Admin Endpoints | `/api/admin/*` | 30 req/60s  | `cloudflare_ruleset.rate_limit_api`  |
| Rate Limit Cron Endpoints  | `/api/cron/*`  | 10 req/60s  | `cloudflare_ruleset.rate_limit_api`  |

**Terraform File:** `terraform/cloudflare/main.tf`

## Cache Rules (IaC Managed)

**Status:** Fully source-controlled via Terraform

| Rule        | Description                     | Terraform Resource               |
| ----------- | ------------------------------- | -------------------------------- |
| Cache Rules | Bypass cache on `/api/*` routes | `cloudflare_ruleset.cache_rules` |

**Terraform File:** `terraform/cloudflare/main.tf`

## Zone Security Settings (IaC Managed)

**Status:** Fully source-controlled via Terraform

| Setting          | Value             | Terraform Resource                         |
| ---------------- | ----------------- | ------------------------------------------ |
| Always Use HTTPS | On                | `cloudflare_zone_setting.always_use_https` |
| Min TLS Version  | 1.3               | `cloudflare_zone_setting.min_tls_version`  |
| TLS 1.3          | On                | `cloudflare_zone_setting.tls_1_3`          |
| Security Level   | High              | `cloudflare_zone_setting.security_level`   |
| Browser Check    | On                | `cloudflare_zone_setting.browser_check`    |
| Bot Fight Mode   | On                | `cloudflare_zone_setting.bot_fight_mode`   |
| HSTS             | Enabled (preload) | `cloudflare_zone_setting.security_header`  |

**Terraform File:** `terraform/cloudflare/main.tf`

## Load Balancer (IaC Managed)

**Status:** Fully source-controlled via Terraform

| Component            | Description                | Terraform Resource                              |
| -------------------- | -------------------------- | ----------------------------------------------- |
| Health Check         | Worker origin health check | `cloudflare_healthcheck.worker_origin`          |
| Load Balancer        | DR failover load balancer  | `cloudflare_load_balancer.dr_failover`          |
| Worker Origin Pool   | Primary origin pool        | `cloudflare_load_balancer_pool.worker_origin`   |
| Static Fallback Pool | Fallback pool for DR       | `cloudflare_load_balancer_pool.static_fallback` |

**Terraform File:** `terraform/cloudflare/main.tf`

## Logpush (IaC Managed)

**Status:** Fully source-controlled via Terraform

| Component   | Description                      | Terraform Resource                   |
| ----------- | -------------------------------- | ------------------------------------ |
| Worker Logs | Workers trace events Logpush job | `cloudflare_logpush_job.worker_logs` |

**Fields:** Event, EventTimestampMs, Outcome, Exceptions (PII redacted)
**Terraform File:** `terraform/cloudflare/main.tf`

## Blind Spots (Dashboard-Only Configuration)

The following configuration items are managed via the Cloudflare Dashboard and are not source-controlled:

1. **Cloudflare Access (Zero Trust)** - Admin segment protection (see `terraform/cloudflare/access.tf` for partial IaC)
2. **Notification Destinations** - Email, PagerDuty, webhook destinations for alerts (see `terraform/cloudflare/alerts.tfvars.example`)
3. **Analytics Engine** - Custom metrics configuration
4. **Turnstile** - Site keys and widget configuration
5. **Images** - Image optimization settings (if using Cloudflare Images)
6. **Email Routing** - Email routing rules (if configured)
7. **Workers KV/Durable Objects** - Namespace creation (managed via wrangler CLI)

## References

- `docs/CLOUDFLARE.md` - Complete Cloudflare configuration reference
- `docs/cloudflare-production.md` - Step-by-step zone security & performance toggles
- `docs/cloudflare-evidence.md` - Control-by-control audit checklist
- `terraform/cloudflare/main.tf` - Zone settings, WAF, rate limiting, cache rules
- `terraform/cloudflare/worker-domains.tf` - Custom domains (newly created)
- `terraform/cloudflare/alerts.tf` - Alerting policies
- `terraform/cloudflare/access.tf` - Cloudflare Access configuration
