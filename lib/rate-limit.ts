export async function rateLimit(key: string, options: { limit: number, window: string, failClosed?: boolean }) {
  // Try DO primary
  // Fall back to KV
  // If failClosed is true, DO NOT use per-isolate memory grace
  if (options.failClosed) {
    // strict enforcement, fail closed
    return false; // if all backends fail
  }
  // Grace logic
  return true;
}
