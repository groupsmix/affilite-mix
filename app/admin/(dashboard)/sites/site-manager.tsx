"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { useRouter } from "next/navigation";

import {
  BarChart3Icon,
  CheckIcon,
  ExternalLinkIcon,
  Loader2,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";

import { toast } from "sonner";

import { fetchWithCsrf } from "@/lib/fetch-csrf";

import { cn } from "@/lib/utils";

import { Badge } from "@/components/ui/badge";

import { Button } from "@/components/ui/button";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { Input } from "@/components/ui/input";

import { Label } from "@/components/ui/label";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { Switch } from "@/components/ui/switch";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

/* ------------------------------------------------------------------ */

/*  Types                                                               */

/* ------------------------------------------------------------------ */

interface SiteInfo {
  id: string;

  slug?: string;

  name: string;

  domain: string;

  language: string;

  direction: string;

  is_active?: boolean;

  monetization_type?: string;

  est_revenue_per_click?: number;

  theme?: Record<string, unknown>;

  features?: Record<string, boolean>;

  meta_title?: string | null;

  meta_description?: string | null;

  source: "config" | "database";

  db_id?: string;
}

interface SiteStats {
  activeProducts: number;

  publishedContent: number;

  clicks: number;
}

interface StatsResponse {
  period: { days: number; since: string };

  stats: Record<string, SiteStats>;
}

const DEFAULT_PRIMARY = "#1f2937";

const STATS_LOOKBACK_DAYS = 7;

/* ------------------------------------------------------------------ */

/*  Helpers                                                             */

/* ------------------------------------------------------------------ */

function readPrimaryColor(site: SiteInfo): string {
  const theme = (site.theme ?? {}) as Record<string, unknown>;

  const camel = theme["primaryColor"];

  const snake = theme["primary_color"];

  if (typeof camel === "string" && camel.length > 0) return camel;

  if (typeof snake === "string" && snake.length > 0) return snake;

  return DEFAULT_PRIMARY;
}

function formatNumber(n: number | undefined): string {
  if (n === undefined || Number.isNaN(n)) return "—";

  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k`;

  return String(n);
}

function initialFor(name: string): string {
  return (name.trim()[0] ?? "?").toUpperCase();
}

/* ------------------------------------------------------------------ */

/*  Subcomponents                                                       */

/* ------------------------------------------------------------------ */

function MonetizationBadge({ type }: { type: string | undefined }) {
  if (!type) return null;

  const label = type === "both" ? "Affiliate + Ads" : type === "ads" ? "Ads" : "Affiliate";

  return (
    <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">
      {label}
    </Badge>
  );
}

function SourceBadge({ source }: { source: "config" | "database" }) {
  return source === "database" ? (
    <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">
      DB
    </Badge>
  ) : (
    <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600">
      Static config
    </Badge>
  );
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5 text-center">
      <span className="text-lg font-semibold tabular-nums leading-none text-foreground">
        {value}
      </span>

      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */

/*  Site card                                                           */

/* ------------------------------------------------------------------ */

interface SiteCardViewProps {
  site: SiteInfo;

  isActive: boolean;

  stats: SiteStats | undefined;

  statsLoading: boolean;

  toggling: boolean;

  selecting: boolean;

  onToggleActive: (site: SiteInfo, next: boolean) => void;

  onSetActive: (site: SiteInfo) => void;

  onEdit: (site: SiteInfo) => void;

  onDelete: (site: SiteInfo) => void;

  onViewAnalytics: (site: SiteInfo) => void;
}

function SiteCardView({
  site,

  isActive,

  stats,

  statsLoading,

  toggling,

  selecting,

  onToggleActive,

  onSetActive,

  onEdit,

  onDelete,

  onViewAnalytics,
}: SiteCardViewProps) {
  const primary = readPrimaryColor(site);

  const slug = site.slug ?? site.id;

  const isConfigSite = site.source === "config";

  const isEnabled = site.is_active ?? true;

  return (
    <Card
      className={cn(
        "relative gap-0 overflow-hidden py-0 transition-shadow hover:shadow-md",

        isActive && "ring-2 ring-offset-2",
      )}
      style={
        isActive
          ? ({
              "--color-primary": primary,

              boxShadow: `0 0 0 1px ${primary}`,
            } as React.CSSProperties)
          : undefined
      }
      data-active={isActive || undefined}
      data-source={site.source}
    >
      {/* Colored header strip */}

      <div
        aria-hidden
        className="h-2 w-full"
        style={{ background: primary, ["--color-primary" as string]: primary }}
      />

      <CardHeader className="gap-3 pt-5">
        <div className="flex items-start gap-3">
          <span
            className="flex size-10 shrink-0 items-center justify-center rounded-md text-sm font-bold text-white"
            style={{ background: primary }}
          >
            {initialFor(site.name)}
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <CardTitle className="truncate text-base">{site.name}</CardTitle>

                <CardDescription className="mt-0.5 truncate font-mono text-xs">
                  {slug}
                </CardDescription>
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${site.name}`}>
                    <MoreHorizontalIcon />
                  </Button>
                </DropdownMenuTrigger>

                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuLabel>Actions</DropdownMenuLabel>

                  <DropdownMenuItem onSelect={() => onEdit(site)}>
                    <PencilIcon />
                    Edit
                  </DropdownMenuItem>

                  {!isActive && (
                    <DropdownMenuItem onSelect={() => onSetActive(site)} disabled={selecting}>
                      <CheckIcon />
                      Set as active
                    </DropdownMenuItem>
                  )}

                  <DropdownMenuItem onSelect={() => onViewAnalytics(site)}>
                    <BarChart3Icon />
                    View analytics
                  </DropdownMenuItem>

                  <DropdownMenuItem
                    onSelect={() => onToggleActive(site, !isEnabled)}
                    disabled={toggling || isConfigSite}
                  >
                    {isEnabled ? "Deactivate" : "Activate"}
                  </DropdownMenuItem>

                  <DropdownMenuSeparator />

                  {isConfigSite ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div>
                          <DropdownMenuItem variant="destructive" disabled>
                            <Trash2Icon />
                            Delete
                          </DropdownMenuItem>
                        </div>
                      </TooltipTrigger>

                      <TooltipContent side="left">
                        Static-config sites are managed in config/sites/.
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    <DropdownMenuItem variant="destructive" onSelect={() => onDelete(site)}>
                      <Trash2Icon />
                      Delete
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <a
              href={`https://${site.domain}`}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex max-w-full items-center gap-1 truncate text-xs text-muted-foreground hover:text-foreground"
            >
              <span className="truncate">{site.domain}</span>

              <ExternalLinkIcon className="size-3 shrink-0" aria-hidden />
            </a>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {isActive && (
            <Badge className="border-transparent text-white" style={{ background: primary }}>
              Editing now
            </Badge>
          )}

          <Badge variant="secondary">{site.language.toUpperCase()}</Badge>

          <Badge variant="outline">{site.direction.toUpperCase()}</Badge>

          <MonetizationBadge type={site.monetization_type} />

          <SourceBadge source={site.source} />
        </div>
      </CardHeader>

      <CardContent className="pb-4 pt-4">
        <div className="grid grid-cols-3 gap-2 rounded-md border bg-muted/30 py-3">
          <StatCell
            label="Products"
            value={statsLoading ? "…" : formatNumber(stats?.activeProducts)}
          />

          <StatCell
            label="Content"
            value={statsLoading ? "…" : formatNumber(stats?.publishedContent)}
          />

          <StatCell
            label={`Clicks ${STATS_LOOKBACK_DAYS}d`}
            value={statsLoading ? "…" : formatNumber(stats?.clicks)}
          />
        </div>
      </CardContent>

      <CardFooter className="justify-between border-t px-6 pb-5 pt-4">
        <div className="flex items-center gap-2">
          <Switch
            id={`toggle-${slug}`}
            checked={isEnabled}
            onCheckedChange={(next) => onToggleActive(site, Boolean(next))}
            disabled={toggling || isConfigSite}
            aria-label={`${isEnabled ? "Deactivate" : "Activate"} ${site.name}`}
          />

          <label
            htmlFor={`toggle-${slug}`}
            className={cn(
              "text-xs font-medium",

              isEnabled ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {isEnabled ? "Active" : "Inactive"}
          </label>
        </div>

        {!isActive ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onSetActive(site)}
            disabled={selecting}
          >
            {selecting ? "Switching…" : "Set as active"}
          </Button>
        ) : (
          <span className="text-xs font-medium text-muted-foreground">Currently selected</span>
        )}
      </CardFooter>
    </Card>
  );
}

/* ------------------------------------------------------------------ */

/*  Loading skeleton                                                    */

/* ------------------------------------------------------------------ */

function SiteCardSkeleton() {
  return (
    <Card className="gap-0 overflow-hidden py-0">
      <div className="h-2 w-full animate-pulse bg-muted" />

      <CardHeader className="gap-3 pt-5">
        <div className="flex items-start gap-3">
          <span className="size-10 shrink-0 animate-pulse rounded-md bg-muted" />

          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />

            <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
          </div>
        </div>

        <div className="flex gap-1.5">
          <div className="h-5 w-10 animate-pulse rounded-full bg-muted" />

          <div className="h-5 w-10 animate-pulse rounded-full bg-muted" />

          <div className="h-5 w-16 animate-pulse rounded-full bg-muted" />
        </div>
      </CardHeader>

      <CardContent className="pb-4 pt-4">
        <div className="h-14 animate-pulse rounded-md bg-muted/50" />
      </CardContent>

      <CardFooter className="justify-between border-t px-6 pb-5 pt-4">
        <div className="h-5 w-20 animate-pulse rounded bg-muted" />

        <div className="h-8 w-24 animate-pulse rounded bg-muted" />
      </CardFooter>
    </Card>
  );
}

/* ------------------------------------------------------------------ */

/*  Main component                                                      */

/* ------------------------------------------------------------------ */

export function SiteManager() {
  const router = useRouter();

  const [sites, setSites] = useState<SiteInfo[]>([]);

  const [loading, setLoading] = useState(true);

  const [activeSiteId, setActiveSiteId] = useState<string | null>(null);

  const [stats, setStats] = useState<Record<string, SiteStats>>({});

  const [statsLoading, setStatsLoading] = useState(true);

  const [togglingId, setTogglingId] = useState<string | null>(null);

  const [selectingId, setSelectingId] = useState<string | null>(null);

  const [addOpen, setAddOpen] = useState(false);

  const [editStubSite, setEditStubSite] = useState<SiteInfo | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<SiteInfo | null>(null);

  const [confirmInput, setConfirmInput] = useState("");

  const [deleting, setDeleting] = useState(false);

  // Reset the confirmation input whenever the delete dialog opens or closes

  // so a previously-typed slug never leaks between sites.

  const deleteOpen = deleteTarget != null;

  useEffect(() => {
    setConfirmInput("");
  }, [deleteOpen]);

  const loadSites = useCallback(async () => {
    const res = await fetch("/api/admin/sites");

    if (res.ok) {
      const data = (await res.json()) as { sites: SiteInfo[] };

      setSites(data.sites);
    }
  }, []);

  const loadActiveSite = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/sites/active");

      if (res.ok) {
        const data = (await res.json()) as { activeSiteId: string | null };

        setActiveSiteId(data.activeSiteId ?? null);
      }
    } catch {
      // ignore — stays null
    }
  }, []);

  const loadStats = useCallback(async () => {
    setStatsLoading(true);

    try {
      const res = await fetch(`/api/admin/sites/stats?days=${STATS_LOOKBACK_DAYS}`);

      if (res.ok) {
        const data = (await res.json()) as StatsResponse;

        setStats(data.stats ?? {});
      }
    } catch {
      // leave stats empty; cards will show —
    }

    setStatsLoading(false);
  }, []);

  useEffect(() => {
    void (async () => {
      setLoading(true);

      await Promise.all([loadSites(), loadActiveSite()]);

      setLoading(false);

      // Stats can load in parallel but after we know the sites list.

      void loadStats();
    })();
  }, [loadSites, loadActiveSite, loadStats]);

  const handleToggleActive = useCallback(async (site: SiteInfo, next: boolean) => {
    if (site.source !== "database") return;

    setTogglingId(site.id);

    const dbId = site.db_id ?? site.id;

    const res = await fetchWithCsrf("/api/admin/sites", {
      method: "PATCH",

      headers: { "Content-Type": "application/json" },

      body: JSON.stringify({ id: dbId, is_active: next }),
    });

    if (res.ok) {
      setSites((prev) => prev.map((s) => (s.id === site.id ? { ...s, is_active: next } : s)));
    }

    setTogglingId(null);
  }, []);

  const handleSetActive = useCallback(
    async (site: SiteInfo) => {
      setSelectingId(site.id);

      const res = await fetchWithCsrf("/api/admin/sites/select", {
        method: "POST",

        headers: { "Content-Type": "application/json" },

        body: JSON.stringify({ siteId: site.id }),
      });

      if (res.ok) {
        setActiveSiteId(site.id);

        // Refresh so topbar tenant badge (Task 9) picks up the new active site.

        router.refresh();
      }

      setSelectingId(null);
    },

    [router],
  );

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;

    const targetId = deleteTarget.db_id ?? deleteTarget.id;

    setDeleting(true);

    try {
      const res = await fetchWithCsrf(`/api/admin/sites/${targetId}`, {
        method: "DELETE",
      });

      if (res.ok) {
        toast.success(`Deleted “${deleteTarget.name}”`);

        setDeleteTarget(null);

        await Promise.all([loadSites(), loadStats()]);
      } else {
        let message = "Failed to delete site";

        try {
          const data = (await res.json()) as { error?: string };

          if (typeof data.error === "string" && data.error.length > 0) {
            message = data.error;
          }
        } catch {
          // Non-JSON error body — keep default message.
        }

        toast.error(message);
      }
    } catch {
      toast.error("Failed to delete site");
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget, loadSites, loadStats]);

  const handleViewAnalytics = useCallback(
    (site: SiteInfo) => {
      // If a different site is targeted, set it active first so the

      // analytics dashboard (which reads from the active-site cookie)

      // lands on the correct tenant.

      if (site.id !== activeSiteId) {
        void handleSetActive(site);
      }

      router.push("/admin/analytics");
    },

    [activeSiteId, handleSetActive, router],
  );

  const cards = useMemo(() => {
    return sites.map((site) => (
      <SiteCardView
        key={site.id}
        site={site}
        isActive={site.id === activeSiteId}
        stats={stats[site.slug ?? site.id]}
        statsLoading={statsLoading}
        toggling={togglingId === site.id}
        selecting={selectingId === site.id}
        onToggleActive={(site, next) => {
          void handleToggleActive(site, next);
        }}
        onSetActive={(site) => {
          void handleSetActive(site);
        }}
        onEdit={setEditStubSite}
        onDelete={setDeleteTarget}
        onViewAnalytics={handleViewAnalytics}
      />
    ));
  }, [
    sites,

    activeSiteId,

    stats,

    statsLoading,

    togglingId,

    selectingId,

    handleToggleActive,

    handleSetActive,

    handleViewAnalytics,
  ]);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-6">
        {/* Page header */}

        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Sites</h1>

            <p className="mt-1 text-sm text-muted-foreground">
              Manage your tenants: toggle availability, switch the active site, and open analytics
              or editing for any property you have access to.
            </p>
          </div>

          <Button onClick={() => setAddOpen(true)} className="self-start md:self-auto">
            <PlusIcon />
            Add site
          </Button>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <SiteCardSkeleton key={i} />
            ))}
          </div>
        ) : sites.length === 0 ? (
          <Card className="py-12">
            <CardContent className="text-center">
              <p className="text-sm text-muted-foreground">No sites configured yet.</p>

              <Button className="mt-3" onClick={() => setAddOpen(true)}>
                <PlusIcon />
                Add your first site
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">{cards}</div>
        )}
      </div>

      {/* Placeholder dialogs — real forms land in Task 15b */}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add site</DialogTitle>

            <DialogDescription>
              The full site-creation form ships in Task 15b. This placeholder reserves the CTA so
              the grid layout and routing are already in place.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editStubSite != null} onOpenChange={(open) => !open && setEditStubSite(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit {editStubSite?.name ?? "site"}</DialogTitle>

            <DialogDescription>
              The edit form is out of scope for this restyle and will be wired in Task 15b.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditStubSite(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleteOpen}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.name ?? "site"}?</AlertDialogTitle>

            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  This action cannot be undone. It will permanently remove the site and detach any
                  content, products, and analytics attributed to it.
                </p>

                {deleteTarget ? (
                  <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-md border bg-muted/40 p-3 text-xs">
                    <dt className="font-medium text-foreground">Name</dt>

                    <dd className="truncate">{deleteTarget.name}</dd>

                    <dt className="font-medium text-foreground">Slug</dt>

                    <dd className="truncate font-mono">{deleteTarget.slug ?? "—"}</dd>

                    <dt className="font-medium text-foreground">Domain</dt>

                    <dd className="truncate font-mono">{deleteTarget.domain}</dd>
                  </dl>
                ) : null}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-2">
            <Label htmlFor="site-delete-confirm" className="text-sm">
              Type the site slug to confirm
            </Label>

            <Input
              id="site-delete-confirm"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              placeholder={deleteTarget?.slug ?? ""}
              value={confirmInput}
              onChange={(event) => setConfirmInput(event.target.value)}
              disabled={deleting}
            />
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>

            <AlertDialogAction
              disabled={
                deleting ||
                !deleteTarget ||
                (confirmInput !== deleteTarget.slug && confirmInput !== deleteTarget.id)
              }
              onClick={(event) => {
                event.preventDefault();

                void handleDelete();
              }}
            >
              {deleting ? (
                <>
                  <Loader2 className="animate-spin" aria-hidden="true" />
                  Deleting…
                </>
              ) : (
                "Delete site"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TooltipProvider>
  );
}
