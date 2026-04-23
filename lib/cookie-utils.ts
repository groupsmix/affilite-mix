/**
 * Whether cookies should be marked as Secure (HTTPS-only).
 * True in production, false in local development.
 */
export const IS_SECURE_COOKIE = process.env.NODE_ENV === "production";

/**
 * Get the appropriate cookie domain for the current site.
 * Returns the parent domain for wildcard subdomains to allow cookies
 * to be shared across subdomains (e.g., .wristnerd.xyz).
 * Returns undefined for localhost or when not configured.
 */
export function getCookieDomain(hostname?: string): string | undefined {
  const host = hostname ?? (typeof window !== "undefined" ? window.location.hostname : undefined);
  if (!host) return undefined;

  // Skip domain scoping for localhost or IP addresses
  const hostWithoutPort = host.split(":")[0];
  if (hostWithoutPort === "localhost" || /^\d+\.\d+\.\d+\.\d+$/.test(hostWithoutPort)) {
    return undefined;
  }

  // Extract the parent domain for known wildcard parent domains
  // This allows cookies to be shared across subdomains
  const WILDCARD_PARENT_DOMAINS = process.env.WILDCARD_PARENT_DOMAINS?.split(",").map(d => d.trim()) ?? ["wristnerd.xyz"];
  
  for (const parent of WILDCARD_PARENT_DOMAINS) {
    if (hostWithoutPort === parent || hostWithoutPort.endsWith(`.${parent}`)) {
      // Return domain with leading dot for subdomain sharing
      return `.${parent}`;
    }
  }

  // For other domains, return the host without port
  return hostWithoutPort;
}

/**
 * Safe cookie parsing utility.
 * Handles URL decoding and edge cases.
 */
export function getCookieValue(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.split("; ").find((row) => row.startsWith(`${name}=`));
  if (!match) return null;
  try {
    return decodeURIComponent(match.split("=")[1]);
  } catch {
    return match.split("=")[1];
  }
}
