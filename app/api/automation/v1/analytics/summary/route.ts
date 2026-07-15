import { withAutomation } from "@/lib/automation/gateway";
import { automationSuccess } from "@/lib/automation/envelope";
import { getAutomationDbClient } from "@/lib/automation/db";
import { getClickCount } from "@/lib/dal/affiliate-clicks";
import { countContent } from "@/lib/dal/content";
import { countProducts } from "@/lib/dal/products";

// GET /api/automation/v1/analytics/summary
// A reduced, read-only analytics contract for the agent: click volume over
// 7/30-day windows and published-content / active-product counts. The agent
// prioritises these deterministic metrics; it never invents them.
export const GET = withAutomation(["analytics:read"], async (_request, { auth, requestId }) => {
  const { siteId } = auth;

  const now = Date.now();
  const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
  const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [clicks7d, clicks30d, publishedContent, activeProducts] = await Promise.all([
    getClickCount(siteId, sevenDaysAgo, undefined, getAutomationDbClient),
    getClickCount(siteId, thirtyDaysAgo, undefined, getAutomationDbClient),
    countContent({ siteId, statuses: ["published"] }, getAutomationDbClient),
    countProducts({ siteId, statuses: ["active"] }, getAutomationDbClient),
  ]);

  return automationSuccess(
    {
      clicks: { last_7_days: clicks7d, last_30_days: clicks30d },
      content: { published: publishedContent },
      products: { active: activeProducts },
      generated_at: new Date().toISOString(),
    },
    requestId,
  );
});
