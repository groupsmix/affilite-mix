import { requireAdminSession } from "../../components/admin-guard";
import { CategoryForm } from "../category-form";

export default async function NewCategoryPage() {
  await requireAdminSession();

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">New Category</h1>
      <CategoryForm />
    </div>
  );
}
