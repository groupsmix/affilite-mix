-- Irreversible security migration.
--
-- The forward migration drops public.reorder_pages(jsonb), an obsolete
-- SECURITY DEFINER overload without tenant scoping. Rolling it back would
-- reintroduce a cross-tenant page-reorder risk, so this down migration is
-- intentionally a no-op while satisfying migration-pair tooling.
SELECT 1;
