# Supabase Connection Pooling — Cloudflare Workers Strategy

Audit reference: production-readiness checklist item **#48 — Verify connection pooling for Cloudflare Workers**.

This document is the canonical guide for which Supabase URL is used by which client, how pooling works at each layer, and the failure modes we have already hit and locked out with regression tests.

> **TL;DR**
>
> - **Cloudflare Workers (runtime)** talk to Supabase over **HTTPS to PostgREST** at `https://<project-ref>.supabase.co`. They do **not** open Postgres connections, so they do not need (and must not be configured with) the Postgres pooler URL.
> - **CI / migrations / `psql` tooling** open real Postgres connections. They use the **Session pooler** at `aws-0-<region>.pooler.supabase.com:5432` (port `5432`, session mode) via `SUPABASE_DB_POOLER_URL`.
> - These two URLs are **not interchangeable.** Putting a pooler URL into `NEXT_PUBLIC_SUPABASE_URL` causes the JS client to speak HTTP to a Postgres socket and produces opaque 5xx errors.

---

## 1. Why this matters

Supabase exposes the same database under three different network endpoints, and we use all three for different reasons:

| Endpoint                                                | Protocol      | Pooled?             | Used by                                                            |
| ------------------------------------------------------- | ------------- | ------------------- | ------------------------------------------------------------------ |
| `https://<ref>.supabase.co`                             | HTTPS / REST  | n/a                 | **Workers** (`@supabase/supabase-js`), browser SDK, server actions |
| `aws-0-<region>.pooler.supabase.com:5432` (session)     | Postgres wire | PgBouncer (session) | **CI migrations, `psql`, `pg_dump`, `supabase db push`**           |
| `aws-0-<region>.pooler.supabase.com:6543` (transaction) | Postgres wire | PgBouncer (txn)     | Long-lived backend processes (we do not use this — see §3.3)       |

Because every URL points at the same database, a misconfiguration silently "works enough" to pass `npm run build` and only blows up at request time. The most common failure mode we have hit is:

> Operator pastes the pooler URL into `NEXT_PUBLIC_SUPABASE_URL` because a Supabase dashboard banner suggests it for "production deployments." `@supabase/supabase-js` then issues `fetch("postgresql://…/rest/v1/…")` (effectively HTTPS against port 5432), and Postgres responds with a Postgres protocol byte that the JS client surfaces as an opaque 5xx with no useful body.

A regression test in [`__tests__/cron-registry.test.ts`](../__tests__/cron-registry.test.ts) asserts that the misleading "use the pooler URL in production" guidance does not return to `.env.example`, but the error class is recurring enough that it deserves a single page operators can be pointed at.

---

## 2. The Worker / runtime path

**Use:** `NEXT_PUBLIC_SUPABASE_URL` = `https://<project-ref>.supabase.co`

```
Cloudflare Worker (Next.js runtime)
        │
        │   fetch() over HTTPS
        ▼
Supabase Edge / PostgREST  →  Postgres (Supabase manages pooling internally)
```

### 2.1 Why no Postgres pooling at the Worker layer

Cloudflare Workers do not have a persistent process to hold a connection pool in. Each request runs in a short-lived V8 isolate that is allowed to start a few outbound `fetch()` calls. The Worker therefore does the right thing already:

- It calls **PostgREST** over HTTPS via `@supabase/supabase-js`.
- The HTTPS connection is reused by Cloudflare's outbound HTTP keep-alive (per-isolate, per-colo) — see <ref_snippet file="/home/ubuntu/repos/affilite-mix/lib/supabase-server.ts" lines="30-40" />.
- **PostgREST** (running inside Supabase) holds the actual Postgres connection pool. From the Worker's perspective there is no Postgres connection at all.

This means **no client-side pooling configuration is needed or wanted** in `wrangler.jsonc`, in `lib/supabase-server.ts`, or in any other Worker-runtime code. Setting `NEXT_PUBLIC_SUPABASE_URL` to a `pooler.supabase.com` host makes the JS client try to speak HTTPS to the Postgres protocol port and breaks every request.

### 2.2 Client caching

To avoid re-creating the JS client on every request inside a single isolate, [`lib/supabase-server.ts`](../lib/supabase-server.ts) caches the anon client in module scope:

<ref_snippet file="/home/ubuntu/repos/affilite-mix/lib/supabase-server.ts" lines="38-45" />

This is **not** a connection pool — it just avoids re-allocating a JS object and re-wiring `fetch` interceptors. The underlying HTTP keep-alive is handled by the Cloudflare runtime, not by the client.

The privileged service-role client lives in [`lib/server-only/service-role.ts`](../lib/server-only/service-role.ts) and is similarly cached per-isolate. It is reachable only via the gateway helper `getPrivilegedSupabaseClient()`; an ESLint rule in `eslint.config.mjs` blocks new code from importing the legacy `getServiceClient()` shim. See [`docs/supabase.md`](./supabase.md#known-remaining-risks) for context.

### 2.3 What goes wrong when the wrong URL is used

| Symptom                                                       | Likely cause                                                                             |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Every API call returns 5xx with no body, no Sentry breadcrumb | `NEXT_PUBLIC_SUPABASE_URL` points at the pooler host                                     |
| `fetch failed` / `unable to verify the first certificate`     | Pooler host's TLS cert does not match the JS client's HTTPS validator                    |
| Local dev works, deployed Worker does not                     | Local has the REST URL in `.env.local`; deployed Worker secret was set to the pooler URL |
| `supabase db push` works, but the app does not                | Confirms the DB URL is correct; the bug is on `NEXT_PUBLIC_SUPABASE_URL`                 |

Recovery: reset `NEXT_PUBLIC_SUPABASE_URL` to `https://<project-ref>.supabase.co` and redeploy.

```bash
# Verify the value currently set as a Worker secret
npx wrangler secret list

# Re-set if wrong
echo "https://<project-ref>.supabase.co" | npx wrangler secret put NEXT_PUBLIC_SUPABASE_URL
```

---

## 3. The CI / migrations path

**Use:** `SUPABASE_DB_POOLER_URL` (preferred) or `SUPABASE_DB_URL` (fallback)
**Format:** `postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres`

### 3.1 Why the pooler URL is required for CI

The deploy workflow at [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) runs `psql` and `supabase db push` to apply migrations. These open real Postgres connections.

GitHub-hosted runners are **IPv4-only**, and the direct DB host (`db.<ref>.supabase.co`) is **IPv6-only on Supabase's free tier**. Without a pooler URL the workflow fails with `Connection refused / network unreachable` at the `psql` step. The Session-mode pooler resolves to a stable IPv4 address, which is why we use it for CI even though the same database is reachable over IPv6 from a Workstation that supports it.

### 3.2 Session mode (port 5432), not transaction mode (6543)

Migrations require:

- `SET LOCAL` (used by Supabase migrations to fix `search_path`)
- Multi-statement transactions
- `LISTEN`/`NOTIFY` on advisory locks
- Prepared statements that survive the round trip

Transaction-mode pooling (PgBouncer in `transaction` mode, port `6543`) does **not** support those, so migrations would fail mid-run with cryptic errors like `prepared statement does not exist` or `cannot use SET LOCAL in transaction-mode pooling`. Always use **Session mode** on **port 5432** for migrations.

> Find the Session pooler URL in **Supabase Dashboard → Project Settings → Database → Connection pooling → Session mode**.

### 3.3 Why we do not use transaction-mode pooling

Some serverless platforms (e.g. AWS Lambda, Vercel Functions on Node runtime) recommend the transaction-mode pooler at port 6543 for backend code that opens persistent Postgres connections. **We do not run backend code that opens persistent Postgres connections.** Our request path is Worker → PostgREST (HTTPS), not Worker → Postgres directly. Transaction-mode pooling has no role in the runtime architecture.

If a future feature requires a long-running Node process with a real Postgres connection (e.g. a queue consumer running outside Cloudflare), it should:

1. Use the transaction-mode pooler URL (port 6543) — not session, and not the direct host.
2. Configure the Postgres client with `prepare: false` (PgBouncer transaction mode does not support prepared statements).
3. Set `pool_mode=transaction` in the connection string.
4. Document the new component here.

---

## 4. Configuration matrix

| Variable                        | Value                                                                               | Where it must be set                                            | Where it must NOT be set                                                               |
| ------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | `https://<ref>.supabase.co`                                                         | Worker secret, `.env.local`, GitHub Actions build env (inlined) | Anywhere — never use a pooler URL here                                                 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon JWT from Supabase Dashboard → API                                              | Same as above                                                   | —                                                                                      |
| `SUPABASE_SERVICE_ROLE_KEY`     | service-role JWT                                                                    | Worker secret only (encrypted), GitHub Actions secret           | `.env.example`, browser-exposed `NEXT_PUBLIC_*` envs, anything inlined into the bundle |
| `SUPABASE_DB_POOLER_URL`        | `postgresql://postgres.<ref>:<pw>@aws-0-<region>.pooler.supabase.com:5432/postgres` | GitHub Actions secret (CI/migrations only)                      | Worker secret — Workers never open Postgres connections                                |
| `SUPABASE_DB_URL`               | Direct DB URL (IPv6-only on free tier)                                              | GitHub Actions secret as a fallback only                        | Same                                                                                   |

`.env.example` is the operator-facing source of truth for these — see <ref_snippet file="/home/ubuntu/repos/affilite-mix/.env.example" lines="1-12" /> and <ref_snippet file="/home/ubuntu/repos/affilite-mix/.env.example" lines="68-82" />.

---

## 5. Regression tests

Two tests in `__tests__/cron-registry.test.ts` lock the surfaces above:

1. **Pooler-in-anon-URL guard** — asserts `.env.example` does not regress to suggesting a `pooler.supabase.com` URL for `NEXT_PUBLIC_SUPABASE_URL`.
2. **Per-trigger cron secrets** — separate guard, but it lives in the same test file because both errors share the same root cause: documentation drift between `.env.example` and the runtime config.

Run locally before any change to Supabase URL guidance:

```bash
npm test -- cron-registry
```

---

## 6. Verification checklist

After any deploy or any change to Supabase URLs, run through this list:

- [ ] `wrangler secret list` shows `NEXT_PUBLIC_SUPABASE_URL` and the value starts with `https://` and contains `.supabase.co` (no `pooler`).
- [ ] `curl -sf https://<canonical-domain>/api/health | jq .status` returns `"healthy"`.
- [ ] In Supabase Dashboard → **Project Settings → Database → Connection pooling**, confirm the **Session pooler** URL on port `5432` matches the value of `SUPABASE_DB_POOLER_URL` in GitHub Actions secrets.
- [ ] CI's `db push --dry-run` step succeeds against the pooler URL.
- [ ] `npm test -- cron-registry` passes locally (covers regression on `.env.example`).

If any of those fail, treat it as a P1 and roll back the change before continuing.

---

## 7. Related docs

- [`docs/supabase.md`](./supabase.md) — migration workflow and source-of-truth files
- [`docs/CLOUDFLARE.md`](./CLOUDFLARE.md) — full inventory of Worker secrets and bindings
- [`docs/architecture-data-flow.md`](./architecture-data-flow.md) — high-level data-plane diagram (note the dashed Worker→Postgres line is **PostgREST over HTTPS**, not a direct Postgres connection)
- [`docs/DR-RUNBOOK.md`](./DR-RUNBOOK.md) — restore procedure (uses the pooler URL via `psql`)
