"use client";

import { useEffect } from "react";
import { fetchWithCsrf } from "@/lib/fetch-csrf";

/** Refresh interval: 30 minutes in ms */
const REFRESH_INTERVAL_MS = 30 * 60 * 1000;

/**
 * Invisible client component that periodically refreshes the admin JWT
 * to prevent silent logout during long editing sessions (3.25).
 */
export function TokenRefresh() {
  useEffect(() => {
    const timer = setInterval(async () => {
      try {
        await fetchWithCsrf("/api/auth/refresh", { method: "POST" });
      } catch {
        // Silently ignore refresh failures — user will be redirected on next
        // server action if the token truly expired.
      }
    }, REFRESH_INTERVAL_MS);

    return () => clearInterval(timer);
  }, []);

  return null;
}
