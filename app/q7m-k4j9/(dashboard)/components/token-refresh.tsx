"use client";

import { useEffect, useRef, useCallback } from "react";
import { fetchWithCsrf } from "@/lib/fetch-csrf";

/** Refresh interval: 30 minutes in ms */
const REFRESH_INTERVAL_MS = 30 * 60 * 1000;

async function doRefresh() {
  try {
    const res = await fetchWithCsrf("/api/auth/refresh", { method: "POST" });
    // Issue 5: surface auth failures so the admin is not silently left with
    // an expired session. A 401/403 means the session is gone — redirect to
    // the login page. Any other non-2xx (network-level, 5xx, 429) is
    // treated as transient and silently ignored so the next scheduled
    // interval can retry.
    if (res.status === 401 || res.status === 403) {
      // A2: the most common cause of a mid-session refresh 401 is the UA/IP
      // binding check failing after a network change (mobile/CGNAT handoff),
      // not a real logout. Pass a reason so the login page can explain it
      // instead of showing a bare login form.
      window.location.href = "/q7m-k4j9/login?reason=network_change";
    }
    // 2xx: success — cookie silently renewed, nothing to do.
    // Other non-2xx (5xx, 429, etc.): transient — fall through silently.
  } catch {
    // Network error or rejected promise — transient, retry on next interval.
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
