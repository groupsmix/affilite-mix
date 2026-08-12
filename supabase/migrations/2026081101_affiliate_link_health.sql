create table if not exists public.affiliate_link_health (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  product_affiliate_link_id uuid references public.product_affiliate_links(id) on delete cascade,
  url text not null,
  network text not null default 'direct',
  last_probed_at timestamptz,
  last_http_status integer,
  final_url text,
  baseline_registrable_domain text,
  latency_ms integer,
  consecutive_failures integer not null default 0 check (consecutive_failures >= 0),
  failure_streak_started_at timestamptz,
  classification text not null default 'broken'
    check (classification in ('healthy', 'broken', 'suspicious')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_affiliate_link_health_primary_destination
  on public.affiliate_link_health (site_id, product_id, url)
  where product_affiliate_link_id is null;

create unique index if not exists idx_affiliate_link_health_link_destination
  on public.affiliate_link_health (site_id, product_id, product_affiliate_link_id, url)
  where product_affiliate_link_id is not null;

create index if not exists idx_affiliate_link_health_site_classification
  on public.affiliate_link_health (site_id, classification, consecutive_failures desc, updated_at desc);

create index if not exists idx_affiliate_link_health_product
  on public.affiliate_link_health (product_id);

alter table public.affiliate_link_health enable row level security;

create policy affiliate_link_health_service_only
  on public.affiliate_link_health
  for all to service_role
  using ((select auth.role()) = 'service_role')
  with check ((select auth.role()) = 'service_role');

revoke all on public.affiliate_link_health from anon, authenticated;
