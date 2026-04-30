# ADR-0002: bcrypt with PBKDF2 Transparent Upgrade

**Status:** Accepted
**Date:** 2026-04-30 (documented retroactively)
**Deciders:** Platform team

## Context

Admin passwords were originally hashed with PBKDF2. Industry best practice moved toward bcrypt (or Argon2id) for password hashing due to better resistance to GPU-based attacks.

## Decision

Migrate from PBKDF2 to bcrypt cost-12, with transparent upgrade on login.

## Rationale

- bcrypt cost-12 provides ~250ms hash time, suitable for a login endpoint
- Transparent upgrade means existing PBKDF2 hashes are verified on login, then re-hashed with bcrypt and stored
- No mass migration or password reset required
- Argon2id was considered but bcrypt has broader library support in the Cloudflare Workers runtime

## Consequences

- `lib/password.ts` supports both hash formats during the migration period
- After all admins have logged in, PBKDF2 support can be removed
- A dummy bcrypt hash constant is used for timing-safe comparison on invalid usernames

## Evidence

- `lib/password.ts`, `lib/auth.ts`
- `__tests__/api/auth/password.test.ts`, `__tests__/api/auth/password-policy.test.ts`
