import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { getMultiNicheOverview, type NicheStats } from "@/lib/dal/analytics-dashboard";

function formatUSD(value: number): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

function StatusBadge({ isActive }: { isActive: boolean }) {
  return (
    <Badge
      variant={isActive ? "default" : "secondary"}
      className={cn(
        isActive
          ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-500/20 dark:text-emerald-300"
          : "bg-muted text-muted-foreground hover:bg-muted",
      )}
    >
      {isActive ? "Active" : "Inactive"}
    </Badge>
  );
}

export async function MultiNicheOverview() {
  // Cross-site overview: listSites() + per-site DB calls with the tenant
  // client can only see the active site, so the page was blank. The DAL
  // helper routes the whole rollup through the privileged client and degrades
  // per-site failures to zeros so the page never crashes.
  const nicheStats: NicheStats[] = await getMultiNicheOverview();

  if (nicheStats.length === 0) {
    return (
      <section className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Multi-Niche Overview</CardTitle>
            <CardDescription>
              Site data is temporarily unavailable. Try refreshing the page.
            </CardDescription>
          </CardHeader>
        </Card>
      </section>
    );
  }

  const totalClicksToday = nicheStats.reduce((sum, s) => sum + s.clicksToday, 0);
  const totalClicks7d = nicheStats.reduce((sum, s) => sum + s.clicks7d, 0);
  const totalRevenue7d = nicheStats.reduce((sum, s) => sum + s.revenue7d, 0);
  const totalRevenueToday = nicheStats.reduce((sum, s) => sum + s.revenueToday, 0);
  const totalProducts = nicheStats.reduce((sum, s) => sum + s.totalProducts, 0);
  const totalContent = nicheStats.reduce((sum, s) => sum + s.totalContent, 0);

  // Already sorted by revenue then clicks from the DAL
  const sorted = nicheStats;

  return (
    <section className="mb-8" data-slot="multi-niche-overview">
      <h2 className="mb-4 text-lg font-semibold text-foreground">All Niches Overview</h2>

      {/* Aggregate stats */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card className="gap-1 py-5">
          <CardHeader className="px-5 [&>div]:!gap-0">
            <CardDescription>Total Sites</CardDescription>
            <CardTitle className="text-3xl font-bold tracking-tight tabular-nums">
              {nicheStats.length}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 text-xs text-muted-foreground">
            {nicheStats.filter((s) => s.isActive).length} active
          </CardContent>
        </Card>
        <Card className="gap-1 py-5">
          <CardHeader className="px-5 [&>div]:!gap-0">
            <CardDescription>Total Clicks (7d)</CardDescription>
            <CardTitle className="text-3xl font-bold tracking-tight tabular-nums">
              {totalClicks7d.toLocaleString()}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 text-xs text-muted-foreground">
            {totalClicksToday.toLocaleString()} today
          </CardContent>
        </Card>
        <Card className="gap-1 py-5">
          <CardHeader className="px-5 [&>div]:!gap-0">
            <CardDescription>Revenue (7d)</CardDescription>
            <CardTitle className="text-3xl font-bold tracking-tight tabular-nums">
              {formatUSD(totalRevenue7d)}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 text-xs text-muted-foreground">
            {formatUSD(totalRevenueToday)} today
          </CardContent>
        </Card>
        <Card className="gap-1 py-5">
          <CardHeader className="px-5 [&>div]:!gap-0">
            <CardDescription>Total Products</CardDescription>
            <CardTitle className="text-3xl font-bold tracking-tight tabular-nums">
              {totalProducts.toLocaleString()}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="gap-1 py-5">
          <CardHeader className="px-5 [&>div]:!gap-0">
            <CardDescription>Total Content</CardDescription>
            <CardTitle className="text-3xl font-bold tracking-tight tabular-nums">
              {totalContent.toLocaleString()}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Per-niche cards on mobile */}
      <div className="grid gap-3 md:hidden">
        {sorted.map((niche) => (
          <Card key={niche.siteId} className="gap-3 py-4" data-slot="multi-niche-overview-row">
            <CardHeader className="px-4 [&>div]:!gap-0">
              <div className="flex flex-col gap-0.5">
                <Link
                  href="/q7m-k4j9/analytics"
                  className="font-medium text-foreground hover:text-primary"
                >
                  {niche.name}
                </Link>
                <p className="text-xs text-muted-foreground">{niche.slug}</p>
              </div>
              <div className="col-start-2 row-span-2 row-start-1 self-start justify-self-end">
                <StatusBadge isActive={niche.isActive} />
              </div>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-2 px-4 text-sm">
              <div>
                <span className="text-muted-foreground">Clicks (7d): </span>
                <span className="font-medium text-foreground tabular-nums">
                  {niche.clicks7d.toLocaleString()}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Today: </span>
                <span className="text-foreground tabular-nums">
                  {niche.clicksToday.toLocaleString()}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Revenue (7d): </span>
                <span className="font-medium text-foreground tabular-nums">
                  {formatUSD(niche.revenue7d)}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Revenue Today: </span>
                <span className="font-medium text-foreground tabular-nums">
                  {formatUSD(niche.revenueToday)}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Products: </span>
                <span className="text-foreground tabular-nums">{niche.totalProducts}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Content: </span>
                <span className="text-foreground tabular-nums">{niche.totalContent}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Per-niche table on md+ */}
      <Card className="hidden gap-0 overflow-hidden py-0 md:block">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead className="px-4">Niche</TableHead>
              <TableHead className="px-4 text-end">Clicks (7d)</TableHead>
              <TableHead className="px-4 text-end">Today</TableHead>
              <TableHead className="px-4 text-end">Revenue (7d)</TableHead>
              <TableHead className="px-4 text-end">Revenue Today</TableHead>
              <TableHead className="px-4 text-end">Products</TableHead>
              <TableHead className="px-4 text-end">Content</TableHead>
              <TableHead className="px-4">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((niche) => (
              <TableRow key={niche.siteId} data-slot="multi-niche-overview-row">
                <TableCell className="px-4 py-3">
                  <Link
                    href="/q7m-k4j9/analytics"
                    className="font-medium text-foreground hover:text-primary"
                  >
                    {niche.name}
                  </Link>
                  <p className="text-xs text-muted-foreground">{niche.slug}</p>
                </TableCell>
                <TableCell className="px-4 py-3 text-end font-medium tabular-nums">
                  {niche.clicks7d.toLocaleString()}
                </TableCell>
                <TableCell className="px-4 py-3 text-end text-muted-foreground tabular-nums">
                  {niche.clicksToday.toLocaleString()}
                </TableCell>
                <TableCell className="px-4 py-3 text-end font-medium tabular-nums">
                  {formatUSD(niche.revenue7d)}
                </TableCell>
                <TableCell className="px-4 py-3 text-end text-muted-foreground tabular-nums">
                  {formatUSD(niche.revenueToday)}
                </TableCell>
                <TableCell className="px-4 py-3 text-end text-muted-foreground tabular-nums">
                  {niche.totalProducts}
                </TableCell>
                <TableCell className="px-4 py-3 text-end text-muted-foreground tabular-nums">
                  {niche.totalContent}
                </TableCell>
                <TableCell className="px-4 py-3">
                  <StatusBadge isActive={niche.isActive} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </section>
  );
}
