import { requireAdminSession } from "./components/admin-guard";
import Link from "next/link";

export default async function AdminDashboard() {
  const session = await requireAdminSession();

  const cards = [
    { title: "Categories", href: "/admin/categories", icon: "📁", description: "Manage site categories" },
    { title: "Products", href: "/admin/products", icon: "📦", description: "Manage affiliate products" },
    { title: "Content", href: "/admin/content", icon: "📝", description: "Manage articles and reviews" },
  ];

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-2 text-2xl font-bold text-gray-900">Dashboard</h1>
      <p className="mb-8 text-sm text-gray-500">
        Site: <span className="font-medium">{session.siteId}</span>
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md"
          >
            <span className="text-3xl">{card.icon}</span>
            <h2 className="mt-3 text-lg font-semibold text-gray-900">{card.title}</h2>
            <p className="mt-1 text-sm text-gray-500">{card.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
