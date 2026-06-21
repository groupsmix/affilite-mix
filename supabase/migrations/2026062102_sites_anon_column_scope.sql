-- Tier-2 audit Finding #6: column-scope the anon SELECT grant on public.sites.
--
-- Problem: the public_read_sites policy is `FOR SELECT TO anon USING
-- (is_active = true)` backed by a TABLE-WIDE column grant, so the browser-shipped
-- anon key can read every active tenant's full sites row — including
-- business-sensitive economics (est_revenue_per_click, monetization_type,
-- ad_config) — in a single PostgREST call (?select=*&is_active=eq.true).
--
-- Fix: revoke the table-wide grant and re-grant SELECT on only the columns public
-- rendering needs. Verified safe: the three sensitive columns are read solely by
-- the admin API and dashboard (authenticated/privileged), and the public render
-- path resolves sites via the AUTHENTICATED tenant client (getTenantClient), not
-- the anon role — getAnonClient() is used only for content/products/pages/
-- categories, never for `sites`. So no app code path reads `sites` under anon;
-- this only narrows the direct-REST anon attack surface and does not affect SSR.
--
-- Trade-off: columns added to `sites` later are NOT auto-exposed to anon (a safe
-- default). Add them to this grant explicitly if a future public reader needs them.

REVOKE SELECT ON public.sites FROM anon;

GRANT SELECT (
  id,
  slug,
  name,
  domain,
  language,
  direction,
  is_active,
  theme,
  logo_url,
  favicon_url,
  nav_items,
  footer_nav,
  features,
  meta_title,
  meta_description,
  og_image_url,
  social_links,
  homepage_template,
  product_card_style,
  created_at,
  updated_at
) ON public.sites TO anon;
