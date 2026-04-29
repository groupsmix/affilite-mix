# Supabase Deep-Audit Follow-up Runbook

Status tracking for the audit items raised on 2026-04-29 against the
`nichhub` (prod, `odgtwjkzwciohhhqdtti`) and `staging nichhub`
(`bmoyiluixhqqdceqxhpi`) Supabase projects.

## Snapshot at audit time (verified 2026-04-29 via management SQL endpoint)

| Surface                                           | Staging                            | Production                         |
| ------------------------------------------------- | ---------------------------------- | ---------------------------------- |
| Postgres                                          | 17.6.1.104                         | 17.6.1.084                         |
| Newest applied migration                          | (no `_migrations_applied`)         | `00065_add_actor_user_id.sql`      |
| Newest migration in repo (this branch)            | `00085_extend_retention_purge.sql` | `00085_extend_retention_purge.sql` |
| `pitr_enabled`                                    | false                              | false                              |
| `ssl-enforcement.database`                        | false                              | false                              |
| `dbAllowedCidrs`                                  | `0.0.0.0/0`                        | `0.0.0.0/0`                        |
| `disable_signup`                                  | false                              | false                              |
| `external_email_enabled`                          | true                               | true                               |
| `admin_users (count, super_admin, with_totp)`     | n/a                                | `(1, 1, 0)`                        |
| `stripe_events.created_at`                        | absent                             | absent                             |
| Dangerous `qual='true'` policies on authenticated | 0 (post-67)                        | 18                                 |

The advisor (perf + security) numbers also match the audit text:
prod has 18 `rls_policy_always_true`, 14 `function_search_path_mutable`,
84 `unused_index`, 75 `multiple_permissive_policies`, 64
`auth_rls_initplan`.

## Item status

Legend: ✅ done in this PR · 🟡 partly · ⚠️ blocked on user/operator action · ⏭ tracked, deferred

| Item | Severity    | Status | What changed                                                                                                                                                                                         |
| ---- | ----------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S-01 | P0 critical | ⚠️     | Apply migrations 66 → 85 to prod via the existing `migrate-production` job. Triggered by merging this PR; new migrations 81–85 ship the audit fixes. Ledger gate (G-MD-01) added.                    |
| S-02 | P0 critical | ⚠️     | PITR — must be enabled via management API or dashboard; cannot be done from CI. Recommended call: `PATCH /v1/projects/{ref}/pitr` on both projects. Tracked.                                         |
| S-03 | P0 critical | ⚠️     | `disable_signup=true, external_email_enabled=false`. Verified no `auth.signUp` references in app code; safe to flip via management API after merge. Tracked.                                         |
| S-04 | P0 critical | ⚠️     | CIDR + SSL + DB password rotation. Needs a concrete egress whitelist (Cloudflare Workers don't have a static egress IP); tracked in PR description.                                                  |
| S-05 | P0 critical | ⚠️     | TOTP enrollment + second super_admin must be done by a human; cannot be delegated to CI. Tracked.                                                                                                    |
| S-06 | High        | ✅     | `00081_stripe_events_created_at.sql` adds the column, backfills from `received_at`, adds an index. CI gate (G-T-01) asserts the schema. Deploy verify step also greps `pg_attribute`.                |
| S-07 | High        | ✅     | `00082_rls_initplan_optimisation.sql` rewrites every public-schema policy to wrap `auth.<x>()` / `current_request_site_id*()` calls in `(select …)`.                                                 |
| S-08 | High        | ✅     | `00083_lock_security_definer_search_path.sql` pins `search_path` on every public function and locks SECURITY DEFINER funcs to `service_role` only.                                                   |
| S-09 | High        | ✅     | `00084_lock_migrations_applied_rls.sql` drops the open authenticated policy on `_migrations_applied` and restricts to service_role.                                                                  |
| S-10 | High        | ✅     | `00085_extend_retention_purge.sql` covers `newsletter_subscribers` / `quiz_submissions` / `comments` / `web_vitals`. `docs/ropa.md` documents the windows.                                           |
| S-11 | Medium      | ⏭     | Drop unused indexes + collapse multiple-permissive policies. Deferred — advisor output differs across staging/prod and the safe set should be reviewed manually before deletion.                     |
| S-12 | Medium      | ⚠️     | pgaudit requires a Supabase support ticket. Moving extensions out of `public` is a separate, high-blast-radius migration; left untouched in this PR.                                                 |
| S-13 | Low         | ⏭     | `stripe_events_processed` doesn't exist in either DB — the idempotency table is `stripe_events` itself, already on a 90-day TTL via `purge_retention()`. No-op; documented here for the audit trail. |
| S-14 | Low         | ⚠️     | Prod minor (17.6.1.084) is **behind** staging (17.6.1.104). Schedule a maintenance-window upgrade. CI / docker-compose pinned to `postgres:17` major (G-CI-03).                                      |

## CI gates added by this PR

| ID      | Where                                                              | What it does                                                                                                                                                                  |
| ------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G-MD-01 | `scripts/check-migration-ledger.sh`, deploy.yml                    | Hard-fails the deploy if `_migrations_applied` ledger is behind the newest `*.sql` file in `supabase/migrations/`.                                                            |
| G-T-01  | `__tests__/stripe-events-schema.test.ts`, deploy.yml               | Asserts `stripe_events` has `created_at` (timestamptz, NOT NULL, with default + index). Verified at unit level on every PR; verified via `pg_attribute` on every prod deploy. |
| G-CI-01 | `scripts/check-migrations.sh`                                      | Fails new migrations whose `CREATE POLICY` calls `auth.<x>()` / `current_request_site_id*()` outside `(select …)`.                                                            |
| G-CI-02 | `scripts/check-migrations.sh`                                      | Fails new migrations whose `SECURITY DEFINER` function lacks `SET search_path = …`.                                                                                           |
| G-D-01  | `docs/ropa.md`                                                     | Documents the per-table retention windows enforced by `purge_retention()`.                                                                                                    |
| G-CI-03 | `.github/workflows/backup-restore-drill.yml`, `docker-compose.yml` | Pins local / drill Postgres image to the major version production runs (17).                                                                                                  |

## Items still requiring operator action

1. **Apply migrations to production** — merging this PR runs the
   existing `migrate-production` GitHub Actions job, which applies
   the new files in order via `psql`. The G-MD-01 ledger gate at the
   end of the job will fail-closed if the apply was skipped.
2. **Enable PITR** on staging + prod via the management API (S-02).
3. **Disable Supabase Auth public signup** + email auth (S-03) once
   you've confirmed no out-of-tree callers depend on it.
4. **Restrict Postgres CIDR** (S-04) — provide a concrete egress
   range or a Cloudflare Tunnel / PrivateLink target. Without one,
   the migration to enforce SSL is the safe partial step.
5. **Rotate DB password + propagate to GitHub repo secrets**
   (`SUPABASE_DB_URL`, `SUPABASE_DB_POOLER_URL`) (S-04).
6. **TOTP enrollment** for `admin@wristnerd.xyz` and **create a
   second super_admin** on a separate identity (S-05). The
   infrastructure is already in code (00045 / 00062).
7. **Open Supabase support ticket** to enable pgaudit (S-12).
8. **Schedule prod minor upgrade** to bring it level with or ahead
   of staging (S-14). After upgrading, bump the `postgres:17` pin
   to a more specific minor in the same PR.
