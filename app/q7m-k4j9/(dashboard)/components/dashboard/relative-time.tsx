// Card composition patterns adapted from https://github.com/Qualiora/shadboard (MIT).
"use client";

import { useEffect, useState } from "react";

/**
 * Accessible countdown label that renders a stable absolute timestamp for the
 * first server-rendered paint (no hydration mismatch) and then ticks once a
 * minute on the client with a "in X minutes/hours/days" relative string.
 */
export function RelativeTime({ iso, absoluteFallback }: { iso: string; absoluteFallback: string }) {
  const [label, setLabel] = useState<string>(absoluteFallback);

  useEffect(() => {
    const target = new Date(iso).getTime();
    const update = () => {
      const diffMs = target - Date.now();
      setLabel(formatRelative(diffMs));
    };
    update();
    const id = setInterval(update, 60_000);
    return () => clearInterval(id);
  }, [iso]);

  return (
    <time dateTime={iso} title={absoluteFallback}>
      {label}
    </time>
  );
}

function formatRelative(diffMs: number): string {
  const abs = Math.abs(diffMs);
  const past = diffMs < 0;
  const minutes = Math.round(abs / 60_000);

  if (minutes < 1) return past ? "just now" : "in <1 min";
  if (minutes < 60) return past ? `${minutes}m ago` : `in ${minutes}m`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return past ? `${hours}h ago` : `in ${hours}h`;

  const days = Math.round(hours / 24);
  if (days < 14) return past ? `${days}d ago` : `in ${days}d`;

  const weeks = Math.round(days / 7);
  return past ? `${weeks}w ago` : `in ${weeks}w`;
}
