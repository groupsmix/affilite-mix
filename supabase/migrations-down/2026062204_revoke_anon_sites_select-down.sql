-- Down-migration for 2026062204: restore the column-scoped anon SELECT grant
-- and the public_read_sites policy (the 2026062102 state).
--
-- Reverting re-opens the anon sites-enumeration surface. Only run if a future
-- public reader genuinely needs anon-role access to `sites`.

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

DROP POLICY IF EXISTS "public_read_sites" ON public.sites;
CREATE POLICY "public_read_sites" ON public.sites
  FOR SELECT TO anon USING (is_active = true);
