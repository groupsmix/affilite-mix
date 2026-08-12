delete from public.affiliate_link_health
where source_type = 'dial_watch';

drop index if exists public.idx_affiliate_link_health_dial_watch_destination;

alter table public.affiliate_link_health
  drop constraint if exists affiliate_link_health_source_check,
  drop column if exists source_name,
  drop column if exists source_key,
  drop column if exists source_type,
  alter column product_id set not null;
