-- Rollback 2026071001: remove 'showcase' from homepage_template CHECK constraints.
-- NOTE: any rows already set to 'showcase' are first reset to 'standard' so the
-- tighter constraint can be re-applied without a 23514 violation.
UPDATE sites SET homepage_template = 'standard' WHERE homepage_template = 'showcase';
UPDATE niche_templates SET homepage_template = 'standard' WHERE homepage_template = 'showcase';

ALTER TABLE sites DROP CONSTRAINT IF EXISTS sites_homepage_template_check;
ALTER TABLE sites ADD CONSTRAINT sites_homepage_template_check
  CHECK (homepage_template IN ('standard', 'cinematic', 'minimal', 'editorial', 'top10', 'compare'));

ALTER TABLE niche_templates DROP CONSTRAINT IF EXISTS niche_templates_homepage_template_check;
ALTER TABLE niche_templates ADD CONSTRAINT niche_templates_homepage_template_check
  CHECK (homepage_template IN ('standard', 'cinematic', 'minimal', 'editorial', 'top10', 'compare'));

-- Restore wristnerd.xyz to its previous template.
UPDATE sites SET homepage_template = 'cinematic' WHERE slug = 'watch-tools';
