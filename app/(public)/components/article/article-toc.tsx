"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export interface TocItem {
  id: string;
  label: string;
  level?: number;
}

interface ArticleTocProps {
  items: TocItem[];
  title?: string;
  className?: string;
}

export function ArticleToc({ items, title = "Contents", className }: ArticleTocProps) {
  const [activeId, setActiveId] = useState<string>("");

  useEffect(() => {
    if (items.length === 0 || typeof window === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]) {
          setActiveId(visible[0].target.id);
        }
      },
      { rootMargin: "-15% 0px -60% 0px", threshold: [0, 0.25, 0.5, 0.75, 1] },
    );

    for (const item of items) {
      const el = document.getElementById(item.id);
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, [items]);

  if (items.length === 0) return null;

  return (
    <nav
      aria-label="Table of contents"
      className={cn("rounded-xl border border-border bg-card/60 p-5", className)}
    >
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </p>
      <ol className="mt-3 space-y-2 text-sm">
        {items.map((item) => (
          <li
            key={item.id}
            className={cn(
              "leading-snug",
              item.level === 3 && "pl-3",
              item.level && item.level >= 4 && "pl-6",
            )}
          >
            <a
              href={`#${item.id}`}
              className={cn(
                "block transition-colors hover:text-primary",
                activeId === item.id ? "font-medium text-primary" : "text-muted-foreground",
              )}
              onClick={(e) => {
                e.preventDefault();
                const el = document.getElementById(item.id);
                if (el) {
                  el.scrollIntoView({ behavior: "smooth", block: "start" });
                  window.history.pushState(null, "", `#${item.id}`);
                }
              }}
            >
              {item.label}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
