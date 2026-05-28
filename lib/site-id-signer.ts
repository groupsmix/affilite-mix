/**
 * F-1: Leaf module for site-id HMAC signing, imported by middleware.
 *
 * Extracted from lib/supabase-server.ts so middleware's Edge bundle does
 * not transitively pull in bcryptjs (via lib/auth → lib/password) or
 * jose/lib/deflate. This module's only dependency chain is:
 *   hmac-key → jwt-secret → logger
 * — all of which are Edge-safe.
 */

import { deriveHmacKey } from "@/lib/hmac-key";

/** Sign the site-id fallback header value for middleware to set. */
export async function signSiteIdFallback(siteId: string): Promise<string | null> {
  try {
    const key = await deriveHmacKey("site-id-fallback", ["sign"]);
    const encoder = new TextEncoder();
    const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(siteId));
    return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return null;
  }
}
