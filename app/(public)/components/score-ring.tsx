interface ScoreRingProps {
  score: number;
  size?: "sm" | "md" | "lg";
  label?: string;
}

const sizeMap = {
  sm: { ring: "h-10 w-10", text: "text-sm" },
  md: { ring: "h-14 w-14", text: "text-lg" },
  lg: { ring: "h-20 w-20", text: "text-2xl" },
} as const;

export function ScoreRing({ score, size = "md", label }: ScoreRingProps) {
  const clamped = Math.max(0, Math.min(10, score));
  const radius = 45;
  const circumference = 2 * Math.PI * radius;
  const progress = (clamped / 10) * circumference;
  const s = sizeMap[size];

  return (
    <div className="inline-flex flex-col items-center gap-1">
      <div className={`relative ${s.ring} flex items-center justify-center`}>
        <svg className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 100 100">
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth="6"
            className="text-slate-200"
          />
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth="6"
            strokeDasharray={`${progress} ${circumference - progress}`}
            strokeLinecap="round"
            className="text-emerald-600"
          />
        </svg>
        <span className={`relative font-bold ${s.text} text-slate-900`}>{clamped.toFixed(1)}</span>
      </div>
      {label && (
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          {label}
        </span>
      )}
    </div>
  );
}
