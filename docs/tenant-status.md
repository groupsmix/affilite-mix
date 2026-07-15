# Tenant Status

> **Due Diligence Artifact**
> **Last Updated:** 2026-06-12
> **Purpose:** Confirm which tenants are actually live in production

## Configured Sites

The platform has **5 sites** configured in `config/sites/index.ts`:

| Site ID        | Name         | Domain                      | Aliases            | Status     |
| -------------- | ------------ | --------------------------- | ------------------ | ---------- |
| `ai-compared`  | AI Compared  | `compareai.site`            | `ai.localhost`     | Configured |
| `arabic-tools` | Arabic Tools | `arabictools.wristnerd.xyz` | `arabic.localhost` | Configured |
| `crypto-tools` | CryptoRanked | `cryptoranked.xyz`          | `crypto.localhost` | Configured |
| `watch-tools`  | WristNerd    | `wristnerd.xyz`             | `watch.localhost`  | Configured |

**Note:** The audit document mentions "4 tenants" but the codebase contains 5 configured sites. This discrepancy may indicate:

- One site is not yet live in production
- One site is a development/staging tenant
- The audit document is outdated

---

## Site Details

### 1. AI Compared (`ai-compared`)

| Property              | Value                                                                            |
| --------------------- | -------------------------------------------------------------------------------- |
| **Domain**            | `compareai.site`                                                                 |
| **Niche**             | AI Tools & Software Reviews                                                      |
| **Description**       | In-depth reviews and comparisons of AI tools, platforms, and software            |
| **Language**          | English (default)                                                                |
| **Direction**         | LTR                                                                              |
| **Features**          | blog, newsletter, rssFeed, search, scheduling, comparisons, deals, cookieConsent |
| **Homepage Template** | minimal                                                                          |
| **Fonts**             | modern                                                                           |
| **Colors**            | Primary: #2E1065, Accent: #8B5CF6                                                |

**IaC Status:** ⚠️ **Externally-managed** - `compareai.site` is excluded from Terraform IaC due to externally-managed DNS records (see `terraform/cloudflare/externally-managed-domains.tf`)

---

### 2. Arabic Tools (`arabic-tools`)

| Property          | Value                                                              |
| ----------------- | ------------------------------------------------------------------ |
| **Domain**        | `arabictools.wristnerd.xyz`                                        |
| **Niche**         | Arabic Product Reviews                                             |
| **Description**   | مراجعات وأدوات عربية لمقارنة المنتجات والخدمات التقنية             |
| **Language**      | Arabic (`ar`)                                                      |
| **Direction**     | RTL                                                                |
| **Features**      | blog, newsletter, rssFeed, search, scheduling, comparisons         |
| **Content Types** | article (مقال), review (مراجعة), comparison (مقارنة), guide (دليل) |
| **Product Label** | منتج (singular), منتجات (plural)                                   |
| **Colors**        | Primary: #1E293B, Accent: #10B981                                  |

**IaC Status:** ✅ **IaC-managed** - Domain is managed via Terraform (`terraform/cloudflare/worker-domains.tf`)

---

### 3. CryptoRanked (`crypto-tools`)

| Property              | Value                                                                                  |
| --------------------- | -------------------------------------------------------------------------------------- |
| **Domain**            | `cryptoranked.xyz`                                                                     |
| **Niche**             | Crypto Exchanges & Wallet Reviews                                                      |
| **Description**       | Compare crypto exchanges, wallets, and DeFi tools — honest reviews and affiliate deals |
| **Language**          | English (default)                                                                      |
| **Direction**         | LTR                                                                                    |
| **Features**          | blog, newsletter, rssFeed, search, scheduling, comparisons, deals                      |
| **Homepage Template** | standard (default)                                                                     |
| **Fonts**             | modern                                                                                 |
| **Colors**            | Primary: #0F172A, Accent: #F59E0B                                                      |

**IaC Status:** ✅ **IaC-managed** - Domain is managed via Terraform (`terraform/cloudflare/worker-domains.tf`)

---

### 4. WristNerd (`watch-tools`)

| Property              | Value                                                                                                         |
| --------------------- | ------------------------------------------------------------------------------------------------------------- |
| **Domain**            | `wristnerd.xyz`                                                                                               |
| **Niche**             | Watch Gift Guides & Reviews                                                                                   |
| **Description**       | Expert watch gift guides and reviews — honest ratings and a proprietary Gift-Worthiness Score                 |
| **Language**          | English (default)                                                                                             |
| **Direction**         | LTR                                                                                                           |
| **Features**          | blog, brandSpotlights, comparisons, cookieConsent, deals, giftFinder, newsletter, rssFeed, search, scheduling |
| **Homepage Template** | cinematic                                                                                                     |
| **Fonts**             | classic                                                                                                       |
| **Product Label**     | Watch (singular), Watches (plural)                                                                            |
| **Colors**            | Primary: #1B2A4A, Accent: #8B6914, Accent Light: #C9A96E                                                      |

**IaC Status:** ✅ **IaC-managed** - Domain is managed via Terraform (`terraform/cloudflare/worker-domains.tf`)

---

## Production Status

**Blind Spot:** The actual production status (live vs. staging vs. development) of each tenant cannot be determined from the codebase alone. To confirm which tenants are live in production, the following verification is required:

### Verification Steps

1. **Check DNS resolution** for each domain:

   ```bash
   dig compareai.site
   dig arabictools.wristnerd.xyz
   dig cryptoranked.xyz
   dig wristnerd.xyz
   ```

2. **Check HTTP response** for each domain:

   ```bash
   curl -I https://compareai.site
   curl -I https://arabictools.wristnerd.xyz
   curl -I https://cryptoranked.xyz
   curl -I https://wristnerd.xyz
   ```

3. **Check Cloudflare Workers** custom domains:
   - Verify which domains are active in the Cloudflare Dashboard
   - Check `terraform/cloudflare/worker-domains.tf` for IaC-managed domains

4. **Check Supabase database** for active site records:
   ```sql
   SELECT slug, name, domain, is_active FROM sites;
   ```

---

## Tenant Discrepancy

**Issue:** The audit document mentions "4 tenants" but the codebase contains 5 configured sites.

**Possible Explanations:**

1. **AI Compared (`compareai.site`)** may be a development/staging tenant not yet live in production
2. **One database-managed site may be inactive** (`is_active = false`).
   For a site registered in `config/sites/`, the code configuration remains
   authoritative and a conflicting DB status is drift, not a runtime kill switch.
3. **The audit document is outdated** and doesn't reflect the current tenant count
4. **One site may be a redirect** or alias rather than a standalone tenant

---

## Required Actions

1. **Verify production status** - Check DNS, HTTP responses, and Cloudflare Dashboard to confirm which tenants are live
2. **Check database** - Query the `sites` table and compare it with
   `config/sites/`; only DB-managed tenants use `is_active` as the runtime switch
3. **Resolve discrepancy** - Determine why the audit mentions 4 tenants when 5 are configured
4. **Update documentation** - Once production status is confirmed, update this document with the actual live tenant count

---

## References

- `config/sites/index.ts` - Site configuration registry
- `config/sites/ai-compared.ts` - AI Compared site definition
- `config/sites/arabic-tools.ts` - Arabic Tools site definition
- `config/sites/crypto-tools.ts` - CryptoRanked site definition
- `config/sites/watch-tools.ts` - WristNerd site definition
- `terraform/cloudflare/worker-domains.tf` - IaC-managed custom domains
- `terraform/cloudflare/externally-managed-domains.tf` - Externally-managed domains
