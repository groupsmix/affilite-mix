-- Ad Impressions — basic tracking for ad performance
CREATE TABLE IF NOT EXISTS ad_impressions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id           uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  ad_placement_id   uuid NOT NULL REFERENCES ad_placements(id) ON DELETE CASCADE,
  page_path         text,
  impression_date   date DEFAULT CURRENT_DATE,
  count             integer DEFAULT 1,
  created_at        timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ad_impressions_site_id ON ad_impressions(site_id);
CREATE INDEX IF NOT EXISTS idx_ad_impressions_placement ON ad_impressions(ad_placement_id, impression_date);

-- RLS
ALTER TABLE ad_impressions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ad_impressions_service_all" ON ad_impressions
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
