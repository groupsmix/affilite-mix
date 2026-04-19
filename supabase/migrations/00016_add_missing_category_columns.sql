-- Migration: Add missing columns to categories table
-- This syncs the Supabase schema with the local schema.sql

-- Add description column if it doesn't exist
ALTER TABLE categories ADD COLUMN IF NOT EXISTS description text DEFAULT '';

-- Add meta_title and meta_description columns if they don't exist
ALTER TABLE categories ADD COLUMN IF NOT EXISTS meta_title text DEFAULT '';
ALTER TABLE categories ADD COLUMN IF NOT EXISTS meta_description text DEFAULT '';
