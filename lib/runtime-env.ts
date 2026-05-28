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
export interface CloudflareQueueBinding {
  send(message: unknown): Promise<void>;
}

/** Minimal R2 bucket interface for DLQ/storage bindings. */
export interface CloudflareR2Binding {
  put(key: string, value: string | ReadableStream | ArrayBuffer): Promise<unknown>;
}

/**
 * Minimal Durable Object namespace interface used by the rate-limit
 * binding. We only narrow the methods our code actually calls (idFromName,
 * get(.fetch)) so the type stays portable across runtime versions.
 */
export interface CloudflareDurableObjectNamespace {
  idFromName(name: string): unknown;
  get(id: unknown): { fetch(input: Request | string, init?: RequestInit): Promise<Response> };
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
  AUDIT_ARCHIVE_R2?: CloudflareR2Binding;
  CLICK_QUEUE?: CloudflareQueueBinding;
  RATE_LIMITER_DO?: CloudflareDurableObjectNamespace;
  ANALYTICS_ENGINE?: CloudflareAnalyticsEngineBinding;
  // Standard env vars (strings)
  [key: string]: unknown;
}

/**
 * Returns the Cloudflare runtime env with proper typing.
 * In Node.js (dev/test), KV bindings are undefined and callers
 * should null-check before use.
 *
 * Exposed as a module-level variable rather than a `function` declaration
 * so vitest can `vi.spyOn(runtimeEnv, "getRuntimeEnv").mockImplementation`
 * to inject a fake binding map (Node's `process.env` is a Proxy that
 * string-coerces, so non-string values cannot be assigned directly).
 */
export const getRuntimeEnv: () => RuntimeEnv = () => process.env as unknown as RuntimeEnv;

/**
 * Get the APP_CACHE_KV binding if available.
 * Returns null when running outside Cloudflare Workers.
 *
 * Reads through `getRuntimeEnv` so test code can mock the binding map.
 */
export const getAppCacheKV: () => CloudflareKVBinding | null = () => {
  const kv = getRuntimeEnv().APP_CACHE_KV;
  if (kv && typeof kv === "object" && "get" in kv && "put" in kv) {
    return kv;
  }
  return null;
};

/**
 * Get the RATE_LIMIT_KV binding if available.
 * Returns null when running outside Cloudflare Workers.
 */
export const getRateLimitKV: () => CloudflareKVBinding | null = () => {
  const kv = getRuntimeEnv().RATE_LIMIT_KV;
  if (kv && typeof kv === "object" && "get" in kv && "put" in kv) {
    return kv;
  }
  return null;
};

/**
 * Get the RATE_LIMITER_DO Durable Object namespace if available.
 * Returns null when running outside Cloudflare Workers.
 */
export const getRateLimiterDO: () => CloudflareDurableObjectNamespace | null = () => {
  const ns = getRuntimeEnv().RATE_LIMITER_DO;
  if (ns && typeof ns === "object" && "idFromName" in ns && "get" in ns) {
    return ns;
  }
  return null;
};

/**
 * Get the CLICK_QUEUE producer binding if available.
 * Returns null when running outside Cloudflare Workers.
 */
export const getClickQueue: () => CloudflareQueueBinding | null = () => {
  const q = getRuntimeEnv().CLICK_QUEUE;
  if (q && typeof q === "object" && "send" in q) {
    return q;
  }
  return null;
};

/**
 * Get the AUDIT_ARCHIVE_R2 bucket binding if available.
 * Returns null when running outside Cloudflare Workers.
 */
export const getAuditArchiveR2: () => CloudflareR2Binding | null = () => {
  const r2 = getRuntimeEnv().AUDIT_ARCHIVE_R2;
  if (r2 && typeof r2 === "object" && "put" in r2) {
    return r2;
  }
  return null;
};
