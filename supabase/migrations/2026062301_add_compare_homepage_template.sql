-- DB-1: Add the 'compare' homepage template value to the sites (and
-- niche_templates) CHECK constraint.
--
-- The public homepage already renders <CompareHomepage /> when
-- site.homepage_template = 'compare' (app/(public)/page.tsx), and the
-- 'ai-compared' tenant is configured to use it — but the column's CHECK
-- constraint only allowed the original five values, so provisioning or
-- editing a compare site raised a 23514 check_violation. Extend the
-- allow-list to include 'compare'.
--
-- Postgres cannot ALTER a CHECK constraint in place, so we drop and
-- recreate it. The constraint names are the Postgres-default
-- "<table>_homepage_template_check" applied by 2026052701.

-- ── sites.homepage_template ─────────────────────────────────────────
ALTER TABLE sites DROP CONSTRAINT IF EXISTS sites_homepage_template_check;
ALTER TABLE sites ADD CONSTRAINT sites_homepage_template_check
  CHECK (homepage_template IN ('standard', 'cinematic', 'minimal', 'editorial', 'top10', 'compare'));

-- ── niche_templates.homepage_template ───────────────────────────────
ALTER TABLE niche_templates DROP CONSTRAINT IF EXISTS niche_templates_homepage_template_check;
ALTER TABLE niche_templates ADD CONSTRAINT niche_templates_homepage_template_check
  CHECK (homepage_template IN ('standard', 'cinematic', 'minimal', 'editorial', 'top10', 'compare'));
