-- AI drafts were only accessible to service_role, so the admin dashboard
-- (which uses a site-scoped authenticated client) could not list or update
-- drafts created by the automation API. Add a tenant-isolation policy that
-- mirrors the one on content/products/pages.

drop policy if exists tenant_isolation_auth_ai_drafts on public.ai_drafts;

create policy tenant_isolation_auth_ai_drafts on public.ai_drafts
  for all to authenticated
  using (site_id = any(current_request_site_ids()))
  with check (site_id = any(current_request_site_ids()));
