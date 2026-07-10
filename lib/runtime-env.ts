import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * P1-4: Typed runtime environment interface for Cloudflare Worker bindings.
 *
 * In @opennextjs/cloudflare, non-string bindings (KV, R2, DO, Queues) are NOT
 * available on `process.env` — they live on `getCloudflareContext().env`.
 * String env vars (NODE_ENV, APP_URL, etc.) are still on `process.env`.
 *
 * This module merges both sources: `getCloudflareContext().env` for object
 * bindings, falling back to `process.env` for string values and dev/test.
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
 *
 * Prefers `getCloudflareContext().env` (which exposes KV/R2/DO/Queue
 * bindings correctly) and falls back to `process.env` for dev/test
 * where the Cloudflare context is unavailable.
 *
 * Exposed as a module-level variable rather than a `function` declaration
 * so vitest can `vi.spyOn(runtimeEnv, "getRuntimeEnv").mockImplementation`
 * to inject a fake binding map.
 */
function resolveCloudflareContext(): { env: RuntimeEnv } | undefined {
  try {
    const context = getCloudflareContext();
    return { env: context.env as RuntimeEnv };
  } catch {
    // Cloudflare context unavailable (e.g. initOpenNextCloudflareForDev
    // not called in dev/test) — fall through to process.env.
    return undefined;
  }
}

export const getRuntimeEnv: () => RuntimeEnv = () => {
  const ctx = resolveCloudflareContext();
  if (ctx?.env) return ctx.env;
  return process.env as unknown as RuntimeEnv;
};

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

/**
 * PR-8 (FR-004): Read a Cloudflare binding injected onto `globalThis` — the
 * path tests use via `vi.stubGlobal`, and the path some runtimes expose
 * bindings on. The single `as T` is guarded by a real runtime shape check
 * (object + probe property), which replaces the `as unknown as T` double-casts
 * that were previously duplicated at each call site. Returns `undefined` when
 * the binding is absent or doesn't expose the probe — and is null-safe, unlike
 * the older inline `"x" in obj` checks that would throw on a literal `null`.
 */
export function readGlobalBinding<T>(name: string, probe: keyof T & string): T | undefined {
  const candidate = (globalThis as Record<string, unknown>)[name];
  if (candidate && typeof candidate === "object" && probe in candidate) {
    return candidate as T;
  }
  return undefined;
}
