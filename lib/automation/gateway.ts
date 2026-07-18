/**
 * Route wrapper for the automation API. Handles the cross-cutting concerns
 * every `/api/automation/v1/*` handler shares:
 *
 *   - bearer authentication + site binding from the token
 *   - required-scope enforcement
 *   - stable request id / envelope
 *   - uniform 500 handling
 *
 * A handler receives the resolved `AutomationAuthContext`, a `requestId`, and
 * any dynamic route `params` and returns a `NextResponse`.
 */
import { NextResponse, type NextRequest } from "next/server";
import { authenticateAutomationRequest, type AutomationAuthContext } from "./auth";
import { hasScope, type AutomationScope } from "./scopes";
import { automationError, requestIdFrom } from "./envelope";
import { captureException } from "@/lib/sentry";

export interface AutomationHandlerContext {
  auth: AutomationAuthContext;
  requestId: string;
  params?: Promise<Record<string, string | string[] | undefined>>;
}

export type AutomationHandler = (
  request: NextRequest,
  ctx: AutomationHandlerContext,
) => Promise<NextResponse> | NextResponse;

type AutomationRouteContext = {
  params: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * Wrap an automation route handler. `requiredScopes` are ALL required (the
 * account must hold every listed scope).
 */
export function withAutomation(
  requiredScopes: readonly AutomationScope[],
  handler: AutomationHandler,
) {
  return async (request: NextRequest, context: AutomationRouteContext): Promise<NextResponse> => {
    const requestId = requestIdFrom(request);

    const auth = await authenticateAutomationRequest(request);
    if (!auth.ok) {
      return automationError(auth.code, auth.message, requestId);
    }

    for (const scope of requiredScopes) {
      if (!hasScope(auth.context.scopes, scope)) {
        return automationError(
          "AUTOMATION_SCOPE_MISSING",
          `Missing required scope: ${scope}`,
          requestId,
          { details: { required_scope: scope } },
        );
      }
    }

    try {
      return await handler(request, { auth: auth.context, requestId, params: context.params });
    } catch (err) {
      captureException(err, { context: "automation.gateway" });
      return automationError(
        "AUTOMATION_INTERNAL_ERROR",
        "An unexpected error occurred while processing the automation request",
        requestId,
      );
    }
  };
}
