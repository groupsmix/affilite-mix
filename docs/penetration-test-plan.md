# Penetration Test Plan

**Date**: 2026-05-26
**Context**: etap-6 A249, A250 — no formal pen test report exists

## Scope

### In-Scope

- All public-facing routes (`app/(public)/*`, `app/api/*`)
- Admin panel authentication and authorization (`app/q7m-k4j9/*`)
- Cloudflare Worker middleware (subdomain resolution, rate limiting, CSRF)
- API endpoints: newsletter, tracking, cron, admin CRUD, AI generation
- File upload/download flow (R2-backed)
- Authentication flows (login, forgot-password, session management)
- Multi-tenant isolation (site_id scoping, RLS policies)

### Out-of-Scope

- Supabase infrastructure (managed service)
- Cloudflare edge infrastructure (managed service)
- Third-party integrations (Stripe, Resend) — their security is their own

## Test Categories

1. **Authentication & Session Management**
   - Credential stuffing resistance (rate limiting)
   - Session fixation / hijacking
   - Password policy enforcement
   - Seed user blocking (3-layer defense)

2. **Authorization & Access Control**
   - IDOR across tenants (site_id isolation)
   - Role escalation (admin vs viewer)
   - Admin route protection

3. **Injection**
   - SQL injection (all routes use Supabase parameterized queries)
   - XSS (CSP nonces, React auto-escaping, `escapeHtml()`)
   - AI prompt injection (content generation, AI features)

4. **Business Logic**
   - Rate limit bypass
   - Quota manipulation
   - Affiliate click fraud

5. **Infrastructure**
   - Subdomain squatting
   - CORS policy validation
   - Security header verification

## Timeline

| Phase          | Duration | Activity                                                       |
| -------------- | -------- | -------------------------------------------------------------- |
| Scoping        | 1 week   | Finalize target list, set up test environment                  |
| Automated scan | 1 week   | OWASP ZAP / Burp Suite automated scanning                      |
| Manual testing | 2 weeks  | Manual exploitation attempts per category above                |
| Reporting      | 1 week   | Findings report, severity classification, remediation guidance |

## Vendor Requirements

- CREST or OSCP certified testers
- Experience with Next.js / serverless architectures
- Familiarity with multi-tenant SaaS platforms
- Report format: executive summary + technical findings + evidence

## Remediation SLA

| Severity | SLA      |
| -------- | -------- |
| Critical | 24 hours |
| High     | 7 days   |
| Medium   | 30 days  |
| Low      | 90 days  |
