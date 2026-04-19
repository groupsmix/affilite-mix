-- Migration: Platform architecture — modules, permissions, integrations, feature flags
-- Adds tables for dashboard-provisioned modular platform:
--   site_modules, site_feature_flags, roles, permissions, role_permissions,
--   user_site_roles, integration_providers, site_integrations

-- ── Module Registry ────────────────────────────────────────────────────
-- Each row represents a module enabled for a specific site.
-- The module_key references the application-level module registry.
CREATE TABLE IF NOT EXISTS site_modules (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id     UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  module_key  TEXT NOT NULL,
  is_enabled  BOOLEAN NOT NULL DEFAULT true,
  config      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (site_id, module_key)
);

CREATE INDEX idx_site_modules_site ON site_modules(site_id);
CREATE INDEX idx_site_modules_enabled ON site_modules(site_id, is_enabled) WHERE is_enabled = true;

ALTER TABLE site_modules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "site_modules_public_read" ON site_modules FOR SELECT USING (true);

-- ── Site Feature Flags ─────────────────────────────────────────────────
-- Per-site feature flags with kill-switch capability.
CREATE TABLE IF NOT EXISTS site_feature_flags (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id     UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  flag_key    TEXT NOT NULL,
  is_enabled  BOOLEAN NOT NULL DEFAULT false,
  description TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (site_id, flag_key)
);

CREATE INDEX idx_site_feature_flags_site ON site_feature_flags(site_id);

ALTER TABLE site_feature_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "site_feature_flags_public_read" ON site_feature_flags FOR SELECT USING (true);

-- ── Roles ──────────────────────────────────────────────────────────────
-- Predefined roles for the permission system.
CREATE TABLE IF NOT EXISTS roles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL UNIQUE,
  label       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  is_system   BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "roles_public_read" ON roles FOR SELECT USING (true);

-- Seed system roles
INSERT INTO roles (name, label, description, is_system) VALUES
  ('owner',       'Owner',       'Full platform access, can manage all sites and users', true),
  ('super_admin', 'Super Admin', 'Full access to all sites, cannot manage owners', true),
  ('admin',       'Admin',       'Full access to assigned sites', true),
  ('editor',      'Editor',      'Can create, edit, and publish content on assigned sites', true),
  ('author',      'Author',      'Can create and edit own content, cannot publish', true),
  ('moderator',   'Moderator',   'Can review and moderate content', true),
  ('seo_manager', 'SEO Manager', 'Can manage SEO settings, metadata, and redirects', true),
  ('translator',  'Translator',  'Can create and edit translations', true),
  ('analyst',     'Analyst',     'Read-only access to analytics and reports', true)
ON CONFLICT (name) DO NOTHING;

-- ── Permissions ────────────────────────────────────────────────────────
-- Feature + action granularity.
CREATE TABLE IF NOT EXISTS permissions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feature     TEXT NOT NULL,
  action      TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  UNIQUE (feature, action)
);

ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "permissions_public_read" ON permissions FOR SELECT USING (true);

-- Seed permissions: feature.action pairs
INSERT INTO permissions (feature, action, description) VALUES
  -- Content
  ('content', 'view',      'View content items'),
  ('content', 'create',    'Create new content'),
  ('content', 'edit',      'Edit existing content'),
  ('content', 'publish',   'Publish or unpublish content'),
  ('content', 'delete',    'Delete content'),
  -- Products
  ('products', 'view',     'View products'),
  ('products', 'create',   'Create new products'),
  ('products', 'edit',     'Edit existing products'),
  ('products', 'delete',   'Delete products'),
  -- Categories
  ('categories', 'view',   'View categories'),
  ('categories', 'create', 'Create new categories'),
  ('categories', 'edit',   'Edit existing categories'),
  ('categories', 'delete', 'Delete categories'),
  -- SEO
  ('seo', 'view',          'View SEO settings'),
  ('seo', 'manage',        'Manage SEO settings and metadata'),
  -- Analytics
  ('analytics', 'view',    'View analytics and reports'),
  -- Integrations
  ('integrations', 'view',   'View integration settings'),
  ('integrations', 'manage', 'Configure and toggle integrations'),
  -- Users
  ('users', 'view',        'View user list'),
  ('users', 'manage',      'Manage user roles and permissions'),
  -- Settings
  ('settings', 'view',     'View site settings'),
  ('settings', 'manage',   'Manage site settings'),
  -- Themes
  ('themes', 'view',       'View theme settings'),
  ('themes', 'manage',     'Change theme and design settings'),
  -- Modules
  ('modules', 'view',      'View module configuration'),
  ('modules', 'manage',    'Enable/disable modules'),
  -- Scheduling
  ('scheduling', 'view',   'View scheduled items'),
  ('scheduling', 'manage', 'Manage content scheduling'),
  -- Publishing workflow
  ('publishing', 'approve',   'Approve content for publishing'),
  ('publishing', 'configure', 'Configure publishing workflow rules')
ON CONFLICT (feature, action) DO NOTHING;

-- ── Role ↔ Permission mapping ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS role_permissions (
  role_id       UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "role_permissions_public_read" ON role_permissions FOR SELECT USING (true);

-- Assign permissions to roles using a DO block
DO $$
DECLARE
  v_owner_id       UUID;
  v_super_admin_id UUID;
  v_admin_id       UUID;
  v_editor_id      UUID;
  v_author_id      UUID;
  v_moderator_id   UUID;
  v_seo_manager_id UUID;
  v_translator_id  UUID;
  v_analyst_id     UUID;
BEGIN
  SELECT id INTO v_owner_id       FROM roles WHERE name = 'owner';
  SELECT id INTO v_super_admin_id FROM roles WHERE name = 'super_admin';
  SELECT id INTO v_admin_id       FROM roles WHERE name = 'admin';
  SELECT id INTO v_editor_id      FROM roles WHERE name = 'editor';
  SELECT id INTO v_author_id      FROM roles WHERE name = 'author';
  SELECT id INTO v_moderator_id   FROM roles WHERE name = 'moderator';
  SELECT id INTO v_seo_manager_id FROM roles WHERE name = 'seo_manager';
  SELECT id INTO v_translator_id  FROM roles WHERE name = 'translator';
  SELECT id INTO v_analyst_id     FROM roles WHERE name = 'analyst';

  -- Owner gets ALL permissions
  INSERT INTO role_permissions (role_id, permission_id)
    SELECT v_owner_id, id FROM permissions
  ON CONFLICT DO NOTHING;

  -- Super Admin gets ALL permissions
  INSERT INTO role_permissions (role_id, permission_id)
    SELECT v_super_admin_id, id FROM permissions
  ON CONFLICT DO NOTHING;

  -- Admin gets all except users.manage and publishing.configure
  INSERT INTO role_permissions (role_id, permission_id)
    SELECT v_admin_id, id FROM permissions
    WHERE NOT (feature = 'users' AND action = 'manage')
      AND NOT (feature = 'publishing' AND action = 'configure')
  ON CONFLICT DO NOTHING;

  -- Editor: content full, categories view/create/edit, products view, seo view, scheduling, analytics view
  INSERT INTO role_permissions (role_id, permission_id)
    SELECT v_editor_id, id FROM permissions
    WHERE (feature = 'content')
       OR (feature = 'categories' AND action IN ('view', 'create', 'edit'))
       OR (feature = 'products' AND action = 'view')
       OR (feature = 'seo' AND action = 'view')
       OR (feature = 'scheduling' AND action IN ('view', 'manage'))
       OR (feature = 'analytics' AND action = 'view')
       OR (feature = 'publishing' AND action = 'approve')
  ON CONFLICT DO NOTHING;

  -- Author: content view/create/edit (no publish/delete), categories view
  INSERT INTO role_permissions (role_id, permission_id)
    SELECT v_author_id, id FROM permissions
    WHERE (feature = 'content' AND action IN ('view', 'create', 'edit'))
       OR (feature = 'categories' AND action = 'view')
       OR (feature = 'products' AND action = 'view')
  ON CONFLICT DO NOTHING;

  -- Moderator: content view/edit/publish, products view
  INSERT INTO role_permissions (role_id, permission_id)
    SELECT v_moderator_id, id FROM permissions
    WHERE (feature = 'content' AND action IN ('view', 'edit', 'publish'))
       OR (feature = 'products' AND action = 'view')
       OR (feature = 'categories' AND action = 'view')
       OR (feature = 'publishing' AND action = 'approve')
  ON CONFLICT DO NOTHING;

  -- SEO Manager: seo full, content view, analytics view
  INSERT INTO role_permissions (role_id, permission_id)
    SELECT v_seo_manager_id, id FROM permissions
    WHERE (feature = 'seo')
       OR (feature = 'content' AND action = 'view')
       OR (feature = 'analytics' AND action = 'view')
       OR (feature = 'settings' AND action = 'view')
  ON CONFLICT DO NOTHING;

  -- Translator: content view/create/edit
  INSERT INTO role_permissions (role_id, permission_id)
    SELECT v_translator_id, id FROM permissions
    WHERE (feature = 'content' AND action IN ('view', 'create', 'edit'))
       OR (feature = 'categories' AND action = 'view')
  ON CONFLICT DO NOTHING;

  -- Analyst: view-only across analytics, content, products, seo
  INSERT INTO role_permissions (role_id, permission_id)
    SELECT v_analyst_id, id FROM permissions
    WHERE action = 'view'
      AND feature IN ('analytics', 'content', 'products', 'categories', 'seo', 'settings')
  ON CONFLICT DO NOTHING;
END $$;

-- ── User ↔ Site ↔ Role assignments ─────────────────────────────────────
-- A user can have a different role per site.
CREATE TABLE IF NOT EXISTS user_site_roles (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id   UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  site_id   UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  role_id   UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, site_id)
);

CREATE INDEX idx_user_site_roles_user ON user_site_roles(user_id);
CREATE INDEX idx_user_site_roles_site ON user_site_roles(site_id);

ALTER TABLE user_site_roles ENABLE ROW LEVEL SECURITY;

-- ── Integration Providers ──────────────────────────────────────────────
-- Registry of available integration providers.
CREATE TABLE IF NOT EXISTS integration_providers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key         TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  category    TEXT NOT NULL CHECK (category IN (
    'affiliate_network', 'analytics', 'email', 'storage', 'bot_protection', 'search', 'cdn', 'other'
  )),
  description TEXT NOT NULL DEFAULT '',
  config_schema JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_builtin  BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE integration_providers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "integration_providers_public_read" ON integration_providers FOR SELECT USING (true);

-- Seed built-in integration providers
INSERT INTO integration_providers (key, name, category, description, is_builtin, config_schema) VALUES
  ('custom_affiliate',  'Custom Affiliate Links',    'affiliate_network', 'Direct affiliate link management', true,
   '{"fields": []}'),
  ('amazon_associates', 'Amazon Associates',         'affiliate_network', 'Amazon affiliate program', true,
   '{"fields": [{"key": "tracking_id", "label": "Tracking ID", "type": "text", "required": true}]}'),
  ('impact',            'Impact',                    'affiliate_network', 'Impact affiliate network', true,
   '{"fields": [{"key": "account_sid", "label": "Account SID", "type": "text", "required": true}]}'),
  ('cj',                'Commission Junction',       'affiliate_network', 'CJ affiliate network', true,
   '{"fields": [{"key": "website_id", "label": "Website ID", "type": "text", "required": true}]}'),
  ('shareasale',        'ShareASale',                'affiliate_network', 'ShareASale affiliate network', true,
   '{"fields": [{"key": "merchant_id", "label": "Merchant ID", "type": "text", "required": true}]}'),
  ('ga4',               'Google Analytics 4',        'analytics',         'Google Analytics 4 tracking', true,
   '{"fields": [{"key": "measurement_id", "label": "Measurement ID", "type": "text", "required": true}]}'),
  ('search_console',    'Google Search Console',     'analytics',         'Google Search Console verification', true,
   '{"fields": [{"key": "verification_code", "label": "Verification Code", "type": "text", "required": true}]}'),
  ('resend',            'Resend',                    'email',             'Transactional email via Resend', true,
   '{"fields": [{"key": "api_key", "label": "API Key", "type": "secret", "required": true}]}'),
  ('mailchimp',         'Mailchimp',                 'email',             'Email marketing via Mailchimp', true,
   '{"fields": [{"key": "api_key", "label": "API Key", "type": "secret", "required": true}, {"key": "list_id", "label": "List ID", "type": "text", "required": true}]}'),
  ('brevo',             'Brevo',                     'email',             'Email marketing via Brevo (Sendinblue)', true,
   '{"fields": [{"key": "api_key", "label": "API Key", "type": "secret", "required": true}]}'),
  ('convertkit',        'ConvertKit',                'email',             'Creator email marketing via ConvertKit', true,
   '{"fields": [{"key": "api_key", "label": "API Key", "type": "secret", "required": true}]}'),
  ('cloudflare_r2',     'Cloudflare R2',             'storage',           'Object storage via Cloudflare R2', true,
   '{"fields": [{"key": "bucket_name", "label": "Bucket Name", "type": "text", "required": true}, {"key": "account_id", "label": "Account ID", "type": "text", "required": true}]}'),
  ('cloudflare_turnstile', 'Cloudflare Turnstile',   'bot_protection',    'Bot protection via Cloudflare Turnstile', true,
   '{"fields": [{"key": "site_key", "label": "Site Key", "type": "text", "required": true}, {"key": "secret_key", "label": "Secret Key", "type": "secret", "required": true}]}')
ON CONFLICT (key) DO NOTHING;

-- ── Site Integrations ──────────────────────────────────────────────────
-- Per-site integration instances with configuration.
CREATE TABLE IF NOT EXISTS site_integrations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id       UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  provider_key  TEXT NOT NULL REFERENCES integration_providers(key) ON DELETE CASCADE,
  is_enabled    BOOLEAN NOT NULL DEFAULT false,
  config        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (site_id, provider_key)
);

CREATE INDEX idx_site_integrations_site ON site_integrations(site_id);

ALTER TABLE site_integrations ENABLE ROW LEVEL SECURITY;

-- ── Auto-update triggers for updated_at ────────────────────────────────
CREATE OR REPLACE FUNCTION update_generic_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER site_modules_updated_at
  BEFORE UPDATE ON site_modules
  FOR EACH ROW EXECUTE FUNCTION update_generic_updated_at();

CREATE TRIGGER site_feature_flags_updated_at
  BEFORE UPDATE ON site_feature_flags
  FOR EACH ROW EXECUTE FUNCTION update_generic_updated_at();

CREATE TRIGGER site_integrations_updated_at
  BEFORE UPDATE ON site_integrations
  FOR EACH ROW EXECUTE FUNCTION update_generic_updated_at();
