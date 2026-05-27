-- GDPR Art. 21: Right to Object — subject objections table.
-- Records a subject's objection to specific processing activities
-- (marketing, profiling, analytics) so downstream pipelines can
-- honour the objection automatically.

CREATE TABLE IF NOT EXISTS subject_objections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'all'
    CHECK (scope IN ('marketing', 'profiling', 'analytics', 'all')),
  reason TEXT,
  objected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  withdrawn_at TIMESTAMPTZ,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (site_id, email, scope)
);

-- RLS: only service_role and super_admin can read/write.
ALTER TABLE subject_objections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access" ON subject_objections
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Index for downstream pipeline lookups: "is this email objecting to marketing?"
CREATE INDEX IF NOT EXISTS idx_subject_objections_lookup
  ON subject_objections (site_id, email, scope)
  WHERE withdrawn_at IS NULL;

COMMENT ON TABLE subject_objections IS
  'GDPR Art. 21 — records subject objections to marketing/profiling/analytics processing.';
