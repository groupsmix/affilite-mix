-- OF-03 / OF-27: Immutable audit_log table.
create table if not exists public.audit_log (
  id bigserial primary key,
  actor text not null,
  action text not null,
  subject text,
  site_id uuid,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_log_action_created_idx
  on public.audit_log (action, created_at desc);
alter table public.audit_log enable row level security;
create policy audit_log_service_insert
  on public.audit_log for insert to service_role with check (true);
revoke update, delete on public.audit_log from public, anon, authenticated, service_role;
