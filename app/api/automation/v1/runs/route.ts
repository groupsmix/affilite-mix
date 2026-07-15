import type { NextRequest } from "next/server";
import { withAutomation } from "@/lib/automation/gateway";
import { automationSuccess, automationError } from "@/lib/automation/envelope";
import { parseJsonBody } from "@/lib/api-error";
import { createAutomationRun, type RunTrigger } from "@/lib/dal/automation-runs";

const TRIGGERS: RunTrigger[] = ["scheduled", "webhook", "owner", "recovery", "agent"];

// POST /api/automation/v1/runs
// Open a durable run. A run groups the actions an agent performs in one
// planning cycle; the site binding comes from the token, not the body.
export const POST = withAutomation(
  ["site:read"],
  async (request: NextRequest, { auth, requestId }) => {
    const parsed = await parseJsonBody(request);
    if (parsed instanceof Response) {
      return automationError("AUTOMATION_BAD_REQUEST", "Invalid JSON body", requestId);
    }
    const body = parsed as Record<string, unknown>;

    const triggerRaw = typeof body.trigger === "string" ? body.trigger : "agent";
    const trigger = (TRIGGERS as string[]).includes(triggerRaw)
      ? (triggerRaw as RunTrigger)
      : "agent";
    const goal = typeof body.goal === "string" ? body.goal.slice(0, 1_000) : null;

    const run = await createAutomationRun({
      service_account_id: auth.account.id,
      site_id: auth.siteId,
      trigger,
      goal,
    });

    return automationSuccess(
      {
        run: {
          id: run.id,
          status: run.status,
          trigger: run.trigger,
          goal: run.goal,
          started_at: run.started_at,
        },
      },
      requestId,
      { status: 201, meta: { run_id: run.id } },
    );
  },
);
