-- Migration: Create web_vitals table for persisting Core Web Vitals metrics.

CREATE TABLE IF NOT EXISTS web_vitals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  value double precision NOT NULL,
  metric_id text,
  page text,
  href text,
  rating text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for querying recent metrics by name
CREATE INDEX IF NOT EXISTS idx_web_vitals_name_created
  ON web_vitals (name, created_at DESC);

-- RLS: allow inserts from anon (beacon) and reads from service role
ALTER TABLE web_vitals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anonymous inserts" ON web_vitals
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Allow service role full access" ON web_vitals
  FOR ALL TO service_role USING (true) WITH CHECK (true);
