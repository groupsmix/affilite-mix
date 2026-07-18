-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 2026071202: upload permissions
-- ═══════════════════════════════════════════════════════════════════════════
--
-- The `upload` feature was already declared in the code and roles.json but
-- never seeded into the permissions table, so `withAuthz("upload", "create")`
-- only matched super_admin/owner. This migration backfills the feature so
-- the media library and the upload endpoint are usable by the roles that
-- should be able to manage images.
--
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO permissions (feature, action, description) VALUES
  ('upload', 'view',   'View the media library and uploaded images'),
  ('upload', 'create', 'Upload new images to the media library'),
  ('upload', 'delete', 'Delete images from the media library')
ON CONFLICT (feature, action) DO NOTHING;

DO $$
DECLARE
  v_owner_id       UUID;
  v_super_admin_id UUID;
  v_admin_id       UUID;
  v_editor_id      UUID;
  v_author_id      UUID;
  v_moderator_id   UUID;
  v_analyst_id     UUID;
  v_seo_manager_id UUID;
  v_translator_id  UUID;
BEGIN
  SELECT id INTO v_owner_id       FROM roles WHERE name = 'owner';
  SELECT id INTO v_super_admin_id FROM roles WHERE name = 'super_admin';
  SELECT id INTO v_admin_id       FROM roles WHERE name = 'admin';
  SELECT id INTO v_editor_id      FROM roles WHERE name = 'editor';
  SELECT id INTO v_author_id      FROM roles WHERE name = 'author';
  SELECT id INTO v_moderator_id   FROM roles WHERE name = 'moderator';
  SELECT id INTO v_analyst_id     FROM roles WHERE name = 'analyst';
  SELECT id INTO v_seo_manager_id FROM roles WHERE name = 'seo_manager';
  SELECT id INTO v_translator_id  FROM roles WHERE name = 'translator';

  -- Owner / Super Admin: all upload permissions
  INSERT INTO role_permissions (role_id, permission_id)
    SELECT v_owner_id, id FROM permissions WHERE feature = 'upload'
  ON CONFLICT DO NOTHING;

  INSERT INTO role_permissions (role_id, permission_id)
    SELECT v_super_admin_id, id FROM permissions WHERE feature = 'upload'
  ON CONFLICT DO NOTHING;

  -- Admin: all upload permissions
  INSERT INTO role_permissions (role_id, permission_id)
    SELECT v_admin_id, id FROM permissions WHERE feature = 'upload'
  ON CONFLICT DO NOTHING;

  -- Editor: view, create, delete (manages content assets)
  INSERT INTO role_permissions (role_id, permission_id)
    SELECT v_editor_id, id FROM permissions
    WHERE feature = 'upload' AND action IN ('view', 'create', 'delete')
  ON CONFLICT DO NOTHING;

  -- Author: view and create only
  INSERT INTO role_permissions (role_id, permission_id)
    SELECT v_author_id, id FROM permissions
    WHERE feature = 'upload' AND action IN ('view', 'create')
  ON CONFLICT DO NOTHING;

  -- Moderator / Analyst / SEO Manager / Translator: view only
  INSERT INTO role_permissions (role_id, permission_id)
    SELECT v_moderator_id, id FROM permissions
    WHERE feature = 'upload' AND action = 'view'
  ON CONFLICT DO NOTHING;

  INSERT INTO role_permissions (role_id, permission_id)
    SELECT v_analyst_id, id FROM permissions
    WHERE feature = 'upload' AND action = 'view'
  ON CONFLICT DO NOTHING;

  INSERT INTO role_permissions (role_id, permission_id)
    SELECT v_seo_manager_id, id FROM permissions
    WHERE feature = 'upload' AND action = 'view'
  ON CONFLICT DO NOTHING;

  INSERT INTO role_permissions (role_id, permission_id)
    SELECT v_translator_id, id FROM permissions
    WHERE feature = 'upload' AND action = 'view'
  ON CONFLICT DO NOTHING;
END $$;
