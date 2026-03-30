"use client";

import { useState, useEffect, useRef } from "react";

export function ReadingProgress() {
  const [progress, setProgress] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    function handleScroll() {
      if (rafRef.current !== null) return;
      rafRef.current = requestAnimationFrame(() => {
        const docHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;
        if (docHeight > 0) {
          const scrolled = Math.min(100, (window.scrollY / docHeight) * 100);
          setProgress(scrolled);
        }
        rafRef.current = null;
      });
    }
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  if (progress <= 0) return null;

  const rounded = Math.round(progress);

  return (
    <div
      className="fixed left-0 top-0 z-50 h-0.5 w-full bg-gray-200"
      role="progressbar"
      aria-valuenow={rounded}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Reading progress"
    >
      <div
        className="h-full transition-[width] duration-150"
        style={{ backgroundColor: "var(--color-accent, #10B981)", width: `${progress}%` }}
      />
    </div>
  );
}
