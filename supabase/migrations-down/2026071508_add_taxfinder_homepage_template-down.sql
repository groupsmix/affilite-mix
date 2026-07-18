-- Rollback 2026071508: remove 'taxfinder' from homepage_template CHECK
-- constraints. NOTE: any rows already set to 'taxfinder' are first reset to
-- 'standard' so the tighter constraint can be re-applied without a 23514
-- violation.
UPDATE sites SET homepage_template = 'standard' WHERE homepage_template = 'taxfinder';
UPDATE niche_templates SET homepage_template = 'standard' WHERE homepage_template = 'taxfinder';

ALTER TABLE sites DROP CONSTRAINT IF EXISTS sites_homepage_template_check;
ALTER TABLE sites ADD CONSTRAINT sites_homepage_template_check
  CHECK (homepage_template IN ('standard', 'cinematic', 'minimal', 'editorial', 'top10', 'compare', 'showcase'));

ALTER TABLE niche_templates DROP CONSTRAINT IF EXISTS niche_templates_homepage_template_check;
ALTER TABLE niche_templates ADD CONSTRAINT niche_templates_homepage_template_check
  CHECK (homepage_template IN ('standard', 'cinematic', 'minimal', 'editorial', 'top10', 'compare', 'showcase'));
