-- Ad Placements — monetization for niches without affiliate products
CREATE TABLE IF NOT EXISTS ad_placements (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id         uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  name            text NOT NULL,
  placement_type  text NOT NULL CHECK (placement_type IN ('sidebar', 'in_content', 'header', 'footer', 'between_posts')),
  provider        text NOT NULL CHECK (provider IN ('adsense', 'carbon', 'ethicalads', 'custom')),
  ad_code         text,
  config          jsonb DEFAULT '{}',
  is_active       boolean DEFAULT true,
  priority        integer DEFAULT 0,
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ad_placements_site_id ON ad_placements(site_id);
CREATE INDEX IF NOT EXISTS idx_ad_placements_active ON ad_placements(site_id, is_active) WHERE is_active = true;

-- RLS
ALTER TABLE ad_placements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ad_placements_public_read" ON ad_placements
  FOR SELECT USING (is_active = true);

CREATE POLICY "ad_placements_service_all" ON ad_placements
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
