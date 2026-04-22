"use client";

import { useState, useRef, useCallback } from "react";
import Image from "next/image";
import { UploadCloudIcon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { fetchWithCsrf } from "@/lib/fetch-csrf";

interface ImageUploaderProps {
  value: string;
  onChange: (url: string) => void;
  label?: string;
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
  label = "Image",
  id: idProp,
}: ImageUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reactId = typeof idProp === "string" ? idProp : "image-uploader";
  const urlInputId = `${reactId}-url`;
  const dropZoneId = `${reactId}-drop`;

  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

  const uploadFile = useCallback(
    async (file: File) => {
      setError("");

      // Client-side file size validation
      if (file.size > MAX_FILE_SIZE) {
        setError(`File size (${(file.size / (1024 * 1024)).toFixed(1)}MB) exceeds the 10MB limit`);
        return;
      }

      setUploading(true);

      try {
        // 1. Get presigned URL from our API
        const res = await fetchWithCsrf("/api/admin/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName: file.name.replace(/[^a-zA-Z0-9._-]/g, "_"),
            contentType: file.type,
            fileSize: file.size,
          }),
        });

        if (!res.ok) {
          const data = await res.json();
          setError(data.error ?? "Failed to get upload URL");
          setUploading(false);
          return;
        }

        const { uploadUrl, publicUrl } = await res.json();

        // 2. Upload directly to R2
        const uploadRes = await fetch(uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type },
          body: file,
        });

        if (!uploadRes.ok) {
          setError("Failed to upload file to storage");
          setUploading(false);
          return;
        }

        // 3. Set the public URL
        onChange(publicUrl);
      } catch {
        setError("Upload failed. You can paste an image URL instead.");
      } finally {
        setUploading(false);
      }
    },
    [onChange, MAX_FILE_SIZE],
  );

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("image/")) {
      void uploadFile(file);
    } else {
      setError("Please drop an image file");
    }
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

      <Input
        id={urlInputId}
        type="url"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="https://example.com/image.jpg"
        aria-invalid={!!error || undefined}
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
