-- Rollback 2026071507: restore the original "CryptoRanked" identity for the
-- `crypto-tools` tenant (values from 2026061701_seed_static_sites.sql).
-- Data-only UPDATE; slug/id/domain are unchanged.

UPDATE sites SET
  name = 'CryptoRanked',
  theme = '{"primaryColor":"#0F172A","accentColor":"#F59E0B","accentTextColor":"#B45309","accentLightColor":"#F59E0B","fontHeading":"Inter","fontBody":"Inter"}',
  nav_items = '[{"label":"Home","href":"/"},{"label":"Reviews","href":"/review"},{"label":"Comparisons","href":"/comparison"},{"label":"Guides","href":"/guide"}]',
  footer_nav = '[{"label":"Home","href":"/"},{"label":"Reviews","href":"/review"},{"label":"Comparisons","href":"/comparison"},{"label":"About","href":"/about"},{"label":"Privacy Policy","href":"/privacy"},{"label":"Terms of Service","href":"/terms"},{"label":"Affiliate Disclosure","href":"/affiliate-disclosure"},{"label":"Contact","href":"/contact"}]',
  features = '{"blog":true,"newsletter":true,"rssFeed":true,"searchModal":true,"scheduling":true,"comparisons":true,"deals":true}',
  meta_title = 'CryptoRanked — Crypto Exchanges & Wallet Reviews',
  meta_description = 'Compare crypto exchanges, wallets, and DeFi tools — honest reviews and affiliate deals.'
WHERE slug = 'crypto-tools';
