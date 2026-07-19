/**
 * G-18: Module-scope Stripe SDK cache.
 *
 * The Stripe SDK is heavy (~250 kB minified) and instantiating
 * `new Stripe(...)` allocates a request sender, http agent and a
 * pile of resource objects. Doing that on every webhook delivery
 * adds avoidable per-request latency.
 *
 * On Cloudflare Workers / edge runtime, module-scope state is
 * preserved for the lifetime of the isolate. By caching both the
 * dynamic `import("stripe")` result *and* the constructed client
 * here, the second and subsequent requests in an isolate skip
 * both the import resolution and the constructor altogether.
 *
 * The dynamic import (rather than a top-level `import Stripe from
 * "stripe"`) is intentional: it lets the Workers bundle defer the
 * 250 kB Stripe payload until the first webhook actually arrives,
 * which keeps cold-start startup costs bounded for unrelated
 * routes that share the same bundle.
 */
import type Stripe from "stripe";

type StripeModule = typeof import("stripe");
type StripeCtor = StripeModule["default"];

let _stripeCtor: StripeCtor | null = null;
let _stripeClient: Stripe | null = null;
let _stripeClientKey: string | null = null;

/**
 * Return a Stripe client constructed against `secretKey`.
 *
 * The constructor (and the `import("stripe")` module record) are
 * cached at module scope. If `secretKey` changes (e.g. live secret
 * rotation in a long-lived isolate), a fresh client is built and
 * cached against the new key.
 */
export async function getStripeClient(secretKey: string): Promise<Stripe> {
  if (_stripeClient && _stripeClientKey === secretKey) {
    return _stripeClient;
  }

  if (!_stripeCtor) {
    _stripeCtor = (await import("stripe")).default;
  }

  const Ctor = _stripeCtor;
  const client = new Ctor(secretKey, {
    // A65-F2: Pin Stripe API version to prevent unexpected breaking changes
    // when Stripe updates the account's default version. Test webhook
    // compatibility before bumping this value.
    apiVersion: "2026-05-27.dahlia",
    appInfo: { name: "affilite-mix" },
    httpClient: Ctor.createFetchHttpClient(),
  });

  _stripeClient = client;
  _stripeClientKey = secretKey;
  return client;
}
