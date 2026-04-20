# Cloudflare Configuration — Single Source of Truth

This document describes every Cloudflare resource, binding, secret, and zone setting used by Affilite-Mix. It is the canonical reference for the deployment.

**See also:**

- [cloudflare-production.md](./cloudflare-production.md) — step-by-step zone security & performance toggles (SSL, HSTS, WAF, rate limiting, cache rules) with dashboard links and verification scripts
- [cloudflare-recovery.md](./cloudflare-recovery.md) — account recovery playbook (lost access, compromised account, full rebuild from scratch)
- [cloudflare-r2-images.md](./cloudflare-r2-images.md) — image upload architecture (S3-API presigned URLs)
- [secrets-rotation-runbook.md](./secrets-rotation-runbook.md) — per-secret rotation procedures and impact
- [rollback-strategy.md](./rollback-strategy.md) — rollback via Dashboard, API, or Git revert

---

## Account & Zone

| Item       | Value                              |
| ---------- | ---------------------------------- |
| Account ID | `0dadac330461be7f3e6fce8cb6611ba4` |
| Zone       | `wristnerd.xyz`                    |
| Zone ID    | `a3fc8a7a314e9b6ab61362f7aacee29c` |
| Plan       | Free                               |
| Worker     | `affilite-mix`                     |

---

## Worker Bindings (wrangler.jsonc)

| Binding                    | Type    | Resource                           | Purpose                   |
| -------------------------- | ------- | ---------------------------------- | ------------------------- |
| `ASSETS`                   | Assets  | `.open-next/assets`                | Static assets for Next.js |
| `WORKER_SELF_REFERENCE`    | Service | `affilite-mix` (self)              | OpenNext caching layer    |
| `RATE_LIMIT_KV`            | KV      | `7ac37dff0a794542b0c766f38e73f105` | Distributed rate limiting |
| `NEXT_INC_CACHE_R2_BUCKET` | R2      | `next-inc-cache`                   | Incremental cache storage |

---

## Worker Secrets Inventory

All runtime secrets are set via `wrangler secret put <NAME>` (automated in the deploy workflow).

### Required

| Secret                          | Source                  | Used by                                            |
| ------------------------------- | ----------------------- | -------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | Supabase dashboard      | `lib/supabase.ts`, SSR                             |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase dashboard      | `lib/supabase.ts`, SSR                             |
| `SUPABASE_SERVICE_ROLE_KEY`     | Supabase dashboard      | `lib/supabase-server.ts`                           |
| `JWT_SECRET`                    | `openssl rand -hex 64`  | `lib/auth/`, admin JWT signing                     |
| `CRON_SECRET`                   | `openssl rand -hex 32`  | `workers/custom-worker.ts`, `lib/cron-auth.ts`     |
| `CRON_HOST`                     | `https://wristnerd.xyz` | `workers/custom-worker.ts` — cron dispatch target  |
| `INTERNAL_API_TOKEN`            | `openssl rand -hex 64`  | `lib/internal-auth.ts` — middleware ↔ resolve-site |

### Optional — Email

| Secret                  | Source                                          | Used by                                                |
| ----------------------- | ----------------------------------------------- | ------------------------------------------------------ |
| `RESEND_API_KEY`        | [Resend dashboard](https://resend.com/api-keys) | `app/api/newsletter/`, `app/api/auth/forgot-password/` |
| `NEWSLETTER_FROM_EMAIL` | Your verified sender address                    | `app/api/newsletter/`                                  |

### Optional — Error Monitoring

| Secret       | Source                  | Used by         |
| ------------ | ----------------------- | --------------- |
| `SENTRY_DSN` | Sentry project settings | `lib/sentry.ts` |

### Optional — Bot Protection

| Secret                 | Source                           | Used by            |
| ---------------------- | -------------------------------- | ------------------ |
| `TURNSTILE_SECRET_KEY` | Cloudflare dashboard → Turnstile | `lib/turnstile.ts` |

### Optional — AI Content Engine

Fallback chain: Cloudflare AI → Gemini → Groq → Cohere.

| Secret                    | Source            | Used by               |
| ------------------------- | ----------------- | --------------------- |
| `CLOUDFLARE_AI_API_TOKEN` | CF dashboard → AI | `lib/ai/providers.ts` |
| `GEMINI_API_KEY`          | Google AI Studio  | `lib/ai/providers.ts` |
| `GROQ_API_KEY`            | Groq console      | `lib/ai/providers.ts` |
| `COHERE_API_KEY`          | Cohere dashboard  | `lib/ai/providers.ts` |

### Optional — Affiliate Networks

| Secret                 | Source       | Used by                     |
| ---------------------- | ------------ | --------------------------- |
| `CJ_API_KEY`           | CJ Affiliate | `lib/affiliate/networks.ts` |
| `CJ_PUBLISHER_ID`      | CJ Affiliate | `lib/affiliate/networks.ts` |
| `PARTNERSTACK_API_KEY` | PartnerStack | `lib/affiliate/networks.ts` |
| `ADMITAD_API_KEY`      | Admitad      | `lib/affiliate/networks.ts` |
| `ADMITAD_PUBLISHER_ID` | Admitad      | `lib/affiliate/networks.ts` |

### Optional — Image Storage (R2 via S3 API)

Images use S3-compatible API access keys (not a Worker R2 binding).

| Secret                 | Source                         | Used by     |
| ---------------------- | ------------------------------ | ----------- |
| `R2_ACCOUNT_ID`        | CF dashboard → Account ID      | `lib/r2.ts` |
| `R2_ACCESS_KEY_ID`     | CF dashboard → R2 → API Tokens | `lib/r2.ts` |
| `R2_SECRET_ACCESS_KEY` | CF dashboard → R2 → API Tokens | `lib/r2.ts` |
| `R2_BUCKET_NAME`       | CF dashboard → R2 → Buckets    | `lib/r2.ts` |
| `R2_PUBLIC_URL`        | Public URL for R2 bucket       | `lib/r2.ts` |

---

## GitHub Actions Secrets (CI/CD only)

These are consumed by the deploy workflow but are **not** Worker runtime secrets.

| Secret                     | Purpose                                 |
| -------------------------- | --------------------------------------- |
| `CLOUDFLARE_API_TOKEN`     | Wrangler CLI auth (deploy + secret put) |
| `CLOUDFLARE_API_KEY`       | Alternative: Global API Key auth        |
| `CLOUDFLARE_EMAIL`         | Email for Global API Key auth           |
| `CLOUDFLARE_ACCOUNT_ID`    | Wrangler account targeting              |
| `SUPABASE_DB_URL`          | Direct psql for DB migrations           |
| `ADMIN_BOOTSTRAP_EMAIL`    | One-time admin user creation            |
| `ADMIN_BOOTSTRAP_PASSWORD` | One-time admin user creation            |

---

## Build-time vs Runtime

| Category          | When resolved         | Where set                   |
| ----------------- | --------------------- | --------------------------- |
| `NEXT_PUBLIC_*`   | Build (inlined)       | GitHub Actions `env:` block |
| Server secrets    | Runtime (per-request) | `wrangler secret put`       |
| Wrangler bindings | Runtime (per-request) | `wrangler.jsonc` bindings   |

Server-side secrets (JWT, cron, AI keys, affiliate APIs, etc.) are **not** in the build-time `env:` block. This means:

- They are never embedded in the JS bundle (security).
- They can be rotated via `wrangler secret put` without a rebuild.
- They are read from `process.env.*` at request time via the Worker runtime.

---

## Zone Security Settings (wristnerd.xyz)

Applied via Cloudflare Dashboard or API. For detailed step-by-step instructions, dashboard links, and verification scripts, see **[cloudflare-production.md](./cloudflare-production.md)**.

| Setting                | Value              | Notes                                          |
| ---------------------- | ------------------ | ---------------------------------------------- |
| SSL Mode               | **Full (Strict)**  | Validates origin certificate                   |
| Always Use HTTPS       | **ON**             | 301 redirects HTTP → HTTPS                     |
| Minimum TLS Version    | **1.2**            | Blocks TLS 1.0/1.1 clients                     |
| HSTS                   | **ON**             | `max-age=63072000; includeSubDomains; preload` |
| X-Content-Type-Options | **nosniff**        | Part of HSTS config                            |
| Bot Fight Mode         | **ON**             | JS challenge for bot traffic                   |
| WAF Managed Ruleset    | **ON** (Free tier) | Cloudflare Managed Free rules                  |
| DDoS L7                | **ON** (automatic) | Cloudflare-managed                             |

### Rate Limiting (Free plan)

Single rule (free plan max = 1 rule, period = 10s, mitigation = 10s):

| Expression                                             | Limit       | Block duration |
| ------------------------------------------------------ | ----------- | -------------- |
| `/api/auth/*` OR `/api/newsletter/*` OR `/api/admin/*` | 5 req / 10s | 10s            |

> **Upgrade note:** With a Pro plan, split into separate rules with longer periods (60s) and mitigation timeouts (600s). Add OWASP Managed Ruleset.

---

## Custom Domains & Routes

Configured in `wrangler.jsonc` under `routes`:

```jsonc
{ "pattern": "wristnerd.xyz", "custom_domain": true },
{ "pattern": "arabictools.wristnerd.xyz", "custom_domain": true },
{ "pattern": "crypto.wristnerd.xyz", "custom_domain": true }
```

To add a new domain: see comments in `wrangler.jsonc` or use Dashboard → Workers & Pages → affilite-mix → Settings → Triggers → Add Custom Domain.

---

## Deploy Runbook

### Standard deploy (automatic)

Push to `main` → GitHub Actions runs `.github/workflows/deploy.yml`:

1. Installs deps, applies DB migrations
2. Creates R2 bucket + KV namespace if missing
3. Builds OpenNext bundle
4. Deploys to Cloudflare Workers
5. Sets all Worker secrets
6. Runs post-deploy health check

### Manual deploy

```bash
# Build
npx @opennextjs/cloudflare build

# Deploy
npx @opennextjs/cloudflare deploy

# Set a secret
wrangler secret put CRON_SECRET --name affilite-mix
```

### Rollback

Use the Rollback workflow: GitHub Actions → Rollback / Promote → `rollback-instant`.

---

## Local Development

```bash
cp .dev.vars.example .dev.vars   # Fill in your values
cp .env.example .env             # For next dev (non-wrangler)
npm run dev                      # Next.js dev server
```

For Wrangler-based local dev (closer to production):

```bash
npx @opennextjs/cloudflare build
npx wrangler dev
```
