-- Partial reverse: restore scalar policies (cannot undo FK change safely)
-- Manual review required for production rollback.
SELECT 'DB-04/05/08 rollback requires manual review' AS notice;
