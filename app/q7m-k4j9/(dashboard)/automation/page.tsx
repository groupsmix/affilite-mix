import { requireAdminSessionWithSite } from "../components/admin-guard";
import { PageHeader } from "@/components/admin/page-header";
import { getTenantClientForSite } from "@/lib/supabase-server";
import { listCategories } from "@/lib/dal/categories";
import { getPolicyForAction } from "@/lib/dal/automation-policies";
import { resolveDbSiteId } from "@/lib/dal/site-resolver";
import { AutomationScheduleForm } from "./automation-schedule-form";

const ACTION_TYPE = "content.draft.create";

export const metadata = { title: "Automation" };

export default async function AutomationPage() {
  const session = await requireAdminSessionWithSite();
  const dbSiteId = await resolveDbSiteId(session.activeSiteSlug);

  const getClient = () => getTenantClientForSite(dbSiteId, session.userId);
  const [categories, policy] = await Promise.all([
    listCategories(dbSiteId, {}, getClient),
    getPolicyForAction(dbSiteId, ACTION_TYPE),
  ]);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Automation"
        description="Configure how many AI-generated articles the cron should produce for this site and whether drafts are auto-published after moderation."
      />
      <AutomationScheduleForm categories={categories} existingPolicy={policy} />
    </div>
  );
}
