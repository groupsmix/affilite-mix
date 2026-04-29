-- Down migration for 00083: No-op.
-- This migration is idempotent and re-asserts RLS that 00068 already set.
-- Removing RLS would re-open the cross-tenant gap.
SELECT 1;
