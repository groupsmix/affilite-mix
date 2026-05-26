# ADR-0008: API Versioning Strategy

**Status**: Accepted
**Date**: 2026-05-25
**Context**: R-005 — No API versioning strategy documented

## Context

All API routes are at `/api/…` with no version prefix. The Custom Worker
(`workers/custom-worker.ts`) and external integrations call these endpoints
directly. Breaking changes to any endpoint break all consumers simultaneously.

## Decision

### Existing Endpoints: Implicit v1

All current endpoints at `/api/*` are the implied **v1** contract. We will
NOT retroactively add `/api/v1/` prefixes to existing routes — that would be
a breaking change itself. Instead:

1. Document the current request/response schemas as the v1 contract in
   `docs/api-contracts/` (one YAML/JSON schema per endpoint family).
2. Add an `API-Version` response header to all API routes (`1` by default).
3. The Custom Worker must pin `API-Version: 1` in requests.

### New Endpoints: Explicit Versioning

New endpoint families introduced after this ADR must use URL-path versioning:

```
/api/v2/track/click      ← new click tracking format
/api/v2/admin/content     ← new content CRUD schema
```

### Deprecation Policy

1. A deprecated endpoint gets a `Deprecation` response header with a sunset
   date (RFC 8594).
2. Minimum 90-day deprecation window before removal.
3. Sentry alert when deprecated endpoints receive > 0 requests/day.
4. Breaking changes require a new version number.

## Consequences

### Positive

- Existing integrations are not disrupted
- New features can ship breaking changes safely
- Worker and API can be deployed independently

### Negative

- Two versioning mechanisms coexist (implicit v1 + explicit v2+)
- Slightly more complex routing

## Alternatives Considered

1. **Header-based versioning only** (`Accept: application/vnd.affilite.v2+json`)
   — rejected because URL versioning is simpler for debugging and caching.
2. **Query parameter versioning** (`?v=2`) — rejected because it pollutes
   cache keys and is non-standard.
3. **Retroactive `/api/v1/` prefix** — rejected because it would break
   all existing Worker ↔ API integrations.

## Implementation

1. Add `API-Version: 1` header in middleware for all `/api/*` responses.
2. Document existing endpoint contracts.
3. New endpoints use `/api/v2/` prefix when introducing breaking changes.
