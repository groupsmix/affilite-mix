// Layout patterns adapted from https://github.com/Qualiora/shadboard (MIT).
"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

import { AdminSidebar, AdminSidebarNav, type AdminMonetizationType } from "./admin-sidebar";
import { AdminTopbar } from "./admin-topbar";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";

const COLLAPSED_KEY = "admin.sidebar.collapsed";

function readStoredCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

function writeStoredCollapsed(value: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(COLLAPSED_KEY, value ? "1" : "0");
  } catch {
    // Ignore — storage may be disabled (private mode, quota, etc.).
  }
}

export function AdminShell({
  siteName,
  monetizationType,
  isSuperAdmin,
  hasActiveSite,
  children,
}: {
  siteName: string | null | undefined;
  monetizationType: AdminMonetizationType;
  isSuperAdmin: boolean;
  hasActiveSite: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState<boolean>(false);
  const [mobileOpen, setMobileOpen] = useState<boolean>(false);

  // Hydrate the persisted collapsed state once on mount.
  useEffect(() => {
    setCollapsed(readStoredCollapsed());
  }, []);

  // Close the mobile Sheet when the route changes.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const handleToggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      writeStoredCollapsed(next);
      return next;
    });
  }, []);

  return (
    <div className="flex min-h-screen w-full bg-background text-foreground">
      <AdminSidebar
        collapsed={collapsed}
        onToggleCollapsed={handleToggleCollapsed}
        monetizationType={monetizationType}
      />

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-72 p-0">
          <SheetHeader className="border-b border-border">
            <SheetTitle>Admin navigation</SheetTitle>
            <SheetDescription className="sr-only">Primary admin navigation links.</SheetDescription>
          </SheetHeader>
          <AdminSidebarNav
            monetizationType={monetizationType}
            onNavigate={() => setMobileOpen(false)}
          />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <AdminTopbar
          onOpenMobileNav={() => setMobileOpen(true)}
          siteName={siteName}
          isSuperAdmin={isSuperAdmin}
        />
        {hasActiveSite && (
          <div
            aria-hidden="true"
            data-testid="admin-tenant-accent-stripe"
            className="h-0.5 w-full"
            style={{ backgroundColor: "var(--color-primary, transparent)" }}
          />
        )}
        <main id="admin-main" className="flex-1 p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
