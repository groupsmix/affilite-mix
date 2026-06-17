-- 2026061701: Declarative seed for all static-config sites
--
-- Belt-and-suspenders companion to the runtime auto-provisioning added in
-- lib/dal/site-resolver.ts (PR #836). That change lazily upserts a `sites`
-- row from static TS config the first time an admin page is visited, so the
-- dashboard never hard-crashes on a valid, selectable site that has not been
-- seeded yet.
--
-- This migration is the offline equivalent: it guarantees every site in
-- config/sites/* exists in the DB from day one on any fresh environment,
-- without relying on a first page-load to trigger provisioning. Values are
-- derived from `toSiteRow()` (config/sites/index.ts) — the single source of
-- truth for TS → DB column mapping.
--
-- ON CONFLICT (slug) DO NOTHING: fully idempotent. Existing rows (including
-- any admin customisations) are left untouched.

INSERT INTO sites (
  slug, name, domain, language, direction, is_active,
  monetization_type, est_revenue_per_click,
  theme, logo_url, favicon_url, nav_items, footer_nav, features,
  meta_title, meta_description, homepage_template, product_card_style
) VALUES

-- ai-compared
(
  'ai-compared',
  'AI Compared',
  'compareai.site',
  'en', 'ltr', true,
  'affiliate', 0.35,
  '{"primaryColor":"#2E1065","accentColor":"#8B5CF6","accentTextColor":"#6D28D9","accentLightColor":"#8B5CF6","fontHeading":"Inter","fontBody":"Inter"}',
  null, null,
  '[{"label":"Home","href":"/"},{"label":"Reviews","href":"/review"},{"label":"Comparisons","href":"/comparison"},{"label":"Guides","href":"/guide"}]',
  '[{"label":"Home","href":"/"},{"label":"Reviews","href":"/review"},{"label":"Comparisons","href":"/comparison"},{"label":"Guides","href":"/guide"},{"label":"About","href":"/about"},{"label":"Privacy Policy","href":"/privacy"},{"label":"Terms of Service","href":"/terms"},{"label":"Affiliate Disclosure","href":"/affiliate-disclosure"},{"label":"Contact","href":"/contact"}]',
  '{"blog":true,"newsletter":true,"rssFeed":true,"searchModal":true,"scheduling":true,"comparisons":true,"deals":true,"cookieConsent":true,"customHomepage":true}',
  'AI Compared — AI Tools & Software Reviews',
  'In-depth reviews and comparisons of AI tools, platforms, and software — find the best AI for your workflow.',
  'minimal', 'standard'
),

-- arabic-tools
(
  'arabic-tools',
  'Arabic Tools',
  'arabictools.wristnerd.xyz',
  'ar', 'rtl', true,
  'affiliate', 0.35,
  '{"primaryColor":"#1E293B","accentColor":"#10B981","accentTextColor":"#10B981","accentLightColor":"#10B981","fontHeading":"IBM Plex Sans Arabic","fontBody":"IBM Plex Sans Arabic"}',
  null, null,
  '[{"label":"الرئيسية","href":"/"},{"label":"المقالات","href":"/article"},{"label":"المراجعات","href":"/review"},{"label":"الأدلة","href":"/guide"}]',
  '[{"label":"الرئيسية","href":"/"},{"label":"المقالات","href":"/article"},{"label":"عن الموقع","href":"/about"},{"label":"سياسة الخصوصية","href":"/privacy"},{"label":"الشروط والأحكام","href":"/terms"}]',
  '{"blog":true,"newsletter":true,"rssFeed":true,"searchModal":true,"scheduling":true,"comparisons":true}',
  'Arabic Tools — Arabic Product Reviews',
  'مراجعات وأدوات عربية لمقارنة المنتجات والخدمات التقنية',
  'standard', 'standard'
),

-- crypto-tools
(
  'crypto-tools',
  'CryptoRanked',
  'cryptoranked.xyz',
  'en', 'ltr', true,
  'affiliate', 0.35,
  '{"primaryColor":"#0F172A","accentColor":"#F59E0B","accentTextColor":"#B45309","accentLightColor":"#F59E0B","fontHeading":"Inter","fontBody":"Inter"}',
  null, null,
  '[{"label":"Home","href":"/"},{"label":"Reviews","href":"/review"},{"label":"Comparisons","href":"/comparison"},{"label":"Guides","href":"/guide"}]',
  '[{"label":"Home","href":"/"},{"label":"Reviews","href":"/review"},{"label":"Comparisons","href":"/comparison"},{"label":"About","href":"/about"},{"label":"Privacy Policy","href":"/privacy"},{"label":"Terms of Service","href":"/terms"},{"label":"Affiliate Disclosure","href":"/affiliate-disclosure"},{"label":"Contact","href":"/contact"}]',
  '{"blog":true,"newsletter":true,"rssFeed":true,"searchModal":true,"scheduling":true,"comparisons":true,"deals":true}',
  'CryptoRanked — Crypto Exchanges & Wallet Reviews',
  'Compare crypto exchanges, wallets, and DeFi tools — honest reviews and affiliate deals.',
  'standard', 'standard'
),

-- watch-tools
(
  'watch-tools',
  'WristNerd',
  'wristnerd.xyz',
  'en', 'ltr', true,
  'affiliate', 0.35,
  '{"primaryColor":"#1B2A4A","accentColor":"#8B6914","accentTextColor":"#6B4F0F","accentLightColor":"#C9A96E","fontHeading":"Playfair Display","fontBody":"Inter"}',
  null, null,
  '[{"label":"Home","href":"/"},{"label":"Reviews","href":"/review"},{"label":"Comparisons","href":"/comparison"},{"label":"Guides","href":"/guide"},{"label":"Gift Finder","href":"/gift-finder"}]',
  '[{"label":"Home","href":"/"},{"label":"Reviews","href":"/review"},{"label":"Comparisons","href":"/comparison"},{"label":"Gift Finder","href":"/gift-finder"},{"label":"About","href":"/about"},{"label":"Privacy Policy","href":"/privacy"},{"label":"Terms of Service","href":"/terms"},{"label":"Affiliate Disclosure","href":"/affiliate-disclosure"},{"label":"Contact","href":"/contact"}]',
  '{"blog":true,"brandSpotlights":true,"comparisons":true,"cookieConsent":true,"deals":true,"giftFinder":true,"newsletter":true,"rssFeed":true,"scheduling":true,"searchModal":true,"taxonomyPages":true,"customHomepage":true}',
  'WristNerd — Watch Gift Guides & Reviews',
  'Expert watch gift guides and reviews — honest ratings and a proprietary Gift-Worthiness Score to help you pick the perfect watch.',
  'cinematic', 'standard'
)

ON CONFLICT (slug) DO NOTHING;
