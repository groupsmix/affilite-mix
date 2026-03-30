-- ═══════════════════════════════════════════════════════
-- RLS Defense-in-Depth Policies
-- ═══════════════════════════════════════════════════════
-- These policies add an extra safety net for service-role operations.
-- Even though the service role key bypasses RLS by default, these policies
-- document the intended access patterns and would protect against
-- accidental misconfiguration (e.g., if someone switches to a regular
-- authenticated client instead of the service role).
--
-- Run this file in the Supabase SQL Editor after deploying the base schema.
-- ═══════════════════════════════════════════════════════

-- Service role can manage all rows in categories (scoped by site_id in DAL)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'service_full_access_categories' AND tablename = 'categories'
  ) THEN
    CREATE POLICY "service_full_access_categories"
      ON categories FOR ALL
      USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Service role can manage all rows in products
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'service_full_access_products' AND tablename = 'products'
  ) THEN
    CREATE POLICY "service_full_access_products"
      ON products FOR ALL
      USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Service role can manage all rows in content
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'service_full_access_content' AND tablename = 'content'
  ) THEN
    CREATE POLICY "service_full_access_content"
      ON content FOR ALL
      USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Service role can manage content_products join table
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'service_full_access_content_products' AND tablename = 'content_products'
  ) THEN
    CREATE POLICY "service_full_access_content_products"
      ON content_products FOR ALL
      USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Service role can read/manage clicks
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'service_full_access_clicks' AND tablename = 'affiliate_clicks'
  ) THEN
    CREATE POLICY "service_full_access_clicks"
      ON affiliate_clicks FOR ALL
      USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Service role can manage newsletter subscribers
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'service_full_access_newsletter' AND tablename = 'newsletter_subscribers'
  ) THEN
    CREATE POLICY "service_full_access_newsletter"
      ON newsletter_subscribers FOR ALL
      USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Service role can manage scheduled jobs
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'service_full_access_scheduled_jobs' AND tablename = 'scheduled_jobs'
  ) THEN
    CREATE POLICY "service_full_access_scheduled_jobs"
      ON scheduled_jobs FOR ALL
      USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════
-- AUDIT LOG TABLE
-- ═══════════════════════════════════════════════════════
--
-- Records admin actions for accountability. When per-user auth is added,
-- the actor column will store the user ID. For now it stores 'admin'.

CREATE TABLE IF NOT EXISTS audit_log (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  site_id     uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  actor       text NOT NULL DEFAULT 'admin',
  action      text NOT NULL,
  entity_type text NOT NULL,
  entity_id   text,
  details     jsonb DEFAULT '{}',
  ip          text DEFAULT '',
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_site ON audit_log(site_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON audit_log(actor);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'service_full_access_audit_log' AND tablename = 'audit_log'
  ) THEN
    CREATE POLICY "service_full_access_audit_log"
      ON audit_log FOR ALL
      USING (true) WITH CHECK (true);
  END IF;
END $$;
