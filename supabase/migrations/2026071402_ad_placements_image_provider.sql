-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 2026071402: allow the "image" ad provider
-- ═══════════════════════════════════════════════════════════════════════════
--
-- The Ad Placements feature previously only supported script-based ad networks
-- (adsense/carbon/ethicalads) and raw "custom" HTML, none of which ever
-- rendered on the public site. We now support self-served image/banner ads:
-- the owner uploads a creative (stored in R2, already allow-listed in the CSP
-- img-src) and sets a click-through URL. Those two values live in the existing
-- `config` jsonb (`image_url`, `click_url`, `alt`); `ad_code` stays null.
--
-- The provider CHECK constraint must accept the new "image" value.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.ad_placements DROP CONSTRAINT IF EXISTS ad_placements_provider_check;
ALTER TABLE public.ad_placements ADD CONSTRAINT ad_placements_provider_check
  CHECK (provider = ANY (ARRAY['adsense'::text, 'carbon'::text, 'ethicalads'::text, 'custom'::text, 'image'::text]));
