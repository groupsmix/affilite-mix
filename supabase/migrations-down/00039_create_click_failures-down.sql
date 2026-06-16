-- Rollback 00039: Drop click_failures table
DROP POLICY IF EXISTS "service_role_all_click_failures" ON public.click_failures;
DROP TABLE IF EXISTS public.click_failures;
