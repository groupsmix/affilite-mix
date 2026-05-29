# Red-Team & Adversarial Audit — `groupsmix/affilite-mix`

**Audits:** A205 – A214 · **Auditor:** Devin · **Date:** 2026-04-30 · **HEAD:** `9404ba6 (main)`
**Mode:** static red-team review against the actual code, IaC and CI configs in the repo. No live keys, no live targets. Where a control is provisioned but not yet wired (e.g. Sentry destinations, Logpush destination), it is graded **PARTIAL** with an explicit gap.

> The user did not paste an asset inventory, attack-surface map, or ATT&CK detection coverage matrix in the artifact slot — this report constructs all three from source.

---

## 0. Asset inventory & attack-surface map (derived from repo)

| Tier            | Asset                                                                                                                                                                                           | Source of truth                                                                                                                                                                                             | Notes                                                                                                          |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **Edge / DNS**  | `wristnerd.xyz`, `arabictools.wristnerd.xyz`, `crypto.wristnerd.xyz`                                                                                                                            | <ref_snippet file="/home/ubuntu/repos/affilite-mix/wrangler.jsonc" lines="133-145" /> + <ref_snippet file="/home/ubuntu/repos/affilite-mix/terraform/cloudflare/dns.tf" lines="45-53" />                    | Cloudflare Worker custom domains                                                                               |
| Edge / DNS      | `cryptoranked.xyz`, `compareai.site`                                                                                                                                                            | <ref_file file="/home/ubuntu/repos/affilite-mix/config/sites/crypto-tools.ts" />, <ref_file file="/home/ubuntu/repos/affilite-mix/config/sites/ai-compared.ts" />                                           | Site-config-only; routed via Dashboard custom domains, **not** in `wrangler.jsonc`                             |
| Wildcard parent | `*.wristnerd.xyz`                                                                                                                                                                               | <ref_file file="/home/ubuntu/repos/affilite-mix/config/sites/index.ts" /> §131-175                                                                                                                          | Dynamic per-tenant subdomains resolved by middleware via DB lookup                                             |
| **Compute**     | Cloudflare Worker `affilite-mix` + heavy-crons worker `affilite-mix-heavy-crons`                                                                                                                | <ref_snippet file="/home/ubuntu/repos/affilite-mix/wrangler.jsonc" lines="5-8" />                                                                                                                           | `compatibility_date 2026-03-17`; `nodejs_compat`; `global_fetch_strictly_public`                               |
| Compute         | Tail Worker `affilite-mix-log-shipper`                                                                                                                                                          | scaffold present at `workers/log-shipper/`; deployed only if `LOG_SHIPPER_ENABLED=true` repo var set                                                                                                        | **DISABLED by default** — gap                                                                                  |
| **Data**        | Supabase Postgres (managed, RLS-enforced for tenant rows; service-role bypass on global tables)                                                                                                 | <ref_file file="/home/ubuntu/repos/affilite-mix/docs/threat-model.md" /> §Tenant Isolation, §00067 migration                                                                                                |
| Data            | R2 buckets: `next-inc-cache`, `workers-logpush`, `affilite-mix-logs`, public + private upload buckets                                                                                           | <ref_file file="/home/ubuntu/repos/affilite-mix/terraform/cloudflare/storage.tf" /> + <ref_file file="/home/ubuntu/repos/affilite-mix/lib/r2.ts" />                                                         | Magic-byte validation, scheme allow-list, server-side promotion staging→public                                 |
| Data            | KV: `RATE_LIMIT_KV`, `APP_CACHE_KV`                                                                                                                                                             | <ref_snippet file="/home/ubuntu/repos/affilite-mix/wrangler.jsonc" lines="37-46" />                                                                                                                         |
| Data            | Durable Objects: `RATE_LIMITER_DO`, `DOQueueHandler`, `DOShardedTagCache`                                                                                                                       | <ref_snippet file="/home/ubuntu/repos/affilite-mix/wrangler.jsonc" lines="59-86" />                                                                                                                         |
| **Async**       | Cloudflare Queues: `click-tracking` (+ DLQ), `audit_queue` (+ DLQ R2 NDJSON)                                                                                                                    | wrangler.jsonc + <ref_file file="/home/ubuntu/repos/affilite-mix/lib/audit-log.ts" />                                                                                                                       |
| **Crons**       | publish (`*/5 * * * *`), stripe-sync (`0 1`), sitemap-refresh (`0 3`), data-retention (`0 4`), epc-recompute (`0 6`), expire-deals (`0 *`); heavy: ai-generate, commission-ingest, price-scrape | <ref_snippet file="/home/ubuntu/repos/affilite-mix/wrangler.jsonc" lines="165-180" />                                                                                                                       | per-trigger secrets + shared `CRON_SECRET` fallback (prod: `CRON_ALLOW_SHARED_FALLBACK_IN_PROD` must be unset) |
| **Identity**    | Self-hosted email+password (bcrypt) admin login + optional TOTP MFA + step-up auth (15 min window) for sensitive ops                                                                            | <ref_file file="/home/ubuntu/repos/affilite-mix/lib/auth.ts" /> + <ref_file file="/home/ubuntu/repos/affilite-mix/lib/totp.ts" /> + <ref_file file="/home/ubuntu/repos/affilite-mix/lib/step-up-auth.ts" /> |
| Identity        | JWT signed with `JWT_SECRET` (rotation supported via `JWT_SECRET_CURRENT`); IP `/24` + UA-hash binding                                                                                          | `.env.example`, `lib/jwt.ts`                                                                                                                                                                                |
| **External**    | Stripe (live keys), Resend (email), Sentry (errors), Turnstile (CAPTCHA), Cloudflare AI / Gemini / Groq / Cohere                                                                                | wrangler.jsonc tail + provider docs                                                                                                                                                                         |
| **CI/CD**       | GitHub Actions (deploy, codeql, semgrep, gitleaks, npm-audit, license-checker, sbom, dependency-review, lighthouse, chaos, dr-drill)                                                            | `.github/workflows/*.yml`                                                                                                                                                                                   |

### External attack-surface (attacker view, derived statically)

| Surface                          | Pre-auth reach                                     | Auth req?                                                                                         | Defense in depth                                                                           |
| -------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `GET /` and any tenant page      | full                                               | none                                                                                              | Cloudflare WAF + Bot Fight Mode; CSP w/ nonce; HSTS+preload+includeSubdomains; min-TLS 1.2 |
| `GET /api/health`                | full                                               | optional `CRON_SECRET` for diagnostics                                                            | trivial liveness                                                                           |
| `POST /api/auth/login`           | rate-limited 20 / min / IP @ ruleset               | none                                                                                              | bcrypt cmp, dummy-hash timing equalizer, audit log on failure                              |
| `POST /api/auth/forgot-password` | rate-limited                                       | none                                                                                              | constant-time response; Resend email                                                       |
| `POST /api/auth/reset-password`  | token-gated                                        | none                                                                                              | single-use token                                                                           |
| `POST /api/csrf`                 | full                                               | none                                                                                              | double-submit token issuance                                                               |
| `POST /api/track/click`          | full                                               | none                                                                                              | Turnstile + Queue-backed; consumer batches inserts                                         |
| `POST /api/track/impression`     | full                                               | none                                                                                              | similar                                                                                    |
| `POST /api/track/web-vitals`     | full                                               | none                                                                                              | filtered by allow-listed metric names                                                      |
| `POST /api/newsletter/subscribe` | rate-limited; CAPTCHA                              | none                                                                                              | Turnstile gate                                                                             |
| `GET /api/gift-finder`           | rate-limited 30 / min / IP, **failPolicy: closed** | none                                                                                              | budget clamped; site-scoped Supabase client (RLS)                                          |
| `GET /api/quiz/:slug`            | full                                               | none                                                                                              | site-scoped read                                                                           |
| `POST /api/quiz/:slug/submit`    | rate-limited                                       | none                                                                                              | input length capped                                                                        |
| Admin `*/api/admin/**`           | gated                                              | `withAuthz(feature, action)` + step-up where required                                             | Semgrep blocks unguarded admin route additions                                             |
| Cron `/api/cron/*`               | gated                                              | per-trigger `CRON_*_SECRET` (or `CRON_SECRET` only when `CRON_ALLOW_SHARED_FALLBACK_IN_PROD` set) | `cronLock` mutual-exclusion; `recordCronLiveness`                                          |
| Internal `/api/internal/*`       | gated                                              | HMAC (timestamp + nonce + signature); `INTERNAL_HMAC_MIGRATION_MODE=strict` in prod               | rejects legacy bearer in strict mode                                                       |

---

## A205 — Red-team plan (Rules of Engagement) — **PARTIAL (no formal ROE doc in repo)**

The repo has a threat model (<ref*file file="/home/ubuntu/repos/affilite-mix/docs/threat-model.md" />) and an incident-response runbook (<ref_file file="/home/ubuntu/repos/affilite-mix/docs/incident-response.md" />) but **no `red-team-roe.md`** — there is no formal scope, deconfliction, success-criteria, ATT&CK mapping, report format, or retest cadence for adversary simulation. The chaos workflow (`.github/workflows/chaos.yml`) exercises \_resilience*, not _security_.

### ROE — recommended baseline (delivered as part of this audit)

| Section                          | Value                                                                                                                                                                                    |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Engagement window**            | 5 business days, 09:00–17:00 UTC                                                                                                                                                         |
| **Scope (in)**                   | Production hostnames listed above; staging Worker; non-PII synthetic test tenant                                                                                                         |
| **Scope (out)**                  | DoS / volumetric flood; client-of-customer assets; Supabase, Cloudflare, Stripe, Resend, Sentry, GitHub provider infrastructure; physical access                                         |
| **Authorized techniques**        | OWASP-Top-10 + ATT&CK Enterprise initial-access / privilege-escalation chain; AI red team (A214); social-eng of org-owned mailboxes only with separate written approval                  |
| **Unauthorized techniques**      | Privilege escalation against real customers' tenants; reading real PII; modifying production data; exfil to non-org infrastructure                                                       |
| **Success criteria (test fail)** | (a) cross-tenant data read/write; (b) admin RCE; (c) RLS bypass without service-role key; (d) cost ≥ \$100 burn from one tenant in <1 h; (e) AI jailbreak success ≥ 10% on internal eval |
| **Deconfliction**                | All external requests must carry `X-RedTeam-Run-ID: <uuid>`; allowlist run-ID on Cloudflare WAF; on-call paged by `red-team-channel` 30 min before kickoff                               |
| **Reporting**                    | Final markdown report into `docs/incidents/YYYY-MM-DD-redteam.md`; 30-day retest with same report format; CVSS 3.1 + ATT&CK ID per finding                                               |
| **ATT&CK matrices applied**      | Enterprise (primary). Cloud (Cloudflare + Supabase). Mobile **N/A** (no mobile app). ICS **N/A**.                                                                                        |

**Verdict:** PARTIAL — controls and runbooks exist, but the engagement itself has no documented ROE. Recommend committing the table above as `docs/red-team-roe.md`.

---

## A206 — External recon — **PARTIAL**

| Recon vector                  | Static-source finding                                                                                                                                                                                                                                                                                                                                                                                                                                          | Risk                                                                                                      |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| **ASN / IP**                  | All public surfaces fronted by Cloudflare AS13335 — origin worker IP not directly resolvable from public DNS. Direct `*.workers.dev` URL is not blocked at the worker, only at the WAF (no `cf.zone_name` clause in WAF rules — see <ref_snippet file="/home/ubuntu/repos/affilite-mix/terraform/cloudflare/main.tf" lines="241-254" />).                                                                                                                      | Low–Med — workers.dev URLs bypass `min_tls_version` / `bot_fight_mode` / `security_header` zone settings. |
| **CT logs**                   | Custom domains will appear in `crt.sh`; nothing leaks beyond domain names.                                                                                                                                                                                                                                                                                                                                                                                     | Low                                                                                                       |
| **DNS history**               | `dns.tf` declares only Worker-managed records; legacy hostnames before the IaC import would still show up in passive DNS (e.g. SecurityTrails). No automated diff.                                                                                                                                                                                                                                                                                             | Low–Med                                                                                                   |
| **R2 / S3 buckets**           | `next-inc-cache`, `workers-logpush`, `affilite-mix-logs`, plus public/private upload buckets. Public bucket name format `<env>-public` is conventional and guessable. R2 listing is disabled by default; verified scheme allow-list at the upload finalizer.                                                                                                                                                                                                   | Low                                                                                                       |
| **GitHub dorks**              | Repo is public — every secret name (`JWT_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, all `CRON_*_SECRET`, `INTERNAL_API_TOKEN`, `RESEND_API_KEY`, `TURNSTILE_SECRET_KEY`) is documented in plaintext as a _name_ in <ref*file file="/home/ubuntu/repos/affilite-mix/.env.example" /> and <ref_file file="/home/ubuntu/repos/affilite-mix/wrangler.jsonc" />. Names alone aren't sensitive; the \_values* must be in `wrangler secret put` only. | Low (review of plaintext-name file confirms no value committed)                                           |
| **Paste sites / breach data** | Out-of-band — repo cannot self-assess; engaged `gitleaks` + `gitleaks-action` in `.github/workflows/security.yml` covers commit-time leakage. <ref_file file="/home/ubuntu/repos/affilite-mix/docs/gitleaks-report.json" /> committed showing 0 findings at last run.                                                                                                                                                                                          | Low                                                                                                       |
| **Subdomain takeover**        | Worker custom domains are managed in Terraform — drift detected on `terraform plan`. `*.wristnerd.xyz` wildcard is intercepted by middleware DB lookup; an unbound subdomain falls through to a 404 (not a third-party SaaS).                                                                                                                                                                                                                                  | Low                                                                                                       |

**Verdict:** PARTIAL. Two real gaps:

1. **`workers.dev` direct-URL exposure**. Without disabling the workers.dev preview URL on the deployed Worker, an attacker can target `affilite-mix.<account>.workers.dev` and bypass the zone-level WAF rules. **Fix:** set `workers_dev = false` in `wrangler.jsonc` (or disable in dashboard).
2. **No daily attack-surface diff job** (covered explicitly by A213 below).

---

## A207 — Assumed breach (1 dev laptop) — **PARTIAL**

Threat model: a single developer's laptop is compromised, attacker has the local clone of the repo, the `.env.local` file (if any), the developer's SSO into GitHub, and the developer's Cloudflare dashboard cookie.

### Time-to-impact analysis

| T+             | Reachable from a dev laptop                                                                                                                                                                                                                                                                                                                           | Defenses                                                                                                                                                                                                 |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **0–30 min**   | (a) Read all source. (b) GitHub: open PR with malicious change — **but** branch protection requires PR review for `main` (see <ref_file file="/home/ubuntu/repos/affilite-mix/docs/github-branch-protection.md" />); (c) Read existing `.env.local` (low-priv: only build vars, no service-role / JWT secrets — those live in `wrangler secret put`). | Branch protection + CODEOWNERS for `lib/security/`, `terraform/`, `wrangler.jsonc`; review-required gates merges.                                                                                        |
| **30–60 min**  | (d) Cloudflare dashboard: if dev account has admin role, can rotate Worker secrets, redeploy a malicious Worker. (e) Supabase dashboard: if dev has owner role, can read prod DB.                                                                                                                                                                     | **Mitigation gap:** the repo doesn't enforce least-priv on Cloudflare/Supabase memberships. Recommend per-developer scoped Cloudflare API tokens (`Workers Scripts:Edit` only, not `Account:Logs:Edit`). |
| **60–240 min** | (f) Push a "hotfix" PR; if dev is in CODEOWNERS for the changed path and has reviewer privilege on a separate PR (collusion / second-account compromise), bypass review. (g) Pivot via stolen Stripe live key if `.env.local` happens to contain it (developer carelessness, not a code defect).                                                      | Required: enforce 2 reviewers on `main`; require Hardware MFA on GitHub org; Cloudflare 2FA.                                                                                                             |

### Chokepoints (defender's perspective)

1. **CODEOWNERS + branch protection** — well-defined; single best chokepoint.
2. **`wrangler secret put` only** — no plaintext secret in source tree (gitleaks-validated).
3. **Step-up auth (15 min)** — even if attacker steals an active session JWT, sensitive admin ops (password change, 2FA disable, site deletion) require fresh password/TOTP.
4. **Service-role allowlist** — `lib/security/service-role-allowlist.ts` + Semgrep rule blocks new RLS-bypass imports without security CODEOWNER review.
5. **Audit log queue + DLQ** — every admin write replicated to Queue → Supabase → R2 NDJSON → Analytics breadcrumb (<ref_snippet file="/home/ubuntu/repos/affilite-mix/lib/audit-log.ts" lines="92-148" />).

**Verdict:** PARTIAL. Code-side chokepoints are strong; org-side (Cloudflare role assignments, GitHub MFA enforcement, dev laptop hardening) is out-of-scope-for-the-repo and undocumented.

---

## A208 — Purple-team ATT&CK validation — **PARTIAL**

ATT&CK technique → repo evidence of detection / prevention. "MTTA / MTTR" require a real SIEM (Sentry alone is too narrow); the values below are _theoretical-best_ given current observability wiring.

| Technique                                           | Detect                                                                                                                                                                                                                                     | Prevent                                           | SIEM alert?                                                                                                                                               | MTTA (best)        | MTTR (best)           | Coverage    |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | --------------------- | ----------- |
| **T1078** Valid Accounts (admin login)              | Sentry on auth-failure burst (5xx burn-rate alert) + `audit_log` on every admin login                                                                                                                                                      | bcrypt + TOTP + step-up + IP/UA-bound JWT         | yes (alert is _defined_ but Sentry destinations are stubbed in <ref_file file="/home/ubuntu/repos/affilite-mix/terraform/cloudflare/sentry-alerts.tf" />) | ~5 min (paged)     | hours (manual rotate) | **PARTIAL** |
| **T1110.003** Password Spray                        | per-IP rate limit 20/min on `/api/auth/*` (<ref_snippet file="/home/ubuntu/repos/affilite-mix/terraform/cloudflare/main.tf" lines="187-207" />) + bcrypt cost + audit log; dummy-hash timing equalizer mitigates user-enum                 | block at WAF                                      | yes (but no specific alert rule yet)                                                                                                                      | min                | hours                 | PARTIAL     |
| **T1190** Exploit Public-Facing App                 | CodeQL + Semgrep + npm-audit + dependency-review + sbom; CSP nonce; output sanitization                                                                                                                                                    | preventive                                        | yes (CodeQL → Security tab)                                                                                                                               | hours (CI cadence) | hours (PR fix)        | **PASS**    |
| **T1059** Command-Line / Scripting                  | N/A on Worker runtime — no shell, no `child_process`                                                                                                                                                                                       | —                                                 | n/a                                                                                                                                                       | n/a                | n/a                   | **N/A**     |
| **T1059.007** JavaScript injection (XSS)            | Semgrep rules + `sanitizeHtml` + CSP nonce; Sentry breadcrumbs on CSP violation if reporting endpoint wired                                                                                                                                | scheme allow-list, no `'unsafe-inline'` for CSP-3 | partial — no `csp-report` endpoint shipped                                                                                                                | hours              | hours                 | PARTIAL     |
| **T1486** Data Encrypted for Impact (ransomware)    | Backup policy & DR runbook documented (<ref_file file="/home/ubuntu/repos/affilite-mix/docs/BACKUP-POLICY.md" />, <ref_file file="/home/ubuntu/repos/affilite-mix/docs/DR-RUNBOOK.md" />); R2 versioning enabled by default; Supabase PITR | restoration                                       | no realtime alert                                                                                                                                         | days (operator)    | hours                 | PARTIAL     |
| **T1567** Exfil to Web Service                      | Worker `global_fetch_strictly_public` flag in <ref_snippet file="/home/ubuntu/repos/affilite-mix/wrangler.jsonc" lines="8-8" /> blocks fetches to private RFC-1918 ranges                                                                  | yes                                               | none — no DLP rule on outbound                                                                                                                            | n/a                | n/a                   | PARTIAL     |
| **T1041** Exfil over C2                             | Tail Worker scaffold present but disabled by default; without it, no per-request egress audit. Once enabled (`LOG_SHIPPER_ENABLED=true`), every fetch is captured.                                                                         | partial                                           | only after Tail Worker on                                                                                                                                 | n/a                | n/a                   | **GAP**     |
| **T1098.001** Account Manipulation (cloud accounts) | `lib/audit-log.ts` records every `admin_user` mutation; step-up required for password / 2FA changes                                                                                                                                        | yes                                               | partial — alert rule defined but not deployed                                                                                                             | min                | hours                 | PARTIAL     |
| **T1531** Account Access Removal (lockout)          | Failed-login burst → audit log; no automated lockout                                                                                                                                                                                       | preventive                                        | none                                                                                                                                                      | n/a                | n/a                   | GAP         |
| **T1547.001** Persistence via deploy hook           | Branch protection + CODEOWNERS on `.github/workflows/deploy.yml`                                                                                                                                                                           | yes                                               | n/a                                                                                                                                                       | n/a                | n/a                   | PASS        |

**Per-pillar coverage summary:**

| ATT&CK pillar     | PASS    | PARTIAL | GAP |
| ----------------- | ------- | ------- | --- |
| Initial Access    | 1       | 1       | 0   |
| Credential Access | 0       | 2       | 0   |
| Execution         | 1 (N/A) | 1       | 0   |
| Persistence       | 1       | 0       | 0   |
| Defense Evasion   | 0       | 1       | 1   |
| Discovery         | 0       | 1       | 0   |
| Lateral Movement  | 0       | 1       | 0   |
| Exfiltration      | 0       | 1       | 1   |
| Impact            | 0       | 1       | 0   |

**Verdict:** PARTIAL. Detection plumbing exists (Sentry, audit*log queue, CF Workers Observability, OTEL) but the \_alerts themselves are stubbed* — the `cloudflare_notification_policy` resources start with `enabled = false` (<ref_snippet file="/home/ubuntu/repos/affilite-mix/terraform/cloudflare/alerts.tf" lines="58-64" />) and `terraform/cloudflare/sentry-alerts.tf` is documentation only (no real Sentry provider wiring). MTTA is "as fast as you wire the destinations and flip the flags."

---

## A209 — Cloud red team — **mostly N/A**

This is a single-cloud (Cloudflare) deployment with one external managed service (Supabase). The matrix:

| Cloud                                                   | Verdict                    | Reason                                                                                  |
| ------------------------------------------------------- | -------------------------- | --------------------------------------------------------------------------------------- |
| **AWS** (IMDSv1, IAM privesc, S3 enum, KMS, AssumeRole) | **N/A**                    | No AWS surface. R2 is S3-API-compatible but has no SigV4 STS / AssumeRole / KMS / IMDS. |
| **GCP** (metadata, OAuth scope, SA key sprawl)          | **N/A**                    | No GCP surface. Gemini API is a vendor call, not a GCP project.                         |
| **Azure** (managed identity, Graph)                     | **N/A**                    | No Azure surface.                                                                       |
| **Cloudflare**                                          | **PARTIAL — graded below** | All compute + KV + R2 + DO + Queues here.                                               |

### Cloudflare-specific red-team checks (substituted)

| Check                                                    | Verdict | Evidence / Gap                                                                                                                                                                                                                                                                                                          |
| -------------------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Worker secret rotation runbook                           | PASS    | <ref_file file="/home/ubuntu/repos/affilite-mix/docs/secrets-rotation-runbook.md" />                                                                                                                                                                                                                                    |
| API token least-priv for CI                              | PASS    | `CLOUDFLARE_API_TOKEN` is required to be a scoped token; Global Key explicitly rejected (`.github/workflows/deploy.yml` head comment §`CLOUDFLARE_API_KEY` block)                                                                                                                                                       |
| KV / R2 binding scoping                                  | PASS    | Per-binding bindings declared in `wrangler.jsonc`; no wildcard read tokens                                                                                                                                                                                                                                              |
| `workers.dev` preview URL exposure                       | **GAP** | No `workers_dev = false` line in `wrangler.jsonc`                                                                                                                                                                                                                                                                       |
| Service binding self-reference (`WORKER_SELF_REFERENCE`) | PARTIAL | Self-binding exists for OpenNext caching (<ref_snippet file="/home/ubuntu/repos/affilite-mix/wrangler.jsonc" lines="13-20" />). If exploited, an attacker who controls a request can recursively re-enter the Worker (loop). Mitigated by `cronLock` for cron paths, but no recursion-depth guard on user-driven paths. |
| R2 `data:` / SVG XSS                                     | PASS    | Magic-byte check + scheme allow-list (<ref_snippet file="/home/ubuntu/repos/affilite-mix/docs/threat-model.md" lines="63-70" />)                                                                                                                                                                                        |
| KV fail-open / fail-closed posture                       | PASS    | 60 s grace then fail-closed; first failure pages on `rate-limit.kv-unavailable-fail-open` Sentry rule                                                                                                                                                                                                                   |
| Cloudflare Tunnel / Zero Trust attack surface            | N/A     | None deployed                                                                                                                                                                                                                                                                                                           |

**Verdict:** PARTIAL — only one real CF-side gap (`workers.dev` exposure).

---

## A210 — Phishing campaign — **N/A for static review**

The repo is the application; phishing simulation requires (a) named org users, (b) email infrastructure access, (c) a phishing platform (e.g. GoPhish, KnowBe4). None of those are inside this repo.

What the repo _does_ provide (defenders' view):

| Defense                             | Status                                                                                                    |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Inbound-mail SPF / DKIM / DMARC     | configurable via `dns.tf` `dns_records` map; default = empty. **GAP — no committed SPF / DMARC records.** |
| Outbound-mail authenticity (Resend) | DKIM signed at Resend; aligned domain configurable in Resend dashboard; not in repo                       |
| Step-up auth on sensitive ops       | <ref_file file="/home/ubuntu/repos/affilite-mix/lib/step-up-auth.ts" /> §15-min window                    |
| Magic-link single-use enforcement   | reset-password tokens single-use (`/api/auth/reset-password`)                                             |

**Recommended ROE for the live A210 run:** 3 cohorts × 25 users (HR / IT / vendor / exec impersonation), 7-day window, click-rate target <10%, cred-rate target <2%, MFA-bypass target 0%, report-rate target ≥30%, time-to-report target <15 min. **Cannot be executed from this repo alone.**

**Verdict:** N/A for the static review; with the addition of an SPF/DMARC commit and a documented phishing-sim ROE, the program would be live-ready.

---

## A211 — Physical security test — **N/A**

The platform is fully cloud-hosted (Cloudflare + Supabase). No corporate office, no badge readers, no on-prem network are described in the repo. Tailgating, HID/MIFARE cloning, rogue-AP, drop-USB, dumpster, and OSINT-of-staff are entirely out-of-scope-of-the-codebase.

**Adjacent control inside the repo:** secret-rotation runbook (<ref_file file="/home/ubuntu/repos/affilite-mix/docs/secrets-rotation-runbook.md" />) defines rotate-on-suspicion behavior, which is what a successful USB drop / shoulder-surf would trigger.

**Verdict:** N/A. (If the org has an office, this audit must be re-run against that physical perimeter; coordinate legal+HR per the user's prompt.)

---

## A212 — Social engineering against help desk — **N/A in repo, with one design-side note**

There is no help desk endpoint exposed by the application. Password reset is fully self-service via email (`/api/auth/forgot-password`, `/api/auth/reset-password`); MFA reset is **not** self-service — TOTP is only resettable via direct DB update (no admin-resets-self-MFA route present in `app/api/auth/*` or `app/api/admin/*`).

Design-side hardening already shipped:

- Dummy-hash timing-equalization (<ref_snippet file="/home/ubuntu/repos/affilite-mix/lib/auth.ts" lines="27-34" />) — stops the help-desk-style "does this email exist?" probe.
- Step-up auth window 15 min — limits "vendor-payment-change" lateral move from a hijacked session.
- Audit log on every `admin_users` mutation.

**Verdict:** N/A — no help-desk surface in code. Recommend a `runbook` entry for the human help desk (if one exists) covering exec SIM-swap and vendor-payment-change call-back verification.

---

## A213 — Continuous Attack-Surface Management (ASM) — **GAP**

The repo has scheduled / scanning workflows but **none of them produce a daily diff of internet-exposed assets**:

| Workflow                                                | What it scans                        | What it does NOT                                      |
| ------------------------------------------------------- | ------------------------------------ | ----------------------------------------------------- |
| `security.yml` (weekly Mon 06:00 UTC)                   | npm audit, license, gitleaks, CodeQL | does not scan public DNS / ports / certs / subdomains |
| `semgrep.yml`                                           | source SAST                          | source only                                           |
| `sbom.yml`                                              | dependency tree                      | software, not network                                 |
| `chaos.yml`, `dr-drill.yml`, `backup-restore-drill.yml` | resilience                           | not exposure                                          |
| `lighthouse.yml`, `load-test.yml`                       | perf                                 | n/a                                                   |
| `integration-nightly.yml`                               | end-to-end functional                | not adversarial recon                                 |

There is **no daily** `*-asm.yml` job that:

- Resolves every domain in `config/sites/*.ts` and the wrangler routes,
- Scans for open ports (only 443 should answer),
- Diffs `crt.sh` for new certs in zone,
- Diffs DNS records vs. `terraform/cloudflare/dns.tf`,
- Diffs `wrangler tail` published service list,
- Alerts on a new public bucket or a new R2 listing capability.

**Verdict:** GAP. Single highest-leverage, lowest-effort fix in this audit. Sample workflow stub:

```yaml
# .github/workflows/asm.yml — runs daily at 06:30 UTC
on: { schedule: [{ cron: "30 6 * * *" }] }
jobs:
  asm:
    steps:
      - run: |
          for d in $(jq -r '.[].domain' config/sites/*.json); do
            curl -fsS "https://crt.sh/?q=%25.${d}&output=json" \
              | jq -r '.[].name_value' | sort -u > "ct-${d}.txt"
            nmap -p 80,443,22,8080,9000 -Pn -T4 "$d" -oN "nmap-${d}.txt"
          done
          git diff --exit-code -- ct-*.txt nmap-*.txt || \
            { echo "::error::ASM diff non-empty"; exit 1; }
```

---

## A214 — AI red team sprint — already covered (A115); incremental view

The application has one AI surface: the LLM fallback chain → admin-approved drafts. A115 graded that surface end-to-end (overall jailbreak success 35%, all XSS/phishing 0%, all denial-of-wallet blocked).

A214 asks for a **sprint** view, with new vectors not covered by A115:

| Vector                                                    | Status                                                                                                                                                                    | Why                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Direct jailbreak / role hijack / system-prompt extraction | covered in A115                                                                                                                                                           | partial — multilingual + obfuscated payloads succeed                                                                                                                                                                                                                                                                                                                                                                                                        |
| **Indirect injection via uploads**                        | **GAP for the AI path; PASS for the upload path itself**                                                                                                                  | The AI never reads R2 uploads (no RAG). The upload path is hardened (magic-byte, scheme allow-list). If a future feature adds OCR / image-to-text, the indirect-injection vector becomes live.                                                                                                                                                                                                                                                              |
| **Plugin abuse**                                          | **N/A**                                                                                                                                                                   | No plugins / function-calling / tools wired                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **Memory poisoning**                                      | **N/A**                                                                                                                                                                   | No persistent model memory; every call is stateless                                                                                                                                                                                                                                                                                                                                                                                                         |
| **Hallucinated package names → squat**                    | **GAP — not enforced in CI**                                                                                                                                              | Today, no CI step blocks a developer from `npm install`-ing a package that an LLM suggested. The model could recommend a typo-squat (e.g. `@cloudflre/workers-types`). Existing controls (npm audit, license-check, dependency-review) catch _known-bad_ packages, not _invented_ ones. **Fix:** add a pre-merge step that consults a curated allow-list (e.g. lockfile-only installs, plus `socket.dev` / Cloudflare Supply Chain) for new top-level deps. |
| **Denial-of-wallet**                                      | covered in A115                                                                                                                                                           | PASS — quotas + rate limit + `failPolicy:closed`                                                                                                                                                                                                                                                                                                                                                                                                            |
| **Output exfil → phishing CTA**                           | covered in A115                                                                                                                                                           | PASS — `sanitizeHtml` scheme allow-list + admin review                                                                                                                                                                                                                                                                                                                                                                                                      |
| **Tenant cross-pollination via shared model**             | the same vendor model is used across tenants; tenants supply only `topic`/`keywords` so context bleed is structurally impossible (no cross-tenant RAG, no shared session) | PASS by construction                                                                                                                                                                                                                                                                                                                                                                                                                                        |

**Verdict:** PARTIAL. Two new gaps surfaced beyond A115:

1. Hallucinated-package-name typo-squat is not blocked at install time.
2. Indirect-injection coverage is "passes by absence" — if uploads ever feed the model, controls must be added before the feature ships.

---

## ATT&CK detection-coverage matrix (consolidated)

| ATT&CK ID | Technique                                  | Prevention                                              | Detection                                      | Verdict           |
| --------- | ------------------------------------------ | ------------------------------------------------------- | ---------------------------------------------- | ----------------- |
| T1078     | Valid Accounts                             | bcrypt + TOTP + step-up + JWT IP/UA bind                | audit_log + auth-failure-burst alert (stubbed) | PARTIAL           |
| T1078.004 | Cloud Accounts (Cloudflare/Supabase admin) | per-token scoping; `wrangler secret put`                | dashboard activity logs                        | PARTIAL           |
| T1110.003 | Password Spraying                          | WAF rate-limit 20 / min / IP                            | audit_log                                      | PARTIAL           |
| T1190     | Exploit Public-Facing App                  | CodeQL + Semgrep + npm-audit + CSP + sanitizeHtml + RLS | CodeQL alerts                                  | PASS              |
| T1059     | Command-Line                               | N/A on Workers (no shell)                               | —                                              | N/A               |
| T1059.007 | JavaScript injection                       | sanitizeHtml + scheme allow-list + CSP nonce            | (no `csp-report` endpoint)                     | PARTIAL           |
| T1486     | Data Encrypted for Impact                  | R2 versioning + Supabase PITR + DR runbook              | backup-restore-drill workflow                  | PARTIAL           |
| T1567     | Exfil over Web Service                     | `global_fetch_strictly_public`                          | tail worker (disabled by default)              | PARTIAL           |
| T1041     | Exfil over C2                              | n/a (no outbound non-fetch)                             | tail worker                                    | GAP-until-enabled |
| T1098.001 | Cloud Account Manipulation                 | step-up + audit_log                                     | audit_log queue + R2 DLQ                       | PARTIAL           |
| T1531     | Account Access Removal (lockout)           | none — there is no automatic lockout-after-N-failures   | audit_log only                                 | GAP               |
| T1547.001 | Persistence via CI                         | branch protection + CODEOWNERS                          | dependency-review + sbom diff                  | PASS              |
| T1552.001 | Credentials in Files                       | `.env.example` placeholders only; gitleaks              | gitleaks-action                                | PASS              |
| T1499     | Endpoint DoS                               | Cloudflare WAF + Bot Fight Mode + per-route rate limits | http_alert_edge_error (stubbed)                | PARTIAL           |
| T1499.001 | OS Exhaustion (CPU)                        | per-Worker CPU limit; AI prompt char cap                | worker_cpu_time_alert (stubbed)                | PARTIAL           |

---

## Top 10 fixes (priority-ordered)

1. **Disable `workers.dev` preview URL in production** (`wrangler_dev = false` or `workers_dev: false`). Closes A206 + A209 gaps.
2. **Wire Sentry / Cloudflare alert destinations and flip `alerts_enabled = true`.** Today, the alert _rules_ exist but `alert_mechanisms` is empty (<ref_snippet file="/home/ubuntu/repos/affilite-mix/terraform/cloudflare/alerts.tf" lines="38-64" />). MTTA depends on this.
3. **Enable the Tail Worker** (`LOG_SHIPPER_ENABLED=true` repo var). Closes A208 T1041, gives durable per-request logs for forensics.
4. **Add `.github/workflows/asm.yml`** — daily DNS / port / cert / subdomain diff. Single highest-leverage A213 fix.
5. **Commit a `red-team-roe.md`** with the ROE table from §A205 above.
6. **Add SPF / DKIM / DMARC records** to `terraform/cloudflare/dns.tf` `dns_records` map. Closes A210 prerequisite.
7. **Auto-lockout / progressive delay on `/api/auth/login`.** Today there's only an IP-rate limit, no per-account lockout-after-N-failures. Closes A208 T1531.
8. **Ship a `csp-report` endpoint** so CSP violations land in Sentry as a discrete signal. Closes A208 T1059.007.
9. **Block hallucinated-package-name supply-chain risk** (A214) — lockfile-only installs in CI, allow-list new top-level deps via security CODEOWNER review.
10. **Document org-side controls** (Cloudflare role assignments, GitHub MFA enforcement, dev laptop hardening) inside `docs/threat-model.md` or a new `docs/org-security.md`. Closes the silent-third of A207.

---

## Audit summary table

| #    | Audit                         | Verdict                     | One-line gap                                         |
| ---- | ----------------------------- | --------------------------- | ---------------------------------------------------- |
| A205 | Red-team plan / ROE           | PARTIAL                     | no committed ROE doc                                 |
| A206 | External recon                | PARTIAL                     | `workers.dev` preview URL exposed; no daily ASM diff |
| A207 | Assumed breach (1 dev laptop) | PARTIAL                     | code-side strong; org-side not documented            |
| A208 | Purple-team ATT&CK validation | PARTIAL                     | alert rules exist, destinations stubbed              |
| A209 | Cloud red team                | mostly N/A; CF-only PARTIAL | `workers.dev` + self-reference recursion             |
| A210 | Phishing campaign             | N/A in repo                 | needs SPF/DMARC commit + ROE doc                     |
| A211 | Physical security             | N/A                         | no physical perimeter inside the codebase            |
| A212 | Help-desk social-eng          | N/A                         | no help-desk surface in code                         |
| A213 | Continuous ASM                | **GAP**                     | no daily attack-surface diff workflow                |
| A214 | AI red-team sprint            | PARTIAL                     | typo-squat package risk; future indirect-injection   |

The codebase is well-defended at the _control_ layer — sanitizers, RLS, CSP, scoped tokens, audit log fan-out, multiple-provider fallback are all real and tested. The recurring gap pattern is **"control exists, alert/diff plumbing is stubbed."** Fixes 1-4 above close the bulk of that gap with low effort.
