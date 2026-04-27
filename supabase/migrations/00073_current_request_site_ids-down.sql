-- Down migration for current_request_site_ids
DROP FUNCTION IF EXISTS public.current_request_site_ids();
