// Card composition patterns adapted from https://github.com/Qualiora/shadboard (MIT).
import Link from "next/link";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { ClickChart } from "../../analytics/click-chart";

interface TrendCardProps {
  data: { date: string; count: number }[];
  totalClicks7d: number;
}

export function TrendCard({ data, totalClicks7d }: TrendCardProps) {
  return (
    <Card className="gap-4" data-slot="trend-card">
      <CardHeader>
        <div className="flex flex-col gap-1">
          <CardTitle className="text-base">Click Trend (7d)</CardTitle>
          <CardDescription>
            {totalClicks7d.toLocaleString()} affiliate clicks across the last 7 days.
          </CardDescription>
        </div>
        <div className="col-start-2 row-span-2 row-start-1 self-start justify-self-end">
          <Link
            href="/admin/analytics"
            className="text-xs font-medium text-primary underline-offset-4 hover:underline"
          >
            View analytics
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        <ClickChart data={data} />
      </CardContent>
    </Card>
  );
}
