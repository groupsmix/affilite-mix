"use client";

interface ClickChartProps {
  data: { date: string; count: number }[];
}

export function ClickChart({ data }: ClickChartProps) {
  if (data.length === 0) {
    return <p className="text-sm text-gray-400">No data available</p>;
  }

  const maxCount = Math.max(...data.map((d) => d.count), 1);

  return (
    <div className="flex items-end gap-1" style={{ height: 200 }}>
      {data.map((d) => {
        const height = Math.max((d.count / maxCount) * 100, 2);
        return (
          <div
            key={d.date}
            className="group relative flex-1"
            style={{ height: "100%" }}
          >
            <div
              className="absolute bottom-0 w-full rounded-t bg-emerald-500 transition-colors hover:bg-emerald-600"
              style={{ height: `${height}%` }}
            />
            {/* Tooltip */}
            <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-gray-900 px-2 py-1 text-xs text-white group-hover:block">
              <div className="font-medium">{d.count} clicks</div>
              <div className="text-gray-300">{d.date}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
