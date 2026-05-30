"use client";

import { useEffect, useState } from "react";
import { fetchConversion, type ConversionFunnelStep } from "@/lib/analytics/api";

export function ConversionFunnel() {
  const [data, setData] = useState<ConversionFunnelStep[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchConversion()
      .then((res) => setData(res.funnel))
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground">No conversion data available.</p>;
  }

  const maxCount = Math.max(...data.map((d) => d.count), 1);

  return (
    <div className="space-y-3">
      {data.map((step, i) => {
        const widthPct = Math.max((step.count / maxCount) * 100, 8);
        const conversionRate =
          i > 0 && data[i - 1].count > 0
            ? ((step.count / data[i - 1].count) * 100).toFixed(1)
            : null;

        return (
          <div key={step.stage}>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="font-medium text-foreground">{step.stage}</span>
              <span className="tabular-nums text-muted-foreground">
                {step.count.toLocaleString()}
                {conversionRate !== null && (
                  <span className="ml-2 text-xs text-muted-foreground/70">({conversionRate}%)</span>
                )}
              </span>
            </div>
            <div className="h-6 w-full overflow-hidden rounded-md bg-muted">
              <div
                className="flex h-full items-center rounded-md transition-all duration-500"
                style={{
                  width: `${widthPct}%`,
                  backgroundColor: FUNNEL_COLORS[i % FUNNEL_COLORS.length],
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

const FUNNEL_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6"];
