"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { ConfirmDialog } from "./confirm-dialog";

interface StickySaveBarProps {
  /** Whether the form has unsaved changes. Controls bar visibility + indicator. */
  isDirty: boolean;
  /** Whether a save is currently in-flight. */
  saving?: boolean;
  /** Label for the primary save button. */
  saveLabel?: string;
  /** Label while saving is in-flight. */
  savingLabel?: string;
  /** Optional disabled override for the save button (e.g. invalid form). */
  disabled?: boolean;
  /**
   * Form id to submit when the save button is clicked. Pairs with `<form id=...>`
   * on the parent form so the bar can live outside the form DOM subtree.
   */
  formId: string;
  /** Called when the user confirms cancellation (after the dirty guard). */
  onCancel: () => void;
}

/**
 * Sticky bottom save bar used across admin forms. Shows an "unsaved changes"
 * indicator while dirty, offers a Cancel button that confirms when dirty, and a
 * Save button that submits the associated form.
 */
export function StickySaveBar({
  isDirty,
  saving = false,
  saveLabel = "Save",
  savingLabel = "Saving…",
  disabled = false,
  formId,
  onCancel,
}: StickySaveBarProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  function handleCancelClick() {
    if (isDirty) {
      setConfirmOpen(true);
    } else {
      onCancel();
    }
  }

  return (
    <>
      <div
        role="region"
        aria-label="Form actions"
        className={cn(
          "sticky bottom-0 z-40 -mx-4 mt-8 flex flex-col gap-3 border-t bg-background/95 px-4 py-3 shadow-[0_-4px_12px_-6px_rgba(0,0,0,0.08)] backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:-mx-6 sm:flex-row sm:items-center sm:justify-between sm:px-6",
        )}
      >
        <div
          className="text-sm text-muted-foreground"
          aria-live="polite"
          data-testid="sticky-save-bar-status"
        >
          {isDirty ? (
            <span className="flex items-center gap-2">
              <span aria-hidden="true" className="inline-block size-2 rounded-full bg-amber-500" />
              <span>You have unsaved changes.</span>
            </span>
          ) : (
            <span className="text-muted-foreground/70">All changes saved.</span>
          )}
        </div>
        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="outline" onClick={handleCancelClick} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form={formId} disabled={saving || disabled}>
            {saving ? savingLabel : saveLabel}
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Discard unsaved changes?"
        description="You have unsaved changes that will be lost if you leave this page."
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        destructive
        onConfirm={() => {
          setConfirmOpen(false);
          onCancel();
        }}
      />
    </>
  );
}

/**
 * Installs a Cmd/Ctrl+S shortcut that invokes `onSave` (and `preventDefault`s
 * the browser's save-page behaviour). No-op while `disabled` is true.
 */
export function useSaveShortcut(onSave: () => void, disabled = false) {
  useEffect(() => {
    if (disabled) return;
    const handler = (e: KeyboardEvent) => {
      const isMac = typeof navigator !== "undefined" && /mac/i.test(navigator.platform);
      const meta = isMac ? e.metaKey : e.ctrlKey;
      if (meta && (e.key === "s" || e.key === "S")) {
        e.preventDefault();
        onSave();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onSave, disabled]);
}
