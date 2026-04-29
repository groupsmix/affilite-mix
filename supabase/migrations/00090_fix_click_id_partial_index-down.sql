-- Reverse: recreate the non-partial unique index
DROP INDEX IF EXISTS idx_affiliate_clicks_click_id;
CREATE UNIQUE INDEX idx_affiliate_clicks_click_id ON public.affiliate_clicks(click_id);
