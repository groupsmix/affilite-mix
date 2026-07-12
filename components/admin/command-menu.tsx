// Command menu (Cmd+K) adapted from https://github.com/Qualiora/shadboard (MIT).
"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FilePlus, PackagePlus, SearchIcon, Sparkles, SwitchCamera } from "lucide-react";

import { adminNavItems } from "@/config/admin-nav";
import {
  filterAdminNavItems,
  flattenAdminNavItems,
  type AdminMonetizationType,
} from "./admin-sidebar";
import { Button } from "@/components/ui/button";
import { fetchWithCsrf } from "@/lib/fetch-csrf";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";

interface SiteOption {
  id: string;
  name: string;
  slug: string;
}

export function CommandMenu({
  monetizationType,
  isSuperAdmin = false,
  hasActiveSite = true,
}: {
  monetizationType?: AdminMonetizationType;
  isSuperAdmin?: boolean;
  hasActiveSite?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [sitesLoading, setSitesLoading] = useState(false);
  const [activeSiteId, setActiveSiteId] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const key = e.key.toLowerCase();
      if ((key === "k" && (e.metaKey || e.ctrlKey)) || key === "/") {
        if (
          (e.target instanceof HTMLElement && e.target.isContentEditable) ||
          e.target instanceof HTMLInputElement ||
          e.target instanceof HTMLTextAreaElement ||
          e.target instanceof HTMLSelectElement
        ) {
          return;
        }
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const runCommand = useCallback((command: () => void) => {
    setOpen(false);
    command();
  }, []);

  const handleSwitchSite = useCallback(
    async (siteId: string) => {
      if (siteId === activeSiteId) {
        setOpen(false);
        return;
      }
      const res = await fetchWithCsrf("/api/admin/sites/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId }),
      });
      if (res.ok) {
        setOpen(false);
        router.refresh();
      }
    },
    [activeSiteId, router],
  );

  useEffect(() => {
    if (!open || sitesLoading || sites.length > 0) return;
    let cancelled = false;
    setSitesLoading(true);
    void (async () => {
      try {
        const [sitesRes, activeRes] = await Promise.all([
          fetch("/api/admin/sites"),
          fetch("/api/admin/sites/active"),
        ]);
        if (cancelled) return;
        const sitesData = (await sitesRes.json()) as { sites?: unknown[] };
        const activeData = (await activeRes.json()) as { activeSiteId?: string | null };
        if (Array.isArray(sitesData.sites)) {
          setSites(
            sitesData.sites
              .filter(
                (s): s is SiteOption =>
                  typeof s === "object" &&
                  s !== null &&
                  typeof (s as { id: unknown }).id === "string" &&
                  typeof (s as { name: unknown }).name === "string" &&
                  typeof (s as { slug: unknown }).slug === "string",
              )
              .map((s) => ({ id: s.id, name: s.name, slug: s.slug })),
          );
        }
        setActiveSiteId(activeData.activeSiteId ?? null);
      } catch {
        // fail-open: leave site list empty
      } finally {
        if (!cancelled) setSitesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, sites, sitesLoading]);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="relative h-8 w-full justify-start rounded-md bg-muted/50 text-sm text-muted-foreground sm:w-40 lg:w-56"
        onClick={() => setOpen(true)}
      >
        <SearchIcon className="mr-2 size-4" />
        <span className="hidden lg:inline-flex">Search...</span>
        <span className="inline-flex lg:hidden">Search...</span>
        <kbd className="pointer-events-none absolute right-1.5 top-1/2 hidden h-5 -translate-y-1/2 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 sm:flex">
          <span className="text-xs">⌘</span>/<span>Ctrl</span>K
        </kbd>
      </Button>

      <CommandDialog open={open} onOpenChange={setOpen} title="Command Menu">
        <CommandInput placeholder="Search pages and actions..." />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>

          <CommandGroup heading="Actions">
            <CommandItem
              value="New product"
              disabled={!hasActiveSite}
              onSelect={() => {
                if (!hasActiveSite) return;
                runCommand(() => router.push("/q7m-k4j9/products/new"));
              }}
            >
              <PackagePlus className="mr-2 size-4" />
              <span>New product</span>
              {!hasActiveSite && (
                <span className="ml-auto text-xs text-muted-foreground">Select a site first</span>
              )}
            </CommandItem>
            <CommandItem
              value="New content"
              disabled={!hasActiveSite}
              onSelect={() => {
                if (!hasActiveSite) return;
                runCommand(() => router.push("/q7m-k4j9/content/new"));
              }}
            >
              <FilePlus className="mr-2 size-4" />
              <span>New content</span>
              {!hasActiveSite && (
                <span className="ml-auto text-xs text-muted-foreground">Select a site first</span>
              )}
            </CommandItem>
            <CommandItem
              value="Switch site"
              onSelect={() => {
                runCommand(() => router.push("/q7m-k4j9/sites"));
              }}
            >
              <SwitchCamera className="mr-2 size-4" />
              <span>Switch site</span>
            </CommandItem>
            <CommandItem
              value="AI assistant"
              disabled={!hasActiveSite}
              onSelect={() => {
                if (!hasActiveSite) return;
                runCommand(() => router.push("/q7m-k4j9/content/new"));
              }}
            >
              <Sparkles className="mr-2 size-4" />
              <span>AI assistant</span>
              {!hasActiveSite && (
                <span className="ml-auto text-xs text-muted-foreground">Select a site first</span>
              )}
            </CommandItem>
          </CommandGroup>

          <CommandSeparator />

          {sites.length > 0 && (
            <CommandGroup heading="Sites">
              {sites.map((site) => (
                <CommandItem
                  key={site.id}
                  value={`Switch site ${site.name} ${site.slug}`}
                  onSelect={() => {
                    void handleSwitchSite(site.id);
                  }}
                >
                  <span>{site.name}</span>
                  {site.id === activeSiteId && (
                    <span className="ml-auto text-xs text-muted-foreground">Active</span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {sitesLoading && <CommandItem disabled>Loading sites...</CommandItem>}

          <CommandSeparator />

          <CommandGroup heading="Pages">
            {flattenAdminNavItems(
              filterAdminNavItems(adminNavItems, monetizationType, isSuperAdmin),
            ).map((item) => {
              const Icon = item.icon;
              const disabled = Boolean(item.requiresActiveSite && !hasActiveSite);
              return (
                <CommandItem
                  key={item.href}
                  value={item.label}
                  disabled={disabled}
                  onSelect={() => {
                    if (disabled) return;
                    runCommand(() => router.push(item.href));
                  }}
                >
                  {Icon && <Icon className="mr-2 size-4" />}
                  <span>{item.label}</span>
                  {disabled ? (
                    <span className="ml-auto text-xs text-muted-foreground">
                      Select a site first
                    </span>
                  ) : null}
                </CommandItem>
              );
            })}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}
