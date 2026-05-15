-- ============================================================
-- Migration 00096: Admin user lockout fields
--
-- A208 / T1531: Add failed login attempts counter and lockout 
-- timestamp to enable automatic account lockout and progressive 
-- delay on brute force attacks against /api/auth/login.
-- ============================================================

ALTER TABLE public.admin_users 
ADD COLUMN IF NOT EXISTS login_failed_attempts INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS login_locked_until TIMESTAMPTZ;

-- ROLLBACK:
-- ALTER TABLE public.admin_users DROP COLUMN login_failed_attempts, DROP COLUMN login_locked_until;
