# Technical Audit A61-A100 — Findings Tracker

> **Date:** 2026-04-30
> **Repo:** `groupsmix/affilite-mix` @ `main` HEAD
> **Auditor:** Compliance audit automation

## Summary

This document tracks the remediation status of findings from the A61-A100 audit. Items marked "Fixed in this PR" were addressed in the `audit/a61-a100-compliance-fixes` branch.

## Fixed in This PR

| #   | Finding                                                                                   | Audit       | Severity | Status                            |
| --- | ----------------------------------------------------------------------------------------- | ----------- | -------- | --------------------------------- |
| 1   | Privacy policy retention windows contradict RoPA/code (90d->365d clicks, 30d->90d vitals) | A70         | High     | Fixed                             |
| 2   | GPC signal not honoured (Sephora-style enforcement risk)                                  | A63         | High     | Fixed                             |
| 3   | Cross-border claim mismatch (RoPA said US for Supabase; vendor-dpas says EU)              | A61/A71     | High     | Fixed                             |
| 4   | CCPA/CPRA section missing from privacy policy                                             | A63         | High     | Fixed                             |
| 5   | AI sub-processors not disclosed in privacy policy                                         | A70         | High     | Fixed                             |
| 6   | AI-content disclosure requirements documented (EU AI Act Art. 50)                         | A72         | High     | Documented (code changes pending) |
| 7   | DPIA threshold assessment missing                                                         | A61         | Medium   | Fixed                             |
| 8   | Per-column PII classification matrix missing                                              | A61         | Medium   | Fixed                             |
| 9   | Children's data statement missing                                                         | A61         | Medium   | Fixed                             |
| 10  | HIPAA/PCI scoping statements missing                                                      | A61/A64/A65 | Medium   | Fixed                             |
| 11  | No ISO 27001 Annex A mapping                                                              | A67         | Medium   | Fixed                             |
| 12  | Schrems II TIA missing                                                                    | A71         | Medium   | Fixed                             |
| 13  | No multi-window burn-rate SLO alerts                                                      | A85         | Medium   | Fixed (documented)                |
| 14  | WCAG 2.2 tags not in axe config                                                           | A68         | Low      | Fixed                             |
| 15  | Memory rate-limit map unbounded                                                           | A75/A78     | Low      | Fixed                             |
| 16  | Consent banner version not tracked                                                        | A69         | Medium   | Fixed                             |
| 17  | Cookie consent events only emit affiliate category                                        | A69         | Low      | Fixed                             |
| 18  | SOC 2 CC1-CC5 and P2-P8 unmapped                                                          | A66         | Medium   | Fixed                             |
| 19  | No ADR directory                                                                          | A94         | Medium   | Fixed (7 ADRs created)            |
| 20  | SAQ-A statement missing from compliance-readiness                                         | A65         | Medium   | Fixed                             |
| 21  | DSAR response SLA not documented                                                          | A62         | Medium   | Fixed                             |
| 22  | DPF certification status not tracked per vendor                                           | A71         | Medium   | Fixed                             |
| 23  | Automated decisioning (Art. 22) assertion missing from privacy policy                     | A62         | Medium   | Fixed                             |

## Remaining Action Items (Not Fixed in This PR)

These items require deeper code changes, infrastructure configuration, or cross-team coordination:

| #   | Finding                                                                                   | Audit    | Severity    | Owner       | Target                      |
| --- | ----------------------------------------------------------------------------------------- | -------- | ----------- | ----------- | --------------------------- |
| 1   | Complete `getTenantClient()` -> `getPrivilegedSupabaseClient()` migration for 7 DAL files | A89/A97  | P0 Critical | Engineering | Next sprint                 |
| 2   | DSAR DELETE not transactional (wrap in Postgres function)                                 | A62      | Medium      | Engineering | Next sprint                 |
| 3   | Rights-restriction (Art. 18) not implemented                                              | A62      | Medium      | Engineering | Q3 2026                     |
| 4   | Consent record persistence (server-side consent log table)                                | A69      | Medium      | Engineering | Q3 2026                     |
| 5   | AI-content disclosure component (visible + machine-readable)                              | A72      | High        | Engineering | Next sprint                 |
| 6   | `@ts-ignore` on `data-retention/route.ts:63` — run `supabase gen types`                   | A89      | Medium      | Engineering | Next sprint                 |
| 7   | No retry-with-backoff-and-jitter helper                                                   | A74      | Low         | Engineering | Q3 2026                     |
| 8   | No circuit breaker for AI providers                                                       | A74/A98  | Medium      | Engineering | Q3 2026                     |
| 9   | Long retention job lacks LIMIT chunking for `affiliate_clicks` delete                     | A82      | Low         | Engineering | Q3 2026                     |
| 10  | `safe-redirect.test.ts` missing                                                           | A88/A100 | Medium      | Engineering | Next sprint                 |
| 11  | TOTP/step-up auth has no test coverage                                                    | A86      | Medium      | Engineering | Next sprint                 |
| 12  | DSAR audit log entry not written to `audit_log` table                                     | A62      | Medium      | Engineering | Next sprint                 |
| 13  | Integration tests silently skipped in CI (`continue-on-error: true`)                      | A87      | High        | Engineering | Next sprint                 |
| 14  | Direct `console.log(JSON.stringify({metric:...}))` bypasses logger                        | A93      | Low         | Engineering | Q3 2026                     |
| 15  | API routes may leak `err.message` to clients on 500                                       | A91      | Medium      | Engineering | Next sprint                 |
| 16  | TCF v2.2 IAB consent string not emitted by CMP                                            | A69      | Low         | Engineering | When ad network requires it |
| 17  | Load testing scope is anaemic (only `/` and `/category/*`)                                | A86      | Medium      | Engineering | Q3 2026                     |
| 18  | JWT rotation test missing                                                                 | A96/A100 | Medium      | Engineering | Next sprint                 |
| 19  | Annual ASV scans not scheduled                                                            | A65      | Medium      | Operations  | Q3 2026                     |
| 20  | Annual penetration test not evidenced                                                     | A65/A66  | Medium      | Operations  | Q3 2026                     |

## Last Updated

2026-04-30
