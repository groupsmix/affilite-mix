// Card composition patterns adapted from https://github.com/Qualiora/shadboard (MIT).
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getRevenuePerSite } from "@/lib/dal/revenue-per-site";

interface RevenuePerSiteCardProps {
  sevenDaysAgo: string;
}

function formatUSD(value: number): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

/**
 * Super-admin-only dashboard card that lists every registered site along
 * with the estimated affiliate revenue generated in the last 7 days.
 *
 * The estimate is the product of two existing columns:
 *   - `affiliate_clicks` row count (per site, since `sevenDaysAgo`)
 *   - `sites.est_revenue_per_click` (per-site configured rate)
 *
 * No new tables, columns, or migrations are introduced — we reuse the
 * existing `getClickCount` DAL and the `sites` table. Because the card
 * auto-refreshes every 60 s with the rest of the dashboard, the underlying
 * cross-site query is cached for 60 s via `unstable_cache` under the
 * `dashboard:revenue-7d` tag (see `lib/dal/revenue-per-site.ts`).
 */
export async function RevenuePerSiteCard({ sevenDaysAgo }: RevenuePerSiteCardProps) {
  const rows = await getRevenuePerSite(sevenDaysAgo);
  const totalRevenue = rows.reduce((sum, r) => sum + r.revenue, 0);
  const maxRevenue = rows.reduce((max, r) => Math.max(max, r.revenue), 0);

  return (
    <Card className="gap-4" data-slot="revenue-per-site-card">
      <CardHeader>
        <div className="flex flex-col gap-1">
          <CardTitle className="text-base">Estimated revenue (7d)</CardTitle>
          <CardDescription>
            Per-site revenue estimate — clicks × configured rate per click.
          </CardDescription>
        </div>
        <div className="col-start-2 row-span-2 row-start-1 self-start justify-self-end text-right">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Total</p>
          <p className="text-base font-semibold tabular-nums">{formatUSD(totalRevenue)}</p>
        </div>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No sites configured yet.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {rows.map((r) => {
              const widthPct = maxRevenue > 0 ? (r.revenue / maxRevenue) * 100 : 0;
              return (
                <li key={r.siteId} className="flex flex-col gap-1">
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="truncate font-medium text-foreground">{r.name}</span>
                    <span className="shrink-0 font-semibold tabular-nums">
                      {formatUSD(r.revenue)}
                    </span>
                  </div>
                  <div
                    className="relative h-2 w-full overflow-hidden rounded-full bg-muted"
                    role="img"
                    aria-label={`${r.name}: ${formatUSD(r.revenue)} from ${r.clicks.toLocaleString()} clicks at ${formatUSD(r.ratePerClick)} per click`}
                  >
                    <div
                      className="absolute inset-y-0 start-0 rounded-full bg-primary"
                      style={{ width: `${widthPct}%` }}
                      aria-hidden
                    />
                  </div>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {r.clicks.toLocaleString()} clicks · {formatUSD(r.ratePerClick)}/click
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
