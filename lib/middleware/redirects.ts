import { NextRequest, NextResponse } from "next/server";
import { safeRedirectUrl } from "@/lib/safe-redirect";
import type { SiteRedirect } from "@/lib/middleware/site-resolution";

function normalizePath(value: string): string {
  const trimmed = value.trim();
  return trimmed.length > 1 ? trimmed.replace(/\/+$/, "") : trimmed;
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

  // Validate the configured destination against the current request origin.
  // safeRedirectUrl rejects off-site, malformed, or non-HTTP(S) targets.
  const safeDestination = safeRedirectUrl(redirect.destination, request);

  try {
    const target = new URL(safeDestination, request.url);

    // Avoid redirect loops where the destination is the same path.
    if (normalizePath(target.pathname) === normalizePath(request.nextUrl.pathname)) {
      return null;
    }

    // Forward source query string for tracking/UTMs on relative/same-origin redirects.
    if (!safeDestination.startsWith("http://") && !safeDestination.startsWith("https://")) {
      target.search = request.nextUrl.search;
    }

    return NextResponse.redirect(target, redirect.permanent ? 301 : 302);
  } catch {
    return null;
  }
}
