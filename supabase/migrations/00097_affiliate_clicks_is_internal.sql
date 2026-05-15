-- A158: Affiliate self-referral prevention.
--
-- Adds an is_internal flag to affiliate_clicks to distinguish between
-- legitimate visitor traffic and internal testing or self-referral
-- clicks by administrators.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'affiliate_clicks'
      AND column_name = 'is_internal'
  ) THEN
    ALTER TABLE public.affiliate_clicks
      ADD COLUMN is_internal BOOLEAN DEFAULT FALSE;
    
    COMMENT ON COLUMN public.affiliate_clicks.is_internal IS
      'A158: True if the click was identified as internal (e.g. from a logged-in admin).';
  END IF;
END $$;
