-- SOC 2 CC6.1: Automated access review audit trail.
-- Stores results of periodic access recertification runs so auditors
-- can prove "who had access when" and "when was access last reviewed."

CREATE TABLE IF NOT EXISTS access_review_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  total_users INTEGER NOT NULL,
  findings_count INTEGER NOT NULL DEFAULT 0,
  findings JSONB NOT NULL DEFAULT '[]'::jsonb,
  reviewer TEXT NOT NULL DEFAULT 'automated-cron',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS: only service_role can read/write review logs.
ALTER TABLE access_review_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access" ON access_review_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE access_review_log IS
  'SOC 2 CC6.1 — periodic access recertification results for audit trail.';
