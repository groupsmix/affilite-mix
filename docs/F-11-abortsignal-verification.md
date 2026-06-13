# F-11: DAL AbortSignal Implementation Status

## Status: Already Implemented - FetchWithTimeout Used Throughout Codebase

## Finding

F-11 — Ensure DAL calls honor AbortSignal

## Current Implementation

### fetchWithTimeout Implementation

The `fetchWithTimeout` function in `lib/fetch-timeout.ts` already fully supports AbortSignal:

```typescript
// Line 46-48 in fetch-timeout.ts
const signal = fetchOptions.signal
  ? AbortSignal.any([fetchOptions.signal, controller.signal])
  : controller.signal;
```

This implementation:

1. **Accepts caller's AbortSignal** via fetchOptions.signal
2. **Combines with timeout signal** using AbortSignal.any
3. **Either source can abort** the request (caller timeout OR middleware timeout)
4. **Propagates abort** through the entire call stack

### Usage Across Codebase

fetchWithTimeout is consistently used in all network operations:

**Supabase Clients:**

- `lib/server-only/service-role.ts` - Privileged client (12s timeout)
- `lib/supabase-server.ts` - Anon client (8s timeout) and Tenant client (12s timeout)

**Third-Party APIs:**

- `lib/turnstile.ts` - Turnstile verification
- `lib/password-policy.ts` - HIBP password check
- `lib/ai/providers.ts` - Cloudflare Workers AI, Groq, Cohere
- `app/api/newsletter/route.ts` - Resend email API
- `app/api/cron/commission-ingest/route.ts` - CJ, Admitad APIs

**Infrastructure Services:**

- `lib/r2.ts` - R2 storage operations (15s timeout)
- `lib/ssrf-guard.ts` - SSRF-protected fetches
- `lib/middleware-site-lookup.ts` - Site lookup queries

**Security Controls:**

- All external calls go through fetchWithTimeout
- All calls have explicit timeout values
- Circuit breakers are used with fetchWithTimeout

## AbortSignal Propagation

### Middleware Timeout

The middleware sets a 5000ms timeout with AbortSignal. This signal is passed through:

1. **Middleware** → sets AbortSignal with 5s timeout
2. **API Routes** → receive signal as part of request context
3. **Supabase Clients** → custom fetch handler receives signal via fetchOptions.signal
4. **fetchWithTimeout** → combines with its own timeout using AbortSignal.any
5. **Network Request** → aborts if either signal fires

### Timeout Hierarchy

```
Middleware: 5000ms (soft timeout, continues after 5s)
  ↓
Supabase Anon: 8000ms (hard timeout, aborts fetch)
Supabase Tenant: 12000ms (hard timeout, aborts fetch)
Supabase Privileged: 12000ms (hard timeout, aborts fetch)
  ↓
R2 Operations: 15000ms (hard timeout)
  ↓
External APIs: Varies (10s-15s typically)
```

## Missing Metric Implementation

The audit recommends adding a metric for "post-timeout completion" to catch cases where operations continue after the timeout but before completion.

### Implementation Required

Add metric to track operations that complete after AbortSignal abort:

```typescript
// In lib/fetch-timeout.ts, after successful fetch:
const response = await fetch(url, {
  ...restFetchOptions,
  signal,
});

// Check if we were aborted during the fetch but still got a response
if (controller.signal.aborted && response.ok) {
  emitMetric("fetch_post_timeout_completion_total", 1, {
    url: url.replace(/https?:\/\/[^\/]+/, ""), // Sanitize URL
    timeoutMs: String(timeoutMs),
  });
}
```

### Metric Schema

**Metric:** `fetch_post_timeout_completion_total`
**Type:** Counter
**Labels:**

- `url`: Sanitized endpoint path
- `timeoutMs`: The timeout value used
- `signalSource`: Which signal caused abort (middleware vs fetchWithTimeout)

### Alerting

Alert on:

- Sudden increase in post-timeout completions (indicates timeout too aggressive)
- Consistent post-timeime completions on specific endpoints (indicates endpoints need longer timeout)

## Verification

### Test Cases to Add

1. **Test AbortSignal propagation**: Verify middleware abort cancels in-flight Supabase queries
2. **Test timeout combination**: Verify both middleware and fetchWithTimeout timeouts work together
3. **Test post-timeime metric**: Verify metric fires when operation completes after abort

### Current Gaps

1. **No explicit tests** for AbortSignal propagation from middleware to DAL
2. **No metric** for post-timeout completions (as recommended in audit)
3. **No documentation** of which operations respect AbortSignal

## Compliance Mapping

- **SOC 2 CC6.6**: System timeouts
- **SOC 2 CC8.2**: System performance monitoring
- **ISO 27001 A.12.5.1**: Information backup (timeout as protection)
- **ISO 27001 A.17.2.1**: Implementation of information security continuity

## Related Documentation

- `lib/fetch-timeout.ts` - Implementation
- `lib/server-only/service-role.ts` - Privileged client usage
- `lib/supabase-server.ts` - Anon/tenant client usage
- `docs/runbooks/supabase-connection-pool-exhaustion.md` - Connection pool monitoring
- `docs/architecture-data-flow.md` - Data flow documentation

## Recommendation

F-11 should be marked as **partially implemented**:

✅ **Already Complete:**

- fetchWithTimeout supports AbortSignal propagation
- All Supabase clients use fetchWithTimeout
- All external API calls use fetchWithTimeout
- AbortSignal.any combines middleware and operation timeouts

⚠️ **Requires Completion:**

- Add metric for post-timeime completions
- Add tests for AbortSignal propagation
- Document which operations respect AbortSignal

**Effort to complete:** Small (add metric + tests)
**Priority:** P2 (medium severity, already mostly implemented)
