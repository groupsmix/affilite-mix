# Multi-Site Architecture

> Last updated: 2026-04-20

## How It Works

Affilite-Mix serves multiple niche affiliate sites from a single codebase, database, and deployment. Each site gets its own domain, theme, language, content, and feature set — but shares all platform infrastructure.

### Request Flow

```
Browser → Cloudflare Worker → Middleware (domain → site_id) → Next.js App
```

1. **Middleware** (`middleware.ts`) resolves the incoming hostname to a `site_id`:
   - First tries static config lookup (`config/sites/index.ts` → `getSiteByDomain()`)
   - Falls back to async DB lookup via `/api/internal/resolve-site` for dashboard-managed domains
   - Injects `x-site-id` header into the request
   - Returns a styled 404 for unknown or deactivated domains
2. **Site context** (`lib/site-context.ts` → `getCurrentSite()`) reads `x-site-id` from headers and returns a `SiteDefinition` with the DB UUID as `id`
3. **DAL queries** filter all data by `site_id` — content, products, categories, clicks, newsletters, etc.

### Site Resolution Paths

| Layer             | Function                     | Source                    | When                                           |
| ----------------- | ---------------------------- | ------------------------- | ---------------------------------------------- |
| Middleware        | `getSiteByDomain(hostname)`  | Static config             | Known domains/aliases                          |
| Middleware        | `/api/internal/resolve-site` | Database                  | Dashboard-managed domains, wildcard subdomains |
| Server components | `getCurrentSite()`           | Header → config + DB      | Rendering pages                                |
| Admin panel       | `getActiveSiteSlug()`        | Cookie (`nh_active_site`) | Admin CRUD operations                          |
| DAL               | `resolveDbSiteId(slug)`      | Database                  | Converting slug → UUID for queries             |

### What Changed (Final Pass)

- Removed hardcoded `"watch-tools"` fallback from `getCurrentSite()` — now uses `NEXT_PUBLIC_DEFAULT_SITE` env var or first registered site
- Removed `WatchHomepage` special-case from homepage routing — all cinematic sites use the generic `CinematicHomepage` component via the `homepageTemplate` preset
- Replaced hardcoded site→topic mapping in AI content generation with niche-driven topic templates
- Made `getSuggestedNetwork()` in affiliate networks derive recommendations from site language/niche instead of hardcoded site IDs
- Made `setup-supabase-auth.ts` derive URLs from registered site configs instead of hardcoding `wristnerd.xyz`
- Removed duplicate `AffiliateClickRow` interface in `types/database.ts`
- Replaced hardcoded `wristnerd.xyz` fallback in `robots.ts` with `example.com` (only reached if zero sites are registered)

## What Is Shared vs Site-Specific

| Shared (all sites)               | Site-specific                  |
| -------------------------------- | ------------------------------ |
| Codebase & deployment            | Domain, aliases                |
| Database (Supabase)              | Content, products, categories  |
| Admin panel (with site switcher) | Theme (colors, fonts)          |
| Auth system (JWT, bcrypt)        | Language & direction (LTR/RTL) |
| Middleware, CSP, CSRF            | Navigation (header & footer)   |
| API routes                       | Feature flags                  |
| Image storage (R2)               | Monetization type & config     |
| Cron jobs                        | SEO metadata                   |
| Email templates                  | Homepage template preset       |
| Affiliate link builder           | Affiliate network preference   |

## Monetization Modes

Each site has a `monetization_type` field in the `sites` DB table:

| Mode        | Description                                                      |
| ----------- | ---------------------------------------------------------------- |
| `affiliate` | Revenue from affiliate link clicks (default)                     |
| `ads`       | Revenue from ad placements (AdSense, Carbon, EthicalAds, custom) |
| `both`      | Combined affiliate + ads                                         |

**How it works:**

- `monetization_type` is stored per-site in the DB (`sites.monetization_type`)
- `est_revenue_per_click` is per-site for analytics dashboard revenue estimates
- Ad placements (`ad_placements` table) are scoped by `site_id`
- Ad impressions are tracked per-site
- The admin panel shows monetization controls based on the active site's type

## Site Definition

Sites are defined in two places (either or both):

### 1. Static config (`config/sites/<id>.ts`)

Uses `defineSite()` for type-safe configuration with smart defaults:

```ts
export const coffeeGearSite = defineSite({
  id: "coffee-gear",
  name: "BrewPerfect",
  domain: "brewperfect.com",
  niche: "Coffee Equipment Reviews",
  colors: { primary: "#3C2415", accent: "#D4A574" },
  features: ["blog", "newsletter", "search", "comparisons"],
});
```

### 2. Database-only (via admin panel)

Sites created through the admin UI get a `SiteDefinition` constructed from their DB row at runtime (`siteDefinitionFromDbRow()` in `lib/site-context.ts`).

### Precedence

Static config is checked first (fast, no DB call). The DB UUID is resolved and injected as `site.id` for DAL queries. DB-only sites fall through to the DB lookup path.

## Admin Panel

- **Site switcher** — dropdown in the admin sidebar; sets `nh_active_site` cookie
- **Site management** — create/edit/deactivate sites at `/admin/sites`
- **All CRUD operations** are scoped to the active site via `adminGuard()` which reads the cookie, resolves the DB UUID, and passes it to DAL functions
- **Super-admins** can manage all sites; regular admins see only their assigned sites

---

## Add-a-Site Checklist

### Prerequisites

- [ ] Choose a site ID (kebab-case, e.g. `coffee-gear`)
- [ ] Choose a domain (e.g. `brewperfect.com`)
- [ ] Decide on niche, colors, language, and features

### Option A: CLI (recommended)

```bash
npm run add-site
```

This interactive script:

1. Creates `config/sites/<id>.ts` using `defineSite()`
2. Registers it in `config/sites/index.ts` (import + `allSites` array)
3. Prints next steps

### Option B: Manual

1. **Create config file** — copy an existing site in `config/sites/`, modify with `defineSite()`
2. **Register in index** — add import and entry to `allSites` array in `config/sites/index.ts`

### After config (both options)

3. **Insert DB row** — run the seed script or manually insert:

   ```sql
   INSERT INTO sites (slug, name, domain, language, direction, is_active, monetization_type)
   VALUES ('coffee-gear', 'BrewPerfect', 'brewperfect.com', 'en', 'ltr', true, 'affiliate');
   ```

   Or use `toSiteUpsertSQL()` from `config/sites/index.ts` to generate the full upsert.

4. **DNS** — point the domain to your Cloudflare Workers deployment:
   - Add a CNAME record: `brewperfect.com` → your worker subdomain
   - Or add the domain as a custom domain in Cloudflare Dashboard

5. **Cloudflare** — add the domain to your worker's routes in `wrangler.jsonc` or via dashboard

6. **Environment** — if the site needs its own Turnstile keys or R2 bucket, add them to `.env` / wrangler secrets

7. **Deploy** — `npm run deploy` (the site is automatically included)

8. **Verify** — visit the domain, check:
   - [ ] Homepage renders with correct theme
   - [ ] Admin panel shows the site in the switcher
   - [ ] Content/products are isolated (empty for new site)
   - [ ] Newsletter signup works
   - [ ] Affiliate click tracking works

### What you do NOT need to do

- No changes to `next.config.ts` (image domains are auto-derived)
- No changes to middleware (new static sites are auto-discovered; DB-only sites use async resolution)
- No changes to API routes (all are site-scoped via `x-site-id` header)

---

## Remaining Risks

### High

1. **Single Supabase project = shared failure domain.** A DB outage or RLS misconfiguration affects all sites simultaneously. Mitigation: RLS policies enforce `site_id` isolation at the DB level, but a policy bug could leak data cross-site.

2. **No per-site rate limiting.** Rate limits are global (by IP), not per-site. A traffic spike on one site could exhaust shared rate-limit quotas affecting others.

### Medium

3. **Cache coherence across sites.** Next.js ISR cache is shared — a `revalidatePath("/")` call could theoretically revalidate the wrong site's homepage if the site context isn't correctly propagated during revalidation.

4. **Static generation at build time.** `generateStaticParams` and static metadata functions run without request headers, so `getCurrentSite()` falls back to `allSites[0]`. Dynamic rendering (`export const dynamic = "force-dynamic"`) or per-site build steps would be needed for true multi-site static generation.

5. **Wildcard subdomain security.** Any `*.wristnerd.xyz` subdomain is auto-resolved via DB lookup. If an attacker creates a matching DNS record, middleware will serve a 404, but the DB query still runs.

### Low

6. **`setup-supabase-auth.ts` uses `require()`.** The script dynamically imports site configs with CommonJS `require()`. This works with `tsx` but could break if the project moves to pure ESM.

7. **DB-only sites have fewer features.** Sites created via admin panel (no static config) get default content types and limited feature flags from `siteDefinitionFromDbRow()`. Some features (custom nav structures, homepage template) may need manual DB JSON editing.

8. **Affiliate network suggestion is heuristic.** `getSuggestedNetwork()` uses keyword matching on niche/language. New niches that don't match existing patterns default to "direct" — operators should configure the network manually.
