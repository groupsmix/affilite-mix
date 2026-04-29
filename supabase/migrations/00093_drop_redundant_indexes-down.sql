-- Reverse: recreate dropped indexes (may not be needed if unique constraints exist)
CREATE INDEX IF NOT EXISTS idx_admin_users_email ON public.admin_users(email);
CREATE INDEX IF NOT EXISTS idx_categories_site ON public.categories(site_id);
CREATE INDEX IF NOT EXISTS idx_products_site ON public.products(site_id);
CREATE INDEX IF NOT EXISTS idx_content_site ON public.content(site_id);
CREATE INDEX IF NOT EXISTS idx_pages_site ON public.pages(site_id);
