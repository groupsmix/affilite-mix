# Egress Filtering Policy

> A39: Network egress controls for Cloudflare Workers — outbound
> allowlists, DNS security, and SSRF prevention.

## global_fetch_strictly_public

The `global_fetch_strictly_public` compatibility flag is enabled in
`wrangler.jsonc` (line 8). This prevents the Worker from making
requests to:

- Private IP ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)
- Link-local addresses (169.254.0.0/16)
- Loopback (127.0.0.0/8)
- Metadata endpoints (e.g., AWS 169.254.169.254)

## Application-Level Outbound Allowlist

The application SHOULD enforce an outbound allowlist for all
`fetch()` calls. Approved destinations:

| Service         | Hostname                     | Purpose            |
| --------------- | ---------------------------- | ------------------ |
| Supabase        | `*.supabase.co`              | Database API       |
| Stripe          | `api.stripe.com`             | Payment processing |
| Resend          | `api.resend.com`             | Email delivery     |
| Cloudflare AI   | `*.cloudflare.com`           | AI inference       |
| Sentry          | `*.sentry.io`                | Error reporting    |
| R2              | `*.r2.cloudflarestorage.com` | Object storage     |
| External images | `m.media-amazon.com`         | Product images     |

### Enforcement

All outbound `fetch()` calls MUST validate the hostname against this
allowlist. The `lib/fetch-with-guard.ts` utility (if implemented)
provides this validation.

```typescript
// Example guard pattern
const ALLOWED_HOSTS = new Set([
  "api.stripe.com",
  "api.resend.com",
  // ... etc
]);

// SecurityError is not a built-in; define it (or use the built-in Error class).
class SecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SecurityError";
  }
}

function guardFetch(url: string): void {
  const hostname = new URL(url).hostname;
  if (!ALLOWED_HOSTS.has(hostname)) {
    throw new SecurityError(`Blocked outbound fetch to: ${hostname}`);
  }
}
```

## DNS Security

- All DNS records default to `proxied = true` (A39 fix in `dns.tf`).
- Unproxied records require an explicit comment justifying the exception.
- DNS exfiltration is mitigated by `global_fetch_strictly_public`.

## SSRF Testing

Run SSRF tests in CI to verify the guard is effective:

```bash
# These requests should be blocked by global_fetch_strictly_public
curl https://<domain>/api/internal/webhook?url=http://169.254.169.254/latest/meta-data
curl https://<domain>/api/internal/webhook?url=http://127.0.0.1:8080/q7m-k4j9
```

## Future: Zero-Trust Egress

Consider Cloudflare Gateway for per-Worker egress policies with:

- Domain-based allowlists
- TLS inspection
- DLP scanning on outbound data
