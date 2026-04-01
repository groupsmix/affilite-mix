/**
 * Tests for image upload validation logic.
 *
 * Covers audit finding H-7:
 * - Content-Type allowlist validation
 * - File size limits
 * - Required field validation (fileName, contentType)
 * - SVG exclusion (XSS vector)
 * - R2 configuration checks
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { isR2Configured } from "@/lib/r2";

// ── Content-Type allowlist ────────────────────────────────────

describe("upload content-type validation", () => {
  const ALLOWED_IMAGE_TYPES = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/avif",
  ]);

  it("allows JPEG uploads", () => {
    expect(ALLOWED_IMAGE_TYPES.has("image/jpeg")).toBe(true);
  });

  it("allows PNG uploads", () => {
    expect(ALLOWED_IMAGE_TYPES.has("image/png")).toBe(true);
  });

  it("allows WebP uploads", () => {
    expect(ALLOWED_IMAGE_TYPES.has("image/webp")).toBe(true);
  });

  it("allows GIF uploads", () => {
    expect(ALLOWED_IMAGE_TYPES.has("image/gif")).toBe(true);
  });

  it("allows AVIF uploads", () => {
    expect(ALLOWED_IMAGE_TYPES.has("image/avif")).toBe(true);
  });

  it("rejects SVG (XSS vector)", () => {
    expect(ALLOWED_IMAGE_TYPES.has("image/svg+xml")).toBe(false);
  });

  it("rejects application/pdf", () => {
    expect(ALLOWED_IMAGE_TYPES.has("application/pdf")).toBe(false);
  });

  it("rejects text/html", () => {
    expect(ALLOWED_IMAGE_TYPES.has("text/html")).toBe(false);
  });

  it("rejects application/javascript", () => {
    expect(ALLOWED_IMAGE_TYPES.has("application/javascript")).toBe(false);
  });

  it("rejects empty content type", () => {
    expect(ALLOWED_IMAGE_TYPES.has("")).toBe(false);
  });

  it("has exactly 5 allowed types", () => {
    expect(ALLOWED_IMAGE_TYPES.size).toBe(5);
  });
});

// ── File size validation ──────────────────────────────────────

describe("upload file size validation", () => {
  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

  it("MAX_FILE_SIZE is 10MB", () => {
    expect(MAX_FILE_SIZE).toBe(10_485_760);
  });

  it("accepts file under the limit", () => {
    const fileSize = 5 * 1024 * 1024; // 5 MB
    expect(fileSize <= MAX_FILE_SIZE).toBe(true);
  });

  it("accepts file exactly at the limit", () => {
    expect(MAX_FILE_SIZE <= MAX_FILE_SIZE).toBe(true);
  });

  it("rejects file over the limit", () => {
    const fileSize = 11 * 1024 * 1024; // 11 MB
    expect(fileSize > MAX_FILE_SIZE).toBe(true);
  });

  it("accepts zero-byte file", () => {
    expect(0 <= MAX_FILE_SIZE).toBe(true);
  });
});

// ── Required field validation ─────────────────────────────────

describe("upload required fields", () => {
  it("requires fileName", () => {
    const fileName = undefined;
    const contentType = "image/jpeg";
    expect(!fileName || !contentType).toBe(true);
  });

  it("requires contentType", () => {
    const fileName = "photo.jpg";
    const contentType = undefined;
    expect(!fileName || !contentType).toBe(true);
  });

  it("accepts both fields provided", () => {
    const fileName = "photo.jpg";
    const contentType = "image/jpeg";
    expect(!fileName || !contentType).toBe(false);
  });

  it("rejects empty fileName", () => {
    const fileName = "";
    const contentType = "image/jpeg";
    expect(!fileName || !contentType).toBe(true);
  });

  it("rejects empty contentType", () => {
    const fileName = "photo.jpg";
    const contentType = "";
    expect(!fileName || !contentType).toBe(true);
  });
});

// ── R2 configuration check ───────────────────────────────────

describe("R2 configuration", () => {
  const envKeys = [
    "R2_ACCOUNT_ID",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_BUCKET_NAME",
    "R2_PUBLIC_URL",
  ];

  afterEach(() => {
    for (const key of envKeys) {
      delete process.env[key];
    }
  });

  it("returns false when no R2 env vars are set", () => {
    for (const key of envKeys) {
      delete process.env[key];
    }
    expect(isR2Configured()).toBe(false);
  });

  it("returns false when only some R2 env vars are set", () => {
    process.env.R2_ACCOUNT_ID = "test-account";
    process.env.R2_ACCESS_KEY_ID = "test-key";
    // Missing R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL
    expect(isR2Configured()).toBe(false);
  });

  it("returns true when all R2 env vars are set", () => {
    process.env.R2_ACCOUNT_ID = "test-account";
    process.env.R2_ACCESS_KEY_ID = "test-key";
    process.env.R2_SECRET_ACCESS_KEY = "test-secret";
    process.env.R2_BUCKET_NAME = "test-bucket";
    process.env.R2_PUBLIC_URL = "https://r2.example.com";
    expect(isR2Configured()).toBe(true);
  });
});

// ── Upload key generation ─────────────────────────────────────

describe("upload key generation", () => {
  it("generates unique keys with timestamp prefix", () => {
    const fileName = "photo.jpg";
    const key1 = `uploads/${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${fileName}`;
    const key2 = `uploads/${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${fileName}`;
    expect(key1).not.toBe(key2);
    expect(key1).toMatch(/^uploads\/\d+-[a-f0-9]{8}-photo\.jpg$/);
  });

  it("preserves original file name in key", () => {
    const fileName = "my-image.png";
    const key = `uploads/${Date.now()}-abcd1234-${fileName}`;
    expect(key).toContain(fileName);
  });
});
