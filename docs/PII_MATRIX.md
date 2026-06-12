# PII (Personally Identifiable Information) Matrix

This document provides a comprehensive matrix of all PII stored in the Affilite-Mix application, including storage locations, retention policies, and GDPR compliance measures.

## PII Classification

### Direct Identifiers
Information that can uniquely identify an individual:
- Email addresses
- Full names
- IP addresses
- User agent strings

### Indirect Identifiers
Information that can identify an individual when combined with other data:
- Fingerprint hashes
- Truncated IP addresses
- User agent hashes
- Click tracking identifiers

## Database PII Storage

### admin_users Table

| Field | Type | PII Classification | Retention | Access Control |
|-------|------|-------------------|-----------|----------------|
| `email` | string | Direct identifier | Until account deletion | Admin-only (RLS) |
| `name` | string | Direct identifier | Until account deletion | Admin-only (RLS) |
| `password_hash` | string | Sensitive credential | Rotated on password change | Admin-only (RLS) |
| `totp_secret` | string | Sensitive credential (encrypted) | Until 2FA disabled | Admin-only (RLS) |
| `reset_token` | string | Sensitive credential | 1 hour expiry | Admin-only (RLS) |

**GDPR Measures:**
- Email is used as the primary identifier for GDPR requests
- Password hash is bcrypt (one-way, salted)
- TOTP secret is encrypted at rest using `TOTP_ENCRYPTION_KEY`
- Reset tokens have short expiry (1 hour)

### comments Table

| Field | Type | PII Classification | Retention | Access Control |
|-------|------|-------------------|-----------|----------------|
| `user_email` | string | Direct identifier | Until comment deletion | Public (displayed with approval) |
| `user_name` | string | Direct identifier | Until comment deletion | Public (displayed with approval) |

**GDPR Measures:**
- Email and name are only displayed after admin approval
- Users can request deletion of their comments via GDPR export/rectify endpoints

### affiliate_clicks Table

| Field | Type | PII Classification | Retention | Access Control |
|-------|------|-------------------|-----------|----------------|
| `fingerprint` | string | Indirect identifier | 90 days (configurable) | Admin-only (RLS) |
| `ip_prefix` | string | Indirect identifier (truncated) | 90 days (configurable) | Admin-only (RLS) |
| `referrer` | string | Potentially PII | 90 days (configurable) | Admin-only (RLS) |

**GDPR Measures:**
- IP addresses are truncated to /24 prefix (e.g., 192.168.1.0/24)
- Fingerprint is a hash of browser characteristics, not directly identifying
- Data retention is limited to 90 days for analytics purposes
- Click data is used for commission tracking and fraud detection

### consent_log Table

| Field | Type | PII Classification | Retention | Access Control |
|-------|------|-------------------|-----------|----------------|
| `ip_truncated` | string | Indirect identifier (truncated) | 2 years | Admin-only (RLS) |
| `ua_hash` | string | Indirect identifier (hashed) | 2 years | Admin-only (RLS) |
| `subject_id` | string | Direct identifier (optional) | 2 years | Admin-only (RLS) |

**GDPR Measures:**
- IP addresses are truncated to /24 prefix
- User agent is hashed using `GDPR_HASH_SECRET` (one-way)
- Subject ID links to user's consent preferences for GDPR requests
- 2-year retention aligns with GDPR recommendation for consent logs

### audit_log Table

| Field | Type | PII Classification | Retention | Access Control |
|-------|------|-------------------|-----------|----------------|
| `ip` | string | Direct identifier | 1 year | Admin-only (RLS) |
| `actor` | string | Direct identifier (email) | 1 year | Admin-only (RLS) |
| `actor_user_id` | string | Indirect identifier | 1 year | Admin-only (RLS) |

**GDPR Measures:**
- Full IP addresses are stored for security audit purposes
- 1-year retention balances security needs with privacy
- Access is strictly limited to admin users
- Logs are immutable (append-only)

## External PII Storage

### Supabase Auth

| Data | Type | PII Classification | Retention | Access Control |
|------|------|-------------------|-----------|----------------|
| User email | string | Direct identifier | Until account deletion | Supabase-managed |
| User metadata | JSON | May contain PII | Until account deletion | Supabase-managed |

**GDPR Measures:**
- Supabase provides GDPR export/delete endpoints
- Auth data is managed by Supabase's compliance program
- Application syncs auth state with admin_users table

### Stripe (Payment Processing)

| Data | Type | PII Classification | Retention | Access Control |
|------|------|-------------------|-----------|----------------|
| Customer email | string | Direct identifier | Per Stripe policy | Stripe-managed |
| Customer name | string | Direct identifier | Per Stripe policy | Stripe-managed |
| Payment details | string | Financial data | Per Stripe policy | Stripe-managed |

**GDPR Measures:**
- PII is stored by Stripe, not directly in application database
- Application only stores Stripe customer IDs and subscription status
- Stripe provides GDPR compliance tools for customer data

### Resend (Email Service)

| Data | Type | PII Classification | Retention | Access Control |
|------|------|-------------------|-----------|----------------|
| Recipient email | string | Direct identifier | Per Resend policy | Resend-managed |
| Email content | string | May contain PII | Per Resend policy | Resend-managed |

**GDPR Measures:**
- Email delivery is handled by Resend
- Application does not store sent emails in database
- Resend provides GDPR compliance for email data

### Cloudflare Workers (Edge Logs)

| Data | Type | PII Classification | Retention | Access Control |
|------|------|-------------------|-----------|----------------|
| IP addresses | string | Direct identifier | 7 days (default) | Cloudflare-managed |
| User agent | string | Indirect identifier | 7 days (default) | Cloudflare-managed |
| Request headers | string | May contain PII | 7 days (default) | Cloudflare-managed |

**GDPR Measures:**
- Edge logs are managed by Cloudflare
- 7-day retention is standard for Cloudflare Workers
- Application does not directly access raw edge logs
- Cloudflare provides GDPR compliance tools

## In-Memory / Transient PII

### Session Cookies

| Data | Type | PII Classification | Retention | Storage |
|------|------|-------------------|-----------|---------|
| Admin session token | string | Indirect identifier | Session duration | HTTP-only cookie |
| Site preference | string | Indirect identifier | 1 year | Cookie |

**GDPR Measures:**
- Session tokens are JWT-signed with `JWT_SECRET`
- Tokens do not contain PII, only user ID and claims
- Cookies are HTTP-only and secure (HTTPS only)

### KV Cache (APP_CACHE_KV)

| Data | Type | PII Classification | Retention | Storage |
|------|------|-------------------|-----------|---------|
| Click cache entries | string | Indirect identifier | TTL-based | Cloudflare KV |
| Nonce values | string | Non-identifying | TTL-based | Cloudflare KV |

**GDPR Measures:**
- KV cache stores hashed/truncated identifiers only
- TTL ensures automatic expiration
- No direct PII is stored in KV

## PII Processing Purposes

### Authentication & Authorization
- **Data:** Email, name, password hash, TOTP secret
- **Purpose:** User authentication, account management, 2FA
- **Legal Basis:** Contract performance (user agreement)
- **Retention:** Until account deletion

### Analytics & Tracking
- **Data:** IP prefix, fingerprint, referrer, user agent hash
- **Purpose:** Click tracking, fraud detection, commission calculation
- **Legal Basis:** Legitimate interest (security + business operations)
- **Retention:** 90 days

### Content Moderation
- **Data:** User email, user name (comments)
- **Purpose:** Comment approval, spam prevention
- **Legal Basis:** Legitimate interest (platform integrity)
- **Retention:** Until comment deletion

### Security Auditing
- **Data:** IP address, actor email, action details
- **Purpose:** Security monitoring, incident response
- **Legal Basis:** Legitimate interest (security)
- **Retention:** 1 year

### Consent Management
- **Data:** IP truncated, UA hash, consent preferences
- **Purpose:** GDPR compliance, cookie consent tracking
- **Legal Basis:** Legal obligation (GDPR)
- **Retention:** 2 years

## GDPR Rights Implementation

### Right to Access (Article 15)
- **Endpoint:** `GET /api/user/data-export`
- **Implementation:** Exports all PII associated with user's email
- **Data included:** admin_users, comments, consent_log, audit_log (filtered)

### Right to Rectification (Article 16)
- **Endpoint:** `POST /api/admin/privacy/rectify`
- **Implementation:** Allows correction of inaccurate PII
- **Admin approval required:** Yes

### Right to Erasure (Article 17)
- **Endpoint:** `POST /api/admin/privacy/user`
- **Implementation:** Deletes user account and associated PII
- **Admin approval required:** Yes
- **Data deleted:** admin_users, comments, consent_log (subject_id)
- **Data retained:** audit_log (immutable), affiliate_clicks (business records)

### Right to Restrict Processing (Article 18)
- **Implementation:** Not currently implemented
- **Future consideration:** Account deactivation instead of deletion

### Right to Data Portability (Article 20)
- **Implementation:** Included in data export endpoint
- **Format:** JSON

### Right to Object (Article 21)
- **Implementation:** Not currently implemented
- **Future consideration:** Opt-out of analytics tracking

## Data Minimization

### Principles Applied
1. **Collect only what's needed:** Email is the only required PII for account creation
2. **Hash when possible:** IPs are truncated/hashed, user agents are hashed
3. **Short retention:** Analytics data expires after 90 days
4. **No unnecessary storage:** Email content is not stored in database

### Examples
- **IP addresses:** Truncated to /24 prefix in analytics, full IP only in security logs
- **User agents:** Hashed in consent logs, not stored raw
- **Emails:** Only stored where necessary (admin_users, comments)
- **Names:** Optional in admin_users, required only for comment display

## Cross-Border Data Transfer

### Data Locations
- **Primary:** Supabase (EU region)
- **Backup:** Supabase backups (same region)
- **Edge Processing:** Cloudflare Workers (global edge network)
- **Email:** Resend (US region)
- **Payments:** Stripe (US region)

### GDPR Compliance
- **Supabase:** EU region, GDPR-compliant
- **Cloudflare:** GDPR-compliant, EU-US Data Privacy Framework
- **Resend:** GDPR-compliant, EU-US Data Privacy Framework
- **Stripe:** GDPR-compliant, EU-US Data Privacy Framework

### Data Transfer Mechanisms
- **Supabase:** Direct database connection (EU region)
- **Cloudflare:** TLS 1.3 encryption
- **Resend:** HTTPS API with authentication
- **Stripe:** HTTPS API with authentication

## Security Measures

### Encryption at Rest
- **TOTP secrets:** Encrypted with `TOTP_ENCRYPTION_KEY`
- **Password hashes:** bcrypt (one-way, salted)
- **JWT tokens:** HMAC-SHA256 with `JWT_SECRET`
- **GDPR hashes:** HMAC-SHA256 with `GDPR_HASH_SECRET`

### Encryption in Transit
- **All API calls:** HTTPS/TLS 1.3
- **Database connections:** Supabase enforces TLS
- **Edge workers:** Cloudflare enforces TLS

### Access Control
- **Database:** Row-Level Security (RLS) on all PII tables
- **Admin access:** Require authentication + 2FA for admin users
- **API endpoints:** Internal HMAC authentication for cron jobs
- **Audit logging:** All PII access is logged

### Data Retention Enforcement
- **Analytics data:** 90-day TTL in database
- **Consent logs:** 2-year retention, manual cleanup
- **Audit logs:** 1-year retention, manual cleanup
- **Click cache:** TTL-based expiration in KV

## Incident Response

### Data Breach Procedure
1. **Detection:** Automated monitoring via Sentry
2. **Containment:** Immediate isolation of affected systems
3. **Assessment:** Determine scope of PII exposure
4. **Notification:** Notify affected users within 72 hours (GDPR requirement)
5. **Remediation:** Patch vulnerabilities, reset credentials
6. **Documentation:** Record incident in audit_log

### Breach Notification Thresholds
- **High risk:** Full email addresses, passwords exposed → Notify within 72 hours
- **Medium risk:** Truncated IPs, hashes exposed → Monitor, may not require notification
- **Low risk:** Non-identifying data exposed → Document, no notification required

## Third-Party Data Processing

### Data Processors
| Processor | Data Processed | Location | GDPR Compliance |
|-----------|----------------|----------|-----------------|
| Supabase | admin_users, all application data | EU | Yes (DPAs in place) |
| Cloudflare | Edge logs, KV cache | Global | Yes (EU-US Framework) |
| Resend | Email addresses, email content | US | Yes (EU-US Framework) |
| Stripe | Customer data, payment data | US | Yes (EU-US Framework) |

### Data Processing Agreements (DPAs)
- **Supabase:** DPA included in service agreement
- **Cloudflare:** DPA included in service agreement
- **Resend:** DPA included in service agreement
- **Stripe:** DPA included in service agreement

## Regular Review

### Review Schedule
- **Quarterly:** Review PII storage locations and retention policies
- **Annually:** Review third-party processor compliance
- **On request:** Review specific PII handling for GDPR requests

### Review Checklist
- [ ] All PII storage locations documented
- [ ] Retention policies enforced
- [ ] Access controls validated
- [ ] Encryption mechanisms verified
- [ ] Third-party compliance confirmed
- [ ] GDPR rights implementation tested
- [ ] Incident response procedures updated

## References

- [GDPR Regulation (EU) 2016/679](https://gdpr.eu/)
- [Supabase GDPR Documentation](https://supabase.com/docs/guides/platform/gdpr)
- [Cloudflare GDPR Documentation](https://www.cloudflare.com/gdpr/)
- [Stripe GDPR Documentation](https://stripe.com/privacy/gdpr)
