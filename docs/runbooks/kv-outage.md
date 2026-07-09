# Runbook: KV Namespace Outage

> **Severity**: P2 — High
> **Response time**: < 1 hour
> **Escalation**: Slack `#incidents`

## Symptoms

- `rate_limit_kv_failopen` events spiking in logs/Sentry
- Rate limiting degraded to per-isolate in-memory limits
- Cache misses increasing (if using `APP_CACHE_KV`)
- Logger output: `kv_unavailable` or `kv_error` messages

## Diagnosis

### Step 1: Confirm KV is down

```bash
# Check Cloudflare status
open https://www.cloudflarestatus.com

# Check KV namespace health via Wrangler
wrangler kv:key get --namespace-id=<RATE_LIMIT_KV_ID> "__healthcheck__"
```

### Step 2: Check application behavior

```bash
# Health endpoint
curl -s -H "Authorization: Bearer $CRON_SECRET" \
  https://wristnerd.site/api/health | jq .kv

# Check Sentry for KV errors
# Sentry → Issues → Search: "kv_unavailable OR rate_limit_kv_failopen"
```

## Impact Assessment

| Component            | Impact          | Degradation Mode                                                  |
| -------------------- | --------------- | ----------------------------------------------------------------- |
| Rate limiting        | Degraded        | Per-isolate in-memory (60s grace)                                 |
| Admin guard cache    | Degraded        | Falls back to DB lookup                                           |
| Site resolver cache  | Degraded        | Falls back to DB lookup                                           |
| Maintenance mode     | Non-functional  | Cannot set/read maintenance flag                                  |
| Admin JWT revocation | **Fail-closed** | Admin sessions REJECTED while KV is down (strict mode, see below) |

## Mitigation

### KV is slow but not down

The rate limiter has a 60-second grace window (`lib/rate-limit.ts`). During
this window, in-memory counters enforce per-isolate limits. This is sufficient
for brief KV latency spikes.

**Action**: Monitor. If KV recovers within 60 s, no intervention needed.

### KV is fully down

1. **Accept degraded rate limiting** — per-isolate limits still prevent
   single-source abuse, but distributed limits are not enforced.
2. **Monitor for abuse** — check Cloudflare Analytics for traffic spikes.
3. **If abuse detected** — use Cloudflare WAF rules to block offending IPs:
   ```bash
   # Temporary WAF rule via Terraform or dashboard
   # Block specific IP
   curl -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/firewall/rules" \
     -H "Authorization: Bearer $CF_API_TOKEN" \
     -d '{"filter":{"expression":"ip.src eq 1.2.3.4"},"action":"block"}'
   ```
4. **Enable maintenance mode** (if KV is partially working):
   ```bash
   wrangler kv:key put --namespace-id=<ID> "maintenance_mode" "1"
   ```

### Admin lockout during outage (strict revocation)

Production runs with `ADMIN_SESSION_TOKEN_REVOCATION_STRICT=true` (deep-audit
B3): admin JWT revocation checks fail **closed** on KV outage, so all admin
sessions are rejected while KV is down. This is intentional — it prevents a
leaked/stolen admin token from being replayed during the outage window.

**Default action: accept the lockout.** Admin access is restored automatically
the moment KV recovers; no state is lost.

#### Break-glass: `ADMIN_SESSION_TOKEN_REVOCATION_STRICT=false`

⚠️ **This is a break-glass control.** Setting the flag to `false` disables
revocation checking **entirely** — logout, password reset, and forced session
invalidation stop working for already-issued admin tokens (not just during the
outage). Startup emits a `logger.error` (→ Sentry) whenever this value is live
in production, so an alert firing on this message outside a declared incident
means an operator (or an attacker with env access) flipped it.

Use it only if ALL of the following hold:

1. A P1/P2 incident is declared in `#incidents` and admin access is required
   to mitigate it (e.g. enabling maintenance mode, blocking abuse).
2. The KV outage is confirmed upstream (Cloudflare status) with no ETA.
3. No admin-credential compromise is suspected.

Procedure:

```bash
# 1. Announce in #incidents with incident ID before flipping anything.
# 2. Prefer the intermediate step first: UNSET the flag (fail-open) rather
#    than setting it to "false" (revocation off). Unset keeps revocation
#    checks working whenever KV responds.
# 3. Only if KV errors (not just unavailability) still block admin auth:
wrangler secret put ADMIN_SESSION_TOKEN_REVOCATION_STRICT   # value: false
# 4. Confirm the Sentry break-glass alert fired (expected — ack it against
#    the incident ID). If it did NOT fire, treat alerting as broken.
```

Rollback (mandatory, immediately on KV recovery):

```bash
wrangler secret put ADMIN_SESSION_TOKEN_REVOCATION_STRICT   # value: true
# Then force-invalidate all admin sessions issued during the window
# (password reset or the admin session-invalidation endpoint), since
# revocation had no effect on tokens issued while the flag was false.
```

Every use must be recorded in the post-incident report, including the
timestamps the flag was flipped and restored.

### KV is recovering

1. Verify KV reads return expected values
2. Check that rate limit counters have reset (expected after outage)
3. Monitor for 30 minutes to confirm stability

## Recovery

1. Confirm KV reads/writes are working
2. Verify rate limiting is back to distributed mode (check logs for absence
   of `kv_failopen` messages)
3. Clear any temporary WAF rules
4. Review Sentry for lingering errors
5. Write post-incident report

## Prevention

- Cloudflare KV has an SLA of 99.9% availability
- The Durable Object fallback (`workers/rate-limiter-do.ts`) provides atomic
  rate limiting when KV is unavailable (but adds latency)
- Consider Cloudflare's native Rate Limiting product for critical endpoints

## References

- `lib/rate-limit.ts` — rate limiting implementation
- `workers/rate-limiter-do.ts` — Durable Object atomic fallback
- `docs/alerting-runbook.md` — KV failure alerting configuration
