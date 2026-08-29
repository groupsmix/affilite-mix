-- Down-migration for 2026062203: restore db_now()'s mutable search_path.
--
-- Reverting re-introduces the `function_search_path_mutable` advisor warning
-- and the (currently non-exploitable) policy gap. Only run as a last resort.

ALTER FUNCTION public.db_now() RESET search_path;
