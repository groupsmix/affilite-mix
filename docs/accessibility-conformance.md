# WCAG 2.2 AA Accessibility Conformance Statement

> **A201 Remediation** — Formal accessibility conformance statement per ADA Title III, EAA 2025, and AODA.

---

## Conformance Status

**Standard:** WCAG 2.2, Level AA  
**Assessed:** 2026-05-15  
**Next assessment:** 2026-11-15 (every 6 months)  
**Assessment method:** Internal audit + automated scan (axe-core / Playwright)

| Conformance Level  | Status                                            |
| ------------------ | ------------------------------------------------- |
| WCAG 2.2 Level A   | **Partially conformant** (see known issues below) |
| WCAG 2.2 Level AA  | **Partially conformant** (see known issues below) |
| WCAG 2.2 Level AAA | Not targeted                                      |

---

## Scope

This statement covers the web application served at:

- `https://wristnerd.xyz`
- `https://arabictools.wristnerd.xyz`
- `https://crypto.wristnerd.xyz`

The admin dashboard (`/admin`) is intended for authenticated staff only and is partially exempt from public accessibility requirements, but we aim for AA conformance there as well.

---

## Known Non-Conformances

| Criterion              | Issue                                                                 | Priority | Target fix |
| ---------------------- | --------------------------------------------------------------------- | -------- | ---------- |
| 1.4.3 Contrast Ratio   | Some secondary text elements fall below 4.5:1 ratio                   | High     | Q3 2026    |
| 2.4.7 Focus Visible    | Focus indicator not visible on some interactive controls in dark mode | High     | Q3 2026    |
| 1.1.1 Non-text Content | AI-generated product images lack descriptive alt text                 | Medium   | Q3 2026    |
| 4.1.3 Status Messages  | Toast notifications not announced to screen readers                   | Medium   | Q4 2026    |
| 2.1.1 Keyboard         | Some data table sort controls not keyboard-accessible                 | Low      | Q4 2026    |

---

## Remediation Roadmap

- **Q3 2026**: Color contrast fixes, focus indicator improvements, alt text pipeline for AI images
- **Q4 2026**: Screen reader announcements for dynamic content, keyboard navigation audit
- **Q1 2027**: Third-party audit (external accessibility firm), updated conformance statement

---

## Complaints and Feedback

If you experience accessibility barriers:

- **Email:** accessibility@groupsmix.com
- **Response SLA:** 5 business days for acknowledgement, 30 days for resolution or workaround

We are committed to ensuring digital accessibility for people with disabilities. We continually improve the user experience for everyone, and apply the relevant accessibility standards.

---

## Complaints Log

| Date                | Issue reported | Case ID | Status | Resolution |
| ------------------- | -------------- | ------- | ------ | ---------- |
| (no complaints yet) |                |         |        |            |

Identifying details for accessibility complaints must be stored only in internal restricted systems.

---

## Technical Approach

- **Automated testing:** axe-core via Playwright in CI (`e2e/` tests)
- **Manual testing:** Keyboard-only navigation quarterly; VoiceOver / NVDA quarterly
- **Color contrast:** Checked via Contrast Checker on every new UI component PR

### A201-F1 — External Audit Recommendation

Internal automated scans (axe-core) catch ~30-40% of accessibility issues. An external audit by a qualified firm is recommended to achieve meaningful AA conformance:

**Recommended firms (WCAG 2.2 specialists):**
- **Deque Systems** — offers VPAT creation + remediation guidance
- **Level Access** — provides ongoing monitoring + auditing
- **WebAIM** — academic-affiliated, cost-effective for smaller projects

**Scope for external audit:**
1. Full VPAT (Voluntary Product Accessibility Template) for the public-facing sites.
2. Manual testing with assistive technology (JAWS, NVDA, VoiceOver, TalkBack).
3. Keyboard-only navigation audit.
4. Color contrast analysis across all themes (light + dark mode).
5. Prioritized remediation roadmap.

**Timeline:** Commission the external audit in Q1 2027 (per the remediation roadmap above). Budget: $5,000–$15,000 depending on scope and firm.

**Evidence:** Store the VPAT and audit report in `docs/compliance-evidence/accessibility/`.

---

## Legal Basis

| Law                                   | Jurisdiction    | Applicability                                                               |
| ------------------------------------- | --------------- | --------------------------------------------------------------------------- |
| ADA Title III                         | United States   | Applies as a place of public accommodation operating in interstate commerce |
| European Accessibility Act (EAA) 2025 | EU              | Applies for EU-resident users from June 2025                                |
| AODA                                  | Ontario, Canada | Applies if serving Ontario users                                            |
| EN 301 549                            | EU              | Technical standard referenced by EAA                                        |
