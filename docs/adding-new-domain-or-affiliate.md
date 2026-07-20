# Adding a new domain or affiliate program

This runbook lists the exact steps an agent (or operator) must follow when adding either a new public domain or a new affiliate program/network. Skipping a step causes the site to be unreachable, the GA4 tag to break, or affiliate links to fail.

## Adding a new public domain

1. **Provision the domain in Cloudflare**
   - Add the domain as a `custom_domain` route in `wrangler.jsonc`.
   - Deploy via the `Deploy to Cloudflare` workflow on `main`.
   - Do not rely on Terraform for the initial provisioning unless you are ready to run `terraform apply`.
   - If the domain lives in a zone other than the primary one, add `zone_name` or `zone_id` to the route object.

2. **Map the domain to a site**
   - Add the new domain to the `aliases` array in the relevant `config/sites/*.ts` file, **or** create a new site config.
   - Insert or update the matching row in the Supabase `sites` table (`domain`, `aliases`, `is_active`).

3. **Cross-domain GA4 tracking**
   - Add the domain to `GA4_LINKER_DOMAINS` in `lib/analytics.ts`.
   - Use the same `G-3PQRHQ4MTF` measurement ID across all network sites.

4. **Search/sitemap**
   - `/sitemap.xml` and `/robots.txt` are generated per site automatically.
   - Verify the new domain returns `200 OK` and the `Sitemap:` line in `/robots.txt` is correct.

5. **Verify after deploy**
   - `curl -I https://<new-domain>` returns `200`.
   - `curl -s https://<new-domain> | grep "G-3PQRHQ4MTF"` shows the GA4 script.
   - Google Tag Assistant can see the tag.

## Adding a new affiliate program or network

1. **Identify the integration type**
   - **Generic tracked link** (no API): add the affiliate URL to each product (`products.affiliate_url` or `product_affiliate_links` table).
   - **Commission Junction (CJ)**: set `CJ_API_KEY` and `CJ_PUBLISHER_ID` repo secrets. The code auto-discovers deep links via `lib/affiliate/cj-client.ts`.
   - **Other network with an API**: add a client module under `lib/affiliate/<network>-client.ts` matching the `CjClientConfig` pattern, then wire it into `lib/affiliate/link-injection.ts`.

2. **Configure site-level credentials**
   - For per-site credentials, add a row to the `affiliate_networks` table:
     - `site_id`
     - `network` (e.g. `cj`, `shareasale`, `amazon`)
     - `publisher_id`
     - `api_key_ref` (use a secret reference, never a raw key)
     - `is_active`

3. **Add or update products**
   - Products live in the `products` table.
   - Set `affiliate_url` for a single default URL.
   - For multiple links per product, insert rows into `product_affiliate_links` (`product_id`, `network`, `url`, `is_primary`).

4. **Tracking / attribution**
   - If the network needs a tracking key (e.g. CJ `sid`), store it via the affiliate-tracking-keys flow in `lib/dal/affiliate-tracking-keys.ts`.
   - The link injector (`lib/affiliate/link-injection.ts`) will append the key to `/r/<slug>?ref=<contentSlug>&sid=...` shortcode links.

5. **Verify after adding**
   - Publish or preview a piece of content that mentions the product.
   - Confirm the rendered link goes through `/r/<product-slug>?ref=...` and resolves to the affiliate URL.
   - Check `affiliate_clicks` table after a click to ensure attribution is recorded.

## Common mistakes to avoid

- Adding a domain only to `config/sites/*.ts` but not to `wrangler.jsonc` routes: the site will not resolve.
- Forgetting to add a new domain to `GA4_LINKER_DOMAINS`: cross-domain sessions will break.
- Hard-coding affiliate API keys in code or config files: always use repo/org secrets or the `affiliate_networks.api_key_ref` column.
- Adding a new network without a matching client: the deep-link discovery will fall back to the product's `affiliate_url`.

## Files to touch

| Task                      | Files                                                                  |
| ------------------------- | ---------------------------------------------------------------------- |
| New domain routing        | `wrangler.jsonc`, `config/sites/*.ts`, `lib/analytics.ts`              |
| New site record           | Supabase `sites` table                                                 |
| New affiliate network API | `lib/affiliate/<network>-client.ts`, `lib/affiliate/link-injection.ts` |
| New affiliate credentials | `affiliate_networks` table, repo/org secrets                           |
| Product links             | `products.affiliate_url` or `product_affiliate_links` table            |
