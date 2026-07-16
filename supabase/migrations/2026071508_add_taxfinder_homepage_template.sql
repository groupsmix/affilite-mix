-- Add the 'taxfinder' homepage template value to the sites (and
-- niche_templates) CHECK constraint, then switch the crypto-tools tenant
-- (cryptoranked.xyz — "Crypto Tax AU") to it.
--
-- The public homepage renders <TaxFinderHomepage /> — the situation-triage
-- answer engine — when site.homepage_template = 'taxfinder'
-- (app/(public)/page.tsx). Same drop-and-recreate dance as 2026071003
-- (Postgres cannot ALTER a CHECK constraint in place).

-- ── sites.homepage_template ─────────────────────────────────────────
ALTER TABLE sites DROP CONSTRAINT IF EXISTS sites_homepage_template_check;
ALTER TABLE sites ADD CONSTRAINT sites_homepage_template_check
  CHECK (homepage_template IN ('standard', 'cinematic', 'minimal', 'editorial', 'top10', 'compare', 'showcase', 'taxfinder'));

-- ── niche_templates.homepage_template ───────────────────────────────
ALTER TABLE niche_templates DROP CONSTRAINT IF EXISTS niche_templates_homepage_template_check;
ALTER TABLE niche_templates ADD CONSTRAINT niche_templates_homepage_template_check
  CHECK (homepage_template IN ('standard', 'cinematic', 'minimal', 'editorial', 'top10', 'compare', 'showcase', 'taxfinder'));

-- ── Switch cryptoranked.xyz to the new template ─────────────────────
-- lib/site-context reads homepage_template from the sites row (the config
-- file only supplies the fallback), so the live row must be updated for the
-- new homepage to render.
UPDATE sites SET homepage_template = 'taxfinder' WHERE slug = 'crypto-tools';
