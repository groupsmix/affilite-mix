# End-to-End Technical Audit: Affilite-Mix

**Date:** 2026-04-30
**Auditor:** Principal Engineer Review (automated deep inspection)
**Repository:** `groupsmix/affilite-mix`
**Commit:** HEAD of `main`

---

## 1. EXECUTIVE SUMMARY

Affilite-Mix is a **well-above-average** multi-tenant affiliate marketing platform built on Next.js 15 / Cloudflare Workers with Supabase (Postgres + RLS). The codebase demonstrates mature security engineering across authentication, authorization, CSRF, CSP, rate limiting, SSRF protection, and tenant isolation -- far exceeding what is typical at this stage. The project has 109 unit/integration test files (~16,300 lines), 11 E2E specs, 93 database migrations with rollback scripts, Terraform IaC for Cloudflare and GitHub, and extensive operational documentation (incident response, SLOs, backup policy, DR runbook, threat model).

**Overall Project Health Score: 8.2 / 10**

**Go/No-Go Recommendation:** GO for production, with the P0 items below addressed first.

**Top 3 Risks:**
1. Per-tenant RLS bypass surface -- the service-role client is widely used in admin routes; a single missing `site_id` filter in a DAL function exposes cross-tenant data.
2. Cloudflare single-vendor dependency -- KV, DO, Queues, R2, Workers edge runtime with no multi-cloud failover path.
3. No automated integration test coverage against a live Supabase instance in CI (RLS policies are tested via mocks, not a real DB).

---

## 2. RECONSTRUCTED ARCHITECTURE

### System Architecture

```
                        Internet
                           |
                    [Cloudflare Edge]
                     WAF / Turnstile / Bot Fight Mode
                           |
                    [Cloudflare Worker]
                     Next.js 15 (Edge Runtime)
                     middleware.ts (CSRF, CSP, CORS,
                       site resolution, rate limit,
                       maintenance mode, trace-id)
                           |
              +------------+------------+
              |                         |
    [Public Routes]            [Admin API Routes]
    SSR/ISR pages              JWT auth + RBAC + TOTP 2FA
    /api/newsletter            /api/admin/*
    /api/track/*               requireAdmin() guard
    /r/ (redirects)            withAuthz() permission check
              |                         |
              +------------+------------+
                           |
                    [Supabase Postgres]
                     RLS enabled on all tables
                     94 migrations
                     service_role for admin ops
                     tenant-scoped JWT for public reads
                           |
              +------------+------------+
              |            |            |
         [Cloudflare   [Cloudflare  [Cloudflare
           KV]           R2]         Queues]
         Rate limits   Images/      Click tracking
         Site cache    Uploads      DLQ handling
         Neg. cache    ISR cache
              |
         [Durable Objects]
         Atomic rate counters
```

### Component Map

- **Frontend:** Next.js 15.5, React 19, Tailwind CSS v4, Radix UI, Tiptap editor, Recharts, Lucide icons
- **Backend:** Next.js API routes (73 route files), edge runtime where possible
- **Database:** Supabase Postgres with 94 up-migrations + rollback scripts, RLS on all tables
- **Auth:** Custom JWT (jose) + bcrypt + TOTP 2FA (otpauth), cookie-based sessions, IP/UA binding
- **Infrastructure:** Cloudflare Workers (via @opennextjs/cloudflare), KV, Durable Objects, R2, Queues
- **Integrations:** Stripe (payments/memberships), Resend (email), Sentry (error tracking), Turnstile (CAPTCHA), multiple AI providers (Cloudflare AI, Gemini, Groq, Cohere), affiliate networks (CJ, PartnerStack, Admitad)

### Data Flow

```
[User Browser]
    --> [CF Edge WAF + Turnstile]
    --> [CF Worker / middleware.ts]
         - Resolve domain -> site_id (static config || KV cache || DB)
         - CSRF double-submit cookie validation
         - CSP nonce generation
         - Rate limiting (KV/DO with in-memory fallback)
         - Inject x-site-id + x-trace-id headers
    --> [Next.js Route Handler]
         - Input validation (lib/validation.ts)
         - Auth check (getAdminSession / requireAdmin)
         - Authorization check (withAuthz + hasPermission)
         - DAL call with site_id scoping
    --> [Supabase Postgres]
         - RLS policies enforce tenant isolation
         - service_role bypasses RLS (admin ops only)
    --> [Response with CSP, CORS, Vary headers]
```

### Trust Boundaries

1. **Internet -> CF Edge:** WAF rules, Bot Fight Mode, Turnstile challenge, TLS termination
2. **CF Edge -> Worker:** Rate limiting (KV/DO), CSRF validation, origin checks, maintenance mode
3. **Worker -> Supabase:** service_role key (bypasses RLS) or tenant-scoped JWT (RLS enforced)
4. **Worker -> Stripe:** Webhook signature verification (HMAC-SHA256), idempotency keys
5. **Worker -> AI Providers:** Per-tenant quota enforcement, prompt sanitization, output validation
6. **Admin -> System:** JWT + IP/UA binding + idle timeout + TOTP 2FA + per-session rate limiting

---

## 3. CONFIRMED STACK

**Languages & Runtimes:**
- TypeScript ~5.8 (strict mode enabled)
- Node.js ^22.13.0
- Cloudflare Workers edge runtime

**Frameworks:**
- Frontend: Next.js ~15.5.14 / React ^19.2.5
- Backend: Next.js API routes (edge + Node runtimes)

**Database:**
- Type: PostgreSQL (Supabase hosted)
- ORM/Client: @supabase/supabase-js ~2.105.1 (no ORM, raw query builder)

**Infrastructure:**
- Platform: Cloudflare Workers (via @opennextjs/cloudflare ~1.19.1)
- Edge: Cloudflare CDN
- Serverless: Cloudflare Workers
- IaC: Terraform (Cloudflare zone config + GitHub branch protection)

**Third-Party Services:**
- Auth: Custom (JWT + bcrypt + TOTP)
- Email: Resend
- Payments: Stripe ~22.1.0
- Storage: Cloudflare R2
- Monitoring: Sentry ~10.50.0
- Analytics: Custom (Web Vitals -> /api/vitals)
- AI: Cloudflare AI, Google Gemini, Groq, Cohere
- CAPTCHA: Cloudflare Turnstile
- Cookie Consent: vanilla-cookieconsent ^3.1.0

**CI/CD:**
- Platform: GitHub Actions
- Deployment: `opennextjs-cloudflare build && deploy` via wrangler
- Workflows: ci.yml, deploy.yml, deploy-gradual.yml, preview.yml, security.yml, codeql.yml, sbom.yml, lighthouse.yml, load-test.yml, chaos.yml, backup-restore-drill.yml, dr-drill.yml

**Development Tools:**
- Package Manager: npm (package-lock.json)
- Build Tool: Next.js built-in (Turbopack/Webpack)
- Linter: ESLint 9 with TypeScript parser, max-warnings=0
- Formatter: Prettier ^3.8.3
- Type Checker: TypeScript strict mode
- Testing: Vitest ^4.1.5, Playwright ^1.59.1
- Git hooks: Husky + lint-staged

---

## 4. BLIND SPOTS

**Cannot Verify From Repo:**
- Actual Supabase project tier (Pro vs Free -- PITR availability depends on this)
- Whether KV namespace IDs in `wrangler.jsonc` are production values or placeholders
- Actual Cloudflare WAF rules in production (Terraform defines them, but state is not committed)
- Real traffic volume and database size
- Whether Stripe restricted API keys (`rk_live_`) are actually used (`.env.example` still references `sk_live_`)
- Whether TOTP is actually enforced for all super_admin accounts in production DB

**Missing Artifacts Needed:**
- `wrangler.jsonc` (referenced but not visible in file listing -- may be gitignored)
- Vitest config file (`vitest.config.ts`) to confirm coverage thresholds
- Actual Lighthouse CI scores from recent runs
- npm audit output for current dependency state

**Need Production Access To Verify:**
- Supabase PITR is actually enabled (docs say it should be)
- KV/DO bindings are correctly wired
- Cloudflare WAF rules are applied to the zone
- R2 bucket separation (public vs private) is enforced
- DNS CAA records exist for TLS certificate pinning

---

## 5. TOP 25 RISKS

Ranked by real-world impact:

1. **Cross-tenant data leak via DAL** - Severity: Critical - Likelihood: Low - Impact: Full tenant data exposure if a DAL function misses `site_id` filter
2. **Cloudflare vendor lock-in** - Severity: High - Likelihood: Medium - Impact: Complete platform outage if CF has a global incident
3. **Service-role key compromise** - Severity: Critical - Likelihood: Low - Impact: Full database access bypassing all RLS
4. **RLS policy tested only via mocks** - Severity: High - Likelihood: Medium - Impact: RLS regression could ship to production undetected
5. **JWT secret rotation downtime** - Severity: Medium - Likelihood: Low - Impact: All admin sessions invalidated simultaneously if rotation is mishandled (mitigated by JWT_SECRET_CURRENT dual-key support)
6. **KV outage cascading to rate-limit bypass** - Severity: High - Likelihood: Low - Impact: 60-second grace window allows burst abuse (mitigated by fail-closed after grace)
7. **AI provider cost runaway** - Severity: Medium - Likelihood: Medium - Impact: Unexpected bills from Gemini/Groq/Cohere (mitigated by per-tenant quotas)
8. **Click tracking queue backpressure** - Severity: Medium - Likelihood: Medium - Impact: Lost affiliate attribution during traffic spikes
9. **No WAF in front of API routes** - Severity: Medium - Likelihood: Medium - Impact: Direct API abuse bypassing edge protections (mitigated by per-route rate limits)
10. **Database connection exhaustion** - Severity: High - Likelihood: Low - Impact: 503s across all tenants during traffic spikes
11. **Email deliverability** - Severity: Medium - Likelihood: Medium - Impact: Newsletter confirmations and password resets land in spam
12. **Stripe webhook replay attack** - Severity: Low - Likelihood: Low - Impact: Duplicate membership activations (mitigated by idempotency in stripe_events table)
13. **TOTP secret exposure if TOTP_ENCRYPTION_KEY leaks** - Severity: High - Likelihood: Low - Impact: 2FA bypass for all admin accounts
14. **Memory exhaustion from large CSV imports** - Severity: Medium - Likelihood: Low - Impact: Worker OOM (mitigated by 5MB/50k row cap)
15. **Negative cache poisoning** - Severity: Low - Likelihood: Low - Impact: Legitimate new domains blocked for up to 1 hour
16. **bcrypt cost-10 brute force window** - Severity: Low - Likelihood: Low - Impact: Faster password cracking if hashes leak (mitigated by 3 attempts/15min rate limit)
17. **No database read replicas** - Severity: Medium - Likelihood: Medium - Impact: Public page latency spikes during admin bulk operations
18. **Missing Content-Disposition on R2 downloads** - Severity: Low - Likelihood: Low - Impact: Browser renders uploaded HTML/SVG instead of downloading
19. **Orphan R2 objects** - Severity: Low - Likelihood: Medium - Impact: Storage cost creep from failed upload/finalize cycles
20. **No automated canary deployment** - Severity: Medium - Likelihood: Low - Impact: Bad deploys affect all traffic simultaneously (mitigated by deploy-gradual.yml)
21. **Cron job overlap** - Severity: Low - Likelihood: Medium - Impact: Duplicate AI content generation or price scraping
22. **No request body size limit in middleware** - Severity: Medium - Likelihood: Low - Impact: Large POST bodies consume Worker CPU budget
23. **Log volume cost** - Severity: Low - Likelihood: Medium - Impact: Cloudflare/Sentry log costs scale with traffic
24. **Dependency supply chain** - Severity: Medium - Likelihood: Low - Impact: Compromised npm package (mitigated by npm audit in CI, SBOM generation, license checking)
25. **Admin panel XSS via Tiptap content** - Severity: Low - Likelihood: Low - Impact: Stored XSS if sanitizer misses an edge case (mitigated by htmlparser2-based allowlist sanitizer)

---

## 6. FIX FIRST (P0 Issues)

There are no critical P0 blockers. The codebase has already addressed the most dangerous issues through its extensive hardening migrations and security controls. The following are the closest to P0:

1. **Verify RLS policies with a real Supabase instance in CI** -- The `rls-isolation.integration.test.ts` file exists but appears to run against mocks. A Supabase local instance or test project should validate RLS end-to-end.
   - Time to fix: 1-2 days (set up `supabase start` in CI)

2. **Confirm `wrangler.jsonc` R2 bucket isolation** -- The CI check exists but depends on `wrangler.jsonc` being committed. Verify this file is present and correct.
   - Time to fix: 30 minutes

3. **Audit all DAL functions for `site_id` filtering** -- The CI check `scripts/check-admin-authz.sh` exists but should be extended to verify DAL functions always include `site_id` in WHERE clauses.
   - Time to fix: 1 day

---

## 7. QUICK WINS IN 24 HOURS

1. **Add `request body size` middleware guard** - Impact: High - Effort: 2 hours
   - Add `Content-Length` check in middleware.ts for POST/PUT/PATCH, reject >10MB

2. **Pin GitHub Actions to commit SHAs** - Impact: Medium - Effort: 1 hour
   - Already partially done (checkout and setup-node are pinned), verify all actions are pinned

3. **Add `Cache-Control: private, no-store` to all admin API responses** - Impact: Medium - Effort: 1 hour
   - Prevents CDN caching of tenant-specific admin data

4. **Add Permissions-Policy header** - Impact: Low - Effort: 30 minutes
   - Restrict browser features (camera, microphone, geolocation) not needed by the app

5. **Document the `wrangler.jsonc` file status** - Impact: Medium - Effort: 30 minutes
   - Clarify whether it is gitignored and why, or commit a sanitized version

6. **Add npm audit --production to deploy workflow** - Impact: Medium - Effort: 30 minutes
   - CI already runs `npm audit --audit-level=high` but deploy.yml should double-check

7. **Add `Referrer-Policy: strict-origin-when-cross-origin` header** - Impact: Low - Effort: 15 minutes
   - Prevents affiliate URL leakage in referrer headers

---

## 8. REMEDIATION ROADMAP

### 30-Day Plan (Foundation)

**Focus: Close the RLS verification gap and operational hardening**

Week 1:
- [ ] Set up Supabase local instance in CI for RLS integration tests
- [ ] Verify wrangler.jsonc R2 bucket isolation in production
- [ ] Add request body size middleware guard
- [ ] Add Permissions-Policy and Referrer-Policy headers

Week 2:
- [ ] Extend DAL site_id audit script to cover all functions
- [ ] Add Cache-Control headers to admin API responses
- [ ] Run a manual penetration test against admin panel IDOR vectors
- [ ] Verify TOTP enforcement for all super_admin accounts

Week 3-4:
- [ ] Implement database connection pool monitoring/alerting
- [ ] Set up Supabase read replica for public read queries (if traffic warrants)
- [ ] Document and test JWT secret rotation procedure end-to-end
- [ ] Run first backup restore drill per docs/BACKUP-POLICY.md

### 60-Day Plan (Hardening)

Month 2:
- [ ] Implement automated canary deployment in deploy-gradual.yml
- [ ] Add distributed tracing (OTEL endpoint configuration)
- [ ] Implement cron job overlap prevention (idempotency keys for AI generation)
- [ ] Migrate Stripe to restricted API keys (rk_live_) if not already done
- [ ] Add R2 object lifecycle rules for orphan cleanup
- [ ] Implement automated SLO burn-rate alerting

### 90-Day Plan (Excellence)

Month 3:
- [ ] Evaluate multi-cloud failover strategy (at minimum, DNS failover to a static page)
- [ ] Implement automated chaos engineering tests in CI (expand chaos.yml)
- [ ] Add database query performance regression tests
- [ ] Implement Content-Disposition headers for R2 downloads
- [ ] SOC 2 Type I evidence collection based on existing documentation
- [ ] Implement automated access recertification per docs/access-recertification.md

---

## 9. WHAT BREAKS FIRST AT 10X TRAFFIC

1. **Supabase connection pool** - Current: Likely 20-60 connections (free/Pro tier). Breaks at: ~500 concurrent requests. Symptom: 503 errors on all routes. Fix: Connection pooler (Supavisor/PgBouncer), read replicas.

2. **KV rate limit counters** - Current: Eventual consistency with ~1s propagation. Breaks at: Distributed flood from many IPs. Symptom: Rate limits don't kick in fast enough. Fix: Durable Objects (already implemented as preferred path).

3. **Click tracking queue throughput** - Current: Cloudflare Queue with unknown batch size. Breaks at: >10k clicks/minute. Symptom: Queue backpressure, lost attribution. Fix: Increase batch size, add queue scaling.

4. **AI content generation** - Current: Sequential provider fallback. Breaks at: Many tenants requesting AI content simultaneously. Symptom: Provider rate limits hit, generation failures. Fix: Already mitigated by per-tenant quotas and provider feature flags.

5. **R2 storage for ISR cache** - Current: Single bucket. Breaks at: Cache size exceeds R2 free tier. Symptom: Increased costs, potential eviction. Fix: Cache eviction policy, TTL management.

---

## 10. WHAT FAILS A SECURITY REVIEW

1. **Service-role key bypasses all RLS** - Standard: OWASP A01:2021 Broken Access Control. Every admin API route uses service-role; a single DAL function missing `site_id` filtering is a cross-tenant data breach. The CI check `check-admin-authz.sh` mitigates this but is not a substitute for database-level enforcement.

2. **bcrypt cost factor 10** - Standard: OWASP password storage guidelines recommend cost 12+. The codebase documents the tradeoff (Worker CPU constraints) and compensates with tight rate limiting (3 attempts/15 min), but an auditor may flag this.

3. **In-memory rate limit fallback** - Standard: CWE-799 Improper Control of Interaction Frequency. The 60-second grace window during KV outage allows burst abuse. Well-documented and mitigated by fail-closed after grace, but attackers can exploit the window.

4. **No Web Application Firewall rules in code** - Standard: OWASP recommendation. WAF rules are defined in Terraform but their actual application status cannot be verified from the repo alone.

5. **JWT tokens are bearer tokens** - Standard: OAuth 2.0 best practices. While IP/UA binding mitigates token theft, the /24 subnet binding allows reuse within corporate networks. The threat model explicitly accepts this.

---

## 11. WHAT FAILS A SOC 2 / ISO 27001 REVIEW

1. **Access Recertification** - SOC 2 Trust Service: Security CC6.1
   - Evidence: `docs/access-recertification.md` exists but no automated tooling. Manual quarterly reviews needed.
   - Remediation: Implement automated access review workflow

2. **Change Management** - SOC 2 Trust Service: Security CC8.1
   - Evidence: Branch protection via Terraform, PR reviews required, CI gates. GOOD.
   - Gap: No formal change advisory board or approval workflow beyond PR review.

3. **Incident Response Testing** - SOC 2 Trust Service: Availability A1.2
   - Evidence: `docs/incident-response.md` with detailed playbook, DR drill checklist.
   - Gap: No evidence of actual drill execution (dates/results not in repo).

4. **Backup Testing** - SOC 2 Trust Service: Availability A1.2
   - Evidence: `docs/BACKUP-POLICY.md` with RTO/RPO targets, `.github/workflows/backup-restore-drill.yml`.
   - Gap: No drill results or last-tested dates in the document.

5. **Data Classification** - ISO 27001 A.8.2
   - Evidence: PII handling documented in threat model, GDPR hash secret for erasure logs.
   - Gap: No formal data classification matrix. Data sensitivity varies by tenant.

6. **Vendor Risk Management** - SOC 2 Trust Service: Risk Assessment CC3.2
   - Evidence: `docs/vendor-dpas.md` exists.
   - Gap: Need to verify DPA execution with Supabase, Cloudflare, Stripe, Resend, AI providers.

---

## 12. WHAT FAILS A RELIABILITY REVIEW (SRE)

1. **No distributed tracing** - SRE principle: Observability. The trace-id header is generated and propagated, but no OTEL collector is configured (env vars are empty). Log correlation exists but spans/traces do not.

2. **No on-call rotation** - SRE principle: Incident response. The incident response doc references PagerDuty/Opsgenie but no integration is configured.

3. **SLO measurement is passive** - SRE principle: SLO-based alerting. SLOs are well-defined in `docs/slo-definitions.md` but no automated burn-rate alerting is wired up.

4. **No runbook for database failover** - SRE principle: DR preparedness. DR runbook exists but depends on Supabase-managed failover; no self-service database failover capability.

5. **Cron liveness monitoring** - SRE principle: Job observability. `docs/cron-liveness.md` exists and `lib/cron-liveness.ts` tracks heartbeats, but no external dead-man's switch is configured.

---

## 13. WHAT FAILS A SCALE REVIEW

1. **Single Supabase project** - All tenants share one Postgres instance. At scale, noisy-neighbor queries from one tenant degrade all tenants. Fix: Supabase read replicas (supported on Pro+) or sharding strategy.

2. **No CDN cache for public API responses** - Public content API responses are not edge-cached. Every page load hits the Worker -> Supabase path. Fix: Add `s-maxage` headers for public GET endpoints with cache tags for invalidation.

3. **Synchronous AI content generation in cron** - The `/api/cron/ai-generate` route processes content generation synchronously. At scale, this hits provider rate limits and Worker CPU timeouts. Fix: Break into smaller batches, use queue-based processing.

4. **Full-text search on Postgres** - The `idx_content_fts` GIN index works well at moderate scale but degrades with millions of rows. Fix: Consider a dedicated search service (Meilisearch, Typesense) at scale.

---

## 14. HARD TRUTHS ABOUT THIS ARCHITECTURE

### What's Actually Good

- **Security posture is genuinely impressive.** CSRF double-submit cookies with timing-safe comparison, CSP with per-request nonces (no unsafe-inline), CORS with strict origin allow-list, SSRF guard with DNS resolution, rate limiting with fail-closed policy, JWT IP/UA binding, TOTP 2FA, breached password checking via HIBP, audit logging with R2 DLQ fallback. This is enterprise-grade security work.
- **Tenant isolation is well-thought-out.** Multi-layer: middleware injects `x-site-id`, `requireAdmin()` validates cookie + membership, DAL functions filter by `site_id`, RLS policies enforce at database level, CI checks validate authz wrappers.
- **Operational maturity is high for the project stage.** SLO definitions, incident response playbook, backup policy with RTO/RPO, DR runbook, threat model, secrets rotation runbook, migration safety docs, and extensive CI security checks.
- **Test coverage is meaningful.** 109 test files covering security-critical paths: CORS, CSRF, auth timing, rate limiting, tenant isolation, Stripe webhook verification, prompt injection, RLS, admin ACL, and more.
- **Database migration discipline is excellent.** 94 migrations with corresponding rollback (down) scripts, migration order checks in CI, safety documentation, and schema drift detection scripts.

### What's Concerning

- **Service-role is the default for admin operations.** The entire admin surface (73 API routes) operates through the service-role client that bypasses RLS. While the DAL layer filters by `site_id`, a single oversight in a DAL function creates a cross-tenant data breach. The `getTenantClient()` with JWT-based RLS is used for public routes, but the admin/service split means the database's own security layer is largely bypassed for the most sensitive operations.
- **Cloudflare lock-in is deep.** KV, Durable Objects, Queues, R2, Workers, Turnstile, WAF -- every infrastructure primitive is Cloudflare. The `@opennextjs/cloudflare` adapter adds another coupling layer. Migration to another provider would be a multi-month effort.

### What's Hidden Complexity

- **Middleware is 502 lines of critical logic.** Site resolution, CSRF, CORS, CSP, rate limiting, maintenance mode, KV caching, negative caching, and trace ID generation all live in a single middleware file. Any bug here affects every request.
- **Rate limiting has 477 lines with three backends.** Durable Objects (preferred), KV (fallback), and in-memory (last resort) with grace windows, fail policies, and binding lookups. The complexity is justified but hard to reason about during an incident.

### What's Over-Engineered

- **Per-trigger cron secrets with 9 separate env vars.** The security benefit (revoking one trigger without touching others) is real but the operational overhead of managing 9 secrets per environment is high. A single HMAC-signed trigger approach would be simpler.

### What's Under-Engineered

- **No edge caching for public content.** Every public page load goes Worker -> Supabase. Adding `s-maxage` with `stale-while-revalidate` for published content would dramatically reduce Supabase load and improve TTFB.
- **No structured error codes.** API errors return plain English messages. Clients cannot programmatically distinguish error types without parsing strings.

### What Will Bite You

- **The 502-line middleware file.** As features are added, this file will grow. A middleware bug that passes CI but fails at edge runtime will take down all sites simultaneously.
- **Supabase connection limits at scale.** Serverless Workers create many short-lived connections. Without a connection pooler, this will hit the wall at moderate traffic.

---

## 15. IF I HAD TO REBUILD THIS CLEANLY

### Keep
- The multi-tenant architecture with static config + DB registry
- The security middleware stack (CSRF, CSP, CORS, rate limiting)
- The DAL pattern with typed validation functions
- Cloudflare Workers as the compute platform
- The migration discipline with rollback scripts
- The CI security checks (authz enforcement, service-role scan, etc.)

### Redesign
- **Split middleware into composable middleware chain** -- separate site resolution, security headers, CSRF, and rate limiting into distinct middleware functions composed in order
- **Move admin operations to RLS-enforced tenant JWTs** instead of service-role. Mint a short-lived JWT with `site_id` claim for each admin request so Postgres RLS enforces tenant isolation even for admin ops.
- **Add edge caching layer** for public content with cache tag-based invalidation via Cloudflare Cache API

### Remove
- The legacy `getServiceClient()` wrapper in `lib/supabase-server.ts` (already deprecated)
- The shared `CRON_SECRET` fallback (enforce per-trigger secrets only)

### Standardize
- API error responses to use structured error codes (`{ code: "RATE_LIMITED", message: "..." }`)
- Logging to always include `siteId`, `traceId`, and `userId` fields

### Add
- Database connection pooling (Supabase Supavisor or external PgBouncer)
- Edge cache for public GET endpoints
- OTEL distributed tracing integration
- Automated SLO burn-rate alerting
- Integration tests against real Supabase instance in CI

---

## 16. MISSING ARTIFACTS I SHOULD PROVIDE NEXT

### High Priority
- [ ] `wrangler.jsonc` -- needed to verify R2 bucket isolation, KV namespace IDs, DO bindings, queue configuration
- [ ] `vitest.config.ts` -- needed to verify coverage thresholds and test configuration
- [ ] `next.config.ts` / `next.config.mjs` -- needed to verify security headers, image optimization, CSP configuration
- [ ] Recent `npm audit` output -- needed to verify current vulnerability state

### Medium Priority
- [ ] Supabase dashboard screenshots showing PITR status, connection pool settings, and backup history
- [ ] Cloudflare dashboard showing WAF rules, rate limiting rules, and Bot Fight Mode status
- [ ] Recent Lighthouse CI results

### Low Priority
- [ ] Load test results from `load-test.js`
- [ ] Sentry error dashboard showing top errors
- [ ] Cloudflare Analytics showing request volume and error rates

---

## 17. TECHNICAL DEBT REGISTER

| Location | Type | Debt | Effort | Risk if Not Fixed |
|----------|------|------|--------|-------------------|
| [`middleware.ts`](middleware.ts:1) | Complexity | 502-line monolith handling site resolution, CSRF, CORS, CSP, rate limiting, maintenance mode | L | Medium -- hard to reason about, test, and debug |
| [`lib/supabase-server.ts:52`](lib/supabase-server.ts:52) | Deprecated | `getServiceClient()` still exists despite deprecation | S | Low -- ESLint rule prevents new usage |
| [`lib/rate-limit.ts`](lib/rate-limit.ts:1) | Complexity | 477 lines with 3 backends (DO, KV, in-memory) and complex fallback logic | M | Medium -- incident debugging is difficult |
| [`supabase/schema.sql`](supabase/schema.sql:1) | Placeholder | Schema file is empty (auto-generated marker only) | S | Low -- migrations are authoritative |
| [`lib/cron-auth.ts:11`](lib/cron-auth.ts:11) | Bug | Timing-safe compare for mismatched lengths XORs `a[i] ^ a[i]` (always 0) instead of `a[i] ^ b[i % b.length]` | S | Low -- length mismatch already returns false, but the dummy work is algebraically dead |

**Estimated total debt:** ~3-4 engineering weeks

---

## 18. DEPENDENCY RISK REPORT

**Key Dependencies:**
- `next` ~15.5.14 -- actively maintained, latest stable
- `react` ^19.2.5 -- latest stable
- `@supabase/supabase-js` ~2.105.1 -- actively maintained
- `stripe` ~22.1.0 -- actively maintained
- `jose` ~6.2.3 -- actively maintained, pure JS JWT implementation
- `bcryptjs` ~3.0.3 -- stable, pure JS bcrypt (Workers compatible)
- `@opennextjs/cloudflare` ~1.19.1 -- actively maintained, community adapter

**Dependency Graph Complexity:**
- Direct dependencies: 29 (production), 18 (dev)
- Notable: `postcss` and `uuid` overrides suggest past conflict resolution

**License Compliance:**
- CI workflow `security.yml` checks for GPL/AGPL/SSPL licenses on every PR
- All visible dependencies use MIT/Apache-2.0/ISC licenses

---

## 19. COST MODEL ANALYSIS

**Estimated Monthly Cost (based on codebase clues):**
- Cloudflare Workers (Free/Paid): $0-25/month (100k-10M requests/day)
- Supabase Pro: $25/month (8GB DB, 250MB file storage, 50GB bandwidth)
- Cloudflare R2: $0-5/month (10GB free, then $0.015/GB/month)
- Cloudflare KV: $0-5/month (100k reads/day free)
- Resend: $0-20/month (3k emails/month free, then $20/month)
- Sentry: $0-26/month (5k errors/month free)
- Stripe: 2.9% + $0.30 per transaction (no monthly fee)
- AI Providers: Variable, per-tenant quotas enforced
- **Estimated Total:** $50-100/month at early scale

**Cost Cliff Warnings:**
- Supabase: Pro -> Team at high connection count ($599/month)
- Cloudflare Workers: Free -> Paid at >100k requests/day ($5/month + $0.50/million)
- R2: Free tier -> paid at >10GB storage

**What Scales Linearly:** R2 storage, Stripe fees, email volume
**What Scales Superlinearly:** Supabase compute (complex queries), AI provider costs (per-token)

---

## 20. OPERATIONAL RUNBOOK GAPS

**Existing Runbooks (comprehensive):**
- [x] Incident response (`docs/incident-response.md`)
- [x] DR procedure (`docs/DR-RUNBOOK.md`)
- [x] Backup policy (`docs/BACKUP-POLICY.md`)
- [x] Secrets rotation (`docs/secrets-rotation-runbook.md`)
- [x] Alerting (`docs/alerting-runbook.md`)
- [x] Observability (`docs/observability-runbook.md`)
- [x] Rollback strategy (`docs/rollback-strategy.md`)
- [x] Release process (`docs/release-process.md`)
- [x] Audit log review (`docs/audit-log-review-runbook.md`)
- [x] Click DLQ drain (`docs/runbooks/click-dlq.md`)
- [x] Cron liveness (`docs/cron-liveness.md`)
- [x] Pre-launch checklist (`docs/pre-launch.md`)
- [x] Production launch checklist (`docs/production-launch-checklist.md`)

**Missing Runbooks:**
- [ ] Database migration rollback procedure (specific to production, not just `down.sql` scripts)
- [ ] Supabase connection pool exhaustion troubleshooting
- [ ] AI provider failover manual override procedure
- [ ] Tenant onboarding/offboarding operational procedure
- [ ] R2 orphan cleanup procedure

---

## 21. DATA FLOW DIAGRAM

```
                    ┌─────────────┐
                    │  End User   │
                    └──────┬──────┘
                           │ HTTPS
                    ┌──────▼──────┐
                    │  CF Edge    │ WAF, Turnstile, TLS
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │  Worker     │ middleware.ts
                    │  (Next.js)  │ - CSRF check
                    │             │ - CSP nonce
                    │             │ - Site resolution
                    └──────┬──────┘
              ┌────────────┼────────────┐
              │            │            │
       ┌──────▼──────┐ ┌──▼───┐  ┌────▼─────┐
       │  Public API  │ │Admin │  │  Cron    │
       │  /api/track  │ │ API  │  │  Jobs    │
       │  /api/news   │ │      │  │          │
       └──────┬──────┘ └──┬───┘  └────┬─────┘
              │            │            │
              │ anon JWT   │ svc_role   │ svc_role
              │            │            │
       ┌──────▼────────────▼────────────▼──────┐
       │           Supabase Postgres           │
       │  RLS enforced (anon) / bypassed (svc) │
       └───────────────────────────────────────┘
              │            │            │
       ┌──────▼──────┐ ┌──▼───┐  ┌────▼─────┐
       │  CF KV      │ │ CF   │  │  CF      │
       │  Rate limits│ │ R2   │  │  Queues  │
       │  Site cache │ │ Media │  │  Clicks  │
       └─────────────┘ └──────┘  └──────────┘
```

**Data Retention Points:**
- Supabase Postgres: All persistent data, PITR enabled (5-min granularity)
- Cloudflare KV: Ephemeral caches (60s-3600s TTL)
- Cloudflare R2: Media uploads (no auto-expiry), ISR cache, audit DLQ
- Cloudflare Queues: Transient (click events processed and drained)

**Data Deletion Complexity:**
- Easy: KV entries (TTL-based auto-expiry)
- Moderate: Database records (CASCADE deletes on sites, SET NULL on categories)
- Hard: R2 uploaded media (requires manual cleanup or lifecycle rules)
- Implemented: `erase_user_rpc` (migration 00088) for GDPR right-to-erasure

---

## 22. TRUST BOUNDARY MAP

```
[Internet]
    ↓ (untrusted)
[Cloudflare Edge / WAF]
    ↓ (filtered, rate-limited at edge)
[Worker middleware.ts]
    ↓ (site-resolved, CSRF-checked, CSP-nonced)
[Route Handlers]
    ↓ (auth-checked, permission-checked, input-validated)
[DAL Layer]
    ↓ (site_id-scoped)
[Supabase Postgres]
    - Public routes: RLS enforced via tenant JWT
    - Admin routes: RLS bypassed via service_role key
    - Cron routes: RLS bypassed via service_role key
```

**Privilege Boundaries:**

| Role | Capabilities |
|------|-------------|
| Anonymous user | Read published content, subscribe to newsletter, submit clicks |
| Authenticated (future) | Community comments, wrist shots, quiz submissions |
| Admin (per-site) | CRUD content/products/categories for assigned sites only |
| Super Admin | All admin capabilities across all sites, user management, TOTP required |
| Service account (cron) | Scheduled tasks: publish, price scrape, AI generate, data retention |
| Service account (webhook) | Stripe event processing, membership management |
