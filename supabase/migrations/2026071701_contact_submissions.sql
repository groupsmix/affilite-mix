-- Contact form submissions per site
-- Stores enquiries from public /contact forms until an outbound email integration is wired.

create table if not exists public.contact_submissions (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  name text,
  email text not null,
  subject text,
  message text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

comment on table public.contact_submissions is 'Contact form submissions per site';

-- Performance
create index if not exists contact_submissions_site_id_created_at_idx
  on public.contact_submissions (site_id, created_at desc);

-- RLS: service role has full access; tenant-authenticated requests can only
-- insert for the site_id carried in their JWT app_metadata claim.
alter table public.contact_submissions enable row level security;

drop policy if exists "Service role full access on contact_submissions" on public.contact_submissions;

create policy "Service role full access on contact_submissions"
  on public.contact_submissions
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists tenant_isolation_auth_contact_submissions on public.contact_submissions;

create policy tenant_isolation_auth_contact_submissions
  on public.contact_submissions
  for all
  to authenticated
  using (site_id = any(current_request_site_ids()))
  with check (site_id = any(current_request_site_ids()));
