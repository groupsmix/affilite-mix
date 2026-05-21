-- F-034: Enable pg_trgm extension for ILIKE search performance
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create trigram indexes on the heavily searched columns
-- products.name
CREATE INDEX IF NOT EXISTS idx_products_name_trgm ON products USING gin (name gin_trgm_ops);

-- content.title
CREATE INDEX IF NOT EXISTS idx_content_title_trgm ON content USING gin (title gin_trgm_ops);

-- categories.name
CREATE INDEX IF NOT EXISTS idx_categories_name_trgm ON categories USING gin (name gin_trgm_ops);

-- audit_log.actor and audit_log.entity_id
CREATE INDEX IF NOT EXISTS idx_audit_log_actor_trgm ON audit_log USING gin (actor gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity_id_trgm ON audit_log USING gin (entity_id gin_trgm_ops);
