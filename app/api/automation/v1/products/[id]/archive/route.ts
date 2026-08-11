import { NextRequest } from "next/server";
import { withAutomation } from "@/lib/automation/gateway";
import { automationError, automationSuccess } from "@/lib/automation/envelope";
import { parseJsonBody } from "@/lib/api-error";
import { parseProductLifecycleInput } from "@/lib/automation/schemas";
import { runGuardedMutation } from "@/lib/automation/guarded-mutation";
import { requiredScopeFor } from "@/lib/automation/policy";
import { getExecutor } from "@/lib/automation/executors/registry";
import { assertProductTarget, mapProductExecutorError } from "@/lib/automation/executors/products";

const ACTION_TYPE = "products.archive" as const;
const SCOPE = requiredScopeFor(ACTION_TYPE)!;

export const POST = withAutomation(
  [SCOPE],
  async (request: NextRequest, { auth, requestId, params }) => {
    const rawId = (await params)?.id;
    const productId = Array.isArray(rawId) ? rawId[0] : rawId;
    if (!productId)
      return automationError("AUTOMATION_BAD_REQUEST", "Invalid product id", requestId);
    const body = await parseJsonBody(request);
    if (body instanceof Response)
      return automationError("AUTOMATION_BAD_REQUEST", "Invalid JSON body", requestId);
    const parsed = parseProductLifecycleInput({
      ...(body as Record<string, unknown>),
      product_id: productId,
    });
    if (!parsed.ok)
      return automationError(
        "AUTOMATION_VALIDATION_ERROR",
        "Product lifecycle request failed validation",
        requestId,
        { details: { errors: parsed.errors.join("; ") } },
      );
    const executor = getExecutor(ACTION_TYPE)!;
    return runGuardedMutation({
      request,
      requestId,
      auth,
      actionType: ACTION_TYPE,
      targetType: "product",
      targetId: productId,
      payload: parsed.value as unknown as Record<string, unknown>,
      validateTarget: () => assertProductTarget(auth.siteId, productId),
      replay: (prior) =>
        automationSuccess(prior.result, requestId, { meta: { action_id: prior.id } }),
      execute: (action) => executor.execute(action, { siteId: auth.siteId }),
      success: (execution, action) =>
        automationSuccess(execution.result, requestId, { meta: { action_id: action.id } }),
      mapError: mapProductExecutorError,
    });
  },
);
