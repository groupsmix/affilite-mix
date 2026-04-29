# Secrets Rotation Runbook

This document describes how to rotate each secret used by Affilite-Mix, the expected impact, and recommended rotation frequency.

---

## How rotation reaches the running Worker (`wrangler` rollout)

Cloudflare Workers read secrets at request time, not at deploy time, so a `wrangler secret put` call updates the **secret store** instantly but does **not** force a redeploy. New isolates spin up with the new value, but isolates that already exist keep serving traffic with whatever they captured the first time they read the env.

Two mechanisms make sure a rotation actually reaches every isolate:

1. **`wrangler deploy` rollout (recommended).** A deploy invalidates every existing isolate, so the next request mints a fresh isolate that reads the rotated secret from `process.env`. This is the only way to guarantee 100% propagation in seconds. Every rotation procedure below ends with a redeploy step for this reason — do not skip it on the assumption that `wrangler secret put` is enough on its own.

2. **5-minute TTL on memoised clients (G-30).** The privileged Supabase client gateway in `lib/server-only/service-role.ts` caps its per-isolate cache at 5 minutes. After the TTL expires, the next call re-reads `process.env` and mints a fresh client. The cache is also invalidated immediately if the URL or key in `process.env` differs from the values used to mint the cached client, so a rotation combined with a `wrangler deploy` rollout takes effect on the next request. This is the safety net for any isolate that survives a rotation when the redeploy is delayed; it is **not** a substitute for the rollout.

**Operational rule of thumb:** always pair `wrangler secret put` with a `wrangler deploy` (or trigger the GitHub Actions deploy workflow) within the same change window. The TTL exists to make a missed rollout self-heal within ≤ 5 minutes; relying on it as the primary rotation mechanism leaves a 5-minute window where some isolates serve traffic with the old key.

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

### 1. `JWT_SECRET` (admin session signing key)

The admin auth layer (`lib/auth.ts` + `lib/jwt-secret.ts`, F-AUTH-03) supports a **dual-key rotation** so that rotating the JWT signing key does **not** force every admin to re-authenticate. Three env vars participate:

- `JWT_SECRET_CURRENT` — the key used to **sign** new tokens. Verified first on every request. Takes precedence over `JWT_SECRET` when set.
- `JWT_SECRET` — legacy single-key fallback. Used to sign + verify when `JWT_SECRET_CURRENT` is unset.
- `JWT_SECRET_PREVIOUS` — the old key, kept for the rotation grace window. **Verification only**; never used to sign. The `verifyToken` flow tries the current key first, then falls back to this on a JOSE error.

Tokens TTL is 8 hours (`EXPIRY = "8h"` in `lib/auth.ts`), so a 24-hour grace window comfortably covers all in-flight sessions.

#### 1a. Preferred procedure — zero-downtime dual-key rotation

**Impact:** No user-visible session loss. Existing tokens stay valid until they expire naturally (≤ 8 h). New logins are signed with the new key.

**Steps:**

1. **Rehearse the rotation locally first** — see [Tabletop rehearsal / dry-run](#tabletop-rehearsal--dry-run) below. Do not skip this step on a real prod rotation.

2. Generate the new key:

   ```bash
   NEW_JWT_SECRET=$(openssl rand -hex 64)
   echo "New key length: ${#NEW_JWT_SECRET}"   # must be 128 hex chars
   ```

3. Capture the **current** signing key as the new `JWT_SECRET_PREVIOUS`. If the previous rotation already populated `JWT_SECRET_CURRENT`, copy that value; otherwise copy `JWT_SECRET`. Store this securely — you will need to remove it after the grace window closes.

4. Update Worker secrets in this exact order (the verifier reads `JWT_SECRET_PREVIOUS` first, so configure it before promoting `JWT_SECRET_CURRENT`):

   ```bash
   echo "$OLD_SIGNING_KEY"  | wrangler secret put JWT_SECRET_PREVIOUS --name affilite-mix
   echo "$NEW_JWT_SECRET"   | wrangler secret put JWT_SECRET_CURRENT  --name affilite-mix
   ```

5. Update both `JWT_SECRET_CURRENT` and `JWT_SECRET_PREVIOUS` in GitHub Secrets so future deploys propagate the same pair.

6. **Trigger a `wrangler deploy` rollout** (push to `main` or run the deploy workflow manually). See [How rotation reaches the running Worker](#how-rotation-reaches-the-running-wrangler-rollout) — `wrangler secret put` alone does not force isolates to re-read. The 5-minute TTL on the cached secret in `lib/jwt-secret.ts` (`SECRET_CACHE_TTL_MS`) self-heals any isolates the rollout missed, but a deploy is the only way to guarantee immediate propagation.

7. **Verify the rotation took effect** before closing the grace window:
   - Issue a fresh login. The resulting token's `kid` header (first 8 hex chars of `SHA-256(JWT_SECRET_CURRENT)`) must match the new key, not the old one. Decode with `npx jose decode <token>` or any JWT inspector.
   - Confirm an existing pre-rotation session (e.g. an admin who logged in before step 6) still works. If it 401s, the grace-window fallback is mis-wired — roll back via step "Rollback during grace window" before continuing.
   - Tail Workers logs and confirm no `Token rejected: explicitly revoked` or `JOSEError: signature verification failed` spike.

8. **Wait at least 24 hours** (token TTL 8 h × 3 for safety). All tokens signed with the old key will have expired naturally by then.

9. Remove `JWT_SECRET_PREVIOUS`:

   ```bash
   wrangler secret delete JWT_SECRET_PREVIOUS --name affilite-mix
   ```

   Also delete the `JWT_SECRET_PREVIOUS` entry from GitHub Secrets. Keep `JWT_SECRET_CURRENT` set — the next rotation will repeat from step 2.

10. Record the rotation in `docs/pre-launch.md` rotation log (date + actor).

**Rollback during grace window:** If the new key breaks logins (e.g. corrupted secret put, length mismatch), the old key is still active via `JWT_SECRET_PREVIOUS`. Swap them back:

```bash
# Restore the old key as the signing key, and demote the broken new key
# to PREVIOUS so any tokens it managed to sign keep verifying until
# they expire.
echo "$OLD_SIGNING_KEY"  | wrangler secret put JWT_SECRET_CURRENT  --name affilite-mix
echo "$NEW_JWT_SECRET"   | wrangler secret put JWT_SECRET_PREVIOUS --name affilite-mix
```

…then redeploy. **Do not** delete `JWT_SECRET_PREVIOUS` until the rollback verification (login + existing-session check) is green.

#### 1b. Emergency (forced-logout) rotation

Use this only when the current key may have leaked and must be invalidated immediately. **All active admin sessions become invalid; admins must log in again.**

**Steps:**

1. Generate a new 64-byte hex string:
   ```bash
   openssl rand -hex 64
   ```
2. Update the Worker secret directly (single-key path; do not set `JWT_SECRET_PREVIOUS`):
   ```bash
   wrangler secret put JWT_SECRET
   wrangler secret delete JWT_SECRET_PREVIOUS --name affilite-mix 2>/dev/null || true
   wrangler secret delete JWT_SECRET_CURRENT  --name affilite-mix 2>/dev/null || true
   ```
3. Update the value in GitHub Secrets (Settings > Secrets and variables > Actions). Remove `JWT_SECRET_CURRENT` / `JWT_SECRET_PREVIOUS` if they were set.
4. Trigger a new deployment (push to `main` or manually re-run the deploy workflow).
5. Notify admin users that they will need to log in again.

For the routine 90-day rotation always prefer **1a**; reserve 1b for compromise scenarios.

#### Tabletop rehearsal / dry-run

Before applying a dual-key rotation in production, rehearse it locally to confirm the candidate new key is well-formed and that the same dual-key verify flow used by `lib/auth.ts` accepts both the old and new keys. The dry-run never touches Worker state — it mints two test tokens (one under the old key, one under the new key) and exercises the verifier against the candidate `JWT_SECRET_CURRENT` / `JWT_SECRET_PREVIOUS` pair.

```bash
# 1. Capture the values that production currently has wired. For a true
# rehearsal these should mirror prod; for a smoke test any non-empty
# value will do.
export OLD_JWT_SECRET="<current production JWT_SECRET or JWT_SECRET_CURRENT>"
export NEW_JWT_SECRET="$(openssl rand -hex 64)"

# 2. Verify the candidate is the expected length (128 hex chars = 64 bytes).
test "${#NEW_JWT_SECRET}" -eq 128 || { echo "candidate JWT secret has wrong length"; exit 1; }

# 3. Exercise the same dual-key verify flow that lib/auth.ts uses
# (try current key → fall back to previous key on JOSEError). This
# confirms a token signed under the OLD key still validates after
# JWT_SECRET_CURRENT is rotated to the NEW key — i.e. the grace window
# behaves as documented. Run from the repo root.
node --input-type=module -e '
  import("jose").then(async ({ SignJWT, jwtVerify, errors: joseErrors }) => {
    const OLD = process.env.OLD_JWT_SECRET;
    const NEW = process.env.NEW_JWT_SECRET;
    if (!OLD || !NEW) { console.error("OLD_JWT_SECRET / NEW_JWT_SECRET must be set"); process.exit(2); }
    if (OLD === NEW) { console.error("DRY-RUN FAILED: candidate equals current key"); process.exit(1); }

    const oldKey = new TextEncoder().encode(OLD);
    const newKey = new TextEncoder().encode(NEW);

    const sign = (key) => new SignJWT({ role: "admin" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("8h")
      .setAudience("affilite-mix-admin")
      .setIssuer("affilite-mix-auth")
      .sign(key);

    const oldToken = await sign(oldKey);   // simulates an in-flight session
    const newToken = await sign(newKey);   // simulates a fresh post-rotation login

    // Verifier mirrors lib/auth.ts:verifyToken — current key first,
    // previous key as a JOSEError-only fallback.
    const verifyDualKey = async (token) => {
      const opts = { audience: "affilite-mix-admin", issuer: "affilite-mix-auth" };
      try {
        await jwtVerify(token, newKey, opts);              // current = NEW
        return "current";
      } catch (err) {
        if (!(err instanceof joseErrors.JOSEError)) throw err;
        await jwtVerify(token, oldKey, opts);              // previous = OLD
        return "previous";
      }
    };

    const newResult = await verifyDualKey(newToken).catch(() => null);
    const oldResult = await verifyDualKey(oldToken).catch(() => null);
    if (newResult !== "current") { console.error("DRY-RUN FAILED: new-key token did not verify under JWT_SECRET_CURRENT"); process.exit(1); }
    if (oldResult !== "previous") { console.error("DRY-RUN FAILED: old-key token did not verify under JWT_SECRET_PREVIOUS — grace window broken"); process.exit(1); }

    // Negative control: a token signed under an unrelated key must be rejected.
    const bogusKey = new TextEncoder().encode("not-a-real-secret");
    const bogusToken = await sign(bogusKey);
    const bogusResult = await verifyDualKey(bogusToken).catch(() => null);
    if (bogusResult !== null) { console.error("DRY-RUN FAILED: bogus-key token unexpectedly verified"); process.exit(1); }

    console.log("DRY-RUN OK: new-key token verified via JWT_SECRET_CURRENT, old-key token verified via JWT_SECRET_PREVIOUS, bogus-key token rejected");
  });
'
```

A clean `DRY-RUN OK` line is the prerequisite for proceeding to step 2 of [1a](#1a-preferred-procedure--zero-downtime-dual-key-rotation). If any assertion fails, the candidate pair is broken and must not be deployed. Re-run the dry-run after each change to the candidate values.

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
6. **Trigger a `wrangler deploy` rollout** (or push to `main` to fire `.github/workflows/deploy.yml`). See the [How rotation reaches the running Worker](#how-rotation-reaches-the-running-wrangler-rollout) section above — `wrangler secret put` alone does not force existing isolates to re-read the new key. The privileged client gateway will self-heal within 5 minutes via its TTL (G-30), but a deploy is the only way to guarantee immediate propagation.
7. Verify `/api/health` returns `200 OK` and check Workers logs for any `service-role-key` auth failures during the rollout window.

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
