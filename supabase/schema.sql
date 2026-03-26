-- ═══════════════════════════════════════════════════════
-- NicheHub — Slice 1 Schema
-- Excludes: newsletter_subscribers, scheduled_jobs
-- ═══════════════════════════════════════════════════════

-- SITES — master registry
CREATE TABLE sites (
  id          text PRIMARY KEY,
  name        text NOT NULL,
  domain      text NOT NULL UNIQUE,
  language    text NOT NULL DEFAULT 'en',
  direction   text NOT NULL DEFAULT 'ltr',
  locale      text NOT NULL DEFAULT 'en_US',
  created_at  timestamptz DEFAULT now()
);

-- CATEGORIES
CREATE TABLE categories (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  site_id     text NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  name        text NOT NULL,
  slug        text NOT NULL,
  description text DEFAULT '',
  sort_order  int DEFAULT 0,
  created_at  timestamptz DEFAULT now(),
  UNIQUE(site_id, slug)
);

-- PRODUCTS
CREATE TABLE products (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  site_id       text NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  name          text NOT NULL,
  slug          text NOT NULL,
  description   text DEFAULT '',
  affiliate_url text DEFAULT '',
  image_url     text DEFAULT '',
  price         text DEFAULT '',
  merchant      text DEFAULT '',
  score         real CHECK (score >= 0 AND score <= 10),
  is_featured   boolean DEFAULT false,
  status        text NOT NULL DEFAULT 'active'
                CHECK (status IN ('draft', 'active', 'archived')),
  category_id   uuid REFERENCES categories(id) ON DELETE SET NULL,
  metadata      jsonb DEFAULT '{}',
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now(),
  UNIQUE(site_id, slug)
);

-- CONTENT
CREATE TABLE content (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  site_id          text NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  title            text NOT NULL,
  slug             text NOT NULL,
  body             text DEFAULT '',
  excerpt          text DEFAULT '',
  content_type     text NOT NULL DEFAULT 'article'
                   CHECK (content_type IN (
                     'article', 'review', 'comparison', 'guide', 'blog',
                     'brand-spotlight', 'occasion', 'budget', 'recipient'
                   )),
  status           text NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft', 'review', 'published', 'archived')),
  category_id      uuid REFERENCES categories(id) ON DELETE SET NULL,
  featured_image   text,
  meta_title       text,
  meta_description text,
  tags             text[] DEFAULT '{}',
  published_at     timestamptz,
  author           text,
  metadata         jsonb DEFAULT '{}',
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now(),
  UNIQUE(site_id, slug)
);

-- CONTENT <-> PRODUCTS (many-to-many)
CREATE TABLE content_products (
  content_id     uuid NOT NULL REFERENCES content(id) ON DELETE CASCADE,
  product_id     uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  site_id        text NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  position       int DEFAULT 0,
  role           text DEFAULT 'related'
                 CHECK (role IN ('hero', 'featured', 'related', 'vs-left', 'vs-right')),
  custom_aff_url text,
  PRIMARY KEY (content_id, product_id)
);

-- AFFILIATE CLICK TRACKING
CREATE TABLE affiliate_clicks (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  site_id         text NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  product_id      uuid REFERENCES products(id) ON DELETE SET NULL,
  product_slug    text DEFAULT '',
  source_page     text DEFAULT '',
  source_type     text DEFAULT 'unknown',
  destination_url text DEFAULT '',
  ip_hash         text,
  user_agent      text,
  referrer        text,
  country         text,
  created_at      timestamptz DEFAULT now()
);

-- ═══════════════════════════════════════════════════════
-- INDEXES
-- ═══════════════════════════════════════════════════════

CREATE INDEX idx_categories_site        ON categories(site_id);
CREATE INDEX idx_products_site          ON products(site_id);
CREATE INDEX idx_products_site_slug     ON products(site_id, slug);
CREATE INDEX idx_products_site_featured ON products(site_id, is_featured)
  WHERE is_featured = true;
CREATE INDEX idx_content_site           ON content(site_id);
CREATE INDEX idx_content_site_status    ON content(site_id, status);
CREATE INDEX idx_content_site_slug      ON content(site_id, slug);
CREATE INDEX idx_content_site_type      ON content(site_id, content_type);
CREATE INDEX idx_content_published      ON content(site_id, published_at DESC)
  WHERE status = 'published';
CREATE INDEX idx_clicks_site            ON affiliate_clicks(site_id);
CREATE INDEX idx_clicks_created         ON affiliate_clicks(created_at DESC);
CREATE INDEX idx_clicks_product         ON affiliate_clicks(product_id);

-- ═══════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════════

ALTER TABLE sites             ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories        ENABLE ROW LEVEL SECURITY;
ALTER TABLE products          ENABLE ROW LEVEL SECURITY;
ALTER TABLE content           ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_products  ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliate_clicks  ENABLE ROW LEVEL SECURITY;

-- Public read policies (anon key)
CREATE POLICY "public_read_sites"
  ON sites FOR SELECT USING (true);

CREATE POLICY "public_read_categories"
  ON categories FOR SELECT USING (true);

CREATE POLICY "public_read_active_products"
  ON products FOR SELECT USING (status = 'active');

CREATE POLICY "public_read_published_content"
  ON content FOR SELECT USING (status = 'published');

CREATE POLICY "public_read_content_products"
  ON content_products FOR SELECT USING (true);

-- Anonymous write policies (public actions)
CREATE POLICY "public_insert_clicks"
  ON affiliate_clicks FOR INSERT WITH CHECK (true);

-- Note: All admin operations use the Supabase service key (bypasses RLS).

-- ═══════════════════════════════════════════════════════
-- TRIGGERS
-- ═══════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER content_updated_at
  BEFORE UPDATE ON content
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ═══════════════════════════════════════════════════════
-- SEED: arabic-tools site
-- ═══════════════════════════════════════════════════════

INSERT INTO sites (id, name, domain, language, direction, locale)
VALUES ('arabic-tools', 'Arabic Tools', 'arabic-tools.example.com', 'ar', 'rtl', 'ar_SA');

-- ═══════════════════════════════════════════════════════
-- SEED: crypto-tools site
-- ═══════════════════════════════════════════════════════

INSERT INTO sites (id, name, domain, language, direction, locale)
VALUES ('crypto-tools', 'Crypto Tools', 'crypto-tools.example.com', 'en', 'ltr', 'en_US');

-- Crypto categories
INSERT INTO categories (id, site_id, name, slug, description, sort_order) VALUES
  ('c0000000-0000-0000-0000-000000000001', 'crypto-tools', 'Exchanges', 'exchanges', 'Compare cryptocurrency exchanges by fees, features, and security.', 1),
  ('c0000000-0000-0000-0000-000000000002', 'crypto-tools', 'Wallets', 'wallets', 'Hardware and software wallets for storing your crypto safely.', 2),
  ('c0000000-0000-0000-0000-000000000003', 'crypto-tools', 'DeFi', 'defi', 'Decentralized finance protocols, yield farming, and lending platforms.', 3),
  ('c0000000-0000-0000-0000-000000000004', 'crypto-tools', 'Mining', 'mining', 'Mining hardware, pools, and profitability calculators.', 4),
  ('c0000000-0000-0000-0000-000000000005', 'crypto-tools', 'NFTs', 'nfts', 'NFT marketplaces, tools, and analytics platforms.', 5),
  ('c0000000-0000-0000-0000-000000000006', 'crypto-tools', 'Education', 'education', 'Crypto courses, tutorials, and learning resources.', 6);

-- Crypto products
INSERT INTO products (id, site_id, name, slug, description, affiliate_url, image_url, price, merchant, score, is_featured, status, category_id, metadata) VALUES
  ('p0000000-0000-0000-0000-000000000001', 'crypto-tools', 'Binance', 'binance',
   'World''s largest crypto exchange by trading volume. Low fees and 350+ coins supported.',
   'https://www.binance.com/ref/example', '', 'Free to join', 'Binance', 9.2, true, 'active',
   'c0000000-0000-0000-0000-000000000001',
   '{"token_symbol": "BNB", "trading_fees": "0.1%", "kyc_required": true, "platform_type": "exchange"}'),

  ('p0000000-0000-0000-0000-000000000002', 'crypto-tools', 'Coinbase', 'coinbase',
   'Beginner-friendly US-based exchange with strong regulatory compliance.',
   'https://www.coinbase.com/ref/example', '', 'Free to join', 'Coinbase', 8.5, true, 'active',
   'c0000000-0000-0000-0000-000000000001',
   '{"trading_fees": "0.5%", "kyc_required": true, "platform_type": "exchange"}'),

  ('p0000000-0000-0000-0000-000000000003', 'crypto-tools', 'Ledger Nano X', 'ledger-nano-x',
   'Premium Bluetooth-enabled hardware wallet supporting 5,500+ coins.',
   'https://www.ledger.com/ref/example', '', '$149', 'Ledger', 9.0, true, 'active',
   'c0000000-0000-0000-0000-000000000002',
   '{"supported_coins": ["BTC", "ETH", "SOL", "ADA"], "security_rating": 9, "platform_type": "wallet"}'),

  ('p0000000-0000-0000-0000-000000000004', 'crypto-tools', 'Trezor Model T', 'trezor-model-t',
   'Open-source hardware wallet with touchscreen and advanced security features.',
   'https://www.trezor.io/ref/example', '', '$219', 'Trezor', 8.8, true, 'active',
   'c0000000-0000-0000-0000-000000000002',
   '{"supported_coins": ["BTC", "ETH", "LTC", "XRP"], "security_rating": 9, "platform_type": "wallet"}'),

  ('p0000000-0000-0000-0000-000000000005', 'crypto-tools', 'Aave', 'aave',
   'Leading DeFi lending protocol. Earn interest or borrow against your crypto.',
   'https://aave.com/ref/example', '', 'Free', 'Aave', 8.7, true, 'active',
   'c0000000-0000-0000-0000-000000000003',
   '{"token_symbol": "AAVE", "platform_type": "defi"}'),

  ('p0000000-0000-0000-0000-000000000006', 'crypto-tools', 'NiceHash', 'nicehash',
   'Marketplace for mining hash power. Mine or buy hash power easily.',
   'https://www.nicehash.com/ref/example', '', 'Free', 'NiceHash', 7.5, false, 'active',
   'c0000000-0000-0000-0000-000000000004',
   '{"platform_type": "mining"}'),

  ('p0000000-0000-0000-0000-000000000007', 'crypto-tools', 'OpenSea', 'opensea',
   'Largest NFT marketplace for buying, selling, and discovering digital assets.',
   'https://opensea.io/ref/example', '', 'Free', 'OpenSea', 8.0, false, 'active',
   'c0000000-0000-0000-0000-000000000005',
   '{"platform_type": "nft"}'),

  ('p0000000-0000-0000-0000-000000000008', 'crypto-tools', 'Kraken', 'kraken',
   'Established US exchange with advanced trading features and staking.',
   'https://www.kraken.com/ref/example', '', 'Free to join', 'Kraken', 8.6, true, 'active',
   'c0000000-0000-0000-0000-000000000001',
   '{"trading_fees": "0.16%", "kyc_required": true, "platform_type": "exchange"}');

-- Crypto content
INSERT INTO content (id, site_id, title, slug, body, excerpt, content_type, status, category_id, meta_title, meta_description, tags, published_at, author) VALUES
  ('d0000000-0000-0000-0000-000000000001', 'crypto-tools',
   'Best Crypto Exchanges in 2026: Complete Comparison',
   'best-crypto-exchanges-2026',
   '<h2>Top Crypto Exchanges Compared</h2><p>Choosing the right crypto exchange is one of the most important decisions for any trader. In this comparison, we analyze the top exchanges by fees, security, supported coins, and user experience.</p><h3>1. Binance</h3><p>Binance remains the largest exchange by volume, offering the lowest fees at 0.1% and supporting over 350 cryptocurrencies. Their BNB token provides additional fee discounts.</p><h3>2. Coinbase</h3><p>Coinbase is the go-to choice for beginners in the US market. While fees are higher at 0.5%, the platform''s simplicity and regulatory compliance make it a trusted option.</p><h3>3. Kraken</h3><p>Kraken offers a balance of advanced features and competitive fees at 0.16%. Their staking program is one of the best in the industry.</p>',
   'Compare the top cryptocurrency exchanges by fees, security, and features. Find the best platform for your trading needs.',
   'comparison', 'published',
   'c0000000-0000-0000-0000-000000000001',
   'Best Crypto Exchanges 2026 — Fees, Security & Features Compared',
   'Compare Binance, Coinbase, Kraken and more. Find the best crypto exchange for your needs in 2026.',
   ARRAY['exchanges', 'comparison', 'trading', 'fees'],
   NOW(), 'CryptoTools Team'),

  ('d0000000-0000-0000-0000-000000000002', 'crypto-tools',
   'Ledger Nano X Review: Is It Worth the Price?',
   'ledger-nano-x-review',
   '<h2>Ledger Nano X Review</h2><p>The Ledger Nano X is one of the most popular hardware wallets on the market. With Bluetooth connectivity and support for 5,500+ cryptocurrencies, it''s a premium choice for securing your digital assets.</p><h3>Build Quality</h3><p>The device feels solid and well-built. The stainless steel and plastic construction is durable enough for everyday use.</p><h3>Security</h3><p>Ledger uses a certified secure element chip (CC EAL5+) to store private keys. The device has never been remotely hacked.</p><h3>Verdict</h3><p>At $149, the Ledger Nano X offers excellent value for anyone serious about crypto security. The Bluetooth feature and mobile app make it convenient for on-the-go management.</p>',
   'In-depth review of the Ledger Nano X hardware wallet — security, features, and value for money.',
   'review', 'published',
   'c0000000-0000-0000-0000-000000000002',
   'Ledger Nano X Review 2026 — Security, Features & Price',
   'Detailed review of the Ledger Nano X hardware wallet. Is it worth $149? Read our honest assessment.',
   ARRAY['wallets', 'hardware-wallet', 'security', 'review'],
   NOW(), 'CryptoTools Team'),

  ('d0000000-0000-0000-0000-000000000003', 'crypto-tools',
   'Beginner''s Guide to DeFi: What You Need to Know',
   'beginners-guide-to-defi',
   '<h2>What is DeFi?</h2><p>Decentralized Finance (DeFi) refers to financial services built on blockchain technology that operate without traditional intermediaries like banks.</p><h3>Key DeFi Concepts</h3><p><strong>Lending & Borrowing:</strong> Platforms like Aave let you earn interest on your crypto or borrow against your holdings.</p><p><strong>Yield Farming:</strong> Provide liquidity to protocols and earn rewards in return.</p><p><strong>DEXs:</strong> Decentralized exchanges like Uniswap allow peer-to-peer trading without a central authority.</p><h3>Getting Started</h3><p>To start with DeFi, you''ll need a Web3 wallet like MetaMask, some ETH for gas fees, and a basic understanding of smart contracts.</p>',
   'Learn the fundamentals of Decentralized Finance — lending, yield farming, and DEXs explained for beginners.',
   'guide', 'published',
   'c0000000-0000-0000-0000-000000000003',
   'Beginner''s Guide to DeFi — Decentralized Finance Explained',
   'Complete beginner''s guide to DeFi. Learn about lending, yield farming, DEXs, and how to get started.',
   ARRAY['defi', 'guide', 'beginners', 'yield-farming'],
   NOW(), 'CryptoTools Team'),

  ('d0000000-0000-0000-0000-000000000004', 'crypto-tools',
   'How to Choose a Crypto Wallet in 2026',
   'how-to-choose-crypto-wallet',
   '<h2>Choosing the Right Crypto Wallet</h2><p>Your crypto wallet is the gateway to the blockchain. Choosing the right one depends on your needs — security, convenience, and the coins you hold.</p><h3>Hardware vs Software Wallets</h3><p>Hardware wallets like Ledger and Trezor offer the best security by keeping your keys offline. Software wallets are more convenient for daily transactions.</p><h3>Key Features to Look For</h3><ul><li>Supported cryptocurrencies</li><li>Security features (2FA, biometrics, secure element)</li><li>Backup and recovery options</li><li>User interface and ease of use</li><li>Mobile app availability</li></ul>',
   'A comprehensive guide to choosing the best crypto wallet for your needs — hardware vs software, security features, and more.',
   'article', 'published',
   'c0000000-0000-0000-0000-000000000002',
   'How to Choose a Crypto Wallet — Complete Guide 2026',
   'Compare hardware and software wallets. Learn what features matter most when choosing a crypto wallet.',
   ARRAY['wallets', 'security', 'guide'],
   NOW(), 'CryptoTools Team');

-- Crypto content-products links
INSERT INTO content_products (content_id, product_id, site_id, position, role) VALUES
  ('d0000000-0000-0000-0000-000000000001', 'p0000000-0000-0000-0000-000000000001', 'crypto-tools', 0, 'hero'),
  ('d0000000-0000-0000-0000-000000000001', 'p0000000-0000-0000-0000-000000000002', 'crypto-tools', 1, 'featured'),
  ('d0000000-0000-0000-0000-000000000001', 'p0000000-0000-0000-0000-000000000008', 'crypto-tools', 2, 'featured'),
  ('d0000000-0000-0000-0000-000000000002', 'p0000000-0000-0000-0000-000000000003', 'crypto-tools', 0, 'hero'),
  ('d0000000-0000-0000-0000-000000000002', 'p0000000-0000-0000-0000-000000000004', 'crypto-tools', 1, 'vs-right'),
  ('d0000000-0000-0000-0000-000000000003', 'p0000000-0000-0000-0000-000000000005', 'crypto-tools', 0, 'featured'),
  ('d0000000-0000-0000-0000-000000000004', 'p0000000-0000-0000-0000-000000000003', 'crypto-tools', 0, 'featured'),
  ('d0000000-0000-0000-0000-000000000004', 'p0000000-0000-0000-0000-000000000004', 'crypto-tools', 1, 'featured');
