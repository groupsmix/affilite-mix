# Security Audit — Top 10 Critical / High Findings

**Repo:** `groupsmix/affilite-mix`
**Scope:** Static code review of authentication, multi-tenant isolation, API surface, RLS policies, middleware, secrets handling, and abuse vectors.
**Status:** Analysis only. No code changes in this PR — this document is a tracking artifact for remediation work.

Findings are ordered roughly by exploitability × blast radius. Severity labels assume a production deployment with real tenants and the Supabase anon key exposed to browsers (standard Supabase usage).

---

## 1. [CRITICAL] Public RLS policies are not request-tenant-scoped

**Files:** `supabase/schema.sql`, `supabase/migrations/00024_harden_public_rls_and_indexes.sql`, `supabase/migrations/00031_harden_public_rls_active_site_check.sql`

The public read policies for the core content tables (`products`, `content`, `pages`, `content_products`) only gate on the row's own publish/active flag and the parent site's `is_active = true`. None of them enforce that the querying request is actually scoped to the right tenant.

```sql
-- 00031_harden_public_rls_active_site_check.sql
CREATE POLICY "public_read_active_products" ON products
  FOR SELECT USING (
    status = 'active'
    AND EXISTS (SELECT 1 FROM sites WHERE sites.id = products.site_id AND sites.is_active = true)
  );
```

In a one-DB multi-tenant system, RLS is supposed to be the last line of defense. Here it isn't: an anon client holding the exposed Supabase anon key can directly query `products`, `content`, or `pages` without any `site_id` filter and receive rows from **every active tenant** in a single response. The application-layer DAL does filter by `site_id`, but any bug, new endpoint, or direct anon-key usage that forgets the filter silently leaks cross-tenant data.

**Recommendation:** Enforce request-tenant scoping inside RLS itself. Two common patterns:

1. Require `site_id` to match a session variable set by the API gateway (e.g. `current_setting('request.jwt.claims', true)::json->>'site_id'` or `current_setting('app.current_site_id', true)`). Middleware/DAL must set this before every anon query.
2. Stop using the anon role for tenant-scoped reads entirely. Route all public reads through Next.js API/DAL code that uses the service-role client with explicit `site_id` filters, and make public RLS policies return no rows by default.

Either way, remove `USING (status = 'active' AND EXISTS sites.is_active)` as the sole gate for public reads.

---

## 2. [HIGH] Cross-tenant admin access — no per-site ACL on the admin plane

**Files:** `lib/admin-guard.ts`, `app/api/admin/sites/select/route.ts`, `lib/active-site.ts`, `app/api/admin/content/route.ts`, `app/api/admin/products/route.ts`, `app/api/admin/ads/route.ts`, `app/api/admin/ai-content/route.ts`

The admin authorization model is role-only (`admin` vs `super_admin`). "Which tenant a given admin is allowed to touch" is not modelled in the database at all. Tenant scoping for admin writes is derived entirely from the `nh_active_site` cookie:

<ref_snippet file="/home/ubuntu/affilite-mix/lib/admin-guard.ts" lines="38-80" />

and the cookie is set by an endpoint that lets any authenticated admin switch to any site in the config:

<ref_snippet file="/home/ubuntu/affilite-mix/app/api/admin/sites/select/route.ts" lines="13-51" />

Consequence: a base-role `admin` created for Tenant A can POST to `/api/admin/sites/select` with Tenant B's slug and immediately gain full CRUD on B's products, content, ads, AI drafts, uploads, audit log, etc. through `requireAdmin()`. The audit log will attribute the changes to them, but nothing prevents the action.

**Recommendation:**
- Add an `admin_user_sites` (or `admin_roles_per_site`) table and require a membership row before allowing `/api/admin/sites/select` or `requireAdmin()` to accept a site.
- Have `requireAdmin()` return `403` when the session has no membership for `dbSiteId`.
- Keep `super_admin` as the only global role.

---

## 3. [HIGH] Public anon `INSERT` allowed on `affiliate_clicks` and `newsletter_subscribers`

**File:** `supabase/migrations/00024_harden_public_rls_and_indexes.sql`

```sql
CREATE POLICY "public_insert_clicks" ON affiliate_clicks
  FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM sites WHERE sites.id = affiliate_clicks.site_id));

CREATE POLICY "public_insert_newsletter" ON newsletter_subscribers
  FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM sites WHERE sites.id = newsletter_subscribers.site_id));
```

Anyone holding the `NEXT_PUBLIC_SUPABASE_ANON_KEY` (which by definition ships to every browser) can call the Supabase REST/`/rest/v1/` endpoints directly and insert rows into either table for any existing `site_id`. The application-level protections — Turnstile in `/api/newsletter`, IP rate-limiting in `/api/track/click`, double-opt-in tokens — are all bypassed because the attacker never hits the Next.js API at all. The only server-side check is "the site exists."

Practical impact:
- Mass pollution of `newsletter_subscribers` (email list poisoning / mailbomb amplification if confirmation emails go out).
- Bulk fake `affiliate_clicks` rows → broken analytics, skewed revenue-per-click, potential impact on whatever downstream payout reconciliation exists.

**Recommendation:**
- Revoke public INSERT on these tables entirely. Require the Next.js server (using the service-role client) to perform the insert after Turnstile + rate limit + token validation.
- If public INSERT must stay, add `WITH CHECK` constraints that enforce recent-server-token presence (e.g. a short-lived signed token embedded in the request), not just "site exists."

---

## 4. [HIGH] Production env validation is soft-fail

**Files:** `lib/env.ts`, `lib/supabase-server.ts`, `lib/auth.ts`

<ref_snippet file="/home/ubuntu/affilite-mix/lib/env.ts" lines="11-26" />

`requireEnvInProduction` just logs `console.error` and hands back the fallback, even in production. That propagates through every call site:

<ref_snippet file="/home/ubuntu/affilite-mix/lib/supabase-server.ts" lines="44-51" />

When `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_URL` is missing in production, `getServiceClient()` returns a client pointing at `https://placeholder.supabase.co`. Every admin API route, cron job, newsletter handler, and audit-log write then "succeeds" against a non-existent backend — misconfiguration degrades into partial runtime failure instead of a hard crash. This amplifies every other env-dependent issue (JWT_SECRET, INTERNAL_API_TOKEN, CRON_SECRET).

**Recommendation:**
- Change `requireEnvInProduction` to `throw new Error(...)` when `NODE_ENV === "production"` and `NEXT_PHASE` is not a build phase.
- Remove the placeholder fallback in `getServiceClient()` — let it throw. The caller/route handler will return 500, which is the correct behavior for "server is broken."
- Validate all required env vars once at boot (or on the first request) and fail fast.

---

## 5. [HIGH] Internal auth uses a predictable dev fallback token

**Files:** `lib/internal-auth.ts`, `middleware.ts`, `app/api/internal/resolve-site/route.ts`

<ref_snippet file="/home/ubuntu/affilite-mix/lib/internal-auth.ts" lines="18-22" />

`"__dev_only_change_me__"` is hardcoded and used as the fallback for `INTERNAL_API_TOKEN`. Middleware uses that same call to authenticate itself to `/api/internal/resolve-site`, which takes an arbitrary `domain=` query param and responds with `{ siteId, isActive }`.

Because production env enforcement (Finding #4) is soft-fail, deploying without `INTERNAL_API_TOKEN` set silently ships production with this constant. An attacker who knows (or guesses — it's a short public string in source) the fallback gets a domain-enumeration oracle for every tenant the platform hosts, including deactivated ones.

**Recommendation:**
- Remove the fallback; throw if `INTERNAL_API_TOKEN` is missing in production.
- In addition, consider moving the resolve-site lookup to an in-process call or a signed service-to-service request rather than an HTTP call the middleware has to authenticate to itself.
- Add a boot check that refuses to start the app if `getInternalToken() === DEV_FALLBACK` and `NODE_ENV === "production"`.

---

## 6. [HIGH] `JWT_SECRET` dev fallback + soft-fail env → unstable / weak session signing in prod

**File:** `lib/auth.ts`

<ref_snippet file="/home/ubuntu/affilite-mix/lib/auth.ts" lines="10-16" />

The dev fallback is `randomUUID() + randomUUID()` (good entropy) but it's generated **per process**. Combined with Finding #4, a production deploy without `JWT_SECRET` set will silently:

- sign JWTs with a secret that is different on every container/worker instance — tokens issued by worker A won't verify on worker B;
- rotate that secret on every cold start, invalidating every outstanding session.

On Cloudflare Workers / `@opennextjs/cloudflare` where isolates are frequently torn down, this is effectively "admin sessions work intermittently, and sometimes a stale token gets silently rejected as `null`." It also means the normal treatment of JWT_SECRET as a durable, shared secret is broken — operators can't rotate the real secret because the app has been running on an ephemeral one all along.

**Recommendation:**
- Remove the random dev fallback. In production, refuse to boot without `JWT_SECRET`.
- In dev, keep a fixed (documented) fallback so local sessions survive restarts.
- Cross-link with Finding #4: once env validation is hard-fail, these fallbacks are dead code and should be deleted.

---

## 7. [MEDIUM–HIGH] Newsletter unsubscribe is CSRF-exempt **and** tokenless

**Files:** `app/api/newsletter/unsubscribe/route.ts`, `middleware.ts`

<ref_snippet file="/home/ubuntu/affilite-mix/app/api/newsletter/unsubscribe/route.ts" lines="59-98" />

The POST handler unsubscribes by `(email, site_id)` only. There is no check that the caller possesses the `unsubscribe_token` generated at signup (see `app/api/newsletter/route.ts:122-129`). Middleware then exempts the route from CSRF validation:

<ref_snippet file="/home/ubuntu/affilite-mix/middleware.ts" lines="102-115" />

Combined with Finding #3 (anon SELECT on sites + enumerable `site_id` values) and the fact that newsletter emails are generally guessable for known communities, this becomes a low-effort nuisance attack: a script that POSTs `{email, site_id}` in bulk can mass-unsubscribe users, breaking the primary retention channel with only IP rate-limiting as protection.

**Recommendation:**
- Require the per-subscriber `unsubscribe_token` on the POST handler and `.eq("unsubscribe_token", token)` in the update. That's why the token exists.
- Keep the CSRF exemption (sendBeacon pattern is fine) — the token is the auth.
- Optionally: the GET link in confirmation emails should use the same token + one-click unsubscribe per RFC 8058.

---

## 8. [MEDIUM] Admin user enumeration via login timing

**Files:** `app/api/auth/login/route.ts`, `lib/auth.ts`, `lib/dal/admin-users.ts`

<ref_snippet file="/home/ubuntu/affilite-mix/lib/auth.ts" lines="38-67" />

`authenticateUser` returns `null` immediately if no admin row matches the email, before any bcrypt work happens. When the email **does** exist, `verifyPassword` runs bcrypt at cost 12 (≈100 ms per attempt). The timing difference between "unknown email" and "known email, wrong password" is easily measurable over the network and lets an attacker enumerate admin accounts.

The per-email rate limit (`10 / 15 min`) and per-IP limit (`5 / 15 min`) slow enumeration but don't fix the oracle. Rotating IPs and pacing requests under the thresholds still yields a clean list of valid admin emails.

**Recommendation:**
- Always run a bcrypt compare — even for unknown emails — against a fixed "dummy" hash of known cost. Common pattern: keep a constant bcrypt hash of a random string at app boot and call `bcrypt.compare(password, dummyHash)` when the user is missing.
- Apply the same treatment to legacy-PBKDF2 branches.
- Return the same response shape (`401 Invalid credentials`) and timing regardless of whether the email exists.

---

## 9. [MEDIUM] Admin lockout — nothing prevents disabling/demoting the last `super_admin`

**Files:** `app/api/admin/users/route.ts`, `lib/dal/admin-users.ts`

The DELETE path prevents self-deletion but nothing else:

<ref_snippet file="/home/ubuntu/affilite-mix/app/api/admin/users/route.ts" lines="182-216" />

The PATCH path allows any `super_admin` to set `is_active = false` on any other admin, including the last remaining `super_admin`:

<ref_snippet file="/home/ubuntu/affilite-mix/app/api/admin/users/route.ts" lines="121-180" />

With only the self-delete check in place, two `super_admin` accounts can lock each other out, or a compromised `super_admin` can deactivate all peers and leave the organization with no way back into the admin console. The DAL (`lib/dal/admin-users.ts`) has no guard rails either.

**Recommendation:**
- In `updateAdminUser` / the PATCH handler, reject any mutation that would leave zero active `super_admin` rows (demotion, `is_active=false`, or password break).
- Same check in `deleteAdminUser` / the DELETE handler.
- Add a `hasAnotherActiveSuperAdmin(excludingId)` helper in the DAL and call it from both paths.

---

## 10. [MEDIUM] `x-forwarded-for` is trusted for rate-limit / IP attribution

**File:** `lib/get-client-ip.ts`, used by every rate-limited endpoint (`/api/auth/login`, `/api/newsletter`, `/api/track/click`, `/api/gift-finder`, `/api/newsletter/unsubscribe`, `/api/internal/resolve-site`, …).

<ref_file file="/home/ubuntu/affilite-mix/lib/get-client-ip.ts" />

`cf-connecting-ip` is trustworthy when traffic actually comes from Cloudflare. But:
- If the app is ever reached on a non-Cloudflare path (direct origin hit, a preview/staging URL that bypasses Cloudflare, a dev deploy to Fly/Vercel, etc.), `cf-connecting-ip` is absent and the code falls back to the first comma-separated value of `x-forwarded-for` — which is fully attacker-controlled.
- The app's middleware doesn't enforce "must have come via Cloudflare" (e.g. it doesn't check `cf-ray` or an authenticated origin pull secret).

An attacker who can hit the origin directly can send `X-Forwarded-For: 1.2.3.4, 5.6.7.8` per request, with a fresh IP every time, and bypass the login and newsletter rate limits entirely — the very controls that back Findings #3 and #8.

**Recommendation:**
- Enforce "served only via Cloudflare" at the edge (Cloudflare access rule, origin pull cert, or a shared secret header that middleware requires).
- In `getClientIp`, refuse to fall through to `x-forwarded-for` unless a trust signal is present (request reached the worker via the trusted path).
- Alternatively, key rate limits on a combination (IP + session + email) so a spoofable IP alone isn't enough to reset the counter.

---

## Honorable mentions (not in the top 10, worth tracking)

- `sandboxed-ad.tsx` uses `allow-popups-to-escape-sandbox` and renders admin-authored `ad_code` from any `admin` role (not just `super_admin`). Combined with Finding #2, a low-privilege admin in one tenant can write ad code that escapes the sandbox via popups for users of another tenant they've switched into. Consider gating `ad_code` writes on `super_admin` and dropping `allow-popups-to-escape-sandbox`.
- Idle-timeout enforcement in `getAdminSession` is conditional on the `nh_admin_activity` cookie actually being present — if the cookie is missing (never set on a path, stripped by a proxy, or the response helper not called), the only expiry is the 24h JWT TTL. Make the activity cookie mandatory or move idle-tracking into the JWT itself.
- `sanitize-html` allows arbitrary `class` on `div`/`span`/`pre`/`code`. Harmless today, but with attacker-influenced global CSS (e.g. a future `site.custom_css` edit path opened up) this becomes a CSS-exfiltration / click-hijacking primitive. Consider class allow-listing.
- `app/api/admin/products/import` accepts CSV uploads via `request.formData()` with no explicit upload size cap before `.text()`. Memory/DoS risk scales with how much Next/Cloudflare buffers. Add an explicit content-length guard.
- `newsletter_subscribers.confirmation_token` is looked up in `/api/newsletter/confirm` without a `site_id` filter. UUIDv4 entropy makes guessing infeasible, so this isn't exploitable today, but it's a defense-in-depth miss — every confirm should be scoped by `site_id` too.

---

## Suggested remediation order

1. Hard-fail env validation (#4) — enables the rest to actually be enforced in prod.
2. Kill internal-auth + JWT fallbacks (#5, #6) — low-risk code removal once #4 lands.
3. Lock down public anon INSERTs on `affiliate_clicks` / `newsletter_subscribers` (#3) and add the `unsubscribe_token` check (#7) — small surgical patches with direct abuse impact.
4. Introduce per-site admin ACL (#2) — design-level change; do this before onboarding any non-trusted tenants.
5. Re-engineer RLS with a request-tenant binding (#1) — larger, touches every DAL call path but is the only way to make the "one DB, many tenants" story actually safe.
6. Timing-safe login (#8), last-super-admin guard (#9), trusted-IP enforcement (#10) — lower-risk hardening, batch together.
