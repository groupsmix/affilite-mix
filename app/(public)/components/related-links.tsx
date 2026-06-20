import Link from "next/link";
import type { RelatedLinkGroup } from "@/lib/internal-links";

interface RelatedLinksProps {
  groups: RelatedLinkGroup[];
  language?: string;
}

/**
 * CA-306: Automated contextual internal-link block.
 *
 * Renders the groups produced by `buildRelatedLinks` as titled lists of
 * same-origin links. Server-rendered with plain `<Link>`s so the links are in
 * the initial HTML (crawlable) with zero client JS. Returns null when there is
 * nothing to show, so callers can render it unconditionally.
 */
export function RelatedLinks({ groups, language = "en" }: RelatedLinksProps) {
  if (!groups.length) return null;
  const isAr = language === "ar";

  return (
    <nav
      aria-label={isAr ? "روابط ذات صلة" : "Related links"}
      className="mt-10 border-t border-gray-200 pt-8"
    >
      <h2 className="mb-6 text-2xl font-bold">{isAr ? "استكشف المزيد" : "Explore more"}</h2>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {groups.map((group) => (
          <section key={group.title}>
            <h3 className="mb-2 font-mono text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
              {group.title}
            </h3>
            <ul className="space-y-1.5">
              {group.links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm leading-snug text-gray-700 hover:underline"
                    style={{ textDecorationColor: "var(--color-accent, #2D6BF0)" }}
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </nav>
  );
}
