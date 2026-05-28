# Rate-Limit Policy Matrix

> **S1-A4.A04** — Centralized documentation of per-route rate-limit configuration.
> Last updated: 2026-05-27

## Definitions

| Term                   | Meaning                                                                                                                     |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **failPolicy: closed** | When the rate-limit backend (KV/DO) is unavailable, reject the request (429). Prevents abuse during infrastructure outages. |
| **failPolicy: open**   | When the rate-limit backend is unavailable, allow the request. Used only for non-security-critical read-only endpoints.     |
| **failPolicy: grace**  | Allow requests for a limited grace window (`KV_GRACE_MS`, default 60 s) after KV becomes unavailable, then fail closed.     |
| **windowMs**           | Sliding window duration in milliseconds.                                                                                    |
| **maxRequests**        | Maximum requests per IP (or per-key) within the window.                                                                     |

## Route Matrix

### Authentication (all fail-closed)

| Route                              | Key Pattern            | maxRequests            | Window | failPolicy | Notes                                                    |
| ---------------------------------- | ---------------------- | ---------------------- | ------ | ---------- | -------------------------------------------------------- |
| `POST /api/auth/login` (global)    | `login-global`         | 100 (env-configurable) | 60 s   | closed     | `LOGIN_RATE_LIMIT_GLOBAL_DISABLED` kill-switch available |
| `POST /api/auth/login` (per-IP)    | `login:ip:{ip}`        | 3                      | 15 min | closed     |                                                          |
| `POST /api/auth/login` (per-email) | `login:email:{email}`  | 10                     | 15 min | closed     |                                                          |
| `POST /api/auth/login` (failed)    | `login-failed:{ip}`    | 5                      | 5 min  | closed     | Triggered after bcrypt failure                           |
| `POST /api/auth/forgot-password`   | `forgot-password:{ip}` | 3                      | 15 min | closed     |                                                          |
| `POST /api/auth/reset-password`    | `reset-password:{ip}`  | 5                      | 15 min | closed     |                                                          |
| `GET /api/auth/me`                 | `auth-me:{ip}`         | 60                     | 60 s   | closed     |                                                          |

### Admin (all fail-closed)

| Route                          | Key Pattern  | maxRequests | Window | failPolicy | Notes                                 |
| ------------------------------ | ------------ | ----------- | ------ | ---------- | ------------------------------------- |
| Admin guard (all admin routes) | `admin:{ip}` | 100         | 60 s   | closed     | Applied via `enforceAdminRateLimit()` |

### Tracking (all fail-closed)

| Route                        | Key Pattern       | maxRequests | Window | failPolicy | Notes |
| ---------------------------- | ----------------- | ----------- | ------ | ---------- | ----- |
| `GET/POST /api/track/click`  | `click:{ip}`      | 60          | 60 s   | closed     |       |
| `POST /api/track/impression` | `impression:{ip}` | 120         | 60 s   | closed     |       |

### Newsletter (all fail-closed)

| Route                              | Key Pattern                   | maxRequests | Window | failPolicy | Notes                 |
| ---------------------------------- | ----------------------------- | ----------- | ------ | ---------- | --------------------- |
| `POST /api/newsletter` (subscribe) | `newsletter:{ip}`             | 5           | 15 min | closed     |                       |
| `POST /api/newsletter` (per-email) | `newsletter-email:{email}`    | 5           | 60 min | closed     |                       |
| `GET /api/newsletter/confirm`      | `newsletter-confirm:{ip}`     | 10          | 60 s   | closed     | Bearer token endpoint |
| `GET /api/newsletter/unsubscribe`  | `newsletter-unsubscribe:{ip}` | 10          | 15 min | closed     | Bearer token endpoint |

### Payments (all fail-closed)

| Route                                   | Key Pattern                | maxRequests | Window | failPolicy | Notes                   |
| --------------------------------------- | -------------------------- | ----------- | ------ | ---------- | ----------------------- |
| `POST /api/membership/checkout`         | `membership-checkout:{ip}` | 5           | 60 min | closed     | Creates Stripe sessions |
| `POST /api/products/[id]/price-alert`   | `price-alert-create:{ip}`  | 10          | 60 min | closed     |                         |
| `DELETE /api/products/[id]/price-alert` | `price-alert-delete:{ip}`  | 20          | 60 min | closed     |                         |

### Public Read-Only

| Route                                  | Key Pattern          | maxRequests | Window | failPolicy  | Notes                 |
| -------------------------------------- | -------------------- | ----------- | ------ | ----------- | --------------------- |
| `GET /api/products/[id]/price-history` | `price-history:{ip}` | 60          | 60 s   | **open**    | Read-only, cached     |
| `GET /api/health`                      | `health:{ip}`        | 10          | 60 s   | **open**    | Monitoring probe      |
| `POST /api/vitals`                     | `vitals:{ip}`        | 120         | 60 s   | _(default)_ | Web Vitals telemetry  |
| `POST /api/csp-report`                 | `csp-report:{ip}`    | 60          | 60 s   | _(default)_ | CSP violation reports |
| `POST /api/gift-finder`                | `gift-finder:{ip}`   | 30          | 60 s   | closed      | DB-driven AI endpoint |

## Infrastructure

- **Primary backend**: Cloudflare KV (`RATE_LIMIT_KV` binding)
- **Fallback**: Per-isolate in-memory counter (grace window: `KV_GRACE_MS`, default 60 s)
- **Durable Object**: `RATE_LIMITER_DO` for atomic cross-isolate counters (used by middleware unknown-host guard)
- **Alerting**: Per-minute alert token-bucket (`kvUnavailableAlerted`) prevents log floods when KV is down

## Policy Changes

Any change to the fail-policy of a rate-limited route requires:

1. Update this document
2. Update the `__tests__/infrastructure-controls.test.ts` regression test
3. PR review from a CODEOWNER in `lib/security/`
