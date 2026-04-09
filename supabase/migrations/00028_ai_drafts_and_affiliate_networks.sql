-- AI Drafts table: stores AI-generated content pending review
CREATE TABLE IF NOT EXISTS ai_drafts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id       uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  title         text NOT NULL,
  slug          text NOT NULL,
  body          text NOT NULL DEFAULT '',
  excerpt       text NOT NULL DEFAULT '',
  content_type  text NOT NULL DEFAULT 'article',
  topic         text NOT NULL DEFAULT '',
  keywords      text[] NOT NULL DEFAULT '{}',
  ai_provider   text NOT NULL DEFAULT '',
  status        text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'approved', 'rejected', 'published')),
  generated_at  timestamptz NOT NULL DEFAULT now(),
  reviewed_at   timestamptz,
  reviewed_by   text,
  meta_title    text,
  meta_description text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Indexes for ai_drafts
CREATE INDEX IF NOT EXISTS idx_ai_drafts_site_status ON ai_drafts(site_id, status);
CREATE INDEX IF NOT EXISTS idx_ai_drafts_site_created ON ai_drafts(site_id, created_at DESC);

-- RLS for ai_drafts (admin-only, no public access)
ALTER TABLE ai_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY ai_drafts_service_all ON ai_drafts
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Affiliate Networks table: per-site network configuration
CREATE TABLE IF NOT EXISTS affiliate_networks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id       uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  network       text NOT NULL CHECK (network IN ('cj', 'partnerstack', 'admitad', 'direct')),
  publisher_id  text NOT NULL DEFAULT '',
  api_key_ref   text NOT NULL DEFAULT '',
  is_active     boolean NOT NULL DEFAULT true,
  config        jsonb NOT NULL DEFAULT '{}',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE(site_id, network)
);

-- Indexes for affiliate_networks
CREATE INDEX IF NOT EXISTS idx_affiliate_networks_site ON affiliate_networks(site_id);

-- RLS for affiliate_networks (admin-only, no public access)
ALTER TABLE affiliate_networks ENABLE ROW LEVEL SECURITY;

CREATE POLICY affiliate_networks_service_all ON affiliate_networks
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Updated_at triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'set_ai_drafts_updated_at'
  ) THEN
    CREATE TRIGGER set_ai_drafts_updated_at
      BEFORE UPDATE ON ai_drafts
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'set_affiliate_networks_updated_at'
  ) THEN
    CREATE TRIGGER set_affiliate_networks_updated_at
      BEFORE UPDATE ON affiliate_networks
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END;
$$;

-- Seed AI Compared site into the sites table
INSERT INTO sites (slug, name, domain, language, direction, is_active, monetization_type, est_revenue_per_click, theme, nav_items, footer_nav, features, meta_title, meta_description)
VALUES (
  'ai-compared',
  'AI Compared',
  'aicompared.site',
  'en',
  'ltr',
  true,
  'affiliate',
  0.35,
  '{"primaryColor":"#2E1065","accentColor":"#8B5CF6","accentTextColor":"#6D28D9","fontHeading":"Inter","fontBody":"Inter"}'::jsonb,
  '[{"label":"Home","href":"/"},{"label":"Reviews","href":"/review"},{"label":"Comparisons","href":"/comparison"},{"label":"Guides","href":"/guide"}]'::jsonb,
  '[{"label":"About","href":"/about"},{"label":"Privacy Policy","href":"/privacy"},{"label":"Terms of Service","href":"/terms"},{"label":"Affiliate Disclosure","href":"/affiliate-disclosure"},{"label":"Contact","href":"/contact"}]'::jsonb,
  '{"blog":true,"newsletter":true,"rssFeed":true,"searchModal":true,"scheduling":true,"comparisons":true,"deals":true,"cookieConsent":true,"customHomepage":true}'::jsonb,
  'AI Compared — AI Tools & Software Reviews',
  'In-depth reviews and comparisons of AI tools, platforms, and software — find the best AI for your workflow.'
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  domain = EXCLUDED.domain,
  is_active = EXCLUDED.is_active,
  theme = EXCLUDED.theme,
  nav_items = EXCLUDED.nav_items,
  footer_nav = EXCLUDED.footer_nav,
  features = EXCLUDED.features,
  meta_title = EXCLUDED.meta_title,
  meta_description = EXCLUDED.meta_description;

-- Update CryptoRanked site name and domain
UPDATE sites
SET name = 'CryptoRanked',
    domain = 'cryptoranked.xyz',
    meta_title = 'CryptoRanked — Crypto Exchanges & Wallet Reviews'
WHERE slug = 'crypto-tools';

-- Update WristNerd domain
UPDATE sites
SET domain = 'wristnerd.site'
WHERE slug = 'watch-tools';
