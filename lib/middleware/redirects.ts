import { NextRequest, NextResponse } from "next/server";
import type { SiteRedirect } from "@/lib/middleware/site-resolution";
import type { VerifiedSiteRef } from "@/lib/security/allowed-origins";

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
      const destination = redirect.destination_path.startsWith("http")
        ? redirect.destination_path
        : normalizePath(redirect.destination_path);
      if (!destination) continue;
      const destNormalized = normalizePath(
        destination.startsWith("http") ? new URL(destination).pathname : destination,
      );
      if (destNormalized === normalizedPath) continue; // avoid loop
      return { destination, permanent: redirect.permanent === true };
    }
  }
  return null;
}

export function applyRedirects(
  request: NextRequest,
  redirects: SiteRedirect[],
  verifiedSite: VerifiedSiteRef | null,
): NextResponse | null {
  const redirect = findRedirect(request.nextUrl.pathname, redirects);
  if (!redirect) return null;

  const isAbsolute =
    redirect.destination.startsWith("http://") || redirect.destination.startsWith("https://");
  const target = isAbsolute
    ? new URL(redirect.destination)
    : new URL(redirect.destination, `https://${verifiedSite?.domain ?? request.nextUrl.hostname}`);

  // Forward source query string for tracking/UTMs on relative redirects.
  if (!isAbsolute && request.nextUrl.search) {
    target.search = request.nextUrl.search;
  }

  return NextResponse.redirect(target, redirect.permanent ? 301 : 302);
}
