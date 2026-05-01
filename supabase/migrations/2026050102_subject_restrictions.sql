-- OF-02: Right-to-restriction (GDPR Art. 18) data model.
create table if not exists public.subject_restrictions (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null,
  email text not null,
  restricted_at timestamptz not null default now(),
  reason text,
  lifted_at timestamptz,
  created_by text not null,
  unique (site_id, email)
);
create index if not exists subject_restrictions_active_idx
  on public.subject_restrictions (site_id, email)
  where lifted_at is null;
alter table public.subject_restrictions enable row level security;
create policy subject_restrictions_service_only
  on public.subject_restrictions for all to service_role using (true) with check (true);
