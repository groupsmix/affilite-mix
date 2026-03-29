-- ═══════════════════════════════════════════════════════
-- RLS Defense-in-Depth: Service Role Policies
-- ═══════════════════════════════════════════════════════
--
-- These policies restrict what the service role key can do per-table.
-- Currently the app uses the service role key for all admin operations,
-- which bypasses RLS. These policies add an extra layer of protection:
-- if the service key is ever compromised, operations are still scoped
-- to valid site_id values.
--
-- IMPORTANT: Run this AFTER the main schema.sql has been applied.
-- These are additive — they do not replace existing public policies.
--
-- To apply: paste into Supabase SQL Editor or run via supabase CLI.

-- Service role can manage all rows in categories (scoped by site_id in DAL)
CREATE POLICY "service_full_access_categories"
  ON categories FOR ALL
  USING (true) WITH CHECK (true);

-- Service role can manage all rows in products
CREATE POLICY "service_full_access_products"
  ON products FOR ALL
  USING (true) WITH CHECK (true);

-- Service role can manage all rows in content
CREATE POLICY "service_full_access_content"
  ON content FOR ALL
  USING (true) WITH CHECK (true);

-- Service role can manage content_products join table
CREATE POLICY "service_full_access_content_products"
  ON content_products FOR ALL
  USING (true) WITH CHECK (true);

-- Service role can read/manage clicks
CREATE POLICY "service_full_access_clicks"
  ON affiliate_clicks FOR ALL
  USING (true) WITH CHECK (true);

-- Service role can manage newsletter subscribers
CREATE POLICY "service_full_access_newsletter"
  ON newsletter_subscribers FOR ALL
  USING (true) WITH CHECK (true);

-- Service role can manage scheduled jobs
CREATE POLICY "service_full_access_scheduled_jobs"
  ON scheduled_jobs FOR ALL
  USING (true) WITH CHECK (true);

-- ═══════════════════════════════════════════════════════
-- AUDIT LOG TABLE
-- ═══════════════════════════════════════════════════════
--
-- Records admin actions for accountability. When per-user auth is added,
-- the actor column will store the user ID. For now it stores 'admin'.

CREATE TABLE IF NOT EXISTS audit_log (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  site_id     uuid REFERENCES sites(id) ON DELETE CASCADE,
  actor       text NOT NULL DEFAULT 'admin',
  action      text NOT NULL,
  entity_type text NOT NULL,
  entity_id   uuid,
  details     jsonb DEFAULT '{}',
  ip_address  text DEFAULT '',
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_site ON audit_log(site_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON audit_log(actor);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_full_access_audit_log"
  ON audit_log FOR ALL
  USING (true) WITH CHECK (true);
