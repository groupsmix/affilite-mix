-- Migration: Add is_active column to sites table
-- The cron publish route queries sites with .eq("is_active", true) but the
-- sites table schema does not include an is_active column.

ALTER TABLE sites ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
