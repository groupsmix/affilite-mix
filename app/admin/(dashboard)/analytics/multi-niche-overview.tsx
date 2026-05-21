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
import { getClickCount } from "@/lib/dal/affiliate-clicks";
import { countContent } from "@/lib/dal/content";
import { countProducts } from "@/lib/dal/products";
import { listSites } from "@/lib/dal/sites";

interface NicheStats {
  siteId: string;
  name: string;
  slug: string;
  clicks7d: number;
  clicksToday: number;
  totalProducts: number;
  totalContent: number;
  isActive: boolean;
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
  const sites = await listSites();

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const nicheStats: NicheStats[] = await Promise.all(
    sites.map(async (site) => {
      const [clicksToday, clicks7d, totalProducts, totalContent] = await Promise.all([
        getClickCount(site.id, todayStart),
        getClickCount(site.id, sevenDaysAgo),
        countProducts({ siteId: site.id }),
        countContent({ siteId: site.id }),
      ]);

      return {
        siteId: site.id,
        name: site.name,
        slug: site.slug,
        clicks7d,
        clicksToday,
        totalProducts,
        totalContent,
        isActive: site.is_active,
      };
    }),
  );

  const totalClicksToday = nicheStats.reduce((sum, s) => sum + s.clicksToday, 0);
  const totalClicks7d = nicheStats.reduce((sum, s) => sum + s.clicks7d, 0);
  const totalProducts = nicheStats.reduce((sum, s) => sum + s.totalProducts, 0);
  const totalContent = nicheStats.reduce((sum, s) => sum + s.totalContent, 0);

  // Sort by 7d clicks descending
  const sorted = [...nicheStats].sort((a, b) => b.clicks7d - a.clicks7d);

  return (
    <section className="mb-8" data-slot="multi-niche-overview">
      <h2 className="mb-4 text-lg font-semibold text-foreground">All Niches Overview</h2>

      {/* Aggregate stats */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="gap-1 py-5">
          <CardHeader className="px-5 [&>div]:!gap-0">
            <CardDescription>Total Sites</CardDescription>
            <CardTitle className="text-3xl font-bold tracking-tight tabular-nums">
              {sites.length}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 text-xs text-muted-foreground">
            {sites.filter((s) => s.is_active).length} active
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
                  href="/admin/analytics"
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
                    href="/admin/analytics"
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
