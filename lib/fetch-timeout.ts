export interface FetchWithTimeoutOptions extends RequestInit {
  timeoutMs?: number;
  /** Next.js fetch extension for ISR / on-demand revalidation. */
  next?: { revalidate?: number | false; tags?: string[] };
}

export async function fetchWithTimeout(url: string, options: FetchWithTimeoutOptions = {}) {
  const { timeoutMs = 8000, ...fetchOptions } = options;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(id);
  }
}
