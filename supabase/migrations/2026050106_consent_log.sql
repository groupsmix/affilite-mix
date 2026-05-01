-- OF-04: server-side consent proof.
create table if not exists public.consent_log (
  id bigserial primary key,
  site_id uuid not null,
  subject_id text,
  categories text[] not null,
  banner_version text not null,
  gpc boolean not null default false,
  ua_hash text not null,
  ip_truncated text not null,
  created_at timestamptz not null default now()
);
create index if not exists consent_log_subject_idx
  on public.consent_log (site_id, subject_id, created_at desc);
