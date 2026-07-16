-- 2026071507: Repurpose the `crypto-tools` tenant into the Australian
-- crypto-tax site ("Crypto Tax AU").
--
-- The old `crypto-tools` scaffold ("CryptoRanked" — generic exchange & wallet
-- reviews) is being pivoted to an Australian crypto-tax affiliate site while
-- reusing its existing domain (cryptoranked.xyz) and all its Cloudflare Worker
-- / DNS / Terraform wiring. The 2026061701 seed inserted the old identity with
-- ON CONFLICT DO NOTHING, so on both fresh and existing environments the row's
-- identity must be updated here to match config/sites/crypto-tools.ts.
--
-- Data-only UPDATE: keeps the same slug/id/domain (so tenant resolution,
-- content, products and analytics are untouched) and only rewrites the
-- presentational identity (name, theme, nav, meta). Idempotent.
--
-- NOTE: cryptoranked.xyz is a temporary domain; the owner will move to a
-- dedicated domain later. The domain is intentionally NOT changed here.

UPDATE sites SET
  name = 'Crypto Tax AU',
  theme = '{"primaryColor":"#0B2540","accentColor":"#16A34A","accentTextColor":"#15803D","accentLightColor":"#16A34A","fontHeading":"Inter","fontBody":"Inter"}',
  nav_items = '[{"label":"Home","href":"/"},{"label":"Tax Guides","href":"/guide"},{"label":"Software Reviews","href":"/review"},{"label":"Comparisons","href":"/comparison"}]',
  footer_nav = '[{"label":"Crypto Tax Guide","href":"/guide"},{"label":"Best Crypto Tax Software","href":"/comparison"},{"label":"Software Reviews","href":"/review"},{"label":"DeFi Tax","href":"/category/defi-tax"},{"label":"Staking Tax","href":"/category/staking-tax"},{"label":"Airdrop Tax","href":"/category/airdrop-tax"},{"label":"NFT Tax","href":"/category/nft-tax"},{"label":"About","href":"/about"},{"label":"Privacy Policy","href":"/privacy"},{"label":"Terms of Service","href":"/terms"},{"label":"Affiliate Disclosure","href":"/affiliate-disclosure"},{"label":"Contact","href":"/contact"}]',
  features = '{"blog":true,"newsletter":true,"rssFeed":true,"searchModal":true,"scheduling":true,"comparisons":true,"deals":true,"cookieConsent":true}',
  meta_title = 'Crypto Tax AU — Australian Crypto Tax for DeFi, Staking, Airdrops & NFTs',
  meta_description = 'Plain-English Australian crypto tax guides and software reviews for DeFi, staking, airdrop and NFT investors — built around ATO rules so you can lodge on time and pay less.'
WHERE slug = 'crypto-tools';
