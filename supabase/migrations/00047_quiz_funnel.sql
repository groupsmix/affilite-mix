-- ============================================================
-- Migration 00047: Quiz funnel tables
-- Weeks 3-6 §2.2 — Replace gift-finder with real recommendation funnel
-- ============================================================

-- Quiz definitions (admin-configurable)
CREATE TABLE IF NOT EXISTS quizzes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id       UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  slug          TEXT NOT NULL,
  title         TEXT NOT NULL,
  description   TEXT,
  steps         JSONB NOT NULL DEFAULT '[]'::jsonb,
  result_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(site_id, slug)
);

-- Quiz submissions (partial + completed)
CREATE TABLE IF NOT EXISTS quiz_submissions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id       UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  site_id       UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  session_id    TEXT,                              -- anonymous session tracking
  email         TEXT,                              -- captured at gate
  answers       JSONB NOT NULL DEFAULT '{}'::jsonb,
  result_tags   TEXT[] NOT NULL DEFAULT '{}',       -- derived tags for segmentation
  status        TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'abandoned')),
  completed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quiz_submissions_quiz
  ON quiz_submissions (quiz_id, status);

CREATE INDEX IF NOT EXISTS idx_quiz_submissions_email
  ON quiz_submissions (email, site_id) WHERE email IS NOT NULL;

-- Drip campaign sequences
CREATE TABLE IF NOT EXISTS drip_campaigns (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id       UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  trigger_type  TEXT NOT NULL DEFAULT 'quiz_complete' CHECK (trigger_type IN ('quiz_complete', 'price_alert', 'signup', 'manual')),
  trigger_quiz_id UUID REFERENCES quizzes(id) ON DELETE SET NULL,
  steps         JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Drip campaign enrollments
CREATE TABLE IF NOT EXISTS drip_enrollments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id   UUID NOT NULL REFERENCES drip_campaigns(id) ON DELETE CASCADE,
  email         TEXT NOT NULL,
  current_step  INT NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'unsubscribed')),
  next_send_at  TIMESTAMPTZ,
  metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_drip_enrollments_unique
  ON drip_enrollments (campaign_id, email) WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_drip_enrollments_next_send
  ON drip_enrollments (next_send_at) WHERE status = 'active';

-- RLS
ALTER TABLE quizzes ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE drip_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE drip_enrollments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_quizzes" ON quizzes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_quiz_submissions" ON quiz_submissions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_drip_campaigns" ON drip_campaigns FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_drip_enrollments" ON drip_enrollments FOR ALL USING (true) WITH CHECK (true);
