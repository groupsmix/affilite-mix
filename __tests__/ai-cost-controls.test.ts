/**
 * Risk-11: AI provider cost/control verification.
 *
 * Ensures all AI-invoking endpoints have:
 *   - Rate limiting with failPolicy: "closed" (cost control)
 *   - Auth gating (only authorized users can trigger AI calls)
 *   - Input validation (prevent prompt injection vectors)
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

function readFile(relPath: string): string {
  return fs.readFileSync(path.resolve(__dirname, "..", relPath), "utf-8");
}

function fileExists(relPath: string): boolean {
  return fs.existsSync(path.resolve(__dirname, "..", relPath));
}

describe("Risk-11: AI provider cost controls", () => {
  describe("gift-finder (public AI endpoint)", () => {
    it("has rate limiting with failPolicy closed", () => {
      const content = readFile("app/api/gift-finder/route.ts");
      expect(content).toContain("checkRateLimit");
      expect(content).toContain('failPolicy: "closed"');
    });

    it("validates budget input to prevent NaN bypass", () => {
      const content = readFile("app/api/gift-finder/route.ts");
      expect(content).toContain("isNaN");
    });
  });

  describe("admin AI content generation", () => {
    it("is auth-gated via withAuthz", () => {
      const content = readFile("app/api/admin/ai-content/route.ts");
      expect(content).toContain("withAuthz");
      // All handlers must be wrapped
      expect(content).toMatch(/export\s+const\s+GET\s*=\s*withAuthz/);
      expect(content).toMatch(/export\s+const\s+POST\s*=\s*withAuthz/);
    });

    it("validates content type input", () => {
      const content = readFile("app/api/admin/ai-content/route.ts");
      expect(content).toContain("VALID_CONTENT_TYPES");
    });
  });

  describe("AI cron job", () => {
    const cronPath = "app/api/cron/ai-generate/route.ts";

    it("ai-generate cron route exists", () => {
      expect(fileExists(cronPath)).toBe(true);
    });

    it("ai-generate cron is gated by cron auth", () => {
      if (!fileExists(cronPath)) return;
      const content = readFile(cronPath);
      expect(content).toMatch(/verifyCronAuth|CRON_SECRET|CRON_AI_SECRET/);
    });
  });

  describe("AI provider keys are not hardcoded", () => {
    it("no AI API keys in source code", () => {
      // Check that API keys are loaded from env, not hardcoded.
      // The provider config file is the single source of truth for keys.
      const providerFile = "lib/ai/providers.ts";
      expect(fileExists(providerFile)).toBe(true);
      const providerContent = readFile(providerFile);
      expect(providerContent).toMatch(/process\.env/);

      // No hardcoded API keys in any AI-related file
      const aiFiles = [
        "lib/ai/providers.ts",
        "lib/ai/content-generator.ts",
        "app/api/gift-finder/route.ts",
        "app/api/admin/ai-content/route.ts",
      ];

      for (const file of aiFiles) {
        if (!fileExists(file)) continue;
        const content = readFile(file);
        // Should not contain hardcoded API keys
        expect(content).not.toMatch(/sk-[a-zA-Z0-9]{20,}/);
        expect(content).not.toMatch(/AIza[a-zA-Z0-9]{30,}/);
      }
    });
  });
});
