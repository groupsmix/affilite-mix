"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown } from "lucide-react";

import { fetchWithCsrf } from "@/lib/fetch-csrf";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface SiteInfo {
  id: string;
  name: string;
  domain: string;
}

interface TenantBadgeSwitcherProps {
  /** Site name resolved on the server (from the active-site cookie). */
  initialSiteName: string | null;
  /** Whether the current user is super_admin. Controls the "All sites" label. */
  isSuperAdmin: boolean;
}

/**
 * Topbar tenant badge — a pill showing the active site's colored dot + name
 * that, when clicked, opens a popover with the site switcher.
 *
 * The site name is seeded from the server layout (no duplicate DB fetch);
 * the switchable site list is loaded lazily from `/api/admin/sites`.
 */
export function TenantBadgeSwitcher({ initialSiteName, isSuperAdmin }: TenantBadgeSwitcherProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [sites, setSites] = useState<SiteInfo[] | null>(null);
  const [activeSiteId, setActiveSiteId] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Lazy-load the sites list + active-site id the first time the popover opens.
  useEffect(() => {
    if (!open || sites !== null) return;
    let cancelled = false;
    void (async () => {
      try {
        const [sitesRes, activeRes] = await Promise.all([
          fetch("/api/admin/sites"),
          fetch("/api/admin/sites/active"),
        ]);
        if (cancelled) return;
        if (sitesRes.ok) {
          const data = (await sitesRes.json()) as { sites: SiteInfo[] };
          setSites(data.sites);
        } else {
          setLoadError("Failed to load sites");
        }
        if (activeRes.ok) {
          const active = (await activeRes.json()) as { activeSiteId: string | null };
          setActiveSiteId(active.activeSiteId);
        }
      } catch {
        if (!cancelled) setLoadError("Failed to load sites");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, sites]);

  async function handleSelect(siteId: string) {
    if (switching || siteId === activeSiteId) return;
    setSwitching(true);
    try {
      const res = await fetchWithCsrf("/api/admin/sites/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId }),
      });
      if (res.ok) {
        setActiveSiteId(siteId);
        setOpen(false);
        router.refresh();
      }
    } finally {
      setSwitching(false);
    }
  }

  const displayName = initialSiteName ?? (isSuperAdmin ? "All sites" : "No site selected");
  const ariaLabel = initialSiteName
    ? `Editing site: ${initialSiteName}. Click to switch.`
    : isSuperAdmin
      ? "All sites. Click to switch."
      : "No site selected. Click to switch.";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={ariaLabel}
        className={cn(
          "group inline-flex h-8 max-w-[16rem] items-center gap-2 rounded-full border border-border bg-muted/40 px-2.5 text-xs font-medium text-foreground outline-none transition-colors",
          "hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
          "data-[state=open]:bg-muted",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "inline-flex size-2 shrink-0 rounded-full",
            !initialSiteName && "bg-muted-foreground/50",
          )}
          style={
            initialSiteName ? { backgroundColor: "var(--color-primary, currentColor)" } : undefined
          }
        />
        <span className="truncate">{displayName}</span>
        <ChevronDown
          aria-hidden="true"
          className="size-3.5 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180"
        />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0">
        <div className="px-3 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Switch site
        </div>
        <div className="max-h-80 overflow-y-auto">
          {sites === null && !loadError && (
            <div className="space-y-2 p-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center gap-2 rounded-md bg-muted/50 px-2 py-1.5">
                  <div className="size-6 animate-pulse rounded bg-muted" />
                  <div className="h-3 flex-1 animate-pulse rounded bg-muted" />
                </div>
              ))}
            </div>
          )}
          {loadError && <div className="p-3 text-sm text-destructive">{loadError}</div>}
          {sites !== null && sites.length === 0 && (
            <div className="p-3 text-sm text-muted-foreground">No sites available.</div>
          )}
          {sites?.map((site) => {
            const isActive = site.id === activeSiteId;
            return (
              <button
                key={site.id}
                type="button"
                onClick={() => void handleSelect(site.id)}
                disabled={switching}
                aria-current={isActive ? "true" : undefined}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-2 text-start text-sm transition-colors",
                  isActive
                    ? "bg-accent text-accent-foreground"
                    : "text-foreground hover:bg-accent/60",
                  "disabled:opacity-50",
                )}
              >
                <span className="flex size-6 shrink-0 items-center justify-center rounded bg-muted text-xs font-bold text-foreground">
                  {site.name[0]?.toUpperCase() ?? "?"}
                </span>
                <span className="flex-1 truncate text-start">
                  <span className="block truncate font-medium">{site.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {site.domain}
                  </span>
                </span>
                {isActive && <Check aria-hidden="true" className="size-4 text-foreground" />}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
