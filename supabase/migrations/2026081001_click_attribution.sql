-- Per-click commission attribution.
--
-- Outbound affiliate links carry the site's network tracking key (CJ `sid`,
-- Awin `clickref`, …) so ingested commission reports can be mapped to a site.
-- They carry nothing that identifies the click, so `commissions.product_id`
-- and `commissions.click_id` were never populated and `product_epc_stats`
-- stayed empty.
--
-- The redirect now appends a short opaque reference to that tracking key
-- (`<site key>-<click_ref>`) and records it here alongside the product that
-- was clicked. Commission ingestion splits the suffix off, resolves the site
-- from the prefix exactly as before, and resolves the click from the suffix.
alter table public.affiliate_clicks
add column if not exists click_ref text,
add column if not exists product_id uuid references public.products (id) on delete set null;

comment on column public.affiliate_clicks.click_ref is
  'Opaque per-click reference echoed to the affiliate network in its tracking/subid parameter. Used to attribute an ingested commission back to this click.';

comment on column public.affiliate_clicks.product_id is
  'Product that was clicked, when the click came from a resolvable product page. Lets an attributed commission inherit the product.';

-- Attribution looks a click up by reference exactly once per commission row,
-- and the reference must stay unique for that lookup to be unambiguous.
create unique index if not exists idx_clicks_click_ref
  on public.affiliate_clicks (click_ref)
  where click_ref is not null;

create index if not exists idx_clicks_product
  on public.affiliate_clicks (product_id, created_at desc)
  where product_id is not null;
