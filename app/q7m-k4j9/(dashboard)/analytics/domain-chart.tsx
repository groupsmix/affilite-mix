"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { fetchDomains, type DomainPerformanceRow } from "@/lib/analytics/api";

const ResponsiveContainer = dynamic(() => import("recharts").then((m) => m.ResponsiveContainer), {
  ssr: false,
});
const BarChart = dynamic(() => import("recharts").then((m) => m.BarChart), { ssr: false });
const Bar = dynamic(() => import("recharts").then((m) => m.Bar), { ssr: false });
const XAxis = dynamic(() => import("recharts").then((m) => m.XAxis), { ssr: false });
const YAxis = dynamic(() => import("recharts").then((m) => m.YAxis), { ssr: false });
const CartesianGrid = dynamic(() => import("recharts").then((m) => m.CartesianGrid), {
  ssr: false,
});
const Tooltip = dynamic(() => import("recharts").then((m) => m.Tooltip), { ssr: false });

function formatUSD(value: number): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

export function DomainChart() {
  const [data, setData] = useState<DomainPerformanceRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDomains(7)
      .then((res) => setData(res.domains))
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex h-[280px] items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground">No domain data available.</p>;
  }

  const chartData = data.map((d) => ({
    name: d.name || d.slug,
    clicks: d.clicks,
    revenue: d.revenue,
  }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 11, fill: "#6b7280" }}
          tickLine={false}
          axisLine={{ stroke: "#e5e7eb" }}
        />
        <YAxis
          tick={{ fontSize: 11, fill: "#6b7280" }}
          tickLine={false}
          axisLine={false}
          allowDecimals={false}
          width={40}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "#1f2937",
            border: "none",
            borderRadius: 8,
            color: "#fff",
            fontSize: 12,
          }}
          labelStyle={{ color: "#9ca3af", fontSize: 11 }}
          formatter={(value, name) => [
            name === "revenue" ? formatUSD(Number(value)) : `${value} clicks`,
            name === "revenue" ? "Revenue" : "Clicks",
          ]}
        />
        <Bar dataKey="clicks" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={32} />
        <Bar dataKey="revenue" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={32} />
      </BarChart>
    </ResponsiveContainer>
  );
}
