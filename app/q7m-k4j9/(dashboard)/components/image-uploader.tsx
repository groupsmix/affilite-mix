"use client";

import { useState, useRef, useCallback } from "react";
import Image from "next/image";
import { UploadCloudIcon, XIcon, ImageIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { fetchWithCsrf } from "@/lib/fetch-csrf";

import { MediaPickerDialog } from "./media-picker-dialog";

interface ImageUploaderProps {
  value: string;
  onChange: (url: string) => void;
  /** Called when a file is successfully uploaded to storage. */
  onUpload?: (url: string) => void;
  /** Called when a file is selected from the media library. Receives the URL and alt text. */
  onMediaSelect?: (url: string, alt: string) => void;
  label?: string;
  /** Placeholder for the URL input. */
  placeholder?: string;
  /** Show a button to pick an existing image from the media library. */
  showMediaPicker?: boolean;
  /** DOM id for the visible input, used to pair the Label via htmlFor. */
  id?: string;
}

/**
 * Image uploader with drag-and-drop support.
 * Uploads to R2 via presigned URL when R2 is configured,
 * otherwise falls back to manual URL entry.
 */
export function ImageUploader({
  value,
  onChange,
  onUpload,
  onMediaSelect,
  label = "Image",
  placeholder = "https://example.com/image.jpg",
  showMediaPicker = true,
  id: idProp,
}: ImageUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reactId = typeof idProp === "string" ? idProp : "image-uploader";
  const urlInputId = `${reactId}-url`;
  const dropZoneId = `${reactId}-drop`;

  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

  // Bound every network leg so a mis-/unconfigured R2 endpoint can no
  // longer hang the uploader forever. A stalled cross-origin PUT to R2
  // (e.g. missing bucket CORS or a wrong endpoint host) has no browser
  // timeout by default, which is what leaves the "Uploading…" spinner
  // spinning indefinitely. Abort and surface a real error instead.
  const PRESIGN_TIMEOUT_MS = 20_000;
  const UPLOAD_TIMEOUT_MS = 60_000;
  const FINALIZE_TIMEOUT_MS = 30_000;

  const uploadFile = useCallback(
    async (file: File) => {
      setError("");

      // Reject empty/0-byte files before the round-trip. The server signs
      // Content-Length and requires a positive size, so a 0-byte file would
      // otherwise fail with a cryptic "fileSize must be a positive integer".
      // The usual culprit is a cloud placeholder (OneDrive/iCloud "online-only"
      // file not yet downloaded locally) or an empty/corrupt file.
      if (!Number.isFinite(file.size) || file.size <= 0) {
        setError(
          "That file is empty (0 bytes). If it's stored in the cloud (OneDrive/iCloud), open it once so it downloads to this device, then upload again — or choose a different image.",
        );
        return;
      }

      // Client-side file size validation
      if (file.size > MAX_FILE_SIZE) {
        setError(`File size (${(file.size / (1024 * 1024)).toFixed(1)}MB) exceeds the 10MB limit`);
        return;
      }

      setUploading(true);

      const withTimeout = (ms: number): { signal: AbortSignal; done: () => void } => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), ms);
        return { signal: controller.signal, done: () => clearTimeout(timer) };
      };

      try {
        // 1. Ask the server for a presigned URL targeting the private
        //    staging bucket. The server returns the exact headers we
        //    must echo on the PUT — Content-Length is signed so we can
        //    no longer lie about the upload size.
        const presignTimeout = withTimeout(PRESIGN_TIMEOUT_MS);
        let presignRes: Response;
        try {
          presignRes = await fetchWithCsrf("/api/admin/upload", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              fileName: file.name,
              contentType: file.type,
              fileSize: file.size,
            }),
            signal: presignTimeout.signal,
          });
        } finally {
          presignTimeout.done();
        }

        if (!presignRes.ok) {
          const data = await presignRes.json().catch(() => ({}));
          setError(data.error ?? "Failed to get upload URL");
          setUploading(false);
          return;
        }

        const presigned = (await presignRes.json()) as {
          uploadUrl: string;
          stagingKey: string;
          publicUrl: string;
          requiredHeaders: Record<string, string>;
        };

        // 2. PUT to R2 with the exact headers the server signed.
        const uploadTimeout = withTimeout(UPLOAD_TIMEOUT_MS);
        let uploadRes: Response;
        try {
          uploadRes = await fetch(presigned.uploadUrl, {
            method: "PUT",
            headers: presigned.requiredHeaders,
            body: file,
            signal: uploadTimeout.signal,
          });
        } finally {
          uploadTimeout.done();
        }

        if (!uploadRes.ok) {
          setError("Failed to upload file to storage");
          setUploading(false);
          return;
        }

        // 3. Ask the server to magic-byte validate and promote the
        //    upload to the public bucket. Only after this succeeds is
        //    publicUrl actually reachable.
        const finalizeTimeout = withTimeout(FINALIZE_TIMEOUT_MS);
        let finalizeRes: Response;
        try {
          finalizeRes = await fetchWithCsrf("/api/admin/upload/finalize", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              stagingKey: presigned.stagingKey,
              expectedType: file.type,
              fileName: file.name,
            }),
            signal: finalizeTimeout.signal,
          });
        } finally {
          finalizeTimeout.done();
        }

        if (!finalizeRes.ok) {
          const data = await finalizeRes.json().catch(() => ({}));
          setError(data.error ?? "Validation failed");
          setUploading(false);
          return;
        }

        const finalized = (await finalizeRes.json()) as { publicUrl: string };
        onChange(finalized.publicUrl);
        onUpload?.(finalized.publicUrl);
      } catch (err) {
        // fail-open: best-effort. An AbortError means one of the legs hit
        // its timeout (most likely a stalled R2 PUT) — say so explicitly
        // rather than leaving the spinner running.
        if (err instanceof DOMException && err.name === "AbortError") {
          setError(
            "Upload timed out. Check that image storage (R2) is configured and reachable, or paste an image URL instead.",
          );
        } else {
          setError("Upload failed. You can paste an image URL instead.");
        }
      } finally {
        setUploading(false);
      }
    },
    [onChange, onUpload, MAX_FILE_SIZE, PRESIGN_TIMEOUT_MS, UPLOAD_TIMEOUT_MS, FINALIZE_TIMEOUT_MS],
  );

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("image/")) {
      void uploadFile(file);
      return;
    }
    // Dragging an image straight from another web page yields a URL, not a
    // File. Accept it as a pasted image URL instead of failing.
    const dropped = e.dataTransfer.getData("text/uri-list") || e.dataTransfer.getData("text/plain");
    const url = dropped.trim();
    if (/^https?:\/\/\S+$/i.test(url)) {
      setError("");
      onChange(url);
      return;
    }
    setError("Please drop an image file (or paste an image URL in the field above)");
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      void uploadFile(file);
    }
    // Reset so the same file can be re-selected after clearing.
    e.target.value = "";
  }

  function handleClear() {
    onChange("");
    setError("");
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={urlInputId}>{label}</Label>

      <div className="flex items-center gap-2">
        <Input
          id={urlInputId}
          type="url"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          aria-invalid={!!error || undefined}
        />
        {showMediaPicker && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPickerOpen(true)}
            className="shrink-0 gap-1.5"
          >
            <ImageIcon className="size-4" />
            <span className="hidden sm:inline">Library</span>
          </Button>
        )}
      </div>

      <MediaPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onSelect={(url, alt) => {
          onChange(url);
          onMediaSelect?.(url, alt);
        }}
      />

      <div
        id={dropZoneId}
        role="button"
        tabIndex={0}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            fileInputRef.current?.click();
          }
        }}
        aria-label="Upload image by clicking or dragging a file here"
        aria-busy={uploading || undefined}
        className={cn(
          "flex cursor-pointer items-center justify-center rounded-md border border-dashed border-input bg-muted/30 px-4 py-6 text-center transition-colors",
          "hover:border-ring hover:bg-muted/60",
          "focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
          dragOver && "border-ring bg-accent text-accent-foreground",
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileSelect}
          className="hidden"
          aria-hidden="true"
          tabIndex={-1}
        />
        <div className="flex flex-col items-center gap-1.5 text-sm text-muted-foreground">
          <UploadCloudIcon className="size-5" aria-hidden="true" />
          <span>{uploading ? "Uploading…" : "Drop image here or click to browse"}</span>
          <span className="text-xs text-muted-foreground/80">PNG, JPG, WebP up to 10 MB</span>
        </div>
      </div>

      {error && (
        <p role="alert" className="text-destructive text-sm mt-1">
          {error}
        </p>
      )}

      {value && (
        <div className="relative mt-1 overflow-hidden rounded-md border bg-muted/20">
          <div className="relative h-40 w-full">
            <Image
              src={value}
              alt="Preview"
              fill
              className="object-contain"
              sizes="(max-width: 768px) 100vw, 672px"
            />
          </div>
          <Button
            type="button"
            size="icon-sm"
            variant="secondary"
            onClick={handleClear}
            aria-label="Remove image"
            className="absolute right-2 top-2 shadow-sm"
          >
            <XIcon aria-hidden="true" />
          </Button>
        </div>
      )}
    </div>
  );
}
