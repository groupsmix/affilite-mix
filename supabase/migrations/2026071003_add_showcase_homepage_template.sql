-- Add the 'showcase' homepage template value to the sites (and
-- niche_templates) CHECK constraint.
--
-- The public homepage renders <ShowcaseHomepage /> when
-- site.homepage_template = 'showcase' (app/(public)/page.tsx), and the
-- 'watch-tools' tenant (wristnerd.xyz) is configured to use it. Same
-- drop-and-recreate dance as 2026062301 (Postgres cannot ALTER a CHECK
-- constraint in place).

-- ── sites.homepage_template ─────────────────────────────────────────
ALTER TABLE sites DROP CONSTRAINT IF EXISTS sites_homepage_template_check;
ALTER TABLE sites ADD CONSTRAINT sites_homepage_template_check
  CHECK (homepage_template IN ('standard', 'cinematic', 'minimal', 'editorial', 'top10', 'compare', 'showcase'));

-- ── niche_templates.homepage_template ───────────────────────────────
ALTER TABLE niche_templates DROP CONSTRAINT IF EXISTS niche_templates_homepage_template_check;
ALTER TABLE niche_templates ADD CONSTRAINT niche_templates_homepage_template_check
  CHECK (homepage_template IN ('standard', 'cinematic', 'minimal', 'editorial', 'top10', 'compare', 'showcase'));

-- ── Switch wristnerd.xyz to the new template ────────────────────────
-- lib/site-context reads homepage_template from the sites row (the
-- config file only supplies the fallback), so the live row must be
-- updated for the new homepage to render.
UPDATE sites SET homepage_template = 'showcase' WHERE slug = 'watch-tools';
