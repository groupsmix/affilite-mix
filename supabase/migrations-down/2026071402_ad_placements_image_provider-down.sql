-- Down migration for 2026071402_ad_placements_image_provider.sql
-- Restores the original provider CHECK constraint (without "image").
-- NOTE: this will fail if any ad_placements row still has provider='image';
-- delete or convert those rows before rolling back.

ALTER TABLE public.ad_placements DROP CONSTRAINT IF EXISTS ad_placements_provider_check;
ALTER TABLE public.ad_placements ADD CONSTRAINT ad_placements_provider_check
  CHECK (provider = ANY (ARRAY['adsense'::text, 'carbon'::text, 'ethicalads'::text, 'custom'::text]));
