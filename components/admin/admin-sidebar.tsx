// Layout patterns adapted from https://github.com/Qualiora/shadboard (MIT).
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeft, PanelRight } from "lucide-react";

import { adminNavItems, type AdminNavItem } from "@/config/admin-nav";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export type AdminMonetizationType = "affiliate" | "ads" | "both" | null | undefined;

export function filterAdminNavItems(
  items: AdminNavItem[],
  monetizationType: AdminMonetizationType,
): AdminNavItem[] {
  return items.filter((item) => {
    if (!monetizationType) return true;
    if (item.href === "/admin/ads" && monetizationType === "affiliate") return false;
    if (item.href === "/admin/affiliate-networks" && monetizationType === "ads") return false;
    return true;
  });
}

function isItemActive(href: string, pathname: string) {
  return href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
}

/**
 * Navigation links — shared by the desktop rail and the mobile Sheet.
 */
export function AdminSidebarNav({
  monetizationType,
  collapsed = false,
  onNavigate,
  className,
}: {
  monetizationType: AdminMonetizationType;
  collapsed?: boolean;
  onNavigate?: () => void;
  className?: string;
}) {
  const pathname = usePathname();
  const items = filterAdminNavItems(adminNavItems, monetizationType);

  return (
    <TooltipProvider delayDuration={300}>
      <nav aria-label="Admin navigation" className={cn("flex flex-col gap-1 px-2 py-3", className)}>
        {items.map((item) => {
          const Icon = item.icon;
          const active = isItemActive(item.href, pathname);
          const linkClass = cn(
            "relative flex items-center rounded-md text-sm font-medium outline-none transition-colors",
            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
            collapsed ? "h-10 w-10 justify-center" : "h-9 gap-3 px-3",
            active
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
          );

          const link = (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              data-active={active ? "true" : undefined}
              className={linkClass}
            >
              {/* Active indicator independent of colour: solid start-edge bar */}
              <span
                aria-hidden="true"
                className={cn(
                  "pointer-events-none absolute top-1 bottom-1 start-0 w-[3px] rounded-full bg-foreground transition-opacity",
                  active ? "opacity-100" : "opacity-0",
                )}
              />
              {Icon ? (
                <Icon
                  className={cn("size-4 shrink-0", active && "text-foreground")}
                  aria-hidden="true"
                />
              ) : null}
              {!collapsed && <span className="truncate">{item.label}</span>}
              {collapsed && <span className="sr-only">{item.label}</span>}
            </Link>
          );

          if (!collapsed) return link;
          return (
            <Tooltip key={item.href}>
              <TooltipTrigger asChild>{link}</TooltipTrigger>
              <TooltipContent side="right" sideOffset={6}>
                {item.label}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </nav>
    </TooltipProvider>
  );
}

/**
 * Desktop sidebar — collapsible rail (full 14rem → 3.5rem icon-only).
 * State is owned by the parent shell so the topbar's collapse control and
 * the sidebar's own toggle stay in sync.
 */
export function AdminSidebar({
  collapsed,
  onToggleCollapsed,
  monetizationType,
  className,
}: {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  monetizationType: AdminMonetizationType;
  className?: string;
}) {
  return (
    <aside
      data-collapsed={collapsed ? "true" : "false"}
      className={cn(
        "hidden shrink-0 flex-col border-e border-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 lg:flex",
        collapsed ? "w-14" : "w-56",
        className,
      )}
    >
      <div
        className={cn(
          "flex h-14 items-center border-b border-border",
          collapsed ? "justify-center px-0" : "justify-between px-3",
        )}
      >
        {!collapsed && (
          <Link
            href="/admin"
            className="truncate text-sm font-semibold tracking-tight text-foreground"
          >
            Admin
          </Link>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onToggleCollapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-pressed={collapsed}
          className="size-8"
        >
          {collapsed ? <PanelRight className="size-4" /> : <PanelLeft className="size-4" />}
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <AdminSidebarNav monetizationType={monetizationType} collapsed={collapsed} />
      </ScrollArea>

      <Separator />
      <div
        className={cn(
          "flex items-center px-3 py-2 text-xs text-muted-foreground",
          collapsed ? "justify-center px-0" : "justify-between",
        )}
      >
        {!collapsed && <span className="truncate">Affilite-Mix</span>}
      </div>
    </aside>
  );
}
