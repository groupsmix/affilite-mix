# API Versioning Strategy

## Current State

The API currently has **no versioning**. All routes live under `/api/*` with no
version prefix. This is acceptable for the current stage (single consumer: our
own admin UI + cron jobs), but becomes a liability when:

- Third-party integrations consume the API directly
- Mobile apps ship with baked-in API expectations
- Breaking changes need to coexist with old client versions

## Recommended Approach: URL Path Versioning

When API versioning becomes necessary, adopt **URL path versioning**:

```
/api/v1/admin/sites
/api/v1/admin/content
/api/v2/admin/sites  ← breaking change
```

### Why path versioning (not headers)

- **Cloudflare Workers routing**: Workers route by URL pattern. Header-based
  versioning requires custom middleware to inspect `Accept-Version` headers,
  adding latency and complexity.
- **Cache friendliness**: Cloudflare's CDN caches by URL by default. Different
  versions of the same resource get separate cache entries automatically.
- **Debuggability**: The version is visible in logs, error reports, and
  `curl` commands without needing to remember to set headers.

## Migration Plan (When Needed)

1. **Create `app/api/v1/` directory** mirroring current routes
2. **Add version middleware** that sets a `x-api-version` header on responses
3. **Keep unversioned routes** as aliases to the latest version during transition
4. **Deprecation timeline**: Announce deprecation 90 days before removing a
   version. Return `Sunset` and `Deprecation` headers per RFC 8594.

## Internal API Contracts

Even without versioning, internal API contracts should be tested. See the
contract tests in `__tests__/contracts/` which validate response shapes for
critical endpoints.

## When to Version

Trigger API versioning when any of these occur:

- An external party (not our admin UI) consumes the API
- A mobile app ships with hardcoded API calls
- A breaking change to response shape is required for a deployed endpoint
