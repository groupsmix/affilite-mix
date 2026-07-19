-- Per-site 301/302 redirect list, consumed by middleware on every public request.
-- Each entry is { source_path, destination_path, permanent }.
alter table public.sites
add column if not exists url_redirects jsonb not null default '[]'::jsonb;

comment on column public.sites.url_redirects is
  'JSON array of per-site URL redirects. Each object must have source_path and destination_path strings, and an optional permanent boolean (default false).';

-- GIN index makes looking up a redirect in the JSON array fast.
-- The application filters in code, so this is primarily a storage-level hint.
create index if not exists idx_sites_url_redirects on public.sites using gin (url_redirects jsonb_path_ops);
