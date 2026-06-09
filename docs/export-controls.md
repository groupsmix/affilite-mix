# Export Controls & Encryption Self-Classification

> **A198 Remediation** — ECCN classification and BIS 740.17 encryption notification.
> **Last updated:** 2026-05-29

---

## 1. Applicability

The Affilite-Mix platform uses standard encryption for:

- **TLS/HTTPS:** All traffic encrypted in transit via Cloudflare's edge TLS termination.
- **JWT signing:** HMAC-SHA256 for admin authentication tokens.
- **Password hashing:** bcrypt (with transparent PBKDF2 legacy upgrade).
- **Per-tenant encryption keys:** AES-256 for tenant-specific data at rest (see `docs/adr/0010`).

Under the Export Administration Regulations (EAR, 15 CFR), software employing encryption is subject to classification requirements.

---

## 2. ECCN Classification

| Item                                 | Encryption                              | Classification                         | Rationale                                                                                                                                                                                                            |
| ------------------------------------ | --------------------------------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web application (SaaS)               | TLS, JWT (HMAC-SHA256), bcrypt, AES-256 | **5D992** (mass market)                | Encryption is ancillary to the primary function (affiliate content management). The application is publicly available as a SaaS product. Qualifies for License Exception ENC §740.17(b)(1) — mass market encryption. |
| Source code (open-source components) | Same as above                           | **5D002** → eligible for TSU (§740.13) | Open-source code published on GitHub qualifies for the Technology and Software Unrestricted (TSU) exception.                                                                                                         |

---

## 3. BIS Notification

Under EAR §740.17(b), a one-time self-classification report and annual updates must be filed with BIS and the ENC Encryption Request Coordinator:

**Filing addresses:**

- BIS: `crypt@bis.doc.gov`
- ENC Coordinator: `enc@nsa.gov`

**Required information:**

- Product name: Affilite-Mix
- ECCN: 5D992
- Encryption algorithms: AES-256, HMAC-SHA256, bcrypt
- Key lengths: 256-bit (AES), 256-bit (HMAC)
- Classification basis: §740.17(b)(1) mass market

---

## 4. Action Items

- [ ] File BIS 740.17(b) one-time self-classification report
- [ ] File annual update by February 1 of each year
- [ ] Maintain this document as the internal ECCN classification record
- [ ] Review classification if new encryption features are added (e.g., E2E encryption, custom key management)

---

## 5. Sanctions Compliance

The platform does not currently implement country-level access blocking. Cloudflare's edge network and Stripe's payment processing include built-in sanctions screening, but the application layer should add defense-in-depth:

### 5a. Recommended: Cloudflare WAF GeoIP Blocking (A198-F1)

Block or challenge requests from OFAC-comprehensively-sanctioned countries using Cloudflare WAF custom rules:

1. Navigate to Cloudflare Dashboard → Security → WAF → Custom Rules.
2. Create a rule:
   - **Name:** `OFAC Sanctions — Block Comprehensive`
   - **Expression:** `(ip.geoip.country in {"CU" "IR" "KP" "SY" "RU"})`
   - **Action:** Block (or Managed Challenge for RU, depending on business decision)
3. For the admin panel (`/q7m-k4j9/*`), consider stricter rules:
   - **Expression:** `(ip.geoip.country ne "US" and ip.geoip.country ne "DE" and http.request.uri.path contains "/q7m-k4j9")`
   - **Action:** Block

### 5b. BIS Filing Reminder (A198-F2)

- [ ] **One-time filing:** Send the self-classification report to `crypt@bis.doc.gov` and `enc@nsa.gov` with the information in §3 above. No approval is required — this is a notification.
- [ ] **Annual update:** File by February 1 of each year. Set a calendar reminder for January 15.
- [ ] **Documentation:** Keep a copy of each filing (sent email) in `docs/compliance-evidence/` or a shared drive.

### 5c. SDN List Screening

If the platform adds user registration or payment processing beyond Stripe:

1. Screen users against the OFAC SDN (Specially Designated Nationals) list.
2. Use a third-party service (e.g., Chainalysis, ComplyAdvantage) for automated screening.
3. Block accounts matching SDN entries and notify legal counsel.
