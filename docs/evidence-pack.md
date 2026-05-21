# Production Evidence Pack (F-001)

> **Purpose**: Provide verifiable proof that production controls match the
> documented posture in the repo. This template should be completed and
> attached to any acquisition diligence, SOC 2 review, or enterprise
> security assessment.
>
> **Audit reference**: F-001 -- "Production readiness cannot be proven from repo alone"

## Instructions

For each section below, attach a sanitized screenshot, export, or log
snippet that proves the control is in place. Redact secrets, tokens, and
customer data. Date every artifact with the collection timestamp.

---

## 1. Supabase / PostgreSQL

| Evidence Item                                             | Status | Artifact                                                        |
| --------------------------------------------------------- | ------ | --------------------------------------------------------------- |
| RLS enabled on all tenant-scoped tables                   | [ ]    | _screenshot of `pg_tables` with `rowsecurity=true`_             |
| RLS policies list (all tables)                            | [ ]    | _output of `SELECT * FROM pg_policies`_                         |
| Service-role key usage is limited to documented allowlist | [ ]    | _cross-reference with `lib/security/service-role-allowlist.ts`_ |
| Connection pooling configured (PgBouncer / Supavisor)     | [ ]    | _Supabase dashboard screenshot_                                 |
| Row-level audit log table exists                          | [ ]    | _`\d audit_log` output_                                         |
| Database backup schedule and retention                    | [ ]    | _Supabase backup settings screenshot_                           |
| Point-in-time recovery (PITR) enabled                     | [ ]    | _Supabase plan/settings screenshot_                             |
| Last successful backup restore test                       | [ ]    | _DR drill output from `scripts/dr-restore-test.sh`_             |

## 2. Cloudflare Workers / R2 / KV

| Evidence Item                                             | Status | Artifact                                               |
| --------------------------------------------------------- | ------ | ------------------------------------------------------ |
| Worker bindings match `wrangler.jsonc`                    | [ ]    | _`wrangler deployments list` output_                   |
| KV namespaces (RATE_LIMIT_KV, APP_CACHE_KV) exist         | [ ]    | _dashboard screenshot or `wrangler kv namespace list`_ |
| Durable Object (RATE_LIMITER_DO) deployed                 | [ ]    | _Worker config screenshot_                             |
| R2 buckets (public, private, logs) exist and are isolated | [ ]    | _`wrangler r2 bucket list` output_                     |
| R2 public bucket has no write access from anonymous       | [ ]    | _bucket CORS/access policy screenshot_                 |
| Tail Worker (log-shipper) deployed and receiving logs     | [ ]    | _`wrangler tail` sample or R2 log objects screenshot_  |
| Custom domains configured correctly                       | [ ]    | _Cloudflare DNS/routes screenshot_                     |
| Compatibility date and flags match `wrangler.jsonc`       | [ ]    | _Worker settings screenshot_                           |
| Queue (CLICK_QUEUE) and DLQ configured                    | [ ]    | _Queues dashboard screenshot_                          |

## 3. GitHub Repository Controls

| Evidence Item                                         | Status | Artifact                                      |
| ----------------------------------------------------- | ------ | --------------------------------------------- |
| Branch protection on `main` (require PR, reviews, CI) | [ ]    | _Settings > Branches screenshot_              |
| Required status checks configured                     | [ ]    | _list of required checks screenshot_          |
| Environment protection rules (production)             | [ ]    | _Settings > Environments screenshot_          |
| CODEOWNERS file enforced                              | [ ]    | _Settings > Branches > CODEOWNERS screenshot_ |
| Dependabot enabled                                    | [ ]    | _dependabot.yml + Settings screenshot_        |
| Secret scanning enabled                               | [ ]    | _Settings > Code security screenshot_         |
| Push protection enabled                               | [ ]    | _Settings > Code security screenshot_         |

## 4. CI/CD Pipeline

| Evidence Item                                    | Status | Artifact                                     |
| ------------------------------------------------ | ------ | -------------------------------------------- |
| Last successful CI run (all checks green)        | [ ]    | _Actions > CI workflow run screenshot_       |
| Last successful deploy run                       | [ ]    | _Actions > Deploy workflow run screenshot_   |
| CodeQL analysis results (no critical findings)   | [ ]    | _Security > Code scanning alerts screenshot_ |
| Security workflow last run (npm audit, gitleaks) | [ ]    | _Actions > Security workflow run screenshot_ |
| Staging DB migration smoke test passing          | [ ]    | _Deploy workflow validate step output_       |

## 5. Sentry / Observability

| Evidence Item                                | Status | Artifact                                           |
| -------------------------------------------- | ------ | -------------------------------------------------- |
| Sentry project configured for production     | [ ]    | _Sentry project settings screenshot_               |
| Alert rules defined (error rate, new issues) | [ ]    | _Sentry Alerts page screenshot_                    |
| On-call / notification channels configured   | [ ]    | _Sentry notification settings screenshot_          |
| Recent error volume is nominal               | [ ]    | _Sentry Issues dashboard screenshot (last 7 days)_ |
| Source maps uploaded for latest deploy       | [ ]    | _Sentry Releases page screenshot_                  |

## 6. Secrets Management

| Evidence Item                                           | Status | Artifact                                                |
| ------------------------------------------------------- | ------ | ------------------------------------------------------- |
| Production env var inventory (names only, no values)    | [ ]    | _sanitized list from Cloudflare Worker or GH secrets_   |
| Secret rotation schedule documented                     | [ ]    | _link to `docs/secrets-rotation-runbook.md`_            |
| Last secret rotation date                               | [ ]    | _date and which secrets were rotated_                   |
| Per-trigger cron secrets deployed (not shared fallback) | [ ]    | _`verifyCronAuth` production log or Worker secret list_ |
| No dev fallback tokens in production config             | [ ]    | _CI check output from "Verify no dev fallback secrets"_ |

## 7. Backup and Disaster Recovery

| Evidence Item                             | Status | Artifact                                               |
| ----------------------------------------- | ------ | ------------------------------------------------------ |
| Backup schedule and retention policy      | [ ]    | _link to `docs/BACKUP-POLICY.md`_                      |
| Last DR drill date and outcome            | [ ]    | _output from `scripts/dr-restore-test.sh`_             |
| Recovery Time Objective (RTO) documented  | [ ]    | _link to `docs/DR-RUNBOOK.md`_                         |
| Recovery Point Objective (RPO) documented | [ ]    | _link to `docs/DR-RUNBOOK.md`_                         |
| Rollback procedure tested                 | [ ]    | _`.github/workflows/rollback.yml` last run screenshot_ |

## 8. Stripe / Payments (if applicable)

| Evidence Item                                      | Status | Artifact                                            |
| -------------------------------------------------- | ------ | --------------------------------------------------- |
| Webhook endpoint configured and verified           | [ ]    | _Stripe dashboard webhook settings screenshot_      |
| Restricted API key used (not full-access sk*live*) | [ ]    | _Stripe API keys page (key prefix only)_            |
| Idempotency handling in webhook processor          | [ ]    | _code reference to `lib/stripe-event-processor.ts`_ |
| Webhook signature verification enabled             | [ ]    | _code reference to `lib/stripe-webhook.ts`_         |

## 9. Compliance Artifacts

| Evidence Item                      | Status | Artifact                                   |
| ---------------------------------- | ------ | ------------------------------------------ |
| Data processing inventory (ROPA)   | [ ]    | _link to `docs/ropa.md`_                   |
| Data retention and deletion policy | [ ]    | _link to privacy/retention docs_           |
| Vendor DPA inventory               | [ ]    | _link to `docs/vendor-dpas.md`_            |
| Incident response plan             | [ ]    | _link to `docs/incident-response.md`_      |
| Access recertification log         | [ ]    | _link to `docs/access-recertification.md`_ |

## 10. Cost and Vendor Model

| Evidence Item                     | Status | Artifact                         |
| --------------------------------- | ------ | -------------------------------- |
| Cloudflare Workers plan and usage | [ ]    | _billing dashboard screenshot_   |
| Supabase plan and usage           | [ ]    | _billing dashboard screenshot_   |
| R2 storage usage and costs        | [ ]    | _R2 usage screenshot_            |
| Stripe processing volume          | [ ]    | _Stripe dashboard screenshot_    |
| Resend email volume               | [ ]    | _Resend dashboard screenshot_    |
| AI provider usage and costs       | [ ]    | _provider dashboard screenshots_ |
| Sentry plan and event volume      | [ ]    | _Sentry usage screenshot_        |

---

## Collection Checklist

- [ ] All artifacts dated with collection timestamp
- [ ] All secrets/tokens/customer data redacted
- [ ] Artifacts stored in a secure, access-controlled location
- [ ] Evidence reviewed by a second team member
- [ ] Pack version and date recorded below

**Pack version**: **\_
**Collection date**: \_**
**Collected by**: **\_
**Reviewed by**: \_**
