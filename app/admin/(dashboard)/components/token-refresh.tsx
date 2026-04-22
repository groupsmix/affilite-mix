"use client";

import { useEffect, useRef, useCallback } from "react";
import { fetchWithCsrf } from "@/lib/fetch-csrf";

/** Refresh interval: 30 minutes in ms */
const REFRESH_INTERVAL_MS = 30 * 60 * 1000;

async function doRefresh() {
  try {
    await fetchWithCsrf("/api/auth/refresh", { method: "POST" });
  } catch {
    // Silently ignore refresh failures — user will be redirected on next
    // server action if the token truly expired.
  }
}

/**
 * Invisible client component that periodically refreshes the admin JWT
 * to prevent silent logout during long editing sessions.
 *
 * Pauses the refresh timer when the browser tab is hidden to avoid
 * unnecessary network requests from background tabs. When the tab
 * becomes visible again, it immediately refreshes (in case the token
 * expired while hidden) and restarts the periodic timer.
 */
export function TokenRefresh() {
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      void doRefresh();
    }, REFRESH_INTERVAL_MS);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    // Start the refresh timer immediately
    startTimer();

    function handleVisibilityChange() {
      if (document.visibilityState === "hidden") {
        // Tab went to background — stop refreshing
        stopTimer();
      } else {
        // Tab came back — refresh immediately then restart timer
        void doRefresh();
        startTimer();
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      stopTimer();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [startTimer, stopTimer]);

  return null;
}
