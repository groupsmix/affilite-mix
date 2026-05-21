"use client";

import { useEffect, useState } from "react";

interface PriceSnapshot {
  price_amount: number;
  currency: string;
  source: string;
  scraped_at: string;
}

interface PriceHistoryChartProps {
  productId: string;
  days?: number;
}

function formatPrice(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * Lightweight SVG price history chart.
 * No external charting library — renders an inline SVG sparkline
 * with min/max/current labels.
 */
export function PriceHistoryChart({ productId, days = 90 }: PriceHistoryChartProps) {
  const [snapshots, setSnapshots] = useState<PriceSnapshot[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void fetch(`/api/products/${productId}/price-history?days=${days}`)
      .then((res) => res.json())
      .then((data) => {
        setSnapshots(data.snapshots || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [productId, days]);

  if (loading) {
    return <div className="h-32 animate-pulse rounded-lg bg-gray-100" />;
  }

  if (snapshots.length < 2) {
    return null; // Not enough data points for a chart
  }

  const prices = snapshots.map((s) => s.price_amount);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const currentPrice = prices[prices.length - 1];
  const currency = snapshots[0].currency;
  const priceRange = maxPrice - minPrice || 1;

  // SVG dimensions
  const width = 400;
  const height = 120;
  const padding = { top: 10, right: 10, bottom: 10, left: 10 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  // Generate SVG path
  const points = snapshots.map((s, i) => {
    const x = padding.left + (i / (snapshots.length - 1)) * chartWidth;
    const y = padding.top + (1 - (s.price_amount - minPrice) / priceRange) * chartHeight;
    return { x, y };
  });

  const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");

  // Area fill path
  const areaD = `${pathD} L ${points[points.length - 1].x} ${height - padding.bottom} L ${points[0].x} ${height - padding.bottom} Z`;

  // Price trend color
  const trendColor = currentPrice <= prices[0] ? "#16a34a" : "#dc2626"; // green if down, red if up

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium text-gray-700">Price History ({days}d)</span>
        <span className="text-xs text-gray-500">
          Low: {formatPrice(minPrice, currency)} · High: {formatPrice(maxPrice, currency)}
        </span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" aria-label="Price history chart">
        {/* Area fill */}
        <path d={areaD} fill={trendColor} fillOpacity={0.08} />
        {/* Line */}
        <path d={pathD} fill="none" stroke={trendColor} strokeWidth={2} strokeLinejoin="round" />
        {/* Current price dot */}
        <circle
          cx={points[points.length - 1].x}
          cy={points[points.length - 1].y}
          r={4}
          fill={trendColor}
        />
      </svg>
      <div className="flex items-baseline justify-between text-xs text-gray-500">
        <span>{formatDate(snapshots[0].scraped_at)}</span>
        <span className="font-medium" style={{ color: trendColor }}>
          Current: {formatPrice(currentPrice, currency)}
        </span>
        <span>{formatDate(snapshots[snapshots.length - 1].scraped_at)}</span>
      </div>
    </div>
  );
}
