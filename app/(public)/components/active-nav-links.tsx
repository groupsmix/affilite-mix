"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { ChevronDown } from "lucide-react";
import type { NavItem } from "@/config/site-definition";

interface ActiveNavLinksProps {
  nav: NavItem[];
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

function isPathActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function ActiveNavLinks({
  nav,
  className = DEFAULT_CLASS,
  activeClassName = DEFAULT_ACTIVE_CLASS,
  activeStyle,
}: ActiveNavLinksProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="flex items-center gap-1">
      {nav.map((item) => {
        const hasChildren = item.children && item.children.length > 0;
        const childActive = hasChildren
          ? item.children!.some((child) => isPathActive(pathname, child.href))
          : false;
        const itemActive = isPathActive(pathname, item.href);
        const isActive = itemActive || childActive;
        const isOpen = open === item.href;

        if (hasChildren) {
          return (
            <div key={item.href} className="relative">
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : item.href)}
                aria-haspopup="menu"
                aria-expanded={isOpen}
                className={isActive ? activeClassName : className}
                style={isActive ? activeStyle : undefined}
              >
                {item.title}
                <ChevronDown
                  className={`ml-1 inline-block size-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
                  aria-hidden="true"
                />
              </button>
              {isOpen && (
                <div className="absolute top-full left-0 z-50 mt-1 min-w-[12rem] rounded-lg border border-gray-200 bg-white p-1 shadow-lg">
                  {item.children!.map((child) => {
                    const childActive = isPathActive(pathname, child.href);
                    return (
                      <Link
                        key={child.href}
                        href={child.href}
                        className={`block rounded-md px-3 py-2 text-sm ${
                          childActive
                            ? "bg-gray-50 font-medium text-gray-900"
                            : "text-gray-700 hover:bg-gray-50 hover:text-gray-900"
                        }`}
                        onClick={() => setOpen(null)}
                      >
                        {child.title}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        }

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
    </div>
  );
}
