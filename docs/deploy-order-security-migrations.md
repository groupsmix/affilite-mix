# Security migration deploy order (DP-001 / MG-005)

Apply database migrations **before** deploying application code that depends on them.

1. `2026052302_security_audit_hardening.sql` — version column, lockout RPC, indexes
2. `2026052303_split_concurrent_indexes.sql` — `CREATE INDEX CONCURRENTLY` (non-transactional)
3. `2026052401_products_version_positive_check.sql` — `CHECK (version > 0)`
4. `2026052402_lock_login_failed_attempts_rpc.sql` — restrict lockout RPC to `service_role`

After migrations succeed, deploy the application. If the app deploys first, `increment_login_failed_attempts` falls back to a non-atomic path until the RPC exists.
