import { Star } from "lucide-react";

interface StarRatingProps {
  score: number;
  outOf?: number;
  size?: "sm" | "md";
}

export function StarRating({ score, outOf = 5, size = "sm" }: StarRatingProps) {
  const clamped = Math.max(0, Math.min(outOf, score));
  const fullStars = Math.floor(clamped);
  const partial = clamped - fullStars;
  const emptyStars = outOf - fullStars - (partial > 0 ? 1 : 0);

  const starClass = size === "sm" ? "size-3.5" : "size-4";

  return (
    <span
      className="inline-flex items-center"
      aria-label={`${score.toFixed(1)} out of ${outOf} stars`}
    >
      {Array.from({ length: fullStars }).map((_, i) => (
        <Star
          key={`full-${i}`}
          className={`${starClass} fill-emerald-500 text-emerald-500`}
          aria-hidden="true"
        />
      ))}
      {partial > 0 && (
        <span className="relative inline-flex" aria-hidden="true">
          <Star className={`${starClass} text-slate-200`} />
          <span className="absolute overflow-hidden" style={{ width: `${partial * 100}%` }}>
            <Star className={`${starClass} fill-emerald-500 text-emerald-500`} />
          </span>
        </span>
      )}
      {Array.from({ length: emptyStars }).map((_, i) => (
        <Star key={`empty-${i}`} className={`${starClass} text-slate-200`} aria-hidden="true" />
      ))}
    </span>
  );
}
