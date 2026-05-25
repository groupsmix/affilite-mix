-- A61-A85: Compliance hardening migration
-- Adds sensitivity classification to audit_log, consent_log schema validation,
-- and data-classification constraints.

-- ── 1. audit_log.sensitivity ─────────────────────────────────────────
-- Classification level for each audit event. Used for compliance reporting
-- (GDPR Art. 30 RoPA, SOC 2 CC7.2) and retention policy enforcement.

ALTER TABLE audit_log
ADD COLUMN IF NOT EXISTS sensitivity TEXT NOT NULL DEFAULT 'low'
CHECK (sensitivity IN ('low', 'medium', 'high', 'critical'));

-- Index for compliance queries: "all high/critical events in the last 90 days"
CREATE INDEX IF NOT EXISTS idx_audit_log_sensitivity_created
ON audit_log (sensitivity, created_at)
WHERE sensitivity IN ('high', 'critical');

COMMENT ON COLUMN audit_log.sensitivity IS
'A61-A85: Data sensitivity classification per event — low/medium/high/critical. '
'Critical covers auth, role changes, privacy restrictions. High covers uploads, '
'deletions. Medium covers content changes. Low covers reads/listings.';

-- ── 2. consent_log schema hardening ──────────────────────────────────
-- A69: Ensure the consent_log table has proper schema for CMP evidence.

DO $$
BEGIN
  -- Verify consent_log columns exist (created by earlier migration)
  -- If not, the application will log to stdout as fallback.
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'consent_log') THEN
    -- Add categories JSONB column if not present for granular consent proof
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'consent_log' AND column_name = 'categories'
    ) THEN
      ALTER TABLE consent_log ADD COLUMN categories JSONB DEFAULT NULL;
    END IF;

    -- Add gpc_signal column for Global Privacy Control evidence
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'consent_log' AND column_name = 'gpc_signal'
    ) THEN
      ALTER TABLE consent_log ADD COLUMN gpc_signal BOOLEAN DEFAULT NULL;
    END IF;

    -- Ensure banner_version column exists
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'consent_log' AND column_name = 'banner_version'
    ) THEN
      ALTER TABLE consent_log ADD COLUMN banner_version TEXT DEFAULT NULL;
    END IF;
  END IF;
END $$;

-- ── 3. Data classification comments on sensitive columns ─────────────
-- A61: Explicit field-level PII classification for major data classes.

COMMENT ON COLUMN admin_users.password_hash IS
'A61: SENSITIVE — bcrypt hashed credential. Rotation: on login rehash from PBKDF2.';

COMMENT ON COLUMN admin_users.totp_secret IS
'A61: SENSITIVE — AES-256-GCM encrypted TOTP secret at rest. Key: TOTP_ENCRYPTION_KEY.';

COMMENT ON COLUMN admin_users.reset_token IS
'A61: SENSITIVE — SHA-256 hash of single-use password reset token. 1-hour expiry.';

COMMENT ON COLUMN newsletter_subscribers.confirmation_token IS
'A61: SENSITIVE — SHA-256 hash of double-opt-in token. Compared timing-safe.';

COMMENT ON COLUMN newsletter_subscribers.unsubscribe_token IS
'A61: SENSITIVE — SHA-256 hash of unsubscribe token. Compared timing-safe.';

COMMENT ON COLUMN affiliate_clicks.ip_prefix IS
'A61: ONLINE IDENTIFIER — /24 IPv4 prefix or /48 IPv6 prefix only. '
'Full IP never stored. Retention: 90 days rolling purge.';

COMMENT ON COLUMN affiliate_clicks.fingerprint IS
'A61: ONLINE IDENTIFIER — HMAC-SHA256(site_id+slug+ip_prefix+ua_hash). '
'Not reversible to PII. 24-hour dedup window.';

COMMENT ON COLUMN quiz_submissions.answers IS
'A61: PII — user-generated content. May contain personal preferences. '
'Retention: linked to subscriber lifecycle or anonymized after 2 years.';

COMMENT ON COLUMN community_comments.content IS
'A61: PII — user-generated content. Moderation required. '
'Retention: until user requests erasure (GDPR Art. 17) or account deletion.';

-- ── 4. Prevent accidental PHI collection guardrail ───────────────────
-- A64: Add CHECK constraint to quiz content to flag potential health data.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'quiz_submissions'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quiz_submissions' AND column_name = 'content_warning'
  ) THEN
    -- This is a soft guardrail column — the app layer validates before insert
    ALTER TABLE quiz_submissions ADD COLUMN content_warning TEXT DEFAULT NULL;
  END IF;
END $$;

-- ── 5. GDPR right-to-erasure support ─────────────────────────────────
-- A62: Add erasure_request tracking for GDPR Art. 17 workflows.

CREATE TABLE IF NOT EXISTS erasure_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  email_hash TEXT NOT NULL, -- for lookup without exposing email
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'completed', 'failed')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  -- A62: Scope of erasure — what data categories were deleted
  scope JSONB DEFAULT NULL,
  -- A62: Verification method used to confirm identity
  verification_method TEXT DEFAULT NULL,
  error_message TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_erasure_requests_site_email
ON erasure_requests (site_id, email_hash);

CREATE INDEX IF NOT EXISTS idx_erasure_requests_status
ON erasure_requests (status, requested_at)
WHERE status IN ('pending', 'in_progress');

COMMENT ON TABLE erasure_requests IS
'A62: GDPR Art. 17 right-to-erasure request tracking. '
'Every erasure is logged for audit evidence and SLA reporting.';

-- ── 6. Enable immutable audit sink trigger ───────────────────────────
-- A4-W09: Prevent UPDATE/DELETE on audit_log rows after insert.

CREATE OR REPLACE FUNCTION prevent_audit_log_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_log rows are immutable. UPDATE and DELETE are prohibited.';
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  -- Only create trigger if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'audit_log_immutable'
  ) THEN
    CREATE TRIGGER audit_log_immutable
    BEFORE UPDATE OR DELETE ON audit_log
    FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();
  END IF;
END $$;

COMMENT ON FUNCTION prevent_audit_log_mutation() IS
'A4-W09: Immutable audit sink — audit_log rows cannot be modified or deleted. '
'Retention is managed via partitioned table drops, not row-level DELETE.';
