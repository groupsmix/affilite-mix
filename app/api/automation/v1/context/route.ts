import { withAutomation } from "@/lib/automation/gateway";
import { automationSuccess, automationError } from "@/lib/automation/envelope";
import { getSiteRowById } from "@/lib/dal/sites";
import { getAutomationDbClient } from "@/lib/automation/db";
import { countContent } from "@/lib/dal/content";
import { countProducts } from "@/lib/dal/products";
import { listPoliciesForSite } from "@/lib/dal/automation-policies";
import { countActionsSince } from "@/lib/dal/automation-runs";

// GET /api/automation/v1/context
// The agent's situational-awareness endpoint: site identity, granted scopes,
// remaining daily action budget, content/product counts, and any per-site
// policy overrides. All figures are computed by the application, not the AI.
export const GET = withAutomation(["site:read"], async (_request, { auth, requestId }) => {
  const { siteId, account } = auth;

  const site = await getSiteRowById(siteId, getAutomationDbClient);
  if (!site) {
    return automationError("AUTOMATION_SITE_NOT_FOUND", "Bound site not found", requestId);
  }

  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);

  const [contentCount, draftCount, productCount, policies, actionsToday] = await Promise.all([
    countContent({ siteId }, getAutomationDbClient),
    countContent({ siteId, statuses: ["draft"] }, getAutomationDbClient),
    countProducts({ siteId }, getAutomationDbClient),
    listPoliciesForSite(siteId),
    countActionsSince(account.id, startOfDay.toISOString()),
  ]);

  return automationSuccess(
    {
      site: { id: site.id, slug: site.slug, name: site.name },
      scopes: account.scopes,
      limits: {
        max_actions_per_run: account.max_actions_per_run,
        max_actions_per_day: account.max_actions_per_day,
        actions_today: actionsToday,
        actions_remaining_today: Math.max(0, account.max_actions_per_day - actionsToday),
      },
      counts: {
        content: contentCount,
        drafts: draftCount,
        products: productCount,
      },
      policies: policies.map((p) => ({
        action_type: p.action_type,
        mode: p.mode,
        is_active: p.is_active,
      })),
    },
    requestId,
  );
});
