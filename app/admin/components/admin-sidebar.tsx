"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SiteSwitcher } from "./site-switcher";

const navItems = [
  { href: "/admin", label: "Dashboard", icon: "📊" },
  { href: "/admin/categories", label: "Categories", icon: "📁" },
  { href: "/admin/products", label: "Products", icon: "📦" },
  { href: "/admin/content", label: "Content", icon: "📝" },
];

export function AdminSidebar() {
  const pathname = usePathname();

  if (pathname === "/admin/login") return null;

  return (
    <aside className="hidden w-56 shrink-0 border-r border-gray-200 bg-white lg:block">
      <div className="flex h-14 items-center border-b border-gray-200 px-4">
        <Link href="/admin" className="text-lg font-bold text-gray-900">
          NicheHub
        </Link>
      </div>
      <div className="border-b border-gray-200 p-3">
        <SiteSwitcher />
      </div>
      <nav className="mt-4 flex flex-col gap-1 px-2">
        {navItems.map((item) => {
          const isActive =
            item.href === "/admin"
              ? pathname === "/admin"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-gray-100 text-gray-900"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              }`}
            >
              <span>{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto border-t border-gray-200 p-4">
        <LogoutButton />
      </div>
    </aside>
  );
}

function LogoutButton() {
  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/admin/login";
  }

  return (
    <button
      onClick={handleLogout}
      className="w-full rounded-md px-3 py-2 text-left text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900"
    >
      Sign out
    </button>
  );
}
