-- Down migration for 2026071901_media_variants.sql
ALTER TABLE public.media
  DROP COLUMN IF EXISTS variants;
