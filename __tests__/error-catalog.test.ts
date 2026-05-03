/**
 * F-A91-01: Verify the error catalog covers all ApiErrorCode values
 * and provides translations for every supported language.
 */
import { describe, it, expect } from "vitest";
import type { ApiErrorCode } from "@/lib/api-error";
import { ERROR_CATALOG } from "@/lib/api-error";

/** All known error codes (must stay in sync with ApiErrorCode type). */
const ALL_CODES: ApiErrorCode[] = [
  "BAD_REQUEST",
  "INVALID_JSON",
  "VALIDATION_ERROR",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "CSRF_FAILED",
  "NOT_FOUND",
  "RATE_LIMITED",
  "CONFLICT",
  "PAYLOAD_TOO_LARGE",
  "SERVICE_UNAVAILABLE",
  "INTERNAL_ERROR",
  "CAPTCHA_FAILED",
  "TOTP_REQUIRED",
  "QUOTA_EXCEEDED",
];

const SUPPORTED_LANGUAGES = ["en", "ar"] as const;

describe("F-A91-01: Error catalog completeness", () => {
  it("has an entry for every ApiErrorCode", () => {
    for (const code of ALL_CODES) {
      expect(ERROR_CATALOG).toHaveProperty(code);
    }
  });

  it("every entry has all supported language translations", () => {
    for (const code of ALL_CODES) {
      const entry = ERROR_CATALOG[code];
      for (const lang of SUPPORTED_LANGUAGES) {
        expect(entry).toHaveProperty(lang);
        expect(typeof entry[lang]).toBe("string");
        expect(entry[lang].length).toBeGreaterThan(0);
      }
    }
  });

  it("no translation is a placeholder or empty string", () => {
    for (const code of ALL_CODES) {
      for (const lang of SUPPORTED_LANGUAGES) {
        const msg = ERROR_CATALOG[code][lang];
        expect(msg).not.toBe("");
        expect(msg).not.toMatch(/TODO/i);
        expect(msg).not.toMatch(/PLACEHOLDER/i);
      }
    }
  });
});
