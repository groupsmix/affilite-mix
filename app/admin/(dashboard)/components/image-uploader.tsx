"use client";

import { useState, useRef, useCallback } from "react";
import Image from "next/image";
import { fetchWithCsrf } from "@/lib/fetch-csrf";

interface ImageUploaderProps {
  value: string;
  onChange: (url: string) => void;
  label?: string;
}

/**
 * Image uploader with drag-and-drop support.
 * Uploads to R2 via presigned URL when R2 is configured,
 * otherwise falls back to manual URL entry.
 */
export function ImageUploader({ value, onChange, label = "Image" }: ImageUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      uploadFile(file);
    } else {
      setError("Please drop an image file");
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      uploadFile(file);
    }
  }

  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700">{label}</label>

      {/* URL input */}
      <input
        type="url"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="https://example.com/image.jpg"
        className="mb-2 w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />

      {/* Drop zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`flex cursor-pointer items-center justify-center rounded-lg border-2 border-dashed p-4 text-center transition-colors ${
          dragOver
            ? "border-blue-400 bg-blue-50"
            : "border-gray-300 bg-gray-50 hover:border-gray-400"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileSelect}
          className="hidden"
        />
        {uploading ? (
          <span className="text-sm text-gray-500">Uploading...</span>
        ) : (
          <span className="text-sm text-gray-500">Drop image here or click to browse</span>
        )}
      </div>

      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}

      {/* Preview */}
      {value && (
        <div className="relative mt-2 h-32 overflow-hidden rounded-md border border-gray-200">
          <Image
            src={value}
            alt="Preview"
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 672px"
          />
        </div>
      )}
    </div>
  );
}
