"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Silently revalidates the current page at a fixed interval.
 * Drop this component into any server-rendered page to get auto-refresh.
 */
export function AutoRefresh({ intervalMs = 60_000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    const id = setInterval(() => {
      router.refresh();
    }, intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs]);

  return null;
}
