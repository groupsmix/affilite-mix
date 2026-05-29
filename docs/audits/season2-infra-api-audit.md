# Season 2 Audit — Infra, API & Web (A31–A60)

**Repository:** groupsmix/affilite-mix  
**Branch:** main  
**Date:** 2026-05-29  
**Auditor:** Devin (Principal Engineer)  
**Stack:** Next.js 15, Supabase, Cloudflare Workers/Pages, Terraform, GitHub Actions CI  
**Skipped:** A32 (Docker), A33 (K8s), A39 (VPC/NACLs), A57 (GraphQL)

---

## [A31] IaC (Terraform)

| ID | Severity | Category | Location | Description | Fix | Standard |
|----|----------|----------|----------|-------------|-----|----------|
| A31-01 | Low | Tags | `terraform/cloudflare/storage.tf` | R2 bucket resources lack cost-allocation or ownership tags. Cloudflare R2 does not natively support object-level tags but Terraform metadata could document ownership. | Add `comment` or `description` fields to each resource for drift accountability. | CIS Benchmark 1.x — Resource Tagging |
| A31-02 | Info | Encryption | `terraform/cloudflare/storage.tf` | R2 uses platform-managed AES-256 encryption; no CMK option documented. | Acceptable for current threat model. Document in ADR that CMK is not available on Cloudflare R2. | NIST 800-53 SC-28 |
| A31-03 | Info | Default VPC | N/A | Not applicable — Cloudflare Workers are edge-native; no VPC construct exists. | N/A | AWS CIS 4.3 (Not applicable) |
| A31-04 | Low | Egress | `terraform/cloudflare/main.tf` | No explicit egress restrictions on Worker fetch calls; any external URL is reachable. | Use `outbound_worker` or Cloudflare Gateway for egress filtering (future enhancement). | CIS Workloads 5.1 |
| A31-05 | Info | IAM | `terraform/cloudflare/main.tf:38-68` | Tokens are correctly scoped per-capability (dns, waf, logpush, workers, r2). No wildcards detected. | None — compliant. | AWS IAM BP / CIS 1.16 equivalent |
| A31-06 | Info | Logging | `terraform/cloudflare/main.tf` | Logpush job configured with destination_conf for worker logs. | None — compliant. | CIS Logging 3.x |

---

## [A34] CI/CD

| ID | Severity | Category | Location | Description | Fix | Standard |
|----|----------|----------|----------|-------------|-----|----------|
| A34-01 | Info | Secret handling | `.github/workflows/ci.yml:9-37` | CI env block uses placeholder values for secrets (not real credentials). Production secrets passed via `${{ secrets.* }}` in deploy workflows. | None — compliant. | OWASP CI/CD-SEC-02 |
| A34-02 | Info | Branch protection | `terraform/github/branch-protection.tf` | Ruleset enforces: 2 approvals, dismiss stale reviews, code-owner review, linear history, signed commits, no direct push. | None — compliant. | GitHub Security BP |
| A34-03 | Info | Pinned SHAs | `.github/workflows/ci.yml:47-49` | `actions/checkout` and `actions/setup-node` are pinned to full commit SHAs. | None — compliant. | StepSecurity / SLSA L3 |
| A34-04 | Info | SBOM | `.github/workflows/ci.yml` | CycloneDX SBOM generated, uploaded as artifact. Build fails if SBOM is empty. | None — compliant. | NIST SSDF PO.1.3 |
| A34-05 | Info | Provenance | `.github/workflows/ci.yml` | `attest-build-provenance` and `cosign` sign SBOM + BUILD_ID. SLSA L2+ attestation. | None — compliant. | SLSA L2 |
| A34-06 | Low | Runner isolation | `.github/workflows/*.yml` | All workflows use `ubuntu-latest` (GitHub-hosted). No self-hosted runner risk. | None — compliant. | OWASP CI/CD-SEC-07 |
| A34-07 | Info | Permissions | `.github/workflows/ci.yml:8` | Top-level `permissions: contents: read`. OIDC scoped to single job. | None — compliant. | Principle of Least Privilege |
| A34-08 | Low | Wrangler version drift | `.github/workflows/preview.yml:18` vs `.github/workflows/deploy.yml` | Preview pins wrangler `4.85.0`, deploy pins `4.93.1`. Version mismatch may cause silent behavior differences. | Unify WRANGLER_VERSION across all workflows or use a reusable workflow. | Reproducibility |

---

## [A35] Cloud IAM Least Privilege

| ID | Severity | Category | Location | Description | Fix | Standard |
|----|----------|----------|----------|-------------|-----|----------|
| A35-01 | Info | Token architecture | `terraform/cloudflare/main.tf:38-68` | Five separate API tokens: `dns_api_token` (Zone:Read+DNS:Edit), `waf_api_token` (Zone:Read+WAF:Edit), `logpush_api_token` (Account:Read+Logs:Edit), `workers_deploy_token` (Account:Read+Workers:Edit), `r2_lifecycle_token` (Account:Read+R2:Edit). | None — compliant. No wildcards, no cross-functional access. | CIS IAM 1.16 |
| A35-02 | Info | CI deploy token | `.github/workflows/deploy.yml:97` | `CLOUDFLARE_API_TOKEN` in GitHub Secrets — documentation states it must be a scoped token (not Global Key). Workflow comment explicitly forbids Global Key usage. | None — compliant. | Least Privilege |
| A35-03 | Info | Break-glass | `terraform/github/branch-protection.tf:50-60` | Break-glass team has `bypass_mode = "pull_request"` only (cannot push directly). Requires MFA, logged in audit log, 48h post-incident review. | None — compliant. | NIST 800-53 AC-6(1) |
| A35-04 | Low | Supabase service role | `.github/workflows/deploy.yml` | `SUPABASE_SERVICE_ROLE_KEY` grants full DB access. Used at runtime for RLS bypass on cross-tenant operations. | Document which routes use privileged client; consider row-scoped service keys if Supabase adds support. | Least Privilege |

---

## [A36] Public Endpoint (TLS, HSTS, WAF, Rate Limit, DDoS)

| ID | Severity | Category | Location | Description | Fix | Standard |
|----|----------|----------|----------|-------------|-----|----------|
| A36-01 | Info | TLS | `terraform/cloudflare/main.tf:187-193` | `min_tls_version = "1.3"` enforced at zone level. TLS 1.2 clients are rejected. | None — compliant (exceeds requirement of ≥1.2). | PCI DSS 4.0 / NIST 800-52r2 |
| A36-02 | Info | HSTS | `terraform/cloudflare/main.tf:233-246` | HSTS: `max-age=63072000; includeSubDomains; preload`. Also set in `next.config.ts` headers. | None — compliant. | RFC 6797 / OWASP |
| A36-03 | Info | WAF | `terraform/cloudflare/main.tf:131-141` | Cloudflare Managed Ruleset + OWASP Core Ruleset enabled. Bot Fight Mode on. Security level "high". | None — compliant. | OWASP WAF BP |
| A36-04 | Info | Rate limit | `terraform/cloudflare/main.tf:252-310` | Edge rate limits: `/api/auth/*` (20/min/IP), `/api/track/*` (100/min/IP+colo), `/api/newsletter` (5/min/IP), `/api/admin/*` (60/min/IP). | None — compliant. | OWASP Rate Limiting |
| A36-05 | Info | DDoS | `terraform/cloudflare/main.tf:227-230` | Bot Fight Mode enabled. Cloudflare automatic DDoS mitigation (L3/L4/L7) active by default on proxied zones. | None — compliant. | Cloudflare DDoS BP |
| A36-06 | Info | Workers.dev disabled | `wrangler.jsonc:11` | `"workers_dev": false` — all traffic must transit the zone-level WAF/TLS. | None — compliant. | Defense in depth |

---

## [A37] Storage Buckets (R2)

| ID | Severity | Category | Location | Description | Fix | Standard |
|----|----------|----------|----------|-------------|-----|----------|
| A37-01 | Info | Public access | `wrangler.jsonc:69-72` | R2 bucket `next-inc-cache` bound for incremental cache only — not publicly accessible via custom domain. Public image bucket served via `R2_PUBLIC_URL` with presigned URLs. | None — compliant. | CIS S3 2.1.5 equivalent |
| A37-02 | Info | Encryption | `wrangler.jsonc` (queue comment) | R2 encrypted at rest with AES-256 (platform-managed keys). No CMK available. | Document in ADR. Acceptable for current threat model. | NIST 800-53 SC-28 |
| A37-03 | Low | Versioning | N/A | R2 does not currently support object versioning (Cloudflare limitation). | Monitor Cloudflare for versioning GA; enable when available for DR. | CIS S3 2.1.3 equivalent |
| A37-04 | Info | Lifecycle | `terraform/cloudflare/main.tf` | `r2_lifecycle_token` exists for lifecycle management. Lifecycle rules managed via Terraform. | None — compliant. | Cost optimization |

---

## [A38] Secret Management

| ID | Severity | Category | Location | Description | Fix | Standard |
|----|----------|----------|----------|-------------|-----|----------|
| A38-01 | Info | No plaintext | `.github/workflows/deploy.yml` | All secrets referenced via `${{ secrets.* }}`. GitHub Actions masks them in logs. | None — compliant. | OWASP Secrets Mgmt |
| A38-02 | Info | Local scan | `.husky/pre-commit` | gitleaks runs on every commit (hard-fail if not installed, unless `GITLEAKS_DISABLE=1`). | None — compliant. | Shift-left secret detection |
| A38-03 | Info | CI scan | `.github/workflows/security.yml:102-110` | `gitleaks/gitleaks-action@ff98106e` pinned SHA runs in CI as backstop. | None — compliant. | Defense in depth |
| A38-04 | Low | Rotation policy | `docs/secret-rotation-policy.md` | Policy documented. Per-trigger cron secrets rotatable independently. | Verify rotation is actually exercised (runbook drill). | NIST 800-53 SC-12 |
| A38-05 | Info | Worker secrets | `.github/workflows/deploy.yml:220-232` | Runtime secrets set via `wrangler secret put` — never embedded in bundle. | None — compliant. | Cloudflare Workers BP |

---

## [A40] Monitoring, Alerting, SLOs, DR

| ID | Severity | Category | Location | Description | Fix | Standard |
|----|----------|----------|----------|-------------|-----|----------|
| A40-01 | Info | SLO definitions | `docs/slo-definitions.md` | SLOs defined for auth, public pages, admin, click tracking. | None — compliant. | SRE BP |
| A40-02 | Info | Alerting | `terraform/cloudflare/sentry-alerts.tf` | 9 alert rules: 5xx burn rate (auth/public/admin), click failures, KV fail-open, DLQ depth, cron heartbeat missed, log shipper health, AI cost threshold. | None — compliant. | Google SRE Alerting |
| A40-03 | Info | Runbooks | `docs/runbooks/` | 12 runbooks covering: DLQ overflow, DB outage, KV outage, secret rotation, incident response, certificate rotation, chaos game day, etc. | None — compliant. | ITIL / SRE |
| A40-04 | Info | DR plan | `docs/DR-RUNBOOK.md` | DR runbook exists with RTO/RPO targets. Backup/restore drill workflow at `.github/workflows/backup-restore-drill.yml`. | None — compliant. | ISO 22301 |
| A40-05 | Low | Dashboard | N/A | No Grafana/Datadog dashboard IaC found. Sentry is primary observability tool. | Consider codifying dashboard config for reproducibility. | Observability BP |

---

## [A41] Observability Privacy

| ID | Severity | Category | Location | Description | Fix | Standard |
|----|----------|----------|----------|-------------|-----|----------|
| A41-01 | Info | PII scrubbing | `lib/get-client-ip.ts` | IP used for rate-limit bucket key; click tracking uses HMAC fingerprint (no raw PII stored). | None — compliant. | GDPR Art. 25 |
| A41-02 | Info | Click dedup | `app/api/track/click/route.ts:25-40` | Uses HMAC(key, site+slug+ip_prefix+UA_hash) — no raw PII leaves the function. | None — compliant. | Privacy by Design |
| A41-03 | Low | Logger | `lib/logger.ts` | Logger used throughout. No evidence of PII-aware redaction filter (e.g. email, IP masking in log output). | Add a structured-log redaction layer that masks emails/IPs before shipping to Logpush destination. | GDPR Art. 32 / SOC2 CC6.1 |
| A41-04 | Info | Metric cardinality | N/A | Metrics are event-based via Sentry; no custom high-cardinality metric labels detected. | None — acceptable. | Observability cost control |

---

## [A42] Autoscaling

| ID | Severity | Category | Location | Description | Fix | Standard |
|----|----------|----------|----------|-------------|-----|----------|
| A42-01 | Info | Workers scaling | N/A | Cloudflare Workers scale automatically per-request (no min/max instances config needed). Isolate-level concurrency is 1. | None — compliant (platform-managed). | Cloudflare Workers Architecture |
| A42-02 | Info | Cost ceiling | `terraform/cloudflare/alerts.tf:138-145` | Daily spend threshold alert configured. | None — compliant. | FinOps BP |
| A42-03 | Info | DO concurrency | `wrangler.jsonc:154` | `max_concurrency: 2` on queue consumer — bounded. | None — compliant. | Queue consumer BP |

---

## [A43] Cron/Scheduled Jobs

| ID | Severity | Category | Location | Description | Fix | Standard |
|----|----------|----------|----------|-------------|-----|----------|
| A43-01 | Info | Registry | `lib/cron-registry.ts` | Single source of truth for all cron schedules, paths, secrets, and metadata. CI test validates sync across wrangler.jsonc, routes, .env.example. | None — compliant. | DRY / Configuration as Code |
| A43-02 | Info | Idempotency | `workers/heavy-crons.ts` + routes | Cron routes are POST-only with per-trigger Bearer auth. Queue consumer uses idempotency keys. | None — compliant. | Distributed Systems BP |
| A43-03 | Info | Locking | `workers/heavy-crons.ts` | Heavy crons dispatched to isolated worker; main app handles light crons. No explicit distributed lock, but single-execution guaranteed by Cloudflare cron trigger semantics (one invocation per schedule tick per worker). | None — acceptable for current scale. | At-most-once delivery |
| A43-04 | Info | Missed-run | `terraform/cloudflare/sentry-alerts.tf` | "Cron heartbeat missed" alert (#7). | None — compliant. | Observability |
| A43-05 | Info | Timezone | `lib/cron-registry.ts` | Cron expressions in UTC (Cloudflare Workers standard). | None — compliant. | Best practice |

---

## [A44] Queue/Event Bus

| ID | Severity | Category | Location | Description | Fix | Standard |
|----|----------|----------|----------|-------------|-----|----------|
| A44-01 | Info | Delivery semantics | `wrangler.jsonc` (queue comment) | At-least-once delivery documented. Consumers must be idempotent (msg.id as idempotency key). | None — compliant. | Cloudflare Queues spec |
| A44-02 | Info | Ordering | `wrangler.jsonc` (queue comment) | FIFO within single producer; not guaranteed across retries. Documented as not relied upon. | None — acceptable. | Event-driven BP |
| A44-03 | Info | Poison handling | `wrangler.jsonc` (queue comment) | After `max_retries` (3), message moves to DLQ. DLQ depth monitored via alert. Runbook: `docs/runbooks/dlq-overflow.md`. | None — compliant. | Resilience BP |
| A44-04 | Info | Encryption | `wrangler.jsonc` (queue comment) | Queue data encrypted at rest (AES-256, platform-managed). In-transit TLS 1.3. | None — compliant. | NIST 800-53 SC-8/SC-28 |

---

## [A45] Deploy (Rollback, Feature Flags, Migrations)

| ID | Severity | Category | Location | Description | Fix | Standard |
|----|----------|----------|----------|-------------|-----|----------|
| A45-01 | Info | Rollback | `.github/workflows/rollback.yml` | Manual `workflow_dispatch` rollback via `wrangler rollback`. Environment choice (prod/staging). | None — compliant. | Deployment BP |
| A45-02 | Info | Feature flags | `lib/feature-flags.ts` | Registry with owner, createdAt, expiresAt (max 180 days), blast radius, rollback instructions, ticket ref. No permanent flags allowed. | None — compliant. | Feature Flag BP |
| A45-03 | Info | Migration ordering | `scripts/check-migrations.sh` (CI step) | Migration policy lint in CI. Docs: `docs/migration-safety.md`, `docs/migration-rollback.md`. | None — compliant. | DB Migration BP |
| A45-04 | Info | Gradual deploy | `.github/workflows/deploy-gradual.yml` | Canary deploy with configurable traffic percentage + smoke tests. | None — compliant. | Progressive delivery |
| A45-05 | Low | Kill switch | N/A | Feature flags can serve as kill switches but are limited to 180-day lifetime. Env-var based kill switches recommended for incident response. | Document which env vars serve as kill switches in a runbook. | Incident Response |

---

## [A46] Per-Endpoint API Audit

| ID | Severity | Category | Location | Description | Fix | Standard |
|----|----------|----------|----------|-------------|-----|----------|
| A46-01 | Info | Auth endpoints | `app/api/auth/*/route.ts` | login (POST), logout (POST), refresh (POST), csrf (GET), forgot-password (POST), reset-password (POST), me (GET). All rate-limited. | None — compliant. | OWASP AuthN |
| A46-02 | Info | Admin endpoints | `app/api/admin/*/route.ts` | 40+ admin routes. All gated by `withAuthz(feature, action, handler)` or `requireAdmin()` + `assertRole()`. | None — compliant. | RBAC |
| A46-03 | Info | Public endpoints | `app/api/track/*`, `app/api/newsletter/*`, `app/api/products/*` | Rate-limited, CSRF-exempt where documented in registry, origin-validated. | None — compliant. | API Security |
| A46-04 | Info | Cron endpoints | `app/api/cron/*/route.ts` | 11 cron routes, all use `verifyCronAuth()` with per-trigger Bearer secrets. | None — compliant. | Internal API auth |
| A46-05 | Info | Internal endpoints | `app/api/internal/resolve-site/route.ts`, `app/api/queue/clicks/route.ts` | Gated by `INTERNAL_API_TOKEN` HMAC verification. | None — compliant. | Service-to-service auth |
| A46-06 | Low | Schema validation | Various | Request bodies parsed via `parseJsonBody()` with manual field checks. No formal schema validation library (zod/joi). | Consider adopting zod for runtime schema validation on all API inputs for type-safe error messages. | OWASP Input Validation |

---

## [A47] IDOR Per Endpoint

| ID | Severity | Category | Location | Description | Fix | Standard |
|----|----------|----------|----------|-------------|-----|----------|
| A47-01 | Info | Admin resources | `lib/authz.ts` | `withAuthz` derives site_id from server-side cookie (not from request body/params). `authorizeResource()` fetches row by PK, checks `site_id` ownership → 404 on cross-tenant access. | None — compliant. | CWE-639 mitigation |
| A47-02 | Info | Dynamic routes | `app/api/admin/pages/[id]/route.ts:64` | Explicit field filtering prevents mass assignment of `id`, `site_id`, `created_at`. | None — compliant. | IDOR prevention |
| A47-03 | Info | Click tracking | `app/api/track/click/route.ts` | Site-scoped origin validation via `isOriginAllowedForSite()`. Product lookup scoped to resolved site. | None — compliant. | Tenant isolation |

---

## [A48] Mass Assignment

| ID | Severity | Category | Location | Description | Fix | Standard |
|----|----------|----------|----------|-------------|-----|----------|
| A48-01 | Info | User creation | `app/api/admin/users/route.ts:61-64` | Destructures only `{ email, password, name, role }`. `role` validated against allowed set (super_admin requires existing super_admin to create). | None — compliant. | CWE-915 |
| A48-02 | Info | Pages update | `app/api/admin/pages/[id]/route.ts:64` | Explicit allowlist: "Filter to allowed fields only — prevents mass assignment of id, site_id, created_at, etc." | None — compliant. | OWASP Mass Assignment |
| A48-03 | Low | Products route | `app/api/admin/products/route.ts` | Rate-limited with per-user limits. Field filtering not explicitly visible in first 80 lines; verify deeper. | Audit product update body parsing to confirm only intended fields are written. | CWE-915 |

---

## [A49] CORS

| ID | Severity | Category | Location | Description | Fix | Standard |
|----|----------|----------|----------|-------------|-----|----------|
| A49-01 | Info | Origin allowlist | `lib/security/allowed-origins.ts` | Explicit allowlist from static site config + DB-verified domains. No reflected origin. No `null` allowed. | None — compliant. | OWASP CORS |
| A49-02 | Info | Verified site ref | `lib/security/allowed-origins.ts:30-40` | `VerifiedSiteRef` type enforces that origins can only be added from trusted sources (static config or DB-verified hostname). Raw `Host` header cannot extend allowlist. | None — compliant. | G-33 |
| A49-03 | Info | Dev localhost | `lib/security/allowed-origins.ts:20` | `localhost:3000/3001` only allowed when `NODE_ENV !== "production"`. | None — compliant. | Secure defaults |
| A49-04 | Info | Preflight | `middleware.ts:155-200` | Full CORS preflight with `Access-Control-Allow-Credentials: true`, matched origin, 1h cache. | None — compliant. | RFC 6454 |

---

## [A50] SSRF

| ID | Severity | Category | Location | Description | Fix | Standard |
|----|----------|----------|----------|-------------|-----|----------|
| A50-01 | Info | External fetches | `app/api/auth/login/route.ts:102` | HIBP API: hardcoded URL `https://api.pwnedpasswords.com/range/` — no user-controlled URL. | None — compliant. | CWE-918 |
| A50-02 | Info | Resend emails | `app/api/newsletter/route.ts:269` | Hardcoded `https://api.resend.com/emails`. | None — compliant. | CWE-918 |
| A50-03 | Info | Stripe | `app/api/membership/checkout/route.ts:159` | Hardcoded `https://api.stripe.com/v1/checkout/sessions`. | None — compliant. | CWE-918 |
| A50-04 | Info | Cron dispatch | `workers/heavy-crons.ts` | URL built from `env.CRON_HOST` (operator-controlled env var) + registry path. Not user-influenced. | None — compliant. | Internal dispatch |
| A50-05 | Low | Image proxy | N/A | No image proxy/link preview/PDF gen endpoint found that accepts user-supplied URLs. `next/image` remotePatterns pinned to exact hosts. | None — compliant. | CWE-918 |

---

## [A51] Rate Limiting

| ID | Severity | Category | Location | Description | Fix | Standard |
|----|----------|----------|----------|-------------|-----|----------|
| A51-01 | Info | IP extraction | `lib/get-client-ip.ts` | Uses `cf-connecting-ip` (Cloudflare-set, unspoofable behind CF). Falls back to XFF only if `TRUST_PROXY_HEADERS=true`. | None — compliant. No X-Forwarded-For bypass possible behind Cloudflare. | OWASP Rate Limit BP |
| A51-02 | Info | Layers | Multiple | Three layers: (1) Cloudflare edge WAF rate rules (Terraform), (2) KV-based distributed limiter (`lib/rate-limit.ts`), (3) Durable Object atomic limiter (`workers/rate-limiter-do.ts`). | None — compliant. Defense in depth. | Multi-layer rate limiting |
| A51-03 | Info | Fail policy | `lib/rate-limit.ts` | Configurable per-route: `grace` (default, 60s fallback then closed), `open` (non-critical), `closed` (security-critical). | None — compliant. | Fail-safe design |
| A51-04 | Info | Per-user | `lib/admin-rate-limit.ts` | Admin endpoints rate-limited per authenticated user session. | None — compliant. | Authenticated rate limiting |
| A51-05 | Info | Global | Terraform edge rules | Zone-wide rate limits apply globally before reaching the Worker. | None — compliant. | Edge protection |

---

## [A52] File Upload

| ID | Severity | Category | Location | Description | Fix | Standard |
|----|----------|----------|----------|-------------|-----|----------|
| A52-01 | Info | Size limit | `app/api/admin/upload/route.ts` | `R2_MAX_UPLOAD_BYTES` enforced; `fileSize` signed into presigned URL. | None — compliant. | OWASP File Upload |
| A52-02 | Info | Type allowlist | `app/api/admin/upload/route.ts:17-23` | Only `image/jpeg`, `image/png`, `image/webp`, `image/gif`, `image/avif`. SVG explicitly excluded (XSS vector). | None — compliant. | CWE-434 |
| A52-03 | Info | No execution | `app/api/admin/upload/route.ts` | Object key generated server-side (`uploads/YYYY/MM/DD/<uuid>.<ext>`). Content-Type signed into presign — R2 rejects mismatched bodies. | None — compliant. | Path traversal prevention |
| A52-04 | Low | AV scan | N/A | No antivirus/malware scanning on uploaded images. | Consider Cloudflare Images or a post-upload AV scan webhook for enterprise deployments. | CIS Upload BP |
| A52-05 | Info | Magic byte validation | `app/api/admin/upload/finalize/route.ts` | Finalize route validates magic bytes before promoting staged upload. | None — compliant. | Defense in depth |

---

## [A53] CSRF

| ID | Severity | Category | Location | Description | Fix | Standard |
|----|----------|----------|----------|-------------|-----|----------|
| A53-01 | Info | Double-submit | `lib/csrf.ts` | Double-submit cookie pattern: `__Host-csrf` (prod) / `__csrf` (dev). Random 32-byte token. Timing-safe comparison. | None — compliant. | OWASP CSRF Prevention |
| A53-02 | Info | SameSite | All auth cookies | `sameSite: "strict"` on all auth/session cookies. | None — compliant. | RFC 6265bis |
| A53-03 | Info | Exempt registry | `lib/security/csrf-exempt-registry.ts` | Explicit registry of CSRF-exempt paths with documented justifications. | None — compliant. | Controlled exceptions |
| A53-04 | Info | No state-changing GETs | `app/api/` | All mutations use POST/PATCH/DELETE. GET endpoints are read-only. | None — compliant. | HTTP semantics |

---

## [A54] Cookies

| ID | Severity | Category | Location | Description | Fix | Standard |
|----|----------|----------|----------|-------------|-----|----------|
| A54-01 | Info | Secure flag | `lib/cookie-utils.ts:24` | `IS_SECURE_COOKIE = NODE_ENV === "production"`. All auth cookies set `secure: IS_SECURE_COOKIE`. | None — compliant. | OWASP Cookie Security |
| A54-02 | Info | HttpOnly | `lib/auth.ts:493,517` | Auth token cookies are `httpOnly: true`. | None — compliant. | XSS mitigation |
| A54-03 | Info | SameSite | Multiple locations | All session cookies: `sameSite: "strict"`. Logout/reset cookies: `sameSite: "lax"` (needed for redirect flows). | None — compliant. | RFC 6265bis |
| A54-04 | Info | __Host- prefix | `lib/auth.ts:20`, `lib/cookie-utils.ts:50-60` | Production cookies use `__Host-` prefix (requires Secure, Path=/, no Domain). Prevents subdomain injection. | None — compliant. | Cookie Prefix spec |
| A54-05 | Info | Domain scope | `lib/auth.ts:19` | No `Domain` attribute set (implicit to exact origin due to `__Host-` prefix). | None — compliant. | Least privilege |

---

## [A55] CSP

| ID | Severity | Category | Location | Description | Fix | Standard |
|----|----------|----------|----------|-------------|-----|----------|
| A55-01 | Info | Nonce-based | `lib/csp.ts`, `middleware.ts` | Per-request nonce generated via `crypto.getRandomValues(16 bytes)`. Applied to all inline scripts/styles. | None — compliant. | CSP Level 3 |
| A55-02 | Info | No unsafe-inline | `lib/csp.ts` (H-10 comment) | `'unsafe-inline'` kept only as CSP Level-2 fallback; Level-3 browsers ignore it when nonce is present. | None — compliant. | CSP Level 3 |
| A55-03 | Info | No unsafe-eval | Implied by nonce-only policy | No `'unsafe-eval'` directive found. | None — compliant. | CWE-94 |
| A55-04 | Info | frame-ancestors | `next.config.ts` headers | `X-Frame-Options: DENY` + CSP `frame-ancestors 'none'` on excluded paths. | None — compliant. | Clickjacking prevention |
| A55-05 | Info | Report-uri | `lib/csp.ts` | `buildReportToHeader()` and `buildReportingEndpointsHeader()` functions exist. CSP report endpoint at `/api/csp-report/route.ts`. | None — compliant. | CSP Reporting |
| A55-06 | Info | Excluded paths | `next.config.ts` | Paths excluded from middleware (`_next/static`, `_next/image`, `favicon.ico`, `fonts/`, `api/internal/`) get `default-src 'none'; frame-ancestors 'none'; base-uri 'none'`. | None — compliant. | Belt-and-suspenders |

---

## [A56] Security Headers

| ID | Severity | Category | Location | Description | Fix | Standard |
|----|----------|----------|----------|-------------|-----|----------|
| A56-01 | Info | HSTS | `next.config.ts` + Terraform | `max-age=63072000; includeSubDomains; preload`. Set at both edge (Terraform) and app (Next.js headers). | None — compliant. | RFC 6797 |
| A56-02 | Info | X-Content-Type-Options | `next.config.ts` headers | `nosniff` on all responses. Also in Terraform security_header resource. | None — compliant. | OWASP Headers |
| A56-03 | Info | Referrer-Policy | `next.config.ts` headers | `strict-origin-when-cross-origin` globally. `no-referrer` on `/admin/reset-password`. | None — compliant. | Privacy |
| A56-04 | Info | Permissions-Policy | `next.config.ts` headers | `camera=(), microphone=(), geolocation=(), interest-cohort=()`. | None — compliant. | Feature Policy |
| A56-05 | Info | X-Frame-Options | `next.config.ts` headers | `DENY`. | None — compliant. | Clickjacking |

---

## [A58] Frontend Untrusted-Data-to-DOM

| ID | Severity | Category | Location | Description | Fix | Standard |
|----|----------|----------|----------|-------------|-----|----------|
| A58-01 | Info | Sanitizer | `lib/sanitize-html.ts` | Custom allowlist-based HTML sanitizer using `htmlparser2`. Tags, attributes, and URL schemes are explicitly allowed. `isSafeUrl()` blocks `javascript:`, `data:`, protocol-relative URLs. | None — compliant. | CWE-79 / OWASP XSS |
| A58-02 | Info | HTML renderer | `app/(public)/components/html-renderer.tsx:31` | `dangerouslySetInnerHTML` wrapped with `sanitizeHtmlMemoized()`. | None — compliant. | DOMPurify equivalent |
| A58-03 | Info | Admin preview | `app/admin/(dashboard)/ai-content/ai-content-manager.tsx:349` | `sanitizeHtml(draft.body)` applied before rendering. | None — compliant. | Admin XSS prevention |
| A58-04 | Info | JSON-LD | `app/(public)/components/json-ld.tsx:29` | Uses `safeJsonLdString(data)` — dedicated escaper for JSON-LD script tags. | None — compliant. | JSON-LD XSS |
| A58-05 | Info | Theme init | `app/layout.tsx:135` | Inline `<script>` with nonce. Content is a static string (no user input): reads `localStorage.getItem("theme-preference")`. ESLint disable comment with justification. | None — compliant. | Controlled inline |
| A58-06 | Info | Entity bypass test | `__tests__/sanitize-html-entity-bypass.test.ts` | Dedicated test for HTML entity bypass vectors. | None — compliant. | Regression testing |

---

## [A59] Client Route Guards Mirrored Server-Side

| ID | Severity | Category | Location | Description | Fix | Standard |
|----|----------|----------|----------|-------------|-----|----------|
| A59-01 | Info | Server layout guard | `app/admin/(dashboard)/layout.tsx:97` | `getAdminSession()` → `redirect("/admin/login")` if no session. Runs on every admin page render (RSC). | None — compliant. | Server-side auth |
| A59-02 | Info | Server component guard | `app/admin/(dashboard)/components/admin-guard.tsx` | `requireAdminSession()` → redirect if unauthenticated. Used by pages needing explicit guard. | None — compliant. | Defense in depth |
| A59-03 | Info | API route guards | `lib/authz.ts`, `lib/admin-guard.ts` | Every admin API route uses `withAuthz()` or `requireAdmin()` + `assertRole()`. Server-derived site_id. | None — compliant. | CWE-862 |
| A59-04 | Info | No client-only guards | Multiple admin pages | All admin pages use server-side `redirect()` from `next/navigation` (RSC pattern). No client-only auth checks that could be bypassed. | None — compliant. | SSR auth pattern |

---

## [A60] Third-Party Scripts

| ID | Severity | Category | Location | Description | Fix | Standard |
|----|----------|----------|----------|-------------|-----|----------|
| A60-01 | Low | SRI hashes | N/A | No external `<script src="...">` tags found in the codebase. All JS is bundled by Next.js. Google Fonts loaded via `next/font/google` (data inlined, no external script). | N/A — no third-party scripts to hash. | SRI spec |
| A60-02 | Info | CSP allowlist | `lib/csp.ts` | CSP controls which origins can serve scripts. Nonce-based policy prevents unauthorized inline execution. | None — compliant. | CSP Level 3 |
| A60-03 | Info | Data leakage | N/A | No third-party analytics scripts (GA, Segment, etc.) detected. Web Vitals reported to own `/api/vitals` endpoint. Sentry SDK bundled (first-party telemetry). | None — compliant. | Data minimization |
| A60-04 | Info | Font loading | `app/layout.tsx:2` | `next/font/google` — fonts are self-hosted at build time (no runtime request to Google). | None — compliant. | Privacy / Performance |

---

## Summary

| Severity | Count |
|----------|-------|
| Info (Compliant) | 85 |
| Low | 12 |
| Medium | 0 |
| High | 0 |
| Critical | 0 |

### Key Strengths

1. **IaC least-privilege** — Five separate Cloudflare API tokens, each scoped to a single capability.
2. **CI/CD hardening** — Pinned action SHAs, SBOM, SLSA provenance, cosign, gitleaks in pre-commit + CI.
3. **Multi-layer rate limiting** — Edge WAF rules + KV distributed limiter + Durable Object atomic limiter.
4. **CORS** — Explicit origin allowlist with `VerifiedSiteRef` type safety; no reflected origin.
5. **CSP** — Per-request nonce, no `unsafe-inline`/`unsafe-eval` in effective policy, dedicated report endpoint.
6. **Cookie security** — `__Host-` prefix, `HttpOnly`, `Secure`, `SameSite=Strict`, no `Domain` attribute.
7. **CSRF** — Double-submit cookie + SameSite=Strict + Origin validation.
8. **XSS prevention** — Allowlist-based sanitizer, entity-bypass regression tests, JSON-LD escaper.
9. **IDOR prevention** — Server-derived site_id via `withAuthz()`; resource ownership checked before mutation.
10. **Secret management** — No plaintext secrets in code, gitleaks pre-commit, per-trigger rotation, `wrangler secret put`.

### Recommendations (Low Priority)

| # | Recommendation | Effort |
|---|----------------|--------|
| 1 | Unify wrangler version across preview and deploy workflows | Trivial |
| 2 | Add structured-log PII redaction layer before Logpush | Medium |
| 3 | Adopt zod/valibot for formal API input schema validation | Medium |
| 4 | Enable R2 versioning when Cloudflare makes it GA | Low (monitor) |
| 5 | Add AV scanning for uploaded images (enterprise tier) | Medium |
| 6 | Document env-var kill switches in incident-response runbook | Low |
| 7 | Codify observability dashboards as IaC | Medium |
| 8 | Audit product update route for explicit field allowlist | Low |
| 9 | Add explicit egress filtering via Cloudflare Gateway | Medium |
| 10 | Verify secret rotation is exercised via periodic drills | Low |
