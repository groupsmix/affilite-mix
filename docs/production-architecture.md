# Production Architecture

> **Due Diligence Artifact**
> **Last Updated:** 2026-06-12
> **Purpose:** Document production architecture for due diligence

## Architecture Overview

Affilite-Mix is a multi-tenant SaaS platform built on a serverless edge-first architecture:

```
┌─────────────────────────────────────────────────────────────────┐
│                         User Browser                             │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTPS (TLS 1.3)
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Cloudflare Edge Network                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │
│  │   WAF Rules  │  │   Turnstile  │  │ Rate Limiting│           │
│  └──────────────┘  └──────────────┘  └──────────────┘           │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              Cloudflare Workers (affilite-mix)           │   │
│  │  - Next.js SSR/SSG (OpenNext)                            │   │
│  │  - API Routes (auth, admin, track, cron)                │   │
│  │  - Middleware (CSRF, rate limiting, site resolution)      │   │
│  └──────────────────────────────────────────────────────────┘   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │
│  │     KV       │  │      R2      │  │    Queues    │           │
│  │ (rate limit) │  │ (images)     │  │ (clicks)     │           │
│  └──────────────┘  └──────────────┘  └──────────────┘           │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Supabase (eu-central-1)                        │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              PostgreSQL Database                           │   │
│  │  - Multi-tenant data (sites, content, products, users)    │   │
│  │  - Row Level Security (RLS) for tenant isolation          │   │
│  │  - Connection pooling (pgBouncer)                         │   │
│  └──────────────────────────────────────────────────────────┘   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │
│  │    Auth      │  │   Storage    │  │   Realtime   │           │
│  │ (JWT tokens) │  │ (file store) │  │ (subscriptions)│          │
│  └──────────────┘  └──────────────┘  └──────────────┘           │
└─────────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Third-Party Services                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │
│  │   Stripe     │  │   Resend     │  │   Sentry     │           │
│  │ (payments)   │  │ (email)      │  │ (monitoring) │           │
│  └──────────────┘  └──────────────┘  └──────────────┘           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │
│  │ AI Providers │  │  PagerDuty   │  │   GitHub     │           │
│  │ (content)    │  │ (alerting)   │  │ (CI/CD)      │           │
│  └──────────────┘  └──────────────┘  └──────────────┘           │
└─────────────────────────────────────────────────────────────────┘
```

---

## Component Details

### 1. Edge Layer (Cloudflare)

**Workers Runtime:**
- **Name:** `affilite-mix`
- **Runtime:** V8 isolate-based JavaScript
- **Cold Start:** 5-50ms typical
- **Concurrency:** Unlimited (auto-scales)
- **Regions:** Global (anycast)

**Security Controls:**
- **WAF:** Custom block rules (OFAC-sanctioned countries, high-risk ASNs)
- **Managed Rulesets:** Cloudflare Managed Rules + OWASP Core Ruleset
- **Rate Limiting:** Per-endpoint limits (auth: 20/60s, API: 100/60s, admin: 30/60s, cron: 10/60s)
- **Turnstile:** CAPTCHA on login and protected forms
- **TLS:** Minimum TLS 1.3, HSTS enabled with preload

**Bindings:**
- **KV Namespaces:** `RATE_LIMIT_KV` (distributed rate limiting), `APP_CACHE_KV` (application cache)
- **R2 Buckets:** `next-inc-cache` (incremental cache), private/public buckets for image uploads
- **Queues:** Click tracking queue for async processing
- **Durable Objects:** Atomic rate limiting (optional, preferred over KV)

---

### 2. Application Layer (Next.js)

**Framework:** Next.js 14+ with App Router
**Deployment:** OpenNext.js for Cloudflare Workers
**Rendering:** Hybrid (SSR for dynamic routes, SSG for static content)

**Middleware Stack:**
1. **Active Site Resolution:** Domain → site mapping (config + DB)
2. **CSRF Protection:** Double-submit cookie pattern
3. **Rate Limiting:** KV/DO-based per-IP and per-site limits
4. **JWT Extraction:** Cookie or Authorization header parsing
5. **Admin Guard:** Role-based access control

**API Routes:**
- **Public:** `/api/auth/*`, `/api/newsletter/*`, `/api/track/*`
- **Admin:** `/api/admin/*` (protected by RBAC)
- **Cron:** `/api/cron/*` (protected by HMAC secrets)

---

### 3. Data Layer (Supabase)

**Database:** PostgreSQL 15
**Region:** `eu-central-1` (Frankfurt, Germany)
**Connection Pooling:** pgBouncer (transaction mode, pool_size=20, max_client_conn=500)

**Schema Organization:**
- **Tenant-scoped tables:** `sites`, `content`, `products`, `comments`, `click_events`
- **Global tables:** `admin_users`, `roles`, `permissions`, `audit_log`
- **Integration tables:** `stripe_events`, `site_integrations`

**Security:**
- **Row Level Security (RLS):** Enforces tenant isolation on tenant-scoped tables
- **Service Role Key:** Used by server-side API routes (bypasses RLS, mitigated by API-level authz)
- **Network Restrictions:** Configured in Supabase Dashboard
- **Encryption at Rest:** AES-256 (AWS RDS default)

**Backups:**
- **Daily Snapshots:** 30-day retention
- **PITR:** 7-day window (configurable)
- **Region Replication:** Managed by Supabase

---

### 4. Storage Layer (Cloudflare R2)

**Buckets:**
- **Private Bucket:** Staging area for image uploads (magic-byte validation before promotion)
- **Public Bucket:** Final storage for validated images (served via CDN)
- **Incremental Cache:** `next-inc-cache` for OpenNext.js cache layer

**Security:**
- **Presigned URLs:** Server-side signed S3-compatible URLs for uploads
- **Magic-Byte Validation:** Rejects malformed images before promotion
- **Versioning:** 30-day retention of overwritten versions
- **Lifecycle Rules:** Automatic cleanup of old versions

---

### 5. Caching Layer

**Cloudflare CDN:**
- **Static Assets:** Served from edge cache
- **HTML Cache:** Cache rules bypass on `/api/*` routes
- **Image Optimization:** Cloudflare Images (if configured)

**Application Cache:**
- **KV Cache:** HIBP prefix list (24h TTL), sitemap last-good
- **In-Memory Cache:** Per-isolate memoization (5-minute TTL for privileged clients)

---

### 6. Message Queue Layer (Cloudflare Queues)

**Click Tracking Queue:**
- **Purpose:** Async processing of click events
- **Consumer:** Durable Object or Worker consumer
- **Backpressure:** Max concurrency of 4 batches (E2-02 fix from 2)
- **DLQ:** Dead-letter queue for failed events
- **Alerting:** Queue-depth and DLQ alerts wired to PagerDuty

---

### 7. Monitoring & Observability

**Error Tracking:** Sentry (server + client)
- **PII Scrubbing:** Aggressive redaction of IPs, cookies, emails
- **Source Maps:** Uploaded via CI
- **Release Tracking:** Linked to Git commits

**Logging:**
- **Structured Logging:** Centralized logger (`lib/logger.ts`)
- **Log Shipping:** Optional R2 bucket tail worker
- **Audit Log:** Database table for admin actions (PII redacted)

**Metrics:**
- **OpenTelemetry:** Optional OTLP/HTTP collector endpoint
- **Health Checks:** `/api/health` endpoint with database connectivity check
- **Synthetic Monitoring:** Cron-based homepage synthetic check

**Alerting:**
- **PagerDuty:** Queue-depth, DLQ, webhook alerts
- **Email:** Cloudflare alerting destinations
- **Sentry:** Error rate and performance alerts

---

### 8. CI/CD Pipeline

**GitHub Actions:**
- **Lint/Typecheck:** ESLint, TypeScript strict mode
- **Security:** Secret scanning, CodeQL, dependency review, npm audit
- **Testing:** Unit tests (Vitest), integration tests, E2E tests (Playwright)
- **Deploy:** Wrangler dry-run, staging smoke test, production deployment
- **SBOM:** Software Bill of Materials attestation

**Branch Protection:**
- **Required Reviews:** 2 approvers (required_review_count = 2)
- **Required Checks:** All CI workflows must pass
- **Signed Commits:** Cryptographic attribution required
- **No Direct Push:** All changes via PR
- **Linear History:** Rebase-and-merge workflow

---

## Multi-Tenant Architecture

**Tenant Isolation:**
- **Domain-Based:** Each tenant has a unique domain (e.g., `wristnerd.xyz`, `arabictools.wristnerd.xyz`)
- **Site ID Scoping:** All tenant-scoped queries include `site_id` filter
- **RLS Enforcement:** Postgres RLS enforces tenant isolation at database level
- **Admin Guard:** API-level authorization checks for admin operations

**Tenant Configuration:**
- **Code-Based:** Site definitions in `config/sites/*.ts`
- **Database Sync:** `toSiteRow()` function syncs config to DB
- **Wildcard Domains:** Dynamic subdomain resolution via DB lookup

---

## Disaster Recovery

**Failover Strategy:**
- **Load Balancer:** Cloudflare Load Balancer with DR failover
- **Health Checks:** Worker origin health monitoring
- **Static Fallback:** Static HTML fallback for DR scenarios
- **Backup Restore:** Supabase PITR + R2 versioning

**RTO/RPO Targets:**
- **Worker Failure:** 10 min (rollback), 0 RPO (stateless)
- **KV Loss:** 30 min (restore from backup), 1 hour RPO
- **R2 Loss:** 1 hour (cross-region replica), 15 min RPO
- **Supabase Outage:** 2 hours (failover to read replica), 5 min RPO
- **Complete Account Loss:** 4 hours (Terraform rebuild), 1 hour RPO

---

## References

- `docs/threat-model.md` - Comprehensive threat model with STRIDE analysis
- `docs/CLOUDFLARE.md` - Cloudflare configuration and bindings
- `docs/supabase-production-config.md` - Supabase configuration
- `docs/backup-pitr-status.md` - Backup retention and PITR settings
- `docs/runbooks/` - Operational runbooks for incident response
- `terraform/cloudflare/` - Infrastructure as Code for Cloudflare resources
