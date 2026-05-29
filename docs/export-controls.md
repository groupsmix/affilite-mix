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

The platform does not currently implement country-level access blocking. If the platform expands to serve users in sanctioned jurisdictions, implement:

1. GeoIP-based access restrictions for OFAC-sanctioned countries.
2. User verification for high-risk jurisdictions.
3. Legal review of sanctions obligations.

For the current SaaS model serving affiliate content, no additional sanctions controls are required beyond Cloudflare's and Stripe's built-in compliance.
