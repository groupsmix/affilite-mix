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

1. Preserve the current request/response schemas as the implicit v1 contract
   in the route metadata and generated OpenAPI document.
2. Add an `API-Version` response header to all API routes (`1` by default).
3. Internal consumers may send `Accept-Version: 1` as a compatibility
   assertion, but request headers do not select a different contract.

### New Endpoints: Explicit Versioning

New endpoint families introduced after this ADR must use URL-path versioning:

```
/api/v2/track/click      ← new click tracking format
/api/v2/q7m-k4j9/content     ← new content CRUD schema
```

Version identifiers are numeric major versions (`1`, `2`, …), never dates.
Date-based values are reserved for deprecation and sunset timestamps.

### Deprecation Policy

1. A deprecated endpoint gets a `Deprecation` response header and a `Sunset`
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

1. `next.config.ts` applies `API-Version: 1` to all `/api/*` responses,
   including routes excluded from middleware.
2. The middleware finalizer applies the same header to every matched API
   response, including short-circuit errors.
3. `lib/api-route-metadata.ts` is the route registry. Representative
   machine-readable schemas live in `lib/api-contract-schema.ts`.
4. `npm run generate:openapi` generates `openapi.yaml` from that metadata and
   schema model.
5. New endpoints use `/api/v2/` prefixes when introducing breaking changes.
