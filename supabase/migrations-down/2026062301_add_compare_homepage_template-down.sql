-- Rollback 2026062301: remove 'compare' from homepage_template CHECK constraints.
-- NOTE: any rows already set to 'compare' are first reset to 'standard' so the
-- tighter constraint can be re-applied without a 23514 violation.
UPDATE sites SET homepage_template = 'standard' WHERE homepage_template = 'compare';
UPDATE niche_templates SET homepage_template = 'standard' WHERE homepage_template = 'compare';

ALTER TABLE sites DROP CONSTRAINT IF EXISTS sites_homepage_template_check;
ALTER TABLE sites ADD CONSTRAINT sites_homepage_template_check
  CHECK (homepage_template IN ('standard', 'cinematic', 'minimal', 'editorial', 'top10'));

ALTER TABLE niche_templates DROP CONSTRAINT IF EXISTS niche_templates_homepage_template_check;
ALTER TABLE niche_templates ADD CONSTRAINT niche_templates_homepage_template_check
  CHECK (homepage_template IN ('standard', 'cinematic', 'minimal', 'editorial', 'top10'));
