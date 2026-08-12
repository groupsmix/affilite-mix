# Hardcoded configuration audit

**Scope:** exploratory review only; no runtime or configuration code was changed.

**Reviewed:** `app/`, `lib/`, `components/`, `scripts/`, `config/`, `wrangler.jsonc`, and GitHub workflows at the current branch tip.

## Verdict key

- **(a) must move** — broken or dangerous as-is.
- **(b) should move** — an operator is likely to change it without wanting a deploy.
- **(c) fine as a named constant** — genuinely fixed, or a security allowlist that should remain code-reviewed.
- **(d) test/dev-only** — no production action.

## Executive summary

The highest-risk findings are not the per-site definitions themselves. Those are an intentional static site catalog, and the repository also has DB-backed site rows. The material risks are fallback paths that select or advertise the wrong origin:

1. Build-time `allSites[0]` fallback selects the first registered tenant (`ai-compared`) when no explicit default exists.
2. Price-alert email origin falls back to global `APP_URL` after a site lookup failure, so a tenant's email can link to another site's domain.
3. `security.txt` falls back to `groupsmix.com` and `security@groupsmix.com`, which can publish the wrong contact and canonical URL.
4. EPC recomputation hard-limits each product/network click scan to 10,000 rows and explicitly warns that EPC may be understated.
5. Product/static affiliate catalogs, EPC estimates, optimization thresholds, and health scan controls are deploy-time values that an owner may reasonably want to tune.

Existing machinery is already present for most of these:

- `config/sites/*.ts` and `config/sites/index.ts` are the static site catalog.
- The `sites` table stores domains, names, contact information, and estimated revenue per click.
- `.env.example` documents `APP_URL`, `SITE_URL`, `NEXT_PUBLIC_DEFAULT_SITE`, `AFFILIATE_ALLOWED_DOMAINS`, and operational quota settings.
- `affiliate_networks` and `affiliate_tracking_keys` tables exist for network credentials and tracking identities.
- `affiliate_url` and product affiliate-link rows are DB-backed for ordinary products.

## Ranked findings

### 1. Build-time first-site fallback can misattribute generated SEO output

- **Location:** `lib/site-context.ts:156-177`; ordering in `config/sites/index.ts:12-19`.
- **Value:** `allSites[0]`, currently `aiComparedSite` (`id: "ai-compared"`, domain `compareai.site`).
- **Consumed by:** `getCurrentSite()` during `NEXT_PHASE=phase-production-build`; pages, metadata, sitemap generation, and other build-time site consumers.
- **Verdict:** **(a) must move**.
- **Why:** Normal requests throw when there is no header, cookie, or `NEXT_PUBLIC_DEFAULT_SITE`, but the production build deliberately returns the first static tenant. A missing build configuration can therefore generate canonical URLs/content for CompareAI rather than fail closed. The same behavior is coupled to array ordering, so adding or reordering a site changes the implicit tenant.
- **Existing machinery / duplication:** `NEXT_PUBLIC_DEFAULT_SITE` already exists in `.env.example:396`; `allSites[0]` is duplicated as the fallback mechanism and depends on `config/sites/index.ts` ordering.

### 2. Price-alert email links can cross tenants after site lookup failure

- **Location:** `app/api/cron/price-scrape/route.ts:134-156`.
- **Value:** `process.env.APP_URL` as a fallback origin.
- **Consumed by:** `resolveSiteOrigin()` when the product's site row cannot be loaded; generated “View Deal” price-alert email links.
- **Verdict:** **(a) must move**.
- **Why:** The code explicitly acknowledges that this can point at the canonical default site instead of the tenant. A DB outage, missing row, or bad site ID can silently send a WristNerd/primary-site URL for a product belonging to another site, losing attribution and confusing subscribers. Returning no link or failing the alert is safer than using a cross-tenant origin.
- **Existing machinery / duplication:** `sites.domain` is already the authoritative per-tenant source; `APP_URL` is documented in `.env.example:157` and hardcoded in `wrangler.jsonc:287,361`.

### 3. Generic `security.txt` fallback publishes the wrong owner/domain

- **Location:** `app/.well-known/security.txt/route.ts:74-86`.
- **Value:** `https://groupsmix.com/.well-known/security.txt` and `security@groupsmix.com`.
- **Consumed by:** The response returned when `getCurrentSite()` fails; security scanners and researchers use its `Contact`, `Canonical`, and `Policy` fields.
- **Verdict:** **(a) must move**.
- **Why:** On an unknown or unavailable tenant context, the response identifies the platform domain/contact rather than the requested site. This is a correctness issue for multi-site ownership and can misroute vulnerability reports. The site-specific path already uses `site.brand.contactEmail` or `security@${site.domain}` at lines 32-41.
- **Existing machinery / duplication:** Per-site contact emails already exist in `SiteDefinition`/the `sites` row. The GitHub policy URL is a fixed platform URL and is not itself a problem.

### 4. EPC recomputation silently caps correctness at 10,000 clicks

- **Location:** `app/api/cron/epc-recompute/route.ts:22-23,89-107`.
- **Value:** `CLICK_SCAN_LIMIT = 10_000`.
- **Consumed by:** The 30-day click query for every product/network group.
- **Verdict:** **(a) must move**.
- **Why:** The code logs `click scan hit its limit; EPC may be understated`. Under high traffic, the numerator and denominator are based on an incomplete click sample, affecting product ranking, optimization decisions, and revenue estimates. This is a correctness cap, not merely a performance preference.
- **Existing machinery / duplication:** `lib/dal/affiliate-clicks.ts` repeats `.limit(10_000)` in several query helpers. There is no operator setting for this cap. Keyset pagination or a rollup table would avoid a tunable-but-still-wrong ceiling.

### 5. Production `APP_URL` is hardcoded to one tenant in Wrangler

- **Location:** `wrangler.jsonc:281-287` and `wrangler.jsonc:357-362`.
- **Value:** `"https://wristnerd.xyz"` and `"https://staging.wristnerd.xyz"`.
- **Consumed by:** Runtime fallback paths for absolute URLs, including cron price-scrape fallback and local/dev-compatible checkout paths.
- **Verdict:** **(b) should move**.
- **Why:** The comments correctly say this is only a fallback, but an operator changing the primary site/domain must edit deployment configuration and redeploy. In the failure paths above, it also becomes a cross-tenant/misattribution source.
- **Existing machinery / duplication:** `.env.example:156-157` already exposes `APP_URL`; tenant domains already live in static config and DB. `wrangler.jsonc`, `.env.example`, and deploy variables can drift.

### 6. Landing-page canonical fallback is a hardcoded platform domain

- **Location:** `app/landing/layout.tsx:19-25`.
- **Value:** `https://affilite-mix.com`.
- **Consumed by:** The `/landing` metadata canonical when `SITE_URL` and `APP_URL` are absent.
- **Verdict:** **(b) should move**.
- **Why:** A missing environment value causes search engines to see a platform domain that is not necessarily the deployed canonical. This is SEO misconfiguration rather than affiliate attribution, but it can be corrected without a code deploy if the canonical is operator configuration.
- **Existing machinery / duplication:** `SITE_URL` and `APP_URL` are documented in `.env.example:484-485`; the fallback is duplicated conceptually with Wrangler `APP_URL`.

### 7. Static product affiliate URLs and prices are deploy-time catalog data

- **Location:** `lib/dial-config.ts:151-290` and related static guide/catalog entries.
- **Values:** Amazon product URLs such as `https://www.amazon.com/dp/B07QJP9TGP`, prices such as `145`, ratings/review counts, and watch-tier thresholds (`under-200`, `under-300`, `under-500`).
- **Consumed by:** WristNerd static guide/product cards, outbound affiliate redirects, and price/display copy.
- **Verdict:** **(b) should move**.
- **Why:** These are money-bearing destinations and volatile merchandising data. An operator cannot repair a dead product, update a price, or change a tracking destination without a deploy. Ordinary product rows and `product_affiliate_links` already provide a DB-backed path, but this static catalog bypasses it.
- **Existing machinery / duplication:** `products.affiliate_url`, `product_affiliate_links`, and affiliate-network tracking configuration already exist. These static URLs are separate from that machinery and can drift from DB products.

### 8. Default estimated revenue per click can produce misleading dashboard economics

- **Location:** `lib/analytics/epc.ts:4-12,21-38`; mirrored in `config/sites/index.ts:87`.
- **Value:** `DEFAULT_EST_REVENUE_PER_CLICK = 0.35`.
- **Consumed by:** Analytics dashboard revenue estimates when neither static site config nor DB `est_revenue_per_click` is available.
- **Verdict:** **(b) should move**.
- **Why:** A missing site configuration silently becomes `$0.35` per click, which can materially misstate revenue and ranking for a site. The value is explicitly a business estimate, not a protocol invariant.
- **Existing machinery / duplication:** The `sites` table has `est_revenue_per_click`; static `SiteDefinition.estRevenuePerClick` is the higher-priority source. The `0.35` fallback is duplicated in `lib/analytics/epc.ts` and `config/sites/index.ts`.

### 9. Optimization policy thresholds are hardcoded deploy-time business policy

- **Location:** `lib/automation/optimization.ts:3-8`.
- **Values:** action cap `5`, sample floor `100` clicks, dead-weight threshold `200` clicks, EPC multiplier `1.5`, cooldown `14` days, EPC freshness `48` hours.
- **Consumed by:** Daily affiliate optimization candidate selection and guarded mutation behavior.
- **Verdict:** **(b) should move**.
- **Why:** These directly decide which products get proposed, switched, archived, or promoted. A single owner may want to change risk appetite, traffic floors, or cooldowns without deploying. They are intentionally named constants and are preferable to magic numbers, but remain operator policy.
- **Existing machinery / duplication:** Policy defaults already exist in `lib/automation/policy.ts` and active policy overrides exist in the database. The optimization constants are a separate policy layer and should be checked for drift when policy overrides change.

### 10. Affiliate-link health scan and alert controls are operator-tunable

- **Location:** `app/api/cron/affiliate-link-health/route.ts:25-26`; `lib/affiliate-link-health-monitor.ts:13-15,89-115`.
- **Values:** product page size `100`, probe timeout `3_000ms`, failure alert threshold `3`, maximum email alert rows `20`, target batch size `32`; alert email timeout `8_000ms`.
- **Consumed by:** Link-health pagination/probing, cursor advancement, broken-link alerts, and alert email formatting.
- **Verdict:** **(b) should move**.
- **Why:** Traffic scale, merchant latency, and desired alert sensitivity vary by site. The page/batch and timeout values also determine how much of the catalog is checked per run, while the 20-row email cap can hide the full incident scope.
- **Existing machinery / duplication:** The cron route and monitor each own related limits; there is no site/operator configuration for them. Cron schedules and secrets are already centralized in `lib/cron-registry.ts`.

### 11. Affiliate-domain fallback list is hardcoded, but correctly remains code-reviewed

- **Location:** `lib/affiliate-domain-allowlist.ts:27-136`.
- **Values:** Amazon, CJ, Impact, ShareASale, Awin, Rakuten, Admitad, PartnerStack, ClickBank, eBay, Walmart, Target, crypto-tax, Etsy-tool, and watch-merchant domains.
- **Consumed by:** Affiliate URL writes and redirect destination validation.
- **Verdict:** **(c) fine as a named constant**.
- **Why:** This is a security allowlist protecting against open redirects, SSRF, and commission substitution. Keeping a reviewed baseline in code is appropriate; arbitrary DB editing would weaken a security boundary. The code supports additive `AFFILIATE_ALLOWED_DOMAINS` configuration and strict enforcement defaults.
- **Existing machinery / duplication:** The list overlaps with `lib/affiliate/networks.ts:68-205`, which separately stores network domains and tracking parameters. The overlap is a real drift risk: adding a network to one catalog but not the other can make it appear usable while redirects reject it.

### 12. Affiliate network identifiers and tracking parameters are fixed protocol metadata

- **Location:** `lib/affiliate/networks.ts:67-205`.
- **Values:** Network hosts, base URLs, and tracking names such as Amazon `tag`/`ascsubtag`, CJ `sid`, Awin `clickref`, Rakuten `u1`, Impact `subId1`, and Admitad `subid`.
- **Consumed by:** Network inference, redirect tracking decoration, commission ingestion selection, and affiliate-link health classification.
- **Verdict:** **(c) fine as a named constant**.
- **Why:** These describe third-party protocols and must be code-reviewed and tested rather than casually edited as business data. Publisher/site-specific values are not hardcoded here; they come from `affiliate_tracking_keys` or environment secrets.
- **Existing machinery / duplication:** Domains duplicate the security allowlist in finding 11. Network API keys use `envKeyName` and the `affiliate_networks` table, so credentials are not hardcoded.

### 13. Email sender fallbacks can produce invalid or wrong-brand mail

- **Location:** `app/api/cron/price-scrape/route.ts:239-242`; `lib/suspicious-login.ts:66-72`.
- **Values:** `noreply@example.com` and `noreply@affilite-mix.com`.
- **Consumed by:** Resend `from` fields for price-alert and suspicious-login emails when `NEWSLETTER_FROM_EMAIL` is missing.
- **Verdict:** **(a) must move**.
- **Why:** `example.com` is not a real sender, and `affilite-mix.com` is a platform brand rather than necessarily the tenant's configured sender. Depending on provider/domain verification, delivery can fail; otherwise the message can be sent under the wrong brand.
- **Existing machinery / duplication:** `.env.example` already documents `NEWSLETTER_FROM_EMAIL`; site definitions contain brand/contact email fields. Production should fail closed or require a verified configured sender instead of using these literals.

### 14. Commission adapter pagination and retry ceilings are tunable integration settings

- **Location:** `lib/commission-adapters.ts:11-19,38-43`; `app/api/cron/commission-ingest/route.ts:240-245`.
- **Values:** 3 retries, 1-second base delay, 10-second maximum delay, 30-second timeout, 100-page maximum, and Admitad page size `100`.
- **Consumed by:** CJ, Admitad, and PartnerStack commission-report fetching.
- **Verdict:** **(b) should move**.
- **Why:** Network API limits and report volume change independently of application deploys. A 100-page ceiling can omit commissions for a large account, while timeout/retry settings affect cron duration and provider load.
- **Existing machinery / duplication:** `fetchWithTimeout` has global defaults (`lib/fetch-timeout.ts:30-37`), while commission adapters override them. There is no per-network operator configuration.

### 15. Ad CPM defaults are business estimates, not protocol constants

- **Location:** `lib/ads/cpm-defaults.ts:10-25`.
- **Values:** Ads `2.5`, Carbon `3.0`, EthicalAds `2.0`, custom `1.5`, image `0`, and fallback `1.5` USD CPM.
- **Consumed by:** Dashboard/ad revenue estimation when a placement lacks an explicit `est_cpm`.
- **Verdict:** **(b) should move**.
- **Why:** CPMs vary by geography, season, placement, and negotiated rates. The code already supports a per-placement `config.est_cpm`; the provider defaults are still deploy-time estimates.
- **Existing machinery / duplication:** Per-placement `est_cpm` is the existing override. No global/site-level operator settings were found.

### 16. Load-test script localhost default is intentional

- **Location:** `scripts/load-test.mjs:15`.
- **Value:** `http://localhost:3000`.
- **Consumed by:** The load-test target when `SITE_URL` is absent.
- **Verdict:** **(d) test/dev-only**.
- **Why:** Localhost is an intentional safe default for a script whose documented usage is local or explicitly targeted staging testing.

### 17. DLQ-drain script can silently use localhost

- **Location:** `scripts/drain-dlq.ts:72-78`.
- **Value:** `http://localhost:3000`.
- **Consumed by:** The DLQ-drain command's default `target` when `APP_URL` is absent.
- **Verdict:** **(a) must move**.
- **Why:** For an operational drain, silently defaulting to localhost can make an operator believe a live queue was processed when it was not, or hide a missing target configuration. The command should require an explicit target in operational use.
- **Existing machinery / duplication:** `.env.example` documents `APP_URL`, and the script already reads it; there is no explicit required-target guard for the fallback.

## Lower-priority configuration observations

### Static site names, slugs, domains, and contact data

- **Locations:** `config/sites/ai-compared.ts:3-6,79-83`, `config/sites/calm-routine.ts:3-7`, `config/sites/crypto-tools.ts:24-28`, `config/sites/watch-tools.ts:3-7`, and the other `config/sites/*.ts` files.
- **Verdict:** **(c) fine as a named constant** for the registered static catalog.
- **Reason:** These are deliberately tenant definitions, not accidental literals. They are consumed by site resolution, SEO metadata, navigation, branding, and seed/sync derivation. The repository already has `toSiteRow()` in `config/sites/index.ts:78-108` to derive DB rows.
- **Drift risk:** Domains are also represented in `wrangler.jsonc` comments/routes, Terraform, and the `sites` table. The comments in `wrangler.jsonc:200-216` explicitly require keeping those sources synchronized. A domain change therefore has a real multi-file reconciliation cost, but moving all site identity to environment variables would be worse than the current named catalog.

### Fixed security, protocol, and resource-safety limits

The following were found but are not operator configuration findings and should remain named constants unless requirements change: URL/redirect length caps (`lib/safe-redirect.ts`), SSRF redirect-hop and DNS bounds (`lib/ssrf-guard.ts`), token/password/TOTP sizes and periods, JWT expiry/revocation coupling (`lib/auth-constants.ts`), body/parser limits, upload size limits, pagination safety ceilings, and affiliate click-reference length (`lib/affiliate/click-attribution.ts`). These protect correctness or security and should be code-reviewed rather than DB-editable.

### Editorial and test content

Hardcoded prices, ratings, review counts, dates, and plan descriptions in `lib/etsy-product-data.ts`, `lib/etsy-guides.ts`, `lib/dial-config.ts`, and landing-page demo sections are editorial content or demo fixtures. The static watch catalog is listed in finding 7 because it also supplies live affiliate destinations; the rest are **(d) test/dev-only** or editorial content with no runtime configuration action.

## Duplicated values and drift map

| Value/category         | Locations                                                                                                                  | Drift risk                                                                             |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Primary/default origin | `.env.example:156-157`, `wrangler.jsonc:287`, `wrangler.jsonc:361`, landing fallback, `APP_URL` consumers                  | High; a changed primary domain can leave email/SEO fallback paths pointing elsewhere.  |
| Default site           | `.env.example:396`, `lib/site-context.ts:160`, build fallback `allSites[0]`, `lib/admin-guard.ts:79`, token-login fallback | High; explicit env is good, but build-time first-site selection is unsafe.             |
| Site domains           | `config/sites/*.ts`, DB `sites`, Wrangler route inventory/comments, Terraform                                              | High; deployment and tenant resolution can disagree.                                   |
| Affiliate domains      | `lib/affiliate-domain-allowlist.ts`, `lib/affiliate/networks.ts`, DB product links                                         | Medium/high; security allowlist and network inference can drift.                       |
| Sender/contact email   | `SiteDefinition.brand.contactEmail`, DB site row, `NEWSLETTER_FROM_EMAIL`, hardcoded fallback senders                      | High for delivery/brand correctness.                                                   |
| EPC estimate           | `SiteDefinition.estRevenuePerClick`, DB `est_revenue_per_click`, `0.35` fallback                                           | Medium/high for dashboard economics and optimization decisions.                        |
| Runtime limits         | Route-local rate limits, cron scan caps, optimization constants, DAL limits                                                | Medium; related limits are often split across files and have no central operator view. |

## Recommended order for owner discussion

1. Remove or fail closed on cross-tenant URL/email/security fallbacks (findings 2, 3, and 13).
2. Replace the EPC 10,000-row cap with pagination/rollups (finding 4).
3. Make build-time site selection explicit rather than dependent on `allSites[0]` (finding 1).
4. Move live static affiliate products to the existing product/link tables (finding 7).
5. Decide which optimization and health thresholds belong in the existing policy/config machinery (findings 9 and 10).
6. Centralize primary-origin deployment configuration and reconcile the Wrangler/DB/static domain sources (finding 5).
7. Treat the allowlist/network catalogs as reviewed code, but add a drift test or generated relationship check (findings 11 and 12).
