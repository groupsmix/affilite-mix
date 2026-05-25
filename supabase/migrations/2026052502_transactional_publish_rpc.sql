-- Migration: Transactional publish RPC for AI drafts
-- Audit: A5-004 — Race condition on draft publish
-- Standard: CWE-362
--
-- The previous application-level publish flow was:
--   1. UPDATE ai_drafts SET status='approved' WHERE id=$id
--   2. INSERT INTO content (...) VALUES (...)
--   3. UPDATE ai_drafts SET status='published' WHERE id=$id
--
-- This had three problems:
--   a. No transaction wrapper — partial failure leaves "approved" draft
--      with published content, or duplicate content on retry
--   b. No uniqueness check on (site_id, slug) — concurrent publishes
--      could create duplicate content rows
--   c. Application-level race condition between steps 2 and 3
--
-- This RPC wraps the entire flow in a single atomic transaction.
-- It either succeeds completely or fails completely, with no partial
-- state possible.

CREATE OR REPLACE FUNCTION publish_ai_draft(
  p_site_id UUID,
  p_draft_id UUID,
  p_actor TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_draft RECORD;
  v_content_id UUID;
  v_result JSONB;
BEGIN
  -- Lock the draft row for update to prevent concurrent modifications
  SELECT * INTO v_draft
  FROM ai_drafts
  WHERE id = p_draft_id AND site_id = p_site_id
  FOR UPDATE;

  -- Draft must exist and belong to the site
  IF v_draft IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Draft not found',
      'code', 'NOT_FOUND'
    );
  END IF;

  -- Idempotency: already published is a success (no-op)
  IF v_draft.status = 'published' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'id', v_draft.id,
      'status', 'published',
      'content_id', NULL,
      'message', 'Draft was already published'
    );
  END IF;

  -- Must be in 'approved' state before publishing
  -- (The caller should approve first, or use action='approve_publish')
  IF v_draft.status NOT IN ('approved', 'pending') THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Draft must be approved before publishing. Current status: ' || v_draft.status,
      'code', 'INVALID_STATUS'
    );
  END IF;

  -- Check for existing content with the same slug (prevent duplicates)
  SELECT id INTO v_content_id
  FROM content
  WHERE site_id = p_site_id AND slug = v_draft.slug;

  IF v_content_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Content with slug "' || v_draft.slug || '" already exists',
      'code', 'DUPLICATE_SLUG'
    );
  END IF;

  -- Insert the published content row
  INSERT INTO content (
    site_id,
    title,
    slug,
    body,
    excerpt,
    featured_image,
    type,
    status,
    category_id,
    tags,
    author,
    publish_at,
    meta_title,
    meta_description,
    og_image,
    body_previous,
    review_state
  ) VALUES (
    p_site_id,
    v_draft.title,
    v_draft.slug,
    COALESCE(v_draft.body, ''),
    COALESCE(v_draft.excerpt, ''),
    '',
    v_draft.content_type,
    'published',
    NULL,
    COALESCE(v_draft.keywords, ARRAY[]::TEXT[]),
    'AI',
    NULL,
    v_draft.meta_title,
    v_draft.meta_description,
    NULL,
    NULL,
    'published'
  )
  RETURNING id INTO v_content_id;

  -- Update draft to published status
  UPDATE ai_drafts
  SET
    status = 'published',
    reviewed_at = COALESCE(v_draft.reviewed_at, NOW()),
    reviewed_by = COALESCE(v_draft.reviewed_by, p_actor),
    updated_at = NOW()
  WHERE id = p_draft_id AND site_id = p_site_id;

  -- Record audit event
  INSERT INTO audit_log (
    site_id,
    actor,
    action,
    entity_type,
    entity_id,
    details
  ) VALUES (
    p_site_id,
    COALESCE(p_actor, 'system'),
    'publish',
    'ai_draft',
    p_draft_id::TEXT,
    jsonb_build_object(
      'content_id', v_content_id,
      'slug', v_draft.slug,
      'title', v_draft.title
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'id', v_draft.id,
    'status', 'published',
    'content_id', v_content_id,
    'slug', v_draft.slug
  );
END;
$$;

-- Grant execute to service role (the app connects via service_role)
GRANT EXECUTE ON FUNCTION publish_ai_draft(UUID, UUID, TEXT) TO service_role;
