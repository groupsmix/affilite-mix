"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface ActiveNavLinksProps {
  nav: { title: string; href: string }[];
}

export function ActiveNavLinks({ nav }: ActiveNavLinksProps) {
  const pathname = usePathname();

  return (
    <>
      {nav.map((item) => {
        const isActive =
          item.href === "/"
            ? pathname === "/"
            : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={`text-sm font-medium transition-colors ${
              isActive
                ? "text-gray-900"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            {item.title}
          </Link>
        );
      })}
    </>
  );
}
