# Secrets Rotation Runbook

This document describes how to rotate each secret used by Affilite-Mix, the expected impact, and recommended rotation frequency.

---

## Overview

| Secret                                      | Location                | Rotation Frequency           | Impact of Rotation                          |
| ------------------------------------------- | ----------------------- | ---------------------------- | ------------------------------------------- |
| `JWT_SECRET`                                | Cloudflare env / `.env` | Every 90 days                | All active admin sessions are invalidated   |
| `SUPABASE_SERVICE_ROLE_KEY`                 | Cloudflare env / `.env` | Every 90 days                | Momentary API downtime during deploy        |
| `CRON_SECRET`                               | Cloudflare env / `.env` | Every 90 days                | Cron jobs fail until new secret is deployed |
| `RESEND_API_KEY`                            | Cloudflare env / `.env` | Every 180 days               | Email sending fails until updated           |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | Cloudflare env / `.env` | Every 180 days               | Image uploads fail until updated            |
| `CLOUDFLARE_API_TOKEN`                      | GitHub Secrets          | Every 180 days               | Deployments fail until updated              |
| `TURNSTILE_SECRET_KEY`                      | Cloudflare env / `.env` | Every 180 days               | Captcha verification fails until updated    |
| `SENTRY_DSN`                                | Cloudflare env / `.env` | Rarely (only if compromised) | Error monitoring temporarily disabled       |

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

### 3. `CRON_SECRET`

**Impact:** Scheduled publishing cron jobs fail with 401 until both the environment variable and the cron trigger are using the new secret.

**Steps:**

1. Generate a new secret:
   ```bash
   openssl rand -base64 32
   ```
2. Update in Cloudflare Workers:
   ```bash
   wrangler secret put CRON_SECRET
   ```
3. Update in GitHub Secrets.
4. Redeploy.
5. Verify the cron job runs successfully (check Cloudflare Workers logs or `/api/health`).

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
