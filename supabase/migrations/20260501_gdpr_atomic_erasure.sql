-- OF-01: Atomic GDPR erasure RPC
-- OF-02: processing_restricted_at column for restriction right

-- Add processing_restricted_at to memberships
alter table public.memberships
  add column if not exists processing_restricted_at timestamptz;

create index if not exists memberships_restricted_idx
  on public.memberships (processing_restricted_at)
  where processing_restricted_at is not null;

-- Atomic erasure function
create or replace function public.apply_gdpr_erasure(
  p_email text,
  p_site_id uuid,
  p_anonymized_email text
) returns void
language plpgsql
security definer
as $$
begin
  -- 1. Delete newsletter subscriptions
  delete from public.newsletter_subscribers
  where site_id = p_site_id and email = p_email;

  -- 2. Anonymize memberships (financial records — retained for legal)
  update public.memberships
  set email = p_anonymized_email,
      name = null,
      updated_at = now()
  where site_id = p_site_id and email = p_email;

  -- 3. Delete comments
  delete from public.comments
  where site_id = p_site_id and user_email = p_email;

  -- 4. Delete wrist shots
  delete from public.wrist_shots
  where site_id = p_site_id and user_email = p_email;

  -- 5. Delete quiz submissions
  delete from public.quiz_submissions
  where site_id = p_site_id and email = p_email;

  -- 6. Delete price alerts
  delete from public.price_alerts
  where site_id = p_site_id and email = p_email;

  -- affiliate_clicks and audit_log retained for legal/financial compliance
end;
$$;
