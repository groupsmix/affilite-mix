-- Add the calmroutine homepage preset and seed the calm-routine site.
--
-- ROLLBACK:
--   1. DELETE FROM sites WHERE slug = 'calm-routine';
--   2. Revert the homepage_template check constraints to the previous value set
--      (remove 'calmroutine' if no other sites depend on it).

-- ── sites.homepage_template ────────────────────────────────────────────
ALTER TABLE sites DROP CONSTRAINT IF EXISTS sites_homepage_template_check;
ALTER TABLE sites ADD CONSTRAINT sites_homepage_template_check
  CHECK (homepage_template IN ('standard', 'cinematic', 'minimal', 'editorial', 'top10', 'compare', 'showcase', 'taxfinder', 'calmroutine'));

-- ── niche_templates.homepage_template ────────────────────────────────
ALTER TABLE niche_templates DROP CONSTRAINT IF EXISTS niche_templates_homepage_template_check;
ALTER TABLE niche_templates ADD CONSTRAINT niche_templates_homepage_template_check
  CHECK (homepage_template IN ('standard', 'cinematic', 'minimal', 'editorial', 'top10', 'compare', 'showcase', 'taxfinder', 'calmroutine'));

-- ── Seed calmroutine site ────────────────────────────────────────────
INSERT INTO sites (
  slug,
  name,
  domain,
  language,
  direction,
  is_active,
  monetization_type,
  est_revenue_per_click,
  theme,
  nav_items,
  footer_nav,
  features,
  meta_title,
  meta_description,
  homepage_template
)
VALUES (
  'calm-routine',
  'calmroutine',
  'calmroutine.site',
  'en',
  'ltr',
  true,
  'affiliate',
  0.35,
  '{"primaryColor":"#085041","accentColor":"#1D9E75","accentTextColor":"#085041","fontHeading":"Fraunces","fontBody":"Public Sans"}'::jsonb,
  '[{"label":"Home","href":"/"},{"label":"About","href":"/about"},{"label":"Tools","href":"/tools"},{"label":"Newsletter","href":"/newsletter"}]'::jsonb,
  '[{"label":"Affiliate Disclosure","href":"/affiliate-disclosure"},{"label":"Privacy","href":"/privacy"},{"label":"Contact","href":"/contact"}]'::jsonb,
  '{"newsletter":true,"rssFeed":true,"cookieConsent":true}'::jsonb,
  'calmroutine — Practical nervous system reset routines',
  'Body-based routines to reset your nervous system — morning, workday, and evening resets, somatic exercises, and honest reviews. Tools, not treatment.',
  'calmroutine'
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  domain = EXCLUDED.domain,
  is_active = EXCLUDED.is_active,
  theme = EXCLUDED.theme,
  nav_items = EXCLUDED.nav_items,
  footer_nav = EXCLUDED.footer_nav,
  features = EXCLUDED.features,
  meta_title = EXCLUDED.meta_title,
  meta_description = EXCLUDED.meta_description,
  homepage_template = EXCLUDED.homepage_template;
