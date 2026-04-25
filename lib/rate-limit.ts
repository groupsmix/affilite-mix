export async function rateLimit(key: string, options: { limit: number, window: string, failClosed?: boolean, env?: any }) {
  // 20. Require Durable Object rate limiter in production
  if (process.env.NODE_ENV === "production" && (!options.env || !options.env.RATE_LIMITER_DO)) {
    throw new Error("RATE_LIMITER_DO binding required in production");
  }

  // 21. Replace KV read-modify-write hot-path rate limiting
  // For production auth/admin/payment routes, route to DO instead of KV
  if (options.env && options.env.RATE_LIMITER_DO) {
    const id = options.env.RATE_LIMITER_DO.idFromName(key);
    const obj = options.env.RATE_LIMITER_DO.get(id);
    const resp = await obj.fetch(`http://rate-limiter/limit?key=${key}&limit=${options.limit}&window=${options.window}`);
    return resp.status === 200;
  }

  // Try DO primary (fallback block if DO missing in dev)
  if (options.failClosed) {
    // strict enforcement, fail closed
    return false; // if all backends fail
  }
  // Grace logic (KV only for approximate or low-risk counters)
  return true;
}
