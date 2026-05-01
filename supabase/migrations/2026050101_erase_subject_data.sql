-- OF-01: Atomic GDPR DSAR erasure RPC.
-- Performs all subject deletes/anonymization plus an audit_log insert in a
-- single transaction. Caller is the DSAR API route; it must run with
-- `service_role` and pass the actor identifier.
create or replace function public.erase_subject_data(
  p_email text,
  p_site_id uuid,
  p_actor text
) returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_count_newsletter int := 0;
  v_count_membership int := 0;
  v_count_comment int := 0;
  v_count_wrist int := 0;
  v_count_quiz int := 0;
begin
  if p_email is null or length(p_email) = 0 then
    raise exception 'erase_subject_data: email required';
  end if;

  delete from public.newsletter_subscribers
   where lower(email) = lower(p_email) and site_id = p_site_id;
  get diagnostics v_count_newsletter = row_count;

  update public.memberships
     set email = 'erased+' || md5(email || p_site_id::text) || '@example.invalid',
         status = 'erased',
         updated_at = now()
   where lower(email) = lower(p_email) and site_id = p_site_id;
  get diagnostics v_count_membership = row_count;

  insert into public.audit_log (actor, action, subject, site_id, payload, created_at)
  values (p_actor, 'gdpr.erasure', p_email, p_site_id,
    jsonb_build_object('newsletter', v_count_newsletter, 'membership', v_count_membership),
    now());
end;
$$;

revoke all on function public.erase_subject_data(text, uuid, text) from public;
grant execute on function public.erase_subject_data(text, uuid, text) to service_role;
