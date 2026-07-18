/**
 * GiftWorthinessScore — visual badge showing a product's gift-worthiness rating.
 * Renders a circular score (0–10) with color-coded tiers and an optional label.
 */

interface GiftWorthinessScoreProps {
  /** Score from 0 to 10 */
  score: number;
  /** Optional size variant */
  size?: "sm" | "md" | "lg";
  /** Show the "Gift-Worthiness" label below */
  showLabel?: boolean;
}

function getTier(score: number): { label: string; ringClass: string; badgeClass: string } {
  // Score ring + number use the site's accent color (via CSS var) for all
  // tiers, so the badge matches the site's brand instead of generic Tailwind
  // blue. The tier label badge keeps semantic colors to communicate quality.
  if (score >= 9)
    return {
      label: "Exceptional",
      ringClass: "text-emerald-600",
      badgeClass: "bg-emerald-50 border-emerald-200 text-emerald-700",
    };
  if (score >= 8)
    return {
      label: "Excellent",
      ringClass: "text-emerald-600",
      badgeClass: "bg-emerald-50 border-emerald-200 text-emerald-700",
    };
  if (score >= 7)
    return {
      label: "Great",
      ringClass: "text-amber-600",
      badgeClass: "bg-amber-50 border-amber-200 text-amber-700",
    };
  if (score >= 6)
    return {
      label: "Good",
      ringClass: "text-amber-600",
      badgeClass: "bg-amber-50 border-amber-200 text-amber-700",
    };
  return {
    label: "Average",
    ringClass: "text-gray-500",
    badgeClass: "bg-gray-50 border-gray-200 text-gray-600",
  };
}

const sizeMap = {
  sm: { ring: "h-10 w-10", text: "text-sm", label: "text-[10px]" },
  md: { ring: "h-14 w-14", text: "text-lg", label: "text-xs" },
  lg: { ring: "h-20 w-20", text: "text-2xl", label: "text-sm" },
} as const;

export function GiftWorthinessScore({
  score,
  size = "md",
  showLabel = true,
}: GiftWorthinessScoreProps) {
  const clamped = Math.max(0, Math.min(10, score));
  const tier = getTier(clamped);
  const s = sizeMap[size];

  // SVG circle for the score ring
  const radius = 45;
  const circumference = 2 * Math.PI * radius;
  const progress = (clamped / 10) * circumference;

  return (
    <div className="inline-flex flex-col items-center gap-1">
      <div className={`relative ${s.ring} flex items-center justify-center`}>
        {/* Background ring */}
        <svg className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 100 100">
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth="6"
            className="text-gray-200"
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
            className={tier.ringClass}
          />
        </svg>
        {/* Score number — uses site accent for brand consistency */}
        <span
          className={`relative font-bold ${s.text}`}
          style={{ color: "var(--color-accent-text, var(--color-accent))" }}
        >
          {clamped.toFixed(1)}
        </span>
      </div>
      {showLabel && (
        <div className="flex flex-col items-center">
          <span
            className={`rounded-full border px-2 py-0.5 font-medium ${s.label} ${tier.badgeClass}`}
          >
            {tier.label}
          </span>
          <span className={`mt-0.5 text-gray-500 ${s.label}`}>Gift-Worthiness</span>
        </div>
      )}
    </div>
  );
}
