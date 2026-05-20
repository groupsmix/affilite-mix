# Security Audit A31–A60 — affilite-mix

Repo: https://github.com/groupsmix/affilite-mix/ (commit at HEAD as of 2026-04-30)
Methodology: hostile-everything. Each audit gets its own table. Line numbers are exact (`file:line`).
Audits whose subject matter does not exist in the repo are explicitly marked **N/A** with justification rather than fabricated.

Inventory of relevant artifacts:
- IaC: `terraform/cloudflare/*.tf`, `terraform/github/*.tf`, `wrangler.jsonc`
- Dockerfiles: **none** (only `docker-compose.yml` for local Supabase dev stack)
- Kubernetes manifests: **none**
- CI/CD: `.github/workflows/{ci,deploy,security,sbom,codeql}.yml`
- App: Next.js 15 on Cloudflare Workers (`@opennextjs/cloudflare`)
- DB: Supabase (PostgreSQL + PostgREST + Auth)
- Edge runtime: Cloudflare Workers, KV, R2, Queues, Durable Objects
- GraphQL: **none** (REST only)

---

## [A31] IaC line-by-line

| # | File:Line | Severity | Finding |
|---|---|---|---|
| 1 | `terraform/cloudflare/main.tf:14-16` | INFO | State backend unset by design — operator must wire Terraform Cloud / S3 before `terraform init`. No remote state locking ⇒ concurrent applies / lost updates if forgotten. |
| 2 | `terraform/cloudflare/main.tf:62-74` | MED | `logpush_destination_conf` is a tfvar with no validation that it is actually an `r2://` URI scoped to your account. A misconfigured `s3://...` could silently exfiltrate logs to a third-party bucket. |
| 3 | `terraform/cloudflare/main.tf:77-82` | MED | `logpush_enabled` defaults `false`. Until an operator flips it, **no Worker logs are shipped off Cloudflare** — SOC 2 log-retention gap until applied. |
| 4 | `terraform/cloudflare/main.tf:93-101` | LOW | `waf_blocked_asns` defaults to `[]` — the WAF custom rule fires only on country list (KP/IR/SY) until ASN tfvars supplied. |
| 5 | `terraform/cloudflare/main.tf:103-115` | LOW | `waf_blocked_countries` default = OFAC set only. Brazilian / Russian / abuse hotspots not challenged by default. |
| 6 | `terraform/cloudflare/main.tf:135-139` | LOW | `min_tls_version=1.2` — TLS 1.3 not mandatory. Hostile assumption: downgrade attack tolerated; recommend `"1.3"`. |
| 7 | `terraform/cloudflare/main.tf:141-145` | INFO | `security_level = "high"` — hostile traffic still gets the Cloudflare interstitial, not blocked outright. Acceptable but flag for SOC2 audit. |
| 8 | `terraform/cloudflare/main.tf:194-206` | MED | Auth rate limit characteristics = `["ip.src", "cf.colo.id"]`. With `cf.colo.id` in the bucket key, an attacker rotating across colos gets `20 req/60s × N_colos` headroom. Should be `["ip.src"]` only or `["http.request.headers[\"cf-connecting-ip\"][0]"]`. |
| 9 | `terraform/cloudflare/main.tf:194-206` | HIGH | Single rate-limit rule covers `wildcard "/api/auth/*"` with one bucket of 20 req/60s. No per-user / per-email bucket; password-spraying across many emails from one IP is throttled but credential-stuffing across many IPs is not. (Mitigated in app code at `app/api/auth/login/route.ts:35-39`, but defense-in-depth is missing here.) |
| 10 | `terraform/cloudflare/main.tf:241-246` | MED | Custom WAF rule action = `managed_challenge`, not `block`. KP/IR/SY origin can solve a challenge and proceed; OFAC compliance is not enforced. |
| 11 | `terraform/cloudflare/main.tf:267-276` | INFO | Cache rule bypasses `/api/*` — correct, but no positive cache rule for `_next/static` etc. with explicit immutable headers. Static asset caching relies on Workers defaults. |
| 12 | `terraform/cloudflare/main.tf:313-332` | MED | Logpush field set is `["Event","EventTimestampMs","Outcome","Logs","Exceptions"]` — does NOT include `RequestHeaders`/`ResponseHeaders`/`ScriptName`. Forensic IR will lack request headers and route attribution. |
| 13 | `terraform/cloudflare/main.tf:383-403` | LOW | Healthcheck regions = `["WEU","WNAM"]` only. Asia-Pacific worker brownouts will not page on-call. |
| 14 | `terraform/cloudflare/main.tf:408-441` | HIGH | DR failover load balancer is **commented out** ("requires paid plan"). Documented Tier-1 DR is non-functional today; `var.zone_domain` 5xx storm has no automatic fallback. |
| 15 | `terraform/cloudflare/storage.tf:53-61` | HIGH | KV namespaces have no encryption-key declaration, no scheduled rotation, no audit-log shipping. KV at rest is encrypted by Cloudflare but key material is wholly Cloudflare-controlled — no BYOK. |
| 16 | `terraform/cloudflare/storage.tf:63-67` | HIGH | R2 bucket `next-inc-cache` — no `lifecycle_rule` declared, no public-access-block (R2 has no public ACL by default but worth asserting), no versioning, no object-lock, no replication. |
| 17 | `terraform/cloudflare/storage.tf:84-88` | HIGH | R2 bucket `worker_logs` — same as above. **Logs persisted indefinitely with no retention rule** = compliance / cost time-bomb. |
| 18 | `terraform/cloudflare/storage.tf:47-51` | LOW | `r2_default_location = "WNAM"` is single-region. No replication declared anywhere. R2 region outage = total cache + log loss. |
| 19 | `terraform/cloudflare/queues.tf:25-28` | MED | `cloudflare_queue.click_tracking` has no encryption attribute, no message TTL, no visibility timeout, no per-environment naming. Same queue name across `dev`/`prod` if both apply against same account. |
| 20 | `terraform/cloudflare/queues.tf:30-33` | MED | DLQ has **no consumer or alert** wired in IaC. Poison messages accumulate silently. |
| 21 | `terraform/cloudflare/dns.tf:55-74` | MED | `dns_records` defaults to empty map. No DMARC, SPF, MX, CAA records declared as IaC — drift target. CAA missing = any CA can issue cert for the zone. |
| 22 | `terraform/cloudflare/alerts.tf:58-64` | HIGH | `alerts_enabled = false` by default. Until an operator flips it post-deploy, **no SLO burn-rate paging is active**. |
| 23 | `terraform/cloudflare/alerts.tf:80-104` | MED | `worker_5xx_alert` filters on `services=["affilite-mix"]` only — heavy-crons worker (`affilite-mix-heavy-crons`, see `wrangler.jsonc:169-177` comments) is unmonitored. |
| 24 | `terraform/cloudflare/alerts.tf:106-130` | MED | Same finding — CPU-time alert ignores secondary worker. |
| 25 | `terraform/cloudflare/main.tf` (whole file) | MED | No `tags` / `labels` on resources. Cloudflare provider supports few tag attrs but `cloudflare_workers_kv_namespace` etc. have no environment / owner / cost-center metadata. |
| 26 | `terraform/github/main.tf:42-46` | INFO | `github_token` is a tfvar but no constraint that it is a fine-grained PAT vs classic. Classic PAT = full org bypass. |
| 27 | `terraform/github/main.tf:65-83` | MED | Required status checks list does not include `sbom`, `attest`, `wrangler-dryrun`, or `staging-smoke` despite those workflows existing — a PR can be merged that fails SBOM / supply-chain checks. |
| 28 | `terraform/github/main.tf:85-89` | MED | `required_review_count` defaults to `1` — a single insider compromise approves their own change after open. SOC2 SoD requires 2 for production-impacting repos. |
| 29 | `terraform/github/main.tf:91-100` | HIGH | `break_glass_team_slug = null` default = no bypass team, but bypass mode in `branch-protection.tf:45` is `pull_request` not `always`, so a break-glass team **could self-merge without review**. Documented but unaudited. |
| 30 | `terraform/github/branch-protection.tf:71-81` | MED | `strict_required_status_checks_policy = true` — good. But no `require_code_owner_review = true` means that a PR touching `terraform/`, `.github/workflows/`, or `lib/security/*` does not need security CODEOWNERS approval (line 65 has it for the org-wide policy, but no enforced CODEOWNERS file is declared in IaC). |
| 31 | `wrangler.jsonc:7` | LOW | `compatibility_date = "2026-03-17"` — pinned but not auto-bumped; new V8 / Workers security fixes won't apply until this is bumped. |
| 32 | `wrangler.jsonc:8` | LOW | `compatibility_flags` = `["nodejs_compat","global_fetch_strictly_public"]`. `global_fetch_strictly_public` is a deny-listed-private-IP guard (good). `nodejs_compat` opens the whole Node API surface — `child_process`, `fs` stubs, etc. — broader than necessary. |
| 33 | `wrangler.jsonc:38-45` | MED | KV bindings use string interpolation `${RATE_LIMIT_KV_NAMESPACE_ID}` — a misconfigured shell deploy can substitute another tenant's namespace. No precondition asserts the env var is non-empty (handled by deploy.yml in another file, but not by wrangler itself). |
| 34 | `wrangler.jsonc:133-145` | MED | Routes hardcode three custom_domains. Adding domains is dashboard-managed (line 121-145 comment) — IaC drift expected. Anyone with dashboard access can attach the worker to a hostile domain that shares cookies with `wristnerd.xyz` if `Domain` cookie scope is broad. |
| 35 | `wrangler.jsonc:165-179` | LOW | Cron triggers — multiple jobs run at exact `0 1`, `0 3`, `0 4`, `0 6`, `0 *`, `*/5`. No jitter ⇒ herd at top of hour. |
| 36 | `wrangler.jsonc:184-186` | INFO | Only `NODE_ENV=production` in `vars`. Acceptable but means any other config relies on secrets / environment.  |
| 37 | `wrangler.jsonc:194-200` | MED | OTEL endpoint and bearer interpolated from env. No assertion that endpoint is HTTPS / matches an allow-list — a misconfigured `OTEL_ENDPOINT=http://attacker` ships traces to attacker. |
| 38 | `wrangler.jsonc:252` | HIGH | `tail_consumers: []` default. Comment block lines 205-251 explains a Tail Worker scaffold exists at `workers/log-shipper/` but is **NOT wired**. So even in production, durable log shipping is opt-in via repo Variable `LOG_SHIPPER_ENABLED`. Until set, R6 / SOC2 log retention is unfulfilled. |
| 39 | `wrangler.jsonc:117-145` | MED | No `services` binding (apart from self-reference on line 17) for service-to-service auth between workers. `affilite-mix-heavy-crons` (mentioned line 169-177) is a separately-deployed worker; how main worker calls it is unspecified in IaC. |

---

## [A32] Dockerfile

**N/A** — no `Dockerfile` exists in the repo. Verified via `glob "**/Dockerfile*"`. The only Docker artifact is `docker-compose.yml` (local Supabase dev stack only — never deployed). For completeness:

| # | File:Line | Severity | Finding |
|---|---|---|---|
| 1 | `docker-compose.yml:32` | LOW | `image: supabase/postgres:17` — floating tag, no digest pin. Local-only image but if reused in CI, a malicious push to upstream tag is consumed without integrity check. |
| 2 | `docker-compose.yml:55` | LOW | `image: postgrest/postgrest:v12.2.0` — version pinned but not by digest. |
| 3 | `docker-compose.yml:70` | LOW | `image: kong:3.4` — minor-version float, no digest. |
| 4 | `docker-compose.yml:40-42` | INFO | `POSTGRES_PASSWORD=postgres`, `JWT_SECRET=super-secret-jwt-token-with-at-least-32-characters-long` — hardcoded dev creds. Acceptable per scope (local-only) but **must never** be referenced from anything that hits CI/prod. |

---

## [A33] Kubernetes

**N/A** — no Kubernetes manifests, kustomize, helm chart, or operator config exist in the repo. Workload runs on Cloudflare Workers. No `securityContext` / `NetworkPolicy` / `ServiceAccount` targets to audit.

---

## [A34] CI/CD

| # | File:Line | Severity | Finding |
|---|---|---|---|
| 1 | `.github/workflows/ci.yml:28-32` | INFO | Actions pinned by commit SHA (`actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd`). |
| 2 | `.github/workflows/ci.yml:36-51` | LOW | `npm audit` runs but exit code handling not visible at this line range — verify failure threshold below. |
| 3 | `.github/workflows/ci.yml:68-216` | INFO | Numerous custom security checks (admin authz enforcement, DAL site scoping, CORS, internal route auth, service-role import scan, R2 bucket isolation, fail-closed rate limiting, raw IP header parsing, restricted Stripe keys). Strong. |
| 4 | `.github/workflows/ci.yml:256-269` | LOW | Lockfile integrity check — relies on `npm ci`. No subresource verification of registry tarballs. |
| 5 | `.github/workflows/ci.yml:271-280` | INFO | SBOM generation (CycloneDX) wired. Verify keyless cosign sign in `sbom.yml`. |
| 6 | `.github/workflows/security.yml:33-51` | MED | `npm audit` configured to fail on high/critical. Does not fail on **moderate** — moderate Prototype Pollution / ReDoS / SSRF in transitive deps slips past. |
| 7 | `.github/workflows/security.yml:53-85` | INFO | License compliance excludes GPL/AGPL/SSPL. Good. |
| 8 | `.github/workflows/security.yml:101-111` | INFO | gitleaks runs. |
| 9 | `.github/workflows/security.yml:113-126` | INFO | CodeQL SAST runs. |
| 10 | `.github/workflows/sbom.yml:42-67` | INFO | CycloneDX + SPDX SBOMs signed via keyless cosign with GitHub OIDC — strong. |
| 11 | `.github/workflows/sbom.yml:90-125` | LOW | SBOM archived to R2 ≥3 years. R2 bucket not specified in this view — verify it's the `worker_logs` bucket or a dedicated SBOM bucket with object-lock. |
| 12 | `.github/workflows/sbom.yml:144-152` | INFO | GitHub Artifact Attestation present (SLSA L2-ish). |
| 13 | `.github/workflows/codeql.yml:43-49` | INFO | `security-and-quality` query suite enabled — broader than `security-extended`. Good. |
| 14 | `.github/workflows/deploy.yml:16-50` | LOW | Required secrets documented as comments only. Drift risk between docs and `wrangler secret list`. |
| 15 | `.github/workflows/deploy.yml:128-302` | INFO | Pre-deploy validates required Worker bindings (KV/DO/queue/R2) and required per-trigger cron secrets. |
| 16 | `.github/workflows/deploy.yml:305-312` | HIGH | Asserts scoped `CLOUDFLARE_API_TOKEN` (no Global API Key) — strong. |
| 17 | `.github/workflows/deploy.yml:322-458` | INFO | Staging DB smoke test, schema-drift check, rollback notes required. |
| 18 | `.github/workflows/deploy.yml:478-544` | INFO | Staging integration smoke via opennextjs-cloudflare build + wrangler dry-run. |
| 19 | `.github/workflows/deploy.yml:549-665` | MED | DB migration with snapshot. Verify snapshot restore path is automated; manual runbook = long RTO. |
| 20 | `terraform/github/main.tf:77-82` | MED | Branch-protection required-checks list (`check`,`secret-scan`,`codeql`,`dependency-review`) **does not include** `sbom`, `attest`, or `wrangler-dryrun` — meaning a PR can ship that broke SBOM signing as long as it didn't break the four required ones. |
| 21 | `terraform/github/branch-protection.tf:40-47` | MED | `bypass_actors` granted `pull_request` mode. Self-merging in the break-glass path is permitted. |
| 22 | `.github/workflows/*` | MED | No explicit `permissions:` audit visible at top of every workflow — confirm each workflow uses least-priv `contents: read`. (Default repo permissions setting determines fallback.) |
| 23 | `.github/workflows/*` | LOW | No `concurrency:` cancel-in-progress declared on `deploy.yml` (visible portion) — racing deploys possible. |
| 24 | `.github/workflows/*` | MED | Self-hosted runner usage not visible — assuming GitHub-hosted. If any job runs on self-hosted, runner isolation is unspecified. |
| 25 | Branch-protection ruleset | HIGH | `required_review_count = 1` (`terraform/github/main.tf:88`). Single-reviewer self-merge possible after social-engineering. |

---

## [A35] Cloud IAM least privilege

This repo runs on Cloudflare + Supabase + GitHub. AWS-style IAM JSON does not exist; equivalent surfaces audited below.

| # | File:Line | Severity | Finding |
|---|---|---|---|
| 1 | `terraform/cloudflare/main.tf:30-34` | HIGH | `cloudflare_api_token` description requires `Zone:Edit, Account:Logs:Edit, Account:Bot Management:Edit, Zone:WAF:Edit` — these are **broad zone-write scopes**. No scope-down to specific zone IDs documented in this var. A leaked token can edit every zone the account owns. |
| 2 | `.github/workflows/deploy.yml:305-312` | INFO | Asserts that `CLOUDFLARE_API_TOKEN` is a scoped token (rejects Global API Key) — partial mitigation of #1. |
| 3 | `terraform/github/main.tf:42-46` | HIGH | `github_token` requires `repo + admin:org ruleset write` — `admin:org` is org-wide. A leaked apply-time token can rewrite rulesets across the whole org, not just this repo. |
| 4 | Cron auth (`app/api/cron/price-scrape/route.ts:51`) | INFO | Per-cron secrets via `verifyCronAuth(...getCronAuthOptionsForPath...)` — good. |
| 5 | Service-role usage (`app/api/cron/price-scrape/route.ts:6,56`) | HIGH | `getPrivilegedSupabaseClient()` used with no per-row WHERE on `site_id` for the initial product list (`select ... .eq("status","active")`). Cron is privileged but the SELECT pulls all sites — if cron is ever invoked with attacker-supplied parameters in the future, blast radius is global. Hostile assumption: cron secret leak == read all tenants. |
| 6 | `wrangler.jsonc:259-271` | MED | Secret list (`SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET`, `STRIPE_SECRET_KEY`, etc.) — service-role key is the highest-blast-radius secret. No enforced rotation cadence or short-lived alternative (e.g. dynamic Vault Supabase creds). |
| 7 | `wrangler.jsonc:264-265` | HIGH | `INTERNAL_API_TOKEN` and `CRON_SECRET` are long-lived shared secrets. No rotation policy in IaC. A worker bundle leak → indefinite cron / queue invocation by attacker. |
| 8 | `terraform/github/branch-protection.tf:43` | LOW | Bypass actor type `Team`. No MFA-required clause (GitHub orgs can require MFA at org level — not visible in IaC). |
| 9 | Stripe API key (`wrangler.jsonc:262`) | MED | `STRIPE_SECRET_KEY` — verify it is a **Restricted Key**, not a full Secret Key. CI check `.github/workflows/ci.yml:245-254` is documented to validate this — strong if functioning. |
| 10 | Cross-account / cross-org trust | INFO | No AWS / GCP cross-account roles declared. No `ExternalId` concept here. N/A on AWS surface. |
| 11 | MFA on sensitive actions | MED | App-level step-up auth for admin write paths (`app/api/admin/sites/[id]/route.ts:155-157`, `app/api/admin/users/route.ts:124-128` per inventory). Cloud-plane MFA for Cloudflare/GitHub apply not enforced via IaC — relies on org settings. |

---

## [A36] Public endpoint

| # | File:Line | Severity | Finding |
|---|---|---|---|
| 1 | `terraform/cloudflare/main.tf:135-139` | LOW | `min_tls_version = "1.2"` — TLS 1.2 still permitted. Hostile assumption: prefer enforce 1.3. |
| 2 | `terraform/cloudflare/main.tf:129-133` | INFO | `always_use_https = on` — good. |
| 3 | `terraform/cloudflare/main.tf:164-177` | INFO | HSTS: `max_age=63072000` (2y), `include_subdomains=true`, `preload=true`, `nosniff=true`. Strong. |
| 4 | `next.config.ts:58-61` | INFO | App-level HSTS mirrors zone-level. Duplicate but consistent. |
| 5 | Cipher allow-list | MED | No explicit cipher suite pin in IaC. Cloudflare default suites accepted. Hostile assumption: ChaCha20 + AES-GCM only — not enforceable via Terraform with the current provider; requires SSL/TLS Recommender setting. |
| 6 | Certificate pinning | INFO | Browser cert pinning (HPKP) is deprecated; not pinning is acceptable. No cert pinning declared. |
| 7 | Certificate Transparency | INFO | Cloudflare-issued certs are CT-logged by default. `cloudflare_zone_setting "tls_1_3"` not set — verify via Cloudflare dashboard. |
| 8 | `terraform/cloudflare/main.tf:156-160` | INFO | Bot Fight Mode = on (free tier). |
| 9 | `terraform/cloudflare/main.tf:147-151` | INFO | Browser Integrity Check = on. |
| 10 | `terraform/cloudflare/main.tf:187-207` | MED | Rate limit only on `/api/auth/*`. No global-IP rate limit, no per-route limits at edge for `/api/*`, `/admin/*`. App-level limits exist but edge defense in depth missing. |
| 11 | `terraform/cloudflare/main.tf:234-254` | MED | WAF custom rules use `managed_challenge` not `block`. CAPTCHA-solving farms bypass. |
| 12 | DDoS | INFO | Cloudflare provides L3/L4 DDoS automatically. L7 protection relies on rate limit (#10) and BFM. |
| 13 | Geo restrictions | MED | `var.waf_blocked_countries` defaults to `["KP","IR","SY"]`. Cuba (CU) absent from OFAC list. |
| 14 | `terraform/cloudflare/main.tf:383-403` | LOW | Healthcheck only checks `/api/health` 200. A worker that returns 200 but is broken on every other route stays "healthy". |
| 15 | CT monitoring | INFO | No `crt.sh` watcher / `cf_certificates` data source declared — silent cert mis-issuance not detected by IaC. |

---

## [A37] Storage buckets

| # | File:Line | Severity | Finding |
|---|---|---|---|
| 1 | `terraform/cloudflare/storage.tf:53-61` | HIGH | KV namespaces `RATE_LIMIT_KV` / `APP_CACHE_KV` — no encryption-key BYOK, no audit log shipping declared in IaC. |
| 2 | `terraform/cloudflare/storage.tf:63-67` | HIGH | R2 `next-inc-cache` — no `lifecycle_rule`, no versioning, no object-lock. Cache poisoning persists indefinitely until manually purged. |
| 3 | `terraform/cloudflare/storage.tf:84-88` | HIGH | R2 `worker_logs` — same deficiencies. **Logs retained forever or until manual purge** (no compliance-driven retention/expiry). |
| 4 | R2 public-access block | INFO | R2 has no public-ACL concept; only via `r2_custom_domain` or pages binding. Bucket appears not bound to a public hostname in this repo. **Verify** via dashboard. |
| 5 | `terraform/cloudflare/storage.tf:47-51` | MED | `r2_default_location = "WNAM"` — single-region, no replication. |
| 6 | Default encryption | INFO | R2 SSE-C2 is on by default in Cloudflare. Not asserted in IaC. |
| 7 | MFA delete | INFO | Not a Cloudflare R2 feature. N/A. |
| 8 | Access log | HIGH | No bucket-level access logging declared. Cannot trace who pulled which object. |
| 9 | Replication | HIGH | No `cloudflare_r2_bucket_replication` resource. Single-region durability only. |
| 10 | Object lock | HIGH | Logs bucket needs WORM / object-lock for tamper-evident log retention. Not declared. |
| 11 | `app/api/admin/upload/route.ts:39-128` | INFO | Upload presign signs both `Content-Type` and `Content-Length` so R2 enforces caps. Strong. |
| 12 | `app/api/admin/upload/route.ts:15-21` | INFO | SVG explicitly excluded from `ALLOWED_IMAGE_TYPES`. |
| 13 | Supabase Storage | UNKNOWN | Not seen as an IaC resource here. If used, RLS policies on `storage.objects` not in this repo's `supabase/migrations` — separate audit. |

---

## [A38] Secret management

| # | File:Line | Severity | Finding |
|---|---|---|---|
| 1 | `wrangler.jsonc:254-275` | HIGH | Secrets list documented as comments. **No rotation policy** declared anywhere in repo. Hostile assumption: leaked secrets persist indefinitely. |
| 2 | `wrangler.jsonc:264` | HIGH | `INTERNAL_API_TOKEN` — long-lived shared secret for Worker↔API auth. No expiry. No dynamic-secret alternative. |
| 3 | `wrangler.jsonc:265` | HIGH | `CRON_SECRET` — same. Per-trigger secrets exist (`CRON_PUBLISH_SECRET` etc per `wrangler.jsonc:153-164`) — **good** — but `CRON_SECRET` fallback still active per comment. |
| 4 | `wrangler.jsonc:259-260` | HIGH | `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` — service-role JWT is the keys-to-the-kingdom. No dynamic / short-lived credential. |
| 5 | `wrangler.jsonc:261` | HIGH | `JWT_SECRET` for admin sessions — symmetric secret. No JWKS rotation. Compromise = forge any session. |
| 6 | `wrangler.jsonc:262-263` | MED | Stripe `sk_live_…` + webhook signing secret. Long-lived. |
| 7 | `terraform/cloudflare/main.tf:30-34` | HIGH | Cloudflare API token in tfvar — `sensitive=true` is set, but tfvars file path is operator-controlled. Risk of `terraform.tfvars` committed by mistake (no `.gitignore` audited for that exact path here). |
| 8 | `.husky/` and `.gitleaks` config | LOW | gitleaks is in CI but not visible as a pre-commit hook in `.husky/`. Pre-commit gitleaks would catch leaks before push. |
| 9 | `.github/workflows/security.yml:101-111` | INFO | gitleaks runs in CI. |
| 10 | CI logs | MED | Numerous `echo "$VAR"`-style patterns are not in the visible deploy.yml lines, but any unmasked echo of `SUPABASE_URL` (which is "secret-ish" — contains project ref) leaks tenant identity. |
| 11 | `.husky/pre-commit` | UNKNOWN | Not read in this audit; pre-commit secret-scan presence not confirmed. |
| 12 | `next.config.ts` | INFO | No secrets in build config. |
| 13 | Plaintext at rest | HIGH | Secrets ride in Cloudflare Workers Secrets (encrypted by Cloudflare) + GitHub Actions secrets (encrypted). No HSM. Acceptable for SOC2 if encryption-at-rest documented. |
| 14 | Break-glass access | INFO | Cloudflare dashboard MFA is org-controlled, not asserted in IaC. |
| 15 | `wrangler.jsonc:194-200` | HIGH | OTEL Bearer interpolated as `Bearer ${OTEL_AUTH_TOKEN}` — if `OTEL_AUTH_TOKEN` is unset, the literal string `Bearer ` is sent; if unset and OTEL endpoint is misconfigured, traces (which may include PII headers) ship unauthenticated. |

---

## [A39] Network segmentation

**Mostly N/A** — no AWS/GCP VPC; runtime is Cloudflare Workers (multi-tenant edge isolate). Findings limited to what does exist:

| # | File:Line | Severity | Finding |
|---|---|---|---|
| 1 | `wrangler.jsonc:8` | INFO | `compatibility_flags: ["global_fetch_strictly_public"]` — Worker `fetch()` blocks RFC 1918, link-local, loopback, and metadata IPs. Strong baseline. |
| 2 | Egress filtering | MED | No outbound allowlist of FQDNs. Workers can `fetch()` any public host. SSRF vectors mitigated only at app layer (`app/api/track/click/route.ts:168-221`, `lib/admin-url-guard.ts`). Compromised dependency / NPM-supply-chain attack can call any C2. |
| 3 | DNS exfiltration | LOW | Workers DNS resolution goes through Cloudflare — observable but not blockable in this repo. |
| 4 | Subnet tiers / SGs / NACLs / TGW / peering | N/A | No VPC. |
| 5 | Supabase | UNKNOWN | Supabase project network restrictions (IP allow-list, PG-bouncer, JWT-only) not visible in repo. Hostile: Supabase REST should restrict by IP / use signed URLs only. |

---

## [A40] Per service

| # | File:Line | Severity | Finding |
|---|---|---|---|
| 1 | `terraform/cloudflare/alerts.tf:80-104` | HIGH | 5xx burn-rate alert exists but `alerts_enabled=false` default — silently off. |
| 2 | `terraform/cloudflare/alerts.tf:106-130` | HIGH | CPU-time alert same. |
| 3 | `terraform/cloudflare/sentry-alerts.tf` | UNKNOWN | Referenced but not read in this audit; Sentry alerting may compensate for the disabled CF alerts. |
| 4 | `wrangler.jsonc:188-190` | INFO | `observability.enabled=true` — Workers logs in CF dashboard. |
| 5 | `wrangler.jsonc:194-200` | INFO | OTEL configured. |
| 6 | `wrangler.jsonc:252` | HIGH | `tail_consumers=[]` — no durable log shipping by default. |
| 7 | Dashboards | UNKNOWN | No dashboards-as-code. Grafana dashboards / Datadog dashboards not in repo. |
| 8 | SLOs | INFO | Alert names mention "5% over 5-minute window" and CPU-limit hit rate — implicit SLOs. No formal SLO file. |
| 9 | Error budgets | NONE | No error-budget tracking declared. |
| 10 | Runbook | INFO | `terraform/cloudflare/main.tf:368-381` documents Tier-1 DR runbook in comments. No docs/runbooks/* directory audited. |
| 11 | Chaos test | NONE | No chaos-engineering scripts / GameDay automation in repo. |
| 12 | DR plan with tested RTO/RPO | HIGH | Tier-1 DR via Cloudflare Pages static fallback documented (`main.tf:355-381`) — implementation behind paid plan, currently commented out (`main.tf:408-441`). **No tested RTO/RPO numbers**. |
| 13 | `app/api/health/route.ts` | INFO | Health endpoint exists. |

---

## [A41] Observability privacy

| # | File:Line | Severity | Finding |
|---|---|---|---|
| 1 | `app/api/csp-report/route.ts:48-59` | INFO | CSP report PII scrubbing — strips query strings/fragments from `document_url` and `referrer`. Strong. |
| 2 | `app/api/track/click/route.ts:223-233` | INFO | Referrer sanitization (strip query/fragment). Good. |
| 3 | `terraform/cloudflare/main.tf:320-324` | MED | Logpush field set includes `Logs` and `Exceptions` — these can contain user-supplied payload echoes (URLs, headers). No documented PII scrubber on the sink side. |
| 4 | `lib/logger.ts` | UNKNOWN | Not read; cannot confirm PII scrubbing in `logger.error/info` calls that ride Workers Trace Events. Hostile assumption: `logger.error("...", { email })` calls (e.g. `app/api/auth/forgot-password/route.ts:101-103`, `app/api/cron/price-scrape/route.ts:163-166`) ship PII to logs. |
| 5 | `app/api/cron/price-scrape/route.ts:186-193` | HIGH | `logger.info("Price alert triggered", { email: alert.email, ... })` — logs raw user email per alert. PII in logs without scrubbing. |
| 6 | `app/api/auth/forgot-password/route.ts:101-103` | MED | `captureException(updateError, { ... })` — DB error may include user id / email. |
| 7 | OTEL trace redaction | UNKNOWN | No span attribute filter declared. URL paths with secrets / tokens (e.g. password-reset link) potentially captured. |
| 8 | Metric cardinality | MED | No explicit cap on `site_id` / `email` cardinality in metric labels. |
| 9 | Retention | HIGH | No retention rule on R2 logs bucket. SOC2 / GDPR Art. 5(1)(e) violation risk. |

---

## [A42] Autoscaling

Cloudflare Workers scale automatically (per-isolate). Limited surface to audit:

| # | File:Line | Severity | Finding |
|---|---|---|---|
| 1 | Cost ceiling | HIGH | No `max_concurrency` / `max_invocations_per_minute` cap on the Worker. A runaway loop or DDoS-induced cron storm racks up unbounded Workers / KV-write / R2-write spend. |
| 2 | `wrangler.jsonc:100-116` | LOW | Queue consumer `max_batch_size=25, max_retries=3` — bounded. Good. |
| 3 | `wrangler.jsonc:165-179` | LOW | 6 cron triggers without jitter. Small herd. |
| 4 | `terraform/cloudflare/alerts.tf:106-130` | HIGH | CPU-time alert exists but disabled. Runaway script not paged. |
| 5 | Billing anomaly alert | NONE | No `cloudflare_billing_alert` declared. |
| 6 | Predictive scaling | N/A | Workers don't expose this. |
| 7 | Min/max workers | N/A | Workers run on demand. |
| 8 | Durable Objects | INFO | `RateLimiterDO` is single-threaded per ID. No declared shard count. Hot key concentration possible. |

---

## [A43] Cron / scheduled

| # | File:Line | Severity | Finding |
|---|---|---|---|
| 1 | `wrangler.jsonc:165-179` | INFO | 6 active crons, all UTC. |
| 2 | `app/api/cron/price-scrape/route.ts:51-53` | INFO | Per-trigger secret via `verifyCronAuth(...getCronAuthOptionsForPath(...))`. |
| 3 | `app/api/cron/price-scrape/route.ts:55-208` | MED | No idempotency token / dedup — if Cloudflare invokes the cron twice, snapshots double-write. `markAlertTriggered` is called per alert and assumed idempotent at the DAL layer (not verified). |
| 4 | `app/api/cron/price-scrape/route.ts:48-208` | MED | No locking. Concurrent invocations can race on `markAlertTriggered`. |
| 5 | `app/api/cron/price-scrape/route.ts:48-208` | MED | No max runtime / `AbortController` — Worker-imposed CPU time only. Long product lists at scale will time out partway. No checkpoint/resume. |
| 6 | `app/api/cron/price-scrape/route.ts:170-172` | LOW | If Resend returns non-OK, `continue` skips marking — alert retries on next cron run. Repeated failures = thunder runs. No backoff/cap. |
| 7 | Missed-run handling | MED | Cloudflare Crons does not retry missed runs. No "last-run" timestamp persistence to detect missed run windows. `recordCronLiveness("price-scrape")` (line 197) writes liveness; verify the alert on stale liveness exists. |
| 8 | Timezone | INFO | All UTC — explicit. |
| 9 | Alerting | UNKNOWN | `cron-liveness` mechanism present (`@/lib/cron-liveness`); whether it actually pages is not confirmed. |
| 10 | DLQ | N/A | Crons don't have queues. Failed crons need their own alert. |
| 11 | `wrangler.jsonc:167` | LOW | `*/5 * * * *` publish cron — if a publish job blocks > 5 min, multiple instances overlap (no locking). |

---

## [A44] Queue / event bus

| # | File:Line | Severity | Finding |
|---|---|---|---|
| 1 | `wrangler.jsonc:100-116` | INFO | Queue producer + consumer + DLQ wired. `max_retries=3`. |
| 2 | `wrangler.jsonc:107-114` | INFO | At-least-once delivery (Cloudflare Queues default). Documented. |
| 3 | Exactly-once | N/A | Cloudflare Queues are at-least-once; consumer must idempotency-token. Not asserted in IaC; verify in `workers/custom-worker.ts`. |
| 4 | Ordering | N/A | Queues are unordered. If click attribution requires ordering, this is a finding — not declared. |
| 5 | Poison handling | INFO | DLQ wired (`click-tracking-dlq`). |
| 6 | DLQ consumer | HIGH | `terraform/cloudflare/queues.tf:30-33` declares the DLQ but **no consumer / inspector / alert**. Poisoned messages accumulate silently forever. |
| 7 | Replay | NONE | No replay tooling declared. Recovery from DLQ is manual. |
| 8 | Encryption | INFO | Queues are encrypted at rest by Cloudflare. Not declared in IaC. |
| 9 | `app/api/track/click/route.ts:78-117` | INFO | KV cache uses HMAC integrity check (rejects unsigned payloads in production). Strong. |
| 10 | `app/api/membership/webhook/route.ts:88-93` | MED | Stripe webhook caps attempts at 3, then acks 200 to stop the loop and "in a full implementation, enqueue to an R2 NDJSON DLQ" — **TODO comment** reveals a missing DLQ. |

---

## [A45] Deploy

| # | File:Line | Severity | Finding |
|---|---|---|---|
| 1 | `.github/workflows/deploy.yml:128-302` | INFO | Pre-flight asserts bindings + secrets. |
| 2 | `.github/workflows/deploy.yml:478-544` | INFO | Staging Worker integration smoke. |
| 3 | `.github/workflows/deploy.yml:549-665` | INFO | DB migration with snapshot, apply, verify. |
| 4 | Blue-green / canary | HIGH | Cloudflare Workers Gradual Deployments (`wrangler versions deploy --x-versions`) NOT declared in deploy.yml visible portions. **All-at-once deploy** = failed deploy hits 100% of traffic. |
| 5 | Rollback triggers | MED | Manual via `wrangler rollback` (implicit). No automated rollback on 5xx burn. |
| 6 | Feature flags | UNKNOWN | `app/api/admin/feature-flags/route.ts` exists. Implementation not audited here. |
| 7 | Migration ordering | INFO | Migrations applied before deploy per `deploy.yml:549-665`. Forward-compatible only. |
| 8 | Dark launches | NONE | Not visible. |
| 9 | Kill switch | INFO | Maintenance mode (`middleware.ts:60-100`) — env var + KV flag. Strong. |
| 10 | `terraform/cloudflare/main.tf:408-441` | HIGH | DR failover is commented out. |

---

## [A46] Per endpoint

Per-endpoint breakdown is large (70+ routes). Sampled across hostile-everything categories below; A47–A52 cover specifics.

| # | File:Line | Severity | Finding |
|---|---|---|---|
| 1 | `app/api/products/[productId]/price-history/route.ts:8-33` | MED | Public GET. No rate limit, no auth, returns up to 365 days × N snapshots. **DoS by enumeration**. No cache headers — every request hits Supabase. |
| 2 | `app/api/products/[productId]/price-history/route.ts:14` | MED | `Math.min(Number(...), 365)` — `NaN` from `Number("foo")` becomes `NaN`, `Math.min(NaN, 365) === NaN`, then passed to `getPriceHistory`. Behaviour depends on DAL. |
| 3 | `app/api/products/[productId]/price-history/route.ts` | MED | No request schema validation (zod / valibot). `productId` passed raw to DAL. |
| 4 | `app/api/products/[productId]/price-history/route.ts:30-31` | LOW | Catch-all error swallows specifics — but also swallows distinguishing "not found" vs "infra error". Consistent with intentional info-hiding. |
| 5 | `app/api/admin/sites/[id]/route.ts:27-42` | INFO | GET — admin guard, rate limit. No `If-None-Match` / ETag. |
| 6 | `app/api/admin/sites/[id]/route.ts:45-140` | INFO | PUT — super_admin only, allowedFields whitelist (lines 68-87) prevents mass assignment. Strong. |
| 7 | `app/api/admin/sites/[id]/route.ts:143-191` | INFO | DELETE — step-up auth required. Strong. |
| 8 | `app/api/auth/login/route.ts:41-223` | INFO | IP + email rate limit, fail-closed; 2FA enforcement; httpOnly+SameSite=strict cookies. Strong. |
| 9 | `app/api/membership/checkout/route.ts:34-140` | MED | Tier validated against env-var allowlist (good). `customer_email: body.email` taken raw — bound to Stripe customer; an attacker can checkout on behalf of any email ⇒ harassment / phishing vector if welcome emails flow. |
| 10 | `app/api/membership/checkout/route.ts:103` | MED | `appUrl = process.env.APP_URL || \`https://${request.headers.get("host")}\`` — host-header-driven absolute URLs. With Cloudflare-validated Host this is safe; in misconfigured deploys, this is a header-injection vector. |
| 11 | `app/api/membership/webhook/route.ts:1` | INFO | `runtime = "edge"` — explicit. |
| 12 | `app/api/membership/webhook/route.ts:30-52` | INFO | Stripe webhook signature verification first; rejects on missing/invalid. Good. |
| 13 | `app/api/membership/webhook/route.ts:88-93` | MED | After 3 failed processing attempts, acks 200 with `dlq: true` but NO actual DLQ write. Comment explicitly says "In a full implementation, enqueue to an R2 NDJSON DLQ here" — Stripe events silently drop. |
| 14 | `app/api/auth/forgot-password/route.ts:21-156` | INFO | Rate-limited, fail-closed, user-enumeration-safe (always returns 200). Token hashed at rest. Tenant-aware reset URL (G-22). Strong. |
| 15 | `app/api/auth/forgot-password/route.ts:107` | LOW | `resetUrl` carries the raw token in query string — this is standard but the URL will appear in Resend logs and email client referrer chains until clicked. |
| 16 | `app/api/auth/csrf/route.ts:6-22` | INFO | CSRF token issuance with httpOnly, secure, sameSite=strict, 4h expiry. |
| 17 | `app/api/cron/price-scrape/route.ts:48-208` | MED | Returns `200` with full counts on success — fine — but failure path `500` reveals "Price scrape failed" without details (good). Internal `logger.error` may include stack in observability. |
| 18 | Versioning | MED | None of the public APIs are versioned (`/api/v1/...`). Breaking changes require client coordination. |
| 19 | Pagination | MED | `getPriceHistory` (#1) has no pagination cursor — caps at `days` window only. |
| 20 | Idempotency keys | MED | No `Idempotency-Key` header support on POST routes (membership checkout, admin create). Replays produce duplicate Stripe sessions / admin users (DB unique constraints partially mitigate). |
| 21 | Response schema | LOW | No OpenAPI / contract tests visible. Drift risk between docs and reality. |
| 22 | Error codes | LOW | Error JSON sometimes `{ error }`, sometimes `{ error, code }` (e.g. `middleware.ts:111-117` `PAYLOAD_TOO_LARGE`). Inconsistent. |

---

## [A47] IDOR per endpoint

| # | File:Line | Severity | Finding |
|---|---|---|---|
| 1 | `app/api/products/[productId]/price-history/route.ts:12-17` | MED | `productId` from URL passed straight to `getPriceHistory(productId, ...)`. No site-scoping. A product UUID belonging to tenant A is queryable from tenant B's hostname. **Cross-tenant info leak**. Hostile: enumerate UUIDs to map competitor catalogs. |
| 2 | `app/api/admin/sites/[id]/route.ts:35-39` | MED | `id` from URL, `getSiteRowById(id)`. Admin guard ensures the caller is some admin, but the call is privileged enough to view ANY site row regardless of which tenant the admin belongs to. (Multi-tenant admin model — verify.) |
| 3 | `app/api/admin/sites/[id]/route.ts:44-140` | MED | PUT with super_admin role check — same cross-tenant concern. A super_admin of site A can edit site B if super_admin is global. Verify role scope. |
| 4 | `app/api/admin/sites/[id]/route.ts:143-191` | HIGH | DELETE — same. A super_admin compromise can delete any site, no tenant scoping. Step-up auth required (good) but doesn't constrain target tenant. |
| 5 | `app/api/membership/checkout/route.ts:98-101` | LOW | `getActiveMembership(body.email, siteId)` — checks if the email already has membership on THIS site. An attacker can probe site-by-site to enumerate paying members (existence oracle). |
| 6 | `app/api/auth/forgot-password/route.ts:53-56` | INFO | `getAdminUserByEmail(email)` — cross-site lookup by email; rate-limited; fixed-time response (returns successResponse regardless). Good IDOR-safe pattern. |
| 7 | Tested IDs (low-priv user vs other tenant) | UNKNOWN | No automated IDOR tests visible. CI has DAL site-scoping audit (`ci.yml:68-95`) but doesn't probe runtime endpoints. |
| 8 | Negative IDs / UUID v0 / string-vs-int | MED | `productId` is a string UUID but no format validation. Calling with `00000000-0000-0000-0000-000000000000` is accepted; behaviour depends on DAL. |
| 9 | Very large IDs | INFO | UUIDs aren't sized; ints aren't used. |
| 10 | Deleted IDs | UNKNOWN | Soft-delete vs hard-delete behaviour not verified. |

---

## [A48] Mass assignment / over-posting

| # | File:Line | Severity | Finding |
|---|---|---|---|
| 1 | `app/api/admin/sites/[id]/route.ts:68-94` | INFO | `allowedFields` array enumerates writable columns. Body iterated only for those keys. **Strong allowlist pattern**. |
| 2 | `app/api/admin/users/route.ts:70-108` | MED | POST destructures `{ email, password, name, role }` — `role` is taken from body. `validRoles` allowlist enforced (line 98), but the role value `super_admin` is in the allowlist for body-driven creation by any super_admin caller. Privilege escalation by lateral super_admin attacker. |
| 3 | `app/api/admin/users/route.ts:143-177` | INFO | PATCH guards demoting last super_admin (lines 156-161). Good. Body-driven `role` update permitted for super_admin caller (line 175) — same lateral risk as #2. |
| 4 | `app/api/membership/checkout/route.ts:51-90` | INFO | Body has only `{ email, tier, turnstileToken }`. `priceId` derived server-side. `customer_email` written from body but no role/balance fields. Safe. |
| 5 | `app/api/auth/login/route.ts` | INFO | Per inventory, login takes `{ email, password, totp }` only. No role / isVerified body fields exposed. |
| 6 | `app/api/admin/products/import/route.ts:53-168` | INFO | Per inventory, CSV header validation + per-row validation. Verify `is_admin` / `featured` columns are not honoured from CSV. (Not directly verified in this audit.) |
| 7 | `app/api/membership/webhook/route.ts:54-68` | INFO | Stripe-driven side-effects (`processStripeEvent`) — body is the verified Stripe event JSON, not user-controllable. |
| 8 | `app/(public)/...` | UNKNOWN | Public form routes (newsletter, etc.) not exhaustively audited; spot-check confirms no role/balance fields. |

---

## [A49] CORS

| # | File:Line | Severity | Finding |
|---|---|---|---|
| 1 | `middleware.ts:25-32` | INFO | `CORS_ALLOWED_METHODS = "GET, POST, OPTIONS"`. Methods are explicit. |
| 2 | `middleware.ts:140-193` | INFO | Preflight rejects unknown origins with 403. |
| 3 | `middleware.ts:174-176, 178-180` | INFO | Origin must `includes(requestOrigin)` against `getAllowedOrigins(...)` — exact-match string compare. No reflection. |
| 4 | `middleware.ts:183-191` | INFO | `Access-Control-Allow-Origin` set to matched origin only; `Vary: Origin` set. Strong. |
| 5 | `middleware.ts:188` | INFO | `Access-Control-Allow-Credentials: true` — required for cookie auth. |
| 6 | `middleware.ts:189` | LOW | `Access-Control-Max-Age: 3600` (1h) — reasonable. |
| 7 | `lib/security/allowed-origins.ts:49-71` | INFO | Allowlist built from static `allSites` + verifiedSiteRef; localhost only when `NODE_ENV==="development"`. |
| 8 | `lib/security/allowed-origins.ts:131-140` | INFO | `isOriginAllowed` — exact lowercase compare with trailing-slash strip. No null-origin acceptance. Strong. |
| 9 | `middleware.ts:515-527` | INFO | Response CORS headers reflect only allowlisted origins; `Vary: Origin` appended. |
| 10 | `docker/kong.yml:23-25` | LOW | Kong CORS for **local Supabase only** allows `localhost:3000`/`localhost:3001`. Local-only — fine. |
| 11 | `docker/kong.yml:39` | LOW | Local Kong sets `credentials=true` with localhost origins — local only, low risk. |
| 12 | `lib/security/allowed-origins.ts:67-69` | LOW | Dev localhost included only when `NODE_ENV !== "production"`. If `NODE_ENV` ever fails to be `"production"` in prod (Workers default propagation issue addressed in `lib/cookie-utils.ts:8-18`), localhost is added. **Potential bypass** if env misconfigured — `cookie-utils.ts` throws to catch this; verify it's reachable on every request. |

---

## [A50] SSRF

| # | File:Line | Severity | Finding |
|---|---|---|---|
| 1 | `wrangler.jsonc:8` | INFO | `global_fetch_strictly_public` — Worker `fetch` blocks RFC1918 / link-local / metadata IPs. Strong baseline. |
| 2 | `app/api/track/click/route.ts:168-178` | INFO | Scheme allowlist (`http:`/`https:`) — rejects `javascript:`/`data:`. |
| 3 | `app/api/track/click/route.ts:180-221` | INFO | Affiliate domain allowlist with strict/warn modes. Good. |
| 4 | `app/api/admin/sites/[id]/route.ts:100-108` | INFO | `validateAdminUrlFields` — SSRF-aware validation of `logo_url`/`favicon_url`/`og_image_url`. |
| 5 | `app/api/admin/products/import/route.ts:73-168` | INFO | Per inventory: SSRF-aware URL validation per row. |
| 6 | `app/api/auth/forgot-password/route.ts:121-134` | LOW | `fetch("https://api.resend.com/emails", ...)` — fixed FQDN. No SSRF. |
| 7 | `app/api/membership/checkout/route.ts:106-124` | LOW | `fetch("https://api.stripe.com/...")` — fixed FQDN. No SSRF. |
| 8 | `app/api/cron/price-scrape/route.ts:146-159` | LOW | `fetch("https://api.resend.com/emails", ...)` — fixed FQDN. |
| 9 | `app/api/cron/price-scrape/route.ts:156` | MED | Email body interpolates `productUrl` (built from site-resolved domain) into HTML with manual escapes (lines 135-139). Good but reinventing `escape`; one missed `'` could break template. |
| 10 | OAuth callbacks | UNKNOWN | No OAuth integration visible in this slice; if any exists, callback URL allowlist must be audited separately. |
| 11 | PDF gens / image proxies / link previews | NONE | Not present in repo. |
| 12 | Webhooks (outbound) | UNKNOWN | Outbound webhook configuration to user-supplied URLs not seen. If `app/api/admin/integrations/route.ts` allows arbitrary outbound webhooks, that is an SSRF surface. |
| 13 | `app/api/health/route.ts` | UNKNOWN | Health endpoint — verify it doesn't `fetch()` user-supplied URLs. |
| 14 | DNS rebinding | LOW | Workers re-resolve DNS per fetch; combined with `global_fetch_strictly_public` mitigates rebind. |

---

## [A51] Rate limit

| # | File:Line | Severity | Finding |
|---|---|---|---|
| 1 | `terraform/cloudflare/main.tf:194-206` | MED | Edge rate limit on `/api/auth/*` only, 20 req/60s, mitigation 300s. Characteristics include `cf.colo.id` ⇒ multiplied by colo count. |
| 2 | `app/api/auth/login/route.ts:28-39` | INFO | App-level: 3/15min per IP, 10/15min per email, both fail-closed. Strong. |
| 3 | `app/api/auth/forgot-password/route.ts:27-31` | INFO | 3/15min per IP, fail-closed. |
| 4 | `app/api/membership/checkout/route.ts:39-43` | INFO | 5/hour per IP, fail-closed. |
| 5 | `app/api/track/click/route.ts:27-31` | LOW | 60/min per IP, fail-policy "grace" (allows on RL infra failure). Click endpoint = revenue path; grace is by design but means an outage = unbounded click traffic. |
| 6 | `app/api/csp-report/route.ts:10` | INFO | 60/min per IP. |
| 7 | `app/api/admin/sites/[id]/route.ts:12, 14-24` | INFO | 100/min per admin (email||userId), exposed via `Retry-After` header. |
| 8 | Distributed counter correctness | INFO | `RATE_LIMITER_DO` Durable Object (`wrangler.jsonc:69-74`, `workers/rate-limiter-do.ts`) — single-threaded per key, atomic. Strong. |
| 9 | X-Forwarded-For bypass | INFO | `lib/get-client-ip.ts` (per ci.yml:218-243 raw IP header parsing check) — should use `cf-connecting-ip` only. CI guards this. Strong. |
| 10 | Per-key / per-API-key | UNKNOWN | No API-key model visible (cron secrets are bearer-token; no rate limit per cron secret). |
| 11 | Global cap | NONE | No global request cap. A botnet swarm can saturate Worker concurrency limit (Cloudflare's, not declared). |
| 12 | Token vs leaky bucket | INFO | Sliding window per implementation. Acceptable. |
| 13 | `middleware.ts:244-276` | INFO | Hostname-resolution rate limit 30/min per IP, fail-closed. |
| 14 | `middleware.ts:286-289` | INFO | LRU cap on unknown hostnames (1s window) — DoS protection on DB lookup. |

---

## [A52] File upload

| # | File:Line | Severity | Finding |
|---|---|---|---|
| 1 | `app/api/admin/upload/route.ts:15-21` | INFO | Allowlist: JPEG/PNG/WebP/GIF/AVIF. SVG explicitly excluded. |
| 2 | `app/api/admin/upload/route.ts:60-65` | INFO | `contentType` validated against allowlist. |
| 3 | `app/api/admin/upload/route.ts:66-79` | INFO | `fileSize` validated; capped at `R2_MAX_UPLOAD_BYTES`. |
| 4 | `app/api/admin/upload/route.ts:55` | INFO | `sanitizeOriginalName(bodyOrError.fileName)` — filename sanitized. |
| 5 | `app/api/admin/upload/route.ts:30-33` | INFO | Both `Content-Type` AND `Content-Length` signed into presigned URL (R2-side enforcement). |
| 6 | `app/api/admin/upload/finalize/route.ts` | INFO | Per inventory comments: magic-byte validation occurs in finalize. **Verify**: the upload route only accepts MIME from the body — without the finalize magic-byte check, a polyglot upload is possible. |
| 7 | AV scan | NONE | No virus scanning declared (ClamAV / Cloudflare R2 integration). Hostile assumption: malware uploads stored. |
| 8 | Separate domain | UNKNOWN | `R2_PUBLIC_URL` is the public delivery host. Whether it is a separate cookie-isolated domain is operator-controlled. If served from `*.wristnerd.xyz`, cookies leak to user-content domain. |
| 9 | Image re-encode | NONE | No server-side re-encode (e.g. via Cloudflare Images / sharp). Original bytes served. EXIF metadata + steganographic payloads survive. |
| 10 | Content-Disposition | UNKNOWN | Not asserted on R2 objects in this view. Default `inline` ⇒ a polyglot HTML file (if magic-byte gate slips) renders. |
| 11 | No execution | INFO | R2 doesn't execute. Fine. |
| 12 | `app/api/admin/products/import/route.ts:14-23` | INFO | CSV import: 5MB / 50k rows cap; Content-Length pre-check. Strong. |

---

## [A53] CSRF

| # | File:Line | Severity | Finding |
|---|---|---|---|
| 1 | `lib/csrf.ts:21-25` | INFO | 32-byte CSPRNG token. |
| 2 | `lib/csrf.ts:28-64` | INFO | Timing-safe compare with anti-optimiser pad on length mismatch. Strong. |
| 3 | `app/api/auth/csrf/route.ts:14-20` | INFO | Cookie: httpOnly, secure (env-driven), sameSite=strict, path=/, maxAge=4h. Strong. |
| 4 | `middleware.ts:407-436` | INFO | Origin allowlist + double-submit token check on every non-safe API method, except documented exempt set. |
| 5 | `middleware.ts:427` | LOW | `csrfExemptPaths()` set + cron prefix bypass. Each exempt route must enforce its own anti-CSRF (e.g. Stripe signature). Verify per-route. |
| 6 | `middleware.ts:408` | INFO | SAFE_METHODS = GET/HEAD/OPTIONS. No state-changing GETs allowed in CSRF policy. App-side: confirm no GET endpoints mutate state. |
| 7 | `middleware.ts:536-537` | LOW | "Removed CSRF token rotation on state-changing requests to support concurrent POST". The token persists for its 4h lifetime; if token leaks via XSS-adjacent vector, 4h window. |
| 8 | `app/api/auth/csrf/route.ts:14-20` | INFO | sameSite=strict — cross-site cookie not sent. Belt-and-suspenders with origin check. |
| 9 | `app/api/membership/webhook/route.ts` | INFO | Stripe webhook is CSRF-exempt by signature verification. Good. |

---

## [A54] Cookies

| # | File:Line | Severity | Finding |
|---|---|---|---|
| 1 | `app/api/auth/csrf/route.ts:14-20` | INFO | `__csrf` cookie: httpOnly=true, secure=env-driven, sameSite=strict, path=/, maxAge=4h. **No `__Host-` prefix** — recommend rename to `__Host-csrf` to forbid Domain attribute and lock to current host. |
| 2 | `lib/csrf.ts:16` | INFO | `CSRF_COOKIE = "__csrf"`. |
| 3 | `app/api/auth/login/route.ts:188-194` | INFO | Per inventory: httpOnly=true, secure=true, sameSite=strict, maxAge=8h. **No prefix**. |
| 4 | `lib/cookie-utils.ts:8-18` | INFO | Hard-fail if Workers runtime detected with NODE_ENV != production. Strong. |
| 5 | `lib/cookie-utils.ts:24` | INFO | `IS_SECURE_COOKIE = NODE_ENV === "production"`. |
| 6 | Domain attribute | INFO | Cookies set via NextResponse default to current host (no Domain). Good. |
| 7 | `__Host-` / `__Secure-` prefixes | LOW | None used. SOC2 hardening recommends `__Host-` for session/CSRF. |
| 8 | Path | INFO | `/` — broad. Fine. |
| 9 | Expires | INFO | maxAge based; no Expires fallback. Fine. |
| 10 | Cookies on subdomains | LOW | If site-A and site-B share `*.wristnerd.xyz` and any cookie is ever set with `Domain=.wristnerd.xyz`, cookies cross sites. Not done in this code, but worth a CI guard. |

---

## [A55] CSP

| # | File:Line | Severity | Finding |
|---|---|---|---|
| 1 | `lib/csp.ts:101-126` | INFO | Per-request nonce; `script-src 'self' 'nonce-X' 'strict-dynamic'`; `style-src 'self' 'nonce-X'`; **no unsafe-inline / unsafe-eval**. Strong. |
| 2 | `lib/csp.ts:107` | INFO | `'strict-dynamic'` allows nonced bootstrap to load further scripts. |
| 3 | `lib/csp.ts:114` | LOW | `frame-src https://challenges.cloudflare.com` — only Turnstile. Sandboxed-ad iframes use `srcDoc` (`sandboxed-ad.tsx:89`), which counts under `frame-src`. Verify Turnstile-only is intended; otherwise add Sandboxed-Ad source or `frame-src 'self'`. |
| 4 | `lib/csp.ts:117` | INFO | `object-src 'none'` — Flash/applet kill. |
| 5 | `lib/csp.ts:118` | INFO | `base-uri 'self'`. |
| 6 | `lib/csp.ts:119` | INFO | `form-action 'self'`. |
| 7 | `lib/csp.ts:120` | INFO | `frame-ancestors 'none'` — clickjacking-proof. |
| 8 | `lib/csp.ts:122-125` | INFO | `report-uri /api/csp-report` AND `report-to default`. |
| 9 | `lib/csp.ts:90-95` | MED | `img-src` includes `https://images.unsplash.com`, `https://m.media-amazon.com`, `https://images-na.ssl-images-amazon.com`, `https://www.google.com`. **Amazon CDN** is an open image host — any third-party image (potentially user-attribution bug) loads. Documented as legacy until R2 ingest migration (`lib/csp.ts:84-86`). |
| 10 | `lib/csp.ts:99` | LOW | `connect-src ... https://*.ingest.sentry.io` — wildcard subdomain on Sentry. Sentry uses subdomain per project; unavoidable but worth documenting. |
| 11 | `lib/csp.ts:78-128` | INFO | Wildcard hosts removed from Supabase / R2 (G-03/G-04). Pinned exact subdomains. |
| 12 | `middleware.ts:451-462, 529-534` | INFO | CSP set on both request and response headers; only for non-API routes. |
| 13 | `next.config.ts:62-74` | INFO | Static fallback CSP removed; relies entirely on middleware. |
| 14 | `app/(public)/components/sandboxed-ad.tsx:39-70` | LOW | Iframe `srcDoc` contains an inline `<script>` and inline `<style>`. It's inside a sandboxed iframe (no allow-same-origin) so it has its own CSP context (effectively none, opaque origin). Safe by sandbox isolation, not by CSP. |
| 15 | `app/(public)/components/json-ld.tsx:29` | INFO | Inline JSON-LD `<script type="application/ld+json">` carries the per-request nonce (assumed via parent flow). Verify nonce wiring through to component. |

---

## [A56] Security headers

| # | File:Line | Severity | Finding |
|---|---|---|---|
| 1 | `next.config.ts:58-61` | INFO | `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`. ≥31536000 ✓, includeSubDomains ✓, preload ✓. |
| 2 | `terraform/cloudflare/main.tf:164-177` | INFO | Zone-level HSTS mirrors. |
| 3 | `next.config.ts:50` | INFO | `X-Frame-Options: DENY`. Belt-and-suspenders with CSP frame-ancestors. |
| 4 | `next.config.ts:51` | INFO | `X-Content-Type-Options: nosniff`. |
| 5 | `next.config.ts:52` | INFO | `Referrer-Policy: strict-origin-when-cross-origin`. |
| 6 | `next.config.ts:54-57` | INFO | `Permissions-Policy: camera=(), microphone=(), geolocation=(), interest-cohort=()`. Note: middleware adds more (`payment=()`, `usb=()`, `magnetometer=()`, `gyroscope=()`, `accelerometer=()`) at `middleware.ts:477-480`. **Two different policies on different routes.** |
| 7 | `middleware.ts:476-482` | INFO | Same set on every middleware-handled response. |
| 8 | `next.config.ts:62-72` | LOW | Static fallback CSP removed — middleware-only. Excluded routes (`_next/static`, `favicon.ico`, `fonts/`, `api/internal/`) don't get CSP. Static assets are opaque so OK; but if any HTML slips through the matcher, no CSP. |
| 9 | `middleware.ts:573-585` | INFO | Matcher excludes the same paths as above. Consistent. |
| 10 | `middleware.ts:486-489` | INFO | `Cache-Control: private, no-store, max-age=0; Pragma: no-cache` on `/api/admin/*`. Strong. |
| 11 | Cross-Origin-Opener-Policy / COEP / CORP | LOW | **Not set**. `same-origin-allow-popups` for COOP would harden against tabnabbing / Spectre. Worth adding. |
| 12 | `Server` / `X-Powered-By` | UNKNOWN | Cloudflare strips most. Next.js by default sets `X-Powered-By: Next.js` — verify `poweredByHeader: false` in `next.config.ts` (not visible in current file slice). |

---

## [A57] GraphQL

**N/A** — no GraphQL implementation in the repo. REST only. Verified via filename glob (no `*.graphql`, no `apollo`, no `graphql-yoga`, no `mercurius`).

---

## [A58] Frontend untrusted-data-to-DOM

| # | File:Line | Severity | Finding |
|---|---|---|---|
| 1 | `app/(public)/p/[pageSlug]/page.tsx:375` | LOW | `dangerouslySetInnerHTML={{ __html: sanitizeHtml(page.body) }}` — sanitized. Verify `sanitizeHtml` uses DOMPurify or equivalent server-side. |
| 2 | `app/(public)/components/html-renderer.tsx:22` | LOW | `dangerouslySetInnerHTML={{ __html: sanitized }}` — sanitized upstream. Same verification. |
| 3 | `app/(public)/components/json-ld.tsx:29` | INFO | `dangerouslySetInnerHTML={{ __html: safeJsonLdString(data) }}` — JSON-LD with explicit serializer. Carries CSP nonce. |
| 4 | `app/admin/(dashboard)/content/content-form.tsx:667` | LOW | `dangerouslySetInnerHTML={{ __html: sanitizeHtml(content.body_previous) }}` — admin-side preview, sanitized. Admin-only attack surface. |
| 5 | `app/admin/(dashboard)/ai-content/ai-content-manager.tsx:347` | LOW | `dangerouslySetInnerHTML={{ __html: sanitizeHtml(draft.body) }}` — AI-generated content, sanitized. Hostile assumption: AI returns prompt-injected HTML; sanitizer must strip script/event handlers. |
| 6 | `lib/sanitize.ts` (or equivalent) | UNKNOWN | Not read in this audit. Verify allowlist (no `<iframe>`, no `on*` attrs, no `javascript:` URLs, no `<style>` with `expression()`). |
| 7 | `cron-price-scrape:156` | INFO | Manual escape (`&amp;`/`&lt;`/`&gt;`/`&quot;`) for email HTML. Acceptable but reinventing — one missed `'` opens injection. |

---

## [A59] Client route guards mirrored server-side

| # | File:Line | Severity | Finding |
|---|---|---|---|
| 1 | `middleware.ts:407-436` | INFO | Server-side CSRF + Origin enforcement on every state-changing API call. |
| 2 | `app/api/admin/sites/[id]/route.ts:28-30, 46-48, 51-52, 147-149, 152-153` | INFO | Every admin route revalidates `requireAdmin()` + `assertRole()`. Server-authoritative. |
| 3 | `app/api/admin/users/route.ts:39-40, 62-63, 131-132, 214-215` | INFO | Same pattern. |
| 4 | `app/api/admin/upload/route.ts:39` | INFO | `withAuthz("upload","create",...)` wrapper. |
| 5 | Admin client routes (`app/admin/(dashboard)/...`) | UNKNOWN | Not read here. CI test `ci.yml:68-95` audits "Admin route authz enforcement" — confirms server-side checks. |
| 6 | `app/api/products/[productId]/price-history/route.ts:8-33` | LOW | Public endpoint, no guard. Documented public. Verify no client-side guard alone gates this for "private products". |
| 7 | `app/(public)/...` pages | LOW | Public pages don't need guards. If any "members-only" content gates only on client (e.g. hide-paywall via JS), the underlying API call must enforce. Membership API (`app/api/membership/...`) appears server-enforced. |

---

## [A60] Third-party scripts

| # | File:Line | Severity | Finding |
|---|---|---|---|
| 1 | `app/(public)/components/sandboxed-ad.tsx:25-104` | INFO | Third-party ad code rendered inside `<iframe sandbox>` with srcdoc. No `allow-same-origin`. Ad context cannot read parent cookies / DOM. Strong. |
| 2 | `app/(public)/components/sandboxed-ad.tsx:31-34` | INFO | Provider-aware sandbox flags: known ads get `allow-scripts allow-popups allow-popups-to-escape-sandbox`; custom ads get only `allow-popups`. Reasonable. |
| 3 | `app/(public)/components/sandboxed-ad.tsx:34, 33` | LOW | `allow-popups-to-escape-sandbox` lets the ad open a new tab into a non-sandboxed context. Tabnabbing risk; partially mitigated by `<base target="_blank">` (line 42). Recommend `rel="noopener noreferrer"` (irrelevant to base target — but new windows opened by JS need it; cannot enforce inside the sandboxed ad). |
| 4 | `app/(public)/components/sandboxed-ad.tsx:58` | LOW | `window.parent.postMessage({ type: '__ad_resize', height: h }, '*')` — wildcard target origin. Acceptable because the sandbox is opaque-origin and can only target its parent window — but accept the message in parent (line 73-81) checks `event.source === iframeRef.current?.contentWindow` (good) and `event.data.type` (good). Strong. |
| 5 | SRI hashes | NONE | No `<script integrity=...>` or `<link integrity=...>` declared. Third-party scripts (Turnstile, Sentry SDK) load without SRI. |
| 6 | Turnstile | INFO | `https://challenges.cloudflare.com` allowed in `script-src` and `frame-src` (`lib/csp.ts:107, 114`). No SRI. |
| 7 | Sentry | INFO | `https://*.ingest.sentry.io` in `connect-src` (`lib/csp.ts:99`). |
| 8 | Consent gating | UNKNOWN | No cookie-consent banner / IAB TCF integration declared. If the app serves EU traffic (likely — Arabic / multilingual subdomains), missing consent before ads load is a GDPR finding. |
| 9 | Data leakage via ads | MED | Ad iframes can `fetch()` to advertiser servers within the sandboxed origin. Document.referrer, page URL passed via parent navigation events (none observed) — controlled. |
| 10 | `app/api/admin/ads/route.ts:62-68` | INFO | Comment confirms ad iframes have no `allow-same-origin`. |
| 11 | `Permissions-Policy` (`next.config.ts:54-57`, `middleware.ts:477-480`) | INFO | `interest-cohort=()` opt-out — strong. |

---

## Audits not applicable

- **A32 (Dockerfile)** — repo has no Dockerfile (only `docker-compose.yml` for local Supabase dev). One tiny note table provided above for the dev-only images.
- **A33 (Kubernetes)** — no K8s manifests anywhere in the repo. Workload runs on Cloudflare Workers.
- **A57 (GraphQL)** — no GraphQL endpoint or library. REST only.
- **A39 (VPC / SGs / NACLs / TGW / peering / PrivateLink / DNS exfil)** — mostly N/A; runs on Cloudflare edge. Partial findings under "Egress filtering" included.

## High-level summary of must-fix items

1. **DR is non-functional** — `terraform/cloudflare/main.tf:408-441` LB commented out; A40#12, A45#10.
2. **Alerts are off by default** — `terraform/cloudflare/alerts.tf:58-64`; A40#1-2, A42#4.
3. **Logs persisted indefinitely / no shipping by default** — `wrangler.jsonc:252`, `terraform/cloudflare/storage.tf:84-88`; A37#3, A41#9.
4. **Stripe webhook DLQ is a TODO** — `app/api/membership/webhook/route.ts:88-93`; A44#10, A46#13.
5. **Click DLQ has no consumer / alert** — `terraform/cloudflare/queues.tf:30-33`; A44#6.
6. **Cross-tenant leakage on price-history endpoint** — `app/api/products/[productId]/price-history/route.ts:12-17`; A47#1.
7. **PII in cron logs** — `app/api/cron/price-scrape/route.ts:186-193`; A41#5.
8. **Single-reviewer branch protection** — `terraform/github/main.tf:88`; A34#25.
9. **Required status checks miss SBOM/attest/wrangler-dryrun** — `terraform/github/main.tf:77-82`; A34#20, A31#27.
10. **No deployment canary** — `.github/workflows/deploy.yml`; A45#4.
11. **No SRI on third-party scripts** — A60#5-6.
12. **No cost / billing-anomaly alarm** — A42#1, A42#5.
13. **R2 buckets lack lifecycle / object-lock / replication** — A37#2, A37#3, A37#9-10.
14. **`STRIPE_SECRET_KEY` rotation policy undocumented** — A38#6.
15. **Auth rate-limit characteristic includes `cf.colo.id`** — `terraform/cloudflare/main.tf:201`; A31#8, A36#10, A51#1.
