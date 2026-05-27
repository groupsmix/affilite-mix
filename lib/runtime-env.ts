/**
 * P1-4: Typed runtime environment interface for Cloudflare Worker bindings.
 *
 * Cloudflare Workers expose bindings (KV, R2, DO, Queues) via the process.env
 * shim provided by @opennextjs/cloudflare. These are not strings like normal
 * env vars -- they are objects with methods (get/put for KV, etc.).
 *
 * This interface replaces `(process.env as any).BINDING_NAME as any` escape
 * hatches across the codebase with a typed accessor.
 */

/** Minimal KV namespace interface for cache/rate-limit bindings. */
export interface CloudflareKVBinding {
  get(key: string): Promise<string | null>;
  get(key: string, type: "text"): Promise<string | null>;
  get(key: string, type: "json"): Promise<unknown>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}

/** Minimal Queue binding interface for audit-log and click queues. */
interface CloudflareQueueBinding {
  send(message: unknown): Promise<void>;
}

/** Minimal R2 bucket interface for DLQ/storage bindings. */
interface CloudflareR2Binding {
  put(key: string, value: string | ReadableStream | ArrayBuffer): Promise<unknown>;
}

/** Minimal Analytics Engine binding interface. */
interface CloudflareAnalyticsEngineBinding {
  writeDataPoint(event: { blobs?: string[]; doubles?: number[]; indexes?: string[] }): void;
}

/** Typed accessor for Cloudflare Worker runtime bindings on process.env. */
export interface RuntimeEnv {
  APP_CACHE_KV?: CloudflareKVBinding;
  RATE_LIMIT_KV?: CloudflareKVBinding;
  AUDIT_QUEUE?: CloudflareQueueBinding;
  AUDIT_DLQ_BUCKET?: CloudflareR2Binding;
  ANALYTICS_ENGINE?: CloudflareAnalyticsEngineBinding;
  // Standard env vars (strings)
  [key: string]: unknown;
}

/**
 * Returns the Cloudflare runtime env with proper typing.
 * In Node.js (dev/test), KV bindings are undefined and callers
 * should null-check before use.
 */
export function getRuntimeEnv(): RuntimeEnv {
  return process.env as unknown as RuntimeEnv;
}

/**
 * Get the APP_CACHE_KV binding if available.
 * Returns null when running outside Cloudflare Workers.
 */
export function getAppCacheKV(): CloudflareKVBinding | null {
  const kv = getRuntimeEnv().APP_CACHE_KV;
  if (kv && typeof kv === "object" && "get" in kv && "put" in kv) {
    return kv;
  }
  return null;
}
