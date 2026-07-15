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
import { hasScope, type AutomationScope } from "./scopes";
import type { AutomationErrorCode } from "./envelope";

export interface AutomationAuthContext {
  token: AutomationTokenRow;
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
  } = {},
): Promise<AutomationAuthResult> {
  const getTokenByHash = deps.getTokenByHash ?? getAutomationTokenByHash;
  const getAccountById = deps.getAccountById ?? getAutomationServiceAccountById;
  const touch = deps.touch ?? touchAutomationToken;

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

  if (!token) {
    return { ok: false, code: "AUTOMATION_TOKEN_INVALID", message: "Invalid automation token" };
  }
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

/** True when the authenticated account holds the required scope. */
export function contextHasScope(ctx: AutomationAuthContext, scope: AutomationScope): boolean {
  return hasScope(ctx.scopes, scope);
}
