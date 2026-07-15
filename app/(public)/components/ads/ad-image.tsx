"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";

interface AdImageProps {
  placementId: string;
  imageUrl: string;
  clickUrl: string;
  alt: string;
  /** Localised "Ad" / "Sponsored" label shown for disclosure. */
  label: string;
}

/**
 * Renders a self-served image/banner ad and fires a one-shot impression
 * beacon. The click-through opens in a new tab and is marked
 * rel="sponsored nofollow" for FTC/SEO compliance.
 *
 * The impression beacon posts to /api/track/impression; middleware injects the
 * x-site-id header and the browser sets Origin, which that endpoint validates
 * (it is CSRF-exempt like /api/vitals). Failures are swallowed — telemetry
 * must never break the page.
 */
export function AdImage({ placementId, imageUrl, clickUrl, alt, label }: AdImageProps) {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    const pagePath = typeof window !== "undefined" ? window.location.pathname : "/";
    void fetch("/api/track/impression", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ad_placement_id: placementId, page_path: pagePath }),
      keepalive: true,
    }).catch(() => {
      // best-effort telemetry
    });
  }, [placementId]);

  return (
    <a
      href={clickUrl}
      target="_blank"
      rel="sponsored nofollow noopener noreferrer"
      className="relative block overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800"
      aria-label={alt || label}
    >
      <span className="absolute right-1 top-1 z-10 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white">
        {label}
      </span>
      <Image
        src={imageUrl}
        alt={alt}
        width={0}
        height={0}
        sizes="100vw"
        unoptimized
        className="h-auto w-full"
      />
    </a>
  );
}
