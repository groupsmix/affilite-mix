# Compliance Readiness (GDPR / CCPA / SOC 2)

This document outlines the current state of compliance for the Affilite-Mix platform and identifies the remaining artifacts required to pass a formal enterprise security or privacy review.

## Implemented Primitives

- **GDPR Right to Be Forgotten (RTBF)**: An endpoint exists at `/api/admin/privacy/user` to delete user data.
- **Cookie Consent**: A cookie consent banner is wired into the frontend.
- **Data Minimization**: Passwords use `bcrypt` cost 12 (upgraded from PBKDF2), and session replays mask PII via Sentry.
- **SOC 2 Access Control**: Code owners are defined, Dependabot is active, `npm audit` runs in CI, and an SBOM pipeline is configured.

## Missing Artifacts (Action Required)

To achieve full compliance readiness, the following documents and processes must be created:

1. **Data Processing Agreement (DPA)**: A formal DPA outlining how tenant data is handled.
2. **Privacy Policy Page**: A public-facing privacy policy explaining data collection, usage, and sharing.
3. **Data Retention Scheduler**: An automated cron job to purge inactive or deleted user data after a specified retention period.
4. **DSAR Export Endpoint**: A Data Subject Access Request (DSAR) endpoint allowing users to download their PII in a machine-readable format (e.g., JSON/CSV).
5. **Records of Processing Activities (RoPA)**: An internal document tracking what PII is collected, why, and where it is stored.
6. **Sub-processor List**: A public list of all third-party services (Cloudflare, Supabase, Stripe, Resend) that process user data on behalf of the platform.
