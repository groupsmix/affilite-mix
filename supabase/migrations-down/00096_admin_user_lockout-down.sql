-- Rollback 00096: Remove lockout fields from admin_users
ALTER TABLE public.admin_users DROP COLUMN IF EXISTS login_failed_attempts;
ALTER TABLE public.admin_users DROP COLUMN IF EXISTS login_locked_until;
