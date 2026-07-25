import { type CalmCategorySlug } from "@/lib/calmroutine";
import { type CalmSiteConfig } from "@/lib/calm-config";

export function CalmCategoryBadge({
  category,
  badge,
}: {
  category: CalmCategorySlug;
  badge: CalmSiteConfig["categoryBadge"][CalmCategorySlug];
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium tracking-wide ${badge.bg} ${badge.text}`}
    >
      {badge.label}
    </span>
  );
}
