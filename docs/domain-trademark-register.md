# Domain & Trademark Register

> **A197 Remediation** — IP asset inventory including domains and trademarks.
> **Last updated:** 2026-05-30

---

## 1. Domain Portfolio

| Domain                    | Registrar         | Expiry  | Auto-Renew | DNSSEC   | Managed By     | Purpose                   |
| ------------------------- | ----------------- | ------- | ---------- | -------- | -------------- | ------------------------- |
| wristnerd.site            | (check registrar) | (check) | ☐ Verify   | ☐ Verify | Cloudflare DNS | Primary production domain |
| wristnerd.xyz             | (check registrar) | (check) | ☐ Verify   | ☐ Verify | Cloudflare DNS | Alternative / legacy      |
| arabictools.wristnerd.xyz | — (subdomain)     | —       | —          | —        | Cloudflare DNS | Arabic tools tenant       |
| crypto.wristnerd.xyz      | — (subdomain)     | —       | —          | —        | Cloudflare DNS | Crypto content tenant     |

### Action Items

- [ ] Verify all domain registrations and record expiry dates above.
- [ ] Enable auto-renew on all production domains.
- [ ] Enable DNSSEC on all domains (Cloudflare supports one-click DNSSEC).
- [ ] Enable registrar lock (clientTransferProhibited) to prevent unauthorized transfers.
- [ ] Set up domain expiry alerts (60 days and 30 days before expiry).

---

## 2. Trademark Status

| Mark         | Jurisdiction | Filing Status | Class | Filing Date | Registration # | Notes                                                             |
| ------------ | ------------ | ------------- | ----- | ----------- | -------------- | ----------------------------------------------------------------- |
| (none filed) | —            | —             | —     | —           | —              | Evaluate whether "Affilite-Mix" or "WristNerd" need TM protection |

### Trademark Action Items

- [ ] Evaluate whether the brand names need trademark protection.
- [ ] If yes, engage a trademark attorney for filing in relevant jurisdictions (US, EU).
- [ ] Monitor for trademark squatting or domain typosquatting.

---

## 3. Annual Review

- **Frequency:** Annual (aligned with Q1 board cyber metrics report).
- **Owner:** Engineering Lead + Legal Counsel.
- **Tasks:**
  1. Verify all domain registrations are current and auto-renewing.
  2. Review trademark filings and any infringement notices.
  3. Check for unauthorized subdomains (cross-reference with `docs/shadow-it-discovery.md` §1d).
  4. Update this register with any new domains or trademarks.
