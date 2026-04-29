-- Reverse: drop aligned indexes (original mismatched ones cannot be recreated exactly)
DROP INDEX IF EXISTS idx_products_fts_english;
DROP INDEX IF EXISTS idx_content_fts_english;
