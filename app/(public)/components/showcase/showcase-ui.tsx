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

    // Rendered visible by default (is-visible in SSR HTML) so no-JS clients
    // and failed hydrations always show content. Only hide below-the-fold
    // elements, after mount, so they can animate in on scroll.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!("IntersectionObserver" in window)) return;

    const rect = el.getBoundingClientRect();
    const inView = rect.top < window.innerHeight && rect.bottom > 0;
    if (inView) return;

    el.classList.remove("is-visible");
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
      className={cn("showcase-reveal is-visible", className)}
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
      className="w-full border-y border-border py-6 overflow-hidden"
      aria-hidden="true"
    >
      <div className="flex w-max showcase-animate-marquee">
        {row.map((item, i) => (
          <span
            key={`${item}-${i}`}
            className="showcase-serif italic text-2xl md:text-3xl text-muted-foreground/60 px-8 whitespace-nowrap"
          >
            {item}
            <span className="text-primary px-8">·</span>
          </span>
        ))}
      </div>
    </div>
  );
}
