-- OF-05: Compliance hardening — atomic full-table DSAR erasure + audit row.
-- Drops the partial 2026050101 RPC (only covered newsletter+memberships) and
-- replaces it with a single transaction that erases the subject across every
-- table that holds personal data, then writes the audit_log row using the
-- *real* schema columns (entity_type/entity_id/details — not subject/payload,
-- which never existed on this table).

drop function if exists public.erase_subject_data(text, uuid, text);

create or replace function public.erase_subject_data(
  p_email text,
  p_site_id uuid,
  p_actor text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_email text := lower(p_email);
  v_counts jsonb := '{}'::jsonb;
  v_n int;
  v_anon_email text := 'erased+' || md5(v_email || coalesce(p_site_id::text, 'global')) || '@example.invalid';
begin
  if v_email is null or length(v_email) = 0 then
    raise exception 'erase_subject_data: email required';
  end if;
  if p_actor is null or length(p_actor) = 0 then
    raise exception 'erase_subject_data: actor required';
  end if;

  delete from public.newsletter_subscribers
   where lower(email) = v_email and site_id = p_site_id;
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('newsletter_subscribers', v_n);

  update public.memberships
     set email = v_anon_email,
         status = 'erased',
         updated_at = now()
   where lower(email) = v_email and site_id = p_site_id;
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('memberships', v_n);

  delete from public.comments
   where lower(user_email) = v_email and site_id = p_site_id;
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('comments', v_n);

  delete from public.wrist_shots
   where lower(user_email) = v_email and site_id = p_site_id;
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('wrist_shots', v_n);

  delete from public.quiz_submissions
   where lower(email) = v_email and site_id = p_site_id;
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('quiz_submissions', v_n);

  delete from public.price_alerts
   where lower(email) = v_email and site_id = p_site_id;
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('price_alerts', v_n);

  delete from public.drip_enrollments
   where lower(email) = v_email;
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('drip_enrollments', v_n);

  insert into public.audit_log
    (site_id, actor, action, entity_type, entity_id, details, created_at)
  values
    (p_site_id, p_actor, 'gdpr.erasure', 'subject', md5(v_email),
     jsonb_build_object('counts', v_counts, 'gdpr_basis', 'Art.17'),
     now());

  return v_counts;
end;
$$;

revoke all on function public.erase_subject_data(text, uuid, text) from public;
grant execute on function public.erase_subject_data(text, uuid, text) to service_role;
