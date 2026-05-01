# Compliance Readiness (GDPR / CCPA / SOC 2)

This document outlines the current state of compliance for the Affilite-Mix platform and identifies the remaining artifacts required to pass a formal enterprise security or privacy review.

## Implemented Primitives

- **GDPR Right to Be Forgotten (RTBF)**: An endpoint exists at `/api/admin/privacy/user` to delete user data.
- **Cookie Consent**: A cookie consent banner is wired into the frontend.
- **Data Minimization**: Passwords use `bcrypt` cost 12 (upgraded from PBKDF2), and session replays mask PII via Sentry.
- **SOC 2 Access Control**: Code owners are defined, Dependabot is active, `npm audit` runs in CI, and an SBOM pipeline is configured.

## Addressed Artifacts

These items have been implemented and documented to achieve full compliance readiness:

1. **Data Processing Agreement (DPA)**: Vendor DPAs are documented in `docs/vendor-dpas.md`.
2. **Privacy Policy Page**: Implemented at `app/(public)/privacy/page.tsx`.
3. **Data Retention Scheduler**: Implemented via `app/api/cron/data-retention/route.ts`.
4. **DSAR Export Endpoint**: Implemented via `app/api/admin/privacy/user/route.ts`.
5. **Records of Processing Activities (RoPA)**: Implemented internally.
6. **Sub-processor List**: Documented in `docs/vendor-dpas.md` (Cloudflare, Supabase, Stripe, Resend).
