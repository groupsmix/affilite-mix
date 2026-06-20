-- Rollback: 2026062001_canonical_comparison_slugs
-- CA-302 — canonical (alphabetically-ordered) "X-vs-Y" comparison slugs.
--
-- This is an intentional no-op rollback. The forward migration performs a
-- one-way, idempotent *normalization* of historical comparison slugs
-- (b-vs-a -> a-vs-b, only when the canonical target was free). It does not
-- add, drop, or restructure any schema object.
--
-- Why there is no data-restoring down-migration:
--   1. Irreversible by construction. The forward migration overwrites `slug`
--      in place and does not preserve the pre-normalization value, so the
--      original reversed slug cannot be reconstructed from the row alone.
--   2. Not safely reversible in bulk. Reversing every canonical comparison
--      slug would also corrupt rows that were *already* canonical before the
--      backfill ran — they are indistinguishable from backfilled rows — and
--      could violate UNIQUE (site_id, slug).
--   3. Unnecessary. Canonical slugs are valid independently of the CA-302
--      feature. Rolling back the application code (middleware 301 / sitemap /
--      admin write path) leaves the normalized data correct and serviceable;
--      there is nothing to undo at the data layer.
--
-- If a specific row must be restored to a reversed form for manual review,
-- do it explicitly and conflict-checked, e.g.:
--   UPDATE content SET slug = 'writesonic-vs-jasper'
--   WHERE site_id = '<site>' AND slug = 'jasper-vs-writesonic' AND type = 'comparison';

DO $$
BEGIN
  RAISE NOTICE
    'down 2026062001_canonical_comparison_slugs: no-op — forward slug normalization is one-way and need not be reverted (see file header).';
END $$;
