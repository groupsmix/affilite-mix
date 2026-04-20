// Layout patterns adapted from https://github.com/Qualiora/shadboard (MIT).
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import { ChevronRight, LogOut, Menu, User } from "lucide-react";

import { adminNavItems } from "@/config/admin-nav";
import { fetchWithCsrf } from "@/lib/fetch-csrf";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SiteSwitcher } from "@/app/admin/(dashboard)/components/site-switcher";

interface Crumb {
  label: string;
  href?: string;
}

function humanize(segment: string): string {
  return segment
    .split("-")
    .map((part) => (part.length === 0 ? part : part[0].toUpperCase() + part.slice(1)))
    .join(" ");
}

/**
 * Derive breadcrumbs from the current pathname, using admin-nav labels where
 * they match so labels stay consistent with the sidebar.
 */
function buildCrumbs(pathname: string): Crumb[] {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 0 || parts[0] !== "admin") return [];

  const crumbs: Crumb[] = [{ label: "Admin", href: "/admin" }];
  let acc = "/admin";
  for (let i = 1; i < parts.length; i++) {
    acc += `/${parts[i]}`;
    const match = adminNavItems.find((item) => item.href === acc);
    const label = match?.label ?? humanize(parts[i]);
    crumbs.push({ label, href: i === parts.length - 1 ? undefined : acc });
  }
  return crumbs;
}

function Breadcrumbs({ pathname }: { pathname: string }) {
  const crumbs = useMemo(() => buildCrumbs(pathname), [pathname]);
  if (crumbs.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className="hidden min-w-0 md:block">
      <ol className="flex min-w-0 items-center gap-1 text-sm text-muted-foreground">
        {crumbs.map((crumb, idx) => {
          const isLast = idx === crumbs.length - 1;
          return (
            <li key={`${crumb.label}-${idx}`} className="flex min-w-0 items-center gap-1">
              {idx > 0 && (
                <ChevronRight
                  aria-hidden="true"
                  className="size-3.5 shrink-0 text-muted-foreground/60 rtl:rotate-180"
                />
              )}
              {crumb.href && !isLast ? (
                <Link
                  href={crumb.href}
                  className="truncate hover:text-foreground"
                  title={crumb.label}
                >
                  {crumb.label}
                </Link>
              ) : (
                <span
                  aria-current={isLast ? "page" : undefined}
                  className={cn("truncate", isLast && "font-medium text-foreground")}
                  title={crumb.label}
                >
                  {crumb.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function TenantBadge({ siteName }: { siteName: string | null | undefined }) {
  if (!siteName) {
    return (
      <span className="hidden items-center gap-2 rounded-md border border-yellow-300/80 bg-yellow-50 px-2.5 py-1 text-xs font-medium text-yellow-800 sm:inline-flex">
        <span aria-hidden="true" className="inline-flex size-1.5 rounded-full bg-yellow-500" />
        No site selected
      </span>
    );
  }
  return (
    <span
      className="hidden items-center gap-2 rounded-md border border-border bg-muted/40 px-2.5 py-1 text-xs font-medium text-foreground sm:inline-flex"
      title={`Active site: ${siteName}`}
    >
      <span
        aria-hidden="true"
        className="inline-flex size-2 rounded-full"
        style={{ backgroundColor: "var(--color-primary, currentColor)" }}
      />
      <span className="max-w-[14ch] truncate">{siteName}</span>
    </span>
  );
}

async function handleLogout() {
  try {
    const res = await fetchWithCsrf("/api/auth/logout", { method: "POST" });
    if (!res.ok) throw new Error("Logout failed");
  } catch {
    // Fall through to client-side redirect; the login page will re-check session.
  }
  window.location.href = "/admin/login";
}

function UserMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-9" aria-label="Open user menu">
          <User className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>Account</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled className="cursor-not-allowed opacity-60">
          <User className="size-4" />
          Profile
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void handleLogout()} variant="destructive">
          <LogOut className="size-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AdminTopbar({
  onOpenMobileNav,
  siteName,
}: {
  onOpenMobileNav: () => void;
  siteName: string | null | undefined;
}) {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-30 flex h-14 w-full items-center gap-3 border-b border-border bg-background/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:px-4">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-9 lg:hidden"
        aria-label="Open admin menu"
        onClick={onOpenMobileNav}
      >
        <Menu className="size-5" />
      </Button>

      <div className="min-w-0 flex-1">
        <Breadcrumbs pathname={pathname} />
      </div>

      <div className="flex items-center gap-2">
        <TenantBadge siteName={siteName} />
        <div className="hidden w-56 md:block">
          <SiteSwitcher />
        </div>
        <UserMenu />
      </div>
    </header>
  );
}
