// Layout patterns adapted from https://github.com/Qualiora/shadboard (MIT).
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeft, PanelRight } from "lucide-react";

import { adminNavItems, type AdminNavItem } from "@/config/admin-nav";
import { ADMIN_PATH, ADMIN_SITES_PATH } from "@/lib/admin-paths";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export type AdminMonetizationType = "affiliate" | "ads" | "both" | null | undefined;

export function filterAdminNavItems(
  items: AdminNavItem[],
  monetizationType: AdminMonetizationType,
  isSuperAdmin = false,
): AdminNavItem[] {
  return items.reduce<AdminNavItem[]>((acc, item) => {
    if (item.requiresSuperAdmin && !isSuperAdmin) return acc;

    if (item.items) {
      const visibleChildren = filterAdminNavItems(item.items, monetizationType, isSuperAdmin);
      if (visibleChildren.length === 0) return acc;
      // Parent collapses to the first visible child route so collapsed icon
      // links and active-state checks work without a dedicated group route.
      return [...acc, { ...item, href: visibleChildren[0]!.href, items: visibleChildren }];
    }

    // Super admins manage the entire platform and always see every section,
    // regardless of the active tenant's monetization model. The monetization
    // filter below only declutters the nav for tenant-scoped (non-super) roles.
    if (!isSuperAdmin) {
      if (!monetizationType) return [...acc, item];
      if (item.href === `${ADMIN_PATH}/ads` && monetizationType === "affiliate") return acc;
      if (item.href === `${ADMIN_PATH}/affiliate-networks` && monetizationType === "ads")
        return acc;
    }

    return [...acc, item];
  }, []);
}

export function flattenAdminNavItems(items: AdminNavItem[]): AdminNavItem[] {
  return items.flatMap((item) => (item.items ? flattenAdminNavItems(item.items) : [item]));
}

export function findAdminNavItemByHref(
  items: AdminNavItem[],
  href: string,
): AdminNavItem | undefined {
  for (const item of items) {
    if (item.href === href) return item;
    if (item.items) {
      const child = findAdminNavItemByHref(item.items, href);
      if (child) return child;
    }
  }
  return undefined;
}

function isItemActive(item: AdminNavItem, pathname: string): boolean {
  const active =
    item.href === ADMIN_PATH ? pathname === ADMIN_PATH : pathname.startsWith(item.href);
  if (active) return true;
  if (item.items) return item.items.some((child) => isItemActive(child, pathname));
  return false;
}

/**
 * Navigation links — shared by the desktop rail and the mobile Sheet.
 */
export function AdminSidebarNav({
  monetizationType,
  isSuperAdmin = false,
  collapsed = false,
  onNavigate,
  hasActiveSite = true,
  className,
}: {
  monetizationType: AdminMonetizationType;
  isSuperAdmin?: boolean;
  collapsed?: boolean;
  onNavigate?: () => void;
  hasActiveSite?: boolean;
  className?: string;
}) {
  const pathname = usePathname();
  const items = filterAdminNavItems(adminNavItems, monetizationType, isSuperAdmin);

  const renderLink = (item: AdminNavItem, indent = false) => {
    const Icon = item.icon;
    const disabled = Boolean(item.requiresActiveSite && !hasActiveSite);
    const href = disabled ? `${ADMIN_SITES_PATH}?needsSite=1` : item.href;
    const active = !disabled && isItemActive(item, pathname);
    const linkClass = cn(
      "relative flex items-center rounded-md text-sm font-medium outline-none transition-colors",
      "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
      collapsed ? "h-10 w-10 justify-center" : indent ? "h-9 gap-3 ml-3 pl-6" : "h-9 gap-3 px-3",
      disabled
        ? "cursor-not-allowed text-muted-foreground/45 hover:bg-transparent"
        : active
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
    );

    const link = (
      <Link
        key={item.href}
        href={href}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        aria-disabled={disabled}
        data-active={active ? "true" : undefined}
        title={disabled ? "Select a site first" : item.label}
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
          <Icon className={cn("size-4 shrink-0", active && "text-foreground")} aria-hidden="true" />
        ) : null}
        {!collapsed && <span className="truncate">{item.label}</span>}
        {disabled && !collapsed ? (
          <span className="ml-auto text-[10px] font-normal text-muted-foreground/70">site</span>
        ) : null}
        {collapsed && <span className="sr-only">{item.label}</span>}
      </Link>
    );

    if (!collapsed) return link;
    return (
      <Tooltip key={item.href}>
        <TooltipTrigger asChild>{link}</TooltipTrigger>
        <TooltipContent side="right" sideOffset={6}>
          {disabled ? `${item.label}: select a site first` : item.label}
        </TooltipContent>
      </Tooltip>
    );
  };

  const renderGroup = (item: AdminNavItem) => {
    const Icon = item.icon;
    const disabled = Boolean(item.requiresActiveSite && !hasActiveSite);
    const active = isItemActive(item, pathname);

    return (
      <div key={item.href} className="flex flex-col gap-1">
        <div
          className={cn(
            "relative flex items-center rounded-md h-9 gap-3 px-3 text-sm font-medium outline-none transition-colors",
            disabled
              ? "text-muted-foreground/45"
              : active
                ? "bg-accent text-accent-foreground"
                : "text-foreground",
          )}
          aria-disabled={disabled}
        >
          {Icon ? (
            <Icon
              className={cn("size-4 shrink-0", active && "text-foreground")}
              aria-hidden="true"
            />
          ) : null}
          <span className="truncate">{item.label}</span>
        </div>
        <div className="flex flex-col gap-1">
          {item.items!.map((child) => renderLink(child, true))}
        </div>
      </div>
    );
  };

  return (
    <TooltipProvider delayDuration={300}>
      <nav aria-label="Admin navigation" className={cn("flex flex-col gap-1 px-2 py-3", className)}>
        {collapsed
          ? items.map((item) => renderLink(item))
          : items.map((item) => (item.items ? renderGroup(item) : renderLink(item)))}
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
  isSuperAdmin = false,
  hasActiveSite = true,
  className,
}: {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  monetizationType: AdminMonetizationType;
  isSuperAdmin?: boolean;
  hasActiveSite?: boolean;
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
            href={hasActiveSite ? ADMIN_PATH : `${ADMIN_SITES_PATH}?needsSite=1`}
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
        <AdminSidebarNav
          monetizationType={monetizationType}
          isSuperAdmin={isSuperAdmin}
          hasActiveSite={hasActiveSite}
          collapsed={collapsed}
        />
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
