# Record of Processing Activities (RoPA)

GDPR Article 30 — Record of Processing Activities for affilite-mix.

## Data Categories

| Data Category          | Source                    | Purpose                                     | Legal Basis                        | Recipients                   | Retention                            | Cross-border? |
| ---------------------- | ------------------------- | ------------------------------------------- | ---------------------------------- | ---------------------------- | ------------------------------------ | ------------- |
| Newsletter subscribers | User signup form          | Email marketing, product recommendations    | Consent (Art. 6(1)(a))             | Supabase (EU/US)             | Until unsubscribe + 30 days          | Yes (US)      |
| Admin users            | Manual provisioning       | Platform administration, content management | Legitimate interest (Art. 6(1)(f)) | Supabase (EU/US)             | Account lifetime + 90 days           | Yes (US)      |
| Affiliate clicks       | Automatic (redirect path) | Revenue attribution, commission tracking    | Legitimate interest (Art. 6(1)(f)) | Supabase (EU/US), networks   | 365 days (hot) then deleted          | Yes (US)      |
| Memberships            | User purchase (Stripe)    | Subscription management, access control     | Contract (Art. 6(1)(b))            | Supabase, Stripe             | Subscription lifetime + 7 years      | Yes (US)      |
| Comments / UGC         | User submission           | Community engagement                        | Consent (Art. 6(1)(a))             | Supabase (EU/US)             | Until deletion request               | Yes (US)      |
| Audit log              | Automatic (admin actions) | Security monitoring, compliance             | Legitimate interest (Art. 6(1)(f)) | Supabase (hot), R2 (archive) | 365 days (hot), 7 years (R2 archive) | Yes (US)      |
| Stripe events          | Stripe webhooks           | Payment reconciliation                      | Contract (Art. 6(1)(b))            | Supabase (EU/US)             | 90 days                              | Yes (US)      |
| Quiz submissions       | User form submission      | Lead generation, personalization            | Consent (Art. 6(1)(a))             | Supabase (EU/US)             | Until deletion request               | Yes (US)      |
| Price alerts           | User signup               | Price monitoring notifications              | Consent (Art. 6(1)(a))             | Supabase (EU/US)             | Until unsubscribe                    | Yes (US)      |

## Data Protection Measures

- **Encryption in transit:** TLS 1.3 via Cloudflare edge
- **Encryption at rest:** Supabase managed encryption (AES-256)
- **Access control:** Row Level Security (RLS) with tenant isolation
- **Pseudonymization:** IP addresses truncated to /24 in logs
- **Data minimization:** Only necessary fields collected per purpose
- **Right to erasure:** RTBF endpoint at `/api/admin/privacy/user`

## Sub-processors

| Sub-processor                 | Purpose              | Location | DPA in place? |
| ----------------------------- | -------------------- | -------- | ------------- |
| Supabase                      | Database hosting     | US (AWS) | Yes           |
| Cloudflare                    | CDN, Workers, R2, KV | Global   | Yes           |
| Stripe                        | Payment processing   | US       | Yes           |
| Sentry                        | Error monitoring     | US       | Yes           |
| Affiliate networks (CJ, etc.) | Commission tracking  | US       | Yes           |

## DPO Contact

_To be designated by the data controller._

## Last Updated

2026-04-27
