# Troubleshooting: Cold-Start Latency Diagnosis

**Category:** Performance
**Last reviewed:** 2026-05-25

## Symptoms

- First request to a route takes 2–5x longer than subsequent requests
- Intermittent high-latency spikes in monitoring dashboards
- User reports of slow page loads after periods of inactivity
- p99 latency significantly higher than p50

## Background

affilite-mix runs on:

- **Cloudflare Workers** (edge runtime): Cold starts are typically 5–50ms
- **Vercel Serverless Functions** (Next.js SSR): Cold starts can be 200–2000ms depending on bundle size
- **Supabase** (PostgreSQL): Connection pool warmup can add 50–200ms

## Diagnosis Steps

### 1. Identify the Cold-Start Source

```bash
# Check Cloudflare Workers cold start metrics
wrangler tail --format json 2>&1 | jq 'select(.event.request) | {
  url: .event.request.url,
  duration_ms: .event.response.duration,
  cold_start: (.event.response.duration > 100)
}'
```

For Vercel:

- Check Vercel Dashboard → Project → Analytics → Function Duration
- Look for "Cold Start" indicator in function invocations

### 2. Measure Bundle Size Impact

Large bundles increase cold-start time. Check the main offenders:

```bash
# Next.js bundle analysis
ANALYZE=true npx next build

# Check specific route bundle sizes
ls -la .next/server/app/ | sort -k5 -rn | head -20

# Stripe SDK is the largest dependency (~250 kB)
# It's dynamically imported in lib/stripe-client.ts to mitigate this
```

### 3. Check Database Connection Warmup

```bash
# Supabase connection pool status (if using pgBouncer)
# Check for connection establishment latency in logs
grep "connection established" logs/ | tail -20

# Verify connection pooling is configured
grep -i "pool" .env.local
```

### 4. Check Module-Scope Caching

affilite-mix uses module-scope caching for expensive initializations:

- `lib/stripe-client.ts`: Caches Stripe SDK instance
- `lib/rate-limit.ts`: Caches LRU-based rate limiter
- `lib/supabase-server.ts`: Caches Supabase client

Verify these caches are working:

```typescript
// In a test or diagnostic route:
import { getStripeClient } from "@/lib/stripe-client";
const t1 = performance.now();
await getStripeClient();
const t2 = performance.now();
await getStripeClient(); // Should be near-instant (cached)
const t3 = performance.now();
console.log(`First: ${t2 - t1}ms, Second: ${t3 - t2}ms`);
```

### 5. Identify Heavyweight Imports

Check if routes are importing unnecessary dependencies:

```bash
# Find routes that import heavy modules
grep -rn "import.*stripe" app/api/ | grep -v webhook
grep -rn "import.*ai" app/api/ | grep -v "ai/"

# Check for barrel imports that pull in the entire library
grep -rn "from '@/lib'" app/api/ | head -20
```

## Resolution Options

### Option A: Dynamic Imports (Recommended)

Move heavy imports behind dynamic `import()` calls so they're only loaded when needed:

```typescript
// Before (loaded on every cold start):
import Stripe from "stripe";

// After (loaded only when this code path executes):
const Stripe = await import("stripe");
```

This pattern is already used in `lib/stripe-client.ts`.

### Option B: Edge Runtime

For routes that don't need Node.js APIs, use the Edge runtime:

```typescript
export const runtime = "edge"; // In the route file
```

Edge functions have much faster cold starts (5–50ms vs 200–2000ms).

### Option C: Keep-Alive / Warm-Up

For critical routes that must always be fast:

1. Set up a cron job that pings the route every 5 minutes
2. This keeps the function warm and avoids cold starts
3. Existing cron infrastructure: `.github/workflows/` or Cloudflare Cron Triggers

### Option D: Reduce Bundle Size

```bash
# Identify large dependencies
npx next build 2>&1 | grep "First Load JS"

# Check for duplicate dependencies
npm ls --all | grep -E "dedup|UNMET"
```

## Monitoring

- Set up p99 latency alerts for critical routes (API auth, webhooks, product pages)
- Track cold-start frequency: if > 10% of requests are cold starts, consider keep-alive
- Cloudflare Analytics → Workers → CPU Time distribution

## Related

- `docs/runbooks/supabase-connection-pool-exhaustion.md` — connection pool issues
- `lib/stripe-client.ts` — example of module-scope caching pattern
- `lib/rate-limit.ts` — LRU cache with cold-start optimization
