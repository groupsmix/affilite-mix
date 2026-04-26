# Secrets Rotation Runbook

This document describes how to rotate each secret used by Affilite-Mix, the expected impact, and recommended rotation frequency.

---

## Overview

| Secret                                                                                           | Location                 | Rotation Frequency           | Impact of Rotation                                        |
| ------------------------------------------------------------------------------------------------ | ------------------------ | ---------------------------- | --------------------------------------------------------- |
| `JWT_SECRET` (a.k.a. `ADMIN_JWT_SECRET`)                                                         | Cloudflare env / `.env`  | Every 90 days                | All active admin sessions are invalidated                 |
| `SUPABASE_SERVICE_ROLE_KEY`                                                                      | Cloudflare env / `.env`  | Every 90 days                | Momentary API downtime during deploy                      |
| `CRON_SECRET` + per-trigger `CRON_*_SECRET`                                                      | Cloudflare env / `.env`  | Every 90 days                | Cron jobs fail until new secret is deployed               |
| `STRIPE_SECRET_KEY`                                                                              | Cloudflare env / `.env`  | Every 90 days                | Checkout + subscription sync fail until updated           |
| `STRIPE_WEBHOOK_SECRET`                                                                          | Cloudflare env / `.env`  | Every 90 days                | Stripe webhooks return `400` until updated                |
| `RESEND_API_KEY`                                                                                 | Cloudflare env / `.env`  | Every 180 days               | Email sending fails until updated                         |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY`                                                      | Cloudflare env / `.env`  | Every 180 days               | Image uploads fail until updated                          |
| `CLOUDFLARE_API_TOKEN`                                                                           | GitHub Secrets           | Every 180 days               | Deployments fail until updated                            |
| `TURNSTILE_SECRET_KEY`                                                                           | Cloudflare env / `.env`  | Every 180 days               | Captcha verification fails until updated                  |
| `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN`                                                          | Cloudflare env / `.env`  | Rarely (only if compromised) | Error monitoring temporarily disabled                     |
| `SENTRY_AUTH_TOKEN`                                                                              | GitHub Secrets (CI only) | Every 180 days               | Source-map upload + release creation fail in CI           |
| AI provider keys (`GEMINI_API_KEY`, `GROQ_API_KEY`, `COHERE_API_KEY`, `CLOUDFLARE_AI_API_TOKEN`) | Cloudflare env / `.env`  | Every 180 days               | Affected provider skipped in fallback chain until updated |

---

## Rotation Procedures

### 1. `JWT_SECRET`

**Impact:** All active admin sessions become invalid immediately. Admins must log in again.

**Steps:**

1. Generate a new 64-byte hex string:
   ```bash
   openssl rand -hex 64
   ```
2. Update the secret in Cloudflare Workers:
   ```bash
   wrangler secret put JWT_SECRET
   ```
3. Update the value in GitHub Secrets (Settings > Secrets and variables > Actions).
4. Trigger a new deployment (push to `main` or manually re-run the deploy workflow).
5. Notify admin users that they will need to log in again.

**Rollback:** If the new secret causes issues, re-set the old `JWT_SECRET` value via `wrangler secret put JWT_SECRET` and redeploy.

---

### 2. `SUPABASE_SERVICE_ROLE_KEY`

**Impact:** All server-side database operations fail until the new key is deployed. This is a brief window during deployment.

**Steps:**

1. Go to your Supabase project dashboard: **Settings > API**.
2. Click **Regenerate** next to the service role key.
3. Copy the new key.
4. Update in Cloudflare Workers:
   ```bash
   wrangler secret put SUPABASE_SERVICE_ROLE_KEY
   ```
5. Update in GitHub Secrets.
6. Redeploy.

**Warning:** The old key is invalidated immediately by Supabase. Plan for a brief outage window or use a blue/green deployment strategy.

---

### 3. `CRON_SECRET` and per-trigger `CRON_*_SECRET`

**Impact:** Scheduled publishing cron jobs fail with 401 until both the environment variable and the cron trigger are using the new secret.

Each cron route has a dedicated per-trigger secret and falls back to `CRON_SECRET` if the per-trigger one is unset. When rotating, prefer rotating per-trigger secrets independently to minimize blast radius.

**Per-trigger secrets (see `.env.example` and `lib/cron-registry.ts`):**

- `CRON_PUBLISH_SECRET` → `/api/cron/publish`
- `CRON_AI_SECRET` → `/api/cron/ai-generate`
- `CRON_PRICE_SECRET` → `/api/cron/price-scrape`
- `CRON_SITEMAP_SECRET` → `/api/cron/sitemap-refresh`
- `CRON_STRIPE_SYNC_SECRET` → `/api/cron/stripe-sync`
- `CRON_COMMISSION_SECRET` → `/api/cron/commission-ingest`
- `CRON_DEALS_SECRET` → `/api/cron/expire-deals`
- `CRON_RETENTION_SECRET` → `/api/cron/data-retention`
- `CRON_EPC_SECRET` → `/api/cron/epc-recompute`

**Steps:**

1. Generate a new secret:
   ```bash
   openssl rand -base64 32
   ```
2. Update in Cloudflare Workers (per-trigger or shared):
   ```bash
   wrangler secret put CRON_PUBLISH_SECRET
   # or, for the shared fallback:
   wrangler secret put CRON_SECRET
   ```
3. Update in GitHub Secrets (CI uses these to invoke crons during integration tests).
4. Redeploy.
5. Verify the cron job runs successfully (check Cloudflare Workers logs or `/api/health`).
6. After the next successful scheduled run, the rotation is complete; old secret can be considered invalidated.

---

### 4. `RESEND_API_KEY`

**Impact:** Password reset emails and newsletter confirmation emails fail until updated.

**Steps:**

1. Go to [Resend Dashboard](https://resend.com/api-keys).
2. Create a new API key with the same permissions.
3. Update in Cloudflare Workers:
   ```bash
   wrangler secret put RESEND_API_KEY
   ```
4. Update in GitHub Secrets.
5. Redeploy.
6. Revoke the old API key in the Resend dashboard.

---

### 5. `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY`

**Impact:** Image uploads via the admin panel fail until updated. Existing images remain accessible (they are served via public R2 URLs).

**Steps:**

1. Go to Cloudflare dashboard: **R2 > Manage R2 API Tokens**.
2. Create a new API token with Object Read & Write permissions for the bucket.
3. Update both values:
   ```bash
   wrangler secret put R2_ACCESS_KEY_ID
   wrangler secret put R2_SECRET_ACCESS_KEY
   ```
4. Update in GitHub Secrets.
5. Redeploy.
6. Revoke the old API token in the Cloudflare dashboard.

---

### 6. `CLOUDFLARE_API_TOKEN`

**Impact:** CI/CD deployments fail. The running production application is unaffected.

**Steps:**

1. Go to Cloudflare dashboard: **My Profile > API Tokens**.
2. Create a new token with the same permissions (Cloudflare Pages edit, Workers edit).
3. Update in GitHub Secrets (Settings > Secrets and variables > Actions > `CLOUDFLARE_API_TOKEN`).
4. Revoke the old token.
5. Trigger a test deployment to verify.

---

### 7. `TURNSTILE_SECRET_KEY` / `NEXT_PUBLIC_TURNSTILE_SITE_KEY`

**Impact:** Captcha verification on newsletter signup and login fails until updated.

**Steps:**

1. Go to Cloudflare dashboard: **Turnstile > your widget**.
2. Rotate the secret key (or create a new widget).
3. Update:
   ```bash
   wrangler secret put TURNSTILE_SECRET_KEY
   ```
4. If the site key changed, update `NEXT_PUBLIC_TURNSTILE_SITE_KEY` as well.
5. Update in GitHub Secrets.
6. Redeploy.

---

### 8. `STRIPE_SECRET_KEY`

**Impact:** All Stripe server-side operations fail (checkout session creation, subscription lookups, `/api/cron/stripe-sync`). Existing Stripe webhooks keep arriving but any handler that makes a Stripe API call from our worker will fail.

**Steps:**

1. Log in to the [Stripe Dashboard](https://dashboard.stripe.com/apikeys) (Developers → API keys).
2. Click **Create restricted key** (or roll the existing secret key) with at minimum:
   - `Checkout Sessions`: Write
   - `Customers`: Read/Write
   - `Subscriptions`: Read
   - `Prices` / `Products`: Read
   - `Invoices`: Read
3. Update in Cloudflare Workers:
   ```bash
   wrangler secret put STRIPE_SECRET_KEY
   ```
4. Update in GitHub Secrets (used by preview deploys and CI).
5. Redeploy.
6. Verify checkout works end-to-end using Stripe test mode first, then a live smoke test.
7. In the Stripe Dashboard, **revoke** the previous key.

---

### 9. `STRIPE_WEBHOOK_SECRET`

**Impact:** Stripe webhooks begin failing signature verification and return `400`. Subscription status updates stop flowing in. Stripe will automatically retry for up to 3 days.

**Steps:**

1. Go to [Stripe Dashboard → Webhooks](https://dashboard.stripe.com/webhooks).
2. Select the `/api/membership/webhook` endpoint.
3. Click **Roll secret** (or create a new endpoint and disable the old one after cut-over).
4. Copy the new signing secret (`whsec_…`).
5. Update in Cloudflare Workers:
   ```bash
   wrangler secret put STRIPE_WEBHOOK_SECRET
   ```
6. Update in GitHub Secrets.
7. Redeploy.
8. Trigger a test event from the Stripe Dashboard and confirm it is accepted (check Workers logs).
9. After the rotation window ends (default 24h), the old secret stops being accepted by Stripe.

---

### 10. `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN`

**Impact:** Error monitoring pauses. No errors are reported to Sentry until the new DSN is deployed. User-facing behavior is unaffected.

**Steps:**

1. In [Sentry → Settings → Projects → <project> → Client Keys (DSN)](https://sentry.io/settings/).
2. Click **New Key** and generate a new DSN. For the public client DSN, constrain rate limits and allowed origins.
3. Update in Cloudflare Workers:
   ```bash
   wrangler secret put SENTRY_DSN
   wrangler secret put NEXT_PUBLIC_SENTRY_DSN
   ```
4. Update the same values in GitHub Secrets (`NEXT_PUBLIC_SENTRY_DSN` is needed at build time).
5. Redeploy. Verify by intentionally triggering a non-critical error and checking it appears in the new project key's event stream.
6. **Disable** the previous DSN in the Sentry UI once you've confirmed events arrive on the new one.

---

### 11. `SENTRY_AUTH_TOKEN` (CI-only)

**Impact:** CI-side source-map upload and release creation fail. Production monitoring itself keeps working (only release metadata/symbolication is affected).

**Steps:**

1. Go to [Sentry → User Auth Tokens](https://sentry.io/settings/account/api/auth-tokens/) (or an **Internal Integration** token for the org).
2. Create a new token with scopes: `project:releases`, `project:write`, `org:read`.
3. Update in GitHub Secrets (`SENTRY_AUTH_TOKEN`).
4. Re-run the most recent failed release pipeline (or push a no-op commit) to confirm uploads succeed.
5. Revoke the previous token in the Sentry dashboard.

---

### 12. AI provider keys (`GEMINI_API_KEY`, `GROQ_API_KEY`, `COHERE_API_KEY`, `CLOUDFLARE_AI_API_TOKEN`)

**Impact:** The rotated provider is skipped in the fallback chain (`Cloudflare AI → Gemini → Groq → Cohere`) until the new key is deployed. Content generation continues via the remaining providers; no user-visible outage is expected as long as **at least one** provider has a valid key and has `AI_ENABLE_<PROVIDER>=true`.

**Steps (per provider):**

1. Generate a new API key in the provider's dashboard:
   - Gemini: https://aistudio.google.com/app/apikey
   - Groq: https://console.groq.com/keys
   - Cohere: https://dashboard.cohere.com/api-keys
   - Cloudflare Workers AI: Cloudflare dashboard → **AI → API Tokens** (scope: Workers AI Read/Run)
2. Update in Cloudflare Workers:
   ```bash
   wrangler secret put GEMINI_API_KEY   # or GROQ_API_KEY / COHERE_API_KEY / CLOUDFLARE_AI_API_TOKEN
   ```
3. Update in GitHub Secrets if CI uses them.
4. Redeploy.
5. Verify by triggering `/api/cron/ai-generate` manually (or waiting for the next scheduled run) and confirming no auth failures in Workers logs.
6. Revoke the old key in the provider's dashboard.

---

## Verification Checklist

After rotating any secret, verify the following:

- [ ] `/api/health` returns `200 OK` with `database: ok`
- [ ] Admin login works (`/admin/login`)
- [ ] Cron jobs execute successfully (check Cloudflare Workers logs)
- [ ] Image upload works (admin panel > upload an image)
- [ ] Newsletter signup works (submit a test email)
- [ ] CI/CD pipeline deploys successfully (push a no-op commit)

---

## Emergency Rotation

If a secret is compromised:

1. **Rotate immediately** using the steps above.
2. **Audit access:** Check the Cloudflare Workers logs and Supabase audit log for suspicious activity.
3. **Notify stakeholders** if user data may have been accessed.
4. **Review:** Determine how the secret was compromised and address the root cause.
