"use client";

import { useState, useEffect } from "react";
import type { ProductRow } from "@/types/database";

interface StickyCtaBarProps {
  product: ProductRow;
}

export function StickyCtaBar({ product }: StickyCtaBarProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    function handleScroll() {
      // Show sticky bar after scrolling 400px
      setVisible(window.scrollY > 400);
    }
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  if (!visible) return null;

  const destination = Buffer.from(product.affiliate_url).toString("base64");
  const trackUrl = `/api/track/click?p=${encodeURIComponent(product.slug)}&d=${encodeURIComponent(destination)}&t=sticky`;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-gray-200 bg-white/95 px-4 py-3 shadow-lg backdrop-blur transition-transform">
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-gray-900">{product.name}</p>
          <div className="flex items-center gap-2 text-sm">
            {product.price && (
              <span className="font-bold text-emerald-600">{product.price}</span>
            )}
            {product.score !== null && (
              <span className="text-amber-700">{product.score}/10</span>
            )}
          </div>
        </div>
        <a
          href={trackUrl}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="shrink-0 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-emerald-700"
        >
          {product.cta_text || "Get Best Deal"}
        </a>
      </div>
    </div>
  );
}
