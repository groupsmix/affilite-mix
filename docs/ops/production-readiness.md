# Production Readiness Checklist

This document provides a concrete production readiness checklist that matches the actual code and workflows in this repository.

**Last Updated**: 2026-04-28
**Applicable To**: Production deployment to Cloudflare Workers

---

## Required Cloudflare Bindings

The following bindings MUST be provisioned in `wrangler.jsonc` before deployment:

| Binding                    | Type           | Purpose                                   | Location                      |
| -------------------------- | -------------- | ----------------------------------------- | ----------------------------- |
| `RATE_LIMIT_KV`            | KV Namespace   | Distributed rate limiting                 | wrangler.jsonc                |
| `APP_CACHE_KV`             | KV Namespace   | Domain resolution cache, maintenance mode | wrangler.jsonc, middleware.ts |
| `RATE_LIMITER_DO`          | Durable Object | Atomic distributed rate limiting          | wrangler.jsonc                |
| `CLICK_QUEUE`              | Queue Producer | Affiliate click tracking queue            | wrangler.jsonc                |
| `NEXT_INC_CACHE_R2_BUCKET` | R2 Bucket      | Incremental cache for OpenNext            | wrangler.jsonc                |

### KV Namespace Setup

```bash
# Create KV namespaces
npx wrangler kv:namespace create RATE_LIMIT_KV
npx wrangler kv:namespace create APP_CACHE_KV

# Note the IDs returned and set them in your environment
export RATE_LIMIT_KV_NAMESPACE_ID="<id>"
export APP_CACHE_KV_NAMESPACE_ID="<id>"
```

### Queue Setup

```bash
# Create queues
npx wrangler queues create click-tracking
npx wrangler queues create click-tracking-dlq
```

### CI Automated Validation

The deploy workflow (`deploy.yml`) validates these bindings. Missing bindings will cause hard failure:

- RATE_LIMIT_KV must be configured
- APP_CACHE_KV must be configured (required for middleware/domain resolution)
- RATE_LIMITER_DO must be configured
- CLICK_QUEUE must be configured
- NEXT_INC_CACHE_R2_BUCKET must be configured

---

## Required GitHub Secrets

The following secrets MUST be configured in GitHub → Settings → Secrets and variables → Actions:

### Build-time Secrets (used during CI)

| Secret                                        | Required | Purpose                                      |
| --------------------------------------------- | -------- | -------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`                    | Yes      | Supabase project URL (inlined at build time) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`               | Yes      | Supabase anon key (inlined at build time)    |
| `SUPABASE_DB_URL` or `SUPABASE_DB_POOLER_URL` | Yes      | Database URL for migrations (IPv4-reachable) |
| `CLOUDFLARE_API_TOKEN`                        | Yes      | Scoped API token (NOT global key)            |
| `CLOUDFLARE_ACCOUNT_ID`                       | Yes      | Cloudflare account ID                        |
| `STAGING_SUPABASE_DB_URL`                     | Yes      | Staging DB for pre-deploy validation         |

### Runtime Worker Secrets (set via `wrangler secret put`)

| Secret                      | Required | Purpose                         |
| --------------------------- | -------- | ------------------------------- |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes      | Service role key (bypasses RLS) |
| `SUPABASE_JWT_SECRET`       | Yes      | Supabase JWT signing secret     |
| `JWT_SECRET`                | Yes      | Admin session signing           |
| `CRON_SECRET`               | Yes      | Cron authentication             |
| `INTERNAL_API_TOKEN`        | Yes      | Service-to-service auth         |
| `APP_URL`                   | Yes      | Canonical URL for emails        |

### Optional but Recommended

| Secret                  | Required When       | Purpose              |
| ----------------------- | ------------------- | -------------------- |
| `SENTRY_DSN`            | Production (always) | Error monitoring     |
| `RESEND_API_KEY`        | Newsletter enabled  | Email sending        |
| `TURNSTILE_SECRET_KEY`  | Turnstile enabled   | Captcha verification |
| `STRIPE_SECRET_KEY`     | Memberships enabled | Payment processing   |
| `STRIPE_WEBHOOK_SECRET` | Memberships enabled | Webhook verification |

---

## Required Supabase Settings

### Database

1. **Row Level Security (RLS)**: Must be enabled on all tenant-scoped tables
2. **Tenant Isolation Policies**: Every table must have `tenant_isolation_auth_*` policies
3. **Public Schema Grants**: No unexpected grants on public schema

### CI Validation

The `db-audit` job in CI validates:

- RLS is enabled on critical tables
- No unexpected public grants
- Audit log table has required columns (actor, entity_type, ip)

### Migrations

- All migrations must have rollback instructions
- Migrations run in order during `migrate-production` job
- `_migrations_applied` table tracks applied migrations

---

## Required Alerts

Configure the following alerts in Cloudflare Dashboard:

### Worker Alerts

| Alert               | Trigger        | Action                    |
| ------------------- | -------------- | ------------------------- |
| Worker errors spike | >10 errors/min | Check Sentry, review logs |
| Worker CPU time     | >80% avg       | Review heavy cron jobs    |
| Worker memory       | >90% usage     | Profile memory usage      |

### Queue Alerts

| Alert        | Trigger       | Action                           |
| ------------ | ------------- | -------------------------------- |
| DLQ messages | >0 in DLQ     | Review failed message processing |
| Queue depth  | >1000 backlog | Scale consumer workers           |

### Cron Job Alerts

| Alert           | Trigger                  | Action                    |
| --------------- | ------------------------ | ------------------------- |
| Cron failure    | Any cron returns non-200 | Check cron route handlers |
| Health endpoint | Returns non-200          | Worker is unhealthy       |

### Sentry Alerts

| Alert       | Trigger            | Action                 |
| ----------- | ------------------ | ---------------------- |
| Error spike | >5 errors in 5 min | Page on-call           |
| P95 latency | >2s                | Profile slow endpoints |

---

## Backup & Restore Expectations

### Database Backups

- Supabase provides automatic daily backups
- Point-in-time recovery available
- Manual snapshots before major migrations

### R2 Media Backups

- Media is stored in R2 with versioning enabled
- Retention: 30 days (configurable)
- No automatic backup of uploaded media

### Configuration Backups

- `wrangler.jsonc` is in Git
- Secrets are in GitHub Secrets (encrypted)
- Site configurations are in Supabase

---

## Deploy & Rollback Process

### Standard Deploy

1. Push to `main` branch
2. CI runs validation (tests, typecheck, build)
3. `deploy.yml` runs:
   - Validates required bindings
   - Validates required secrets
   - Applies migrations to staging
   - Applies migrations to production
   - Builds and deploys to Cloudflare
   - Runs health check

### Rollback via Dashboard

1. Go to Cloudflare Dashboard → Workers & Pages → affilite-mix
2. Go to Deployments tab
3. Select previous working deployment
4. Click "Redeploy"

### Rollback via CLI

```bash
# List recent deployments
npx wrangler deployments list --name affilite-mix

# Rollback to specific version
npx wrangler rollback --name affilite-mix --version <version-id>
```

---

## Smoke Tests After Deploy

After any deploy (standard or rollback), verify:

### Health Check

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://your-domain.com/api/health
```

Expected: `{"status":"ok",...}`

### Admin Login

1. Navigate to `/admin/login`
2. Login with admin credentials
3. Verify site selector loads

### Content Access

1. Navigate to public page
2. Verify site branding loads correctly
3. Verify no console errors

### API Routes

```bash
# Test authenticated API
curl -X POST https://your-domain.com/api/admin/products \
  -H "Cookie: <admin-session-cookie>" \
  -H "x-csrf-token: <csrf-token>" \
  -d '{"name":"Test"}'
```

Expected: `401 Unauthorized` (without valid session) or proper response (with session)

---

## Feature Flags & Configuration

### Newsletter

- Enable: Set `NEWSLETTER_ENABLED=true` in worker secrets
- Required: `RESEND_API_KEY`

### Turnstile

- Enable: Set `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY`
- Used for: Newsletter signup, contact forms

### Stripe Payments

- Enable: Set `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- Required: `STRIPE_PRICE_ID_INSIDER`, `STRIPE_PRICE_ID_PRO`

### AI Content Generation

- Enable: Set `CLOUDFLARE_AI_API_TOKEN` or `GEMINI_API_KEY`
- Used by: Heavy crons worker (affilite-mix-heavy-crons)

---

## Manual Verification Checklist

These items cannot be verified from the repo alone and must be checked manually in Cloudflare/Supabase/GitHub settings:

### Cloudflare Dashboard

- [ ] Workers & Pages → affilite-mix → Triggers → Custom Domains configured
- [ ] Workers & Pages → affilite-mix → Settings → Environment Variables set
- [ ] R2 bucket `next-inc-cache` created with public access or proper ACL
- [ ] KV namespaces created with correct IDs in wrangler.jsonc
- [ ] Queue `click-tracking` and `click-tracking-dlq` created

### Supabase Dashboard

- [ ] Project Settings → Database → Connection pooling → Session pooler URL copied
- [ ] API Keys → `service_role` key copied to `SUPABASE_SERVICE_ROLE_KEY` secret
- [ ] Row Level Security enabled on all tables
- [ ] SSL enforcement enabled

### GitHub Settings

- [ ] Secrets configured for production deploy
- [ ] Branch protection rules require all checks
- [ ] `LOG_SHIPPER_ENABLED` repo variable set (optional, for log shipping)

---

## Troubleshooting

### "Missing required secret" in deploy

1. Check GitHub → Settings → Secrets
2. Verify all required secrets are set
3. Re-trigger deploy

### "KV namespace not found"

1. Run `npx wrangler kv:namespace list` to see existing namespaces
2. Create missing namespace or update wrangler.jsonc with correct ID

### "RLS policy drift detected"

1. Run `scripts/db-audit.sh` locally against staging DB
2. Compare against production
3. Apply missing migrations or fix manually

### "Health check failed"

1. Check Worker logs in Cloudflare dashboard
2. Verify all required secrets are set via `wrangler secret list`
3. Check KV bindings are configured
4. Check Supabase connectivity

---

## P2-4: Log Shipping

- [ ] `LOG_SHIPPER_ENABLED` repo variable set to `true` in production
- [ ] Tail consumer (`affilite-mix-log-shipper`) deployed and healthy
- [ ] R2 bucket `affilite-mix-logs` exists with retention policy
- [ ] Deploy gate: deploy workflow fails if `LOG_SHIPPER_ENABLED=false` in production

## P2-5: DLQ Operations

- [ ] Alert on DLQ depth > 0 wired (Cloudflare Dashboard or Sentry)
- [ ] Runbook: `docs/runbooks/click-dlq.md` — owner assigned
- [ ] Replay is idempotent (`scripts/drain-dlq.ts --dry-run`)
- [ ] Dashboard for queue lag, failure rate, drain success rate

## P2-6: Cron Heartbeat & Drift Detection

- [ ] Heartbeat table: each cron writes a `last_run_at` timestamp on success
- [ ] Alert on stale heartbeat (> 2x expected interval)
- [ ] Both workers (`affilite-mix` and `affilite-mix-heavy-crons`) deployed together
- [ ] Rollback includes both workers
- [ ] Secret/env parity between workers documented

## P2-8: AI Safety & Cost Controls

- [ ] Provider-level cost caps configured via `QUOTA_DEFAULT_AI_COST_MICRO_USD_PER_MONTH`
- [ ] Prompt injection tests in `__tests__/ai/prompt-sanitization.test.ts`
- [ ] Model + version + prompt template ID logged on every AI call
- [ ] Eval fixtures for recommendation quality and safety
- [ ] Rate limit with `failPolicy: "closed"` on `/api/gift-finder`

## P2-9: Release Evidence Bundle

Each release MUST archive:

- [ ] CI run output (lint, test, typecheck, build)
- [ ] Deploy artifact digest (SHA256)
- [ ] Branch protection export (via `scripts/github-rulesets-snapshot.sh`)
- [ ] SBOM (generated by CI, `sbom.json`)
- [ ] npm audit output
- [ ] Secret scan results (`docs/gitleaks-report.json`)
- [ ] Backup/restore drill result and timestamp
- [ ] Production config snapshot

Map controls to SOC 2 CC / ISO 27001 Annex A per `docs/compliance-readiness.md`.

---

## Contact

For issues with this checklist, open an issue in the repository.
For production incidents, follow the runbook in `docs/incident-response.md`.
