"use client";

import { useEffect, useMemo } from "react";

/**
 * Snapshot-based dirty tracking for admin forms.
 *
 * Compares `current` against `savedState` (JSON equality) and installs a
 * `beforeunload` guard while dirty so the user is warned about unsaved changes
 * when closing or reloading the tab.
 *
 * After a successful save, callers should replace `savedState` with a snapshot
 * of the new persisted value so the form is no longer considered dirty.
 */
export function useDirtyTracking<T>(current: T, savedState: T): boolean {
  const isDirty = useMemo(
    () => JSON.stringify(current) !== JSON.stringify(savedState),
    [current, savedState],
  );

  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  return isDirty;
}
