-- Rollback: revert domain back to aicompared.site
UPDATE sites
SET domain = 'aicompared.site'
WHERE slug = 'ai-compared'
  AND domain = 'compareai.site';
