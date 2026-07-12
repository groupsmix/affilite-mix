"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fetchWithCsrf } from "@/lib/fetch-csrf";
import type { MediaRow } from "@/types/database";

interface MediaPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (url: string, alt: string) => void;
}

export function MediaPickerDialog({ open, onOpenChange, onSelect }: MediaPickerDialogProps) {
  const [media, setMedia] = useState<MediaRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<MediaRow | null>(null);

  useEffect(() => {
    if (!open) return;
    setSelected(null);
    setLoading(true);
    fetchWithCsrf("/api/admin/media?limit=50")
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to load media");
        const data = (await res.json()) as { media: MediaRow[] };
        setMedia(data.media);
      })
      .catch(() => setMedia([]))
      .finally(() => setLoading(false));
  }, [open]);

  function handleConfirm() {
    if (selected) {
      onSelect(selected.url, selected.alt_text ?? "");
    }
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Choose an image from the library</DialogTitle>
        </DialogHeader>

        {loading ? (
          <p className="text-muted-foreground">Loading media…</p>
        ) : media.length === 0 ? (
          <p className="text-muted-foreground">
            No images in the library yet. Upload one on the Media page.
          </p>
        ) : (
          <div className="grid max-h-[60vh] grid-cols-2 gap-3 overflow-y-auto p-1 sm:grid-cols-3">
            {media.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelected(item)}
                aria-pressed={selected?.id === item.id}
                className={`relative aspect-video overflow-hidden rounded-md border bg-muted text-left transition-colors ${
                  selected?.id === item.id
                    ? "ring-2 ring-primary ring-offset-2"
                    : "hover:border-primary"
                }`}
              >
                <Image
                  src={item.url}
                  alt={item.alt_text ?? item.filename ?? "Media"}
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 50vw, 200px"
                />
              </button>
            ))}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={!selected} onClick={handleConfirm}>
            Select image
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
