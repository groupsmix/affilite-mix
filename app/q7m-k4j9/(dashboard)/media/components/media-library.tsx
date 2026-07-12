"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { CopyIcon, TrashIcon, ImageIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchWithCsrf } from "@/lib/fetch-csrf";
import { toast } from "sonner";

import type { MediaRow } from "@/types/database";

interface MediaLibraryProps {
  media: MediaRow[];
}

function formatBytes(bytes: number | null): string {
  if (bytes === null || bytes === undefined) return "—";
  if (bytes === 0) return "0 B";
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i] ?? ""}`;
}

function MediaCard({ item }: { item: MediaRow }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(item.url);
      toast.success("URL copied to clipboard");
    } catch {
      toast.error("Could not copy URL");
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete ${item.filename || "this image"} from the media library?`)) return;
    setDeleting(true);
    try {
      const res = await fetchWithCsrf(`/api/admin/media?id=${item.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      toast.success("Image deleted");
      router.refresh();
    } catch {
      toast.error("Failed to delete image");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="group flex flex-col gap-2 rounded-lg border bg-background p-2">
      <div className="relative aspect-video w-full overflow-hidden rounded-md bg-muted">
        {item.url ? (
          <Image
            src={item.url}
            alt={item.alt_text || item.filename || "Media"}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            <ImageIcon className="size-8" />
          </div>
        )}
      </div>
      <div className="min-w-0 px-1">
        <p className="truncate text-sm font-medium">{item.filename || item.public_key}</p>
        <p className="text-xs text-muted-foreground">
          {item.content_type ?? "—"} · {formatBytes(item.size_bytes)}
        </p>
      </div>
      <div className="mt-auto flex items-center gap-2 px-1">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="flex-1"
          onClick={() => void handleCopy()}
        >
          <CopyIcon className="size-4" />
          <span className="sr-only">Copy URL</span>
        </Button>
        <Button
          type="button"
          size="sm"
          variant="destructive"
          disabled={deleting}
          onClick={() => void handleDelete()}
        >
          <TrashIcon className="size-4" />
          <span className="sr-only">Delete</span>
        </Button>
      </div>
    </div>
  );
}

export function MediaLibrary({ media }: MediaLibraryProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Library</CardTitle>
      </CardHeader>
      <CardContent>
        {media.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No images yet. Upload one above to get started.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {media.map((item) => (
              <MediaCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
