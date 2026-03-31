-- Migration: Add RPC function for distinct audit log actions
-- Replaces JS-side deduplication that fetches all audit_log rows into memory.

CREATE OR REPLACE FUNCTION get_distinct_audit_actions(p_site_id uuid)
RETURNS TABLE(action text) AS $$
  SELECT DISTINCT action
  FROM audit_log
  WHERE site_id = p_site_id
  ORDER BY action;
$$ LANGUAGE sql STABLE;
