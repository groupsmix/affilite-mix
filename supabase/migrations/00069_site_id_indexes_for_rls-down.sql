-- Rollback for 00069_site_id_indexes_for_rls.sql.
--
-- Drops the six site_id-leading btree indexes added by the up
-- migration. Safe to run repeatedly: every DROP INDEX uses IF EXISTS so
-- a partial rollback (or a database where one of the indexes was never
-- created) leaves the rest of the schema untouched.

DROP INDEX IF EXISTS idx_comments_site;
DROP INDEX IF EXISTS idx_drip_campaigns_site;
DROP INDEX IF EXISTS idx_price_alerts_site;
DROP INDEX IF EXISTS idx_quiz_submissions_site;
DROP INDEX IF EXISTS idx_quizzes_site;
DROP INDEX IF EXISTS idx_experiments_site;
