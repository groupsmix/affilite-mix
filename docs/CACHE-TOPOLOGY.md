# Cache Topology

Affilite-Mix uses a multi-layered caching strategy to achieve global low-latency reads while protecting the Supabase backend from query storms.

## Domain to Site Resolution

When a request arrives, the `middleware.ts` must resolve the incoming `hostname` to a tenant `site_id`.

1. **In-Memory/Local Isolate**: Local variables in the isolate hold data temporarily.
2. **Cloudflare KV**: We store `site-domain:<hostname>` with an `expirationTtl` of 60 seconds.
3. **Next.js `unstable_cache`**: `getSiteRowByDomain` wraps the Supabase query. With OpenNext on Cloudflare, this is backed by an R2/D1 incremental cache (`NEXT_INC_CACHE_R2_BUCKET`), revalidated every 60 seconds and tagged with `["sites"]`.
4. **Supabase (Origin)**: If all caches miss, a direct query is made.

**Eviction**: 
When an admin modifies a site (e.g., suspends a tenant by setting `is_active = false`), `updateSite` calls `invalidateSiteCache()` which invokes `revalidateTag("sites")`. Since the KV TTL is bound to 60 seconds and the `unstable_cache` revalidates every 60 seconds, the maximum time a deactivated tenant will remain active across edge nodes is 1 minute.

## Product Links

Click tracking redirects (`/api/track/click`) also utilize Cloudflare KV to cache the mapping of product slugs to their actual affiliate URLs, preventing a database read on every redirect.
- TTL: 3600 seconds (1 hour).

## API Routes & Static Assets
- Static assets (`/_next/static/*`) are hashed and cached indefinitely by Cloudflare CDN.
- Most JSON API routes bypass cache entirely via Cloudflare WAF rules to ensure fresh administrative data.
