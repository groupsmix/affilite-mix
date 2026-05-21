-- OF-01 follow-up: extend atomic erasure RPC to cover ALL subject tables.
-- Fixes audit finding: previous RPC only handled newsletter_subscribers and
-- memberships. Comments, wrist_shots, quiz_submissions, price_alerts, and
-- drip_enrollments were still being deleted from the API route in separate
-- statements. This rewrite collapses every write into one transaction and
-- returns row counts so the caller can attach them to the audit_log entry.

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
  v_lower text := lower(p_email);
  v_count_newsletter int := 0;
  v_count_membership int := 0;
  v_count_comment int := 0;
  v_count_wrist int := 0;
  v_count_quiz int := 0;
  v_count_price_alert int := 0;
  v_count_drip int := 0;
  v_summary jsonb;
begin
  if p_email is null or length(p_email) = 0 then
    raise exception 'erase_subject_data: email required';
  end if;
  if p_site_id is null then
    raise exception 'erase_subject_data: site_id required';
  end if;
  if p_actor is null or length(p_actor) = 0 then
    raise exception 'erase_subject_data: actor required';
  end if;

  delete from public.newsletter_subscribers
   where lower(email) = v_lower and site_id = p_site_id;
  get diagnostics v_count_newsletter = row_count;

  update public.memberships
     set email = 'erased+' || md5(email || p_site_id::text) || '@example.invalid',
         status = 'erased',
         updated_at = now()
   where lower(email) = v_lower and site_id = p_site_id;
  get diagnostics v_count_membership = row_count;

  if to_regclass('public.comments') is not null then
    execute format($f$
      update public.comments
         set user_email = 'erased+' || md5(user_email || %L) || '@example.invalid',
             body = '[erased]',
             updated_at = now()
       where lower(user_email) = %L and site_id = %L
    $f$, p_site_id::text, v_lower, p_site_id);
    get diagnostics v_count_comment = row_count;
  end if;

  if to_regclass('public.wrist_shots') is not null then
    execute format($f$
      delete from public.wrist_shots
       where lower(user_email) = %L and site_id = %L
    $f$, v_lower, p_site_id);
    get diagnostics v_count_wrist = row_count;
  end if;

  if to_regclass('public.quiz_submissions') is not null then
    execute format($f$
      delete from public.quiz_submissions
       where lower(email) = %L and site_id = %L
    $f$, v_lower, p_site_id);
    get diagnostics v_count_quiz = row_count;
  end if;

  if to_regclass('public.price_alerts') is not null then
    execute format($f$
      delete from public.price_alerts
       where lower(email) = %L and site_id = %L
    $f$, v_lower, p_site_id);
    get diagnostics v_count_price_alert = row_count;
  end if;

  if to_regclass('public.drip_enrollments') is not null then
    execute format($f$
      delete from public.drip_enrollments
       where lower(email) = %L
    $f$, v_lower);
    get diagnostics v_count_drip = row_count;
  end if;

  v_summary := jsonb_build_object(
    'newsletter', v_count_newsletter,
    'membership', v_count_membership,
    'comment', v_count_comment,
    'wrist_shot', v_count_wrist,
    'quiz_submission', v_count_quiz,
    'price_alert', v_count_price_alert,
    'drip_enrollment', v_count_drip
  );

  -- OF-02: immutable audit_log row written inside the same transaction.
  -- audit_log has no UPDATE/DELETE grants, so this row is immutable.
  insert into public.audit_log (actor, action, subject, site_id, payload, created_at)
  values (p_actor, 'gdpr.erasure', p_email, p_site_id, v_summary, now());

  return v_summary;
end;
$$;

revoke all on function public.erase_subject_data(text, uuid, text) from public;
grant execute on function public.erase_subject_data(text, uuid, text) to service_role;
