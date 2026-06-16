-- Reverse: recreate every index dropped in 00093.
--
-- These may not be needed when the shadowing unique constraints exist,
-- but a down migration must faithfully restore the pre-migration state.
CREATE INDEX IF NOT EXISTS idx_admin_users_email ON public.admin_users(email);
CREATE INDEX IF NOT EXISTS idx_categories_site ON public.categories(site_id);
CREATE INDEX IF NOT EXISTS idx_products_site ON public.products(site_id);
CREATE INDEX IF NOT EXISTS idx_products_site_slug ON public.products(site_id, slug);
CREATE INDEX IF NOT EXISTS idx_content_site ON public.content(site_id);
CREATE INDEX IF NOT EXISTS idx_content_site_slug ON public.content(site_id, slug);
CREATE INDEX IF NOT EXISTS idx_pages_site ON public.pages(site_id);
CREATE INDEX IF NOT EXISTS idx_pages_site_slug ON public.pages(site_id, slug);
CREATE INDEX IF NOT EXISTS idx_quizzes_site ON public.quizzes(site_id);
CREATE INDEX IF NOT EXISTS idx_experiments_site ON public.experiments(site_id);
