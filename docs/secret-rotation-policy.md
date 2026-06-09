# Secret Rotation Policy

> A38: Secret lifecycle management — rotation cadence, break-glass procedures,
> and access-log review requirements.
>
> **Sister docs:** [`secrets-rotation-runbook.md`](./secrets-rotation-runbook.md)
> (step-by-step per-secret procedures) and [`secrets-rotation.md`](./secrets-rotation.md)
> (OF-34 short summary). This file is the **inventory of record** — every
> production env var listed below must have a row, an owner, and a
> rotation procedure linked from `secrets-rotation-runbook.md`.

## Pre-flight env hygiene (verify before launch)

These are not rotations — they're one-time setup checks. Re-run before
any production cut-over.

| Check                                             | Expected value                             | Where                           |
| ------------------------------------------------- | ------------------------------------------ | ------------------------------- |
| `AFFILIATE_DOMAIN_ENFORCEMENT` is set             | `strict`                                   | Cloudflare → Worker → Variables |
| `INTERNAL_HMAC_MIGRATION_MODE` is set             | `strict`                                   | Cloudflare → Worker → Variables |
| `NODE_ENV` is set                                 | `production`                               | Cloudflare → Worker → Variables |
| `RATE_LIMIT_FORCE_OPEN` is unset or `false`       | unset / `false`                            | Cloudflare → Worker → Variables |
| `ENABLE_TURNSTILE` is set                         | `true` (or unset — defaults to ON in prod) | Cloudflare → Worker → Variables |
| `ALLOW_TURNSTILE_DISABLED_IN_PROD` is **not** set | unset                                      | Cloudflare → Worker → Variables |

Without `AFFILIATE_DOMAIN_ENFORCEMENT=strict` the `/api/track/click`
endpoint is an open redirector (audit R-01). Without `INTERNAL_HMAC_MIGRATION_MODE=strict`
the legacy bearer fallback for internal endpoints stays armed (audit CR-01).
Both are hard-required by `lib/server-env.ts` in production — startup will
log them as missing — but neither is _enforced_ at request time, so a
mis-deploy can silently ship without them.

### Plaintext vs Secret

Cloudflare Workers lets you mark a variable as **Secret** (encrypted, value
not readable from the dashboard) or **Plaintext** (readable). Knobs you
need to inspect during an incident must be Plaintext or you cannot verify
their value when it matters most. Recommended classification:

| Variable                       | Marking   | Why                                                                |
| ------------------------------ | --------- | ------------------------------------------------------------------ |
| `NODE_ENV`                     | Plaintext | non-sensitive switch                                               |
| `INTERNAL_HMAC_MIGRATION_MODE` | Plaintext | non-sensitive switch, must be readable during HMAC incidents       |
| `AFFILIATE_DOMAIN_ENFORCEMENT` | Plaintext | non-sensitive switch, must be readable during open-redirect drills |
| `KV_GRACE_MS`                  | Plaintext | numeric tuning knob                                                |
| `LOGIN_RATE_LIMIT_GLOBAL_MAX`  | Plaintext | numeric tuning knob                                                |
| `RATE_LIMIT_FORCE_OPEN`        | Plaintext | boolean kill-switch — **must** be readable when triaging limiter   |
| `CRON_HOST`                    | Plaintext | non-secret URL                                                     |
| Everything else below          | Secret    | keys, tokens, signing material                                     |

## Production secret inventory

Every Cloudflare Worker secret / variable for `affilite-mix` in production.
Group ordering matches `lib/server-env.ts`. "Owner" is the runtime module
that consumes the value — the file you grep first when a rotation breaks
something.

### Platform — Supabase + auth core

| Secret                                                      | Cadence  | Owner module                        | Blast radius on missing                                                 | Procedure                               |
| ----------------------------------------------------------- | -------- | ----------------------------------- | ----------------------------------------------------------------------- | --------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`                                  | rare     | `lib/supabase-server.ts`            | App fails to start                                                      | `secrets-rotation-runbook.md` §2        |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`                             | rare     | `lib/supabase-server.ts`            | Public reads fail                                                       | `secrets-rotation-runbook.md` §2        |
| `SUPABASE_SERVICE_ROLE_KEY`                                 | 90 days  | `lib/server-only/*`                 | All DB writes fail (RLS bypass disabled)                                | `secrets-rotation-runbook.md` §2        |
| `SUPABASE_JWT_SECRET`                                       | 90 days  | `lib/supabase-server.ts`            | RLS JWT signing fails                                                   | `secrets-rotation-runbook.md` §2        |
| `JWT_SECRET` / `JWT_SECRET_CURRENT` / `JWT_SECRET_PREVIOUS` | 90 days  | `lib/auth.ts` + `lib/jwt-secret.ts` | All admin sessions invalidated (single-key) or zero-downtime (dual-key) | `secrets-rotation-runbook.md` §1        |
| `INTERNAL_API_TOKEN`                                        | 90 days  | `lib/internal-auth.ts`              | Internal middleware ↔ API calls fail (HMAC strict)                      | `secrets-rotation-runbook.md` §3        |
| `TOTP_ENCRYPTION_KEY` (+ `_V`)                              | 180 days | `lib/totp.ts`                       | All TOTP shared secrets at rest unreadable until re-enrolled            | `secrets-rotation-runbook.md` §3a (new) |

### Cron — dispatcher + 11 per-trigger secrets (CR-02)

| Secret                        | Cadence | Cron job triggered                                                               | Source of truth              |
| ----------------------------- | ------- | -------------------------------------------------------------------------------- | ---------------------------- |
| `CRON_HOST`                   | rare    | dispatcher target host (heavy-crons worker)                                      | `wrangler.heavy-crons.jsonc` |
| `CRON_SECRET`                 | 90 days | shared fallback (rejected in prod unless `CRON_ALLOW_SHARED_FALLBACK_IN_PROD=1`) | `lib/cron-auth.ts`           |
| `CRON_PUBLISH_SECRET`         | 90 days | publish                                                                          | `lib/cron-registry.ts`       |
| `CRON_STRIPE_SYNC_SECRET`     | 90 days | stripe-sync                                                                      | `lib/cron-registry.ts`       |
| `CRON_AI_SECRET`              | 90 days | ai-generate (heavy)                                                              | `lib/cron-registry.ts`       |
| `CRON_SITEMAP_SECRET`         | 90 days | sitemap-refresh                                                                  | `lib/cron-registry.ts`       |
| `CRON_RETENTION_SECRET`       | 90 days | data-retention                                                                   | `lib/cron-registry.ts`       |
| `CRON_COMMISSION_SECRET`      | 90 days | commission-ingest (heavy)                                                        | `lib/cron-registry.ts`       |
| `CRON_EPC_SECRET`             | 90 days | epc-recompute                                                                    | `lib/cron-registry.ts`       |
| `CRON_PRICE_SECRET`           | 90 days | price-scrape (heavy)                                                             | `lib/cron-registry.ts`       |
| `CRON_DEALS_SECRET`           | 90 days | expire-deals                                                                     | `lib/cron-registry.ts`       |
| `CRON_CLICK_RECONCILE_SECRET` | 90 days | click-reconcile                                                                  | `lib/cron-registry.ts`       |
| `CRON_ACCESS_REVIEW_SECRET`   | 90 days | access-review                                                                    | `lib/cron-registry.ts`       |

> **Rotate them as a batch.** The 11 per-trigger secrets exist so a leak of
> one cron's secret cannot forge another cron's trigger (CR-02). Rotating
> them individually defeats the auditability benefit of the batch — and
> a single mis-rotated secret silently disables that job until the next
> deploy. Use `scripts/rotate-cron-secrets.sh` (generates 11 fresh
> values, pushes each via `wrangler secret put`, prints the audit-log
> entry to paste into the rotation log).

### Privacy + integrity hashing (CF-03)

| Secret                 | Cadence | Owner module                   | Blast radius on missing                                                        | Procedure                               |
| ---------------------- | ------- | ------------------------------ | ------------------------------------------------------------------------------ | --------------------------------------- |
| `CLICK_CACHE_HMAC_KEY` | 90 days | `app/api/track/click/route.ts` | Click-cache integrity drops to best-effort; cached entries reject after rotate | `secrets-rotation-runbook.md` §3b (new) |
| `GDPR_HASH_SECRET`     | rare    | `lib/gdpr-hash.ts`             | PII hashing falls back **closed** (throws) — analytics writers block           | `secrets-rotation-runbook.md` §3b (new) |

> `GDPR_HASH_SECRET` rotation is destructive — old hashes will not match
> new hashes, so any de-duplication / lookup keyed on these hashes resets.
> Only rotate when compromised or when a privacy review explicitly requires it.

### R2 (object storage)

| Secret                 | Cadence  | Owner module                               | Source of truth             |
| ---------------------- | -------- | ------------------------------------------ | --------------------------- |
| `R2_ACCOUNT_ID`        | rare     | `lib/r2.ts`                                | Cloudflare account          |
| `R2_BUCKET_NAME`       | rare     | `lib/r2.ts`                                | Cloudflare R2               |
| `R2_PUBLIC_URL`        | rare     | `lib/r2.ts` + `lib/csp.ts` (CSP allowlist) | Cloudflare R2 custom domain |
| `R2_ACCESS_KEY_ID`     | 180 days | `lib/r2.ts`                                | R2 API tokens UI            |
| `R2_SECRET_ACCESS_KEY` | 180 days | `lib/r2.ts`                                | R2 API tokens UI            |

> Prefer **bucket-scoped** API tokens (read-write to the single bucket only)
> over account-wide tokens. Audit the token scope at every 180-day rotation.

### Captcha — Turnstile

| Secret                           | Cadence  | Owner module       | Notes                                              |
| -------------------------------- | -------- | ------------------ | -------------------------------------------------- |
| `TURNSTILE_SECRET_KEY`           | 180 days | `lib/turnstile.ts` | required when `ENABLE_TURNSTILE=true` (default ON) |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | 180 days | client widget      | public site key, but rotated as a pair             |

### Observability — Sentry

| Secret                   | Cadence                    | Owner module    | Notes                                                      |
| ------------------------ | -------------------------- | --------------- | ---------------------------------------------------------- |
| `SENTRY_DSN`             | rare (only if compromised) | `lib/sentry.ts` | required in production; missing = blind ops (audit SEC-09) |
| `NEXT_PUBLIC_SENTRY_DSN` | rare                       | client init     | client error capture                                       |
| `SENTRY_AUTH_TOKEN`      | 180 days                   | CI only         | source-map upload + release creation                       |

### Payments — Stripe (only if memberships live)

| Secret                    | Cadence | Owner module                           | Procedure                              |
| ------------------------- | ------- | -------------------------------------- | -------------------------------------- |
| `STRIPE_SECRET_KEY`       | 90 days | `app/api/membership/checkout/route.ts` | `secrets-rotation-runbook.md` §8       |
| `STRIPE_WEBHOOK_SECRET`   | 90 days | `app/api/membership/webhook/route.ts`  | `secrets-rotation-runbook.md` §9       |
| `STRIPE_PRICE_ID_INSIDER` | rare    | `app/api/membership/checkout/route.ts` | (config — rotate when re-pricing tier) |
| `STRIPE_PRICE_ID_PRO`     | rare    | `app/api/membership/checkout/route.ts` | (config — rotate when re-pricing tier) |
| `STRIPE_PRICE_MAP`        | rare    | `app/api/membership/checkout/route.ts` | (config)                               |

### Email — Resend (only if `NEWSLETTER_ENABLED=1`)

| Secret           | Cadence  | Owner module            |
| ---------------- | -------- | ----------------------- |
| `RESEND_API_KEY` | 180 days | `app/api/newsletter/**` |

### Affiliate networks (only if used)

| Secret                 | Cadence  | Owner module        |
| ---------------------- | -------- | ------------------- |
| `ADMITAD_API_KEY`      | 180 days | network ingest cron |
| `CJ_API_KEY`           | 180 days | network ingest cron |
| `PARTNERSTACK_API_KEY` | 180 days | network ingest cron |

### AI providers (any one valid key keeps the chain working)

| Secret                    | Cadence  | Owner module                       |
| ------------------------- | -------- | ---------------------------------- |
| `CLOUDFLARE_AI_API_TOKEN` | 180 days | AI fallback chain (1st preference) |
| `GEMINI_API_KEY`          | 180 days | AI fallback chain                  |
| `GROQ_API_KEY`            | 180 days | AI fallback chain                  |
| `COHERE_API_KEY`          | 180 days | AI fallback chain                  |

### CI-only

| Secret                    | Cadence                                 | Where                         |
| ------------------------- | --------------------------------------- | ----------------------------- |
| `CLOUDFLARE_API_TOKEN`    | 180 days                                | GitHub Secrets (deploy auth)  |
| `SOCKET_SECURITY_API_KEY` | 180 days                                | GitHub Secrets (supply chain) |
| `GITHUB_TOKEN`            | DEPRECATED (A35: migrate to GitHub App) | GitHub Secrets                |

## Rotation Procedure (single secret)

### Manual rotation steps

1. **Generate new secret** using cryptographically secure random:

   ```bash
   openssl rand -hex 64  # For 256-bit secrets
   openssl rand -hex 32  # For 128-bit secrets
   ```

2. **Update in Cloudflare Workers**:

   ```bash
   echo -n "new-secret-value" | wrangler secret put SECRET_NAME
   ```

3. **Update GitHub Secrets** (if CI uses it):

   ```bash
   gh secret set SECRET_NAME --body "new-secret-value"
   ```

4. **Verify the new secret works** before revoking the old one:

   ```bash
   curl -H "Authorization: Bearer new-secret" https://<domain>/api/health
   ```

5. **Revoke the old secret** after confirming the new one works.

6. **Document the rotation** in the inventory table above (date + actor).

### Batch rotation — all 11 cron secrets

Use the helper script:

```bash
./scripts/rotate-cron-secrets.sh
```

This generates 11 fresh `openssl rand -hex 32` values, pushes each via
`wrangler secret put` for the main Worker **and** the heavy-crons
dispatcher, then prints an audit-log entry to paste into the inventory
table. Always pair with a `wrangler deploy` rollout (see
`secrets-rotation-runbook.md` "How rotation reaches the running Worker").

## Break-Glass Secret Access

### When to use break-glass

- Emergency incident response requiring direct secret access
- Automated rotation pipeline failure
- Security incident (suspected secret compromise)

### Break-glass procedure

1. **Request approval** from the security lead (via PagerDuty/Slack).
2. **Access the secret** via the Cloudflare Dashboard or GitHub Secrets UI directly:
   - Cloudflare: Account → Workers → Settings → Variables → reveal value.
   - GitHub: Repository → Settings → Secrets → update/reveal.
3. **Log the access** — create a GitHub Issue titled `BREAK-GLASS: <SECRET_NAME> — <INCIDENT-ID>` with the requester, approver, reason, and timestamp.
4. **Rotate the accessed secret** within 24 hours of break-glass use.

> **A181-F2 note:** The previously referenced `break-glass-access.yml` workflow does not exist. The manual procedure above is the current break-glass process. A future improvement is to create a workflow that automates step 3 (audit logging) — tracked as an action item below.
>
> **A181-F1 note:** Include break-glass activation in the quarterly tabletop exercises (`docs/tabletop-exercises.md`) to validate the procedure under simulated incident conditions.

## Access log review

### Monthly review

- Review GitHub Actions secret access logs
- Review Cloudflare audit log for secret API calls
- Review `wrangler secret` usage in CI logs

### Indicators of compromise

- Secret accessed outside of CI/CD pipeline
- Secret accessed by unknown IP address
- Multiple failed authentication attempts
- Secret used after rotation window

## Dynamic secrets (future)

Migrate to HashiCorp Vault or Cloudflare Secrets Store for:

- Automatic rotation without code changes
- Dynamic short-lived credentials
- Fine-grained access policies
- Audit logging

## Compliance mapping

| Requirement  | Control                    | Evidence                      |
| ------------ | -------------------------- | ----------------------------- |
| SOC 2 CC6.1  | 90-day rotation            | Rotation schedule + audit log |
| SOC 2 CC6.2  | Break-glass logging        | break-glass-access.yml runs   |
| SOC 2 CC7.2  | Secret compromise response | Incident response playbook    |
| GDPR Art. 32 | Encryption key rotation    | JWT_SECRET rotation log       |
