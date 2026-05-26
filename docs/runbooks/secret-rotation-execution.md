# Runbook: Secret Rotation Execution

**Severity:** P1 — security-critical
**Owner:** Security team
**Last reviewed:** 2026-05-25

## Overview

This runbook covers the rotation of all secrets used by affilite-mix. Secrets are stored in environment variables (Cloudflare Workers secrets, Vercel env vars, GitHub Actions secrets) and must be rotated on a regular schedule or immediately upon suspected compromise.

## Secret Inventory

| Secret                                      | Storage                    | Rotation Schedule | Impact of Exposure            |
| ------------------------------------------- | -------------------------- | ----------------- | ----------------------------- |
| `SUPABASE_SERVICE_ROLE_KEY`                 | Workers secret, Vercel env | 90 days           | Full DB access, RLS bypass    |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`             | Workers secret, Vercel env | 90 days           | Public-facing, limited by RLS |
| `STRIPE_SECRET_KEY`                         | Workers secret, Vercel env | 90 days           | Payment processing            |
| `STRIPE_WEBHOOK_SECRET`                     | Workers secret             | 90 days           | Webhook validation            |
| `CRON_SECRET`                               | Workers secret, Vercel env | 90 days           | Cron job authorization        |
| `ADMIN_JWT_SECRET`                          | Workers secret, Vercel env | 90 days           | Admin session tokens          |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | Workers secret             | 90 days           | Object storage access         |
| `CLOUDFLARE_API_TOKEN`                      | GitHub Actions secret      | 90 days           | DNS, Workers deployment       |
| `SENTRY_DSN`                                | Vercel env                 | 365 days          | Error reporting               |

## Emergency Rotation (Suspected Compromise)

### 1. Immediate Actions

1. **Identify scope:** Which secret(s) may be compromised?
2. **Revoke immediately** — do not wait for rotation. Generate new credentials first, then revoke old ones.
3. **Notify:** Post in #security channel with incident details.

### 2. Supabase Keys

```bash
# 1. Go to Supabase Dashboard → Project Settings → API
# 2. Click "Generate new keys" (this immediately invalidates old keys)
# 3. Update all consumers:

# Cloudflare Workers
wrangler secret put SUPABASE_SERVICE_ROLE_KEY
wrangler secret put NEXT_PUBLIC_SUPABASE_ANON_KEY

# Vercel
vercel env rm SUPABASE_SERVICE_ROLE_KEY production
vercel env add SUPABASE_SERVICE_ROLE_KEY production

# GitHub Actions (for CI tests)
gh secret set SUPABASE_SERVICE_ROLE_KEY
```

### 3. Stripe Keys

```bash
# 1. Go to Stripe Dashboard → Developers → API keys
# 2. Click "Roll key" on the secret key
# 3. Stripe gives a 72-hour grace period where both old and new keys work
# 4. Update all consumers:

wrangler secret put STRIPE_SECRET_KEY
vercel env rm STRIPE_SECRET_KEY production
vercel env add STRIPE_SECRET_KEY production

# 5. For webhook secret: Stripe Dashboard → Webhooks → endpoint → Roll secret
wrangler secret put STRIPE_WEBHOOK_SECRET
```

### 4. Admin JWT Secret

```bash
# 1. Generate new secret
NEW_SECRET=$(openssl rand -base64 48)

# 2. Update all consumers
wrangler secret put ADMIN_JWT_SECRET
vercel env rm ADMIN_JWT_SECRET production
vercel env add ADMIN_JWT_SECRET production

# 3. IMPORTANT: All existing admin sessions are immediately invalidated
#    Admin users will need to log in again
```

### 5. Cloudflare API Token

```bash
# 1. Cloudflare Dashboard → My Profile → API Tokens
# 2. Create new token with same permissions as old one
# 3. Update GitHub Actions secret
gh secret set CLOUDFLARE_API_TOKEN

# 4. Update Terraform variables
# 5. Delete old token
```

## Scheduled Rotation

For scheduled 90-day rotations, follow the same procedures above but in a non-emergency cadence:

1. Generate new credentials
2. Update all consumers (Workers, Vercel, GitHub Actions)
3. Deploy to verify new credentials work
4. Verify monitoring dashboards show no auth failures
5. Revoke old credentials after 24-hour soak period
6. Update rotation log (see below)

## Rotation Log

Maintain a rotation log entry in the team's secure documentation:

```
Date: YYYY-MM-DD
Secret: <name>
Rotated by: <person>
Reason: scheduled | compromise | employee-departure
Verification: <describe how you verified the new secret works>
Old secret revoked: yes/no (if no, when?)
```

## Post-Rotation Verification

- [ ] Application starts without errors (check Sentry for new exceptions)
- [ ] API endpoints return 200 (not 401/403)
- [ ] Stripe webhooks delivering successfully (check Stripe Dashboard → Webhooks → Recent deliveries)
- [ ] Cron jobs executing on schedule (check cron logs)
- [ ] Admin login works
- [ ] No elevated error rates in monitoring dashboards
- [ ] Old credentials revoked

## Rollback

If new credentials cause issues:

1. Re-deploy with the old credentials (if not yet revoked)
2. Investigate the failure
3. Retry rotation with corrected credentials
