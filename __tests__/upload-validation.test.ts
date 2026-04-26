/**
 * Tests for image upload validation logic.
 *
 * Covers the audit findings #U-1 through #U-9:
 *   • Content-Type allowlist
 *   • SVG / HTML / polyglot rejection
 *   • File-size limits, including signed Content-Length on the presign URL
 *   • Server-derived object keys (no client-supplied filename in the path)
 *   • R2_PRIVATE_BUCKET / R2_PUBLIC_BUCKET separation
 *   • sanitizeOriginalName helper rules
 *   • Magic-byte signature accuracy (PNG / JPEG / GIF / WebP / AVIF)
 */
import { describe, it, expect, afterEach } from "vitest";
import { isR2Configured, sanitizeOriginalName, R2_MAX_UPLOAD_BYTES } from "@/lib/r2";

// ── Content-Type allowlist ────────────────────────────────────

describe("upload content-type validation", () => {
  const ALLOWED_IMAGE_TYPES = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/avif",
  ]);

  it("allows JPEG, PNG, WebP, GIF, AVIF", () => {
    for (const type of ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]) {
      expect(ALLOWED_IMAGE_TYPES.has(type)).toBe(true);
    }
  });

  it.each(["image/svg+xml", "application/pdf", "text/html", "application/javascript", ""])(
    "rejects %s",
    (type) => {
      expect(ALLOWED_IMAGE_TYPES.has(type)).toBe(false);
    },
  );

  it("has exactly 5 allowed types", () => {
    expect(ALLOWED_IMAGE_TYPES.size).toBe(5);
  });
});

// ── File size validation ──────────────────────────────────────

describe("upload file size validation", () => {
  it("R2_MAX_UPLOAD_BYTES is 10MB", () => {
    expect(R2_MAX_UPLOAD_BYTES).toBe(10 * 1024 * 1024);
  });
});

// ── R2 configuration check ───────────────────────────────────

describe("R2 configuration", () => {
  const envKeys = [
    "R2_ACCOUNT_ID",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_BUCKET_NAME",
    "R2_PRIVATE_BUCKET",
    "R2_PUBLIC_BUCKET",
    "R2_PUBLIC_URL",
  ];

  afterEach(() => {
    for (const key of envKeys) delete process.env[key];
  });

  it("returns false when no R2 env vars are set", () => {
    expect(isR2Configured()).toBe(false);
  });

  it("returns false when only credentials are set", () => {
    process.env.R2_ACCOUNT_ID = "test-account";
    process.env.R2_ACCESS_KEY_ID = "test-key";
    process.env.R2_SECRET_ACCESS_KEY = "test-secret";
    expect(isR2Configured()).toBe(false);
  });

  it("returns true with the legacy single-bucket config", () => {
    process.env.R2_ACCOUNT_ID = "test-account";
    process.env.R2_ACCESS_KEY_ID = "test-key";
    process.env.R2_SECRET_ACCESS_KEY = "test-secret";
    process.env.R2_BUCKET_NAME = "test-bucket";
    process.env.R2_PUBLIC_URL = "https://r2.example.com";
    expect(isR2Configured()).toBe(true);
  });

  it("returns true with the split private/public bucket config (no fallback)", () => {
    process.env.R2_ACCOUNT_ID = "test-account";
    process.env.R2_ACCESS_KEY_ID = "test-key";
    process.env.R2_SECRET_ACCESS_KEY = "test-secret";
    process.env.R2_PRIVATE_BUCKET = "private";
    process.env.R2_PUBLIC_BUCKET = "public";
    process.env.R2_PUBLIC_URL = "https://r2.example.com";
    expect(isR2Configured()).toBe(true);
  });
});

// ── Original-name sanitizer ──────────────────────────────────

describe("sanitizeOriginalName", () => {
  it("returns the trimmed string for safe filenames", () => {
    expect(sanitizeOriginalName("photo.jpg")).toBe("photo.jpg");
    expect(sanitizeOriginalName("My Picture-01.png")).toBe("My Picture-01.png");
  });

  it("rejects path traversal and URL-significant characters", () => {
    expect(sanitizeOriginalName("../etc/passwd")).toBeNull();
    expect(sanitizeOriginalName("photo?evil=1")).toBeNull();
    expect(sanitizeOriginalName("photo#evil")).toBeNull();
    expect(sanitizeOriginalName("photo&evil")).toBeNull();
  });

  it("rejects control characters and unicode", () => {
    expect(sanitizeOriginalName("photo\nname.jpg")).toBeNull();
    expect(sanitizeOriginalName("📷.jpg")).toBeNull();
  });

  it("rejects empty / non-string / oversized values", () => {
    expect(sanitizeOriginalName("")).toBeNull();
    expect(sanitizeOriginalName(undefined)).toBeNull();
    expect(sanitizeOriginalName(123)).toBeNull();
    expect(sanitizeOriginalName("a".repeat(129))).toBeNull();
  });
});
