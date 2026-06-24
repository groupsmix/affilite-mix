/**
 * Header that carries the current request pathname from middleware down to
 * Server Components (including the root layout).
 *
 * Next.js does not expose the matched pathname to layouts/pages via a public
 * API, so middleware propagates it on the request headers — the same mechanism
 * already used for `x-site-id`, the CSP nonce, and the trace id. Server
 * Components read it with `headers().get(PATHNAME_HEADER)`.
 */
export const PATHNAME_HEADER = "x-pathname";
