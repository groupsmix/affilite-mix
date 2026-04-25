"use client";

import { useEffect, useRef, useState } from "react";
import { useCookieConsent } from "./cookie-consent";

interface AdSlotProps {
  id: string;
  width?: number | string;
  height?: number | string;
  className?: string;
}

export default function AdSlot({
  id,
  width = "100%",
  height = "auto",
  className = "",
}: AdSlotProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hasFired, setHasFired] = useState(false);
  const { accepted } = useCookieConsent();

  useEffect(() => {
    // Only track impression if the user has consented to analytics/advertising cookies
    if (hasFired || !accepted) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting && !hasFired) {
          setHasFired(true);
          // Fire impression tracking event
          fetch("/api/track/impression", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ ad_placement_id: id, page_path: window.location.pathname }),
            // Use keepalive so the request finishes even if the user navigates away
            keepalive: true,
          }).catch((err) => {
            console.error("Failed to track ad impression", err);
          });
        }
      },
      { threshold: 0.5 }, // Trigger when 50% of the ad is visible
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => {
      observer.disconnect();
    };
  }, [id, hasFired, accepted]);

  return (
    <div
      ref={containerRef}
      id={id}
      className={`ad-slot bg-gray-50 flex items-center justify-center text-gray-400 text-sm border border-dashed border-gray-200 ${className}`}
      style={{ width, height, minHeight: typeof height === "number" ? height : "100px" }}
    >
      {/* Ad script or iframe would go here */}
      <span className="sr-only">Advertisement</span>
      <div className="text-center opacity-50">
        <p>Ad Slot</p>
        <p className="text-xs">{id}</p>
      </div>
    </div>
  );
}
