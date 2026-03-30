"use client";

interface ClickChartProps {
  data: { date: string; count: number }[];
}

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function ClickChart({ data }: ClickChartProps) {
  if (data.length === 0) {
    return <p className="text-sm text-gray-400">No data available</p>;
  }

  const maxCount = Math.max(...data.map((d) => d.count), 1);

  // Show ~5 evenly spaced Y-axis ticks
  const tickCount = 4;
  const yTicks = Array.from({ length: tickCount + 1 }, (_, i) =>
    Math.round((maxCount / tickCount) * (tickCount - i)),
  );

  // Show date labels for every ~7th bar or at least first and last
  const labelInterval = Math.max(1, Math.floor(data.length / 5));

  return (
    <div className="flex gap-2">
      {/* Y-axis labels */}
      <div className="flex flex-col justify-between py-1 text-right text-[10px] text-gray-400" style={{ height: 200 }}>
        {yTicks.map((tick) => (
          <span key={tick}>{tick}</span>
        ))}
      </div>

      <div className="flex-1">
        {/* Bars */}
        <div className="flex items-end gap-[2px]" style={{ height: 200 }}>
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

        {/* X-axis date labels */}
        <div className="mt-1 flex">
          {data.map((d, i) => (
            <div key={d.date} className="flex-1 text-center text-[10px] text-gray-400">
              {i === 0 || i === data.length - 1 || i % labelInterval === 0
                ? formatShortDate(d.date)
                : ""}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
