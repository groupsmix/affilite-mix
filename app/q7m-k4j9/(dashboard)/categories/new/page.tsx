import { PageHeader } from "@/components/admin/page-header";

import { requireAdminSession } from "../../components/admin-guard";
import { CategoryForm } from "../category-form";

export default async function NewCategoryPage() {
  await requireAdminSession();

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="New category"
        description="Create a new category for organising products and content."
      />
      <CategoryForm />
    </div>
  );
}
