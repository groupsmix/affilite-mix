# Compliance Readiness (GDPR / CCPA / SOC 2)

This document outlines the current state of compliance for the Affilite-Mix platform and identifies the remaining artifacts required to pass a formal enterprise security or privacy review.

## Implemented Primitives

- **GDPR Right to Be Forgotten (RTBF)**: An endpoint exists at `/api/admin/privacy/user` to delete user data.
- **Cookie Consent**: A cookie consent banner is wired into the frontend.
- **Data Minimization**: Passwords use `bcrypt` cost 12 (upgraded from PBKDF2), and session replays mask PII via Sentry.
- **SOC 2 Access Control**: Code owners are defined, Dependabot is active, `npm audit` runs in CI, and an SBOM pipeline is configured.

## PCI-DSS Compliance (A65)

**Self-Assessment Questionnaire Level: SAQ A** -- Stripe-hosted payment fields, no PAN/SAD storage.

The platform never sees, transmits, or stores Primary Account Numbers (PAN) or Sensitive Authentication Data (SAD). All payment processing is handled by Stripe via hosted Checkout / Payment Element flows. The `memberships` table stores only Stripe-issued tokens (`stripe_customer_id`, `stripe_subscription_id`).

**SAQ A Checklist:**

- [x] No PAN outside Stripe's vault
- [x] Tokenization via Stripe customer/subscription IDs
- [x] No card data in logs (Sentry `sendDefaultPii: false`)
- [x] No card data columns in database (verified `supabase/migrations/00051_memberships.sql`)
- [x] Stripe webhook signature verification (`lib/stripe-webhook.ts`)
- [ ] Annual ASV scans -- schedule with qualified vendor
- [ ] Annual penetration test -- schedule and record (see `docs/soc2-controls-mapping.md`)

## DSAR Response SLA (A62)

GDPR mandates a maximum one-month response time for Data Subject Access Requests (Art. 12(3)). The DSAR process is:

1. Subject emails the contact address listed in the privacy policy
2. Admin verifies identity via 2-of-{email confirmation token, signed user_id, manual identity check}
3. Admin runs `GET /api/admin/privacy/user?email=&site_id=` for access/portability
4. Admin runs `DELETE /api/admin/privacy/user` for erasure
5. All DSAR actions are logged to the structured logger and should be recorded in `audit_log`
6. Response provided within **30 calendar days** (with option to extend by 60 days for complex requests per Art. 12(3))

## Addressed Artifacts

These items have been implemented and documented to achieve full compliance readiness:

1. **Data Processing Agreement (DPA)**: Vendor DPAs are documented in `docs/vendor-dpas.md`.
2. **Privacy Policy Page**: Implemented at `app/(public)/privacy/page.tsx`.
3. **Data Retention Scheduler**: Implemented via `app/api/cron/data-retention/route.ts`.
4. **DSAR Export Endpoint**: Implemented via `app/api/admin/privacy/user/route.ts`.
5. **Records of Processing Activities (RoPA)**: Implemented internally.
6. **Sub-processor List**: Documented in `docs/vendor-dpas.md` (Cloudflare, Supabase, Stripe, Resend, Sentry, AI providers).
7. **DPIA Threshold Assessment**: Documented in `docs/ropa.md` -- DPIA not required (see rationale).
8. **Field-Level PII Classification**: Documented in `docs/ropa.md` per-column matrix.
9. **CCPA/CPRA Section**: Added to privacy policy page.
10. **GPC Signal Handling**: Implemented in `middleware.ts` and `cookie-consent-cmp.tsx`.
11. **Schrems II Transfer Impact Assessment**: Documented in `docs/schrems-ii-tia.md`.
