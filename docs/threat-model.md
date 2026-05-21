# Threat Model: Affilite-Mix

## Trust Boundaries

- **Cloudflare Edge**: All incoming HTTP traffic terminates at Cloudflare. We rely on Cloudflare WAF, Turnstile, and Rate Limiting.
- **Application Middleware**: Enforces CSRF, basic rate limits, active site scoping, and JWT extraction.
- **Supabase Database**: Uses Row Level Security (RLS) to enforce isolation for public data. Note that server-side API routes largely use `service_role` keys which bypass RLS. This is an accepted risk mitigated by strong API-level authorization.

## Known Risks and Accepted Trade-offs

1. **In-Memory Rate Limiter Fail-Open**:
   - _Risk_: If Cloudflare KV is unavailable, the rate limiter (`lib/rate-limit.ts`) falls back to per-isolate memory for a bounded grace window (`KV_GRACE_MS`, default 60 seconds, overridable via `RATE_LIMIT_KV_GRACE_MS`). After the grace window elapses without KV recovering, the limiter fails CLOSED — every rate-limited request is rejected with a 429-equivalent result. A successful KV call resets the grace window, so the next outage starts a fresh budget.
   - _Impact_: In a multi-isolate environment (like Cloudflare Pages / Workers), this gives an attacker temporary burst capacity (up to `KV_GRACE_MS` × isolate_count) before the limiter starts rejecting all requests. Login, newsletter, password reset, unsubscribe, and admin guard all share this code path.
   - _Mitigation_: The first failure fires a Sentry alert (`rate-limit.kv-unavailable-fail-open`) and emits a structured `rate_limit_kv_failopen` log line that operators can scrape into a burn-rate metric. The Durable Object rate limiter (`RATE_LIMITER_DO`) is preferred over KV when bound — it provides atomic per-key counters and avoids this fallback entirely.

2. **Service Role DB Access**:
   - _Risk_: API routes use `getServiceClient()` which bypasses Postgres RLS.
   - _Impact_: Any SQL injection or SSRF vulnerability in the API layer could lead to full database compromise.
   - _Mitigation_: Supabase migration `00055_harden_remaining_rls.sql` enforces `service_role` explicitly. Future work includes minting custom JWTs with `site_id` claims for true defense-in-depth.

3. **Cloudflare Vendor Lock-in**:
   - _Risk_: The platform is entirely dependent on Cloudflare Workers, KV, DOs, Queues, and Turnstile.
   - _Impact_: A Cloudflare-wide outage or policy change represents a single point of failure.

4. **JWT IP/UA Binding Aggregation**:
   - _Risk_: JWTs are bound to a `/24` IPv4 subnet and User-Agent hash.
   - _Impact_: Corporate VPNs or mobile carrier NATs may allow cross-device token reuse within the same network.
   - _Mitigation_: Accepted risk for improved UX over strict `/32` binding.

## Tenant Isolation (audit R-1, R-2, R-3, R-8)

The Supabase JWT carries `app_metadata.site_id` which Postgres RLS
reads via `public.current_request_site_id()`. Top-level `site_id`
claims are accepted only as a fallback for service-issued tokens and
are NOT consumed when an `app_metadata.site_id` is present. The 00067
migration removes the previous `IS NULL` fallback that allowed
authenticated users without a claim to see every row in every
site_id-scoped table.

Global config tables (`admin_users`, `roles`, `permissions`,
`role_permissions`, `audit_log`, `niche_templates`,
`integration_providers`, `site_integrations`, `stripe_events`,
`user_site_roles`) are service*role-only with explicit
`authenticated_no_access*<table>`deny policies for defense in depth.
RLS-only access to these tables is impossible by construction; any new
admin RPC that needs to write to them must use the`service_role`
client.

**Adversary**: Authenticated Supabase user (e.g. a comments author or
a magic-link recipient) attempts cross-tenant SELECT.
**Pre-00067 outcome**: SELECT on every site's content via `IS NULL`
fallback.
**Post-00067 outcome**: 0 rows. Cross-tenant authz integration tests
(`__tests__/cross-tenant-authz.test.ts` plus `tenant-isolation-rls`)
assert this directly.

## R2 Upload Path (audit U-1 — U-9)

The browser → R2 upload now flows through a private staging bucket and
a server-side promotion step. Magic-byte validation runs against the
staging bucket BEFORE the object is reachable at the public CDN URL.

| Threat                              | Mitigation                                                                                                                                                                                                                    |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Path traversal via filename         | Object key is generated server-side as `uploads/YYYY/MM/DD/<uuid>.<ext>`; the client filename is captured (after sanitization) only in `x-amz-meta-original-name`.                                                            |
| Oversized upload                    | `R2_MAX_UPLOAD_BYTES` is signed into the presigned PUT via `Content-Length`. Bodies that exceed the cap are rejected by R2 with 403 SignatureDoesNotMatch.                                                                    |
| MIME spoof / SVG XSS                | SVG is excluded from `ALLOWED_IMAGE_TYPES`. Magic-byte validation rejects `<?xml`, `<svg`, `<html` prefixes outright and verifies full PNG/JPEG/GIF/WEBP/AVIF brand signatures.                                               |
| Public visibility before validation | Uploads land in `R2_PRIVATE_BUCKET`. `/api/admin/upload/finalize` reads the first 32 bytes via a signed S3 GET; only on success does it server-side copy to `R2_PUBLIC_BUCKET`. Failed validations delete the staging object. |
| Audit log races upload              | Audit events fire from `/api/admin/upload/finalize` after promotion, not from `/api/admin/upload`.                                                                                                                            |

## CSV Import Memory Exhaustion (audit U-7)

`/api/admin/products/import` rejects bodies > 5 MB and CSVs with > 50 000
rows with `413 Payload Too Large`. The cap is enforced both via the
`Content-Length` header pre-form-data parsing and against `Blob.size`
after parsing.

## Organizational Controls (A207 / A208)

Code-side defenses (RLS, CSP, audit logs, rate limiting, JWT binding) are
documented above. Controls that live outside the codebase -- Cloudflare role
assignments, GitHub MFA enforcement, developer laptop hardening, third-party
service access reviews, and offboarding procedures -- are documented in
[`docs/org-security.md`](org-security.md).

## Red Team Rules of Engagement (A205)

Adversarial simulation engagements must follow the rules of engagement in
[`docs/red-team-roe.md`](red-team-roe.md) before any external testing
begins. The ROE defines scope, authorized techniques, success criteria,
deconfliction headers, and reporting format.

## Continuous Attack-Surface Management (A213)

A daily GitHub Actions workflow (`.github/workflows/asm.yml`) resolves all
declared domains, diffs Certificate Transparency logs, and scans for
unexpected open ports. Any new or changed public-facing asset triggers a
workflow failure for manual review.

## Pagination DoS (audit #22)

`lib/pagination.ts` clamps `?limit=` to `[1, 100]` and rejects
`offset > 100 000` and non-integer / non-finite values. Applied to
`/api/admin/products`, `/api/admin/content`, `/api/admin/ai-content`.
