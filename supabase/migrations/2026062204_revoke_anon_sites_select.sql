-- ══════════════════════════════════════════════════════════════════
-- Migration 2026062204: fully revoke anon SELECT on public.sites
-- (audit P2 #5 — anon sites enumeration).
--
-- Problem: the public_read_sites policy (FOR SELECT TO anon USING
-- (is_active = true)) plus the column-scoped anon grant from 2026062102
-- still let anyone holding the browser-shipped anon key enumerate every
-- active tenant's slug, domain, theme, nav, and features in a single
-- PostgREST call. 2026062102's own comment documents that NO app code path
-- reads `sites` under the anon role — the public render path resolves sites
-- via the AUTHENTICATED tenant client (getTenantClient), and getAnonClient()
-- is used only for content/products/pages/categories. The anon grant on
-- `sites` is therefore vestigial attack surface with no functional consumer.
--
-- Fix: fully REVOKE the anon SELECT grant (column-scoped or otherwise) and
-- drop the now-dead public_read_sites policy. This removes the enumeration
-- surface entirely. Authenticated/service_role access is unaffected
-- (their grants and tenant_isolation / service_role policies remain).
--
-- Idempotent: REVOKE is a no-op when the grant is absent; DROP POLICY IF
-- EXISTS is safe to re-run.
-- ══════════════════════════════════════════════════════════════════

-- Revoke every anon SELECT grant on sites, including the column-scoped grant
-- introduced by 2026062102. REVOKE SELECT (without a column list) removes both
-- the table-wide and any column-level SELECT privileges held by anon.
REVOKE SELECT ON public.sites FROM anon;

-- Drop the anon read policy — with no grant it is already inert, but removing
-- it keeps pg_policies free of a misleading "public can read sites" entry.
DROP POLICY IF EXISTS "public_read_sites" ON public.sites;
