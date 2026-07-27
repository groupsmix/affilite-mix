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
      className={cn("rounded-xl border border-border bg-card/80 p-5", className)}
    >
      <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
        {title}
      </p>
      <ol className="space-y-2 text-sm">
        {items.map((item) => (
          <li
            key={item.id}
            className={cn(
              "border-l-2 pl-3 leading-snug transition-colors",
              item.level === 3 && "pl-5",
              item.level && item.level >= 4 && "pl-7",
              activeId === item.id
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <a
              href={`#${item.id}`}
              className={cn("block transition-colors", activeId === item.id ? "font-medium" : "")}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const el = document.getElementById(item.id);
                if (el) {
                  const header = document.querySelector("header");
                  const offset = (header?.getBoundingClientRect().height ?? 80) + 16;
                  const top = el.getBoundingClientRect().top + window.scrollY - offset;
                  window.scrollTo({ top, behavior: "smooth" });
                  window.history.pushState(null, "", `#${item.id}`);

                  const details = e.currentTarget.closest("details");
                  if (details) details.open = false;
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
