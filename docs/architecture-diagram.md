# Production Architecture Diagram

> **Audit reference**: "Missing artifacts needed next" -- Production architecture diagram

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         INTERNET                                │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                   CLOUDFLARE EDGE                               │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────┐ │
│  │  DNS/Routes   │  │  Turnstile   │  │  WAF / DDoS           │ │
│  │  (per-site    │  │  (bot        │  │  (Cloudflare managed) │ │
│  │   domains)    │  │   protection)│  │                       │ │
│  └──────┬───────┘  └──────┬───────┘  └───────────┬───────────┘ │
│         │                 │                       │             │
│         ▼                 ▼                       ▼             │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │           CLOUDFLARE WORKER (via OpenNext)               │   │
│  │                                                          │   │
│  │  middleware.ts                                            │   │
│  │  ├─ Domain/site resolution (multi-tenant)                │   │
│  │  ├─ CSP headers                                          │   │
│  │  ├─ CSRF protection                                      │   │
│  │  ├─ Rate limiting (Durable Objects > KV > in-memory)     │   │
│  │  ├─ Auth/session validation                              │   │
│  │  └─ Unknown host rejection                               │   │
│  │                                                          │   │
│  │  Next.js 15 App Router                                   │   │
│  │  ├─ Public pages (SSR/ISR)                               │   │
│  │  ├─ Admin panel (auth-gated)                             │   │
│  │  ├─ API routes                                           │   │
│  │  │   ├─ /api/auth/* (login, refresh, TOTP, password)     │   │
│  │  │   ├─ /api/admin/* (CRUD, analytics, AI, uploads)      │   │
│  │  │   ├─ /api/newsletter/* (subscribe, confirm, unsub)    │   │
│  │  │   ├─ /api/track/* (clicks, impressions)               │   │
│  │  │   ├─ /api/cron/* (scheduled jobs)                     │   │
│  │  │   ├─ /api/internal/* (worker-to-worker)               │   │
│  │  │   ├─ /api/membership/* (Stripe checkout, webhook)     │   │
│  │  │   └─ /api/queue/* (click queue consumer)              │   │
│  │  └─ Server Actions                                       │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────────┐ │
│  │ RATE_LIMIT   │  │ APP_CACHE    │  │  RATE_LIMITER_DO       │ │
│  │ _KV          │  │ _KV          │  │  (Durable Object)      │ │
│  │ (fallback)   │  │ (domain      │  │  (atomic rate limiting)│ │
│  │              │  │  cache)      │  │                        │ │
│  └─────────────┘  └──────────────┘  └────────────────────────┘ │
│                                                                 │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────────┐ │
│  │ CLICK_QUEUE  │  │ R2 Public    │  │  R2 Private            │ │
│  │ (+ DLQ)     │  │ Bucket       │  │  Bucket                │ │
│  │ (async      │  │ (images,     │  │  (uploads pending      │ │
│  │  click      │  │  assets)     │  │   validation)          │ │
│  │  tracking)  │  │              │  │                        │ │
│  └─────────────┘  └──────────────┘  └────────────────────────┘ │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  LOG-SHIPPER TAIL WORKER                                 │   │
│  │  (captures Worker logs → R2 durable storage)             │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                           │
            ┌──────────────┼──────────────┐
            ▼              ▼              ▼
┌───────────────┐ ┌──────────────┐ ┌──────────────┐
│   SUPABASE    │ │   STRIPE     │ │   RESEND     │
│               │ │              │ │              │
│  PostgreSQL   │ │  Checkout    │ │  Transactional│
│  + RLS        │ │  Sessions    │ │  Email       │
│  + Auth       │ │  Webhooks    │ │  (newsletter │
│  + Realtime   │ │  Subscriptions│ │   confirm,  │
│               │ │              │ │   password   │
│  Tables:      │ │  Webhook →   │ │   reset)     │
│  sites        │ │  atomic RPC  │ │              │
│  admin_users  │ │  (idempotent)│ └──────────────┘
│  content      │ │              │
│  products     │ └──────────────┘ ┌──────────────┐
│  categories   │                  │   SENTRY     │
│  affiliate_   │                  │              │
│   clicks      │                  │  Error       │
│  newsletter_  │                  │  tracking    │
│   subscribers │                  │  + alerts    │
│  audit_log    │                  │              │
│  memberships  │                  └──────────────┘
│  stripe_events│
│  ai_drafts    │                  ┌──────────────┐
│  pages        │                  │  AI PROVIDERS│
│  ...          │                  │              │
│               │                  │  Cloudflare  │
│  Functions:   │                  │  Workers AI  │
│  apply_stripe_│                  │  Gemini      │
│   membership_ │                  │  Groq        │
│   event (RPC) │                  │  Cohere      │
│  purge_       │                  │              │
│   retention   │                  └──────────────┘
│   (RPC)       │
└───────────────┘
```

## Security Boundaries

```
┌─ PUBLIC (no auth) ──────────────────────────────────────────┐
│  /api/newsletter/*    (Turnstile + rate limit)              │
│  /api/track/*         (rate limit, async queue)             │
│  /api/community/*     (rate limit, email hash)              │
│  /api/gift-finder     (rate limit, fail-closed)             │
│  /api/health          (rate limit)                          │
│  /api/vitals          (rate limit)                          │
│  Public pages         (SSR, CSP, sanitized output)          │
└─────────────────────────────────────────────────────────────┘

┌─ AUTH REQUIRED (JWT + session) ─────────────────────────────┐
│  /api/auth/me         (rate limit, fail-closed)             │
│  /api/auth/refresh    (rate limit, fail-closed)             │
│  /api/membership/*    (rate limit, fail-closed)             │
└─────────────────────────────────────────────────────────────┘

┌─ ADMIN (requireAdmin / withAuthz) ──────────────────────────┐
│  /api/admin/*         (RBAC permissions per resource)       │
│  /api/admin/ai-*      (content:create permission)           │
│  /api/admin/privacy/* (super_admin only for delete)         │
└─────────────────────────────────────────────────────────────┘

┌─ INTERNAL (INTERNAL_API_TOKEN / HMAC) ──────────────────────┐
│  /api/internal/*      (worker-to-worker calls)              │
│  /api/queue/*         (queue consumer, service-role)        │
└─────────────────────────────────────────────────────────────┘

┌─ CRON (per-trigger Bearer secret) ──────────────────────────┐
│  /api/cron/publish           CRON_PUBLISH_SECRET            │
│  /api/cron/stripe-sync       CRON_STRIPE_SYNC_SECRET        │
│  /api/cron/ai-generate       CRON_AI_SECRET                 │
│  /api/cron/sitemap-refresh   CRON_SITEMAP_SECRET            │
│  /api/cron/data-retention    CRON_RETENTION_SECRET           │
│  /api/cron/commission-ingest CRON_COMMISSION_SECRET          │
│  /api/cron/epc-recompute    CRON_EPC_SECRET                 │
│  /api/cron/price-scrape      CRON_PRICE_SECRET              │
│  /api/cron/expire-deals      CRON_DEALS_SECRET              │
└─────────────────────────────────────────────────────────────┘
```

## Data Flow: Affiliate Click Tracking

```
User clicks affiliate link
    │
    ▼
/api/track/click (rate limited)
    │
    ▼
CLICK_QUEUE (Cloudflare Queue)
    │
    ▼
/api/queue/clicks (INTERNAL_API_TOKEN, service-role)
    │
    ▼
Supabase: affiliate_clicks table (RLS, site-scoped)
    │
    ├─► /api/cron/epc-recompute → analytics RPCs
    └─► /api/cron/commission-ingest → affiliate networks
```

## Data Flow: Stripe Membership

```
User selects plan
    │
    ▼
/api/membership/checkout (rate limited, fail-closed)
    │
    ▼
Stripe Checkout Session (redirect)
    │
    ▼
Stripe webhook → /api/membership/webhook
    │
    ▼
constructStripeEvent() — HMAC-SHA256 signature verification
    │
    ▼
processStripeEvent() → applyStripeEventAtomic()
    │
    ▼
apply_stripe_membership_event (Postgres RPC, single transaction)
    ├─► INSERT stripe_events (idempotency key)
    └─► UPSERT memberships (side effect)
```
