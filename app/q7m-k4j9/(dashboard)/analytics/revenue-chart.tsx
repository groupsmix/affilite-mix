"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { fetchRevenueTrend, type RevenueTrendPoint } from "@/lib/analytics/api";

const ResponsiveContainer = dynamic(() => import("recharts").then((m) => m.ResponsiveContainer), {
  ssr: false,
});
const LineChart = dynamic(() => import("recharts").then((m) => m.LineChart), { ssr: false });
const Line = dynamic(() => import("recharts").then((m) => m.Line), { ssr: false });
const XAxis = dynamic(() => import("recharts").then((m) => m.XAxis), { ssr: false });
const YAxis = dynamic(() => import("recharts").then((m) => m.YAxis), { ssr: false });
const CartesianGrid = dynamic(() => import("recharts").then((m) => m.CartesianGrid), {
  ssr: false,
});
const Tooltip = dynamic(() => import("recharts").then((m) => m.Tooltip), { ssr: false });

type Period = 7 | 30 | 90;

function formatDate(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatUSD(value: number): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

export function RevenueChart() {
  const [period, setPeriod] = useState<Period>(30);
  const [data, setData] = useState<RevenueTrendPoint[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (days: Period) => {
    setLoading(true);
    try {
      const res = await fetchRevenueTrend(days);
      setData(res.trend);
    } catch {
      setData([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(period);
  }, [period, load]);

  const chartData = data.map((d) => ({
    ...d,
    label: formatDate(d.date),
  }));

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        {([7, 30, 90] as Period[]).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              period === p
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-accent"
            }`}
          >
            {p === 7 ? "7D" : p === 30 ? "30D" : "90D"}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex h-[280px] items-center justify-center">
          <p className="text-sm text-muted-foreground">Loading…</p>
        </div>
      ) : chartData.length === 0 ? (
        <p className="text-sm text-muted-foreground">No revenue data available.</p>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: "#6b7280" }}
              tickLine={false}
              axisLine={{ stroke: "#e5e7eb" }}
              interval={Math.max(0, Math.floor(chartData.length / 8) - 1)}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "#6b7280" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => `$${v}`}
              width={50}
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
              formatter={(value) => [formatUSD(Number(value)), "Revenue"]}
              labelFormatter={(label) => String(label)}
            />
            <Line
              type="monotone"
              dataKey="revenue"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: "#3b82f6" }}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
