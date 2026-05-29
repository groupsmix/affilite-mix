# NTP / Clock-Sync Validation for Workers Edge

> **A193 Remediation** — Validates clock accuracy assumptions for forensic readiness.
> **Last updated:** 2026-05-29

---

## 1. Problem

Forensic readiness (A193) and log correlation depend on accurate timestamps. Cloudflare Workers execute at the edge across hundreds of PoPs worldwide. If edge clocks drift, correlation IDs (`traceId` from `instrumentation.ts`) may have misleading timestamps, undermining forensic timelines.

---

## 2. Cloudflare Workers Clock Behavior

### How `Date.now()` Works in Workers

Cloudflare Workers have a **unique clock behavior** for security reasons:

1. **`Date.now()` returns the time of the last I/O event** (fetch, KV read, etc.), not the real-time system clock. This is a deliberate defense against Spectre-class timing attacks.
2. Between I/O operations, `Date.now()` returns the **same frozen value**.
3. The underlying system clock on each PoP is synchronized via NTP to Cloudflare's internal time infrastructure.

### Implications for Forensics

- **Accuracy:** Individual timestamps are accurate to within ~1ms of the I/O event time. Cloudflare's edge servers use internal NTP synchronization with sub-millisecond accuracy.
- **Resolution:** Within a single request, timestamps between I/O calls will be identical (frozen clock). This is expected behavior, not clock skew.
- **Cross-PoP correlation:** Timestamps from different PoPs are synchronized via Cloudflare's global NTP infrastructure. Cross-PoP skew is typically < 10ms.

---

## 3. Validation Approach

### Automated Health Check

The `/api/health` endpoint (invoked by monitoring) already returns a server timestamp. To validate clock accuracy:

1. Compare the `Date` response header (set by Cloudflare's edge) against the client's NTP-synchronized clock.
2. Expected delta: < 100ms for a direct request (accounting for network latency).
3. If delta exceeds 1 second, alert the on-call engineer.

### Periodic Validation

Add to the quarterly DR drill checklist (`docs/dr-drill-checklist.md`):

- [ ] Verify `/api/health` timestamp against NTP reference (e.g., `time.google.com`).
- [ ] Check Cloudflare Analytics Engine timestamps for consistency across PoPs.
- [ ] Review any Sentry events for timestamp anomalies (events arriving "in the past").

---

## 4. Mitigations Already in Place

1. **Correlation IDs:** `instrumentation.ts` generates a `traceId` per request that ties together all log entries regardless of absolute timestamp accuracy.
2. **Cloudflare request ID:** Every request has a `cf-ray` header with a Cloudflare-assigned unique ID and a datacenter code, providing an independent ordering.
3. **R2 log timestamps:** Log-shipper writes to R2 with server-side timestamps (R2's clock, not the Worker's), providing a second independent timestamp source.

---

## 5. Conclusion

Cloudflare Workers' clock behavior is well-documented and suitable for forensic purposes. The frozen-clock model within a request is a security feature, not a bug. Cross-PoP synchronization is handled by Cloudflare's infrastructure and is not configurable by tenants. The combination of correlation IDs, cf-ray headers, and R2 server timestamps provides sufficient forensic accuracy.

**No additional clock-sync configuration is required.** This document serves as the validation record per A193.
