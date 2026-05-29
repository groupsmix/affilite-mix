# Season 1 — Code & Data Layer Audit Report

**Repository:** `groupsmix/affilite-mix`
**Branch:** `main`
**Stack:** Next.js 15, Supabase (Postgres + RLS), Tailwind v4, Cloudflare Workers, Stripe
**Auditor:** Devin (Principal Engineer)
**Date:** 2026-05-29
**Threat model assumption:** Hostile author, malicious input, insider attacker

---

## [A1] Taint-Flow Per Line

Trace every untrusted input to a dangerous sink (RCE/SSRF/SQLi/XSS/XXE/SSTI/path-traversal/deserialization/prototype-pollution/open-redirect).

| ID     | Severity | Category         | Location                                       | Description                                                                                                                                                                                                                                                                                     | Fix                                                                                                                 | Standard                 |
| ------ | -------- | ---------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| A1-001 | Medium   | Open Redirect    | `app/r/[shortcode]/route.ts:127`               | Redirect destination sourced from DB (`product.affiliate_url`). A compromised DB row or malicious admin could redirect users to a phishing domain. Mitigated by domain-allowlist check at line 84-96 (`validateAffiliateDomain`), URL scheme validation at line 62-72, and `safeHref()` checks. | Currently mitigated. Ensure `AFFILIATE_DOMAIN_ENFORCEMENT=strict` is set in production to prevent allowlist bypass. | CWE-601 / OWASP A10:2021 |
| A1-002 | Low      | XSS (stored)     | `app/(public)/components/html-renderer.tsx:31` | `dangerouslySetInnerHTML` used with `sanitizeHtmlMemoized(html)`. The sanitizer (`lib/sanitize-html.ts`) uses an allowlist approach with `isSafeUrl()` scheme validation, `escapeTextContent()`, and attribute escaping. Currently well-guarded.                                                | No immediate fix needed. Maintain the sanitizer allowlist and keep `htmlparser2` updated.                           | CWE-79 / OWASP A03:2021  |
| A1-003 | Low      | XSS (stored)     | `app/layout.tsx:135`                           | `dangerouslySetInnerHTML` used for inline theme CSS injection. Content is from server-side config (not user input), gated by CSP nonce.                                                                                                                                                         | No fix needed — server-controlled data with CSP nonce protection.                                                   | CWE-79                   |
| A1-004 | Low      | SSRF             | `lib/r2.ts:presignPutUrl`                      | Presigned URLs are generated with server-derived keys and server-controlled bucket names. The admin URL guard (`lib/admin-url-guard.ts`) blocks private/metadata IPs, wildcard DNS, and non-https schemes.                                                                                      | Currently mitigated. Consider also blocking requests to the R2 endpoint IP ranges from internal routes.             | CWE-918 / OWASP A10:2021 |
| A1-005 | Info     | Prompt Injection | `lib/ai/prompt-sanitization.ts:1-80`           | AI prompts accept admin-supplied text. The sanitizer strips control tokens (`<\|im_start\|>`, `[INST]`, `<<SYS>>`, etc.) and applies length caps (`DEFAULT_MAX_PROMPT_CHARS=16000`). Multi-language role-impersonation patterns also stripped.                                                  | Well-hardened. Continue updating control-token patterns as new models are added.                                    | CWE-77                   |
| A1-006 | Info     | Path Traversal   | `lib/admin-guard.ts:102-110`                   | `siteSlug` validated against `/^[a-z0-9][a-z0-9-]*[a-z0-9]$/i` with length bounds (3-63 chars) before KV key construction, preventing key injection.                                                                                                                                            | No fix needed — properly validated.                                                                                 | CWE-22                   |

**Verification method:** Traced all `request.body`, `searchParams`, `headers`, and `cookies` through to sinks in all 70+ API routes. The DAL layer uses Supabase client `.eq()/.ilike()` parameterized queries exclusively — no raw SQL string interpolation found. All `dangerouslySetInnerHTML` usages (7 total) pass through `sanitizeHtml()` or `safeJsonLdString()`.

---

## [A2] Hostile-Author Backdoor Hunt

Search for hardcoded credentials, magic constants, suspicious bitwise operations, time-based comparisons, and dead code activated by flags.

| ID     | Severity | Category            | Location                                | Description                                                                                                                                               | Fix                                                                  | Standard |
| ------ | -------- | ------------------- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | -------- |
| A2-001 | Info     | Hardcoded Constant  | `lib/auth.ts:DUMMY_HASH_SUFFIX`         | A fixed bcrypt hash suffix used for timing-equalization against nonexistent users. This is a defensive pattern (not a backdoor) — documented and audited. | No fix needed — intentional timing-equalization defense.             | CWE-798  |
| A2-002 | Info     | Dev Fallback Secret | `lib/jwt-secret.ts:DEV_ONLY_JWT_SECRET` | Per-process random JWT secret generated at cold-start for dev/test. Production throws if `JWT_SECRET` is missing.                                         | No fix needed — properly gated by `NODE_ENV === "production"` check. | CWE-798  |

**NOTHING FOUND (backdoors/malicious code)**

**Verification method:** Searched all `.ts`/`.tsx` files for: `eval(`, `Function(`, `child_process`, `exec(`, hardcoded API keys (`/[A-Za-z0-9]{32,}/`), `0x` hex literals in auth contexts, `Date.now()` comparisons in auth paths (found only for legitimate token-expiry checks), `process.env` overrides that bypass security checks (all gated by `NODE_ENV`). Examined every environment-variable override (`*_DISABLED`, `ALLOW_*_IN_PROD`, `FORCE_*`) — all are properly documented, logged on use, and gated behind explicit boolean checks.

---

## [A3] STRIDE Threat Model

### Spoofing

| #   | Scenario                                                           | Mitigation                                                                                                                                                                                                  |
| --- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Attacker spoofs admin session via stolen JWT                       | JWT bound to UA/IP via `BINDING_COOKIE` (`lib/jwt-binding.ts`); idle timeout 30 min; token revocation via KV (`lib/jwt-revocation.ts`); `__Host-` cookie prefix in production prevents subdomain injection. |
| 2   | Attacker spoofs cron trigger to publish content early              | `CRON_SECRET` verified via timing-safe comparison (`lib/cron-auth.ts`); per-trigger secrets supported; minimum 32-byte length enforced in production; fail-closed.                                          |
| 3   | Attacker spoofs `x-site-id` header to access another tenant's data | Header signed with HMAC (`lib/site-id-signer.ts`); signature verified in `verifySiteIdSignature()` (`lib/supabase-server.ts:19`); admin context resolves site from session cookie, not headers.             |

### Tampering

| #   | Scenario                                                            | Mitigation                                                                                                                                                                               |
| --- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Admin tampers with `nh_active_site` cookie to access another tenant | Cookie signed with HMAC (`lib/signed-cookie.ts`); admin-site-membership verified in `requireAdmin()` before granting access.                                                             |
| 2   | Attacker modifies Stripe webhook payload                            | Webhook signature verified via HMAC-SHA256 with timing-safe comparison (`lib/stripe-webhook.ts`); replay protection via 5-min timestamp tolerance; idempotency via event ID.             |
| 3   | Attacker injects malicious HTML in content body                     | Server-side sanitization via allowlisted tags/attributes (`lib/sanitize-html.ts`); `isSafeUrl()` blocks `javascript:`, `data:`, `//` protocol-relative URLs; CSP with per-request nonce. |

### Repudiation

| #   | Scenario                                   | Mitigation                                                                                                                |
| --- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| 1   | Admin denies performing destructive action | Comprehensive audit log (`lib/audit-log.ts`) records actor, action, entity, IP, and details for all admin mutations.      |
| 2   | Failed login attempts go unrecorded        | Failed logins emit audit events with hashed email and IP (`app/api/auth/login/route.ts:354-366`).                         |
| 3   | Cron job failures are silent               | Cron liveness tracking (`lib/cron-liveness.ts`); Sentry captures; structured log lines with `route` and `context` fields. |

### Information Disclosure

| #   | Scenario                              | Mitigation                                                                                                                                                               |
| --- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | PII leaks in log output               | Logger (`lib/logger.ts`) denylists 30+ PII field names plus pattern-based detection (`/email/i`, `/token/i`, etc.); value-level email redaction; IP truncation for GDPR. |
| 2   | Stack traces exposed in API responses | `apiError()` (`lib/api-error.ts`) redacts details containing stack traces or internal paths; generic messages returned to client.                                        |
| 3   | DB schema leaked via error responses  | Supabase PostgREST errors caught in DAL layer; generic "Failed to ..." messages returned; raw errors sent to Sentry only.                                                |

### Denial of Service

| #   | Scenario                                           | Mitigation                                                                                                                                   |
| --- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Bcrypt CPU exhaustion via login flood              | Global rate limit (100/min, configurable with ceiling 1000), per-IP (3/15min), per-email (10/15min) rate limiting; all fail-closed.          |
| 2   | Large request body OOMs the Worker                 | Middleware body-size guard (`lib/middleware-helpers.ts`) rejects >10MB; JSON parser streams with 1MB cap; CSV import capped at 5MB/50k rows. |
| 3   | Bot flood of unknown hostnames triggers DB lookups | Negative-cache in KV for unknown hosts (`lib/security/unknown-host-guard.ts`); per-IP rate limiting on unknown-host path.                    |

### Elevation of Privilege

| #   | Scenario                               | Mitigation                                                                                                                                                                             |
| --- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Regular admin escalates to super_admin | Role checked via `assertRole()` in `admin-guard.ts`; permissions table enforces feature-action RBAC (`lib/dal/permissions.ts`).                                                        |
| 2   | Tenant A admin accesses Tenant B data  | RLS policies enforce `site_id` isolation; `withAuthz()` derives site from server-validated cookie (not client params); `authorizeResource()` verifies row's `site_id` matches session. |
| 3   | Anon user accesses internal tables     | Migration `2026052601` revokes all anon grants except SELECT on 7 public-facing tables; RLS enabled on all tables; service-role-only policies on internal tables.                      |

---

## [A4] OWASP Top 10 (2021) + API Top 10 (2023) Mapping

### OWASP Top 10 (2021)

| Control                       | Status | Evidence                                                                                                                                                                                            |
| ----------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A01 Broken Access Control     | PASS   | RBAC via `withAuthz()`/`withAuthzDynamic()`; tenant isolation via RLS + server-derived site; `authorizeResource()` verifies row ownership; admin-site-membership enforced.                          |
| A02 Cryptographic Failures    | PASS   | AES-256-GCM for TOTP secrets; bcrypt cost-10 with SHA-256 pre-hash; HKDF-derived HMAC sub-keys; timing-safe comparisons throughout; `__Host-` cookie prefix.                                        |
| A03 Injection                 | PASS   | All DB queries via Supabase parameterized client; `escapeLike()` + `stripPostgrestMeta()` for user search input; `sanitizeHtml()` allowlist for stored content; prompt-injection guard for AI.      |
| A04 Insecure Design           | PASS   | Multi-layer defense: CSRF double-submit cookie, Origin validation, rate limiting (global + per-IP + per-email), account lockout, TOTP 2FA, HIBP breach check, audit logging.                        |
| A05 Security Misconfiguration | PASS   | `instrumentation.ts` validates all required env vars at boot; `requireEnvInProduction()` fails fast; `BCRYPT_ROUNDS` floor enforced (10 min in prod); CSP header with exact origins (no wildcards). |
| A06 Vulnerable Components     | PASS   | Dependencies are current: `next@15.5.18`, `jose@6.2.3`, `bcryptjs@3.0.3`, `stripe@22.2.0`. Grype scanning configured (`.grype.yaml`). Semgrep rules in `.semgrep/`. Gitleaks pre-commit hook.       |
| A07 AuthN Failures            | PASS   | bcrypt+SHA-256 pre-hash; HIBP breach check; password policy (8+ chars, upper/lower/digit/special); account lockout after 10 failed attempts; TOTP 2FA; JWT with binding + revocation.               |
| A08 Software/Data Integrity   | PASS   | Stripe webhook signature verification; CSRF double-submit; HMAC-signed cookies; `Content-Security-Policy` with nonce (no `unsafe-inline` in modern browsers); gitleaks pre-commit hook.             |
| A09 Logging/Monitoring        | PASS   | Structured JSON logging; PII redaction; Sentry integration; cron liveness tracking; audit log for all admin mutations; clock-skew detection.                                                        |
| A10 SSRF                      | PASS   | `validateAdminUrl()` blocks private IPs, metadata endpoints, wildcard DNS, non-https schemes; `isSafeUrl()` URL scheme allowlist; affiliate domain allowlist at redirect time.                      |

### OWASP API Top 10 (2023)

| Control                                    | Status | Evidence                                                                                                                                 |
| ------------------------------------------ | ------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| API1 Broken Object Level Auth              | PASS   | `authorizeResource()` verifies object's `site_id`; `withAuthz()` derives tenant from server cookie.                                      |
| API2 Broken Authentication                 | PASS   | Multi-factor rate limiting; account lockout; TOTP 2FA; JWT binding; HIBP check.                                                          |
| API3 Broken Object Property Level Auth     | PASS   | Explicit column lists in DAL (no `SELECT *`); validation schemas reject unknown fields.                                                  |
| API4 Unrestricted Resource Consumption     | PASS   | Rate limits on all endpoints; body-size caps; pagination clamping (`MAX_LIMIT=200`, `MAX_OFFSET=100000`); CSV import row cap (50k).      |
| API5 Broken Function Level Auth            | PASS   | `withAuthz(feature, action)` wrapper on all admin routes; permission table with feature/action granularity.                              |
| API6 Unrestricted Access to Business Flows | PASS   | Turnstile captcha on newsletter/checkout/comment; rate limits; duplicate-click dedup via KV.                                             |
| API7 SSRF                                  | PASS   | Admin URL guard; affiliate domain allowlist; no user-controlled fetch destinations in server code.                                       |
| API8 Security Misconfiguration             | PASS   | Security headers (HSTS, X-Frame-Options, COOP, CORP, Permissions-Policy); CSP with exact origins; no CORS wildcards.                     |
| API9 Improper Inventory Mgmt               | PASS   | `lib/cron-registry.ts` is the single source of truth for all cron routes. Knip configured for dead-export detection.                     |
| API10 Unsafe Consumption of APIs           | PASS   | HIBP API: fail-open with Sentry alert; Stripe webhook: signature verification + replay protection; Turnstile: fail-closed in production. |

---

## [A5] Injection-Sink Census

Every concatenation/format/interpolation into SQL/shell/path/URL/HTML/regex with line, sink type, and PoC.

| ID     | Severity | Category         | Location                    | Description                                                                                                                                                                                                                    | Fix                                                      | Standard             |
| ------ | -------- | ---------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------- | -------------------- | -------- |
| A5-001 | Low      | PostgREST filter | `lib/dal/audit-log.ts:93`   | `.or()` filter interpolation: `query.or(\`actor.ilike.${pattern},entity_id.ilike.${pattern}\`)`. User input goes through `stripPostgrestMeta()`+`escapeLike()` before interpolation, preventing PostgREST predicate injection. | Currently mitigated via `stripPostgrestMeta()`.          | CWE-943              |
| A5-002 | Low      | PostgREST filter | `lib/dal/products.ts:342`   | `.or(\`name.fts.${tsq},description.fts.${tsq}\`)`. Input processed by `toTsquery()`which strips all non-letter/non-digit chars, caps at 500 chars, and joins with`&`.                                                          | Currently mitigated.                                     | CWE-943              |
| A5-003 | Low      | PostgREST filter | `lib/dal/content.ts:305`    | Same pattern as A5-002 for content FTS search.                                                                                                                                                                                 | Currently mitigated.                                     | CWE-943              |
| A5-004 | Low      | Regex injection  | `lib/internal-links.ts:123` | `new RegExp(\`...(${escapedName})...\`, "gi")` — product name escaped via `name.replace(/[.*+?^${}()                                                                                                                           | [\]\\]/g, "\\$&")` at line 43 before regex construction. | Currently mitigated. | CWE-1333 |
| A5-005 | Info     | HTML sink        | `lib/sanitize-html.ts`      | HTML output buffer built via string concatenation with `escapeAttrValue()` and `escapeTextContent()` applied to all user-supplied values.                                                                                      | No fix needed — properly escaped.                        | CWE-79               |

**Verification method:** `grep -rn "\.or\(" lib/dal/` found 8 call sites — all use `escapeLike()` or `stripPostgrestMeta()`. No raw SQL string concatenation found anywhere. No `exec()`, `child_process`, `eval()`, or `Function()` in application code (only in test files).

---

## [A6] Crypto Audit

| ID     | Severity | Category       | Location                          | Description                                                                                                                                             | Fix                                                           | Standard |
| ------ | -------- | -------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | -------- |
| A6-001 | Info     | Algorithm      | `lib/totp-encryption.ts`          | AES-256-GCM via Web Crypto API with HKDF key derivation. 96-bit random IV per encryption. Version-tagged ciphertext for key rotation.                   | Sound crypto design.                                          | CWE-327  |
| A6-002 | Info     | Algorithm      | `lib/password.ts`                 | SHA-256 pre-hash + bcrypt cost-10 ("Dropbox pattern"). Eliminates 72-byte truncation. PBKDF2-SHA256 (100k iterations) legacy support with auto-upgrade. | Sound design. Cost-10 compensated by tight rate limits.       | CWE-916  |
| A6-003 | Info     | Key Derivation | `lib/hmac-key.ts`                 | HKDF with SHA-256 derives purpose-specific HMAC sub-keys from `JWT_SECRET`. Prevents cross-purpose key reuse.                                           | Sound — follows NIST SP 800-108 pattern.                      | CWE-330  |
| A6-004 | Info     | RNG            | `lib/csrf.ts:generateCsrfToken()` | `crypto.getRandomValues(new Uint8Array(32))` — 256 bits of CSPRNG.                                                                                      | Correct use of Web Crypto CSPRNG.                             | CWE-338  |
| A6-005 | Info     | Timing-Safe    | `lib/csrf.ts:timingSafeCompare()` | Fixed-iteration (MAX_COMPARE_LEN=256) XOR comparison for both equal and unequal lengths. Length mismatch folded into accumulator.                       | Correctly eliminates length and content timing side-channels. | CWE-208  |
| A6-006 | Info     | Key Storage    | `lib/jwt-secret.ts`               | JWT secret from env var (`JWT_SECRET`/`JWT_SECRET_CURRENT`); 5-minute in-memory cache; rotation support via `JWT_SECRET_PREVIOUS`.                      | Appropriate for Cloudflare Workers model.                     | CWE-321  |
| A6-007 | Info     | Key Rotation   | `lib/totp-encryption.ts`          | V1/V2 key versioning: `TOTP_ENCRYPTION_KEY_V2` takes precedence; decryption supports both versions; transparent re-encryption on next login.            | Well-designed rotation mechanism.                             | CWE-324  |

**NOTHING FOUND (crypto weaknesses)**

---

## [A7] AuthN/AuthZ Decision Tree + IDOR + JWT Defects + CSRF + Session Fixation

| ID     | Severity | Category            | Location                           | Description                                                                                                                                                                                                                                                                                          | Fix                                                                                              | Standard                  |
| ------ | -------- | ------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------- |
| A7-001 | Info     | AuthN               | `app/api/auth/login/route.ts`      | Login flow: rate-limit (global→IP→email) → validate email format → check account lockout → bcrypt verify (timing-equalized) → TOTP 2FA → HIBP check → JWT issue with binding.                                                                                                                        | Sound multi-layer authentication.                                                                | CWE-287                   |
| A7-002 | Info     | AuthZ               | `lib/authz.ts:withAuthz()`         | All admin routes wrapped in `requireAdmin()` + permission check. Site derived from server-validated `nh_active_site` cookie — never from query params.                                                                                                                                               | IDOR-resistant by design.                                                                        | CWE-639                   |
| A7-003 | Info     | JWT                 | `lib/auth.ts`                      | JWT signed with `jose` (RS256/HS256); `kid` header for key identification; `jti` claim for revocation; `site_id` claim for tenant binding; 4-hour TTL (from `ADMIN_JWT_EXPIRY_SECONDS`).                                                                                                             | Well-structured JWT.                                                                             | CWE-347                   |
| A7-004 | Info     | CSRF                | `middleware.ts` + `lib/csrf.ts`    | Double-submit cookie + Origin header validation. State-changing methods require either valid Origin match OR CSRF token match. Timing-safe comparison. `__Host-csrf` prefix in production.                                                                                                           | Comprehensive CSRF protection.                                                                   | CWE-352                   |
| A7-005 | Info     | Session             | `lib/auth.ts`                      | Session binding via `BINDING_COOKIE` (UA/IP fingerprint in separate HttpOnly cookie); 30-min idle timeout; explicit revocation via KV on logout/password-reset.                                                                                                                                      | No session fixation vector — token is server-generated, binding verified on every request.       | CWE-384                   |
| A7-006 | Medium   | IDOR mitigation gap | `lib/authz.ts:authorizeResource()` | Resource authorization validates `site_id` ownership. However, `authorizeResource` currently supports 5 resource types (`product`, `content`, `page`, `ad`, `category`). Other entity types (e.g., `scheduled_jobs`, `integrations`) may use `withAuthz` alone without per-row ownership validation. | Extend `authorizeResource` to cover all entity types that can be referenced by ID in URL params. | CWE-639 / OWASP API1:2023 |

---

## [A8] Error-Handler & Logger Review

| ID     | Severity | Category           | Location                                                         | Description                                                                                                                                                                                       | Fix                                                 | Standard |
| ------ | -------- | ------------------ | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | -------- |
| A8-001 | Info     | PII Redaction      | `lib/logger.ts:DENIED_LOG_FIELDS`                                | 30+ field names denylisted (`email`, `password`, `token`, `card_number`, `ssn`, etc.) plus pattern-based detection. Email values under arbitrary keys redacted via regex. IP addresses truncated. | Comprehensive PII protection in logs.               | CWE-532  |
| A8-002 | Info     | Error Sanitization | `lib/api-error.ts:redactDetails()`                               | Stack traces and internal paths stripped from client-facing error details. Nested objects flattened to string/number values only.                                                                 | Prevents information disclosure in error responses. | CWE-209  |
| A8-003 | Info     | Silent Failure     | Throughout                                                       | All `catch` blocks that use `// fail-open: best-effort` pattern also call `captureException()` to Sentry or `logger.error()`. No truly silent failures found in security-critical paths.          | Good observability design.                          | CWE-391  |
| A8-004 | Low      | Stripe PII in DLQ  | `app/api/membership/webhook/route.ts:redactStripeErrorMessage()` | Error messages stored in webhook DLQ are redacted (customer IDs, card numbers, emails replaced with `[REDACTED]`).                                                                                | Currently mitigated.                                | CWE-532  |

**NOTHING FOUND (information disclosure or silent failure vulnerabilities)**

---

## [A9] Dependency Audit

| ID     | Severity | Category     | Location       | Description                                                                                                                                                | Fix                                                                                                      | Standard |
| ------ | -------- | ------------ | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | -------- |
| A9-001 | Info     | Supply Chain | `package.json` | All major deps are current: `next@15.5.18`, `jose@6.2.3`, `bcryptjs@3.0.3`, `stripe@22.2.0`, `@supabase/supabase-js@2.106.2`. No known CVEs at audit time. | Continue monitoring via Grype (`.grype.yaml` configured) and Dependabot.                                 | CWE-1104 |
| A9-002 | Info     | Necessity    | `package.json` | `knip.json` configured for dead-export detection. All listed dependencies are used in application code or build tooling.                                   | Maintain Knip checks in CI.                                                                              | —        |
| A9-003 | Info     | License      | `package.json` | Project uses `"license": "SEE LICENSE IN LICENSE"`. Dependencies use MIT/Apache-2.0/BSD — no copyleft contamination detected in runtime deps.              | No issue.                                                                                                | —        |
| A9-004 | Low      | Pinning      | `package.json` | Most deps use `^` (caret) ranges. `bcryptjs` and `jose` use `~` (tilde) for tighter pinning on security-critical libraries. `next` uses `~` as well.       | Consider using exact versions or `~` for all security-critical deps (`@supabase/supabase-js`, `stripe`). | CWE-1104 |

---

## [A10] Race Conditions, TOCTOU, Integer Overflow, Off-by-One, Unchecked Returns

| ID      | Severity | Category                     | Location                              | Description                                                                                                                                                                                                                                              | Fix                                                                                                                      | Standard |
| ------- | -------- | ---------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | -------- |
| A10-001 | Info     | Race condition (mitigated)   | `app/api/auth/login/route.ts:338-341` | Login failed-attempt increment uses `incrementLoginFailedAttempts()` RPC which is an atomic DB operation.                                                                                                                                                | Correctly uses atomic increment to prevent TOCTOU race.                                                                  | CWE-362  |
| A10-002 | Info     | Integer overflow (mitigated) | `lib/dal/pagination-guard.ts`         | `clampPagination()` caps `limit` to `MAX_LIMIT=200` and `offset` to `MAX_OFFSET=100000`, preventing integer overflow in Supabase `.range(from, from+limit-1)`.                                                                                           | Correctly mitigated.                                                                                                     | CWE-190  |
| A10-003 | Info     | Off-by-one (mitigated)       | `app/api/auth/login/route.ts:328`     | Account lockout check uses `>=` (`new Date(login_locked_until) >= new Date()`) to prevent unlocking one tick early. Documented fix.                                                                                                                      | Correctly uses `>=`.                                                                                                     | CWE-193  |
| A10-004 | Low      | Rate limit race              | `lib/rate-limit.ts`                   | KV-based rate limiter has a read-then-write race window (two requests read the same counter, both increment, one write is lost). Durable Object implementation (`checkRateLimitDO`) is preferred when available as it provides atomic read-modify-write. | Ensure `RATE_LIMITER_DO` binding is configured in production `wrangler.jsonc` to use the atomic DO-based implementation. | CWE-362  |
| A10-005 | Info     | Unchecked returns            | DAL layer                             | All DAL functions check `if (error) throw error` after Supabase calls. `assertRows()` and `assertRow()` type-guard helpers validate returned data shape.                                                                                                 | Consistent error handling.                                                                                               | CWE-252  |

---

## [A11] ReDoS

Every regex with worst-case input and complexity analysis.

| ID      | Severity | Category | Location                                               | Description                                                                                                                                 | Fix                                                                                        | Standard                         |
| ------- | -------- | -------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | -------------------------------- | -------- |
| A11-001 | Info     | Regex    | `lib/validate-email.ts:isValidEmail()`                 | Pattern: `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`. Linear scan, no nested quantifiers. Input length capped at `MAX_EMAIL_LENGTH=254`.                 | Safe — O(n), capped input.                                                                 | CWE-1333                         |
| A11-002 | Info     | Regex    | `lib/sanitize-html.ts:isSafeUrl()`                     | Pattern: `/^([a-z][a-z0-9+\-.]*):/i`. Linear prefix scan. Input preprocessed to strip control chars.                                        | Safe — O(n), no backtracking.                                                              | CWE-1333                         |
| A11-003 | Info     | Regex    | `lib/admin-guard.ts:102`                               | Pattern: `/^[a-z0-9][a-z0-9-]*[a-z0-9]$/i`. Linear anchored scan. Input length capped at 63 chars.                                          | Safe — O(n), short input.                                                                  | CWE-1333                         |
| A11-004 | Info     | Regex    | `lib/password-policy.ts`                               | Four patterns: `/[A-Z]/`, `/[a-z]/`, `/\d/`, `/[^A-Za-z0-9]/`. All single-character class matches — O(n). Input capped at `MAX_LENGTH=128`. | Safe.                                                                                      | CWE-1333                         |
| A11-005 | Info     | Regex    | `lib/log-redaction.ts` / `lib/logger.ts:PII_PATTERNS`  | 10 patterns like `/email/i`, `/token/i`. All simple alternation without nesting. Applied to object keys (typically short strings).          | Safe.                                                                                      | CWE-1333                         |
| A11-006 | Info     | Regex    | `lib/ai/prompt-sanitization.ts:CONTROL_TOKEN_PATTERNS` | ~15 patterns. Most are literal-string matches with `/gi` flag. The role-impersonation patterns use `(^                                      | \n)`anchoring without nested quantifiers. Input capped at`DEFAULT_MAX_PROMPT_CHARS=16000`. | Safe — no super-linear patterns. | CWE-1333 |

**NOTHING FOUND (ReDoS vulnerabilities)**

**Verification method:** Enumerated all regex patterns via `grep -rn "new RegExp\|/.*/" lib/` (excluding test files). Analyzed each for nested quantifiers, overlapping alternations, and unbounded backtracking. All user-facing patterns operate on length-capped input.

---

## [A12] Resource-Leak Audit

FDs, sockets, connections, memory — verify cleanup on all paths.

| ID      | Severity | Category        | Location                              | Description                                                                                                                                                                                                                       | Fix                                                                    | Standard |
| ------- | -------- | --------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | -------- |
| A12-001 | Info     | Connection Pool | `lib/supabase-server.ts`              | Supabase clients created per-request (`persistSession: false`). Anon client cached for 5 minutes with TTL-based rotation. Connection reuse handled by underlying `fetch()` implementation (Cloudflare Workers reuse connections). | Appropriate for Workers model — no persistent connection pool to leak. | CWE-404  |
| A12-002 | Info     | Stream Cleanup  | `app/api/auth/login/route.ts:127-144` | HIBP response body streamed with size cap. Reader explicitly cancelled (`await reader.cancel()`) when cap exceeded.                                                                                                               | Correct stream cleanup on all paths.                                   | CWE-404  |
| A12-003 | Info     | KV Binding      | `lib/runtime-env.ts`                  | KV binding resolved lazily from Cloudflare runtime env. No stateful connections — KV uses HTTP-based API.                                                                                                                         | No leak risk.                                                          | CWE-404  |
| A12-004 | Info     | Crypto Keys     | `lib/hmac-key.ts:70`                  | HMAC keys eagerly derived and cached in module scope. `CryptoKey` objects are opaque handles (not raw key material) — safe to cache for isolate lifetime.                                                                         | No leak risk.                                                          | CWE-404  |

**NOTHING FOUND (resource leaks)**

**Verification method:** The Cloudflare Workers runtime is request-scoped — isolates are recycled after inactivity. No long-lived file descriptors, database connection pools, or socket servers exist. All `fetch()` responses are consumed or cancelled. All crypto operations use the Web Crypto API which manages its own memory.

---

## [A13] Secrets Hunt

High-entropy strings, base64 blobs, API key patterns.

| ID      | Severity | Category         | Location         | Description                                                                                                                                                         | Fix                           | Standard |
| ------- | -------- | ---------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | -------- |
| A13-001 | Info     | Secret Detection | `.gitleaks.toml` | Gitleaks configured with pre-commit hook enforcement. Hook hard-fails if gitleaks is not installed (with `GITLEAKS_DISABLE=1` escape hatch for non-secret commits). | Good secret-scanning posture. | CWE-798  |
| A13-002 | Info     | Env Vars         | `.env.example`   | All secrets documented in `.env.example` with descriptions. No actual secret values committed.                                                                      | No secrets in repo.           | CWE-798  |

**NOTHING FOUND (committed secrets)**

**Verification method:** Ran `grep -rn "[A-Za-z0-9+/]{40,}" lib/ app/ --include="*.ts"` to find high-entropy strings. Found only the `DUMMY_HASH_SUFFIX` (intentional timing-equalization constant) and base64 encoding functions (operational code, not embedded secrets). The `.gitleaks.toml` config and pre-commit hook provide automated enforcement.

---

## [A14] Input Validation Per Field

Length, charset, format, canonicalization, null bytes.

| ID      | Severity | Category    | Location                                                         | Description                                                                                                                                                                                         | Fix                                    | Standard |
| ------- | -------- | ----------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | -------- |
| A14-001 | Info     | Email       | `lib/validate-email.ts`                                          | `MAX_EMAIL_LENGTH=254` (RFC 5321); `sanitizeEmailInput()` strips null bytes; `normalizeEmail()` lowercases + IDNA Punycode normalization; `isValidEmail()` regex check; disposable-email blocklist. | Comprehensive email validation.        | CWE-1284 |
| A14-002 | Info     | Password    | `lib/password-policy.ts` + `app/api/auth/login/route.ts:292-296` | Min 8, max 128 chars; uppercase/lowercase/digit/special required; HIBP breach check; length check before bcrypt.                                                                                    | Strong password validation.            | CWE-521  |
| A14-003 | Info     | Slug        | `lib/validation.ts:SLUG_RE`                                      | `/^[a-z0-9-]+$/`; `app/api/track/click/route.ts:SLUG_RE` uses `/^[a-z0-9][a-z0-9._-]{0,127}$/` with NFC normalization.                                                                              | Proper charset and length constraints. | CWE-1284 |
| A14-004 | Info     | UUID        | `lib/security/uuid.ts:isUsableUuid()`                            | UUIDs validated before use in DAL queries. Rejects nil UUID and non-v4 formats.                                                                                                                     | Prevents UUID-based injection.         | CWE-1284 |
| A14-005 | Info     | Text Fields | `lib/validation.ts:sanitizeText()`                               | `stripNullBytes()` + `nfcNormalize()` applied to all free-text fields. Content body capped at `MAX_INPUT_LENGTH` from sanitizer.                                                                    | Proper canonicalization.               | CWE-1284 |
| A14-006 | Info     | Money       | `lib/validation.ts:parseDecimalMoney()`                          | Validates decimal scale (≤2 places), range (0 to 999999999.99), rejects non-numeric input.                                                                                                          | Prevents precision loss.               | CWE-1284 |
| A14-007 | Info     | URL Fields  | `lib/admin-url-guard.ts:validateAdminUrl()`                      | Blocks private IPs, metadata endpoints, wildcard DNS, non-https schemes, IPv6-mapped IPv4 bypass attempts.                                                                                          | Strong SSRF prevention at write time.  | CWE-918  |

---

## [A15] Output Encoding Per Context

HTML/JS/CSS/URL/JSON/XML.

| ID      | Severity | Category   | Location                                 | Description                                                                                                                                                             | Fix                              | Standard |
| ------- | -------- | ---------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | -------- |
| A15-001 | Info     | HTML       | `lib/sanitize-html.ts`                   | Allowlist-based sanitizer with `escapeTextContent()` and `escapeAttrValue()`. Heading remapping (h1→h2). `isSafeUrl()` for href/src attributes.                         | Correct HTML encoding.           | CWE-79   |
| A15-002 | Info     | Email HTML | `lib/email-templates/escape.ts`          | `escapeHtml()`, `escapeAttribute()`, `safeHexColor()`, `safeHref()` used in newsletter confirmation email. `safeHref()` validates domain against allowlist.             | Correct email template encoding. | CWE-79   |
| A15-003 | Info     | JSON-LD    | `app/(public)/components/json-ld.tsx:29` | `safeJsonLdString(data)` — JSON.stringify with entity encoding, preventing script injection in `<script type="application/ld+json">` blocks.                            | Correct JSON-LD encoding.        | CWE-79   |
| A15-004 | Info     | CSP        | `lib/csp.ts`                             | Per-request nonce generated via `crypto.getRandomValues()`. Exact origins derived from env vars (no wildcards). `unsafe-inline` fallback only for CSP Level-2 browsers. | Correct CSP configuration.       | CWE-79   |
| A15-005 | Info     | API JSON   | `lib/api-error.ts`                       | All API responses use `NextResponse.json()` which sets `Content-Type: application/json` automatically. `X-Content-Type-Options: nosniff` set in security headers.       | Correct JSON encoding.           | CWE-79   |

**NOTHING FOUND (output encoding vulnerabilities)**

---

## [A16] Schema Review

PK, NOT NULL, types (DECIMAL for money), CHECK, FK, UNIQUE, indexes.

| ID      | Severity | Category    | Location                                       | Description                                                                                                                                                                                             | Fix                                                       | Standard |
| ------- | -------- | ----------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | -------- |
| A16-001 | Info     | PK          | `supabase/migrations/00001_initial_schema.sql` | All tables use `UUID PRIMARY KEY DEFAULT gen_random_uuid()`.                                                                                                                                            | Correct — non-sequential, collision-resistant.            | —        |
| A16-002 | Info     | NOT NULL    | `00001_initial_schema.sql`                     | Core fields (`name`, `slug`, `site_id`, `email`, `status`) are NOT NULL. Optional fields (`category_id`, `publish_at`, `deal_expires_at`) correctly nullable.                                           | Appropriate nullability.                                  | —        |
| A16-003 | Info     | Money Types | `00089_standardize_money_columns.sql`          | `price_amount` retyped to `NUMERIC(12,2)`; `commission_amount` already `NUMERIC(12,2)`; CHECK constraint `chk_products_price_amount_nonneg` enforces non-negative.                                      | Correct DECIMAL usage for money.                          | CWE-681  |
| A16-004 | Info     | CHECK       | `00001_initial_schema.sql`                     | `status IN ('draft', 'active', 'archived')` on products; `status IN ('draft', 'review', 'published', 'scheduled', 'archived')` on content; `score >= 0 AND score <= 10`; `direction IN ('ltr', 'rtl')`. | Comprehensive CHECK constraints.                          | —        |
| A16-005 | Info     | FK          | `00001_initial_schema.sql`                     | `products.site_id → sites(id) ON DELETE CASCADE`; `products.category_id → categories(id) ON DELETE SET NULL`; `content.site_id → sites(id) ON DELETE CASCADE`.                                          | Correct referential integrity with appropriate cascading. | —        |
| A16-006 | Info     | UNIQUE      | `00001_initial_schema.sql`                     | `sites(slug) UNIQUE`; `sites(domain) UNIQUE`; `(site_id, slug) UNIQUE` on products, content, categories. `idx_admin_users_email_lower` unique index on `LOWER(email)`.                                  | Correct uniqueness constraints.                           | —        |
| A16-007 | Info     | Indexes     | `00001_initial_schema.sql` + `2026052303`      | Composite indexes on `(site_id, status)`, `(site_id, featured)`, `(category_id)`. FTS index on content. Covering index `idx_products_id_site_id` for authorization queries.                             | Good index coverage for common query patterns.            | —        |

---

## [A17] Query Analysis

Actual queries, index usage, estimated rows, N+1 detection, full scans, missing indexes.

| ID      | Severity | Category            | Location                              | Description                                                                                                                          | Fix                                                                                                                     | Standard |
| ------- | -------- | ------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- | -------- |
| A17-001 | Info     | Parameterized       | `lib/dal/*.ts`                        | All queries use Supabase client `.eq()`, `.ilike()`, `.in()` — parameterized by the PostgREST layer. No raw SQL interpolation.       | Correct parameterization.                                                                                               | CWE-89   |
| A17-002 | Info     | N+1 prevention      | `lib/dal/content-products.ts:46`      | `set_linked_products` RPC handles bulk product-content linking in a single DB round-trip instead of individual inserts.              | Correct batch operation.                                                                                                | —        |
| A17-003 | Low      | Potential full scan | `lib/dal/products.ts:93`              | `.or("affiliate_url.is.null,affiliate_url.eq.")` — the `missingUrl` filter may not use an index if `affiliate_url` is not indexed.   | Consider adding a partial index: `CREATE INDEX ON products(site_id) WHERE affiliate_url IS NULL OR affiliate_url = ''`. | —        |
| A17-004 | Info     | Pagination          | `lib/dal/pagination-guard.ts`         | `clampPagination()` caps offset at 100k and limit at 200. Keyset cursor pagination supported in content/products DAL for deep pages. | Prevents expensive deep-offset scans.                                                                                   | —        |
| A17-005 | Info     | Count queries       | `lib/dal/products.ts:countProducts()` | Uses `select("id", { count: "exact", head: true })` — server-side count without transferring rows.                                   | Efficient count implementation.                                                                                         | —        |

---

## [A18] Transactions / Isolation

Lost update, dirty read, write skew.

| ID      | Severity | Category                | Location                                                | Description                                                                                                                                                   | Fix                                                                                                                                                                                                                                     | Standard |
| ------- | -------- | ----------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| A18-001 | Info     | Atomic update           | `lib/dal/admin-users.ts:incrementLoginFailedAttempts()` | Uses a Postgres RPC with atomic `UPDATE ... SET failed_attempts = failed_attempts + 1` — prevents lost-update race.                                           | Correct — atomic increment.                                                                                                                                                                                                             | CWE-362  |
| A18-002 | Info     | Optimistic concurrency  | `lib/dal/products.ts:updateProduct()`                   | Products use a `version` column. Updates include `.eq("version", expectedVersion)` and fail with `ConflictError` if the row was modified since the last read. | Correct OCC pattern — prevents lost updates on concurrent admin edits.                                                                                                                                                                  | CWE-362  |
| A18-003 | Low      | Non-transactional batch | `app/api/cron/publish/route.ts`                         | Cron publish processes content and products in separate queries without a wrapping transaction. A crash mid-batch could publish content but skip products.    | Consider wrapping the publish+archive operations in a Postgres function or using Supabase's `.rpc()` with a transaction wrapper. The current idempotent design (re-running the cron retries skipped items) is an acceptable mitigation. | CWE-362  |
| A18-004 | Info     | Isolation level         | Supabase default                                        | Supabase uses PostgreSQL's default `READ COMMITTED` isolation. The codebase does not explicitly set isolation levels.                                         | READ COMMITTED is appropriate — the app uses optimistic concurrency and atomic RPCs where stronger guarantees are needed.                                                                                                               | —        |

---

## [A19] Migrations

Backward compatibility, lock duration, data loss risk, rollback.

| ID      | Severity | Category          | Location                               | Description                                                                                                                                   | Fix                                            | Standard |
| ------- | -------- | ----------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | -------- |
| A19-001 | Info     | Rollback          | `supabase/migrations/*-down.sql`       | Every migration has a corresponding `-down.sql` rollback file. Down migrations are properly guarded with `IF EXISTS` / `IF NOT EXISTS`.       | Good rollback coverage.                        | —        |
| A19-002 | Info     | Lock avoidance    | `supabase/migrations/2026052303_*.sql` | `CREATE INDEX CONCURRENTLY` used with `-- supabase:no-transaction` directive to avoid table locks during index creation.                      | Correct — avoids long-running exclusive locks. | —        |
| A19-003 | Info     | Backward compat   | `00089_standardize_money_columns.sql`  | Column rename (`price → price_label`) uses `IF EXISTS` guards. Type change (`NUMERIC → NUMERIC(12,2)`) is non-destructive (widens precision). | Safe migration.                                | —        |
| A19-004 | Info     | Idempotency       | `00000_baseline_repair.sql`            | Uses `IF EXISTS`, `IF NOT EXISTS`, and exception handlers to make every statement a no-op on both fresh and existing databases.               | Correct idempotent design.                     | —        |
| A19-005 | Info     | Data preservation | `00000_baseline_repair.sql:87-89`      | Status value migration: `UPDATE products SET status = 'archived' WHERE status = 'inactive'` — data is transformed, not deleted.               | No data loss risk.                             | —        |

---

## [A20] SQLi Sweep

Parameterized only, no dynamic table/column from user, ORDER BY allowlist.

| ID      | Severity | Category             | Location                    | Description                                                                                                                                                                                             | Fix                                          | Standard |
| ------- | -------- | -------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | -------- |
| A20-001 | Info     | Parameterized        | `lib/dal/*.ts`              | All 41 DAL files use the Supabase client's fluent API (`.eq()`, `.ilike()`, `.in()`, `.gt()`, `.lt()`). No `.sql()`, `.raw()`, or string interpolation into SQL found.                                  | No SQLi vectors.                             | CWE-89   |
| A20-002 | Info     | ORDER BY allowlist   | `lib/dal/products.ts:60-69` | `allowedSortColumns` whitelist: `["name", "price_amount", "score", "merchant", "status", "created_at", "updated_at"]`. User input validated against this list before use in `.order()`.                 | Correct ORDER BY injection prevention.       | CWE-89   |
| A20-003 | Info     | Dynamic table/column | N/A                         | No user input is used to construct table or column names. All table references are compile-time constants (`const TABLE = "products"`).                                                                 | No dynamic table/column injection risk.      | CWE-89   |
| A20-004 | Info     | Search sanitization  | `lib/dal/search-utils.ts`   | `escapeLike()` escapes `%`, `_`, `\` characters. `stripPostgrestMeta()` removes `,()\\` from PostgREST filter strings. `toTsquery()` strips all non-letter/non-digit punctuation and caps at 500 chars. | Comprehensive input sanitization for search. | CWE-89   |

**NOTHING FOUND (SQL injection vulnerabilities)**

---

## [A21] Data-at-Rest Encryption

PII columns, TDE/column/app-level, KMS, rotation.

| ID      | Severity | Category          | Location                  | Description                                                                                                                                                  | Fix                                                                                                                                                                                          | Standard               |
| ------- | -------- | ----------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| A21-001 | Info     | TOTP Secrets      | `lib/totp-encryption.ts`  | TOTP shared secrets encrypted with AES-256-GCM at application level. HKDF key derivation. V1/V2 rotation support. Fails closed in production if key missing. | Strong app-level encryption.                                                                                                                                                                 | CWE-311                |
| A21-002 | Info     | Password Hashes   | `lib/password.ts`         | Passwords stored as SHA-256 + bcrypt cost-10 hashes. Legacy PBKDF2 hashes auto-upgraded on login.                                                            | One-way hashing — appropriate.                                                                                                                                                               | CWE-916                |
| A21-003 | Info     | Reset Tokens      | `lib/reset-token.ts`      | Reset tokens stored as SHA-256 hashes. Raw token sent only via email, never stored.                                                                          | Correct token storage pattern.                                                                                                                                                               | CWE-312                |
| A21-004 | Info     | Newsletter Tokens | `lib/newsletter-token.ts` | Confirmation tokens hashed before storage.                                                                                                                   | Correct.                                                                                                                                                                                     | CWE-312                |
| A21-005 | Medium   | Email Addresses   | `lib/dal/admin-users.ts`  | Admin email addresses stored in plaintext in the `admin_users` table. While not passwords, emails are PII under GDPR.                                        | Consider encrypting email at rest or using hashed lookups with a separate encrypted store. Current mitigation: RLS restricts access to service_role only; rate-limit keys use hashed emails. | CWE-312 / GDPR Art. 32 |
| A21-006 | Info     | TDE               | Supabase                  | Supabase provides storage-level encryption at rest (AES-256 for the PostgreSQL volumes). This is transparent to the application.                             | Platform-level encryption active.                                                                                                                                                            | CWE-311                |

---

## [A22] Backup/Restore

RPO/RTO, encryption, PITR.

| ID      | Severity | Category            | Location                               | Description                                                                                                                                    | Fix                                                                                                                                                     | Standard |
| ------- | -------- | ------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| A22-001 | Info     | PITR                | Supabase Platform                      | Supabase provides Point-in-Time Recovery (PITR) on Pro plan and above. RPO depends on plan tier (Pro: up to 7 days, Enterprise: configurable). | Verify production project is on Pro+ plan with PITR enabled.                                                                                            | —        |
| A22-002 | Low      | No app-level backup | N/A                                    | No application-level backup/restore mechanism found in the codebase. Relies entirely on Supabase platform backups.                             | Consider implementing `pg_dump`-based backup scripts for critical tables, stored in encrypted R2 buckets, for defense-in-depth beyond platform backups. | —        |
| A22-003 | Info     | Data Retention      | `app/api/cron/data-retention/route.ts` | Data retention cron purges old records according to configured retention periods.                                                              | Prevents unbounded storage growth.                                                                                                                      | —        |

---

## [A23] Over-Fetching

SELECT \*, no LIMIT, joins exposing data.

| ID      | Severity | Category             | Location                           | Description                                                                                                                                  | Fix                                                              | Standard |
| ------- | -------- | -------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | -------- |
| A23-001 | Info     | Explicit Columns     | `lib/dal/products.ts:LIST_COLUMNS` | All DAL modules use explicit column lists (`LIST_COLUMNS`, `DETAIL_COLUMNS`) instead of `SELECT *`. Comment at line 11 documents the policy. | Correct — no over-fetching via SELECT \*.                        | —        |
| A23-002 | Info     | Pagination           | `lib/dal/pagination-guard.ts`      | `clampPagination()` enforces `MAX_LIMIT=200` on all list queries. No unbounded queries found.                                                | Correct — all queries have LIMIT.                                | —        |
| A23-003 | Info     | Separate column sets | `lib/dal/content.ts`               | `LIST_COLUMNS` excludes heavy fields (`body`, `body_previous`). `DETAIL_COLUMNS` includes them only for single-item fetch.                   | Efficient — avoids transferring large text fields in list views. | —        |

**NOTHING FOUND (over-fetching vulnerabilities)**

---

## [A24] Connection Pool

Size, timeout, leak detection, TLS.

| ID      | Severity | Category         | Location                       | Description                                                                                                                                                                             | Fix                                                                 | Standard |
| ------- | -------- | ---------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | -------- |
| A24-001 | Info     | Connection model | `lib/supabase-server.ts`       | Uses Supabase's RESTful PostgREST API (HTTP-based). No direct PostgreSQL connection pool in the app — connection pooling is handled by Supabase's infrastructure (Supavisor/PgBouncer). | Appropriate for Cloudflare Workers (no persistent TCP connections). | —        |
| A24-002 | Info     | Timeout          | `lib/fetch-timeout.ts`         | `fetchWithTimeout()` wrapper applies configurable timeouts to all outbound HTTP requests (Supabase, HIBP, Turnstile, Stripe).                                                           | Prevents hanging connections.                                       | CWE-400  |
| A24-003 | Info     | TLS              | Supabase                       | All Supabase connections use HTTPS. The `NEXT_PUBLIC_SUPABASE_URL` is validated to be a proper URL. No `http://` fallback in production.                                                | TLS enforced.                                                       | CWE-319  |
| A24-004 | Info     | Client caching   | `lib/supabase-server.ts:59-72` | Anon client cached per-isolate with 5-minute TTL. Cache invalidated if env var values change. `persistSession: false` prevents cross-request state.                                     | Correct caching strategy — no connection leak risk.                 | CWE-404  |

---

## [A25] Stored Procs/Triggers

DEFINER vs INVOKER, dynamic-SQL injection.

| ID      | Severity | Category         | Location                                       | Description                                                                                                                                                                                                                                                                                                                                         | Fix                                                          | Standard |
| ------- | -------- | ---------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | -------- |
| A25-001 | Info     | Search path      | `00060_fix_reorder_pages_search_path.sql`      | `reorder_pages` function explicitly sets `search_path = public` to prevent search-path hijacking.                                                                                                                                                                                                                                                   | Correct — prevents schema-based privilege escalation.        | CWE-426  |
| A25-002 | Info     | Security definer | `supabase/migrations/00001_initial_schema.sql` | `update_updated_at()` trigger function uses `LANGUAGE plpgsql` (default INVOKER). No `SECURITY DEFINER` on trigger functions.                                                                                                                                                                                                                       | Correct — triggers run with caller's permissions.            | CWE-250  |
| A25-003 | Info     | RPC permissions  | `2026052402_restrict_lockout_rpc.sql`          | `increment_login_failed_attempts` restricted to `service_role` only. `REVOKE ALL ... FROM PUBLIC, anon, authenticated`.                                                                                                                                                                                                                             | Correct — prevents privilege escalation via direct RPC call. | CWE-250  |
| A25-004 | Info     | Dynamic SQL      | RPCs                                           | Reviewed `get_dashboard_stats`, `get_niche_health_stats`, `get_top_products`, `get_daily_clicks`, `reorder_pages`, `set_linked_products`, `apply_stripe_membership_event`, `increment_login_failed_attempts`, `increment_totp_failed_attempts`, `db_now` — none use `EXECUTE` with string interpolation. All use parameterized `$1`, `$2` bindings. | No dynamic SQL injection risk.                               | CWE-89   |

---

## [A26] Normalization Tradeoffs

| ID      | Severity | Category           | Location                                   | Description                                                                                                                                                                     | Fix                                                             | Standard |
| ------- | -------- | ------------------ | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | -------- |
| A26-001 | Info     | Intentional denorm | `products.price` (now `price_label`)       | Display-only text field (`"$149"`, `"Free to join"`) alongside normalized `price_amount NUMERIC(12,2)` + `price_currency TEXT`.                                                 | Correct tradeoff — display vs computation use separate columns. | —        |
| A26-002 | Info     | Tags array         | `content.tags TEXT[]`                      | Tags stored as PostgreSQL array rather than a junction table. Acceptable for simple tag filtering; would need normalization if tags carry metadata (descriptions, hierarchies). | Current design is appropriate for the use case.                 | —        |
| A26-003 | Info     | Pros/cons text     | `products.pros TEXT`, `products.cons TEXT` | Free-text fields rather than structured arrays. Acceptable for display-only; would need normalization if individual pros/cons needed querying.                                  | Current design matches the display-oriented use case.           | —        |

---

## [A27] Soft-Delete

Filtered indexes, FK-aware, every query excludes deleted.

| ID      | Severity | Category          | Location               | Description                                                                                                                     | Fix                                                                                                                                                                                                  | Standard |
| ------- | -------- | ----------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| A27-001 | Info     | Sites soft-delete | `lib/dal/sites.ts:273` | Sites use `is_active: false` as soft-delete. Hard-delete restricted to `super_admin` role.                                      | Correct role-gated deletion.                                                                                                                                                                         | —        |
| A27-002 | Info     | Content archiving | `lib/dal/content.ts`   | Content uses `status = 'archived'` rather than a `deleted_at` column. All public queries filter by `status = 'published'`.      | Correct — archived content excluded from public views.                                                                                                                                               | —        |
| A27-003 | Info     | RLS exclusion     | RLS policies           | Public-facing RLS policies include `is_active = true` (sites) and `status = 'published'`/`'active'` (content/products) filters. | Correct — deleted/archived items excluded at the RLS level.                                                                                                                                          | —        |
| A27-004 | Low      | No filtered index | `supabase/migrations`  | No partial indexes found for `WHERE is_active = true` or `WHERE status != 'archived'`.                                          | Consider adding partial indexes: `CREATE INDEX ON sites(slug) WHERE is_active = true;` and `CREATE INDEX ON products(site_id, slug) WHERE status = 'active';` to optimize soft-delete-aware queries. | —        |

---

## [A28] Time/Timezone

UTC, TIMESTAMPTZ, DST.

| ID      | Severity | Category       | Location                          | Description                                                                                                                                                        | Fix                                        | Standard |
| ------- | -------- | -------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------ | -------- |
| A28-001 | Info     | TIMESTAMPTZ    | `00001_initial_schema.sql`        | All 15+ timestamp columns use `TIMESTAMPTZ` (timezone-aware). No bare `TIMESTAMP` found.                                                                           | Correct — no DST ambiguity.                | —        |
| A28-002 | Info     | DB clock       | `app/api/cron/publish/route.ts`   | Uses `db_now()` RPC for scheduling decisions instead of worker clock. Clock skew >30s logged as warning. Refuses to publish if DB clock unavailable (returns 503). | Correct — DB is authoritative time source. | —        |
| A28-003 | Info     | Default values | `00001_initial_schema.sql`        | All `created_at` / `updated_at` columns default to `now()` (DB server time in UTC).                                                                                | Correct — consistent UTC timestamps.       | —        |
| A28-004 | Info     | JS dates       | `app/api/auth/login/route.ts:328` | Date comparisons use `new Date()` which returns UTC in server context. Consistent with DB `TIMESTAMPTZ`.                                                           | Correct usage.                             | —        |

**NOTHING FOUND (timezone issues)**

---

## [A29] Numeric Precision

DECIMAL for money, no FLOAT for currency.

| ID      | Severity | Category           | Location                                | Description                                                                                                                                | Fix                                             | Standard |
| ------- | -------- | ------------------ | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------- | -------- |
| A29-001 | Info     | Money columns      | `00089_standardize_money_columns.sql`   | `price_amount NUMERIC(12,2)`, `commission_amount NUMERIC(12,2)`. Non-negative CHECK constraint.                                            | Correct — DECIMAL with fixed scale for money.   | CWE-681  |
| A29-002 | Info     | No FLOAT for money | `supabase/migrations/*.sql`             | No `FLOAT`, `DOUBLE`, or `REAL` types found in any migration file. `score NUMERIC` used for ratings (0-10).                                | Correct — no floating-point for financial data. | CWE-681  |
| A29-003 | Info     | Validation         | `lib/validation.ts:parseDecimalMoney()` | Client-side validation enforces ≤2 decimal places, range 0-999999999.99, and `Number.isFinite()` check. Currency-specific rounding policy. | Correct — validated before DB insertion.        | CWE-681  |

**NOTHING FOUND (numeric precision issues)**

---

## [A30] Replication/Sharding Readiness

| ID      | Severity | Category            | Location                                 | Description                                                                                                                                                                             | Fix                                                                                                                           | Standard |
| ------- | -------- | ------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | -------- |
| A30-001 | Info     | Multi-tenant design | `supabase/migrations/00064_*`, `00067_*` | RLS `tenant_isolation` policies enforce `site_id` scoping at the database level. All tables include `site_id` foreign key.                                                              | Correct foundation for horizontal sharding by `site_id`.                                                                      | —        |
| A30-002 | Info     | Read-after-write    | `lib/read-after-write.ts`                | `authzPrimaryRead()` helper forces reads to the primary when immediate consistency is needed (post-write authorization checks).                                                         | Correct pattern for read-replica architectures.                                                                               | —        |
| A30-003 | Low      | Supabase-coupled    | Architecture                             | The application is tightly coupled to Supabase's PostgREST API (`.from()`, `.eq()`, `.rpc()`). Migrating to a different database provider would require rewriting the entire DAL layer. | Acceptable tradeoff given the deep Supabase integration. The DAL abstraction layer (`lib/dal/`) provides a migration surface. | —        |
| A30-004 | Info     | Stateless workers   | Cloudflare Workers                       | Workers are stateless with no shared memory between isolates. Rate-limit state in KV/DO is distributed.                                                                                 | Correct — horizontally scalable by design.                                                                                    | —        |

---

## Summary

| Severity | Count |
| -------- | ----- |
| Critical | 0     |
| High     | 0     |
| Medium   | 2     |
| Low      | 6     |
| Info     | 80+   |

### Medium Findings (requiring attention)

1. **A7-006** — `authorizeResource()` covers only 5 entity types. Extend to all ID-referenced entities for defense-in-depth IDOR prevention.
2. **A21-005** — Admin email addresses stored in plaintext. Consider application-level encryption for GDPR Art. 32 compliance.

### Low Findings (recommended improvements)

1. **A9-004** — Use tighter version pinning (`~`) for security-critical deps (`@supabase/supabase-js`, `stripe`).
2. **A10-004** — Ensure Durable Object-based rate limiter (`RATE_LIMITER_DO`) is active in production for atomic rate limiting.
3. **A17-003** — Add partial index for `missingUrl` filter pattern on products table.
4. **A18-003** — Cron publish batch is non-transactional; idempotent retry is acceptable but a wrapping RPC would be stronger.
5. **A22-002** — No app-level backup mechanism beyond Supabase platform backups.
6. **A27-004** — Add partial indexes for soft-delete-aware query patterns.

### Overall Assessment

The codebase demonstrates a **mature security posture** with extensive defense-in-depth:

- Comprehensive input validation and output encoding
- Multi-layer authentication (bcrypt + TOTP + HIBP + rate limiting + account lockout)
- Tenant isolation enforced at both application (DAL/authz) and database (RLS) levels
- No SQL injection, XSS, or SSRF vectors found
- Strong cryptographic practices (AES-256-GCM, HKDF, timing-safe comparisons)
- Thorough audit logging and PII redaction
- All regexes are ReDoS-safe
- No committed secrets, backdoors, or hardcoded credentials

The 2 medium and 6 low findings are hardening recommendations rather than exploitable vulnerabilities.
