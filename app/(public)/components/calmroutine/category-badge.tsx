import { calmCategoryBadge, type CalmCategorySlug } from "@/lib/calmroutine";

export function CalmCategoryBadge({ category }: { category: CalmCategorySlug }) {
  const badge = calmCategoryBadge[category];
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium tracking-wide ${badge.bg} ${badge.text}`}
    >
      {badge.label}
    </span>
  );
}
