# ADR-0010: Per-Tenant Encryption Keys

**Status**: Proposed
**Date**: 2026-05-26
**Context**: etap-6 A6-03, A97, A246

## Problem

All encrypted data (uploaded files, sensitive fields) currently uses a single
`PHI_ENCRYPTION_KEY` shared across all tenants. A key compromise exposes every
tenant's encrypted data simultaneously.

## Current State

- `lib/encryption.ts` uses AES-256-GCM with a single master key.
- Key rotation SOP documented in `docs/SOP-SECRET-ROTATION.md`.
- Key stored as a Cloudflare Worker secret.

## Proposed Architecture

### Phase 1 — Key Envelope (30 days)

1. Generate a unique Data Encryption Key (DEK) per `site_id`.
2. Encrypt each DEK with the existing master key (now a Key Encryption Key / KEK).
3. Store encrypted DEKs in a new `site_encryption_keys` table:
   ```sql
   CREATE TABLE site_encryption_keys (
     site_id UUID PRIMARY KEY REFERENCES sites(id) ON DELETE CASCADE,
     encrypted_dek BYTEA NOT NULL,
     dek_version INTEGER NOT NULL DEFAULT 1,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     rotated_at TIMESTAMPTZ
   );
   ```
4. On encrypt: look up DEK for site → decrypt DEK with KEK → encrypt data with DEK.
5. On decrypt: same flow in reverse.

### Phase 2 — External KMS (60 days)

Replace the in-code KEK with Cloudflare Workers KMS or AWS KMS so the master
key never leaves the HSM boundary.

### Phase 3 — Key Rotation (90 days)

Automated rotation: generate new DEK version, re-encrypt active data, tombstone
old versions after grace period.

## Migration Strategy

1. New uploads use per-tenant DEK.
2. Background job re-encrypts existing files with tenant-specific DEK.
3. Dual-read: try tenant DEK first, fall back to legacy master key.
4. After full re-encryption, remove legacy fallback path.

## Decision

Adopt Phase 1 in the next sprint. Phase 2 and 3 are follow-ups.

## Consequences

- **Blast radius**: Key compromise now affects only one tenant.
- **Latency**: One extra KV/DB lookup per encrypt/decrypt (cacheable per request).
- **Complexity**: Migration requires dual-read path during transition.
