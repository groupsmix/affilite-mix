-- ═══════════════════════════════════════════════════════
-- Migration 00069: Index site_id on tenant-scoped tables that lack a
-- site_id-leading btree (LIVE-15)
-- ═══════════════════════════════════════════════════════
--
-- Live-audit finding LIVE-15 ("22 tables missing site_id index despite
-- being tenant-scoped"): a sweep of pg_indexes on the production project
-- (odgtwjkzwciohhhqdtti) revealed that several tables enforce a
-- `site_id = X` predicate via RLS but have no index that can serve it
-- with a leading equality. Every authenticated read therefore degrades
-- into a sequential scan once the table grows beyond a few thousand
-- rows.
--
-- Scope of this migration
-- -----------------------
-- The audit list contains 22 tables. After cross-checking each table
-- definition against the migration tree this migration only adds the
-- subset that
--
--   1. has a `site_id uuid` column directly on the table (i.e. tenant
--      isolation is asserted at the row level, not transitively
--      through a foreign key like `experiment_id` -> `experiments`);
--   2. has no existing index whose first column is `site_id` (a
--      partial index restricted to a narrow `WHERE` clause does not
--      count, since it cannot serve the general RLS predicate);
--
-- yielding the six tables below. Tables that don't carry `site_id`
-- directly (e.g. `experiment_assignments`, `drip_enrollments`,
-- `product_affiliate_links`) inherit isolation through a parent FK and
-- are out of scope here — indexing them on a non-existent column would
-- error.
--
-- Why btree-on-(site_id) and not a wider composite
-- ------------------------------------------------
-- The point of this migration is to give RLS a cheap equality lookup
-- for any query shape on these tables. Composite indexes already exist
-- where a hot query path was identified (e.g. `idx_memberships_site_status`
-- (site_id, status)). The remaining tables lack a known-hot secondary
-- column — adding `(site_id)` alone keeps the index narrow while
-- covering every RLS-filtered query. Future migrations can add wider
-- composites driven by EXPLAIN evidence.
--
-- Idempotent: every CREATE INDEX uses IF NOT EXISTS so re-running the
-- migration on a database where one or more indexes already exist
-- (e.g. created out-of-band by an operator) is a no-op for those
-- indexes.
--
-- Rollback: see 00069_site_id_indexes_for_rls-down.sql.
-- ═══════════════════════════════════════════════════════

-- ── comments ───────────────────────────────────────────────────────────
-- Existing index `idx_comments_pending` is partial WHERE status='pending'
-- and cannot serve the generic RLS site_id equality.
CREATE INDEX IF NOT EXISTS idx_comments_site
  ON comments (site_id);

-- ── drip_campaigns ─────────────────────────────────────────────────────
-- No existing index on site_id. RLS read path scans the table.
CREATE INDEX IF NOT EXISTS idx_drip_campaigns_site
  ON drip_campaigns (site_id);

-- ── price_alerts ───────────────────────────────────────────────────────
-- Existing `idx_price_alerts_email` leads with email; cannot serve a
-- bare site_id equality from RLS.
CREATE INDEX IF NOT EXISTS idx_price_alerts_site
  ON price_alerts (site_id);

-- ── quiz_submissions ───────────────────────────────────────────────────
-- Existing `idx_quiz_submissions_email` is partial (email IS NOT NULL)
-- and email-leading. Add a site_id-leading index for RLS reads.
CREATE INDEX IF NOT EXISTS idx_quiz_submissions_site
  ON quiz_submissions (site_id);

-- ── quizzes ────────────────────────────────────────────────────────────
-- No site_id index of any kind. The UNIQUE(site_id, slug) constraint on
-- the table creates a unique index but only for slug lookups; a single
-- column site_id index keeps cardinality-1 lookups (admin list, RLS)
-- cheap without forcing slug into the key.
CREATE INDEX IF NOT EXISTS idx_quizzes_site
  ON quizzes (site_id);

-- ── experiments ────────────────────────────────────────────────────────
-- No site_id index. Same rationale as quizzes — the UNIQUE(site_id, slug)
-- constraint covers slug lookups but not generic RLS site_id reads.
CREATE INDEX IF NOT EXISTS idx_experiments_site
  ON experiments (site_id);
