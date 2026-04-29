-- Down migration for 00082: No-op.
-- Removing SET search_path from functions would re-introduce the
-- CVE-2018-1058 vulnerability. This down migration intentionally
-- does nothing.
SELECT 1;
