import { withAutomation } from "@/lib/automation/gateway";
import { automationSuccess } from "@/lib/automation/envelope";

// GET /api/automation/v1/health
// Minimal authenticated liveness probe. Confirms the token is valid and the
// account is active; returns the resolved (server-derived) site binding so an
// agent can verify which site it is operating before doing any work.
export const GET = withAutomation([], (_request, { auth, requestId }) => {
  return automationSuccess(
    {
      status: "ok",
      site_id: auth.siteId,
      service_account_id: auth.account.id,
      account_status: auth.account.status,
      time: new Date().toISOString(),
    },
    requestId,
  );
});
