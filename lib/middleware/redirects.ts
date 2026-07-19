import { NextRequest, NextResponse } from "next/server";
import { safeRedirectUrl } from "@/lib/safe-redirect";
import type { SiteRedirect } from "@/lib/middleware/site-resolution";

function normalizePath(value: string): string {
  const trimmed = value.trim();
  return trimmed.length > 1 ? trimmed.replace(/\/+$/, "") : trimmed;
}

/** Combine a configured destination with the source request's query string. */
function mergeSearch(destination: string, search: string): string {
  if (!search) return destination;
  if (destination.includes("?")) {
    const sep = destination.endsWith("?") || destination.endsWith("&") ? "" : "&";
    return destination + sep + search.slice(1);
  }
  return destination + search;
}

function findRedirect(
  pathname: string,
  redirects: SiteRedirect[],
): { destination: string; permanent: boolean } | null {
  const normalizedPath = normalizePath(pathname);
  for (const redirect of redirects) {
    const source = normalizePath(redirect.source_path);
    if (!source) continue;
    if (normalizedPath === source || pathname === redirect.source_path) {
      if (!redirect.destination_path) continue;
      return { destination: redirect.destination_path, permanent: redirect.permanent === true };
    }
  }
  return null;
}

export function applyRedirects(
  request: NextRequest,
  redirects: SiteRedirect[],
): NextResponse | null {
  const redirect = findRedirect(request.nextUrl.pathname, redirects);
  if (!redirect) return null;

  // Preserve tracking/UTM query parameters on the redirect target.
  const destinationWithQuery = mergeSearch(redirect.destination, request.nextUrl.search);

  // safeRedirectUrl validates the destination against the request origin and
  // rejects off-site, malformed, or non-HTTP(S) targets. It must be the
  // first argument to NextResponse.redirect so the Semgrep sanitizer rule
  // (unsafe-redirect-nextresponse-status) recognizes it as a safe redirect.
  const safeDestination = safeRedirectUrl(destinationWithQuery, request);

  try {
    const target = new URL(safeDestination, request.url);

    // Avoid redirect loops where the destination is the same path.
    if (normalizePath(target.pathname) === normalizePath(request.nextUrl.pathname)) {
      return null;
    }

    return NextResponse.redirect(
      safeRedirectUrl(destinationWithQuery, request),
      redirect.permanent ? 301 : 302,
    );
  } catch {
    return null;
  }
}
