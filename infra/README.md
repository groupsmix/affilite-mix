# Infrastructure as Code — Affilite-Mix

This directory contains Terraform configurations for provisioning and managing the Cloudflare infrastructure that powers Affilite-Mix.

## What's Managed by Terraform

| Resource       | Description                                                               |
| -------------- | ------------------------------------------------------------------------- |
| KV Namespace   | `RATE_LIMIT_KV` — distributed rate-limiting counters                      |
| R2 Bucket      | `next-inc-cache` — ISR incremental cache                                  |
| DNS Records    | Wildcard CNAME + apex A record for dynamic subdomain routing              |
| Worker Domains | Custom domain bindings for the Worker                                     |
| WAF Rules      | Custom firewall rules, rate limits, managed rulesets (OWASP + Cloudflare) |

## What's NOT Managed by Terraform

The Worker **script** itself is deployed via the CI/CD pipeline (`opennextjs-cloudflare deploy`), not Terraform. Terraform manages the surrounding infrastructure only. This separation is intentional — the application code changes frequently and is better served by the existing build-and-deploy pipeline.

## Directory Structure

```
infra/
├── README.md                          # This file
├── cloudflare/
│   ├── versions.tf                    # Provider + backend config
│   ├── variables.tf                   # Input variables
│   ├── main.tf                        # KV, R2, DNS, Worker domains
│   ├── waf.tf                         # WAF rules, rate limits, managed rulesets
│   └── terraform.tfvars.example       # Example variable values (copy to terraform.tfvars)
└── environments/
    ├── production/main.tf             # Production-specific overrides
    └── staging/main.tf                # Staging-specific overrides (relaxed rate limits)
```

## Quick Start

### Prerequisites

- [Terraform >= 1.5](https://developer.hashicorp.com/terraform/install)
- A Cloudflare API token with permissions: Workers Scripts, KV Storage, R2 Storage, DNS, WAF/Firewall

### 1. Configure Variables

```bash
cd infra/cloudflare
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with your Cloudflare credentials
```

### 2. Initialize & Plan

```bash
terraform init
terraform plan
```

### 3. Apply

```bash
terraform apply
```

### 4. Update wrangler.jsonc

After applying, update `wrangler.jsonc` with the outputs:

```bash
# Get the KV namespace ID
terraform output kv_namespace_id

# Get the R2 bucket name
terraform output r2_bucket_name
```

## CI/CD Integration

The `terraform.yml` workflow automatically:

- Runs `terraform plan` on PRs that modify `infra/` (posts the plan as a PR comment)
- Runs `terraform apply` when changes are merged to `main`

Required GitHub Secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_ZONE_ID`
- `CLOUDFLARE_DOMAIN`

## Environment Parity

Use the environment wrappers for consistent configuration:

```bash
# Production
cd infra/environments/production
terraform init && terraform apply

# Staging
cd infra/environments/staging
terraform init && terraform apply
```

Staging uses relaxed rate limits for testing while maintaining the same resource topology.

## WAF Rules

All WAF rules are defined in `cloudflare/waf.tf`:

| Rule                  | Phase           | Action    | Description                                |
| --------------------- | --------------- | --------- | ------------------------------------------ |
| Bot block on `/admin` | Firewall Custom | Block     | Block requests with bot score < 10         |
| Admin login challenge | Firewall Custom | Challenge | Challenge bot score < 30 on login          |
| Internal API block    | Firewall Custom | Block     | Block external access to `/api/internal/*` |
| Admin rate limit      | Rate Limit      | Block     | 30 req/10s per IP on `/admin`              |
| Click tracking limit  | Rate Limit      | Block     | 60 req/min per IP on `/api/track/click`    |
| Newsletter limit      | Rate Limit      | Block     | 3 req/hour per IP on `/api/newsletter`     |
| Public API limit      | Rate Limit      | Challenge | 100 req/10s per IP on `/api/*`             |
| Cloudflare Managed    | Managed WAF     | Execute   | Cloudflare's built-in ruleset              |
| OWASP Core            | Managed WAF     | Execute   | OWASP Top 10 protection                    |

## Migrating from wrangler.jsonc

The existing `wrangler.jsonc` remains the source of truth for the Worker script configuration (compatibility flags, bindings, cron triggers). Terraform manages the infrastructure _around_ it — KV namespaces, R2 buckets, DNS, WAF rules, and domain bindings.

To fully adopt Terraform:

1. Apply the Terraform configs to create/import resources
2. Update `wrangler.jsonc` KV ID with `terraform output kv_namespace_id`
3. Remove manual resource creation steps from `deploy.yml` (they become no-ops since Terraform already created them)
