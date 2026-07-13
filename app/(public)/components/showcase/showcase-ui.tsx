"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/*  ScrollReveal — IntersectionObserver-driven fade/slide-in           */
/* ------------------------------------------------------------------ */

interface ScrollRevealProps {
  children: ReactNode;
  className?: string;
  delay?: number;
}

export function ScrollReveal({ children, className, delay = 0 }: ScrollRevealProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            el.classList.add("is-visible");
            observer.unobserve(el);
          }
        });
      },
      { threshold: 0.15 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={cn("showcase-reveal", className)}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Marquee — infinitely scrolling category strip                      */
/* ------------------------------------------------------------------ */

export function Marquee({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  const row = [...items, ...items];

  return (
    <div
      id="categories"
      className="w-full overflow-hidden border-y border-border py-6"
      aria-hidden="true"
    >
      <div className="flex w-max showcase-animate-marquee">
        {row.map((item, i) => (
          <span
            key={`${item}-${i}`}
            className="font-heading text-2xl italic whitespace-nowrap px-8 text-muted-foreground/60 md:text-3xl"
          >
            {item}
            <span className="px-8 text-accent">·</span>
          </span>
        ))}
      </div>
    </div>
  );
}
