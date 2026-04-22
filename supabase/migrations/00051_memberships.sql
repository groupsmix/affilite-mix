-- ============================================================
-- Migration 00051: Paid memberships
-- Weeks 11-13 §2.6 — $49/yr membership with price alerts + early deals
-- ============================================================

CREATE TABLE IF NOT EXISTS memberships (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id           UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  email             TEXT NOT NULL,
  name              TEXT,
  tier              TEXT NOT NULL DEFAULT 'insider' CHECK (tier IN ('insider', 'pro')),
  status            TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'expired', 'past_due')),
  stripe_customer_id    TEXT,
  stripe_subscription_id TEXT,
  current_period_start  TIMESTAMPTZ,
  current_period_end    TIMESTAMPTZ,
  cancelled_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_memberships_email_site
  ON memberships (email, site_id) WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_memberships_stripe_customer
  ON memberships (stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_memberships_stripe_sub
  ON memberships (stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_memberships_site_status
  ON memberships (site_id, status);

-- RLS
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_memberships" ON memberships FOR ALL USING (true) WITH CHECK (true);
