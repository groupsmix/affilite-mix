-- Rollback: remove the seeded calm-routine site.
DELETE FROM sites WHERE slug = 'calm-routine';
