drop index if exists public.idx_clicks_product;
drop index if exists public.idx_clicks_click_ref;

alter table public.affiliate_clicks
drop column if exists product_id,
drop column if exists click_ref;
