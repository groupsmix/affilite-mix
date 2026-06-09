"use client";

import { useEffect, useState } from "react";
import { fetchAnalyticsSummary, type AnalyticsSummaryResponse } from "@/lib/analytics/api";
import { KpiCard } from "../components/dashboard/kpi-card";

function formatUSD(value: number): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

export function AnalyticsKpis() {
  const [data, setData] = useState<AnalyticsSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAnalyticsSummary(30)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-32 animate-pulse rounded-xl bg-muted" />
        ))}
      </div>
    );
  }

  if (!data) {
    return null;
  }

  return (
    <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard
        title="Total Revenue (est.)"
        value={formatUSD(data.estimatedRevenue)}
        description="Estimated revenue over the last 30 days."
        delta={{
          valuePct: data.growthRatePct,
          label: "vs. previous 30 days",
        }}
      />
      <KpiCard
        title="Total Clicks"
        value={data.totalClicks.toLocaleString()}
        description="Affiliate clicks in the last 30 days."
      />
      <KpiCard
        title="Avg Revenue / Click"
        value={formatUSD(data.avgOrderValue)}
        description="Average estimated revenue per click."
      />
      <KpiCard
        title="Growth Rate"
        value={`${data.growthRatePct > 0 ? "+" : ""}${data.growthRatePct}%`}
        description="Click growth vs. previous period."
        delta={{
          valuePct: data.growthRatePct,
          label: "period-over-period",
        }}
      />
    </div>
  );
}
