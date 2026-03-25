import { requireAdminSession } from "../../components/admin-guard";
import { getProductById } from "@/lib/dal/products";
import { listCategories } from "@/lib/dal/categories";
import { notFound } from "next/navigation";
import { ProductForm } from "../product-form";

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireAdminSession();
  const { id } = await params;
  const [product, categories] = await Promise.all([
    getProductById(session.siteId, id),
    listCategories(session.siteId),
  ]);

  if (!product) notFound();

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Edit Product</h1>
      <ProductForm product={product} categories={categories} />
    </div>
  );
}
