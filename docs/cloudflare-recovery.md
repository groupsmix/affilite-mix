# Cloudflare Account Recovery Playbook

How to regain access, export critical data, and rebuild from scratch if you lose access to the Cloudflare account.

> **Audience:** Account owner / Super Administrator
> **Last updated:** April 2026

---

## Pre-Disaster Checklist (Do This NOW)

Complete these steps **before** you need them. Check each box and record where you stored the data.

### 1. Add a Second Super Administrator

A single-owner account is one forgotten password away from total lockout.

1. [Cloudflare Dashboard > Manage Account > Members](https://dash.cloudflare.com/?to=/:account/members)
2. Click **Invite Member**
3. Enter a **different email address** (ideally a shared team inbox or a personal backup)
4. Set role: **Super Administrator**
5. The invitee must accept and enable 2FA

### 2. Enable and Back Up 2FA

1. [Cloudflare Dashboard > My Profile > Authentication](https://dash.cloudflare.com/profile/authentication)
2. Enable **Two-Factor Authentication** (TOTP or WebAuthn)
3. **Save recovery codes** to your password manager (1Password, Bitwarden, etc.)
4. If using TOTP, export the TOTP secret seed so you can re-add it to a new device

### 3. Export Account Identifiers

Save these to your password manager under a "Cloudflare — Affilite-Mix" entry:

| Identifier              | Where to Find                                        | Current Value                      |
| ----------------------- | ---------------------------------------------------- | ---------------------------------- |
| Account ID              | Dashboard > any zone > Overview (right sidebar)      | `0dadac330461be7f3e6fce8cb6611ba4` |
| Zone ID (wristnerd.xyz) | Dashboard > wristnerd.xyz > Overview (right sidebar) | `a3fc8a7a314e9b6ab61362f7aacee29c` |
| Worker name             | `wrangler.jsonc` → `"name"`                          | `affilite-mix`                     |
| KV namespace ID         | `wrangler.jsonc` → `kv_namespaces[0].id`             | `7ac37dff0a794542b0c766f38e73f105` |
| R2 bucket (ISR cache)   | `wrangler.jsonc` → `r2_buckets[0].bucket_name`       | `next-inc-cache`                   |
| R2 bucket (images)      | `.env` → `R2_BUCKET_NAME`                            | `affilite-mix-images`              |
| Registrar               | Cloudflare Registrar (if domain is registered there) | Check Dashboard > Domains          |

### 4. Export DNS Records

```bash
# Using the Cloudflare API (requires API token with Zone:DNS:Read)
curl -s "https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/dns_records" \
  -H "Authorization: Bearer ${API_TOKEN}" \
  | jq '.result[] | {name, type, content, proxied, ttl}' \
  > dns-snapshot-$(date +%Y%m%d).json
```

Store the snapshot in your password manager or a secure Git repo (not this one — it may contain internal IPs).

### 5. Replace the Global API Key with a Scoped Token

The Global API Key grants **full account access**. Replace it with a scoped API Token for CI/CD:

1. [Cloudflare Dashboard > My Profile > API Tokens](https://dash.cloudflare.com/profile/api-tokens)
2. Click **Create Token**
3. Use **Custom Token** with these permissions:

| Permission                   | Access |
| ---------------------------- | ------ |
| Account > Workers Scripts    | Edit   |
| Account > Workers KV Storage | Edit   |
| Account > Workers R2 Storage | Edit   |
| Account > Workers Routes     | Edit   |
| Account > Account Settings   | Read   |
| Zone > DNS                   | Edit   |
| Zone > Cache Purge           | Purge  |

4. Scope to: **Zone = wristnerd.xyz** (where applicable)
5. Copy the token and update:
   - GitHub Secrets: `CLOUDFLARE_API_TOKEN`
   - Local `.dev.vars` (if used)
6. **Revoke the Global API Key** once the scoped token is verified working

---

## Recovery Scenarios

### Scenario A: Forgot Password (Email Still Accessible)

1. Go to [dash.cloudflare.com](https://dash.cloudflare.com)
2. Click **Forgot your password?**
3. Check your email for the reset link
4. Reset password and log in
5. If 2FA is enabled, use your recovery codes if you lost your TOTP device

### Scenario B: Lost 2FA Device (Password Known)

1. Log in with your password
2. When prompted for 2FA, click **Use a recovery code**
3. Enter one of your saved recovery codes
4. Immediately re-enroll a new 2FA device at [My Profile > Authentication](https://dash.cloudflare.com/profile/authentication)

### Scenario C: Lost Both Password and 2FA

1. If a second Super Administrator exists, they can:
   - Remove the locked-out account
   - Re-invite you with a new email
2. If no second admin exists, contact [Cloudflare Support](https://support.cloudflare.com/) with:
   - Proof of domain ownership (DNS TXT record challenge or WHOIS match)
   - Account email address
   - Last 4 of payment method (if on a paid plan)
3. Response time: 24-72 hours (varies by plan)

### Scenario D: Account Compromised

**Immediate actions (within minutes):**

1. Log in and change your password immediately
2. Revoke all API tokens: [My Profile > API Tokens](https://dash.cloudflare.com/profile/api-tokens)
3. Revoke all active sessions: [My Profile > Sessions](https://dash.cloudflare.com/profile/sessions)
4. Re-enable 2FA with a new seed
5. Check for unauthorized changes:
   - DNS records (look for new A/CNAME records)
   - Worker code (check Deployments tab)
   - Members list (remove unknown accounts)
   - Page Rules / Redirects

**Then:**

6. Rotate all secrets that were accessible via the compromised account:
   - All Worker secrets (follow [secrets-rotation-runbook.md](./secrets-rotation-runbook.md))
   - GitHub `CLOUDFLARE_API_TOKEN`
   - R2 access keys
7. Generate a new scoped API token (see step 5 in Pre-Disaster Checklist)

---

## Full Rebuild: Recreating the Cloudflare Setup from Scratch

If you need to set up the entire Cloudflare infrastructure from zero (new account, or migrating to a different account):

### Step 1: Create Account and Add Zone

1. Sign up at [cloudflare.com](https://www.cloudflare.com/)
2. Add site: `wristnerd.xyz`
3. Update nameservers at your domain registrar to the ones Cloudflare provides
4. Wait for zone activation (usually 5-60 minutes)

### Step 2: Configure DNS

Restore DNS records from your snapshot (see Pre-Disaster Checklist step 4), or create them manually:

```bash
# Example: Add an A record
curl -X POST "https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/dns_records" \
  -H "Authorization: Bearer ${API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"type":"A","name":"wristnerd.xyz","content":"192.0.2.1","proxied":true}'
```

Worker custom domains (defined in `wrangler.jsonc`) are created automatically by `wrangler deploy`.

### Step 3: Create KV Namespace

```bash
npx wrangler kv:namespace create RATE_LIMIT_KV
# Copy the returned namespace ID into wrangler.jsonc
```

### Step 4: Create R2 Buckets

```bash
# ISR incremental cache bucket (Worker binding)
npx wrangler r2 bucket create next-inc-cache

# Image uploads bucket (S3-API access — see docs/cloudflare-r2-images.md)
npx wrangler r2 bucket create affilite-mix-images
```

Create R2 API tokens for image uploads:

1. [Dashboard > R2 > Manage R2 API Tokens](https://dash.cloudflare.com/?to=/:account/r2/api-tokens)
2. Create token with Object Read & Write, scoped to `affilite-mix-images`
3. Save `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY`

### Step 5: Deploy the Worker

```bash
npx @opennextjs/cloudflare build
npx @opennextjs/cloudflare deploy
```

### Step 6: Set Worker Secrets

```bash
# Required
wrangler secret put NEXT_PUBLIC_SUPABASE_URL --name affilite-mix
wrangler secret put NEXT_PUBLIC_SUPABASE_ANON_KEY --name affilite-mix
wrangler secret put SUPABASE_SERVICE_ROLE_KEY --name affilite-mix
wrangler secret put JWT_SECRET --name affilite-mix
wrangler secret put CRON_SECRET --name affilite-mix
wrangler secret put CRON_HOST --name affilite-mix
wrangler secret put INTERNAL_API_TOKEN --name affilite-mix

# Optional (set as needed)
wrangler secret put RESEND_API_KEY --name affilite-mix
wrangler secret put SENTRY_DSN --name affilite-mix
wrangler secret put TURNSTILE_SECRET_KEY --name affilite-mix
# ... (see docs/CLOUDFLARE.md for full list)
```

### Step 7: Apply Zone Security Settings

Follow [docs/cloudflare-production.md](./cloudflare-production.md) to configure SSL, HSTS, WAF, rate limiting, and other zone-level settings.

### Step 8: Update GitHub Secrets

Update these in GitHub > Settings > Secrets and variables > Actions:

- `CLOUDFLARE_API_TOKEN` (new scoped token)
- `CLOUDFLARE_ACCOUNT_ID` (new account ID)
- All other secrets listed in [docs/CLOUDFLARE.md](./CLOUDFLARE.md#github-actions-secrets-cicd-only)

### Step 9: Verify

```bash
# Health check
curl -s -H "Authorization: Bearer ${CRON_SECRET}" \
  https://wristnerd.xyz/api/health | jq .

# All domains respond
for domain in wristnerd.xyz arabictools.wristnerd.xyz crypto.wristnerd.xyz; do
  echo "$domain: $(curl -s -o /dev/null -w '%{http_code}' https://$domain/)"
done
```

---

## Related Documents

- [docs/CLOUDFLARE.md](./CLOUDFLARE.md) — canonical resource inventory and deploy runbook
- [docs/cloudflare-production.md](./cloudflare-production.md) — zone security and performance settings
- [docs/secrets-rotation-runbook.md](./secrets-rotation-runbook.md) — how to rotate each secret
- [docs/incident-response.md](./incident-response.md) — production incident response playbook
- [docs/backup-strategy.md](./backup-strategy.md) — database and media backup strategy
