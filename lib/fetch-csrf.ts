/**
 * CSRF-aware fetch wrapper for admin form submissions.
 *
 * Fetches a CSRF token from GET /api/auth/csrf on first call, then includes
 * the x-csrf-token header on all subsequent requests. The token is cached
 * and automatically refreshed when approaching expiry (3.5 hours of the
 * 4-hour cookie lifetime). On 403 responses the token is cleared, refetched,
 * and the original request is retried once.
 */

import { CSRF_HEADER } from "@/lib/csrf";
import { toast } from "sonner";

let csrfToken: string | null = null;
let csrfTokenFetchedAt: number = 0;

/** Max age before proactively refetching (3.5 hours in ms) */
const TOKEN_MAX_AGE_MS = 3.5 * 60 * 60 * 1000;

function isTokenExpired(): boolean {
  if (!csrfToken || !csrfTokenFetchedAt) return true;
  return Date.now() - csrfTokenFetchedAt >= TOKEN_MAX_AGE_MS;
}

async function fetchCsrfToken(): Promise<string> {
  const res = await fetch("/api/auth/csrf");
  if (!res.ok) throw new Error("Failed to fetch CSRF token");
  const data = await res.json();
  csrfToken = data.csrfToken;
  csrfTokenFetchedAt = Date.now();
  return csrfToken as string;
}

async function ensureCsrfToken(): Promise<string> {
  if (csrfToken && !isTokenExpired()) return csrfToken;
  return fetchCsrfToken();
}

function clearCsrfToken(): void {
  csrfToken = null;
  csrfTokenFetchedAt = 0;
}

/**
 * Drop-in replacement for fetch() that automatically includes the
 * x-csrf-token header required by the middleware's double-submit
 * cookie CSRF protection.
 *
 * If the server returns 403, the cached token is cleared, a fresh
 * token is fetched, and the request is retried once.
 */
export async function fetchWithCsrf(
  url: string,
  opts: RequestInit = {},
): Promise<Response> {
  const token = await ensureCsrfToken();
  const headers = new Headers(opts.headers);
  headers.set(CSRF_HEADER, token);
  const response = await fetch(url, { ...opts, headers });

  if (response.status === 403) {
    clearCsrfToken();
    const freshToken = await fetchCsrfToken();
    const retryHeaders = new Headers(opts.headers);
    retryHeaders.set(CSRF_HEADER, freshToken);
    toast.info("Your session token was refreshed. Please try again.");
    return fetch(url, { ...opts, headers: retryHeaders });
  }

  return response;
}
