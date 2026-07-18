-- Down migration for 2026071506_site_presentations.sql
DROP FUNCTION IF EXISTS public.rollback_site_presentation(uuid, uuid);
DROP FUNCTION IF EXISTS public.publish_site_presentation(uuid, uuid);
DROP TABLE IF EXISTS public.site_presentations;
