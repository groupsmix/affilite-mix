"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SiteSwitcher } from "./site-switcher";

const navItems = [
  { href: "/admin", label: "Dashboard", icon: "📊" },
  { href: "/admin/analytics", label: "Analytics", icon: "📈" },
  { href: "/admin/categories", label: "Categories", icon: "📁" },
  { href: "/admin/products", label: "Products", icon: "📦" },
  { href: "/admin/content", label: "Content", icon: "📝" },
  { href: "/admin/users", label: "Users", icon: "👤" },
];

function useActiveSiteName() {
  const [siteName, setSiteName] = useState<string | null>(null);

  useEffect(() => {
    async function loadSiteName() {
      try {
        const res = await fetch("/api/admin/sites");
        if (!res.ok) return;
        const data = await res.json();
        const cookie = document.cookie
          .split("; ")
          .find((c) => c.startsWith("nh_active_site="));
        const activeSiteId = cookie?.split("=")[1];
        if (activeSiteId && data.sites) {
          const site = data.sites.find(
            (s: { id: string; name: string }) => s.id === activeSiteId
          );
          if (site) setSiteName(site.name);
        }
      } catch {
        // ignore — fallback to "Admin Panel"
      }
    }
    loadSiteName();
  }, []);

  return siteName;
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const siteName = useActiveSiteName();

  return (
    <>
      <div className="flex h-14 items-center border-b border-gray-200 px-4">
        <Link
          href="/admin"
          className="text-lg font-bold text-gray-900"
          onClick={onNavigate}
        >
          {siteName ?? "Admin Panel"}
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
              onClick={onNavigate}
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
    </>
  );
}

export function AdminSidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  if (pathname === "/admin/login") return null;

  return (
    <>
      {/* Mobile header bar with hamburger */}
      <div className="fixed inset-x-0 top-0 z-40 flex h-14 items-center border-b border-gray-200 bg-white px-4 lg:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="rounded-md p-2 text-gray-600 hover:bg-gray-100 hover:text-gray-900"
          aria-label="Open admin menu"
        >
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <span className="ml-3 text-sm font-semibold text-gray-900">Admin</span>
      </div>

      {/* Spacer for mobile header */}
      <div className="h-14 shrink-0 lg:hidden" />

      {/* Mobile drawer overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/30 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile slide-out drawer */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-white shadow-xl transition-transform duration-200 lg:hidden ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-end border-b border-gray-200 px-4 py-2">
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="rounded-md p-2 text-gray-600 hover:bg-gray-100"
            aria-label="Close admin menu"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <SidebarContent onNavigate={() => setMobileOpen(false)} />
      </aside>

      {/* Desktop sidebar */}
      <aside className="hidden w-56 shrink-0 flex-col border-r border-gray-200 bg-white lg:flex">
        <SidebarContent />
      </aside>
    </>
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
