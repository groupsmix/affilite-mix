# Record of Processing Activities (RoPA)

GDPR Article 30 — Record of Processing Activities for affilite-mix.

## Data Categories

| Data Category          | Source                    | Purpose                                     | Legal Basis                        | Recipients                   | Retention                                                                                                            | Cross-border? |
| ---------------------- | ------------------------- | ------------------------------------------- | ---------------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------- |
| Newsletter subscribers | User signup form          | Email marketing, product recommendations    | Consent (Art. 6(1)(a))             | Supabase (EU/US)             | Until unsubscribe + 30 days; **unconfirmed (status=pending) rows hard-deleted after 30 days by `purge_retention()`** | Yes (US)      |
| Admin users            | Manual provisioning       | Platform administration, content management | Legitimate interest (Art. 6(1)(f)) | Supabase (EU/US)             | Account lifetime + 90 days                                                                                           | Yes (US)      |
| Affiliate clicks       | Automatic (redirect path) | Revenue attribution, commission tracking    | Legitimate interest (Art. 6(1)(f)) | Supabase (EU/US), networks   | 365 days (hot) then deleted                                                                                          | Yes (US)      |
| Memberships            | User purchase (Stripe)    | Subscription management, access control     | Contract (Art. 6(1)(b))            | Supabase, Stripe             | Subscription lifetime + 7 years                                                                                      | Yes (US)      |
| Comments / UGC         | User submission           | Community engagement                        | Consent (Art. 6(1)(a))             | Supabase (EU/US)             | Until deletion request; **soft-deleted (status='deleted') rows hard-deleted after 30 days by `purge_retention()`**   | Yes (US)      |
| Audit log              | Automatic (admin actions) | Security monitoring, compliance             | Legitimate interest (Art. 6(1)(f)) | Supabase (hot), R2 (archive) | 365 days (hot), 7 years (R2 archive)                                                                                 | Yes (US)      |
| Stripe events          | Stripe webhooks           | Payment reconciliation                      | Contract (Art. 6(1)(b))            | Supabase (EU/US)             | 90 days                                                                                                              | Yes (US)      |
| Quiz submissions       | User form submission      | Lead generation, personalization            | Consent (Art. 6(1)(a))             | Supabase (EU/US)             | **365 days** (default), then hard-deleted by `purge_retention()`                                                     | Yes (US)      |
| Price alerts           | User signup               | Price monitoring notifications              | Consent (Art. 6(1)(a))             | Supabase (EU/US)             | Until unsubscribe                                                                                                    | Yes (US)      |

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

## Automated Retention (purge_retention)

The SECURITY DEFINER function `public.purge_retention()` (migration 00084) runs daily via the `/api/cron/data-retention` Cloudflare Worker
and executes the following deletes inside a single transaction:

| Table                    | Predicate                                                                    | Window |
| ------------------------ | ---------------------------------------------------------------------------- | ------ |
| `affiliate_clicks`       | `created_at < now() - interval`                                              | 365 d  |
| `audit_log`              | `created_at < now() - interval` (after R2 archive)                           | 365 d  |
| `stripe_events`          | `received_at < now() - interval`                                             | 90 d   |
| `newsletter_subscribers` | `status = 'pending' AND created_at < now() - interval`                       | 30 d   |
| `quiz_submissions`       | `created_at < now() - interval`                                              | 365 d  |
| `comments`               | `status = 'deleted' AND COALESCE(updated_at, created_at) < now() - interval` | 30 d   |
| `web_vitals`             | `created_at < now() - interval`                                              | 90 d   |

The windows are defined as DECLAREs at the top of `purge_retention()`;
any change MUST be mirrored in this table and reviewed by the DPO.

## Last Updated

2026-04-29 (audit follow-up S-10 / G-D-01)
