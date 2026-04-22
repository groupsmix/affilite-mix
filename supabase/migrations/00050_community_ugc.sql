-- ============================================================
-- Migration 00050: Community UGC (wrist shots + comments)
-- Weeks 11-13 §2.7 — Community UGC for EEAT
-- ============================================================

-- Wrist shot photos uploaded by users
CREATE TABLE IF NOT EXISTS wrist_shots (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id       UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  product_id    UUID REFERENCES products(id) ON DELETE SET NULL,
  user_email    TEXT NOT NULL,
  user_name     TEXT NOT NULL,
  image_url     TEXT NOT NULL,
  caption       TEXT,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  approved_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wrist_shots_product
  ON wrist_shots (product_id, status) WHERE status = 'approved';

CREATE INDEX IF NOT EXISTS idx_wrist_shots_site
  ON wrist_shots (site_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wrist_shots_pending
  ON wrist_shots (site_id, status) WHERE status = 'pending';

-- Threaded comments on products and content
CREATE TABLE IF NOT EXISTS comments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id       UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  target_type   TEXT NOT NULL CHECK (target_type IN ('product', 'content')),
  target_id     UUID NOT NULL,             -- product_id or content_id
  parent_id     UUID REFERENCES comments(id) ON DELETE CASCADE,  -- for threading
  user_email    TEXT NOT NULL,
  user_name     TEXT NOT NULL,
  body          TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'spam')),
  approved_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comments_target
  ON comments (target_type, target_id, status) WHERE status = 'approved';

CREATE INDEX IF NOT EXISTS idx_comments_parent
  ON comments (parent_id) WHERE parent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_comments_pending
  ON comments (site_id, status) WHERE status = 'pending';

-- RLS
ALTER TABLE wrist_shots ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_wrist_shots" ON wrist_shots FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_comments" ON comments FOR ALL USING (true) WITH CHECK (true);
