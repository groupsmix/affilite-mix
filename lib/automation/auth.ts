/**
 * Machine authentication for the automation API (plan §5.3).
 *
 * The gateway authenticates a `Authorization: Bearer <token>` header ONLY —
 * no browser cookie, no CSRF, no active-site cookie. The site is bound to
 * the token's service account and is NEVER read from the request body or
 * query string, so a caller cannot widen access by supplying a different
 * `site_id`.
 */
import type { NextRequest } from "next/server";
import { hashSecretToken } from "@/lib/generate-token";
import {
  getAutomationTokenByHash,
  isAutomationTokenUsable,
  touchAutomationToken,
  type AutomationTokenRow,
} from "@/lib/dal/automation-tokens";
import {
  getAutomationServiceAccountById,
  isServiceAccountActive,
  type AutomationServiceAccountRow,
} from "@/lib/dal/automation-service-accounts";
import {
  getAdminApiTokenByHash,
  isAdminApiTokenValid,
  touchAdminApiToken,
  type AdminApiTokenRow,
} from "@/lib/dal/admin-api-tokens";
import type { AutomationErrorCode } from "./envelope";

export interface AutomationAuthContext {
  token?: AutomationTokenRow;
  account: AutomationServiceAccountRow;
  /** Server-derived site id (from the account, never request input). */
  siteId: string;
  scopes: string[];
}

export interface AutomationAuthFailure {
  ok: false;
  code: AutomationErrorCode;
  message: string;
}

export type AutomationAuthResult =
  | { ok: true; context: AutomationAuthContext }
  | AutomationAuthFailure;

/** Extract a bearer token from the Authorization header, or null. */
export function extractBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) return null;
  const token = match[1]!.trim();
  return token.length > 0 ? token : null;
}

/** Map a valid admin API token to a synthetic automation auth context.
 * Admin API tokens are site-bound or global; automation requires a site, so
 * tokens without a site_id are rejected. They carry no automation scopes, so
 * they can only access endpoints that do not require scopes (e.g. health).
 */
function adminApiTokenToAuthContext(adminToken: AdminApiTokenRow): AutomationAuthContext {
  const account: AutomationServiceAccountRow = {
    id: adminToken.id,
    site_id: adminToken.site_id!,
    name: adminToken.name,
    status: "active",
    scopes: [],
    allowed_ip_ranges: null,
    max_actions_per_run: 0,
    max_actions_per_day: 0,
    created_by: adminToken.created_by,
    created_at: adminToken.created_at,
    updated_at: adminToken.updated_at,
  };

  const token: AutomationTokenRow = {
    id: adminToken.id,
    service_account_id: account.id,
    token_hash: adminToken.token_hash,
    name: adminToken.name,
    expires_at: adminToken.expires_at,
    last_used_at: adminToken.last_used_at,
    revoked_at: null,
    created_by: adminToken.created_by,
    created_at: adminToken.created_at,
  };

  return {
    token,
    account,
    siteId: account.site_id,
    scopes: account.scopes,
  };
}

/**
 * Authenticate the request. Returns the resolved account/site context or a
 * typed failure. On success, updates the token's `last_used_at` (best-effort).
 *
 * `touch` is injected for tests; production uses the DAL default.
 */
export async function authenticateAutomationRequest(
  request: NextRequest,
  deps: {
    getTokenByHash?: typeof getAutomationTokenByHash;
    getAccountById?: typeof getAutomationServiceAccountById;
    touch?: typeof touchAutomationToken;
    getAdminApiTokenByHash?: typeof getAdminApiTokenByHash;
    touchAdminApiToken?: typeof touchAdminApiToken;
  } = {},
): Promise<AutomationAuthResult> {
  const getTokenByHash = deps.getTokenByHash ?? getAutomationTokenByHash;
  const getAccountById = deps.getAccountById ?? getAutomationServiceAccountById;
  const touch = deps.touch ?? touchAutomationToken;
  const adminTokenByHash = deps.getAdminApiTokenByHash ?? getAdminApiTokenByHash;
  const touchAdmin = deps.touchAdminApiToken ?? touchAdminApiToken;

  const raw = extractBearerToken(request);
  if (!raw) {
    return {
      ok: false,
      code: "AUTOMATION_UNAUTHENTICATED",
      message: "Missing Authorization: Bearer token",
    };
  }

  const tokenHash = await hashSecretToken(raw);
  const token = await getTokenByHash(tokenHash);

  if (token) {
    if (token.revoked_at) {
      return { ok: false, code: "AUTOMATION_TOKEN_REVOKED", message: "Automation token revoked" };
    }
    if (!isAutomationTokenUsable(token)) {
      return { ok: false, code: "AUTOMATION_TOKEN_EXPIRED", message: "Automation token expired" };
    }

    const account = await getAccountById(token.service_account_id);
    if (!isServiceAccountActive(account)) {
      // Do not distinguish suspended/revoked/missing to the caller.
      return {
        ok: false,
        code: "AUTOMATION_TOKEN_INVALID",
        message: "Service account is not active",
      };
    }

    // Best-effort last-used bookkeeping; never fail auth on a touch error.
    try {
      await touch(token.id);
    } catch {
      // fail-open: telemetry only [criticality:defence-in-depth]
    }

    return {
      ok: true,
      context: {
        token,
        account,
        siteId: account.site_id,
        scopes: account.scopes,
      },
    };
  }

  // Compatibility bridge: aadm_ tokens minted by /api/admin/api-tokens are
  // stored in admin_api_tokens (for token-login / admin bearer use). The
  // automation API uses automation_tokens. Allow valid site-bound admin API
  // tokens to authenticate for scope-less automation endpoints such as health.
  // For machine actions, create an automation service account and use an
  // `atk_` token from /api/admin/automation/service-accounts.
  const adminToken = await adminTokenByHash(tokenHash);
  if (!adminToken || !(await isAdminApiTokenValid(adminToken))) {
    return { ok: false, code: "AUTOMATION_TOKEN_INVALID", message: "Invalid automation token" };
  }
  if (!adminToken.site_id) {
    return {
      ok: false,
      code: "AUTOMATION_TOKEN_INVALID",
      message: "Admin API token must be site-bound to access automation",
    };
  }

  try {
    await touchAdmin(adminToken.id);
  } catch {
    // fail-open: telemetry only [criticality:defence-in-depth]
  }

  return { ok: true, context: adminApiTokenToAuthContext(adminToken) };
}
