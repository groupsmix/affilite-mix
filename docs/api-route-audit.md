# API Route-by-Route Auth Audit

This document is the **human-readable** view of the route audit. The machine-readable source of truth lives in:

- [`lib/api-route-metadata.ts`](../lib/api-route-metadata.ts) — registry + TypeScript types
- [`lib/api-contract-schema.ts`](../lib/api-contract-schema.ts) — machine-readable schemas for representative contracts
- [`__tests__/api-routes-metadata.test.ts`](../__tests__/api-routes-metadata.test.ts) — tests that fail when a new route is added without metadata

## What is recorded for every route

| Field             | Meaning                                                                                           |
| ----------------- | ------------------------------------------------------------------------------------------------- |
| `path`            | Next.js route path (e.g. `/api/admin/sites/[id]`)                                                 |
| `methods`         | HTTP methods exported by the handler                                                              |
| `auth`            | `public` / `admin` / `super_admin` / `cron` / `internal` / `stripe-webhook` / `token`             |
| `adminRequired`   | Shortcut for "requires admin cookie session" (always matches `auth`)                              |
| `scope`           | `site` (tenant-scoped by active-site cookie), `tenant` (org-wide), or `global` (platform-wide)    |
| `rateLimit`       | Whether the handler enforces rate limiting (`checkRateLimit` / `requireAdmin` default of 600/min) |
| `csrf`            | Whether the handler enforces double-submit CSRF (required for cookie-auth mutations)              |
| `requestSchema`   | Name of the request body schema, or `null` if no body                                             |
| `responseSchema`  | Short description or schema name for the response body                                            |
| `sensitiveFields` | Fields redacted from logs / audit entries (passwords, tokens, PII)                                |

## How the audit is enforced

`__tests__/api-routes-metadata.test.ts` walks the filesystem under `app/api/**` for every `route.ts` and asserts:

1. Each discovered route has a matching entry in `API_ROUTE_METADATA`.
2. No registry entry references a deleted route.
3. Every entry has all required metadata fields populated.
4. Every cookie-authenticated mutation (`admin` / `super_admin` with a non-GET method) enforces CSRF.

If you add a new route, the test will fail until you add an entry to `lib/api-route-metadata.ts`. This keeps the audit from silently decaying.

Run `npm run generate:openapi` after changing route metadata or contract
schemas. Commit the generated `openapi.yaml`; do not edit it by hand.

## Summary of the current audit

As of this audit pass, every route in `app/api/**` falls into one of these buckets:

| Bucket                                                                                                                                                                                       | Auth               | Typical CSRF / rate-limit posture                                             |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ----------------------------------------------------------------------------- |
| `/api/admin/**`                                                                                                                                                                              | `admin`            | All mutations enforce CSRF; 600 req/min per session via `requireAdmin`        |
| `/api/admin/users/**` (writes), `/api/admin/permissions`, `/api/admin/privacy/user`                                                                                                          | `super_admin`      | Same as admin, plus explicit `assertRole('super_admin')`                      |
| `/api/auth/**`                                                                                                                                                                               | `public` / `admin` | IP + email rate limiting; CSRF on all mutations; Turnstile on login & forgot  |
| `/api/cron/**`                                                                                                                                                                               | `cron`             | `Authorization: Bearer <CRON_*_SECRET>`; per-trigger secret with fallback     |
| `/api/internal/**`, `/api/queue/*`, `/api/revalidate`                                                                                                                                        | `internal`         | Gated by `INTERNAL_API_SECRET`; intended for Worker-to-Worker calls only      |
| `/api/membership/webhook`                                                                                                                                                                    | `stripe-webhook`   | Signature verification on raw body; no CSRF, no cookie auth                   |
| `/api/newsletter/confirm`, `/api/newsletter/unsubscribe`, `/api/auth/reset-password`                                                                                                         | `token`            | Signed single-use token; no cookie auth                                       |
| `/api/health`, `/api/csp-report`, `/api/vitals`, `/api/track/**`, `/api/products/**`, `/api/quiz/**`, `/api/community/**`, `/api/newsletter`, `/api/gift-finder`, `/api/membership/checkout` | `public`           | Rate-limited; CSRF enforced on state-changing POSTs where cookies are present |

## Adding a new route

1. Implement the route under `app/api/…/route.ts`.
2. Add an entry to `API_ROUTE_METADATA` in `lib/api-route-metadata.ts`. **All fields must be filled in** — `null` is a valid explicit value, `undefined` is not.
3. Run `npm run test -- api-routes-metadata` and confirm it passes.
4. If the route is a cookie-authenticated mutation, verify CSRF is enforced (`@/lib/csrf`).
5. If the route returns or logs any PII or secret, add it to `sensitiveFields` so future redaction audits pick it up.

## Field conventions

- `auth: "public"` — genuinely unauthenticated. Use `rateLimit: true` and `csrf: true` for any public mutation that sets a cookie or has CSRF-relevant side effects.
- `auth: "token"` — the endpoint authenticates via a signed single-use token (newsletter confirm/unsubscribe, password reset). No session cookie is trusted; CSRF is not applicable.
- `auth: "internal"` — the endpoint is called Worker-to-Worker and gated by `INTERNAL_API_SECRET`. These routes are **not** rate-limited at the application layer because Cloudflare Workers already provides isolation and the caller is trusted.
- `auth: "cron"` — scheduled trigger. The caller must present `Authorization: Bearer <CRON_*_SECRET>`; see `docs/secrets-rotation-runbook.md` §3.

## Related docs

- `docs/audit-log-review-runbook.md` — which admin actions are audit-logged + alerted
- `docs/alerting-runbook.md` — pager routing and severity tiers
- `docs/secrets-rotation-runbook.md` — rotation procedures for every secret referenced above
- `docs/threat-model.md` — threat modelling context for the routes in this audit
