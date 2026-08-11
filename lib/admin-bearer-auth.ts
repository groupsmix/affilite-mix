/**
 * Machine authentication for `/api/admin/*` via `Authorization: Bearer <token>`.
 *
 * Interactive admins authenticate with the `__Host-nh_admin_token` cookie,
 * which carries a UA/IP binding and a 30-minute idle timeout — both of which
 * make it unusable for a non-browser client (a script, a bot, an agent) whose
 * egress IP moves and whose calls are sparse. Such clients previously had to
 * exchange an admin API token for a cookie session on every request through
 * `POST /api/auth/token-login`, and still hit the binding check afterwards.
 *
 * This module lets the same `admin_api_tokens` row be presented directly as a
 * bearer credential. No new secret type is introduced: tokens are still minted
 * by a super_admin through `POST /api/admin/api-tokens`, stored as a SHA-256
 * hash, scoped to one site or all sites, expiring, and revocable.
 *
 * Bearer requests carry no ambient credential, so they are not exposed to CSRF
 * (a browser never attaches an Authorization header cross-site) and are exempt
 * from the double-submit check in `lib/middleware/csrf.ts`.
 */

import { headers } from "next/headers";
import type { AdminPayload } from "@/lib/auth";
import {
  getAdminApiTokenByHash,
  isAdminApiTokenValid,
  touchAdminApiToken,
} from "@/lib/dal/admin-api-tokens";
import { getAdminUserById } from "@/lib/dal/admin-users";
import { hashSecretToken } from "@/lib/generate-token";
import { captureException } from "@/lib/sentry";

/** Header a bearer client uses to pick a site when its token is not site-bound. */
export const ADMIN_SITE_HEADER = "x-admin-site";

export interface BearerAdminAuth {
  session: AdminPayload;
  tokenId: string;
  /** DB id of the site the token is pinned to, or null for all-sites tokens. */
  tokenSiteId: string | null;
}

/**
 * Extract a bearer token from an Authorization header value.
 *
 * Returns null for any other scheme so a `Basic`/`Negotiate` header is never
 * hashed and looked up as a token.
 */
export function parseBearerToken(authorization: string | null | undefined): string | null {
  if (!authorization) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(authorization.trim());
  return match?.[1] ?? null;
}

/**
 * Resolve an admin session from the request's bearer token, or null when the
 * header is absent, malformed, or the token is unknown/revoked/expired or
 * belongs to a deactivated admin.
 */
export async function getBearerAdminAuth(): Promise<BearerAdminAuth | null> {
  const headerStore = await headers();
  const token = parseBearerToken(headerStore.get("authorization"));
  if (!token) return null;

  const tokenRow = await getAdminApiTokenByHash(await hashSecretToken(token));
  if (!(await isAdminApiTokenValid(tokenRow)) || !tokenRow) return null;

  const user = await getAdminUserById(tokenRow.created_by);
  if (!user || !user.is_active) return null;

  // Best-effort usage timestamp: a failure here must not deny a valid call.
  try {
    await touchAdminApiToken(tokenRow.id);
  } catch (err) {
    captureException(err, { context: "[admin-bearer-auth] failed to touch token" });
  }

  return {
    session: {
      userId: user.id,
      email: user.email,
      role: user.role,
      // Site-bound tokens keep the tenant pin that requireAdmin() enforces.
      ...(tokenRow.site_id ? { site_id: tokenRow.site_id } : {}),
    },
    tokenId: tokenRow.id,
    tokenSiteId: tokenRow.site_id,
  };
}

/**
 * Site slug a bearer client asked for via `x-admin-site`, validated against the
 * same character/length rules the active-site cookie goes through.
 */
export async function getRequestedAdminSiteSlug(): Promise<string | null> {
  const headerStore = await headers();
  const value = headerStore.get(ADMIN_SITE_HEADER);
  if (!value) return null;
  return /^[a-z0-9-]+$/.test(value) ? value : null;
}
