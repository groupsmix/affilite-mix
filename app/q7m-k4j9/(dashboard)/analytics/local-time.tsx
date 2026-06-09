"use client";

/**
 * Client component that formats a timestamp using the browser's locale,
 * avoiding the server-side locale mismatch issue (3.11).
 */
export function LocalTime({ dateTime }: { dateTime: string }) {
  return (
    <time dateTime={dateTime}>
      {new Date(dateTime).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })}
    </time>
  );
}
