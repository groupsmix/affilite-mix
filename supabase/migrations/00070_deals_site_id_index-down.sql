-- Rollback for 00070_deals_site_id_index.sql.
--
-- Drops the single site_id-leading btree added by the up migration.
-- Safe to run repeatedly: DROP INDEX IF EXISTS is a no-op when the
-- index is already absent.

DROP INDEX IF EXISTS idx_deals_site;
