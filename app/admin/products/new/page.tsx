import { requireAdminSession } from "../../components/admin-guard";
import { listCategories } from "@/lib/dal/categories";
import { ProductForm } from "../product-form";

export default async function NewProductPage() {
  const session = await requireAdminSession();
  const categories = await listCategories(session.siteId);

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">New Product</h1>
      <ProductForm categories={categories} />
    </div>
  );
}
