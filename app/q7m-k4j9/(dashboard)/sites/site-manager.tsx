"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { useRouter } from "next/navigation";

import {
  AlertTriangleIcon,
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
// F-030: site deletion is step-up-gated — use fetchWithStepUp so a step-up 403
// prompts for re-verification and retries, rather than failing opaquely.
import { fetchWithStepUp } from "@/lib/step-up-client";

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

import { SiteFormDialog } from "./site-form";

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

  homepage_template?: string;

  product_card_style?: string;

  source: "config" | "database";

  db_id?: string;

  is_provisioned?: boolean;

  database_is_active?: boolean;
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
  if (n === undefined || !Number.isFinite(n)) return "—";

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
    <Badge
      variant="outline"
      className="border-amber-200 bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300"
    >
      {label}
    </Badge>
  );
}

function SourceBadge({ source }: { source: "config" | "database" }) {
  return source === "database" ? (
    <Badge
      variant="outline"
      className="border-blue-200 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300"
    >
      DB
    </Badge>
  ) : (
    <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600">
      Static config
    </Badge>
  );
}

function NotProvisionedBadge() {
  return (
    <Badge
      variant="outline"
      className="border-amber-300 bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300"
    >
      <AlertTriangleIcon className="size-3" aria-hidden />
      Not provisioned
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

  provisioning: boolean;

  onToggleActive: (site: SiteInfo, next: boolean) => void;

  onSetActive: (site: SiteInfo) => void;

  onProvision: (site: SiteInfo) => void;

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

  provisioning,

  onToggleActive,

  onSetActive,

  onProvision,

  onEdit,

  onDelete,

  onViewAnalytics,
}: SiteCardViewProps) {
  const primary = readPrimaryColor(site);

  const slug = site.slug ?? site.id;

  const isConfigSite = site.source === "config";

  const isNotProvisioned = isConfigSite && site.is_provisioned === false;

  const isEnabled = isConfigSite ? true : (site.is_active ?? true);

  const hasIgnoredDatabaseStatus = isConfigSite && site.database_is_active === false;

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
            className="flex size-10 shrink-0 items-center justify-center rounded-md text-sm font-bold text-white dark:text-gray-900"
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

                  {isConfigSite ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div>
                          <DropdownMenuItem disabled>
                            <PencilIcon />
                            Edit
                          </DropdownMenuItem>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="left">
                        Runtime settings come from config/sites and are read-only here.
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    <DropdownMenuItem onSelect={() => onEdit(site)}>
                      <PencilIcon />
                      Edit
                    </DropdownMenuItem>
                  )}

                  {!isActive && (
                    <DropdownMenuItem onSelect={() => onSetActive(site)} disabled={selecting}>
                      <CheckIcon />
                      Set as active
                    </DropdownMenuItem>
                  )}

                  {isNotProvisioned && (
                    <DropdownMenuItem onSelect={() => onProvision(site)} disabled={provisioning}>
                      <AlertTriangleIcon />
                      Run site provisioning
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
                        Static-config sites cannot be deleted from the admin UI.
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
            <Badge
              className="border-transparent text-white dark:text-gray-900"
              style={{ background: primary }}
            >
              Editing now
            </Badge>
          )}

          <Badge variant="secondary">{site.language.toUpperCase()}</Badge>

          <Badge variant="outline">{site.direction.toUpperCase()}</Badge>

          <MonetizationBadge type={site.monetization_type} />

          {site.homepage_template && site.homepage_template !== "standard" && (
            <Badge variant="outline" className="border-brand-200 bg-brand-50 text-brand-700">
              {site.homepage_template}
            </Badge>
          )}

          <SourceBadge source={site.source} />

          {isNotProvisioned && <NotProvisionedBadge />}

          {hasIgnoredDatabaseStatus && (
            <Badge
              variant="outline"
              className="border-amber-300 bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300"
            >
              DB status ignored
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="pb-4 pt-4">
        {isNotProvisioned && (
          <div className="mb-3 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-900/20 p-3 text-xs text-amber-800 dark:text-amber-300">
            <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" aria-hidden />

            <div className="flex-1 space-y-1.5">
              <p className="font-medium">Not provisioned — run site provisioning</p>

              <p className="text-amber-700 dark:text-amber-300">
                This tenant is defined in config but has no database row yet, so its dashboard
                modules can&apos;t load until it&apos;s provisioned.
              </p>

              <Button
                variant="outline"
                size="sm"
                className="mt-1 h-7 border-amber-300 bg-white dark:bg-gray-900 text-amber-800 dark:text-amber-300 hover:bg-amber-100"
                onClick={() => onProvision(site)}
                disabled={provisioning}
              >
                {provisioning ? (
                  <>
                    <Loader2 className="animate-spin" aria-hidden />
                    Provisioning…
                  </>
                ) : (
                  "Run site provisioning"
                )}
              </Button>
            </div>
          </div>
        )}

        {hasIgnoredDatabaseStatus && (
          <div className="mb-3 rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-900/20 p-3 text-xs text-amber-800 dark:text-amber-300">
            This site remains online because config/sites is authoritative. Its database row is
            inactive and must be reconciled before strict drift checks can pass.
          </div>
        )}

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
            {/* F-004 / Property 7 (Req 2.14): the per-tenant enable toggle is
                labelled "Enabled"/"Disabled" so the word "Active" no longer
                names two different concepts (the working-context control below
                remains "Set as active"). This disambiguates the overloaded
                "Active" affordance on the fresh-login Sites page. */}
            {isConfigSite ? "Enabled in code" : isEnabled ? "Enabled" : "Disabled"}
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

export function SiteManager({
  needsSite = false,
  isSuperAdmin = false,
}: {
  needsSite?: boolean;
  isSuperAdmin?: boolean;
}) {
  const router = useRouter();

  const [sites, setSites] = useState<SiteInfo[]>([]);

  const [loading, setLoading] = useState(true);

  const [activeSiteId, setActiveSiteId] = useState<string | null>(null);

  const [stats, setStats] = useState<Record<string, SiteStats>>({});

  const [statsLoading, setStatsLoading] = useState(true);

  const [togglingId, setTogglingId] = useState<string | null>(null);

  const [selectingId, setSelectingId] = useState<string | null>(null);

  const [provisioningId, setProvisioningId] = useState<string | null>(null);

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

  // Show an explanatory toast when the user was redirected here because a
  // dashboard page requires an active site. Runs once on mount if the flag
  // is set (passed from the server page which reads ?needsSite=1).
  useEffect(() => {
    if (needsSite) {
      toast.info("Select a site below to access the dashboard.");
    }
  }, [needsSite]);

  const loadSites = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/sites");

      if (res.ok) {
        const data = (await res.json()) as { sites: SiteInfo[] };

        setSites(data.sites);
      }
    } catch {
      // Network error — sites list stays empty; user sees the empty state
      // instead of an uncaught rejection + blank screen.
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
      // fail-open: best-effort
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
      // fail-open: best-effort
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

    try {
      const dbId = site.db_id ?? site.id;

      const res = await fetchWithCsrf("/api/admin/sites", {
        method: "PATCH",

        headers: { "Content-Type": "application/json" },

        body: JSON.stringify({ id: dbId, is_active: next }),
      });

      if (res.ok) {
        setSites((prev) => prev.map((s) => (s.id === site.id ? { ...s, is_active: next } : s)));
      } else {
        toast.error("Failed to update site status. Please try again.");
      }
    } catch {
      // fetchWithCsrf can throw on network errors. Without this catch,
      // togglingId is never reset and the Switch stays permanently disabled.
      toast.error("Failed to update site status. Check your connection and try again.");
    } finally {
      setTogglingId(null);
    }
  }, []);

  const handleSetActive = useCallback(
    async (site: SiteInfo): Promise<boolean> => {
      setSelectingId(site.id);

      try {
        const res = await fetchWithCsrf("/api/admin/sites/select", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ siteId: site.id }),
        });

        if (res.ok) {
          setActiveSiteId(site.id);
          toast.success(`Now editing ${site.name}. Dashboard features are unlocked.`);
          // Refresh so topbar tenant badge picks up the new active site.
          router.refresh();
          return true;
        }

        // Surface the failure instead of silently leaving the tenant unset —
        // otherwise the dashboard tabs bounce back here with no explanation.
        let message = "Couldn't switch the active site. Please try again.";
        try {
          const data = (await res.json()) as { error?: string };
          if (typeof data.error === "string" && data.error.length > 0) {
            message = data.error;
          }
        } catch {
          // Non-JSON error body — keep the default message.
        }
        toast.error(message);
        return false;
      } catch {
        // fetchWithCsrf can throw on network errors or CSRF token fetch failure.
        // Without this catch the error is silently swallowed and the button
        // appears to do nothing — the finally still resets the spinner but the
        // user gets zero feedback.
        toast.error("Couldn't switch the active site. Check your connection and try again.");
        return false;
      } finally {
        setSelectingId(null);
      }
    },
    [router],
  );

  // F-007 / Property 1: provision a configured tenant whose `sites` row is
  // missing by creating its DB row from the static config. Once provisioned,
  // site-scoped modules can resolve its active site and load.
  const handleProvision = useCallback(
    async (site: SiteInfo) => {
      if (site.source !== "config") return;

      setProvisioningId(site.id);

      try {
        const res = await fetchWithCsrf("/api/admin/sites", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            slug: site.slug ?? site.id,
            name: site.name,
            domain: site.domain,
            language: site.language,
            direction: site.direction,
            monetization_type: site.monetization_type,
            theme: site.theme,
          }),
        });

        if (res.ok) {
          toast.success(`Provisioned “${site.name}”. Its dashboard modules can now load.`);
          await Promise.all([loadSites(), loadStats()]);
          router.refresh();
        } else {
          let message = "Failed to provision site. Please try again.";
          try {
            const data = (await res.json()) as { error?: string };
            if (typeof data.error === "string" && data.error.length > 0) {
              message = data.error;
            }
          } catch {
            // Non-JSON error body — keep the default message.
          }
          toast.error(message);
        }
      } catch {
        toast.error("Failed to provision site. Check your connection and try again.");
      } finally {
        setProvisioningId(null);
      }
    },
    [loadSites, loadStats, router],
  );

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;

    const targetId = deleteTarget.db_id ?? deleteTarget.id;

    setDeleting(true);

    try {
      const res = await fetchWithStepUp(`/api/admin/sites/${targetId}`, {
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
          // fail-open: best-effort
          // Non-JSON error body — keep default message.
        }

        toast.error(message);
      }
    } catch {
      // fail-open: best-effort
      toast.error("Failed to delete site");
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget, loadSites, loadStats]);

  const handleViewAnalytics = useCallback(
    async (site: SiteInfo) => {
      // If a different site is targeted, set it active and WAIT for the
      // active-site cookie to be written before navigating. Firing this
      // without awaiting raced the navigation: analytics loaded before the
      // cookie was set and bounced straight back to /sites.
      if (site.id !== activeSiteId) {
        const ok = await handleSetActive(site);
        if (!ok) return;
      }

      router.push("/q7m-k4j9/analytics");
    },
    [activeSiteId, handleSetActive, router],
  );

  const handleEdit = useCallback(
    async (site: SiteInfo) => {
      // Modules are configured against the active site, so editing a site must
      // switch context to that site before the module toggles can load.
      if (site.id !== activeSiteId) {
        const ok = await handleSetActive(site);
        if (!ok) return;
      }
      setEditStubSite(site);
    },
    [activeSiteId, handleSetActive],
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
        provisioning={provisioningId === site.id}
        onToggleActive={(site, next) => {
          void handleToggleActive(site, next);
        }}
        onSetActive={(site) => {
          void handleSetActive(site);
        }}
        onProvision={(site) => {
          void handleProvision(site);
        }}
        onEdit={(site) => {
          void handleEdit(site);
        }}
        onDelete={setDeleteTarget}
        onViewAnalytics={(site) => {
          void handleViewAnalytics(site);
        }}
      />
    ));
  }, [
    sites,

    activeSiteId,

    stats,

    statsLoading,

    togglingId,

    selectingId,

    provisioningId,

    handleToggleActive,

    handleSetActive,

    handleProvision,

    handleViewAnalytics,

    handleEdit,
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

      {/* Site create/edit form */}
      <SiteFormDialog
        key="site-create"
        open={addOpen}
        onOpenChange={setAddOpen}
        onSuccess={() => void Promise.all([loadSites(), loadStats()])}
        mode="create"
        isSuperAdmin={isSuperAdmin}
      />

      <SiteFormDialog
        key={editStubSite ? `site-edit-${editStubSite.id}` : "site-edit"}
        open={editStubSite != null}
        onOpenChange={(open) => {
          if (!open) setEditStubSite(null);
        }}
        onSuccess={() => void Promise.all([loadSites(), loadStats()])}
        mode="edit"
        isSuperAdmin={isSuperAdmin}
        initialData={
          editStubSite
            ? {
                id: editStubSite.id,
                db_id: editStubSite.db_id,
                slug: editStubSite.slug ?? editStubSite.id,
                name: editStubSite.name,
                domain: editStubSite.domain,
                language: editStubSite.language,
                direction: editStubSite.direction as "ltr" | "rtl",
                monetization_type: (editStubSite.monetization_type ?? "affiliate") as
                  | "affiliate"
                  | "ads"
                  | "both",
                theme: editStubSite.theme as Record<string, string> | undefined,
                features: editStubSite.features,
              }
            : undefined
        }
      />

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
