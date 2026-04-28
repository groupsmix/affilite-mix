# Cloudflare Infrastructure Ownership Boundaries

> **F-014: Infrastructure ownership documentation**
> 
> This document clarifies which components are managed by Terraform, Wrangler,
> and the Cloudflare Dashboard to prevent drift and ensure consistent deployments.

## Ownership Matrix

| Component | Terraform | Wrangler | Dashboard | Notes |
|-----------|-----------|----------|-----------|-------|
| **Worker Script/Bundles** | ❌ No | ✅ Yes | ❌ No | Deployed via `wrangler deploy` in CI |
| **Worker Routes** | ❌ No | ✅ Yes | ⚠️ Read-only | Configured in `wrangler.jsonc` |
| **Durable Objects** | ❌ No | ✅ Yes | ❌ No | Defined in `wrangler.jsonc` |
| **KV Namespaces** | ✅ Yes | ⚠️ Bindings only | ❌ No | Terraform creates; Wrangler binds |
| **R2 Buckets** | ✅ Yes | ⚠️ Bindings only | ❌ No | Terraform creates; Wrangler binds |
| **Queues** | ✅ Yes | ⚠️ Bindings only | ❌ No | Terraform creates queues/DLQs; Wrangler binds |
| **Cron Triggers** | ❌ No | ✅ Yes | ❌ No | Configured in `wrangler.jsonc` |
| **Custom Domains** | ❌ No | ⚠️ Comments | ✅ Yes | Dashboard-managed per environment |
| **WAF Rules** | ✅ Yes | ❌ No | ⚠️ Read-only | Terraform manages; dashboard for debugging |
| **Rate Limiting Rules** | ✅ Yes | ❌ No | ⚠️ Read-only | Terraform manages thresholds |
| **TLS/HSTS** | ✅ Yes | ❌ No | ⚠️ Read-only | Terraform enforces TLS 1.2+ |
| **Logpush Jobs** | ✅ Yes | ❌ No | ⚠️ Read-only | Terraform configures log shipping |
| **Worker Secrets** | ❌ No | ✅ Yes | ✅ Yes | Set via Wrangler CLI or Dashboard |
| **DNS Records** | ✅ Yes | ❌ No | ⚠️ Read-only | Terraform manages; dynamic records excluded |
| **Email (Workers Mail)** | ✅ Yes | ❌ No | ❌ No | Terraform configures email routing |

## Deployment Flow

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Terraform     │────▶│  Cloudflare API │────▶│  Platform Infra │
│  (IaC - Infra)  │     │                 │     │  (KV, R2, etc)  │
└─────────────────┘     └─────────────────┘     └─────────────────┘

┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Wrangler CLI  │────▶│  Cloudflare API │────▶│  Worker Runtime │
│  (App - Code)   │     │                 │     │  (Bundles, DO)  │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

## Drift Detection

Run these commands periodically to detect drift:

```bash
# Check Terraform drift
cd terraform/
terraform plan -detailed-exitcode

# Check Wrangler config drift
npx wrangler deploy --dry-run

# Compare dashboard-managed domains
npx wrangler tail --format=json | head -5
```

## Emergency Procedures

### If Dashboard Changes Were Made Manually

1. Document the change in `#incident-response` channel
2. Update Terraform or Wrangler config to match
3. Apply via code: `terraform apply` or `wrangler deploy`
4. Verify in dashboard that values match code

### If Terraform State Drifts

```bash
# Refresh state from actual infrastructure
terraform refresh

# Review pending changes
terraform plan

# Import manually created resources
terraform import cloudflare_workers_kv_namespace.example <namespace_id>
```

## Change Management

| Change Type | Method | Approval Required |
|-------------|--------|-------------------|
| WAF rule update | PR → Terraform apply | Security team |
| Rate limit threshold | PR → Terraform apply | SRE team |
| New KV namespace | PR → Terraform apply | Platform team |
| Worker code change | PR → Wrangler deploy | Code review |
| New cron trigger | PR → wrangler.jsonc | Platform team |
| Secret rotation | Wrangler CLI → Dashboard | Security + SRE |
| Custom domain | Dashboard → Document | DevOps team |

## Contacts

- **Terraform/IaC Issues**: Platform Engineering
- **Wrangler/Worker Issues**: Developer Experience
- **Dashboard/Runtime Issues**: Cloudflare Support + SRE
- **Security Policy Issues**: Security Engineering

---

*Last updated: 2026-04-28*
*Document owner: @groupsmix/platform*
