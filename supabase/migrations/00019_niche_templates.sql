-- Niche templates — presets for quickly launching new niche sites
CREATE TABLE IF NOT EXISTS niche_templates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  slug            text NOT NULL UNIQUE,
  description     text DEFAULT '',
  -- Template data (JSON blobs matching site configuration fields)
  default_theme   jsonb DEFAULT '{}'::jsonb,
  default_nav     jsonb DEFAULT '[]'::jsonb,
  default_footer  jsonb DEFAULT '[]'::jsonb,
  default_features jsonb DEFAULT '{}'::jsonb,
  monetization_type text DEFAULT 'affiliate',
  language        text DEFAULT 'en',
  direction       text DEFAULT 'ltr',
  custom_css      text DEFAULT '',
  social_links    jsonb DEFAULT '{}'::jsonb,
  -- Metadata
  is_builtin      boolean DEFAULT false,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE niche_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "niche_templates_service_all" ON niche_templates
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- Seed a few built-in templates
INSERT INTO niche_templates (name, slug, description, monetization_type, is_builtin, default_theme, default_features) VALUES
  ('Affiliate Blog', 'affiliate-blog', 'Standard affiliate marketing blog with product reviews and comparisons', 'affiliate', true,
   '{"primaryColor":"#10B981","accentColor":"#059669","fontFamily":"Inter"}',
   '{"newsletter":true,"search":true,"darkMode":false}'),
  ('Ad-Supported Magazine', 'ad-magazine', 'Content-driven magazine monetized with display ads', 'ads', true,
   '{"primaryColor":"#3B82F6","accentColor":"#2563EB","fontFamily":"Merriweather"}',
   '{"newsletter":true,"search":true,"darkMode":false}'),
  ('Hybrid E-commerce', 'hybrid-ecommerce', 'Product-focused site with both affiliate links and ad placements', 'both', true,
   '{"primaryColor":"#8B5CF6","accentColor":"#7C3AED","fontFamily":"Inter"}',
   '{"newsletter":true,"search":true,"darkMode":true}'),
  ('Arabic RTL Blog', 'arabic-rtl', 'Right-to-left Arabic language blog template', 'affiliate', true,
   '{"primaryColor":"#F59E0B","accentColor":"#D97706","fontFamily":"Noto Sans Arabic"}',
   '{"newsletter":true,"search":true,"darkMode":false}')
ON CONFLICT (slug) DO NOTHING;
