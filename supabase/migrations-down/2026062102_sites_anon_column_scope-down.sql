-- Rollback: 2026062102_sites_anon_column_scope
--
-- Restore the original table-wide anon SELECT grant on public.sites.
-- (REVOKE clears the column-level grants first so the table-level grant is clean.)

REVOKE SELECT ON public.sites FROM anon;

GRANT SELECT ON public.sites TO anon;
