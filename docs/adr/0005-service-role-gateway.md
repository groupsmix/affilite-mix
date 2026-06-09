# ADR-0005: Service-Role-Only DAL Gateway

**Status:** Accepted
**Date:** 2026-04-30 (documented retroactively)
**Deciders:** Platform team

## Context

Supabase's service-role key bypasses Row Level Security (RLS). Unrestricted use of service-role in application code creates a risk of cross-tenant data exposure. Options considered:

1. Never use service-role (all queries go through RLS with user JWTs)
2. Use service-role everywhere with manual `site_id` filters
3. Gated service-role access via a branded client type and eslint rule

## Decision

Gate service-role access behind `lib/server-only/service-role.ts` which exports a `PrivilegedSupabaseClient` brand type. An eslint `no-restricted-syntax` rule requires an `// Audited:` comment on every usage.

## Rationale

- RLS-only is insufficient for cron jobs, queue consumers, and webhook handlers which lack user JWTs
- Ungated service-role is the root cause of the highest-severity finding (cross-tenant DAL paths; tracked privately as deep-audit F-001)
- The branded type prevents accidental misuse at the type level
- The eslint rule creates a human review gate on every new service-role usage

## Consequences

- 7 DAL files still use `getTenantClient()` in server-only contexts (tracked in F-001)
- Migration to `getPrivilegedSupabaseClient()` with explicit `site_id` is the P0 follow-up
- `seenCallers: Set<string>` in service-role.ts tracks which modules use the privileged client

## Evidence

- `lib/server-only/service-role.ts`
- `lib/security/service-role-allowlist.ts`
- `__tests__/admin-routes-no-service-role.test.ts`
- deep-audit F-001 (findings report retained privately)
