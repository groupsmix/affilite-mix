-- OF-16: Unified cron checkpoint table for long-running jobs.
create table if not exists public.cron_state (
  job_name text primary key,
  last_processed_at timestamptz,
  last_id text,
  cursor jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
