"use client";

import { useState, useEffect } from "react";

export function ReadingProgress() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let rafId = 0;
    function handleScroll() {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const docHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;
        if (docHeight <= 0) return;
        const scrolled = Math.min(100, (window.scrollY / docHeight) * 100);
        setProgress(scrolled);
      });
    }
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  if (progress <= 0) return null;

  return (
    <div className="fixed left-0 top-0 z-50 h-0.5 w-full bg-gray-200">
      <div
        className="h-full transition-[width] duration-150"
        style={{ backgroundColor: "var(--color-accent, #10B981)", width: `${progress}%` }}
      />
    </div>
  );
}
