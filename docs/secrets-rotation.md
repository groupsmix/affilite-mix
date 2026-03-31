# Secrets Rotation Runbook

This document describes every secret used by Affilite-Mix, recommended rotation frequency, and the impact of rotating each one.

## Quick Reference

| Secret | Rotation Frequency | Impact of Rotation |
|---|---|---|
| `JWT_SECRET` | 90 days | All active admin sessions invalidated — admins must re-login |
| `SUPABASE_SERVICE_ROLE_KEY` | 90 days | App must be redeployed with the new key |
| `CRON_SECRET` | 180 days | Update in both GitHub Secrets **and** `wrangler secret put CRON_SECRET` |
| `RESEND_API_KEY` | 180 days | Revoke old key in Resend dashboard after deploying new one |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | 180 days | Image uploads will fail until redeployed with new keys |
| `CLOUDFLARE_API_TOKEN` | 180 days | Deploy pipeline will fail until GitHub Secret is updated |
| `TURNSTILE_SECRET_KEY` | As needed | Captcha verification will fail until redeployed |
| `ADMIN_PASSWORD` | N/A (legacy) | Should be removed in production; use DB-managed admin accounts |

## Rotation Procedures

### 1. JWT_SECRET

**Where it's used:** Admin JWT token signing and verification (`lib/auth.ts`).

**Steps:**
1. Generate a new 64-byte hex string:
   ```bash
   openssl rand -hex 64
   ```
2. Update in GitHub Secrets (`Settings → Secrets → Actions → JWT_SECRET`).
3. Update in Cloudflare Workers:
   ```bash
   wrangler secret put JWT_SECRET
   ```
4. Trigger a new deployment (push to `main` or manually run the deploy workflow).
5. **Impact:** All active admin sessions are immediately invalidated. Admins will need to log in again. This is expected and serves as a forced session refresh.

### 2. SUPABASE_SERVICE_ROLE_KEY

**Where it's used:** Server-side Supabase client for privileged database operations (`lib/dal/`).

**Steps:**
1. In the Supabase dashboard, go to `Settings → API → Service role key`.
2. Regenerate the key (note: Supabase may not support regeneration without project recreation — check current docs).
3. Update in GitHub Secrets.
4. Update in Cloudflare Workers:
   ```bash
   wrangler secret put SUPABASE_SERVICE_ROLE_KEY
   ```
5. Redeploy.
6. **Impact:** Zero downtime if done atomically (deploy completes before old key expires).

### 3. CRON_SECRET

**Where it's used:** Authenticates scheduled cron job requests (`app/api/cron/`).

**Steps:**
1. Generate a new random string:
   ```bash
   openssl rand -base64 32
   ```
2. Update in GitHub Secrets.
3. Update in Cloudflare Workers:
   ```bash
   wrangler secret put CRON_SECRET
   ```
4. Redeploy.
5. **Impact:** Cron jobs will fail authentication between the secret update and redeployment. Schedule rotation during a low-traffic window (the cron runs every 5 minutes, so worst case is a 5-minute gap).

### 4. RESEND_API_KEY

**Where it's used:** Sending transactional emails (password reset, newsletter confirmation).

**Steps:**
1. Create a new API key in the [Resend dashboard](https://resend.com/api-keys).
2. Update in GitHub Secrets.
3. Update in Cloudflare Workers:
   ```bash
   wrangler secret put RESEND_API_KEY
   ```
4. Redeploy.
5. Revoke the old API key in the Resend dashboard.
6. **Impact:** Email sending will fail between deployment and secret update if the old key is revoked first. Always deploy the new key before revoking the old one.

### 5. R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY

**Where it's used:** Uploading images to Cloudflare R2 (`lib/r2.ts`).

**Steps:**
1. In Cloudflare dashboard, go to `R2 → Manage R2 API Tokens`.
2. Create a new token with the same permissions.
3. Update both `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY` in GitHub Secrets.
4. Update in Cloudflare Workers:
   ```bash
   wrangler secret put R2_ACCESS_KEY_ID
   wrangler secret put R2_SECRET_ACCESS_KEY
   ```
5. Redeploy.
6. Delete the old API token in the Cloudflare dashboard.
7. **Impact:** Image uploads will fail if the old token is deleted before the new one is deployed.

### 6. CLOUDFLARE_API_TOKEN

**Where it's used:** GitHub Actions deploy workflow and cache purge operations.

**Steps:**
1. In Cloudflare dashboard, go to `My Profile → API Tokens`.
2. Create a new token with the same permissions (Workers, Pages, Zone:Cache Purge).
3. Update in GitHub Secrets (`CLOUDFLARE_API_TOKEN`).
4. Delete the old token.
5. **Impact:** Only affects the CI/CD pipeline — the production app is not impacted.

### 7. TURNSTILE_SECRET_KEY

**Where it's used:** Server-side Turnstile captcha verification for newsletter signups.

**Steps:**
1. In Cloudflare dashboard, go to `Turnstile → [your widget] → Settings`.
2. Regenerate the secret key.
3. Update in GitHub Secrets and Cloudflare Workers.
4. Redeploy.
5. **Impact:** Newsletter signups will fail captcha verification until the new key is deployed.

## General Guidelines

- **Always deploy the new secret before revoking the old one** to avoid downtime.
- **Test in a staging environment first** if possible.
- **Coordinate rotations** — don't rotate multiple secrets simultaneously.
- **Log rotations** — keep a record of when each secret was last rotated (consider a shared spreadsheet or password manager note).
- **Use a password manager** (e.g. 1Password, Bitwarden) to store secrets with rotation date metadata.
