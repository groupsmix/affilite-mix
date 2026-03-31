# Deployment Guide — Wildcard DNS & Automatic Subdomain Routing

## Overview

Affilite-Mix uses **wildcard DNS** so that any new niche site (subdomain) works automatically
without manual Cloudflare DNS configuration. Once the one-time setup below is complete,
creating a new site in the admin panel with domain `my-niche.writnerd.site` will
make it live immediately.

## One-Time Cloudflare Setup

### 1. Add a Wildcard CNAME Record

In your Cloudflare dashboard for the `writnerd.site` zone:

1. Go to **DNS → Records**
2. Add a new record:
   - **Type:** `CNAME`
   - **Name:** `*` (this is the wildcard)
   - **Target:** your Cloudflare Pages deployment URL (e.g. `affilite-mix.pages.dev`)
   - **Proxy status:** Proxied (orange cloud)
   - **TTL:** Auto
3. Click **Save**

> **Note:** If you already have specific subdomain records (e.g. `crypto.writnerd.site`),
> those will take precedence over the wildcard. The wildcard only matches subdomains
> that don't have their own explicit DNS record.

### 2. Enable SSL/TLS for Wildcard Subdomains

1. Go to **SSL/TLS → Overview**
2. Set encryption mode to **Full (strict)**
3. Go to **SSL/TLS → Edge Certificates**
4. Verify that **Universal SSL** is enabled (it covers `*.writnerd.site` by default)
5. If you need deeper wildcard coverage (e.g. `*.sub.writnerd.site`), you'll need
   an **Advanced Certificate Manager** — but single-level wildcards are covered for free.

### 3. Configure Custom Domains in Cloudflare Pages

1. Go to **Workers & Pages → affilite-mix → Custom domains**
2. Add `*.writnerd.site` as a custom domain
3. Cloudflare will automatically provision SSL certificates for all matching subdomains

### 4. Verify It Works

After DNS propagation (usually instant with Cloudflare proxy):

1. Create a new site in the admin panel with domain `test.writnerd.site`
2. Visit `https://test.writnerd.site`
3. You should see the site's content (or "Niche Not Found" if the site is inactive)

## How It Works

### Request Flow

```
Browser → Cloudflare DNS (*.writnerd.site → Pages)
       → Cloudflare Pages → Next.js Middleware
       → Middleware extracts hostname (e.g. "coffee.writnerd.site")
       → Try static config lookup (config/sites/*.ts)
       → If not found, check if it's a wildcard subdomain
       → Async DB lookup via /api/internal/resolve-site
       → If site found & active → inject x-site-id header → serve site
       → If site not found or inactive → show "Niche Not Found" page
```

### Adding a New Site

After the one-time Cloudflare setup, adding a new site is purely a database operation:

1. Go to **Admin → Site Management**
2. Click **+ Add Site**
3. Fill in the details:
   - **Slug:** `coffee-gear` (kebab-case identifier)
   - **Name:** `BrewPerfect`
   - **Domain:** `coffee.writnerd.site`
4. Configure theme, navigation, features, etc.
5. Click **Create Site**
6. The site is now live at `https://coffee.writnerd.site`

No DNS changes required!

## Wildcard Parent Domains

The list of parent domains that support wildcard subdomains is configured in
`config/sites/index.ts` via the `WILDCARD_PARENT_DOMAINS` array:

```typescript
export const WILDCARD_PARENT_DOMAINS = ["writnerd.site"];
```

To add another parent domain (e.g. `myniche.com`):

1. Add it to the array
2. Set up the wildcard CNAME in that domain's Cloudflare zone
3. Add the wildcard custom domain in Cloudflare Pages

## Troubleshooting

| Issue | Solution |
|---|---|
| "Niche Not Found" for a valid site | Check that the site's `domain` field in the DB matches exactly (e.g. `coffee.writnerd.site`) and that `is_active` is `true` |
| SSL certificate error | Wait a few minutes for Cloudflare to provision the certificate, or check that Universal SSL is enabled |
| Subdomain not resolving | Verify the wildcard CNAME record exists in Cloudflare DNS |
| Existing subdomain stopped working | Explicit DNS records take priority over wildcards — make sure you haven't accidentally deleted one |
