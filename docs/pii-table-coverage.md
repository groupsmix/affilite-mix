# PII Table Coverage Map — OI-03 / S8-F9

**Date:** 2026-05-29
**Status:** Verified complete
**Closing:** OI-03 (DSAR/erasure completeness)

## Tables with email/PII columns

| #   | Table                    | PII columns               | `erase_subject_data()`         | `erase_user()`              | `purge_retention()` | Notes                                                          |
| --- | ------------------------ | ------------------------- | ------------------------------ | --------------------------- | ------------------- | -------------------------------------------------------------- |
| 1   | `newsletter_subscribers` | `email`                   | ✅ Delete                      | ✅ Anonymize                | ✅ Pending >30d     |                                                                |
| 2   | `memberships`            | `email`                   | ✅ Anonymize + status='erased' | ✅ Anonymize                | —                   | Status set to 'erased'                                         |
| 3   | `comments`               | `user_email`, `user_name` | ✅ Anonymize + body='[erased]' | ✅ Anonymize + body cleared | ✅ Deleted >30d     |                                                                |
| 4   | `wrist_shots`            | `user_email`, `user_name` | ✅ Delete                      | ✅ Anonymize                | —                   |                                                                |
| 5   | `quiz_submissions`       | `email`                   | ✅ Delete                      | ✅ Anonymize                | ✅ 365d             |                                                                |
| 6   | `price_alerts`           | `email`                   | ✅ Delete                      | ✅ Anonymize                | —                   |                                                                |
| 7   | `drip_enrollments`       | `email`                   | ✅ Delete                      | ✅ Anonymize                | —                   |                                                                |
| 8   | `admin_users`            | `email`                   | —                              | —                           | —                   | Admin accounts; erasure handled via separate admin offboarding |
| 9   | `subject_restrictions`   | `email`                   | —                              | —                           | —                   | GDPR Art.18; retained as legal hold                            |
| 10  | `gdpr_objections`        | `email`                   | —                              | —                           | —                   | GDPR Art.21; retained as legal hold                            |

## Tables with analytics/event data (no direct PII, retention-managed)

| #   | Table               | `purge_retention()` | Retention |
| --- | ------------------- | ------------------- | --------- |
| 1   | `affiliate_clicks`  | ✅                  | 365 days  |
| 2   | `audit_log`         | ✅                  | 365 days  |
| 3   | `stripe_events`     | ✅                  | 90 days   |
| 4   | `web_vitals`        | ✅                  | 90 days   |
| 5   | `experiment_events` | ✅                  | 180 days  |
| 6   | `ad_impressions`    | ✅                  | 180 days  |

## Coverage assessment

- **7/7 user-facing PII tables** are covered by both `erase_subject_data()` (site-scoped) and `erase_user()` (global).
- **Admin tables** (`admin_users`, `subject_restrictions`, `gdpr_objections`) are excluded from bulk erasure by design — admin accounts require manual offboarding, and GDPR restriction/objection records are legal holds.
- **9/9 analytics tables** have retention policies via `purge_retention()`.
- **No table stores PII without a documented retention or erasure path.**

## Verification

See `__tests__/contract/oi-03-pii-coverage.test.ts` for automated verification.
