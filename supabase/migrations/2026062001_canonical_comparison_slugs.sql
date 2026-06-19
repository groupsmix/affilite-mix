-- 2026062001_canonical_comparison_slugs.sql
-- CA-302: enforce canonical (alphabetically-ordered) "X-vs-Y" comparison slugs.
--
-- A comparison can be written either way round (jasper-vs-writesonic /
-- writesonic-vs-jasper). The app now treats the alphabetically-ordered form as
-- canonical and 301-redirects the reverse (middleware) while the admin write
-- path stores only canonical slugs going forward. This migration backfills any
-- historical rows so the redirect target always exists (no 404s) and the
-- sitemap never lists two URLs for one page.
--
-- Safety properties:
--   * Idempotent — re-running is a no-op once all slugs are canonical.
--   * Conflict-safe — a row is rewritten only when its canonical slug is not
--     already taken within the same site, so the UNIQUE (site_id, slug)
--     constraint can never be violated. Genuine collisions are left untouched
--     for manual review.
--   * Collation-stable — operand ordering uses COLLATE "C" (byte/codepoint
--     order), matching the JavaScript `<=` comparison in lib/vs-slug.ts so the
--     DB and the app agree on what "canonical" means.

DO $$
BEGIN
  -- Guard: only run when the content table + slug column are present.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'content' AND column_name = 'slug'
  ) THEN
    WITH candidates AS (
      SELECT
        c.id,
        c.site_id,
        -- canonical form = operands swapped (only selected when left > right)
        split_part(c.slug, '-vs-', 2) || '-vs-' || split_part(c.slug, '-vs-', 1) AS canonical
      FROM content c
      WHERE c.type = 'comparison'
        -- exactly one '-vs-' separator (a two-operand comparison)
        AND (length(c.slug) - length(replace(c.slug, '-vs-', ''))) / length('-vs-') = 1
        -- both operands non-empty
        AND split_part(c.slug, '-vs-', 1) <> ''
        AND split_part(c.slug, '-vs-', 2) <> ''
        -- not already canonical: left operand sorts after right operand
        AND split_part(c.slug, '-vs-', 1) COLLATE "C"
              > split_part(c.slug, '-vs-', 2) COLLATE "C"
    )
    UPDATE content c
    SET slug = cand.canonical,
        updated_at = now()
    FROM candidates cand
    WHERE c.id = cand.id
      AND NOT EXISTS (
        SELECT 1 FROM content other
        WHERE other.site_id = cand.site_id
          AND other.slug = cand.canonical
          AND other.id <> cand.id
      );
  END IF;
END $$;
