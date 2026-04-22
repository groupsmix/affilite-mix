-- ============================================================
-- Migration 00052: A/B testing framework + content review_state
-- Technical improvements §3.3 + §3.6
-- ============================================================

-- ── A/B Testing ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS experiments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id       UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  slug          TEXT NOT NULL,
  description   TEXT,
  variants      JSONB NOT NULL DEFAULT '[{"id":"control","weight":50},{"id":"variant","weight":50}]'::jsonb,
  status        TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'running', 'paused', 'completed')),
  started_at    TIMESTAMPTZ,
  ended_at      TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(site_id, slug)
);

CREATE TABLE IF NOT EXISTS experiment_assignments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id   UUID NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
  visitor_id      TEXT NOT NULL,    -- session_id or user_id
  variant_id      TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(experiment_id, visitor_id)
);

CREATE INDEX IF NOT EXISTS idx_experiment_assignments_exp
  ON experiment_assignments (experiment_id, variant_id);

CREATE TABLE IF NOT EXISTS experiment_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id   UUID NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
  visitor_id      TEXT NOT NULL,
  variant_id      TEXT NOT NULL,
  event_type      TEXT NOT NULL,    -- 'view', 'click', 'conversion'
  metadata        JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_experiment_events_exp
  ON experiment_events (experiment_id, event_type, variant_id);

-- ── Content review_state ────────────────────────────────────

ALTER TABLE content ADD COLUMN IF NOT EXISTS review_state TEXT
  NOT NULL DEFAULT 'draft'
  CHECK (review_state IN ('draft', 'awaiting_edit', 'edited', 'published'));

-- RLS
ALTER TABLE experiments ENABLE ROW LEVEL SECURITY;
ALTER TABLE experiment_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE experiment_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_experiments" ON experiments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_exp_assignments" ON experiment_assignments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_exp_events" ON experiment_events FOR ALL USING (true) WITH CHECK (true);
