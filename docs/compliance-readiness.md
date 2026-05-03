# Compliance Readiness

> **OF-15:** PCI DSS SAQ A + SOC 2 Type II evidence pointers.
> Last updated: 2026-05-01

---

## PCI DSS SAQ A

Card data **never touches our servers** — all cardholder data is collected
and processed by Stripe Elements / Stripe Checkout. Our SAQ A scope is
therefore limited to the URL/redirect mechanism and our DNS/hosting
configuration.

### Evidence

| Requirement                           | Evidence                                                          | Status |
| ------------------------------------- | ----------------------------------------------------------------- | ------ |
| Req 2.2 — No default vendor passwords | Cloudflare API tokens rotate every 90 days via CI secret rotation | ✅     |
| Req 6.3 — Secure development          | Branch protection (2 reviews, SBOM, CodeQL)                       | ✅     |
| Req 6.4 — Security in SDLC            | `security.yml` CodeQL + dep-review in CI                          | ✅     |
| Req 8.2 — Unique IDs                  | Supabase Auth row per user; no shared accounts                    | ✅     |
| Req 9.9 — POS device inspection       | N/A — no physical POS                                             | N/A    |
| Req 12.8 — Third-party management     | `docs/vendor-dpas.md` + quarterly review                          | ✅     |

### ASV Scan

| Field             | Value                                                          |
| ----------------- | -------------------------------------------------------------- |
| Vendor            | Qualys PCI ASV (primary); SecurityMetrics (fallback)           |
| Cadence           | Quarterly                                                      |
| Last completed    | _Not yet performed — schedule before first card-present event_ |
| Evidence location | `s3://groupsmix-compliance/pci/asv/`                           |

> **Action (OF-15):** Book first ASV scan with chosen vendor before 2026-09-30.
> Update the "Last completed" field and upload report to evidence bucket.

### Penetration Test

| Field             | Value                                                       |
| ----------------- | ----------------------------------------------------------- |
| Vendor            | NCC Group (primary) or Bishop Fox (fallback) — both PCI-qualified independent pen testers |
| Cadence           | Annual                                                      |
| Last completed    | _Not yet performed_                                         |
| Scope             | `*.groupsmix.com`, Cloudflare Workers, Supabase project     |
| Evidence location | `s3://groupsmix-compliance/pci/pentest/`                    |

> **Action (OF-15):** Commission first annual pen test before 2026-12-31.

### Self-Assessment Questionnaire (SAQ A)

| Field                           | Value                                      |
| ------------------------------- | ------------------------------------------ |
| SAQ type                        | SAQ A                                      |
| Current status                  | In progress — awaiting ASV scan completion |
| Attestation of Compliance (AoC) | Not yet signed                             |
| Evidence location               | `s3://groupsmix-compliance/pci/saq/`       |

---

## SOC 2 Type II (Target)

> See `docs/soc2-controls-mapping.md` for the full CC/PI/A/C/P control mapping.

### Readiness Summary

| Phase                           | Target date | Status      |
| ------------------------------- | ----------- | ----------- |
| Readiness assessment            | Q2 2026     | In progress |
| Gap remediation                 | Q3 2026     | Planned     |
| Type I audit                    | Q4 2026     | Planned     |
| Type II audit (12-month window) | Q4 2027     | Planned     |

### Trust Services Criteria coverage

| Criteria                   | Coverage                        | Owner |
| -------------------------- | ------------------------------- | ----- |
| CC1–CC5 (Common Criteria)  | `docs/soc2-controls-mapping.md` | Sec   |
| A1 (Availability)          | SLO + burn-rate alerts          | SRE   |
| C1 (Confidentiality)       | Encryption at rest + KMS        | Sec   |
| P1–P8 (Privacy)            | GDPR controls + DSAR route      | DPO   |
| PI1 (Processing Integrity) | Integration tests + SBOM        | Eng   |

---

## GDPR Art. 30 — Records of Processing Activities (RoPA)

| Activity                 | Lawful basis        | Retention         | Doc                      |
| ------------------------ | ------------------- | ----------------- | ------------------------ |
| Affiliate click tracking | Consent             | 365 days          | Privacy policy           |
| Email newsletter         | Contract            | Until unsubscribe | Privacy policy           |
| Membership management    | Contract            | 7 years (tax)     | `docs/data-retention.md` |
| DSAR / erasure log       | Legal obligation    | 3 years           | `audit_log` table        |
| Error telemetry (Sentry) | Legitimate interest | 90 days           | Sentry retention policy  |

---

## Evidence Repository Layout

```
s3://groupsmix-compliance/
  pci/
    asv/          — quarterly ASV scan reports
    pentest/      — annual pen test reports
    saq/          — SAQ A + AoC
  soc2/
    readiness/    — gap assessment
    auditor/      — auditor artefacts (Type I / II)
  gdpr/
    dsar/         — anonymised DSAR records
    ropa/         — RoPA v{n}.pdf
    dpia/         — Data Protection Impact Assessments
```
