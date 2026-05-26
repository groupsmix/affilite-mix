import { timingSafeCompare } from "@/lib/cron-auth";

/** A98-64: Supported revalidation auth modes */
export type AuthMode = "per-site" | "all-sites";

/** A98-64: Determine which token to validate against */
export function determineAuthMode(
  bearer: string,
  internalToken: string,
  allSitesToken?: string,
): AuthMode | null {
  const encoder = new TextEncoder();
  if (timingSafeCompare(encoder.encode(bearer), encoder.encode(internalToken))) {
    return "per-site";
  }
  if (allSitesToken && timingSafeCompare(encoder.encode(bearer), encoder.encode(allSitesToken))) {
    return "all-sites";
  }
  return null;
}
