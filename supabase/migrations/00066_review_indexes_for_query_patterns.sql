-- ═══════════════════════════════════════════════════════
-- Migration 00066: Review indexes for real query patterns
-- ═══════════════════════════════════════════════════════
--
-- Task 43: Review indexes for the query patterns exercised by the DAL and
-- cron jobs. Each index below is justified by a concrete query in the
-- codebase; file references are included so reviewers can validate that
-- the filter/order shape matches.
--
--   1. sites (domain) — baseline_repair (00000) dropped the sites_domain_key
--      UNIQUE constraint to allow shared/empty domain values, which also
--      dropped the only index on `domain`. `getSiteRowByDomain` is invoked
--      on every request for domain-based routing and currently triggers a
--      sequential scan on sites.
--      See: lib/dal/sites.ts :: getSiteRowByDomain
--
--   2. products (site_id, status, created_at DESC) — the admin products
--      listing defaults to `.order("created_at", desc).eq("site_id").in("status")`
--      with pagination. The existing (site_id, status, category_id) and
--      (site_id, status, featured) indexes cover filtering but still require
--      an in-memory sort. This index enables an index-ordered scan so
--      paginated reads stay O(page_size).
--      See: lib/dal/products.ts :: listProducts / countProducts
--
--   3. products (status, deal_expires_at) WHERE status = 'active' — the
--      scheduled-publish cron archives deals cross-site via
--      `WHERE status = 'active' AND deal_expires_at IS NOT NULL AND
--      deal_expires_at <= now`. No existing index covers this cross-site
--      predicate; the query falls back to a full table scan. The partial
--      predicate keeps the index tight (most products are 'active' but
--      most have no expiry set).
--      See: app/api/cron/publish/route.ts (archive expired products)
--
--   4. content (site_id, status, created_at DESC) — same rationale as
--      products: admin content listing filters by (site_id, status) and
--      sorts by created_at. Existing (site_id, status, type) and
--      (site_id, slug) cannot serve the sort. Enables index-ordered
--      retrieval for the default admin grid.
--      See: lib/dal/content.ts :: listContent / countContent
--
--   5. price_alerts (product_id, target_price) WHERE is_active = true —
--      `findTriggeredAlerts` runs `.eq("product_id").eq("is_active", true)
--      .gte("target_price", currentPrice)` whenever a price snapshot
--      arrives. Existing (product_id, is_active) partial index filters
--      rows but then scans for the target_price comparison. Adding
--      target_price as a secondary key turns the predicate into a
--      range-scan inside a small partial index.
--      See: lib/dal/price-alerts.ts :: findTriggeredAlerts
--
-- All indexes use IF NOT EXISTS to keep the migration idempotent.
-- Notes on EXPLAIN ANALYZE: the production data-flow owner should capture
-- before/after plans from the staging DB snapshot (see
-- docs/migration-safety.md). On empty local databases Postgres will pick
-- sequential scans regardless of indexes, so plan validation should occur
-- against a realistically sized dataset.
-- ═══════════════════════════════════════════════════════

-- ── 1. sites.domain lookup ─────────────────────────────────────────────
-- Restores an index on `domain` after baseline_repair dropped the UNIQUE
-- constraint. Must stay non-unique because multi-site routing allows
-- shared/empty domain values.
CREATE INDEX IF NOT EXISTS idx_sites_domain ON sites (domain);

-- ── 2. products listing ordered by created_at ─────────────────────────
CREATE INDEX IF NOT EXISTS idx_products_site_status_created
  ON products (site_id, status, created_at DESC);

-- ── 3. products cross-site archive cron ───────────────────────────────
CREATE INDEX IF NOT EXISTS idx_products_active_deal_expires
  ON products (deal_expires_at)
  WHERE status = 'active' AND deal_expires_at IS NOT NULL;

-- ── 4. content listing ordered by created_at ──────────────────────────
CREATE INDEX IF NOT EXISTS idx_content_site_status_created
  ON content (site_id, status, created_at DESC);

-- ── 5. price_alerts trigger scan ──────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_price_alerts_product_target
  ON price_alerts (product_id, target_price)
  WHERE is_active = true;
