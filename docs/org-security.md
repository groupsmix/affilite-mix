# Organizational Security Controls

> **Audit reference**: A207 (Assumed Breach), A208 (Purple-Team ATT&CK Validation)
> **Last updated**: 2026-04-30
> **Status**: DRAFT -- controls must be verified and enforced by the org admin

This document describes security controls that live **outside the codebase** but are
critical to the overall security posture. The code-side controls (RLS, CSP, audit logs,
rate limiting, etc.) are documented in [`threat-model.md`](threat-model.md) and
[`soc2-controls-mapping.md`](soc2-controls-mapping.md).

---

## 1. Cloudflare Account Security

### Role Assignments (Least Privilege)

| Role                | Who                                              | Permissions                                 |
| ------------------- | ------------------------------------------------ | ------------------------------------------- |
| Super Administrator | Org owner + 1 backup (A180: ≥ 2 humans required) | Full account access                         |
| Administrator       | Security lead                                    | All settings except billing                 |
| Workers Developer   | Developers                                       | Workers Scripts:Edit, KV:Edit, R2:Edit only |
| Analytics Viewer    | On-call / SRE                                    | Read-only analytics and logs                |

### Required Controls

- [ ] Enable mandatory 2FA for all Cloudflare account members
- [ ] Use scoped API tokens (not Global API Key) for all automation
- [ ] CI/CD (`CLOUDFLARE_API_TOKEN`) must be a scoped token with `Workers Scripts:Edit` only
- [ ] Rotate API tokens quarterly (see [`secrets-rotation-runbook.md`](secrets-rotation-runbook.md))
- [ ] Review account audit log monthly for unexpected role changes
- [ ] Disable Global API Key if not required
- [ ] Configure IP-based conditional access on the Cloudflare dashboard (A179-F4)

> **A180-F3 — Shared Account Prohibition:** Shared accounts are prohibited across all platforms. Every access credential must be tied to a named individual. Service accounts (e.g., CI/CD tokens) are permissible only when scoped to automation, audited, and owned by a named human.

---

## 2. GitHub Organization Security

### Branch Protection

- [ ] Require pull request reviews before merging to `main` (minimum 2 reviewers)
- [ ] Require status checks to pass (CI, CodeQL, Semgrep)
- [ ] Enforce CODEOWNERS review for security-sensitive paths:
  - `lib/security/`, `terraform/`, `wrangler.jsonc`, `.github/workflows/`
- [ ] Disable force push to `main`
- [ ] Require signed commits (recommended)

### Organization-Level Controls

- [ ] Enforce hardware MFA (WebAuthn/FIDO2) for all org members
- [ ] Enable SSO if available on the GitHub plan
- [ ] Require 2FA for all organization members
- [ ] Restrict repository creation to org admins
- [ ] Enable GitHub Advanced Security (secret scanning, code scanning)
- [ ] Review org audit log monthly for membership changes and permission escalations
- [ ] Configure IP allow-list for the GitHub organization (A179-F4)

---

## 3. Supabase Project Security

### Access Controls

- [ ] Limit project owner role to 1-2 people
- [ ] Use project-level roles (not org-level) for developers
- [ ] Never share the `service_role` key outside of `wrangler secret put`
- [ ] Enable MFA on all Supabase dashboard accounts
- [ ] Review the Supabase auth audit log monthly
- [ ] Configure IP restrictions on the Supabase dashboard (A179-F4)

### Database Security

- [ ] Service-role key is stored only in Cloudflare Worker secrets
- [ ] Direct database access (connection string) is restricted to migration pipelines
- [ ] Supabase Dashboard SQL editor access is logged and reviewed
- [ ] RLS is enabled on all tables (verified by `scripts/rls-policy-dump.sh`)

---

## 4. Developer Laptop Hardening

### Minimum Requirements

- [ ] Full-disk encryption enabled (FileVault / BitLocker / LUKS)
- [ ] Screen lock after 5 minutes of inactivity
- [ ] OS and browser kept up to date (auto-update enabled)
- [ ] No production secrets stored in `.env.local` (only build-time variables)
- [ ] SSH keys protected with a passphrase
- [ ] Git commit signing configured
- [ ] USB mass-storage access disabled or restricted (A182)

### Recommended

- [ ] EDR/antivirus solution installed
- [ ] VPN required for accessing admin dashboards
- [ ] Hardware security key (YubiKey) for GitHub and Cloudflare MFA
- [ ] Separate browser profile for admin dashboards (no extensions)

### MDM Recommendation (A182-F2)

Evaluate and deploy a lightweight MDM solution to enforce the controls above centrally:

- **macOS:** Mosyle Business (free for ≤ 30 devices) or Kandji
- **Windows:** Microsoft Intune (bundled with M365 Business Premium)
- **Linux:** Fleet or osquery-based compliance checks

MDM provides: remote wipe capability, FDE enforcement, OS patch compliance reporting, and USB control. Until MDM is deployed, quarterly self-attestation of the checklist above is required from every team member.

---

## 5. Third-Party Service Security

| Service   | MFA Required     | API Key Rotation | Access Review Cadence |
| --------- | ---------------- | ---------------- | --------------------- |
| Stripe    | Yes              | Quarterly        | Monthly               |
| Resend    | Yes              | Quarterly        | Monthly               |
| Sentry    | Yes              | Annually         | Quarterly             |
| Turnstile | N/A (zone-bound) | N/A              | Quarterly             |

---

## 6. Incident Response (Org-Side)

When a developer laptop compromise is suspected:

1. **Immediately** revoke the developer's GitHub org membership
2. **Immediately** revoke the developer's Cloudflare account access
3. **Rotate** all secrets the developer had access to (see [`secrets-rotation-runbook.md`](secrets-rotation-runbook.md))
4. **Review** GitHub audit log for the developer's recent actions
5. **Review** Cloudflare audit log for any Worker deployments or secret changes
6. **Follow** the full incident response playbook in [`incident-response.md`](incident-response.md)

---

## 7. Access Review Cadence

| Review                        | Frequency | Owner            |
| ----------------------------- | --------- | ---------------- |
| Cloudflare account membership | Monthly   | Security lead    |
| GitHub org membership         | Monthly   | Security lead    |
| Supabase project membership   | Monthly   | Security lead    |
| Stripe dashboard access       | Quarterly | Finance lead     |
| CI/CD secret inventory        | Quarterly | Security lead    |
| CODEOWNERS file accuracy      | Quarterly | Engineering lead |

### CODEOWNERS Recertification (A180)

Every quarter (aligned with the access recertification in `docs/access-recertification.md`), the Engineering Lead must verify:

1. Every team listed in `.github/CODEOWNERS` (`@groupsmix/engineering`, `@groupsmix/platform`, `@groupsmix/security`) has **≥ 2 active members** (no single point of failure for approvals).
2. No shared/service accounts are members of any CODEOWNERS team.
3. Team membership matches current employee roster (departures removed, new hires added).
4. Record the verification in the Recertification Log (`docs/access-recertification.md`).

### Evidence Links Guidance (A179)

Each `[ ]` checkbox in this document represents a control that must be **enforced and evidenced**, not merely aspirational. When checking a box:

1. Change `[ ]` to `[x]`.
2. Add an inline evidence link or reference, e.g.: `[x] Enable mandatory 2FA — [CF Dashboard screenshot 2026-Q2](<evidence-url>)`.
3. Record the verification date.

Until a checkbox has a dated evidence link, it is considered **not operating** for SOC 2 Type II purposes.

---

## 8. Offboarding Checklist

When a team member leaves:

- [ ] Remove from GitHub organization
- [ ] Remove from Cloudflare account
- [ ] Remove from Supabase project
- [ ] Remove from Stripe dashboard
- [ ] Remove from Sentry organization
- [ ] Remove from Resend dashboard
- [ ] Rotate any shared secrets the person had access to
- [ ] Review recent commits and deployments by the departing member
- [ ] Remove SSH keys from any shared infrastructure
- [ ] Update CODEOWNERS if the person was listed
- [ ] Collect company devices and verify FDE status
- [ ] Issue legal hold if applicable (coordinate with legal counsel)
- [ ] Obtain signed exit checklist (see `docs/templates/exit-checklist.md`)

> **A179-F3 — Deprovision SLA:** All access across GitHub, Cloudflare, Supabase, Stripe, Sentry, and Resend **must be revoked within 1 hour** of an employee's departure. The Engineering Lead is the designated owner of this SLA. For immediate-departure scenarios (termination, resignation with same-day exit), invoke §6 Incident Response (Org-Side) in parallel.

---

## 9. Assumed-Breach Mitigations (A207)

If a developer laptop is compromised, the attacker may reach production in under 30 minutes via cloned repos, local `.env`, and dashboard access. To limit blast radius:

1. **Never store production secrets in local `.env` files.** Use `wrangler secret` for production values; local `.env` should contain only development/test credentials.
2. **Enforce hardware MFA on all services** (GitHub, Cloudflare, Supabase) — a stolen session cookie alone should not grant access.
3. **Enable conditional access (IP restrictions)** on Cloudflare and Supabase dashboards — limit dashboard logins to known corporate/VPN IPs.
4. **Segment permissions** — developers should have `Workers Developer` (not `Administrator`) on Cloudflare, and project-level (not org-level) roles on Supabase.
5. **Monitor for anomalies** — insider-risk detection rules (A184) should flag unusual access patterns from developer accounts.
