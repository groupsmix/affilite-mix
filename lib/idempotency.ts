/**
 * A46.6: Idempotency key support for POST endpoints.
 *
 * Prevents duplicate resource creation when a client retries a request
 * (e.g. flaky mobile network, browser double-click). The caller sends
 * an `Idempotency-Key` header; the server stores the response keyed by
 * that value in KV and replays it on subsequent requests with the same key.
 *
 * Storage: Cloudflare KV (APP_CACHE_KV binding) with a configurable TTL
 * (default 24 hours). When KV is unavailable (dev, missing binding),
 * the guard is a no-op and the request proceeds normally.
 *
 * Usage in a route handler:
 *
 *   import { checkIdempotency, storeIdempotencyResult } from "@/lib/idempotency";
 *
 *   export async function POST(request: NextRequest) {
 *     const cached = await checkIdempotency(request);
 *     if (cached) return cached;
 *
 *     // ... do work ...
 *     const response = NextResponse.json({ id: "..." }, { status: 201 });
 *
 *     await storeIdempotencyResult(request, response);
 *     return response;
 *   }
 */

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";

/** Header name for the idempotency key (standard draft RFC). */
export const IDEMPOTENCY_KEY_HEADER = "Idempotency-Key" as const;

/** Default TTL for cached responses: 24 hours. */
const DEFAULT_TTL_SECONDS = 86_400;

/** Maximum allowed key length to prevent KV key abuse. */
const MAX_KEY_LENGTH = 256;

interface CachedResponse {
  status: number;
  body: string;
  headers: Record<string, string>;
}

function getAppCacheKV():
  | {
      get(k: string): Promise<string | null>;
      put(k: string, v: string, opts?: { expirationTtl: number }): Promise<void>;
    }
  | undefined {
  const fromGlobal = (globalThis as Record<string, unknown>).APP_CACHE_KV;
  const candidate =
    fromGlobal !== undefined
      ? fromGlobal
      : (() => {
          try {
            return (process.env as Record<string, unknown>).APP_CACHE_KV;
          } catch {
            return undefined;
          }
        })();

  if (candidate && typeof candidate === "object" && "get" in candidate && "put" in candidate) {
    return candidate as {
      get(k: string): Promise<string | null>;
      put(k: string, v: string, opts?: { expirationTtl: number }): Promise<void>;
    };
  }
  return undefined;
}

/**
 * Build the KV key for an idempotency entry. Scoped by pathname so
 * the same Idempotency-Key value on different endpoints doesn't collide.
 */
function kvKey(pathname: string, idempotencyKey: string): string {
  return `idempotency:${pathname}:${idempotencyKey}`;
}

/**
 * Check if a request carries an `Idempotency-Key` header and whether
 * a cached response exists for it. Returns the cached response if found,
 * `null` otherwise (proceed with normal processing).
 *
 * Returns a 400 if the key is present but malformed (empty, too long).
 */
export async function checkIdempotency(
  request: NextRequest,
  ttlSeconds: number = DEFAULT_TTL_SECONDS,
): Promise<NextResponse | null> {
  const key = request.headers.get(IDEMPOTENCY_KEY_HEADER);
  if (!key) return null; // No idempotency requested

  // Validate key format
  if (key.length === 0 || key.length > MAX_KEY_LENGTH) {
    return NextResponse.json(
      { error: `${IDEMPOTENCY_KEY_HEADER} must be 1-${MAX_KEY_LENGTH} characters` },
      { status: 400 },
    );
  }

  // Check for non-printable / control characters
  if (/[\x00-\x1f\x7f]/.test(key)) {
    return NextResponse.json(
      { error: `${IDEMPOTENCY_KEY_HEADER} contains invalid characters` },
      { status: 400 },
    );
  }

  const kv = getAppCacheKV();
  if (!kv) return null; // KV unavailable, skip idempotency (dev mode)

  try {
    const cached = await kv.get(kvKey(request.nextUrl.pathname, key));
    if (!cached) return null;

    const parsed: CachedResponse = JSON.parse(cached);
    logger.info("Idempotency cache hit", {
      pathname: request.nextUrl.pathname,
      idempotencyKey: key,
    });

    return new NextResponse(parsed.body, {
      status: parsed.status,
      headers: {
        ...parsed.headers,
        "X-Idempotency-Replayed": "true",
      },
    });
  } catch {
    // KV error or corrupt data: proceed with normal processing
    return null;
  }
}

/**
 * Store the response for a successfully processed idempotent request.
 * Call this AFTER the route handler has produced a successful response.
 *
 * Only caches 2xx responses; error responses are not cached so the
 * client can retry.
 */
export async function storeIdempotencyResult(
  request: NextRequest,
  response: NextResponse,
  ttlSeconds: number = DEFAULT_TTL_SECONDS,
): Promise<void> {
  const key = request.headers.get(IDEMPOTENCY_KEY_HEADER);
  if (!key) return;

  // Only cache successful responses
  if (response.status < 200 || response.status >= 300) return;

  const kv = getAppCacheKV();
  if (!kv) return;

  try {
    const body = await response.clone().text();
    const headers: Record<string, string> = {};
    response.headers.forEach((v, k) => {
      // Don't cache transport headers
      if (!["content-encoding", "transfer-encoding", "connection"].includes(k.toLowerCase())) {
        headers[k] = v;
      }
    });

    const entry: CachedResponse = {
      status: response.status,
      body,
      headers,
    };

    await kv.put(kvKey(request.nextUrl.pathname, key), JSON.stringify(entry), {
      expirationTtl: ttlSeconds,
    });
  } catch {
    // Best-effort; don't fail the request if caching fails
  }
}
