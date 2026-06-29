-- Rollback 2026062302: drop the atomic TOTP step RPC.
-- (The totp_last_step column itself is owned by 2026062201 and is not touched.)
DROP FUNCTION IF EXISTS verify_and_set_totp_step(uuid, bigint, bigint);
