"use client";

import { useEffect } from "react";
import { reportError } from "@/lib/report-error";

/**
 * Root-level error boundary — catches errors that escape the root layout
 * itself (e.g. getCurrentSite() failure on an unknown domain). Without
 * this file, Next.js renders its default unbranded error page.
 *
 * global-error.tsx must render its own <html> and <body> because the
 * root layout is NOT rendered when this boundary activates.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // audit5-#18: `reportError` may itself throw (e.g. the Sentry browser
    // SDK transport is blocked by an extension, the network is offline,
    // or `window.fetch` is patched in a way that rejects). The previous
    // revision called `reportError(error, ...)` bare, which swallowed
    // any such failure because `useEffect` discards return values and
    // unhandled rejections from a synchronous call site stay un-routed.
    // We now wrap the call so a reporter failure cannot also kill the
    // error-boundary render — at minimum the user still sees the
    // fallback UI, and the meta-failure lands in `console.error`.
    try {
      const result: unknown = reportError(error, { boundary: "global", digest: error.digest });
      if (
        result &&
        typeof result === "object" &&
        "catch" in result &&
        typeof (result as { catch: unknown }).catch === "function"
      ) {
        (result as Promise<unknown>).catch((reportingErr: unknown) => {
          console.error("[global-error] reportError rejected:", reportingErr);
        });
      }
    } catch (reportingErr: unknown) {
      console.error("[global-error] reportError threw:", reportingErr);
    }
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
          backgroundColor: "#f9fafb",
          color: "#111827",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "100vh",
            padding: "1rem",
            textAlign: "center",
          }}
        >
          <div
            style={{
              maxWidth: "28rem",
            }}
          >
            <div
              style={{
                width: "4rem",
                height: "4rem",
                margin: "0 auto 1.5rem",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "50%",
                backgroundColor: "#fee2e2",
              }}
            >
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#ef4444"
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
              </svg>
            </div>

            <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.5rem" }}>
              Something went wrong
            </h1>
            <p style={{ fontSize: "0.875rem", color: "#6b7280", marginBottom: "2rem" }}>
              {process.env.NODE_ENV === "development"
                ? error.message || "An unexpected error occurred."
                : "We\u2019re sorry for the inconvenience. Please try again."}
            </p>

            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center" }}>
              <button
                onClick={reset}
                style={{
                  padding: "0.625rem 1.25rem",
                  fontSize: "0.875rem",
                  fontWeight: 500,
                  color: "#fff",
                  backgroundColor: "#111827",
                  border: "none",
                  borderRadius: "0.5rem",
                  cursor: "pointer",
                }}
              >
                Try again
              </button>
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- global-error renders outside root layout; next/link is unavailable */}
              <a
                href="/"
                style={{
                  padding: "0.625rem 1.25rem",
                  fontSize: "0.875rem",
                  fontWeight: 500,
                  color: "#374151",
                  backgroundColor: "transparent",
                  border: "1px solid #d1d5db",
                  borderRadius: "0.5rem",
                  textDecoration: "none",
                  cursor: "pointer",
                }}
              >
                Go to Homepage
              </a>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
