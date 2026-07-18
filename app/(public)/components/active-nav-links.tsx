"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface ActiveNavLinksProps {
  nav: { title: string; href: string }[];
  /**
   * Class applied to every nav link. Defaults to the standard light-bg style.
   * Pass a full Tailwind string when using this inside a dark-bg header.
   */
  className?: string;
  /**
   * Class applied to the currently active nav link (overrides `className`).
   * Defaults to the standard active style.
   */
  activeClassName?: string;
  /**
   * Optional inline style applied to the active link only (e.g. accent bg).
   */
  activeStyle?: React.CSSProperties;
}

const DEFAULT_CLASS = "text-sm font-medium text-gray-600 transition-colors hover:text-gray-900";
const DEFAULT_ACTIVE_CLASS = "text-sm font-medium text-gray-900";

export function ActiveNavLinks({
  nav,
  className = DEFAULT_CLASS,
  activeClassName = DEFAULT_ACTIVE_CLASS,
  activeStyle,
}: ActiveNavLinksProps) {
  const pathname = usePathname();

  return (
    <>
      {nav.map((item) => {
        const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={isActive ? activeClassName : className}
            style={isActive ? activeStyle : undefined}
          >
            {item.title}
          </Link>
        );
      })}
    </>
  );
}
