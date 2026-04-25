# Threat Model: Affilite-Mix

## Trust Boundaries

- **Cloudflare Edge**: All incoming HTTP traffic terminates at Cloudflare. We rely on Cloudflare WAF, Turnstile, and Rate Limiting.
- **Application Middleware**: Enforces CSRF, basic rate limits, active site scoping, and JWT extraction.
- **Supabase Database**: Uses Row Level Security (RLS) to enforce isolation for public data. Note that server-side API routes largely use `service_role` keys which bypass RLS. This is an accepted risk mitigated by strong API-level authorization.

## Known Risks and Accepted Trade-offs

1. **In-Memory Rate Limiter Fail-Open**:
   - _Risk_: If Cloudflare KV is unavailable, the rate limiter (`lib/rate-limit.ts`) falls back to per-isolate memory for a bounded grace window (`KV_GRACE_MS`, default 60 seconds, overridable via `RATE_LIMIT_KV_GRACE_MS`). After the grace window elapses without KV recovering, the limiter fails CLOSED — every rate-limited request is rejected with a 429-equivalent result. A successful KV call resets the grace window, so the next outage starts a fresh budget.
   - _Impact_: In a multi-isolate environment (like Cloudflare Pages / Workers), this gives an attacker temporary burst capacity (up to `KV_GRACE_MS` × isolate_count) before the limiter starts rejecting all requests. Login, newsletter, password reset, unsubscribe, and admin guard all share this code path.
   - _Mitigation_: The first failure fires a Sentry alert (`rate-limit.kv-unavailable-fail-open`) and emits a structured `rate_limit_kv_failopen` log line that operators can scrape into a burn-rate metric. The Durable Object rate limiter (`RATE_LIMITER_DO`) is preferred over KV when bound — it provides atomic per-key counters and avoids this fallback entirely.

2. **Service Role DB Access**:
   - _Risk_: API routes use `getServiceClient()` which bypasses Postgres RLS.
   - _Impact_: Any SQL injection or SSRF vulnerability in the API layer could lead to full database compromise.
   - _Mitigation_: Supabase migration `00055_harden_remaining_rls.sql` enforces `service_role` explicitly. Future work includes minting custom JWTs with `site_id` claims for true defense-in-depth.

3. **Cloudflare Vendor Lock-in**:
   - _Risk_: The platform is entirely dependent on Cloudflare Workers, KV, DOs, Queues, and Turnstile.
   - _Impact_: A Cloudflare-wide outage or policy change represents a single point of failure.

4. **JWT IP/UA Binding Aggregation**:
   - _Risk_: JWTs are bound to a `/24` IPv4 subnet and User-Agent hash.
   - _Impact_: Corporate VPNs or mobile carrier NATs may allow cross-device token reuse within the same network.
   - _Mitigation_: Accepted risk for improved UX over strict `/32` binding.
