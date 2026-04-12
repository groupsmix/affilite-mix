-- Migration: Seed existing static config sites into the sites table
-- with full field data (theme, nav, features, SEO, etc.)
-- so the DB can serve as the single source of truth.

-- Arabic Tools
UPDATE sites SET
  domain = 'arabictools.wristnerd.site',
  is_active = true,
  monetization_type = 'affiliate',
  est_revenue_per_click = 0.35,
  theme = '{"primaryColor": "#1E293B", "accentColor": "#10B981", "accentTextColor": "#10B981", "fontHeading": "IBM Plex Sans Arabic", "fontBody": "IBM Plex Sans Arabic"}',
  nav_items = '[{"label": "الرئيسية", "href": "/"}, {"label": "المقالات", "href": "/article"}, {"label": "المراجعات", "href": "/review"}, {"label": "الأدلة", "href": "/guide"}]',
  footer_nav = '[{"label": "الرئيسية", "href": "/"}, {"label": "المقالات", "href": "/article"}, {"label": "عن الموقع", "href": "/about"}, {"label": "سياسة الخصوصية", "href": "/privacy"}, {"label": "الشروط والأحكام", "href": "/terms"}]',
  features = '{"blog": true, "newsletter": true, "rssFeed": true, "searchModal": true, "scheduling": true, "comparisons": true}',
  meta_title = 'Arabic Tools — مراجعات وأدوات عربية',
  meta_description = 'مراجعات وأدوات عربية لمقارنة المنتجات والخدمات التقنية'
WHERE slug = 'arabic-tools';

-- Crypto Tools
UPDATE sites SET
  domain = 'crypto.wristnerd.site',
  is_active = true,
  monetization_type = 'affiliate',
  est_revenue_per_click = 0.35,
  theme = '{"primaryColor": "#0F172A", "accentColor": "#F59E0B", "accentTextColor": "#B45309", "fontHeading": "Inter", "fontBody": "Inter"}',
  nav_items = '[{"label": "Home", "href": "/"}, {"label": "Reviews", "href": "/review"}, {"label": "Comparisons", "href": "/comparison"}, {"label": "Guides", "href": "/guide"}]',
  footer_nav = '[{"label": "Home", "href": "/"}, {"label": "Reviews", "href": "/review"}, {"label": "Comparisons", "href": "/comparison"}, {"label": "About", "href": "/about"}, {"label": "Privacy Policy", "href": "/privacy"}, {"label": "Terms of Service", "href": "/terms"}]',
  features = '{"blog": true, "newsletter": true, "rssFeed": true, "searchModal": true, "scheduling": true, "comparisons": true, "deals": true}',
  meta_title = 'Crypto Tools — Cryptocurrency Tools & Reviews',
  meta_description = 'Compare crypto exchanges, wallets, and DeFi tools — honest reviews and affiliate deals.'
WHERE slug = 'crypto-tools';

-- Watch Tools (WristNerd)
INSERT INTO sites (slug, name, domain, language, direction, is_active, monetization_type, est_revenue_per_click, theme, nav_items, footer_nav, features, meta_title, meta_description)
VALUES (
  'watch-tools',
  'WristNerd',
  'wristnerd.site',
  'en',
  'ltr',
  true,
  'affiliate',
  0.35,
  '{"primaryColor": "#1B2A4A", "accentColor": "#C9A96E", "accentTextColor": "#8B6914", "fontHeading": "Playfair Display", "fontBody": "Inter"}',
  '[{"label": "Home", "href": "/"}, {"label": "Reviews", "href": "/review"}, {"label": "Comparisons", "href": "/comparison"}, {"label": "Guides", "href": "/guide"}, {"label": "Gift Finder", "href": "/gift-finder"}]',
  '[{"label": "Home", "href": "/"}, {"label": "Reviews", "href": "/review"}, {"label": "Comparisons", "href": "/comparison"}, {"label": "Gift Finder", "href": "/gift-finder"}, {"label": "About", "href": "/about"}, {"label": "Privacy Policy", "href": "/privacy"}, {"label": "Terms of Service", "href": "/terms"}, {"label": "Affiliate Disclosure", "href": "/affiliate-disclosure"}, {"label": "Contact", "href": "/contact"}]',
  '{"blog": true, "brandSpotlights": true, "comparisons": true, "cookieConsent": true, "deals": true, "giftFinder": true, "newsletter": true, "rssFeed": true, "scheduling": true, "searchModal": true, "taxonomyPages": true}',
  'WristNerd — Watch Gift Guides & Reviews',
  'Expert watch gift guides and reviews — honest ratings and a proprietary Gift-Worthiness Score to help you pick the perfect watch.'
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  domain = EXCLUDED.domain,
  is_active = EXCLUDED.is_active,
  monetization_type = EXCLUDED.monetization_type,
  est_revenue_per_click = EXCLUDED.est_revenue_per_click,
  theme = EXCLUDED.theme,
  nav_items = EXCLUDED.nav_items,
  footer_nav = EXCLUDED.footer_nav,
  features = EXCLUDED.features,
  meta_title = EXCLUDED.meta_title,
  meta_description = EXCLUDED.meta_description;
