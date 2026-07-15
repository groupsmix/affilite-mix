-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 2026071505: automation control plane (machine-to-machine)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Adds a dedicated machine identity + durable action model so an external
-- AI server can operate a single site through a scoped, idempotent,
-- policy-gated API — WITHOUT a browser session, admin password, or the
-- Supabase service-role key.
--
-- Tables:
--   automation_service_accounts  — site-bound machine identity + scopes + limits
--   automation_tokens            — hashed bearer tokens (plaintext shown once)
--   automation_runs              — a unit of agent work
--   automation_actions           — a single durable, idempotent mutation
--   automation_policies          — per-site, per-action allow/approval/deny mode
--
-- All tables are service_role-only at the RLS layer; the automation API
-- gateway reaches them through the privileged client after authenticating
-- the bearer token. The plaintext token is never stored (only its SHA-256
-- hash), mirroring admin_api_tokens (migration 2026071101).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Service accounts ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.automation_service_accounts (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id             uuid        NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  name                text        NOT NULL,
  status              text        NOT NULL DEFAULT 'active'
                                  CHECK (status IN ('active', 'suspended', 'revoked')),
  scopes              text[]      NOT NULL DEFAULT '{}',
  allowed_ip_ranges   text[],
  max_actions_per_run integer     NOT NULL DEFAULT 25 CHECK (max_actions_per_run >= 0),
  max_actions_per_day integer     NOT NULL DEFAULT 200 CHECK (max_actions_per_day >= 0),
  created_by          uuid        NOT NULL REFERENCES public.admin_users(id) ON DELETE CASCADE,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.automation_service_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "automation_service_accounts_service_all"
  ON public.automation_service_accounts;
CREATE POLICY "automation_service_accounts_service_all"
  ON public.automation_service_accounts
  FOR ALL
  USING ((select auth.role()) = 'service_role')
  WITH CHECK ((select auth.role()) = 'service_role');

REVOKE ALL ON public.automation_service_accounts FROM anon, authenticated;

CREATE INDEX IF NOT EXISTS idx_automation_service_accounts_site
  ON public.automation_service_accounts(site_id);

-- ── Tokens (hashed) ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.automation_tokens (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  service_account_id  uuid        NOT NULL REFERENCES public.automation_service_accounts(id)
                                  ON DELETE CASCADE,
  token_hash          text        NOT NULL UNIQUE,
  name                text        NOT NULL DEFAULT 'default',
  expires_at          timestamptz NOT NULL,
  last_used_at        timestamptz,
  revoked_at          timestamptz,
  created_by          uuid        NOT NULL REFERENCES public.admin_users(id) ON DELETE CASCADE,
  created_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.automation_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "automation_tokens_service_all" ON public.automation_tokens;
CREATE POLICY "automation_tokens_service_all"
  ON public.automation_tokens
  FOR ALL
  USING ((select auth.role()) = 'service_role')
  WITH CHECK ((select auth.role()) = 'service_role');

REVOKE ALL ON public.automation_tokens FROM anon, authenticated;

CREATE INDEX IF NOT EXISTS idx_automation_tokens_hash ON public.automation_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_automation_tokens_account
  ON public.automation_tokens(service_account_id);

-- ── Runs ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.automation_runs (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  service_account_id uuid        NOT NULL REFERENCES public.automation_service_accounts(id)
                                 ON DELETE CASCADE,
  site_id            uuid        NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  trigger            text        NOT NULL DEFAULT 'agent'
                                 CHECK (trigger IN ('scheduled', 'webhook', 'owner', 'recovery', 'agent')),
  goal               text,
  status             text        NOT NULL DEFAULT 'running'
                                 CHECK (status IN ('running', 'succeeded', 'partial', 'failed', 'cancelled')),
  planned_actions    integer     NOT NULL DEFAULT 0,
  succeeded_actions  integer     NOT NULL DEFAULT 0,
  failed_actions     integer     NOT NULL DEFAULT 0,
  manual_actions     integer     NOT NULL DEFAULT 0,
  started_at         timestamptz NOT NULL DEFAULT now(),
  finished_at        timestamptz,
  summary            jsonb,
  error_code         text
);

ALTER TABLE public.automation_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "automation_runs_service_all" ON public.automation_runs;
CREATE POLICY "automation_runs_service_all"
  ON public.automation_runs
  FOR ALL
  USING ((select auth.role()) = 'service_role')
  WITH CHECK ((select auth.role()) = 'service_role');

REVOKE ALL ON public.automation_runs FROM anon, authenticated;

CREATE INDEX IF NOT EXISTS idx_automation_runs_site ON public.automation_runs(site_id);
CREATE INDEX IF NOT EXISTS idx_automation_runs_account
  ON public.automation_runs(service_account_id);

-- ── Actions (durable, idempotent) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.automation_actions (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id             uuid        REFERENCES public.automation_runs(id) ON DELETE SET NULL,
  service_account_id uuid        NOT NULL REFERENCES public.automation_service_accounts(id)
                                 ON DELETE CASCADE,
  site_id            uuid        NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  idempotency_key    text        NOT NULL,
  action_type        text        NOT NULL,
  target_type        text,
  target_id          uuid,
  risk_level         text        NOT NULL DEFAULT 'low'
                                 CHECK (risk_level IN ('low', 'medium', 'high', 'prohibited')),
  policy_decision    text        NOT NULL
                                 CHECK (policy_decision IN ('allow', 'approval_required', 'deny')),
  status             text        NOT NULL
                                 CHECK (status IN (
                                   'proposed', 'approved', 'policy_allowed', 'queued', 'running',
                                   'verifying', 'succeeded', 'rolled_back', 'retry_wait', 'failed',
                                   'manual_attention', 'cancelled')),
  payload            jsonb       NOT NULL DEFAULT '{}',
  payload_hash       text        NOT NULL,
  before_snapshot    jsonb,
  after_snapshot     jsonb,
  result             jsonb,
  attempt_count      integer     NOT NULL DEFAULT 0,
  next_attempt_at    timestamptz,
  approved_by        uuid        REFERENCES public.admin_users(id) ON DELETE SET NULL,
  approved_at        timestamptz,
  error_code         text,
  error_message      text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  -- At-least-once delivery must not create duplicate work: a repeated
  -- idempotency key for the same account returns the original action.
  CONSTRAINT automation_actions_idem_unique UNIQUE (service_account_id, idempotency_key)
);

ALTER TABLE public.automation_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "automation_actions_service_all" ON public.automation_actions;
CREATE POLICY "automation_actions_service_all"
  ON public.automation_actions
  FOR ALL
  USING ((select auth.role()) = 'service_role')
  WITH CHECK ((select auth.role()) = 'service_role');

REVOKE ALL ON public.automation_actions FROM anon, authenticated;

CREATE INDEX IF NOT EXISTS idx_automation_actions_run ON public.automation_actions(run_id);
CREATE INDEX IF NOT EXISTS idx_automation_actions_site ON public.automation_actions(site_id);
-- Supports the per-day quota count (service_account_id + created_at window).
CREATE INDEX IF NOT EXISTS idx_automation_actions_account_created
  ON public.automation_actions(service_account_id, created_at);

-- ── Policies (per-site, per-action) ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.automation_policies (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id      uuid        NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  action_type  text        NOT NULL,
  mode         text        NOT NULL CHECK (mode IN ('allow', 'approval_required', 'deny')),
  constraints  jsonb       NOT NULL DEFAULT '{}',
  is_active    boolean     NOT NULL DEFAULT true,
  updated_by   uuid        NOT NULL REFERENCES public.admin_users(id) ON DELETE CASCADE,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT automation_policies_site_action_unique UNIQUE (site_id, action_type)
);

ALTER TABLE public.automation_policies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "automation_policies_service_all" ON public.automation_policies;
CREATE POLICY "automation_policies_service_all"
  ON public.automation_policies
  FOR ALL
  USING ((select auth.role()) = 'service_role')
  WITH CHECK ((select auth.role()) = 'service_role');

REVOKE ALL ON public.automation_policies FROM anon, authenticated;

CREATE INDEX IF NOT EXISTS idx_automation_policies_site ON public.automation_policies(site_id);
