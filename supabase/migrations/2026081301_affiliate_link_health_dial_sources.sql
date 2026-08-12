alter table public.affiliate_link_health
  alter column product_id drop not null;

alter table public.affiliate_link_health
  add column if not exists source_type text not null default 'product',
  add column if not exists source_key text not null default '',
  add column if not exists source_name text;

update public.affiliate_link_health
set source_key = product_id::text
where source_type = 'product' and source_key = '';

alter table public.affiliate_link_health
  add constraint affiliate_link_health_source_check
  check (
    (source_type = 'product' and product_id is not null and source_key <> '')
    or (
      source_type = 'dial_watch'
      and product_id is null
      and product_affiliate_link_id is null
      and source_key <> ''
      and source_name is not null
    )
  );

create unique index if not exists idx_affiliate_link_health_dial_watch_destination
  on public.affiliate_link_health (site_id, source_type, source_key, url)
  where source_type = 'dial_watch';
