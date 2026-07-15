-- Rollback: 2026071505_automation_control_plane
--
-- Drops the machine-to-machine automation control plane in reverse dependency
-- order. This is destructive: all service accounts, hashed tokens, durable
-- runs/actions and per-site policies are removed. Only the hashed tokens are
-- sensitive, and they are unusable once dropped.

DROP TABLE IF EXISTS public.automation_policies;
DROP TABLE IF EXISTS public.automation_actions;
DROP TABLE IF EXISTS public.automation_runs;
DROP TABLE IF EXISTS public.automation_tokens;
DROP TABLE IF EXISTS public.automation_service_accounts;
