import { getAdminSession } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function AdminDashboard() {
  const session = await getAdminSession();
  if (!session) {
    redirect("/admin/login");
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-16">
      <h1 className="mb-4 text-3xl font-bold text-gray-900">
        Admin Dashboard
      </h1>
      <p className="text-gray-600">
        Site: <span className="font-medium">{session.siteId}</span>
      </p>
      <p className="mt-8 text-sm text-gray-400">
        Phase B will add category, product, and content management here.
      </p>
    </div>
  );
}
