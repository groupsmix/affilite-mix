import { redirect } from "next/navigation";
import { requireAdminSession } from "../../components/admin-guard";
import { listCategories } from "@/lib/dal/categories";
import { resolveDbSiteId } from "@/lib/dal/site-resolver";
import { getTenantClientForSite } from "@/lib/supabase-server";
import { ProductForm } from "../product-form";

export default async function NewProductPage() {
  const session = await requireAdminSession();
  if (!session.activeSiteSlug) redirect("/q7m-k4j9/sites?needsSite=1");

  // resolveDbSiteId throws when the slug has no matching DB row.
  // Catch it so a stale/unprovisioned active-site cookie produces a
  // graceful redirect instead of an unhandled Server Component error.
  const dbSiteId = await resolveDbSiteId(session.activeSiteSlug).catch(() => null);
  if (!dbSiteId) redirect("/q7m-k4j9/sites?needsSite=1");

  const categories = await listCategories(dbSiteId, undefined, () =>
    getTenantClientForSite(dbSiteId, session.userId),
  );

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-6 text-2xl font-bold text-gray-900 dark:text-gray-100">New Product</h1>
      <ProductForm categories={categories} />
    </div>
  );
}
