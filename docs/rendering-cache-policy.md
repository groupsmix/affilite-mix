# Rendering & Cache Policy by Route

This document maps every route to its rendering strategy, revalidation interval, and cache behaviour. Use it during reviews to ensure new routes follow the correct pattern and that cache/TTL values match business requirements.

> **Last updated:** April 2026

---

## Terminology

| Term          | Meaning                                                                    |
| ------------- | -------------------------------------------------------------------------- |
| **SSR**       | Server-Side Rendered on every request (no caching at the framework level)  |
| **ISR _n_ s** | Incremental Static Regeneration — cached and revalidated every _n_ seconds |
| **Static**    | Fully static at build time; no server re-render until next deploy          |
| **Dynamic**   | `export const dynamic = "force-dynamic"` — always SSR, never cached        |
| **On-demand** | Revalidated via `revalidateTag()` / `revalidatePath()` after admin writes  |

---

## Public Pages (`app/(public)/`)

| Route                            | Rendering     | Revalidate | On-demand invalidation       | Notes                                            |
| -------------------------------- | ------------- | ---------- | ---------------------------- | ------------------------------------------------ |
| `/` (homepage)                   | ISR           | 60 s       | Yes — content/product writes | Template-based (standard / cinematic / minimal)  |
| `/[contentType]` (listing)       | ISR           | 60 s       | Yes — content writes         | Content type index pages                         |
| `/[contentType]/[slug]` (detail) | ISR           | 60 s       | Yes — content writes         | Supports preview mode via token or admin session |
| `/category/[slug]`               | ISR           | 60 s       | Yes — category writes        |                                                  |
| `/brands`                        | ISR           | 60 s       | Yes — product writes         |                                                  |
| `/brands/[slug]`                 | ISR           | 60 s       | Yes — product writes         |                                                  |
| `/budget`                        | ISR           | 60 s       | Yes — product writes         |                                                  |
| `/budget/[slug]`                 | ISR           | 60 s       | Yes — product writes         |                                                  |
| `/occasion`                      | ISR           | 60 s       | Yes — product writes         | Gift-finder taxonomy                             |
| `/occasion/[slug]`               | ISR           | 60 s       | Yes — product writes         |                                                  |
| `/recipient`                     | ISR           | 60 s       | Yes — product writes         | Gift-finder taxonomy                             |
| `/recipient/[slug]`              | ISR           | 60 s       | Yes — product writes         |                                                  |
| `/search`                        | SSR           | —          | —                            | Always dynamic (user query)                      |
| `/contact`                       | ISR           | 3 600 s    | —                            | Mostly static content                            |
| `/privacy`                       | SSR           | —          | —                            | No explicit revalidate; default SSR              |
| `/terms`                         | SSR           | —          | —                            | No explicit revalidate; default SSR              |
| `/affiliate-disclosure`          | ISR           | 3 600 s    | —                            | Legal / compliance page                          |
| `/gift-finder`                   | SSR           | —          | —                            | Interactive quiz, always dynamic                 |
| `/newsletter/confirm`            | SSR           | —          | —                            | One-time confirmation handler                    |
| `/newsletter/confirmed`          | SSR           | —          | —                            | Static thank-you, could be ISR                   |
| `/newsletter/unsubscribed`       | SSR           | —          | —                            | Static thank-you, could be ISR                   |
| `/p/[pageSlug]`                  | SSR           | —          | —                            | Custom pages from DB                             |
| `/content/[slug]`                | SSR           | —          | —                            | Legacy content route (no revalidate)             |
| `/feed.xml`                      | Route Handler | —          | —                            | RSS feed, generated per-request                  |

## Admin Pages (`app/admin/`)

| Route                   | Rendering | Cache | Notes                                                 |
| ----------------------- | --------- | ----- | ----------------------------------------------------- |
| `/admin/login`          | SSR       | None  | Auth page — must never be cached                      |
| `/admin/reset-password` | SSR       | None  | Auth page                                             |
| `/admin/(dashboard)/*`  | SSR       | None  | All dashboard pages are fully dynamic (session-gated) |

## API Routes (`app/api/`)

| Route                   | Method  | Cache | Rate Limit    | Notes                                     |
| ----------------------- | ------- | ----- | ------------- | ----------------------------------------- |
| `/api/vitals`           | POST    | —     | 120/min/IP    | Web Vitals beacon receiver                |
| `/api/track/click`      | POST    | —     | 60/min/IP     | Affiliate click tracking                  |
| `/api/track/impression` | POST    | —     | —             | Content impression tracking               |
| `/api/newsletter/*`     | POST    | —     | 3/15min/IP    | Newsletter subscribe/confirm/unsubscribe  |
| `/api/auth/*`           | POST    | —     | 5-10/15min    | Login, logout, CSRF, refresh              |
| `/api/admin/*`          | Various | —     | 100/min/user  | Admin CRUD — all session-gated            |
| `/api/cron/*`           | POST    | —     | CRON_SECRET   | Scheduled jobs (publish, sitemap refresh) |
| `/api/revalidate`       | POST    | —     | CRON_SECRET   | On-demand ISR revalidation trigger        |
| `/api/health`           | GET     | —     | —             | Health check endpoint                     |
| `/api/internal/*`       | GET     | —     | Internal only | Middleware-only (site resolution)         |

## Static Assets & Middleware

| Resource          | Cache                        | Notes                                             |
| ----------------- | ---------------------------- | ------------------------------------------------- |
| `/_next/static/*` | Immutable (hashed filenames) | Cloudflare CDN caches indefinitely                |
| `/public/*`       | CDN default                  | Favicon, manifest, etc.                           |
| Middleware        | Edge                         | Runs on every request; resolves site + CSRF       |
| Security headers  | All responses                | X-Frame-Options, CSP, HSTS — see `next.config.ts` |

---

## Cloudflare Cache Rules (Zone-Level)

Two cache rules are configured at the Cloudflare zone level for `wristnerd.xyz`:

| Rule                    | Expression                                                                             | Action                                    |
| ----------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------- |
| **Bypass API & admin**  | `starts_with(uri.path, "/api/") or starts_with(uri.path, "/admin/")`                   | Cache OFF                                 |
| **Cache static assets** | `uri.path.extension in {js css png jpg jpeg gif svg ico woff woff2 ttf eot webp avif}` | Cache ON — 30 d browser TTL, 1 y edge TTL |

These rules are managed via the Cloudflare API (not in the repo). To view or edit:

- **API:** `GET /zones/{zone_id}/rulesets` → find `phase: http_request_cache_settings`
- **Dashboard:** Cloudflare Dashboard > wristnerd.xyz > Caching > Cache Rules

### Other zone-level performance settings

| Setting       | Status | Notes                                     |
| ------------- | ------ | ----------------------------------------- |
| Tiered Cache  | ON     | Reduces origin fetches                    |
| Early Hints   | ON     | Preloads critical resources               |
| 0-RTT         | ON     | Faster TLS handshakes for repeat visitors |
| Cache Reserve | N/A    | Not available on Free plan                |

## Recommendations

1. **Add explicit `revalidate` to `/privacy`, `/terms`, `/content/[slug]`** — currently SSR on every request despite being mostly static. Suggested: `revalidate = 3600`.
2. **Newsletter confirmation pages** (`/newsletter/confirmed`, `/newsletter/unsubscribed`) are static content that could use `revalidate = false` (full static).
3. **Custom pages (`/p/[pageSlug]`)** should use ISR with on-demand revalidation to match the content page pattern.
4. **Consider CDN-level caching** via `Cache-Control` / `s-maxage` headers for ISR pages to reduce Cloudflare Worker invocations.
5. **API routes** already have rate limiting; consider adding `Cache-Control: no-store` explicitly to prevent CDN/browser caching of authenticated responses.
