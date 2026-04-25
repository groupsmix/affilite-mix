-- ═══════════════════════════════════════════════════════
-- Migration 00039: Create click_failures table (Fix F-024)
-- ═══════════════════════════════════════════════════════
-- Durable sink for Cloudflare Queue dead-letter messages.

CREATE TABLE IF NOT EXISTS public.click_failures (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  payload jsonb NOT NULL,
  error_message text,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Enable RLS but restrict to service_role only
ALTER TABLE public.click_failures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_click_failures" ON public.click_failures
  FOR ALL TO service_role
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
