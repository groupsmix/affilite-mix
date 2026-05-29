-- Down migration for 2026052905_s11_authenticated_rls_policies

DROP POLICY IF EXISTS "authenticated_select_product_epc_stats" ON public.product_epc_stats;
DROP POLICY IF EXISTS "authenticated_select_subject_objections" ON public.subject_objections;
DROP POLICY IF EXISTS "authenticated_select_access_review_log" ON public.access_review_log;
