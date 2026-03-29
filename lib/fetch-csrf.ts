/**
 * CSRF-aware fetch wrapper for admin form submissions.
 *
 * Fetches a CSRF token from GET /api/auth/csrf on first call, then includes
 * the x-csrf-token header on all subsequent requests. The token is cached
 * for the lifetime of the page.
 */

import { CSRF_HEADER } from "@/lib/csrf";

let csrfToken: string | null = null;

async function ensureCsrfToken(): Promise<string> {
  if (csrfToken) return csrfToken;
  const res = await fetch("/api/auth/csrf");
  if (!res.ok) throw new Error("Failed to fetch CSRF token");
  const data = await res.json();
  csrfToken = data.csrfToken;
  return csrfToken as string;
}

/**
 * Drop-in replacement for fetch() that automatically includes the
 * x-csrf-token header required by the middleware's double-submit
 * cookie CSRF protection.
 */
export async function fetchWithCsrf(
  url: string,
  opts: RequestInit = {},
): Promise<Response> {
  const token = await ensureCsrfToken();
  const headers = new Headers(opts.headers);
  headers.set(CSRF_HEADER, token);
  return fetch(url, { ...opts, headers });
}
