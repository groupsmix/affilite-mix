# Season 8 — CEO Cross-Cut Finishers Audit

**Repository:** `groupsmix/affilite-mix`  
**Branch:** `main`  
**Date:** 2026-05-29  
**Auditor:** Devin (CEO-level cross-cut role)  
**Scope:** Cross-cut audit across all 6 prior season reports (S1–S6e), comprising 5 CEO-level passes (A246–A250)

---

## Prior Season Severity Summary

| Season    | Report                | Critical | High   | Medium | Low     | Info     |
| --------- | --------------------- | -------- | ------ | ------ | ------- | -------- |
| S1        | Code & Data           | 0        | 0      | 2      | 6       | 80+      |
| S2        | Infra & API           | 0        | 0      | 0      | 12      | 85       |
| S3        | Privacy & Reliability | 0        | 0      | 15     | 28      | 12       |
| S4        | Quality & Paranoid    | 2        | 21     | 61     | 35      | 1        |
| S5        | AI / ML / LLM         | 0        | 0      | 1      | 9       | 1        |
| S6e       | Anti-Abuse & Fraud    | 0        | 0      | 4      | 14      | 36       |
| **Total** |                       | **2**    | **21** | **83** | **104** | **215+** |

The two Critical findings (A99-1 LRU eviction under 100× traffic, A100-1 defense-in-depth gap on login) both originate from Season 4's stress-test scenarios.

---

## [A246] CEO Walkthrough — Layer-by-Layer Risk Review

Walk every layer DNS → CDN → WAF → LB → API → Service → Cache → DB → Backups → Analytics → AI → Vendors. Per layer: top 3 risks, current controls, residual risk, top investment.

### 1. DNS

| #   | Risk                                 | Current Control                                                                                  | Evidence                                                                    | Residual Risk |
| --- | ------------------------------------ | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- | ------------- |
| 1   | DNS hijacking / cache poisoning      | Cloudflare-managed DNS with DNSSEC; Terraform IaC (`terraform/cloudflare/dns.tf`)                | S2:A31 — IaC-managed                                                        | Low           |
| 2   | Stale DNS records after decommission | Terraform plan audit in CI pipeline                                                              | S2:A34 — CI/CD hardening                                                    | Low           |
| 3   | Subdomain takeover                   | Wildcard subdomain rejection in middleware (`middleware.ts:94-110`); unknown-host negative cache | S1:A14 — input validation; `__tests__/wildcard-subdomain-rejection.test.ts` | Low           |

**Top Investment:** Automate DNS record reconciliation against active site registry to prevent stale CNAME orphans.

### 2. CDN / Edge

| #   | Risk                                 | Current Control                                                                        | Evidence         | Residual Risk                                                 |
| --- | ------------------------------------ | -------------------------------------------------------------------------------------- | ---------------- | ------------------------------------------------------------- |
| 1   | CDN cache poisoning (cross-tenant)   | Cache tags scoped by site UUID (`lib/cache-tags.ts`); ISR revalidation per-site        | S3:S3-038 ✅     | Low                                                           |
| 2   | Stale content after purge failure    | `revalidateTag()` with site-scoped tags; ISR `revalidate` TTL per page                 | S3:A75           | Medium — no stale-while-revalidate on origin overload (A99-7) |
| 3   | Edge compute CPU exhaustion at scale | Cloudflare Workers with 30s CPU limit; single-flight coalescing; rate limiting at edge | S3:A79, S4:A99-1 | High under 100× traffic                                       |

**Top Investment:** Configure `stale-while-revalidate` in Cloudflare cache rules to serve stale content during origin overload (addresses A99-7).

### 3. WAF / Rate Limiting

| #   | Risk                                                 | Current Control                                                         | Evidence             | Residual Risk                                               |
| --- | ---------------------------------------------------- | ----------------------------------------------------------------------- | -------------------- | ----------------------------------------------------------- |
| 1   | KV rate-limit race condition allowing burst bypass   | Durable Objects as primary; KV as fallback with documented grace window | S4:A96-1, A97, A98-1 | Medium — KV path is non-atomic; DO availability is critical |
| 2   | LRU eviction under DDoS (rate-limit amnesia)         | In-memory LRU with 10K cap; three-tier limiting (global/IP/email)       | S4:A99-1 (Critical)  | High at 100× traffic                                        |
| 3   | Turnstile CAPTCHA silently disabled if env var unset | `ENABLE_TURNSTILE` env var gating; warning log when disabled            | S6e:A153-07          | Medium — fail-open default                                  |

**Top Investment:** Switch in-memory fallback to a probabilistic counter (Count-Min Sketch) or increase LRU cap dynamically; enforce `ENABLE_TURNSTILE=true` fail-closed.

### 4. Load Balancer / Middleware

| #   | Risk                                           | Current Control                                                      | Evidence          | Residual Risk                                |
| --- | ---------------------------------------------- | -------------------------------------------------------------------- | ----------------- | -------------------------------------------- |
| 1   | Single-point-of-failure in 668-line middleware | `try-catch` at top level; `passThroughOnException()` fallback        | S4:A100-21 (High) | High — any unhandled exception = 100% outage |
| 2   | Sequential KV lookups adding latency           | 3 KV lookups per request (unknown-host, rate-limit, site resolution) | S4:A98-17         | Medium — 1.5s added at 500ms/lookup          |
| 3   | Recursion depth amplification                  | `MAX_RECURSION_DEPTH = 3` via `x-worker-recursion-depth` header      | S3:S3-044 ✅      | Low                                          |

**Top Investment:** Modularize middleware into composable error-boundary modules; parallelize independent KV lookups with `Promise.all()`.

### 5. API Layer

| #   | Risk                                                             | Current Control                                                                  | Evidence                          | Residual Risk                                                        |
| --- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------- | --------------------------------- | -------------------------------------------------------------------- |
| 1   | Prototype pollution via `JSON.parse(atob(base64))` (3 instances) | None — raw `atob()` + `JSON.parse()` without reviver                             | S4:A100-3, A100-4, A100-20 (High) | High — exploitable in logout, reset-password, password-change routes |
| 2   | Missing request correlation in logs                              | Trace ID generated in middleware but never wired to route-level `logger.child()` | S4:A93-2 (High)                   | High — log correlation exists in theory, not practice                |
| 3   | Unchecked `JSON.parse` on external input (commission ingest)     | No try-catch on 3 `JSON.parse(rawBody)` calls for affiliate network responses    | S4:A96-4                          | Medium — cron crashes on non-JSON response                           |

**Top Investment:** Replace all `JSON.parse(atob(base64))` with `jose.decodeJwt()` (centralized utility); wire `logger.child({ requestId })` into every API route.

### 6. Service / Business Logic

| #   | Risk                                                    | Current Control                                                         | Evidence               | Residual Risk                                         |
| --- | ------------------------------------------------------- | ----------------------------------------------------------------------- | ---------------------- | ----------------------------------------------------- |
| 1   | IDOR — `authorizeResource()` covers only 5 entity types | RLS + DAL-level `site_id` scoping; `withAuthz()` server-derived site_id | S1:A7-006 (Medium)     | Medium — `scheduled_jobs`, `integrations` not covered |
| 2   | No absolute session lifetime cap                        | 30-min idle timeout; JWT binding to UA + IP                             | S4:A98-8 (Medium)      | Medium — indefinite session with activity             |
| 3   | Newsletter confirmation email not localized             | `t()` function imported but only used for error messages                | S4:A92-1, A92-2 (High) | High — Arabic sites receive English-only emails       |

**Top Investment:** Extend `authorizeResource()` to all ID-referenced entities; add `MAX_SESSION_LIFETIME_MS` (8h).

### 7. Cache

| #   | Risk                                       | Current Control                                                | Evidence         | Residual Risk                                               |
| --- | ------------------------------------------ | -------------------------------------------------------------- | ---------------- | ----------------------------------------------------------- |
| 1   | Cache stampede on ISR miss at 100× traffic | `singleFlight` coalescing; site-scoped cache tags              | S3:A75, S4:A99-4 | Medium — verify singleflight wired for all 3 cached queries |
| 2   | No SWR pattern on KV site lookup           | 60s TTL; singleflight; expired entry causes synchronous DB hit | S3:S3-037        | Low                                                         |
| 3   | Corrupted KV data causes sitemap 500       | `JSON.parse(raw)` without try-catch on cached sitemap          | S4:A100-26       | Medium                                                      |

**Top Investment:** Add try-catch fallback to DB regeneration on KV parse failure; verify singleflight coverage.

### 8. Database (Supabase / PostgreSQL)

| #   | Risk                                                   | Current Control                                                              | Evidence                            | Residual Risk                                     |
| --- | ------------------------------------------------------ | ---------------------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------- |
| 1   | No circuit breaker on Supabase — 30s TCP timeout hangs | None — every request waits for TCP timeout on outage                         | S3:S3-034, S3-060, S4:A98-16 (High) | High — sustained DB outage cascades to all routes |
| 2   | Per-request client creation (cold start latency)       | Anon client cached per-isolate with 5-min TTL; tenant client per-request     | S3:S3-050, S1:A24-004               | Medium                                            |
| 3   | TOCTOU in tenant authorization                         | `authorizeResource` fetches then checks — small window for site reassignment | S4:A96-2                            | Low                                               |

**Top Investment:** Add circuit breaker for Supabase calls (reuse `lib/ai/circuit-breaker.ts` pattern); cache tenant client per-request.

### 9. Backups

| #   | Risk                                     | Current Control                                                             | Evidence     | Residual Risk                     |
| --- | ---------------------------------------- | --------------------------------------------------------------------------- | ------------ | --------------------------------- |
| 1   | No app-level backup beyond Supabase PITR | Supabase platform PITR (Pro plan); no `pg_dump` scripts                     | S1:A22-002   | Medium — single-vendor dependency |
| 2   | No tested backup restore procedure       | DR runbook exists (`docs/DR-RUNBOOK.md`) but no evidence of drill execution | S4:A94-2     | Medium                            |
| 3   | R2 versioning not available (GA pending) | No object-level rollback for uploaded images                                | S2:A37 (Low) | Low                               |

**Top Investment:** Implement `pg_dump`-based backup to encrypted R2; schedule quarterly DR drill.

### 10. Analytics / Observability

| #   | Risk                                        | Current Control                                                     | Evidence                        | Residual Risk                               |
| --- | ------------------------------------------- | ------------------------------------------------------------------- | ------------------------------- | ------------------------------------------- |
| 1   | Burn-rate alert destinations not configured | `alerts.tf` defines alerts but `alert_mechanisms` defaults to empty | S3:S3-062 (Medium)              | High — alerts exist on paper but never fire |
| 2   | No log sampling — TB/day at scale           | No `LOG_SAMPLE_RATE` env var; every request emits full JSON logs    | S4:A93-5 (Medium), A99-6 (High) | High at 100× traffic — cost/backpressure    |
| 3   | No distributed tracing export               | OTLP trace context parsed but no export endpoint configured         | S4:A100-24                      | Medium                                      |

**Top Investment:** Configure alert notification destinations in `alerts.auto.tfvars`; implement log sampling for production.

### 11. AI Subsystem

| #   | Risk                                    | Current Control                                                    | Evidence              | Residual Risk                               |
| --- | --------------------------------------- | ------------------------------------------------------------------ | --------------------- | ------------------------------------------- |
| 1   | Hallucination — no automated detection  | Human review gate; regulatory-term flagging                        | S5:A105-02 (Medium)   | Medium — relies entirely on human reviewers |
| 2   | Homoglyph bypass of prompt sanitization | NFKC normalization; secondary system-prompt hardening              | S5:A101-09, A115-RT20 | Low — secondary defenses compensate         |
| 3   | No prompt caching (redundant API cost)  | No application-level deduplication; providers may cache internally | S5:A114-03            | Low (cost only)                             |

**Top Investment:** Formalize human-review SLA as compensating control with documented maximum review time; add Unicode confusable normalization for control words.

### 12. Vendors / Third Parties

| #   | Risk                                            | Current Control                                                           | Evidence          | Residual Risk                               |
| --- | ----------------------------------------------- | ------------------------------------------------------------------------- | ----------------- | ------------------------------------------- |
| 1   | Resend (email) outage — no retry or DLQ         | Fire-and-forget; DB write succeeds but confirmation email lost            | S3:S3-035, S3-061 | Medium — silent failure on transient outage |
| 2   | Sub-processor list not in public privacy policy | Listed in `docs/data-residency.md` but not in public-facing PP            | S3:S3-024         | Medium (GDPR Art. 13 exposure)              |
| 3   | Stripe 3DS2 not explicitly requested for non-EU | Stripe Checkout auto-handles PSD2 SCA for EU; no explicit opt-in globally | S6e:A155-01       | Low — Stripe handles basics                 |

**Top Investment:** Add email send retry/DLQ mechanism; update privacy policy with sub-processor list.

---

## [A247] Regulator Visit Tomorrow — Subpoena Readiness

Scenario: GDPR DPA and SEC arrive tomorrow with a broad subpoena. What we hand them, what we can't produce, where we're exposed.

### What We CAN Produce (Hand Immediately)

| Document                               | Location                                         | Status                                                                           |
| -------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------- |
| Record of Processing Activities (RoPA) | `docs/ropa.md`                                   | ✅ Exists — covers 17+ tables with legal basis, retention, recipients            |
| Data Residency Map                     | `docs/data-residency.md`                         | ✅ Comprehensive — 8 service providers with region, PII flag, transfer mechanism |
| Schrems II Transfer Impact Assessment  | `docs/schrems-ii-tia.md`                         | ✅ Exists                                                                        |
| Privacy Policy                         | `app/(public)/privacy/page.tsx`                  | ✅ Published — but has gaps (see below)                                          |
| Security Policy                        | `SECURITY.md`                                    | ✅ RFC 9116 compliant with `security.txt`                                        |
| Incident Response Plan                 | `docs/incident-response.md`                      | ✅ Exists                                                                        |
| DR Runbook                             | `docs/DR-RUNBOOK.md`                             | ✅ Exists                                                                        |
| Business Continuity Plan               | `docs/business-continuity-plan.md`               | ✅ Exists                                                                        |
| AI Governance Policy                   | `docs/ai-governance.md`                          | ✅ Comprehensive                                                                 |
| AI Risk Governance (NIST RMF)          | `docs/ai-risk-governance.md`                     | ✅ GOVERN/MAP/MEASURE/MANAGE documented                                          |
| AI Technical Documentation (Annex IV)  | `docs/ai-system-technical-doc.md`                | ✅ EU AI Act compliant                                                           |
| Consent Management Implementation      | `app/(public)/components/cookie-consent-cmp.tsx` | ✅ CMP with proof logging                                                        |
| Audit Logs                             | `lib/audit-log.ts`, Supabase `audit_log` table   | ✅ Structured with PII redaction                                                 |
| SOC 2 Controls Mapping                 | `docs/soc2-controls-mapping.md`                  | ✅ Exists                                                                        |
| ISO 27001 Annex A Mapping              | `docs/iso27001-annex-a.md`                       | ✅ Exists                                                                        |
| Access Recertification Policy          | `docs/access-recertification.md`                 | ✅ Exists                                                                        |
| Data Retention Automation              | `app/api/cron/data-retention/route.ts`           | ✅ Automated daily cron                                                          |
| SLO Definitions                        | `docs/slo-definitions.md`                        | ✅ 7 service tiers                                                               |
| Breach Notification Templates          | `docs/breach-notification-templates.md`          | ✅ Pre-drafted                                                                   |
| Vendor DPA Status                      | `docs/vendor-dpas.md`                            | ✅ Exists                                                                        |

### What We CANNOT Produce (Gaps)

| Missing Artifact                                   | Why It Matters                                                                                    | Risk Level | Remediation                                                                             |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------- |
| GDPR Art. 20 data portability export (CSV/JSON-LD) | DPA will ask "can a user export their data?" — no self-service mechanism exists                   | High       | S3:S3-004 — build export endpoint                                                       |
| Secrets rotation runbook evidence                  | Was referenced but file was empty/missing until recently; no evidence of executed rotation drills | High       | S4:A94-7, A98-6 — verify `docs/secrets-rotation-runbook.md` content and schedule drills |
| Privacy policy sub-processor list                  | GDPR Art. 13(1)(e) requires named processors in the public PP, not just internal docs             | Medium     | S3:S3-024 — add to `privacy/page.tsx`                                                   |
| Privacy policy retention schedule                  | Art. 13(2)(a) requires public retention periods                                                   | Medium     | S3:S3-025                                                                               |
| Privacy policy drip campaign disclosure            | Email used for drip campaigns not disclosed                                                       | Medium     | S3:S3-023                                                                               |
| CCPA "Do Not Sell" link                            | Required for California residents                                                                 | Medium     | S3:S3-008                                                                               |
| Click-fingerprinting disclosure                    | HMAC fingerprint = pseudonymous identifier under GDPR; not in privacy notice                      | Medium     | S4:A98-11                                                                               |
| Impression tracking consent gate                   | Impressions recorded without consent check                                                        | Medium     | S4:A100-11                                                                              |
| Deletion certificate / confirmation                | RTBF endpoint deletes but doesn't confirm to data subject                                         | Low        | S4:A98-10                                                                               |
| Automated access review evidence                   | Quarterly reviews referenced but no SIEM/ticketing integration                                    | Medium     | S4:A98-9                                                                                |
| On-call rotation contacts                          | Alerting runbook is abstract about "who gets paged"                                               | Medium     | S4:A94-5                                                                                |

### SEC-Specific Exposure

| Area                                                             | Status                                                                               | Risk                                                     |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| Material cybersecurity incident disclosure                       | Breach notification templates exist; incident response plan exists                   | Low — procedures documented                              |
| Cybersecurity risk management                                    | 6 seasons of audit reports + SOC 2 mapping + threat model demonstrate active program | Low                                                      |
| Board oversight of cyber risk                                    | `docs/board-cyber-metrics.md` exists                                                 | Low                                                      |
| Internal controls over financial reporting (commission accuracy) | Commission dedup via DB unique constraint; Stripe reconciliation cron                | Medium — no explicit SOX-relevant controls documentation |

### 30 / 60 / 90-Day Remediation Plan

**30 Days (Immediate — Regulator Exposure)**

| #   | Action                                                                             | Owner               | Finding                   |
| --- | ---------------------------------------------------------------------------------- | ------------------- | ------------------------- |
| 1   | Build GDPR Art. 20 data export endpoint (CSV/JSON-LD)                              | Engineering         | S3:S3-004                 |
| 2   | Update privacy policy: add sub-processor list, retention schedule, drip disclosure | Legal + Engineering | S3:S3-023, S3-024, S3-025 |
| 3   | Add CCPA "Do Not Sell" link and required disclosures                               | Legal               | S3:S3-008                 |
| 4   | Disclose click-fingerprinting in privacy policy                                    | Legal               | S4:A98-11                 |
| 5   | Gate impression tracking on consent status                                         | Engineering         | S4:A100-11                |
| 6   | Configure alert notification destinations                                          | SRE                 | S3:S3-062                 |

**60 Days (Hardening)**

| #   | Action                                               | Owner       | Finding           |
| --- | ---------------------------------------------------- | ----------- | ----------------- |
| 7   | Execute secrets rotation drill and document evidence | Security    | S4:A94-7, A98-6   |
| 8   | Add deletion certificate/confirmation on RTBF        | Engineering | S4:A98-10         |
| 9   | Implement automated access review integration        | Security    | S4:A98-9          |
| 10  | Document concrete on-call rotation and escalation    | SRE         | S4:A94-5          |
| 11  | Implement Supabase circuit breaker                   | Engineering | S3:S3-034, S3-060 |
| 12  | Add "Reject All" to initial consent banner           | Engineering | S3:S3-021         |

**90 Days (Defense-in-Depth)**

| #   | Action                                                             | Owner       | Finding           |
| --- | ------------------------------------------------------------------ | ----------- | ----------------- |
| 13  | Replace `JSON.parse(atob())` with `jose.decodeJwt()` (3 instances) | Engineering | S4:A100-3/4/20    |
| 14  | Wire trace-ID into all API route loggers                           | Engineering | S4:A93-2          |
| 15  | Implement log sampling for production                              | SRE         | S4:A93-5          |
| 16  | Localize newsletter emails using `t()`                             | Engineering | S4:A92-1/2        |
| 17  | Add app-level backup (pg_dump to encrypted R2)                     | SRE         | S1:A22-002        |
| 18  | Build email send retry/DLQ for Resend                              | Engineering | S3:S3-035, S3-061 |

---

## [A248] Worst-Day Drill — 03:00 Ransomware + IdP Compromise

**Scenario:** Production database ransomware-encrypted, identity provider compromised, press has the story, board chair is on the phone. First 60 minutes.

### T+0 to T+5 — Detection & Triage

| Minute | Role            | Action                                                                                                                         |
| ------ | --------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 0:00   | **On-Call SRE** | Alert fires: health endpoint (`app/api/health/route.ts`) returns `database: error` for all checks. Sentry flood of 500 errors. |
| 0:01   | SRE             | Check Cloudflare Analytics — if 5xx spike is global, not per-site, escalate to P0.                                             |
| 0:02   | SRE             | Page **Incident Commander** (IC) and **Security Lead** via PagerDuty.                                                          |
| 0:03   | IC              | Open war room (Slack #incident-p0). Declare "suspected compromise" — do NOT discuss ransomware externally yet.                 |
| 0:05   | Security Lead   | Verify: is this ransomware or just a DB outage? Check Supabase dashboard for encryption indicators.                            |

**Gap identified:** Alerting runbook (`docs/alerting-runbook.md`) does not specify concrete on-call rotation or PagerDuty escalation contacts (S4:A94-5). In a real 3am scenario, the "who gets paged" question delays response by 5–10 minutes.

### T+5 to T+15 — Containment

| Minute | Role          | Action                                                                                                                                                                                                                                                                  |
| ------ | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0:05   | SRE           | **Kill inbound traffic:** Set Cloudflare WAF to challenge-mode on all routes (Terraform or dashboard). This prevents further data exfiltration.                                                                                                                         |
| 0:07   | SRE           | **Activate maintenance mode:** Set `MAINTENANCE_MODE=true` env var — middleware (`middleware.ts:419`) serves branded unavailable response.                                                                                                                              |
| 0:08   | Security Lead | **Rotate ALL secrets immediately:** JWT_SECRET, CRON_SECRET, STRIPE_WEBHOOK_SECRET, all AI API keys. **Gap:** No rotation runbook existed until recently (`docs/secrets-rotation-runbook.md` was missing per S4:A94-7/A98-6). Current runbook content must be verified. |
| 0:10   | Security Lead | **Revoke all admin sessions:** Clear all `__Host-` session cookies by rotating JWT_SECRET. All existing JWTs become invalid.                                                                                                                                            |
| 0:12   | SRE           | **IdP compromise containment:** Since auth is self-managed (bcrypt + TOTP, not external IdP), rotating JWT_SECRET invalidates all sessions. If external IdP were used, disable SSO federation.                                                                          |
| 0:15   | IC            | **Assess blast radius:** Multi-tenant isolation (RLS `tenant_isolation` policies per S1:A30-001) means one compromised tenant's data doesn't automatically expose others. Verify RLS is intact.                                                                         |

### T+15 to T+30 — Communication

| Minute | Role  | Action                                                                                                                                                                                                                                                                                    |
| ------ | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0:15   | IC    | **Board chair call:** "We detected unauthorized encryption of our production database at [time]. We have contained the incident by taking the service offline and rotating all credentials. We are assessing the scope. No evidence of data exfiltration yet. Next update in 30 minutes." |
| 0:18   | Legal | **Press holding statement:** "We are aware of a security incident affecting our service. We are investigating and will provide updates as we have confirmed information. User safety is our top priority."                                                                                |
| 0:20   | Legal | **Regulatory notification clock starts:** GDPR Art. 33 requires DPA notification within 72 hours. Use pre-drafted templates (`docs/breach-notification-templates.md`).                                                                                                                    |
| 0:25   | IC    | **Internal all-hands:** Email all staff — do NOT discuss on social media. Refer all press inquiries to [designated spokesperson].                                                                                                                                                         |

### T+30 to T+60 — Recovery

| Minute | Role          | Action                                                                                                                                                                  |
| ------ | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0:30   | SRE           | **Initiate PITR:** Use Supabase Point-in-Time Recovery to restore DB to last known good state (per `docs/DR-RUNBOOK.md`). RPO depends on plan tier (Pro: up to 7 days). |
| 0:35   | SRE           | **Verify data integrity:** Compare row counts on critical tables (users, memberships, products, commissions) against last known baseline.                               |
| 0:40   | Security Lead | **Forensic preservation:** Before restoring, snapshot the encrypted DB state for forensic analysis. Preserve all Cloudflare logs, Sentry events, and audit log entries. |
| 0:45   | SRE           | **Staged recovery:** Bring up health endpoint first. Then admin panel. Then public pages. Then cron jobs. Verify each stage before proceeding.                          |
| 0:50   | Security Lead | **Verify no persistence:** Check for unauthorized RPC functions, triggers, or roles in restored DB. Review migration history for unexpected entries.                    |
| 0:55   | IC            | **Board update #2:** "Database restored from backup. Assessing data integrity. Service will be restored in [estimated time]. Forensic investigation ongoing."           |
| 0:60   | IC            | **Decision point:** If data integrity verified, begin traffic restoration. If not, extend maintenance window and communicate new ETA.                                   |

### Post-Incident Actions (Days 1–7)

1. **Root cause analysis** — how did attacker gain DB access? Review audit_log, Supabase access logs, Cloudflare WAF logs.
2. **Regulatory notification** — file GDPR Art. 33 notification within 72h using templates.
3. **User notification** — if personal data affected, notify users per GDPR Art. 34 and breach notification templates.
4. **Post-mortem** — document in `docs/post-mortems/` directory (already exists).
5. **Harden** — implement findings from this drill (on-call contacts, rotation runbook verification, tested backup restore).

### Drill Gaps Identified

| Gap                                                                            | Impact                                                  | Finding           |
| ------------------------------------------------------------------------------ | ------------------------------------------------------- | ----------------- |
| No concrete on-call rotation contacts                                          | 5–10 min delay in P0 escalation                         | S4:A94-5          |
| Secrets rotation runbook was missing/unverified                                | Could not rotate secrets following documented procedure | S4:A94-7, A98-6   |
| No app-level backup beyond Supabase PITR                                       | Single-vendor dependency for recovery                   | S1:A22-002        |
| No absolute session lifetime — compromised sessions live forever with activity | Attacker maintains access until idle timeout            | S4:A98-8          |
| Health endpoint checks are sequential (7 × timeout = 35s)                      | Slow health check during incident delays triage         | S4:A100-9         |
| Alert destinations not configured                                              | Nobody gets paged when alerts fire                      | S3:S3-062         |
| No circuit breaker on Supabase                                                 | 30s hang per request during DB outage wastes Worker CPU | S3:S3-034, S3-060 |

---

## [A249] 0.0000001% Hunt — Gap Analysis

Re-read every artifact at half speed. Per paragraph, write what is NOT said but SHOULD be. List missing items, the question they answer, and the standard requiring them.

### Season 1 (Code & Data) — Gaps

| #   | What Is NOT Said                                                                                                  | Question It Answers                                                          | Standard                        |
| --- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------- |
| 1   | No mention of Content Security Policy reporting endpoint configuration status (is it actually receiving reports?) | Are CSP violations being monitored in production?                            | CSP Level 3, SOC 2 CC7.2        |
| 2   | No mention of bcrypt cost factor upgrade path (currently cost-10)                                                 | When will cost factor be increased as hardware improves?                     | OWASP Password Storage          |
| 3   | No mention of TOTP recovery codes or backup authentication method                                                 | What happens if a user loses their TOTP device?                              | NIST 800-63B §6.1               |
| 4   | RLS policies audited but no mention of RLS bypass risk via `service_role` key exposure                            | If `service_role` key leaks, all RLS is bypassed — what mitigates this?      | Supabase Security Best Practice |
| 5   | No mention of database connection string rotation procedure                                                       | How do we rotate the DB connection without downtime?                         | SOC 2 CC6.1                     |
| 6   | `authorizeResource()` gap acknowledged but no mention of authorization testing coverage                           | Are there integration tests proving IDOR prevention across all entity types? | OWASP Testing Guide §4.5        |

### Season 2 (Infra & API) — Gaps

| #   | What Is NOT Said                                                                      | Question It Answers                                               | Standard                    |
| --- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | --------------------------- |
| 1   | No mention of Terraform state file encryption or access control                       | Who can read/modify the Terraform state (which contains secrets)? | CIS Terraform Benchmark 1.1 |
| 2   | No mention of CI/CD secret scanning for PR descriptions/comments                      | Can secrets leak via PR metadata, not just code?                  | GitHub Secret Scanning      |
| 3   | Wrangler version drift noted but no mention of Node.js version pinning across CI jobs | Does CI use the same Node.js version as production?               | Reproducible Builds         |
| 4   | No mention of Cloudflare Workers memory limits (128MB) and current usage baseline     | How close are we to the memory ceiling under normal load?         | CF Workers Limits           |
| 5   | API endpoint audit lists all routes but doesn't mention API versioning strategy       | How will we deprecate endpoints without breaking clients?         | API Governance              |
| 6   | No mention of supply chain attestation verification (SBOM exists but is it consumed?) | Do we verify SBOM attestations on dependencies before promotion?  | SLSA Level 3                |

### Season 3 (Privacy & Reliability) — Gaps

| #   | What Is NOT Said                                                                     | Question It Answers                                                        | Standard             |
| --- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- | -------------------- |
| 1   | RoPA exists but no mention of DPA registration or RoPA submission history            | Have we submitted our RoPA to the relevant DPA?                            | GDPR Art. 30(4)      |
| 2   | DPIA (Data Protection Impact Assessment) not mentioned anywhere                      | Has a DPIA been conducted for click-tracking and AI content generation?    | GDPR Art. 35         |
| 3   | No mention of data breach register (Art. 33(5))                                      | Do we maintain a register of all personal data breaches (even minor ones)? | GDPR Art. 33(5)      |
| 4   | Consent banner lacks explicit mention of consent withdrawal re-processing time       | After consent withdrawal, how long until processing actually stops?        | GDPR Art. 7(3)       |
| 5   | SLO definitions exist but no mention of SLO review cadence or error budget policy    | What happens when we exhaust our error budget? Do we freeze deployments?   | SRE Handbook Ch. 4   |
| 6   | External call hygiene audited but no mention of vendor SLA monitoring                | Are we tracking whether Resend, Stripe, and AI providers meet their SLAs?  | Vendor Management    |
| 7   | No mention of WCAG audit methodology or last audit date in accessibility statement   | When was the last manual accessibility audit conducted?                    | WCAG 2.2 Conformance |
| 8   | Cookie consent proof logging exists but no mention of consent proof retention period | How long do we retain consent proof records?                               | ePrivacy Art. 5(3)   |

### Season 4 (Quality & Paranoid) — Gaps

| #   | What Is NOT Said                                                                                       | Question It Answers                                                 | Standard                       |
| --- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- | ------------------------------ |
| 1   | Integration tests all `skipIf(!shouldRunSupabaseIntegration)` — no evidence any CI job ever runs them  | Are integration tests actually executed anywhere?                   | CI/CD Best Practice            |
| 2   | Mutation test experiment described but no mention of running an actual mutation testing tool (Stryker) | Have we measured real mutation score, not just thought experiments? | Mutation Testing               |
| 3   | Feature flag `captchaOnLogin` has `rolloutPercent: 0` with November 2026 expiry — no mention of owner  | Who decides whether to activate or remove abandoned feature flags?  | Feature Flag Governance        |
| 4   | 668-line middleware file identified as SPOF but no mention of middleware unit test coverage            | What percentage of middleware branches are tested?                  | Testing Pyramid                |
| 5   | No mention of security champion or secure coding training for the development team                     | Who is responsible for security awareness within the team?          | SOC 2 CC1.4, ISO 27001 A.7.2.2 |

### Season 5 (AI / ML / LLM) — Gaps

| #   | What Is NOT Said                                                                                                   | Question It Answers                                                       | Standard                       |
| --- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- | ------------------------------ |
| 1   | AI content watermarking (`data-ai-generated="true"`) mentioned but no test verifying it survives HTML sanitization | Does the sanitizer strip the AI provenance attribute?                     | EU AI Act Art. 50              |
| 2   | No mention of AI model deprecation/EOL policy                                                                      | What happens when Cloudflare deprecates `llama-3.1-8b-instruct`?          | NIST AI RMF MG-3               |
| 3   | Jailbreak eval has 30+ payloads but no mention of update cadence for new attack techniques                         | How often are jailbreak test cases updated?                               | OWASP LLM01 Continuous Testing |
| 4   | No mention of AI output logging for regulatory audit trail (beyond draft storage)                                  | Can we prove to a regulator what the AI generated for a specific article? | EU AI Act Art. 12              |
| 5   | No mention of AI provider incident notification process                                                            | If Gemini has a data breach, how do we learn about it and respond?        | Vendor Incident Management     |

### Season 6e (Anti-Abuse & Fraud) — Gaps

| #   | What Is NOT Said                                                           | Question It Answers                                                              | Standard                            |
| --- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------- |
| 1   | No mention of fraud-rate KPIs or reporting dashboard                       | What is our current chargeback rate, and is it below Visa/Mastercard thresholds? | PCI DSS 12.10                       |
| 2   | No mention of abuse report response time SLA                               | How quickly do we respond to abuse reports via `abuse@groupsmix.com`?            | DSA Art. 16                         |
| 3   | Moderation queue exists but no mention of moderator training or guidelines | What criteria do moderators use to approve/reject content?                       | DSA Art. 16                         |
| 4   | No mention of repeat-offender tracking across sites (multi-tenant)         | Can a banned user from Site A continue operating on Site B?                      | Trust & Safety Best Practice        |
| 5   | No mention of law enforcement request handling procedure                   | How do we process lawful interception or preservation requests?                  | 18 U.S.C. § 2703, GDPR Art. 6(1)(c) |

---

## [A250] Prove It Final — Evidence Mapping

Every claim from S1–S6e mapped to evidence (file:line or doc or policy). No-evidence claims become **Medium UNVERIFIED** with 30-day owner.

### Verified Claims (Evidence Confirmed)

| Season | Claim                                     | Evidence                                                                            | Status      |
| ------ | ----------------------------------------- | ----------------------------------------------------------------------------------- | ----------- |
| S1     | AES-256-GCM TOTP encryption               | `lib/totp-encryption.ts` — V1/V2 rotation support                                   | ✅ Verified |
| S1     | bcrypt cost-10 password hashing           | `lib/password.ts` — SHA-256 + bcrypt                                                | ✅ Verified |
| S1     | Timing-safe CSRF comparison               | `lib/csrf.ts:timingSafeCompare()`                                                   | ✅ Verified |
| S1     | RLS tenant isolation                      | `supabase/migrations/00064_*`, `00067_*` — `tenant_isolation` policies              | ✅ Verified |
| S1     | No `SELECT *` — explicit column lists     | `lib/dal/products.ts:LIST_COLUMNS` — all DAL modules                                | ✅ Verified |
| S1     | Pagination hard cap 200                   | `lib/dal/pagination-guard.ts:clampPagination()`                                     | ✅ Verified |
| S1     | TIMESTAMPTZ everywhere                    | `00001_initial_schema.sql` — 15+ columns                                            | ✅ Verified |
| S1     | NUMERIC(12,2) for money                   | `00089_standardize_money_columns.sql`                                               | ✅ Verified |
| S2     | 5 scoped Cloudflare API tokens            | `terraform/cloudflare/main.tf` — IaC-managed                                        | ✅ Verified |
| S2     | Pinned action SHAs in CI                  | `.github/workflows/` — SBOM, SLSA, cosign                                           | ✅ Verified |
| S2     | CSP per-request nonce                     | `lib/csp.ts` + `middleware.ts` — `crypto.getRandomValues(16)`                       | ✅ Verified |
| S2     | `__Host-` cookie prefix                   | `lib/auth.ts:20`, `lib/cookie-utils.ts:50-60`                                       | ✅ Verified |
| S2     | Double-submit CSRF                        | `lib/csrf.ts` — `__Host-csrf` (prod) / `__csrf` (dev)                               | ✅ Verified |
| S2     | CORS explicit origin allowlist            | CORS with `VerifiedSiteRef` type safety                                             | ✅ Verified |
| S2     | Allowlist HTML sanitizer                  | `lib/sanitize-html.ts` — `htmlparser2` with tag/attribute allowlist                 | ✅ Verified |
| S2     | HSTS max-age 2 years                      | `next.config.ts` + `terraform/` — `max-age=63072000; includeSubDomains; preload`    | ✅ Verified |
| S3     | CMP blocks non-essential cookies          | `cookie-consent-cmp.tsx` — `consent-before-fire` event                              | ✅ Verified |
| S3     | Consent proof logging                     | `POST /api/consent/log` — truncated IP, UA hash, banner version, GPC flag           | ✅ Verified |
| S3     | Data residency documentation              | `docs/data-residency.md` — 8 providers mapped                                       | ✅ Verified |
| S3     | AI content human review gate              | `content-generator.ts` — `ai_generated: true` + `human_reviewed_at` required        | ✅ Verified |
| S3     | Circuit breaker for AI providers          | `lib/ai/circuit-breaker.ts` — KV-backed fleet-wide state                            | ✅ Verified |
| S3     | Jittered exponential backoff              | `lib/fetch-timeout.ts:25-28` — full jitter, 10s max delay                           | ✅ Verified |
| S3     | Data retention cron with cursor           | `app/api/cron/data-retention/route.ts` — `cron_state` table checkpoint              | ✅ Verified |
| S4     | Feature flag registry with expiry         | `lib/feature-flags.ts` — `expiresAt`, CI validation                                 | ✅ Verified |
| S4     | `ApiErrorCode` enum taxonomy              | `lib/api-error.ts` — 15 codes, `redactDetails()`                                    | ✅ Verified |
| S4     | 13 ADRs                                   | `docs/adr/` directory                                                               | ✅ Verified |
| S4     | 196 test files                            | `__tests__/` directory — confirmed via file count                                   | ✅ Verified |
| S5     | 9 prompt injection regex patterns         | `prompt-sanitization.ts:147-157`                                                    | ✅ Verified |
| S5     | 8-language role impersonation detection   | `prompt-sanitization.ts:56-87` — Arabic, Cyrillic, Chinese, Japanese, Korean, Hindi | ✅ Verified |
| S5     | 30+ jailbreak test payloads               | `__tests__/ai/jailbreak-eval.test.ts`                                               | ✅ Verified |
| S5     | Output secret scanner                     | `content-moderation.ts:72-106` — AWS, OpenAI, Stripe, JWT, GitHub patterns          | ✅ Verified |
| S5     | 4-provider fallback chain                 | `providers.ts:287-292` — Cloudflare AI → Gemini → Groq → Cohere                     | ✅ Verified |
| S5     | Per-tenant AI quotas                      | `quotas.ts:69-95` — daily requests, monthly tokens, monthly cost                    | ✅ Verified |
| S5     | Global daily AI cost ceiling              | `providers.ts:335-340` — `AI_GLOBAL_DAILY_CEILING_USD`                              | ✅ Verified |
| S6e    | 3-tier login rate limiting                | `login/route.ts:165-227` — global + per-IP + per-email, all fail-closed             | ✅ Verified |
| S6e    | HIBP breached-password check              | `login/route.ts:73-163` — SHA-1 k-anonymity, KV cache, fail-open with Sentry        | ✅ Verified |
| S6e    | Stripe webhook HMAC verification          | `lib/stripe-webhook.ts` — constant-time, 5-min timestamp tolerance, pre-warmed key  | ✅ Verified |
| S6e    | security.txt RFC 9116 compliance          | `app/.well-known/security.txt/route.ts` — dynamic per-tenant                        | ✅ Verified |
| S6e    | Commission dedup via DB unique constraint | `lib/dal/commissions.ts:22-61` — `error.code === "23505"`                           | ✅ Verified |
| S6e    | PII redaction 45+ field deny-list         | `lib/log-redaction.ts:1-87` — pattern-based, IP /24 truncation                      | ✅ Verified |

### UNVERIFIED Claims — Medium Severity, 30-Day Owner Required

| #     | Season | Claim                                                                   | Why Unverified                                                                                                   | Severity          | 30-Day Owner     |
| ----- | ------ | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------- | ---------------- |
| UV-1  | S3     | "Supabase provides PITR on Pro plan" (A22-001)                          | No evidence the production project is on Pro+ with PITR enabled; platform-side verification needed               | Medium UNVERIFIED | SRE Lead         |
| UV-2  | S3     | "DLS configured for EU metadata restriction" (S3-026)                   | `docs/data-residency.md` references Cloudflare DLS but no Terraform config or dashboard evidence                 | Medium UNVERIFIED | SRE Lead         |
| UV-3  | S3     | "Burn-rate alerts fire when SLOs are breached" (S3-062)                 | `alerts.tf` exists but `alert_mechanisms` defaults to empty — alerts may never fire                              | Medium UNVERIFIED | SRE Lead         |
| UV-4  | S4     | "Integration tests exercise login flow with real DB" (A86-1, A87-7)     | All integration tests `skipIf(!shouldRunSupabaseIntegration)` — no CI job sets the flag                          | Medium UNVERIFIED | Engineering Lead |
| UV-5  | S4     | "Feature flag changes are access-logged" (A90-4)                        | DAL confirms `recordAuditEvent` call but no test or log evidence of actual execution                             | Medium UNVERIFIED | Engineering Lead |
| UV-6  | S4     | "DR runbook procedures are tested" (A94-2)                              | Runbook exists but no evidence of a conducted DR drill                                                           | Medium UNVERIFIED | SRE Lead         |
| UV-7  | S5     | "`AiContentDisclosure` component renders on AI content pages" (A109-05) | Referenced as requirement in governance doc but implementation status unconfirmed                                | Medium UNVERIFIED | Engineering Lead |
| UV-8  | S3     | "Daily cost report tool exists" (S3-051)                                | `docs/cost-controls.md` references `tools/cost/daily-report.ts` but file not found in repo                       | Medium UNVERIFIED | Engineering Lead |
| UV-9  | S6e    | "Cloudflare Bot Management / Super Bot Fight Mode enabled" (A157-03)    | Application-level assertion; requires Cloudflare dashboard verification                                          | Medium UNVERIFIED | SRE Lead         |
| UV-10 | S2     | "Durable Object rate limiter active in production" (S1:A10-004)         | Code path exists; `rate-limit-do.test.ts` confirms DO-first behavior; but production binding verification needed | Medium UNVERIFIED | SRE Lead         |

---

## Consolidated Severity Summary (Season 8 New Findings)

| Severity          | Count | IDs                   |
| ----------------- | ----- | --------------------- |
| Medium UNVERIFIED | 10    | UV-1 through UV-10    |
| Gap (from A249)   | 31    | See A249 tables above |

All findings from A246 and A248 reference existing S1–S6e findings and do not create new severity ratings — they provide cross-cut context and prioritization.

---

## Executive Risk Dashboard

### Top 5 Risks Requiring Immediate Board Attention

| #   | Risk                                                                               | Severity Source          | Business Impact                                       | Investment                                     |
| --- | ---------------------------------------------------------------------------------- | ------------------------ | ----------------------------------------------------- | ---------------------------------------------- |
| 1   | **No Supabase circuit breaker** — sustained DB outage cascades to 100% of requests | S3:S3-034/060, S4:A98-16 | Complete platform outage; 99.9% SLO breach in minutes | Medium — reuse existing `CircuitBreaker` class |
| 2   | **Prototype pollution in 3 auth routes** — `JSON.parse(atob())` without reviver    | S4:A100-3/4/20           | Admin session compromise via crafted JWT              | Low — replace with `jose.decodeJwt()`          |
| 3   | **Alert destinations not configured** — burn-rate alerts defined but never fire    | S3:S3-062                | Nobody knows when SLOs are breaching                  | Trivial — configure `alerts.auto.tfvars`       |
| 4   | **GDPR Art. 20 non-compliance** — no data portability/export                       | S3:S3-004                | DPA enforcement action; fines up to 4% annual revenue | Medium — build export endpoint                 |
| 5   | **Rate-limit amnesia at scale** — LRU eviction under DDoS                          | S4:A99-1 (Critical)      | Login brute-force amplification; spam floods          | Medium — probabilistic counter or dynamic cap  |

### Maturity Assessment

| Domain                       | Maturity   | Key Evidence                                                                         |
| ---------------------------- | ---------- | ------------------------------------------------------------------------------------ |
| **Authentication**           | Strong     | bcrypt + TOTP + HIBP + JWT binding + step-up auth + timing-safe comparisons          |
| **Authorization**            | Strong     | RLS + DAL-level site_id + `withAuthz()` server-derived tenant ID                     |
| **Input Validation**         | Strong     | Allowlist sanitizer + pagination guards + URL scheme validation                      |
| **Cryptography**             | Strong     | AES-256-GCM, HKDF, HMAC-SHA256, no FLOAT for money                                   |
| **AI Security**              | Strong     | Multi-layer prompt sanitization, output scanning, 95–100% red team block rate        |
| **Privacy**                  | Moderate   | Good consent management; gaps in portability, privacy policy completeness, DPIA      |
| **Observability**            | Moderate   | Structured logging with PII redaction; gaps in correlation, sampling, alert delivery |
| **Resilience**               | Moderate   | Good AI circuit breaker + KV fallback; DB is single point of failure                 |
| **Compliance Documentation** | Moderate   | Extensive docs (SOC 2, ISO 27001, GDPR); some referenced docs missing or unverified  |
| **Incident Response**        | Developing | Templates and plans exist; no evidence of drills or tested procedures                |
| **Testing**                  | Developing | 196 test files; integration tests never execute in CI; no mutation testing tool      |

---

## Attestation

This Season 8 CEO Cross-Cut Finishers audit was conducted by systematic review of all 6 prior season audit reports (S1–S6e, totaling 2,251 lines of findings across 533+354+522+369+293+180 lines), followed by 5 CEO-level audit passes:

- **A246:** Layer-by-layer risk review covering 12 architectural layers with 36 risk items
- **A247:** Regulatory readiness assessment identifying 11 production gaps and an 18-item remediation plan
- **A248:** Worst-day drill simulation identifying 7 incident response gaps
- **A249:** Gap analysis identifying 31 items across 6 seasons that SHOULD be said but ARE NOT
- **A250:** Evidence mapping verifying 40+ claims and flagging 10 as Medium UNVERIFIED with 30-day owners

Repository: `groupsmix/affilite-mix` at branch `main` (2026-05-29).

---

_Season 8 CEO Cross-Cut Finishers Audit — Complete._
