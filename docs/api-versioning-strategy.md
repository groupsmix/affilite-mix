# API Versioning Strategy

## Current Contract

All existing unversioned `/api/*` routes are the implicit **v1** contract.
Responses include:

```http
API-Version: 1
```

Versions are numeric major versions (`1`, `2`, …), not dates. Dates are used
only for `Deprecation` and `Sunset` policy timestamps.

`API-Version` is applied centrally:

- `next.config.ts` covers every `/api/*` response, including internal routes
  excluded from middleware.
- The middleware finalizer covers matched routes and middleware short-circuit
  responses.

Internal consumers may send `Accept-Version: 1` as a compatibility assertion.
The request header does not negotiate or select a different contract.

## Breaking Changes

Breaking changes use URL path versioning:

```text
/api/track/click       # implicit v1
/api/v2/track/click    # breaking v2 contract
```

Do not retroactively move existing routes under `/api/v1/`; that would itself
break current consumers.

## Deprecation

1. Keep the old numeric path available for at least 90 days.
2. Return `Deprecation` and RFC 8594 `Sunset` headers from the deprecated path.
3. Alert when deprecated endpoints still receive traffic.
4. Remove the old path only after the published sunset.

## Contract Source of Truth

- `lib/api-route-metadata.ts` enumerates every route and its governance
  metadata.
- `lib/api-contract-schema.ts` defines reusable machine-readable request and
  response schemas for high-value routes.
- `npm run generate:openapi` generates `openapi.yaml` from those models.
- `__tests__/api-routes-metadata.test.ts` prevents route/registry drift.

Established success payloads remain unchanged unless a versioned route is
introduced. New or touched error paths should use `apiError()` so clients can
rely on `{ error, code, details? }` without requiring broad endpoint churn.
