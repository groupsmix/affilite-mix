-- Cross-niche content sharing — allows content to appear on multiple sites
CREATE TABLE IF NOT EXISTS shared_content (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id      uuid NOT NULL REFERENCES content(id) ON DELETE CASCADE,
  source_site_id  uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  target_site_id  uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  created_at      timestamptz DEFAULT now(),
  UNIQUE(content_id, target_site_id)
);

CREATE INDEX IF NOT EXISTS idx_shared_content_target ON shared_content(target_site_id);
CREATE INDEX IF NOT EXISTS idx_shared_content_source ON shared_content(source_site_id);

-- RLS
ALTER TABLE shared_content ENABLE ROW LEVEL SECURITY;

CREATE POLICY "shared_content_service_all" ON shared_content
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
