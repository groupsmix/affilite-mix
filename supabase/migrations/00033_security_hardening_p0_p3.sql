-- ═══════════════════════════════════════════════════════
-- Migration 00033: Security hardening — P0/P1/P2 follow-up
-- ═══════════════════════════════════════════════════════
--
-- Closes the remaining findings from the post-audit scorecard against
-- migrations 00028–00031.  All changes are idempotent and safe to re-run.
--
--   P0-A  ai_drafts / affiliate_networks RLS policies used USING (true)
--         WITH CHECK (true), which grants every role (including anon) full
--         read/write access.  Tighten to service_role only, matching every
--         other admin table.
--   P1-B  site_modules, site_feature_flags, roles, permissions,
--         role_permissions, integration_providers exposed internal platform
--         configuration to the anon key via FOR SELECT USING (true).
--         All reads already go through the service-role DAL, so the public
--         SELECT policies are removed outright.  The *_service_all policies
--         already cover ALL verbs, so nothing else is needed.
--   P1-C  web_vitals anon INSERT previously accepted completely empty
--         payloads.  Add a CHECK constraint that requires a non-empty metric
--         name and a finite, non-negative numeric value.
--   P2-F  Add index on newsletter_subscribers(status) — the unsubscribe and
--         analytics queries filter on this column.
--   P2-G  Add composite index sites(id, is_active).  The public RLS policies
--         added in migration 00031 now run EXISTS (SELECT 1 FROM sites
--         WHERE sites.id = X.site_id AND sites.is_active = true) per row;
--         an index-only scan on (id, is_active) removes the heap fetch.
-- ═══════════════════════════════════════════════════════

-- ── P0-A: ai_drafts ──────────────────────────────────────────────────
-- Replace the wide-open policy with service-role-only access.
DROP POLICY IF EXISTS "ai_drafts_service_all" ON ai_drafts;
DROP POLICY IF EXISTS ai_drafts_service_all ON ai_drafts;
CREATE POLICY "ai_drafts_service_all" ON ai_drafts
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ── P0-A: affiliate_networks ─────────────────────────────────────────
-- Same fix as ai_drafts.
DROP POLICY IF EXISTS "affiliate_networks_service_all" ON affiliate_networks;
DROP POLICY IF EXISTS affiliate_networks_service_all ON affiliate_networks;
CREATE POLICY "affiliate_networks_service_all" ON affiliate_networks
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ── P1-B: remove public SELECT policies on internal config tables ────
-- These tables are only consumed server-side via getServiceClient().
-- Every DAL (lib/dal/{modules,feature-flags,integrations,permissions}.ts)
-- uses the service client, so removing the public SELECT policy does not
-- break any user-facing flow and closes an info-disclosure leak.
DROP POLICY IF EXISTS "site_modules_public_read"        ON site_modules;
DROP POLICY IF EXISTS "site_feature_flags_public_read"  ON site_feature_flags;
DROP POLICY IF EXISTS "roles_public_read"               ON roles;
DROP POLICY IF EXISTS "permissions_public_read"         ON permissions;
DROP POLICY IF EXISTS "role_permissions_public_read"    ON role_permissions;
DROP POLICY IF EXISTS "integration_providers_public_read" ON integration_providers;

-- ── P1-C: web_vitals anon INSERT validation ──────────────────────────
-- Require a non-empty metric name, and a finite, non-negative numeric
-- value.  Rejects the most obvious abuse (empty rows, negative / infinite
-- values) at the database level without requiring application changes.
-- Wrapped in DO block so re-running the migration does not error out on
-- the duplicate ALTER.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'web_vitals_name_not_empty'
  ) THEN
    ALTER TABLE web_vitals
      ADD CONSTRAINT web_vitals_name_not_empty
      CHECK (char_length(trim(name)) > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'web_vitals_value_finite_nonneg'
  ) THEN
    ALTER TABLE web_vitals
      ADD CONSTRAINT web_vitals_value_finite_nonneg
      CHECK (value >= 0 AND value = value AND value <> 'infinity'::double precision);
  END IF;
END$$;

-- ── P2-F: newsletter_subscribers.status index ────────────────────────
-- The unsubscribe endpoint and subscriber analytics queries all filter on
-- status.  Without an index they degrade to sequential scans once the
-- subscriber table grows.
CREATE INDEX IF NOT EXISTS idx_newsletter_subscribers_status
  ON newsletter_subscribers (status);

-- ── P2-G: sites(id, is_active) composite index ───────────────────────
-- The public RLS EXISTS subqueries added in migration 00031 execute once
-- per candidate row in products/content/pages/content_products.  A
-- composite index allows the planner to satisfy them via an index-only
-- scan.  The primary key alone only covers `id`; this adds `is_active`.
CREATE INDEX IF NOT EXISTS idx_sites_id_is_active
  ON sites (id, is_active);
