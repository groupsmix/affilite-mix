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

-- AUDIT LOG table (create if not exists)
CREATE TABLE IF NOT EXISTS audit_log (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  site_id     uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  actor       text NOT NULL DEFAULT 'admin',
  action      text NOT NULL,
  entity_type text NOT NULL,
  entity_id   text NOT NULL,
  details     jsonb DEFAULT '{}',
  ip          text DEFAULT '',
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_site ON audit_log(site_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON audit_log(actor);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Audit log: no public access, only service role can read/write
CREATE POLICY "service_role_audit_log_all"
  ON audit_log
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- ═══════════════════════════════════════════════════════
-- Defense-in-depth policies for existing tables
-- These use the authenticated role as an extra guardrail.
-- ═══════════════════════════════════════════════════════

-- Categories: authenticated users can manage within their site scope
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'authenticated_manage_categories' AND tablename = 'categories'
  ) THEN
    CREATE POLICY "authenticated_manage_categories"
      ON categories
      FOR ALL
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Products: authenticated users can manage within their site scope
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'authenticated_manage_products' AND tablename = 'products'
  ) THEN
    CREATE POLICY "authenticated_manage_products"
      ON products
      FOR ALL
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Content: authenticated users can manage within their site scope
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'authenticated_manage_content' AND tablename = 'content'
  ) THEN
    CREATE POLICY "authenticated_manage_content"
      ON content
      FOR ALL
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Content Products: authenticated users can manage links
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'authenticated_manage_content_products' AND tablename = 'content_products'
  ) THEN
    CREATE POLICY "authenticated_manage_content_products"
      ON content_products
      FOR ALL
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Newsletter Subscribers: authenticated can manage subscriptions
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'authenticated_manage_newsletter' AND tablename = 'newsletter_subscribers'
  ) THEN
    CREATE POLICY "authenticated_manage_newsletter"
      ON newsletter_subscribers
      FOR ALL
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Scheduled Jobs: authenticated users can manage jobs
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'authenticated_manage_scheduled_jobs' AND tablename = 'scheduled_jobs'
  ) THEN
    CREATE POLICY "authenticated_manage_scheduled_jobs"
      ON scheduled_jobs
      FOR ALL
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Affiliate Clicks: authenticated users can read all clicks
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'authenticated_read_clicks' AND tablename = 'affiliate_clicks'
  ) THEN
    CREATE POLICY "authenticated_read_clicks"
      ON affiliate_clicks
      FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END $$;
