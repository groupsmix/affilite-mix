-- Rename AI Compared site domain from aicompared.site to compareai.site
UPDATE sites
SET domain = 'compareai.site'
WHERE slug = 'ai-compared'
  AND domain = 'aicompared.site';
